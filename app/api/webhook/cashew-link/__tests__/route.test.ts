/** @jest-environment node */

import { GET, POST } from '../route';
import { TransactionAnalyzer } from '@/lib/services/transactionAnalyzer';
import { resetCashewConfig } from '@/lib/services/cashewConfigLoader';

jest.mock('@/lib/services/transactionAnalyzer');

const originalEnv = process.env;
const analyzeDirect = jest.mocked(TransactionAnalyzer.prototype.analyzeDirect);
const transaction = {
  amount: 10,
  currency: 'EUR',
  category: 'Refunds',
  subcategory: 'Store refund',
  merchant: 'Shop',
  details: 'card *1234',
};
const endpoint = 'https://example.test/api/webhook/cashew-link';

beforeEach(() => {
  process.env = {
    ...originalEnv,
    WEBHOOK_SECRET: 'test-secret',
    CASHEW_ACCOUNTS: '["Ukrsib","Euro wallet"]',
    CASHEW_ACCOUNT_CURRENCIES: '{"ukrsib":"uah","Euro wallet":"EUR"}',
    CASHEW_CATEGORIES: '["Other","Refunds"]',
    CASHEW_SUBCATEGORIES: '{"Refunds":["Store refund"]}',
  };
  delete process.env.CASHEW_TRANSFER_ACCOUNTS;
  resetCashewConfig();
  jest.clearAllMocks();
  jest.mocked(TransactionAnalyzer.prototype.getDebugLog).mockReturnValue([]);
  analyzeDirect.mockResolvedValue(transaction);
});

afterEach(() => {
  process.env = originalEnv;
  resetCashewConfig();
  jest.restoreAllMocks();
});

test('uses the fallback wallet settlement for a refund and preserves original response fields', async () => {
  analyzeDirect.mockResolvedValue({ ...transaction, settlementAmount: 455.21, settlementCurrency: 'UAH' });
  const fetchQuote = jest.spyOn(globalThis, 'fetch');

  const result = await GET(new Request(
    `${endpoint}?app=Unknown&body=Refund%2010%20EUR%2C%20credited%20455.21%20UAH%2C%20balance%209999%20UAH&debug=true`,
    { headers: { 'x-api-key': 'test-secret' } },
  ));

  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body).toMatchObject({
    success: true,
    transaction: { amount: 10, currency: 'EUR', category: 'Refunds', subcategory: 'Store refund', merchant: 'Shop' },
    conversion: { source: 'settlement', walletAmount: 455.21, walletCurrency: 'UAH' },
    debugLog: expect.arrayContaining([expect.stringContaining('using "Ukrsib"')]),
  });
  const params = new URL(body.url).searchParams;
  expect(Object.fromEntries(params)).toEqual({
    wallet: 'Ukrsib', amount: '455.21', category: 'Refunds', subcategory: 'Store refund',
    title: 'Shop', notes: 'Original: 10 EUR | card *1234',
  });
  expect(fetchQuote).not.toHaveBeenCalled();
});

test.each([
  ['8.00USD', 8, 'USD', 45.088, 360.70],
  ['10.80EUR', 10.8, 'EUR', 49.454, 534.10],
  ['2998.00ALL', 2998, 'ALL', 0.55144, 1653.22],
  ['759.99UAH', 759.99, 'UAH', 1, 759.99],
])('takes Suma from an Ukrsib payment in %s and ignores Dostupno', async (sum, amount, currency, rate, walletAmount) => {
  analyzeDirect.mockResolvedValue({
    ...transaction,
    amount: 9204.62,
    currency: 'UAH',
    settlementAmount: 9204.62,
    settlementCurrency: 'UAH',
    category: 'Other',
    subcategory: '',
  });
  const date = new Date().toISOString().slice(0, 10);
  const fetchQuote = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
    base: currency, quote: 'UAH', rate, date,
  }));

  const result = await POST(new Request(`${endpoint}?app=ukrsib`, {
    method: 'POST',
    headers: { 'x-api-key': 'test-secret' },
    body: 'Oplata: TEST MARKET 27.11.2026 11:11:01. Kartka ****0000. Suma ' + sum +
      '.\nDostupno 9204.62UAH.Detali: ukrsibbank.com',
  }));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.transaction).toMatchObject({ amount, currency });
  expect(body.conversion).toEqual({
    source: currency === 'UAH' ? 'same_currency' : 'fx',
    walletAmount,
    walletCurrency: 'UAH',
    ...(currency === 'UAH' ? {} : { provider: 'Frankfurter', rateDate: date, rate }),
  });
  expect(new URL(body.url).searchParams.get('amount')).toBe(String(walletAmount));
  expect(fetchQuote).toHaveBeenCalledTimes(currency === 'UAH' ? 0 : 1);
  expect(body).not.toHaveProperty('debugLog');
});

test.each([
  ['transfer', 'Perekaz koshtiv: 08.11.2026 23:00:20 z rakhunku UA***0000UAH na sumu 500.00UAH na rakhunok UA***1111EUR na sumu 10.00EUR. Dostupni zalyshky: 900.00UAH ta 50.00EUR'],
  ['confirmation', 'Для підтвердження операції обміну валюти в сумі 10.00 EUR введіть код 00000. Довідка - 729.'],
  ['card_hold', 'Blokuvannia: TEST MARKET. Kartka ****0000. Suma 1081.00UAH. Dostupno 9000.00UAH. ONLINE.UKRSIBBANK.COM'],
])('skips an Ukrsib %s before AI or FX', async (reason, notification) => {
  const fetchQuote = jest.spyOn(globalThis, 'fetch');
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ app: 'ukrsib', body: notification, debug: 'true' }).toString();
  const result = await GET(new Request(url, { headers: { 'x-api-key': 'test-secret' } }));

  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({
    success: false,
    skipped: true,
    reason,
    debugLog: ['Skipped Ukrsib notification: ' + reason],
  });
  expect(analyzeDirect).not.toHaveBeenCalled();
  expect(fetchQuote).not.toHaveBeenCalled();
});

test('preserves the analysis path for a different mapped wallet', async () => {
  const result = await POST(new Request(`${endpoint}?app=Euro%20wallet`, {
    method: 'POST',
    headers: { 'x-api-key': 'test-secret' },
    body: 'Perekaz koshtiv: 10.00EUR',
  }));
  expect(result.status).toBe(200);
  expect((await result.json()).success).toBe(true);
  expect(analyzeDirect).toHaveBeenCalledTimes(1);
});

test('rejects unauthorized callers before analysis or FX', async () => {
  const fetchQuote = jest.spyOn(globalThis, 'fetch');
  const result = await GET(new Request(endpoint));
  expect(result.status).toBe(401);
  expect(analyzeDirect).not.toHaveBeenCalled();
  expect(fetchQuote).not.toHaveBeenCalled();
});

test.each([undefined, '{broken', '{}', '{"Ukrsib":"ZZZ"}'])('returns 500 for invalid or missing wallet configuration %p', async (config) => {
  if (config === undefined) delete process.env.CASHEW_ACCOUNT_CURRENCIES;
  else process.env.CASHEW_ACCOUNT_CURRENCIES = config;
  const result = await GET(new Request(`${endpoint}?app=Unknown&body=Payment%2010%20EUR`, {
    headers: { 'x-api-key': 'test-secret' },
  }));
  expect(result.status).toBe(500);
  expect(await result.json()).toMatchObject({ success: false, error: expect.stringContaining('Ukrsib') });
});

test.each([
  ['', 422, 'Unknown transaction currency'],
  ['GBP', 502, 'Unable to get a fresh exchange rate for GBP/UAH'],
])('surfaces conversion errors without producing a link', async (currency, status, error) => {
  analyzeDirect.mockResolvedValue({ ...transaction, currency });
  jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('FX unavailable'));
  const result = await GET(new Request(`${endpoint}?app=Ukrsib&body=Payment%20notification`, {
    headers: { 'x-api-key': 'test-secret' },
  }));
  expect(result.status).toBe(status);
  expect(await result.json()).toEqual({ success: false, error });
});

describe('Ukrsib internal transfer drafts', () => {
  const from = { bank: 'ukrsib', type: 'account', last4: '0012', currency: 'UAH', wallet: 'ukrsib' };
  const to = { bank: 'ukrsib', type: 'account', last4: '0034', currency: 'EUR', wallet: 'Euro wallet' };
  const message = 'Perekaz koshtiv: 08.11.2026 23:00:20 z rakhunku UA***00000012UAH na sumu 92610.00UAH na rakhunok UA***00000034EUR na sumu 1800,00EUR. Dostupni zalyshky: 62492.72UAH ta 2097.50EUR';

  async function sendTransfer(notification = message) {
    const fetchQuote = jest.spyOn(globalThis, 'fetch');
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ app: 'Ukrsib', body: notification, debug: 'true' }).toString();
    const result = await GET(new Request(url, { headers: { 'x-api-key': 'test-secret' } }));
    expect(result.status).toBe(200);
    expect(analyzeDirect).not.toHaveBeenCalled();
    expect(fetchQuote).not.toHaveBeenCalled();
    return result.json();
  }

  it('opens a Cashew draft with both bank amounts and canonical wallet names', async () => {
    process.env.CASHEW_TRANSFER_ACCOUNTS = JSON.stringify([from, to]);
    const body = await sendTransfer();
    expect(body.success).toBe(true);
    expect(body.transfer).toEqual({
      from: { wallet: 'Ukrsib', amount: 92610, currency: 'UAH' },
      to: { wallet: 'Euro wallet', amount: 1800, currency: 'EUR' },
    });
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe('https://cashewapp.web.app/addTransferRoute');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      walletFrom: 'Ukrsib', walletTo: 'Euro wallet', amountFrom: '92610', amountTo: '1800',
    });
    expect(JSON.stringify(body)).not.toContain('UA***');
  });

  it('uses the same draft route for transfers between distinct wallets of the same currency', async () => {
    process.env.CASHEW_ACCOUNT_CURRENCIES = '{"Ukrsib":"UAH","Euro wallet":"UAH"}';
    process.env.CASHEW_TRANSFER_ACCOUNTS = JSON.stringify([from, { ...to, currency: 'UAH' }]);
    const body = await sendTransfer(message.replace('0034EUR na sumu 1800,00EUR', '0034UAH na sumu 92610UAH'));
    expect(body.transfer.to).toEqual({ wallet: 'Euro wallet', amount: 92610, currency: 'UAH' });
  });

  it.each([
    ['unknown destination', [from]],
    ['duplicate identifier', [from, from, to]],
    ['card identifier', [from, { ...to, type: 'card' }]],
    ['wallet currency mismatch', [from, { ...to, wallet: 'Ukrsib' }]],
    ['invalid JSON', '{broken'],
  ])('leaves %s for manual entry', async (_description, entries) => {
    process.env.CASHEW_TRANSFER_ACCOUNTS = typeof entries === 'string' ? entries : JSON.stringify(entries);
    const body = await sendTransfer();
    expect(body).toMatchObject({ success: false, skipped: true, reason: 'transfer' });
    expect(body).not.toHaveProperty('url');
  });

  it('rejects a transfer with conflicting account and amount currencies', async () => {
    process.env.CASHEW_TRANSFER_ACCOUNTS = JSON.stringify([from, to]);
    const body = await sendTransfer(message.replace('1800,00EUR', '1800,00USD'));
    expect(body).toMatchObject({ success: false, skipped: true, reason: 'transfer' });
  });
});
