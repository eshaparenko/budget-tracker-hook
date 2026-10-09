/**
 * @jest-environment node
 */
import { checkApiKey, guardApiKey, HeaderSource } from '../apiKeyAuth';

const requestWith = (headers: Record<string, string>): HeaderSource => ({
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
});

describe('checkApiKey', () => {
  const SECRET = 's3cret-value';

  test('accepts the correct key', () => {
    expect(checkApiKey(requestWith({ 'x-api-key': SECRET }), SECRET)).toBe('ok');
  });

  test('rejects a wrong key', () => {
    expect(checkApiKey(requestWith({ 'x-api-key': 'nope' }), SECRET)).toBe('unauthorized');
  });

  test('rejects a missing header', () => {
    expect(checkApiKey(requestWith({}), SECRET)).toBe('unauthorized');
  });

  test('rejects an empty header', () => {
    expect(checkApiKey(requestWith({ 'x-api-key': '' }), SECRET)).toBe('unauthorized');
  });

  test('rejects keys that differ only by case or by a prefix', () => {
    expect(checkApiKey(requestWith({ 'x-api-key': SECRET.toUpperCase() }), SECRET)).toBe('unauthorized');
    expect(checkApiKey(requestWith({ 'x-api-key': SECRET.slice(0, -1) }), SECRET)).toBe('unauthorized');
    expect(checkApiKey(requestWith({ 'x-api-key': SECRET + 'x' }), SECRET)).toBe('unauthorized');
  });

  describe('fails closed when WEBHOOK_SECRET is not configured', () => {
    test.each([undefined, '', '   '])('secret %p', (secret) => {
      expect(checkApiKey(requestWith({ 'x-api-key': 'anything' }), secret)).toBe('misconfigured');
    });

    test('even when the client sends no key (undefined !== undefined must not pass)', () => {
      expect(checkApiKey(requestWith({}), undefined)).toBe('misconfigured');
    });
  });

  test('reads WEBHOOK_SECRET from the environment by default', () => {
    const original = process.env.WEBHOOK_SECRET;
    process.env.WEBHOOK_SECRET = SECRET;
    try {
      expect(checkApiKey(requestWith({ 'x-api-key': SECRET }))).toBe('ok');
      expect(checkApiKey(requestWith({ 'x-api-key': 'bad' }))).toBe('unauthorized');
    } finally {
      if (original === undefined) delete process.env.WEBHOOK_SECRET;
      else process.env.WEBHOOK_SECRET = original;
    }
  });

  test('ignores surrounding whitespace in the configured secret', () => {
    expect(checkApiKey(requestWith({ 'x-api-key': SECRET }), `  ${SECRET}\n`)).toBe('ok');
  });
});

describe('guardApiKey', () => {
  const SECRET = 's3cret-value';
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('returns null for a valid key (request may proceed)', () => {
    expect(guardApiKey(requestWith({ 'x-api-key': SECRET }), SECRET)).toBeNull();
  });

  test('returns 401 for a wrong or missing key', async () => {
    const cases: Record<string, string>[] = [{ 'x-api-key': 'bad' }, {}];
    for (const headers of cases) {
      const res = guardApiKey(requestWith(headers), SECRET)!;

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: 'Unauthorized' });
    }
  });

  test('returns 500 when WEBHOOK_SECRET is not configured, even if a key is sent', async () => {
    const res = guardApiKey(requestWith({ 'x-api-key': 'anything' }), undefined)!;

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Server configuration error' });
  });

  test('responses never contain debug output or echo the provided key', async () => {
    const res = guardApiKey(requestWith({ 'x-api-key': 'attacker-guess' }), SECRET)!;
    const text = JSON.stringify(await res.json());

    expect(text).not.toContain('debugLog');
    expect(text).not.toContain('attacker-guess');
    expect(text).not.toContain(SECRET);
  });

  test('never logs the provided key or the secret', () => {
    guardApiKey(requestWith({ 'x-api-key': 'attacker-guess' }), SECRET);
    guardApiKey(requestWith({ 'x-api-key': 'attacker-guess' }), undefined);

    const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(logged).not.toContain('attacker-guess');
    expect(logged).not.toContain(SECRET);
  });
});
