// Signed tokens for the two store APIs, with node:crypto only (no packages to keep up to date in a release path).
//   App Store Connect: ES256 with the API key (.p8), at most 20 minutes valid.
//   Google Play:       RS256 with a service account, exchanged at Google's token endpoint for an access token.
import { createPrivateKey, sign } from 'node:crypto';

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export function jwt(header, claims, pem, algorithm) {
  const input = `${b64url(header)}.${b64url(claims)}`;
  const key = createPrivateKey(pem);
  const signature = algorithm === 'ES256'
    ? sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
    : sign('sha256', Buffer.from(input), key);
  return `${input}.${signature.toString('base64url')}`;
}

export function appStoreConnectToken({ keyId, issuerId, privateKey }, now = Date.now()) {
  if (!keyId || !issuerId || !privateKey) throw new Error('App Store Connect key, key id and issuer id are all needed');
  const iat = Math.floor(now / 1000);
  return jwt({ alg: 'ES256', kid: keyId, typ: 'JWT' }, { iss: issuerId, iat, exp: iat + 15 * 60, aud: 'appstoreconnect-v1' }, privateKey, 'ES256');
}

export async function googleAccessToken(serviceAccountJson, scope, fetchImpl = fetch, now = Date.now()) {
  const account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  if (account.type !== 'service_account' || !account.client_email || !account.private_key) {
    throw new Error('The Google key is not a service account key (type service_account with client_email and private_key)');
  }
  const iat = Math.floor(now / 1000);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const assertion = jwt({ alg: 'RS256', typ: 'JWT', kid: account.private_key_id },
    { iss: account.client_email, scope, aud: tokenUri, iat, exp: iat + 3600 }, account.private_key, 'RS256');
  const res = await fetchImpl(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google refused the service account (${res.status} ${body.error ?? ''} ${body.error_description ?? ''})`.trim());
  return body.access_token;
}

// One JSON call with a readable error. Store errors end up in the pipeline log, so they name the call and the answer,
// never the token.
export async function call(fetchImpl, method, url, token, body, extraHeaders = {}) {
  const headers = { authorization: `Bearer ${token}`, ...extraHeaders };
  let payload = body;
  if (body !== undefined && !(body instanceof Uint8Array)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetchImpl(url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const detail = json?.errors?.map((e) => `${e.title ?? ''}: ${e.detail ?? ''}`).join('; ') || json?.error?.message || text.slice(0, 400);
    const err = new Error(`${method} ${url.replace(/\?.*$/, '')} answered ${res.status}: ${detail}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
