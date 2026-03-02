import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let app: App | null = null;
let auth: Auth | null = null;

function getAdminApp(): App | null {
  if (typeof window !== 'undefined') return null;
  
  if (getApps().length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccountKey) {
      console.warn('FIREBASE_SERVICE_ACCOUNT_KEY not set. SMS verification will not work.');
      return null;
    }
    
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      app = initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
      return null;
    }
  } else {
    app = getApps()[0];
  }
  
  return app;
}

function getAdminAuth(): Auth | null {
  const adminApp = getAdminApp();
  if (!adminApp) return null;
  
  if (!auth) {
    auth = getAuth(adminApp);
  }
  
  return auth;
}

export interface VerifyTokenResult {
  success: boolean;
  phoneNumber?: string;
  uid?: string;
  error?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifyTokenResult> {
  const adminAuth = getAdminAuth();
  
  if (!adminAuth) {
    return { success: false, error: 'Firebase Admin not configured' };
  }
  
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    if (!decodedToken.phone_number) {
      return { success: false, error: 'Token does not contain phone number' };
    }
    
    return {
      success: true,
      phoneNumber: decodedToken.phone_number,
      uid: decodedToken.uid,
    };
  } catch (error: any) {
    console.error('Firebase token verification error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return { success: false, error: 'Token expired. Please verify again.' };
    } else if (error.code === 'auth/argument-error') {
      return { success: false, error: 'Invalid token format' };
    }
    
    return { success: false, error: error.message || 'Token verification failed' };
  }
}
