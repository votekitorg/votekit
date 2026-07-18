import { getApp, getApps, initializeApp } from 'firebase/app';
import { ConfirmationResult, getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

let verifier: RecaptchaVerifier | null = null;
let confirmation: ConfirmationResult | null = null;

function auth() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  };
  if (!config.apiKey || !config.authDomain || !config.projectId) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export function smsAvailable(): boolean {
  return Boolean(auth());
}

export async function sendSmsCode(phone: string, buttonId: string): Promise<void> {
  const instance = auth();
  if (!instance) throw new Error('SMS verification is not configured');
  verifier?.clear();
  verifier = new RecaptchaVerifier(instance, buttonId, { size: 'invisible' });
  confirmation = await signInWithPhoneNumber(instance, phone, verifier);
}

export async function confirmSmsCode(code: string): Promise<string> {
  if (!confirmation) throw new Error('Request a text message first');
  const credential = await confirmation.confirm(code);
  confirmation = null;
  verifier?.clear(); verifier = null;
  return credential.user.getIdToken();
}
