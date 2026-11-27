/** @jest-environment node */

import { CurrencyConversionService } from '../currencyConversion';
import { ParsedTransaction } from '../../types';

const today = new Date().toISOString().slice(0, 10);
const transaction = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  amount: 10,
  currency: 'EUR',
  merchant: 'Market',
  category: 'Food',
  ...overrides,
});

describe('wallet currency conversion', () => {
  let service: CurrencyConversionService;
  let fetchQuote: jest.SpyInstance;

  const quote = (base = 'EUR', rate = 49.123, date = today, target = 'UAH') =>
    Response.json({ date, base, quote: target, rate });

  beforeEach(() => {
    service = new CurrencyConversionService();
    fetchQuote = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['EUR', 49.123, 491.23],
    ['USD', 43.245, 432.45],
    ['ALL', 0.5525, 5.53],
  ])('converts %s to UAH using the quoted direction', async (currency, rate, amount) => {
    fetchQuote.mockResolvedValueOnce(quote(currency, rate));
    await expect(service.convert(transaction({ currency }), 'UAH')).resolves.toEqual({
      walletAmount: amount,
      walletCurrency: 'UAH',
      source: 'fx',
      provider: 'Frankfurter',
      rate,
      rateDate: today,
    });
    expect(fetchQuote).toHaveBeenCalledWith(
      `https://api.frankfurter.dev/v2/rate/${currency}/UAH`,
      { cache: 'no-store', signal: expect.any(AbortSignal) },
    );
  });

  test('uses explicit settlement even if the original is already in the wallet currency', async () => {
    const tx = transaction({ currency: 'UAH', settlementAmount: 10.55, settlementCurrency: ' uah ' });
    await expect(service.convert(tx, 'UAH')).resolves.toEqual({
      walletAmount: 10.55, walletCurrency: 'UAH', source: 'settlement',
    });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  test('ignores a settlement in a different currency and passes through the original', async () => {
    const tx = transaction({ currency: ' uah ', settlementAmount: 1, settlementCurrency: 'EUR' });
    await expect(service.convert(tx, 'UAH')).resolves.toEqual({
      walletAmount: 10, walletCurrency: 'UAH', source: 'same_currency',
    });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  test.each([
    ['UAH', 1.005, 1.01],
    ['JPY', 100.5, 101],
    ['KWD', 1.2345, 1.235],
  ])('rounds %s using its minor units', async (currency, amount, expected) => {
    await expect(service.convert(transaction({ amount, currency }), currency)).resolves
      .toMatchObject({ walletAmount: expected });
  });

  test('rounds an exact half-cent up after decimal multiplication', async () => {
    fetchQuote.mockResolvedValueOnce(quote('EUR', 0.7));
    await expect(service.convert(transaction({ amount: 1.15 }), 'UAH'))
      .resolves.toMatchObject({ walletAmount: 0.81 });
  });

  test('rejects an amount that rounds to zero', async () => {
    await expect(service.convert(transaction({ amount: 0.001, currency: 'UAH' }), 'UAH'))
      .rejects.toMatchObject({ status: 422 });
  });

  test.each(['', 'ZZZ', '€'])('rejects unknown original currency %p', async (currency) => {
    await expect(service.convert(transaction({ currency }), 'UAH')).rejects.toMatchObject({ status: 422 });
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  test('reuses cached rates until the TTL and refetches after it', async () => {
    const clock = jest.spyOn(Date, 'now');
    const now = Date.now();
    fetchQuote.mockResolvedValueOnce(quote()).mockResolvedValueOnce(quote('EUR', 50));
    await service.convert(transaction(), 'UAH');
    clock.mockReturnValue(now + 14 * 60_000);
    await service.convert(transaction(), 'UAH');
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 16 * 60_000);
    await expect(service.convert(transaction(), 'UAH')).resolves.toMatchObject({ walletAmount: 500 });
    expect(fetchQuote).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['old rate', () => quote('EUR', 49, '2000-01-01')],
    ['future rate', () => quote('EUR', 49, '9999-01-01')],
    ['invalid date', () => quote('EUR', 49, '2026-02-30')],
    ['wrong pair', () => quote('EUR', 49, today, 'USD')],
    ['invalid rate', () => quote('EUR', 0)],
    ['unsupported pair', () => new Response('', { status: 422 })],
    ['invalid payload', () => new Response('not JSON')],
  ])('fails explicitly for %s and allows another attempt', async (_name, response) => {
    fetchQuote.mockResolvedValueOnce(response()).mockResolvedValueOnce(quote());
    await expect(service.convert(transaction(), 'UAH')).rejects.toMatchObject({ status: 502 });
    await expect(service.convert(transaction(), 'UAH')).resolves.toMatchObject({ walletAmount: 491.23 });
  });

  test('bounds the FX request with an abort signal and reports timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchQuote.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(service.convert(transaction(), 'UAH')).rejects.toMatchObject({ status: 502 });
    expect(timeout).toHaveBeenCalledWith(3000);
  });
});
