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

test('converts an ALL purchase with only a UAH balance into the mapped UAH wallet', async () => {
  analyzeDirect.mockResolvedValue({ ...transaction, currency: 'ALL', category: 'Other', subcategory: '' });
  const date = new Date().toISOString().slice(0, 10);
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
    base: 'ALL', quote: 'UAH', rate: 0.55, date,
  }));

  const result = await POST(new Request(`${endpoint}?app=ukrsib`, {
    method: 'POST',
    headers: { 'x-api-key': 'test-secret' },
    body: 'Purchase 10 ALL, Available 9000 UAH',
  }));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.transaction).toMatchObject({ amount: 10, currency: 'ALL' });
  expect(body.conversion).toEqual({
    source: 'fx', walletAmount: 5.5, walletCurrency: 'UAH', provider: 'Frankfurter', rateDate: date, rate: 0.55,
  });
  expect(new URL(body.url).searchParams.get('amount')).toBe('5.5');
  expect(body).not.toHaveProperty('debugLog');
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
  ['USD', 502, 'Unable to get a fresh exchange rate for USD/UAH'],
])('surfaces conversion errors without producing a link', async (currency, status, error) => {
  analyzeDirect.mockResolvedValue({ ...transaction, currency });
  jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('FX unavailable'));
  const result = await GET(new Request(`${endpoint}?app=Ukrsib&body=Payment%20notification`, {
    headers: { 'x-api-key': 'test-secret' },
  }));
  expect(result.status).toBe(status);
  expect(await result.json()).toEqual({ success: false, error });
});
