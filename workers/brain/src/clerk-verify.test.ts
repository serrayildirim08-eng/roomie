// clerk-verify is the ONLY gate on the paid AI worker, so it gets real
// coverage: a local RS256 keypair plays Clerk, a loopback HTTP server serves
// its JWKS (jose v5 on Node fetches JWKS via http.get, so stubbing global
// fetch does nothing), and we prove verifyClerkJwt fails CLOSED (null) on
// every bad input — and only opens for a correctly signed, unexpired,
// right-issuer token.

import { createServer, type Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { _resetClerkJwksCache, verifyClerkJwt } from './clerk-verify';

let server: Server;
let issuer: string;
let jwksBody: string;
let jwksStatus = 200;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwksBody = JSON.stringify({ keys: [{ ...jwk, kid: 'test-kid', alg: 'RS256', use: 'sig' }] });

  server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json' && jwksStatus === 200) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(jwksBody);
    } else {
      res.writeHead(jwksStatus === 200 ? 404 : jwksStatus);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no server port');
  issuer = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  jwksStatus = 200;
  _resetClerkJwksCache();
});

function signToken(opts: { issuer?: string; sub?: string; expiresInSec?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expiresInSec ?? 3600));
  if (opts.issuer !== undefined) jwt.setIssuer(opts.issuer);
  if (opts.sub !== undefined) jwt.setSubject(opts.sub);
  return jwt.sign(privateKey);
}

describe('verifyClerkJwt', () => {
  it('returns the sub for a correctly signed, unexpired token from the right issuer', async () => {
    const token = await signToken({ issuer, sub: 'user_abc123' });
    expect(await verifyClerkJwt(token, { CLERK_ISSUER: issuer })).toBe('user_abc123');
  });

  it('returns null when CLERK_ISSUER is not configured', async () => {
    const token = await signToken({ issuer, sub: 'user_abc123' });
    expect(await verifyClerkJwt(token, {})).toBeNull();
    expect(await verifyClerkJwt(token, { CLERK_ISSUER: undefined })).toBeNull();
  });

  it('returns null for an empty or non-string token', async () => {
    expect(await verifyClerkJwt('', { CLERK_ISSUER: issuer })).toBeNull();
    // Callers pass whatever was on the wire — prove the runtime guard holds.
    expect(await verifyClerkJwt(null as unknown as string, { CLERK_ISSUER: issuer })).toBeNull();
    expect(await verifyClerkJwt(12345 as unknown as string, { CLERK_ISSUER: issuer })).toBeNull();
  });

  it('returns null for garbage that is not a JWT at all', async () => {
    expect(await verifyClerkJwt('not-a-jwt', { CLERK_ISSUER: issuer })).toBeNull();
    expect(await verifyClerkJwt('a.b.c', { CLERK_ISSUER: issuer })).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const token = await signToken({ issuer, sub: 'user_abc123', expiresInSec: -3600 });
    expect(await verifyClerkJwt(token, { CLERK_ISSUER: issuer })).toBeNull();
  });

  it('returns null for a token from the wrong issuer', async () => {
    const token = await signToken({ issuer: 'https://evil.example.com', sub: 'user_abc123' });
    expect(await verifyClerkJwt(token, { CLERK_ISSUER: issuer })).toBeNull();
  });

  it('returns null for a token with no sub claim', async () => {
    const token = await signToken({ issuer });
    expect(await verifyClerkJwt(token, { CLERK_ISSUER: issuer })).toBeNull();
  });

  it('returns null for a token signed by a different key (forged signature)', async () => {
    const attacker = await generateKeyPair('RS256');
    const now = Math.floor(Date.now() / 1000);
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
      .setIssuer(issuer)
      .setSubject('user_abc123')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(attacker.privateKey);
    expect(await verifyClerkJwt(forged, { CLERK_ISSUER: issuer })).toBeNull();
  });

  it('returns null when the JWKS endpoint errors', async () => {
    jwksStatus = 500;
    const token = await signToken({ issuer, sub: 'user_abc123' });
    expect(await verifyClerkJwt(token, { CLERK_ISSUER: issuer })).toBeNull();
  });
});
