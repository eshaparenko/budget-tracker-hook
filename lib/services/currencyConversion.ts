import { ParsedTransaction } from '../types';

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RATE_AGE_MS = 5 * DAY_MS;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_PAIRS = 256;
const FX_TIMEOUT_MS = 3000;

export class CurrencyConversionError extends Error {
  constructor(message: string, readonly status: 422 | 500 | 502) {
    super(message);
    this.name = 'CurrencyConversionError';
  }
}

export function normalizeCurrency(value: unknown): string | undefined {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return SUPPORTED_CURRENCIES.has(currency) ? currency : undefined;
}

interface FxQuote {
  rate: number;
  rateDate: string;
  provider: 'Frankfurter';
}

export type CurrencyConversion = {
  walletAmount: number;
  walletCurrency: string;
} & (
  | { source: 'settlement' | 'same_currency' }
  | ({ source: 'fx' } & FxQuote)
);

function isFresh(date: string, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const published = Date.parse(date);
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return Number.isFinite(published)
    && new Date(published).toISOString().slice(0, 10) === date
    && published <= today
    && today - published <= MAX_RATE_AGE_MS;
}

// Use the decimal form of each input so multiplication cannot move a half-cent
// across the rounding boundary (for example, 1.15 × 0.7).
function decimalParts(value: number): { digits: bigint; exponent: number } {
  const [coefficient, power = '0'] = value.toString().split('e');
  const [integer, fraction = ''] = coefficient.split('.');
  return { digits: BigInt(integer + fraction), exponent: Number(power) - fraction.length };
}

function roundAmount(amount: number, currency: string, rate?: number): number {
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  const { maximumFractionDigits = 2 } = formatter.resolvedOptions();
  const original = decimalParts(amount);
  const multiplier = decimalParts(rate ?? 1);
  const digits = original.digits * multiplier.digits;
  const exponent = original.exponent + multiplier.exponent + maximumFractionDigits;
  const scale = BigInt(10) ** BigInt(Math.abs(exponent));
  const units = exponent >= 0 ? digits * scale : (digits + scale / BigInt(2)) / scale;

  if (units === BigInt(0) || units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new CurrencyConversionError('Amount is outside the supported wallet precision', 422);
  }
  return Number(units) / 10 ** maximumFractionDigits;
}

export class CurrencyConversionService {
  private readonly rates = new Map<string, { quote: FxQuote; expiresAt: number }>();

  async convert(transaction: ParsedTransaction, walletCurrency: string): Promise<CurrencyConversion> {
    const originalCurrency = normalizeCurrency(transaction.currency);
    if (!originalCurrency) {
      throw new CurrencyConversionError('Unknown transaction currency', 422);
    }
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      throw new CurrencyConversionError('Invalid transaction amount', 422);
    }

    if (normalizeCurrency(transaction.settlementCurrency) === walletCurrency) {
      const amount = transaction.settlementAmount;
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
        return { walletAmount: roundAmount(amount, walletCurrency), walletCurrency, source: 'settlement' };
      }
    }

    if (originalCurrency === walletCurrency) {
      return {
        walletAmount: roundAmount(transaction.amount, walletCurrency),
        walletCurrency,
        source: 'same_currency',
      };
    }

    const quote = await this.getQuote(originalCurrency, walletCurrency);
    return {
      walletAmount: roundAmount(transaction.amount, walletCurrency, quote.rate),
      walletCurrency,
      source: 'fx',
      ...quote,
    };
  }

  private async getQuote(base: string, quoteCurrency: string): Promise<FxQuote> {
    const pair = `${base}/${quoteCurrency}`;
    const cached = this.rates.get(pair);
    const now = Date.now();
    if (cached && cached.expiresAt > now && isFresh(cached.quote.rateDate, now)) {
      return cached.quote;
    }

    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/${pair}`, {
        signal: AbortSignal.timeout(FX_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const receivedAt = Date.now();
      if (data?.base !== base || data.quote !== quoteCurrency
        || typeof data.rate !== 'number' || !Number.isFinite(data.rate) || data.rate <= 0
        || typeof data.date !== 'string' || !isFresh(data.date, receivedAt)) {
        throw new Error('Invalid or stale exchange rate');
      }

      const quote: FxQuote = { rate: data.rate, rateDate: data.date, provider: 'Frankfurter' };
      this.rates.delete(pair);
      const oldest = this.rates.keys().next().value;
      if (this.rates.size >= MAX_CACHED_PAIRS && oldest) this.rates.delete(oldest);
      this.rates.set(pair, { quote, expiresAt: receivedAt + CACHE_TTL_MS });
      return quote;
    } catch {
      throw new CurrencyConversionError(`Unable to get a fresh exchange rate for ${pair}`, 502);
    }
  }
}

export const currencyConversion = new CurrencyConversionService();
