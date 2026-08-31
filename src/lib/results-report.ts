import PDFDocument from 'pdfkit';
import { parseElectionCloseDate } from '@/lib/election-window';
import type { PlebisciteResultsData } from '@/lib/results';
import { resultsReportFingerprint } from '@/lib/results-integrity';
import { formatIRVTransferSummary } from '@/lib/irv';

const COLOURS = {
  green: '#08783E',
  greenDark: '#0E4D2A',
  greenLight: '#E9F7EF',
  ink: '#16211B',
  muted: '#5F6B64',
  line: '#DCE4DF',
  paper: '#F5F8F6',
  amber: '#9A6700',
  amberLight: '#FFF7DD',
  red: '#A53636',
  white: '#FFFFFF'
};

export function resultsReportFilename(slug: string): string {
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'election';
  return `${safeSlug}-official-results.pdf`;
}

function electionDate(value: string): string {
  return parseElectionCloseDate(value).toLocaleString('en-AU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Australia/Brisbane'
  });
}

function generatedDate(now: Date): string {
  return now.toLocaleString('en-AU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Australia/Brisbane'
  });
}

function percentage(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0.0%';
}

function methodLabel(type: string): string {
  if (type === 'yes_no') return 'Yes / No';
  if (type === 'multiple_choice') return 'Multiple choice';
  if (type === 'ranked_choice') return 'Ranked choice · Instant-runoff voting';
  if (type === 'condorcet') return 'Condorcet · Schulze method';
  return type;
}

function simpleOutcome(question: PlebisciteResultsData['questions'][number]): string {
  const entries = Object.entries(question.results as Record<string, number>).sort((a, b) => b[1] - a[1]);
  if (!entries.length || question.totalVotes === 0) return 'No ballots were recorded for this question.';
  const leaders = entries.filter(([, count]) => count === entries[0][1]);
  if (leaders.length > 1) {
    const unit = question.type === 'yes_no' ? 'vote' : 'selection';
    return `Tied result: ${leaders.map(([name]) => name).join(', ')} each received ${leaders[0][1]} ${unit}${leaders[0][1] === 1 ? '' : 's'}.`;
  }
  return `${entries[0][0]} received the highest count with ${entries[0][1]} (${percentage(entries[0][1], question.type === 'multiple_choice' ? entries.reduce((sum, [, count]) => sum + count, 0) : question.totalVotes)}).`;
}

function questionOutcome(question: PlebisciteResultsData['questions'][number]): string {
  if (question.type === 'ranked_choice') {
    if (question.results.winner) {
      const decisiveRound = question.results.decisiveRound || question.results.rounds?.find((round: any) => round.winner)?.round || question.results.rounds?.length || 0;
      const reporting = question.results.continuedForReporting
        ? question.results.pendingTie
          ? ' The supplementary distribution is paused for an audited tie decision.'
          : ' A final-two distribution followed for reporting only.'
        : '';
      return `${question.results.winner} won in counting round ${decisiveRound}.${reporting}`;
    }
    if (question.results.pendingTie) return `Count paused: tie-break required between ${question.results.pendingTie.tiedCandidates.join(', ')}.`;
    const tied = question.results.rounds?.find((round: any) => round.tiedCandidates?.length)?.tiedCandidates;
    return tied?.length ? `Tied result: ${tied.join(', ')}.` : 'No winner was determined.';
  }
  if (question.type === 'condorcet') {
    if (question.results.winner) return `${question.results.winner} is the ${question.results.condorcetWinner ? 'Condorcet winner' : 'Schulze-method winner'}.`;
    return question.results.tiedCandidates?.length ? `Tied result: ${question.results.tiedCandidates.join(', ')}.` : 'No winner was determined.';
  }
  return simpleOutcome(question);
}

export async function buildResultsPdf(data: PlebisciteResultsData, now: Date = new Date()): Promise<Buffer> {
  const fingerprint = resultsReportFingerprint(data);
  const reportId = `VK-${fingerprint.slice(0, 16).toUpperCase()}`;
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, right: 48, bottom: 62, left: 48 },
    bufferPages: true,
    info: {
      Title: `${data.plebiscite.title} · Official results`,
      Author: 'VoteKit',
      Subject: 'Election results and verification report',
      Keywords: 'VoteKit,election,results,verification'
    }
  });
  doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensureSpace = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };
  const rule = (colour = COLOURS.line) => {
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(colour).lineWidth(1).stroke();
    doc.x = doc.page.margins.left;
    doc.moveDown(0.7);
  };
  const heading = (text: string, level: 1 | 2 = 1) => {
    ensureSpace(level === 1 ? 52 : 36);
    doc.x = doc.page.margins.left;
    doc.fillColor(level === 1 ? COLOURS.greenDark : COLOURS.ink).font('Helvetica-Bold').fontSize(level === 1 ? 18 : 12).text(text);
    doc.moveDown(level === 1 ? 0.55 : 0.35);
  };
  const body = (text: string, options: PDFKit.Mixins.TextOptions = {}) => {
    doc.x = doc.page.margins.left;
    doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(9.2).text(text, { lineGap: 2, ...options });
  };
  const pill = (text: string, x: number, y: number, width: number, fill = COLOURS.greenLight, colour = COLOURS.greenDark) => {
    doc.roundedRect(x, y, width, 22, 6).fill(fill);
    doc.fillColor(colour).font('Helvetica-Bold').fontSize(8).text(text, x + 8, y + 7, { width: width - 16, align: 'center', lineBreak: false });
  };
  const stat = (label: string, value: string, x: number, y: number, width: number) => {
    doc.roundedRect(x, y, width, 66, 8).fillAndStroke(COLOURS.paper, COLOURS.line);
    doc.fillColor(COLOURS.greenDark).font('Helvetica-Bold').fontSize(19).text(value, x + 10, y + 13, { width: width - 20, align: 'center' });
    doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(8).text(label, x + 8, y + 42, { width: width - 16, align: 'center' });
  };
  const labelledValue = (label: string, value: string) => {
    ensureSpace(28);
    doc.x = doc.page.margins.left;
    doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(8).text(label.toUpperCase(), { characterSpacing: 0.6 });
    doc.fillColor(COLOURS.ink).font('Helvetica').fontSize(10).text(value, { lineGap: 1 });
    doc.moveDown(0.65);
  };
  const bar = (label: string, value: number, total: number, max: number, index: number) => {
    ensureSpace(36);
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.fillColor(COLOURS.ink).font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(label, x, y, { width: contentWidth - 110, ellipsis: true });
    doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(8.5).text(`${value.toLocaleString()} · ${percentage(value, total)}`, x + contentWidth - 110, y, { width: 110, align: 'right' });
    const barY = y + 16;
    doc.roundedRect(x, barY, contentWidth, 8, 4).fill(COLOURS.paper);
    const width = max > 0 ? (value / max) * contentWidth : 0;
    if (width > 0) doc.roundedRect(x, barY, Math.max(width, 4), 8, 4).fill(index === 0 ? COLOURS.green : '#72AE8C');
    doc.y = barY + 17;
  };

  // Cover / certificate
  doc.rect(0, 0, doc.page.width, 138).fill(COLOURS.greenDark);
  doc.fillColor(COLOURS.white).font('Helvetica-Bold').fontSize(11).text('VOTEKIT', 48, 42, { characterSpacing: 2 });
  doc.fillColor('#BFE4CE').font('Helvetica').fontSize(8.5).text('OFFICIAL ELECTION RESULT', 48, 64, { characterSpacing: 1.2 });
  pill('CLOSED · RESULTS PUBLISHED', doc.page.width - 224, 44, 176, COLOURS.white, COLOURS.greenDark);
  doc.x = doc.page.margins.left;
  doc.y = 170;
  doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(27).text(data.plebiscite.title, { lineGap: 3 });
  if (data.plebiscite.description) {
    doc.moveDown(0.55);
    body(data.plebiscite.description, { width: contentWidth });
  }
  doc.moveDown(1.2);
  rule(COLOURS.green);
  labelledValue('Voting period', `${electionDate(data.plebiscite.open_date)} to ${electionDate(data.plebiscite.close_date)} AEST`);
  labelledValue('Report identity', `${reportId} · Generated ${generatedDate(now)} AEST`);

  const statGap = 10;
  const statWidth = (contentWidth - statGap * 3) / 4;
  const statY = doc.y + 4;
  stat('Ballots cast', data.participation.totalVotes.toLocaleString(), 48, statY, statWidth);
  stat('Eligible credentials', data.participation.eligibleCredentials.toLocaleString(), 48 + statWidth + statGap, statY, statWidth);
  stat('Participation', data.participation.participationRate === null ? '—' : `${data.participation.participationRate.toFixed(1)}%`, 48 + (statWidth + statGap) * 2, statY, statWidth);
  stat('Questions', data.questions.length.toLocaleString(), 48 + (statWidth + statGap) * 3, statY, statWidth);
  doc.y = statY + 88;
  heading('Result at a glance');
  data.questions.forEach((question, index) => {
    ensureSpace(42);
    doc.fillColor(COLOURS.green).font('Helvetica-Bold').fontSize(9).text(`${index + 1}`.padStart(2, '0'), 48, doc.y, { width: 28 });
    const y = doc.y;
    doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(10.5).text(question.title, 80, y, { width: contentWidth - 32 });
    doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(9).text(questionOutcome(question), 80, doc.y + 2, { width: contentWidth - 32, lineGap: 1 });
    doc.moveDown(0.6);
  });

  // Detail pages
  data.questions.forEach((question, index) => {
    doc.addPage();
    pill(`QUESTION ${index + 1} OF ${data.questions.length}`, 48, 48, 118);
    doc.x = doc.page.margins.left;
    doc.y = 86;
    doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(21).text(question.title);
    if (question.description) {
      doc.moveDown(0.35);
      body(question.description);
    }
    doc.moveDown(0.7);
    doc.fillColor(COLOURS.green).font('Helvetica-Bold').fontSize(9).text(methodLabel(question.type).toUpperCase(), { characterSpacing: 0.4 });
    doc.moveDown(0.35);
    doc.roundedRect(48, doc.y, contentWidth, 48, 8).fill(questionOutcome(question).startsWith('Tied') ? COLOURS.amberLight : COLOURS.greenLight);
    doc.fillColor(questionOutcome(question).startsWith('Tied') ? COLOURS.amber : COLOURS.greenDark).font('Helvetica-Bold').fontSize(11).text(questionOutcome(question), 62, doc.y + 15, { width: contentWidth - 28, align: 'center' });
    doc.y += 66;

    if (question.type === 'yes_no' || question.type === 'multiple_choice') {
      heading('Count', 2);
      const entries = Object.entries(question.results as Record<string, number>).sort((a, b) => b[1] - a[1]);
      const total = question.type === 'multiple_choice' ? entries.reduce((sum, [, count]) => sum + count, 0) : question.totalVotes;
      const max = Math.max(0, ...entries.map(([, count]) => count));
      entries.forEach(([label, value], entryIndex) => bar(label, value, total, max, entryIndex));
      doc.moveDown(0.5);
      body(question.type === 'multiple_choice'
        ? `${question.totalVotes.toLocaleString()} ballots produced ${total.toLocaleString()} selections. Percentages use total selections.`
        : `${question.totalVotes.toLocaleString()} ballots were counted for this question.`);
    } else if (question.type === 'ranked_choice') {
      const rounds = question.results.rounds || [];
      heading('Counting rounds', 2);
      if (question.results.continuedForReporting) {
        body(`The official winner was declared in round ${question.results.decisiveRound}. Rounds labelled supplementary distribute preferences to a final-two tally for reporting only and do not change the result.`);
        doc.moveDown(0.6);
      }
      rounds.forEach((round: any) => {
        const entries = Object.entries(round.votes as Record<string, number>).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((sum, [, count]) => sum + count, 0);
        const rowHeight = 48 + entries.length * 14 + (round.transfer ? 14 : 0);
        ensureSpace(Math.min(rowHeight, 180));
        doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(10).text(`Round ${round.round}${round.supplementary ? ' · Supplementary distribution' : ''}`);
        const notes = [
          round.eliminated?.length ? `Eliminated: ${round.eliminated.join(', ')}` : '',
          round.tiedCandidates?.length ? `Tie: ${round.tiedCandidates.join(', ')}` : '',
          round.winner ? `Winner: ${round.winner}` : ''
        ].filter(Boolean).join(' · ');
        if (notes) doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(8).text(notes);
        if (round.tieBreak) {
          const decision = round.tieBreak.method === 'countback'
            ? `${round.tieBreak.selectedCandidate} selected by countback to round ${round.tieBreak.sourceRound}`
            : `${round.tieBreak.selectedCandidate} ${round.tieBreak.type === 'winner' ? 'declared winner' : 'selected for exclusion'} by ${round.tieBreak.method === 'drawing_lots' ? 'supervised drawing of lots' : 'the governing rules'}`;
          doc.fillColor(COLOURS.greenDark).font('Helvetica-Bold').fontSize(8).text(`Tie-break: ${decision}${round.tieBreak.note ? ` · ${round.tieBreak.note}` : ''}`);
        }
        if (round.transfer) {
          doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(8)
            .text(`Preference transfers: ${formatIRVTransferSummary(round.transfer)}`);
        }
        entries.forEach(([candidate, count]) => {
          ensureSpace(15);
          doc.fillColor(COLOURS.ink).font(round.winner === candidate ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).text(candidate, 58, doc.y, { width: contentWidth - 150, ellipsis: true });
          doc.fillColor(COLOURS.muted).font('Helvetica').text(`${count} · ${percentage(count, total)}`, 48 + contentWidth - 100, doc.y - 9.5, { width: 100, align: 'right' });
        });
        doc.moveDown(0.65);
        rule();
      });
      ensureSpace(40);
      body(`Total ballots: ${question.results.totalVotes ?? question.totalVotes}. Exhausted ballots: ${question.results.exhaustedBallots ?? 0}. A candidate wins after receiving a majority of active ballots; otherwise one lowest candidate is eliminated and preferences transfer. Tied exclusions use countback, then an audited election-rule decision if countback cannot separate them.`);
    } else if (question.type === 'condorcet') {
      heading('Overall ranking', 2);
      const rankings = question.results.rankings || [];
      rankings.forEach((ranking: any, rank: number) => {
        ensureSpace(22);
        doc.fillColor(rank === 0 ? COLOURS.greenDark : COLOURS.ink).font(rank === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
          .text(`${rank + 1}. ${ranking.candidate}`, 48, doc.y, { width: contentWidth - 180, ellipsis: true });
        doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(8.5)
          .text(`${ranking.wins} wins · ${ranking.losses} losses · ${ranking.ties} ties`, 48 + contentWidth - 180, doc.y - 11, { width: 180, align: 'right' });
      });
      doc.moveDown(0.7);
      heading('Head-to-head matrix', 2);
      const options = question.options;
      if (options.length <= 8) {
        const labelWidth = 112;
        const cellWidth = (contentWidth - labelWidth) / Math.max(options.length, 1);
        let y = doc.y;
        doc.fillColor(COLOURS.muted).font('Helvetica-Bold').fontSize(6.5);
        options.forEach((option, col) => doc.text(option.slice(0, 12), 48 + labelWidth + col * cellWidth, y, { width: cellWidth - 2, align: 'center', ellipsis: true }));
        y += 23;
        options.forEach((rowOption, row) => {
          ensureSpace(20);
          doc.fillColor(COLOURS.ink).font('Helvetica').fontSize(7).text(rowOption, 48, y + row * 19, { width: labelWidth - 5, ellipsis: true });
          options.forEach((colOption, col) => {
            const value = rowOption === colOption ? '—' : String(question.results.pairwiseMatrix?.[rowOption]?.[colOption] ?? 0);
            const x = 48 + labelWidth + col * cellWidth;
            doc.rect(x, y + row * 19 - 4, cellWidth - 2, 16).fill(rowOption === colOption ? COLOURS.paper : COLOURS.greenLight);
            doc.fillColor(COLOURS.ink).font('Helvetica').fontSize(7.5).text(value, x, y + row * 19, { width: cellWidth - 2, align: 'center' });
          });
        });
        doc.y = y + options.length * 19 + 10;
      } else {
        body('The complete pairwise matrix is available in the online result and CSV export. The PDF ranking is kept readable for this large option set.');
      }
      doc.moveDown(0.6);
      body('Each matrix cell counts ballots preferring the row option over the column option. A Condorcet winner beats every other option head to head; the Schulze strongest-path method resolves cycles when no such option exists.');
    }

    ensureSpace(55);
    doc.moveDown(1);
    rule();
    body(`${question.totalVotes.toLocaleString()} ballot${question.totalVotes === 1 ? '' : 's'} counted · ${question.publicBallots.length.toLocaleString()} anonymous ballot record${question.publicBallots.length === 1 ? '' : 's'} publicly available under VoteKit’s privacy threshold rules.`);
  });

  if (data.countRuns.length > 0) {
    doc.addPage();
    heading('Supplementary and alternative count runs');
    body('These immutable audited counts use the same frozen anonymous ballots. They do not replace the declared results in the preceding section.');
    data.countRuns.forEach(run => {
      ensureSpace(130);
      heading(`Count run #${run.id}: ${run.questionTitle}`, 2);
      labelledValue('Method', run.settings.continueAfterMajority ? 'IRV full preference distribution' : run.method.toUpperCase());
      if (run.settings.continueAfterMajority) {
        body(`The official winner was declared in round ${run.result.decisiveRound}. Later rounds are a reporting-only final-two preference distribution and do not replace the declared result.`);
        doc.moveDown(0.5);
      }
      labelledValue('Status', run.status === 'pending_tie' ? 'Paused for audited tie decision' : 'Complete');
      labelledValue('Created', run.createdAt);
      labelledValue('Created by', run.createdByName || 'Election official');
      labelledValue('Algorithm', run.settings.algorithm);
      labelledValue('Outcome', run.result.winner || (run.result.pendingTie ? 'Pending tie decision' : 'Tie reported'));
      labelledValue('Source ballot fingerprint', run.sourceBallotHash);
      labelledValue('Result fingerprint', run.resultHash);
      if (run.method === 'irv') {
        heading('Count details', 2);
        (run.result.rounds || []).forEach((round: any) => {
          ensureSpace(35);
          const counts = Object.entries(round.votes as Record<string, number>)
            .sort(([, countA], [, countB]) => countB - countA)
            .map(([candidate, count]) => `${candidate}: ${count}`)
            .join(' · ');
          doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(9)
            .text(`Round ${round.round}${round.supplementary ? ' · Supplementary distribution' : ''}`);
          body(counts);
          if (round.transfer) body(`Preference transfers: ${formatIRVTransferSummary(round.transfer)}`);
          if (round.tiedCandidates?.length) body(`Paused tie: ${round.tiedCandidates.join(', ')}`);
          doc.moveDown(0.4);
        });
      }
      doc.moveDown(0.8);
    });
  }

  // Verification page
  doc.addPage();
  heading('Verification and trust');
  body('This report is generated from the same published result data used by VoteKit’s online result and CSV export. Counts are calculated from anonymous ballot records after the election is closed. Voter identity is not included in this report or connected to published ballots.');
  doc.moveDown(1);
  heading('Report fingerprint', 2);
  body('A SHA-256 fingerprint identifies this exact published result dataset. If any included count, ballot, question or audit value changes, the fingerprint changes.');
  doc.moveDown(0.5);
  doc.roundedRect(48, doc.y, contentWidth, 52, 7).fill(COLOURS.paper);
  doc.fillColor(COLOURS.greenDark).font('Courier-Bold').fontSize(8.5).text(fingerprint, 62, doc.y + 17, { width: contentWidth - 28, align: 'center', characterSpacing: 0.25 });
  doc.y += 70;
  labelledValue('Report ID', reportId);
  labelledValue('Election reference', `${data.plebiscite.slug} · Internal election ${data.plebiscite.id}`);
  labelledValue('Access model', data.plebiscite.accessMode === 'anonymous_codes' ? 'Anonymous single-use codes and links' : 'Managed voter roll');
  labelledValue('Ballot privacy', data.plebiscite.privacyMode === 'encrypted' ? 'Browser-encrypted ballots, decrypted and shuffled at close' : 'Anonymous ballots separated from participation records');

  if (data.encryptedAudit) {
    heading('Encrypted ballot audit', 2);
    labelledValue('Protocol', data.encryptedAudit.manifest.protocol);
    labelledValue('Manifest hash', data.encryptedAudit.manifestHash);
    labelledValue('Frozen input hash', data.encryptedAudit.inputHash);
    labelledValue('Published output hash', data.encryptedAudit.outputHash);
  }

  heading('How voters verify inclusion', 2);
  body('Each voter receives a private receipt code after submitting. On the online results page, a voter can use that code to retrieve the matching recorded ballot and confirm its choices. This private lookup remains available even when the public anonymous ballot list is suppressed by the election’s privacy threshold.');
  doc.moveDown(0.8);
  heading('Interpretation notes', 2);
  body('Percentages are rounded to one decimal place. Multiple-choice percentages use total selections and may sum to more than 100% of ballots when voters can choose multiple options. A reported tie must be resolved under the election’s governing rules; VoteKit does not silently apply an alphabetical or arbitrary tie-break.');

  // Page footers after content is complete.
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 38;
    doc.moveTo(48, footerY - 8).lineTo(doc.page.width - 48, footerY - 8).strokeColor(COLOURS.line).lineWidth(0.7).stroke();
    doc.fillColor(COLOURS.muted).font('Helvetica').fontSize(7.5).text(`VoteKit · ${reportId}`, 48, footerY, { width: contentWidth / 2, lineBreak: false });
    doc.text(`Page ${pageIndex + 1} of ${range.count}`, 48 + contentWidth / 2, footerY, { width: contentWidth / 2, align: 'right', lineBreak: false });
    doc.page.margins.bottom = originalBottomMargin;
  }

  doc.end();
  return finished;
}
