/**
 * API key check for webhook endpoints.
 * Clients send the shared secret in the `x-api-key` header; the server compares
 * it with the WEBHOOK_SECRET environment variable.
 *
 * - Fails closed: if WEBHOOK_SECRET is not configured, every request is rejected
 *   (an unset secret must never mean "open").
 * - Constant-time comparison (hashes first so lengths always match).
 * - Header only: secrets in query strings end up in access logs and browser history.
 */

import { createHash, timingSafeEqual } from 'crypto';

export const API_KEY_HEADER = 'x-api-key';

export type ApiKeyCheck = 'ok' | 'unauthorized' | 'misconfigured';

/** Anything with headers.get(): a fetch Request, NextRequest, or a test double */
export interface HeaderSource {
  headers: { get(name: string): string | null };
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

export function checkApiKey(
  request: HeaderSource,
  expectedSecret: string | undefined = process.env.WEBHOOK_SECRET
): ApiKeyCheck {
  const expected = expectedSecret?.trim();
  if (!expected) {
    return 'misconfigured';
  }

  const provided = request.headers.get(API_KEY_HEADER);
  if (!provided) {
    return 'unauthorized';
  }

  return timingSafeEqual(digest(provided), digest(expected)) ? 'ok' : 'unauthorized';
}

/**
 * One-line guard for route handlers. Call it FIRST:
 *
 *   const denied = guardApiKey(request);
 *   if (denied) return denied;
 *
 * Returns null when the key is valid, otherwise the response to send back.
 * The response never contains debug output or details about why the key failed.
 */
export function guardApiKey(
  request: HeaderSource,
  expectedSecret: string | undefined = process.env.WEBHOOK_SECRET
): Response | null {
  const check = checkApiKey(request, expectedSecret);

  if (check === 'ok') {
    return null;
  }

  if (check === 'misconfigured') {
    console.error('[auth] WEBHOOK_SECRET is not configured, rejecting request');
    return Response.json(
      { success: false, error: 'Server configuration error' },
      { status: 500 }
    );
  }

  console.warn('[auth] Rejected request with missing or invalid x-api-key');
  return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}
