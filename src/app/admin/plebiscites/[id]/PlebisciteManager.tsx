'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfFetch } from '@/lib/csrf-client';
import { parseElectionCloseDate } from '@/lib/election-window';
import { createElectionKeys, decryptAndShuffleBallots } from '@/lib/browser-ballot-crypto';
import {
  canonicalStringify,
  EncryptedBallotPackage,
  EncryptedElectionManifest,
  hashManifest,
  sha256Base64Url
} from '@/lib/encrypted-ballots';

interface Plebiscite {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
  open_date: string;
  opening_mode?: 'immediate' | 'scheduled';
  scheduled_open_error?: string | null;
  privacy_mode: 'legacy' | 'encrypted';
  manifest_hash?: string;
  recovery_confirmed_at?: string;
  close_state?: 'none' | 'closing' | 'failed';
  archived_at?: string | null;
  results_visibility?: 'eligible' | 'public';
}

interface StatusInfo {
  status: string;
  color: string;
  canOpen: boolean;
  canClose: boolean;
  message: string;
}

export default function PlebisciteManager({ 
  plebiscite, 
  statusInfo,
  canManage = true,
  isOwner = false,
  encryptedManifest
}: { 
  plebiscite: Plebiscite; 
  statusInfo: StatusInfo;
  canManage?: boolean;
  isOwner?: boolean;
  encryptedManifest: EncryptedElectionManifest | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [encryptionPrepared, setEncryptionPrepared] = useState(Boolean(plebiscite.manifest_hash));
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(Boolean(plebiscite.recovery_confirmed_at));
  const recoveryFileRef = useRef<HTMLInputElement>(null);

  function downloadJson(filename: string, value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handlePrepareEncryption() {
    if (!encryptedManifest) return;
    if (!confirm('Create a new encrypted ballot box and download its recovery kit? Any earlier kit for this draft will stop working.')) return;
    setLoading(true);
    setError('');
    try {
      const manifestHash = await hashManifest(encryptedManifest);
      const keys = await createElectionKeys(manifestHash, plebiscite.id);
      const response = await csrfFetch('/api/admin/encrypted-election', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: plebiscite.id, action: 'prepare', manifestHash,
          publicKeyJwk: keys.publicKeyJwk,
          encryptedPrivateKey: keys.encryptedPrivateKey,
          keyIv: keys.keyIv
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not prepare encrypted ballot box');
      downloadJson(`${plebiscite.slug}-votekit-recovery.json`, {
        type: 'votekit-encrypted-election-recovery',
        version: 1,
        electionId: plebiscite.id,
        electionSlug: plebiscite.slug,
        manifestHash,
        closeSecret: keys.closeSecret,
        encryptedPrivateKey: keys.encryptedPrivateKey,
        keyIv: keys.keyIv,
        warning: 'Keep offline. VoteKit cannot close this election without the closeSecret.'
      });
      setEncryptionPrepared(true);
      setRecoveryConfirmed(false);
    } catch (err: any) {
      setError(err.message || 'Could not prepare encryption');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmRecovery() {
    if (!confirm('Confirm that the recovery-kit file was downloaded, opened successfully, and stored safely offline?')) return;
    setLoading(true);
    setError('');
    try {
      const response = await csrfFetch('/api/admin/encrypted-election', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action: 'confirm-recovery' })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not confirm recovery kit');
      setRecoveryConfirmed(true);
    } catch (err: any) {
      setError(err.message || 'Could not confirm recovery kit');
    } finally {
      setLoading(false);
    }
  }

  async function handleEncryptedClose() {
    const file = recoveryFileRef.current?.files?.[0];
    if (!file) {
      setError('Choose this election’s offline recovery-kit file first');
      return;
    }
    if (!confirm('Permanently stop voting, decrypt the complete ballot box in this browser, shuffle it, and publish only the shuffled ballots?')) return;
    setLoading(true);
    setError('');
    try {
      const recovery = JSON.parse(await file.text());
      if (recovery.type !== 'votekit-encrypted-election-recovery' || recovery.electionId !== plebiscite.id ||
        typeof recovery.closeSecret !== 'string') throw new Error('This recovery kit does not belong to this election');
      const startResponse = await csrfFetch('/api/admin/encrypted-election', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action: 'start-close' })
      });
      const closing = await startResponse.json();
      if (!startResponse.ok) throw new Error(closing.error || 'Could not freeze the encrypted ballot box');
      if (recovery.manifestHash !== closing.manifestHash) throw new Error('Recovery kit manifest does not match this election');
      const commitments = await Promise.all((closing.packages as EncryptedBallotPackage[])
        .map(value => sha256Base64Url(canonicalStringify(value))));
      commitments.sort();
      const inputHash = await sha256Base64Url(canonicalStringify(commitments));
      if (inputHash !== closing.inputHash) throw new Error('Frozen ballot manifest verification failed');
      const ballots = await decryptAndShuffleBallots({
        manifest: closing.manifest,
        manifestHash: closing.manifestHash,
        encryptedPrivateKey: closing.encryptedPrivateKey,
        keyIv: closing.keyIv,
        closeSecret: recovery.closeSecret,
        packages: closing.packages
      });
      const completeResponse = await csrfFetch('/api/admin/encrypted-election', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action: 'complete-close', inputHash, ballots })
      });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error || 'Could not publish shuffled ballot box');
      if (recoveryFileRef.current) recoveryFileRef.current.value = '';
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Encrypted close failed safely. No plaintext ballots were published.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: string) {
    const openingEarly = action === 'open' && plebiscite.opening_mode === 'scheduled' && parseElectionCloseDate(plebiscite.open_date) > new Date();
    const message = openingEarly
      ? 'The scheduled open date has not been reached yet. Open voting early? The scheduled dates will not be changed.'
      : `Are you sure you want to ${action} this election?`;
    if (!confirm(message)) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await csrfFetch('/api/admin/plebiscites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (prompt(`Permanently delete "${plebiscite.title}"? This cannot be undone. Type DELETE to confirm.`) !== 'DELETE') return;
    
    setLoading(true);
    try {
      const res = await csrfFetch(`/api/admin/plebiscites?id=${plebiscite.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(action: 'archive' | 'restore') {
    const message = action === 'archive'
      ? 'Archive this election? It will be hidden from all Returning Officers, Admins and Observers until restored.'
      : 'Restore this election to the normal dashboard?';
    if (!confirm(message)) return;
    setLoading(true);
    setError('');
    try {
      const res = await csrfFetch('/api/admin/plebiscites', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === 'archive') router.push('/admin');
      else router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResultsVisibility(visibility: 'eligible' | 'public') {
    const message = visibility === 'public'
      ? 'Publish these results to anyone with the link? The results page, PDF and CSV will become public.'
      : 'Restrict these results to eligible electors and assigned election officials?';
    if (!confirm(message)) return;
    setLoading(true);
    setError('');
    try {
      const response = await csrfFetch('/api/admin/plebiscites', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plebiscite.id, action: 'set_results_visibility', visibility })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not change results visibility');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change results visibility');
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/vote/${plebiscite.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!canManage && (
        <p className="text-sm text-gray-500 text-center">
          Observer access is read-only.
        </p>
      )}

      {isOwner && !plebiscite.archived_at && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold text-gray-900">Results visibility</div>
          <p className="mt-1 text-sm text-gray-600">
            {plebiscite.results_visibility === 'public'
              ? 'Public: anyone with the results link can view and download them.'
              : 'Private: only eligible electors and assigned election officials can view or download them.'}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleResultsVisibility(plebiscite.results_visibility === 'public' ? 'eligible' : 'public')}
            className="btn-secondary mt-3 w-full"
          >
            {plebiscite.results_visibility === 'public' ? 'Make Results Private' : 'Publish Results Publicly'}
          </button>
        </div>
      )}

      {isOwner && plebiscite.archived_at && (
        <button onClick={() => handleArchive('restore')} disabled={loading} className="btn-primary w-full">
          {loading ? 'Restoring...' : 'Restore Election'}
        </button>
      )}

      {!plebiscite.archived_at && canManage && statusInfo.canOpen && plebiscite.privacy_mode === 'encrypted' && (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-900">
            This election encrypts complete ballots in each voter’s browser. Prepare and safely store the offline recovery kit before opening.
          </p>
          <button onClick={handlePrepareEncryption} disabled={loading} className="btn-secondary w-full">
            {encryptionPrepared ? 'Replace and Download Recovery Kit' : 'Prepare Encrypted Ballot Box'}
          </button>
          {encryptionPrepared && !recoveryConfirmed && (
            <button onClick={handleConfirmRecovery} disabled={loading} className="btn-primary w-full">
              I Have Safely Stored the Recovery Kit
            </button>
          )}
          {recoveryConfirmed && <p className="text-sm font-medium text-green-700">Recovery kit confirmed. The election can now open.</p>}
        </div>
      )}

      {!plebiscite.archived_at && canManage && statusInfo.canOpen && (plebiscite.privacy_mode === 'legacy' || recoveryConfirmed) && (
        <button
          onClick={() => handleAction('open')}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Opening...' : 'Open Voting Now'}
        </button>
      )}

      {!plebiscite.archived_at && canManage && statusInfo.canClose && (
        <>
          <button
            onClick={copyUrl}
            className="btn-secondary w-full"
          >
            {copied ? 'Copied!' : 'Copy Voting URL'}
          </button>
          {plebiscite.privacy_mode === 'encrypted' ? (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <label className="block text-sm font-medium text-gray-800" htmlFor="recovery-kit">
                Offline recovery kit
              </label>
              <input ref={recoveryFileRef} id="recovery-kit" type="file" accept="application/json,.json" className="block w-full text-sm" />
              <button
                onClick={handleEncryptedClose}
                disabled={loading}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Decrypting and Shuffling...' : 'Close, Shuffle and Publish'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleAction('close')}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Closing...' : 'Close Voting'}
            </button>
          )}
        </>
      )}

      {isOwner && !plebiscite.archived_at && plebiscite.status !== 'open' && (
        <button
          onClick={() => handleArchive('archive')}
          disabled={loading}
          className="btn-secondary w-full"
        >
          {loading ? 'Archiving...' : 'Archive Election'}
        </button>
      )}

      {isOwner && plebiscite.status === 'draft' && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Delete Election'}
        </button>
      )}

      {plebiscite.status === 'closed' && (
        <p className="text-sm text-gray-500 text-center">
          This election is closed. Results are now available.
        </p>
      )}
    </div>
  );
}
