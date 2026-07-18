import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_FIREBASE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function verifyFirebasePhoneToken(token: string): Promise<string> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('SMS verification is not configured');
  const { payload } = await jwtVerify(token, GOOGLE_FIREBASE_KEYS, {
    algorithms: ['RS256'], audience: projectId, issuer: `https://securetoken.google.com/${projectId}`
  });
  const phone = payload.phone_number;
  if (typeof phone !== 'string') throw new Error('Phone number was not verified');
  return phone;
}
