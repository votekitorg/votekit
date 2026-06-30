let cachedToken: string | null = null;

export async function getCSRFToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const response = await fetch('/api/csrf', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not prepare secure request');
  const data = await response.json();
  cachedToken = data.token;
  return cachedToken as string;
}

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getCSRFToken();
  const headers = new Headers(init.headers || {});
  headers.set('x-csrf-token', token);

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (response.status !== 403) return response;

  cachedToken = null;
  const retryToken = await getCSRFToken();
  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set('x-csrf-token', retryToken);
  return fetch(input, {
    ...init,
    headers: retryHeaders
  });
}
