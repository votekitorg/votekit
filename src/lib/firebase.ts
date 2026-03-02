import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult,
  Auth
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  
  if (!app && getApps().length === 0) {
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
      console.warn('Firebase config not set. SMS verification will not work.');
      return null;
    }
    app = initializeApp(firebaseConfig);
  } else if (!app) {
    app = getApps()[0];
  }
  
  return app;
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === 'undefined') return null;
  
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  
  if (!auth) {
    auth = getAuth(firebaseApp);
  }
  
  return auth;
}

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

export function setupRecaptcha(buttonId: string): RecaptchaVerifier | null {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;
  
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      // Ignore clear errors
    }
  }
  
  recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, buttonId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
      }
    }
  });
  
  return recaptchaVerifier;
}

export async function sendSMSVerification(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    return { success: false, error: 'Firebase not configured' };
  }
  
  if (!recaptchaVerifier) {
    return { success: false, error: 'reCAPTCHA not initialized' };
  }
  
  try {
    confirmationResult = await signInWithPhoneNumber(firebaseAuth, phoneNumber, recaptchaVerifier);
    return { success: true };
  } catch (error: any) {
    console.error('SMS verification error:', error);
    
    if (error.code === 'auth/invalid-phone-number') {
      return { success: false, error: 'Invalid phone number format' };
    } else if (error.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many requests. Please try again later.' };
    } else if (error.code === 'auth/captcha-check-failed') {
      return { success: false, error: 'reCAPTCHA verification failed. Please refresh and try again.' };
    }
    
    return { success: false, error: error.message || 'Failed to send SMS' };
  }
}

export async function verifySMSCode(code: string): Promise<{ success: boolean; idToken?: string; error?: string }> {
  if (!confirmationResult) {
    return { success: false, error: 'No verification in progress' };
  }
  
  try {
    const result = await confirmationResult.confirm(code);
    const idToken = await result.user.getIdToken();
    
    confirmationResult = null;
    
    return { success: true, idToken };
  } catch (error: any) {
    console.error('SMS code verification error:', error);
    
    if (error.code === 'auth/invalid-verification-code') {
      return { success: false, error: 'Invalid verification code' };
    } else if (error.code === 'auth/code-expired') {
      return { success: false, error: 'Verification code expired. Please request a new one.' };
    }
    
    return { success: false, error: error.message || 'Failed to verify code' };
  }
}

export function clearRecaptcha(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      // Ignore
    }
    recaptchaVerifier = null;
  }
  confirmationResult = null;
}
