/**
 * Tests for CashewLinkGenerator
 */

import {
  generateCashewLink,
  generateCashewLinkResult,
  generateCashewLinkHtml,
  validateTransactionForLink,
} from '../cashewLinkGenerator';
import { ParsedTransaction } from '../../types';
import { resetCashewConfig } from '../cashewConfigLoader';

describe('CashewLinkGenerator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetCashewConfig();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetCashewConfig();
  });

  const createTransaction = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
    amount: 150,
    category: 'Food',
    merchant: 'Starbucks',
    currency: 'UAH',
    ...overrides,
  });

  describe('generateCashewLink', () => {
    test('should generate valid Cashew link', () => {
      const transaction = createTransaction();

      const link = generateCashewLink(transaction);

      expect(link).toMatch(/^https:\/\/cashewapp\.web\.app\/addTransaction\?/);
      expect(link).toContain('amount=150');
      expect(link).toContain('category=Food');
      expect(link).toContain('title=Starbucks');
      expect(link).toContain('currency=UAH');
    });

    test('should include all required parameters', () => {
      const transaction = createTransaction({
        amount: 500,
        category: 'Shopping',
        merchant: 'Mall Store',
        currency: 'EUR',
      });

      const link = generateCashewLink(transaction);

      expect(link).toContain('amount=500');
      expect(link).toContain('category=Shopping');
      expect(link).toContain('title=Mall%20Store'); // Space encoded
      expect(link).toContain('currency=EUR');
    });

    test('should URL-encode special characters', () => {
      const transaction = createTransaction({
        merchant: 'Coffee & Tea Shop',
        category: 'Food & Drinks',
      });

      const link = generateCashewLink(transaction);

      expect(link).toContain('title=Coffee%20%26%20Tea%20Shop');
      expect(link).toContain('category=Food%20%26%20Drinks');
    });

    test('should handle Cyrillic characters', () => {
      const transaction = createTransaction({
        merchant: 'Кофе-лаунж',
        category: 'Їжа й напої',
      });

      const link = generateCashewLink(transaction);

      // Cyrillic should be properly URL-encoded
      expect(link).toContain('%');
      expect(link).toMatch(/addTransaction\?/);
    });

    test('should handle Unicode emoji', () => {
      const transaction = createTransaction({
        merchant: '☕ Coffee Shop',
        category: '🍕 Food',
      });

      const link = generateCashewLink(transaction);

      expect(link).toMatch(/addTransaction\?/);
      expect(link).toContain('amount=150');
    });

    test('should truncate long merchant names', () => {
      const longMerchant = 'A'.repeat(200);
      const transaction = createTransaction({
        merchant: longMerchant,
      });

      const link = generateCashewLink(transaction);

      // Should have truncated
      const match = link.match(/title=([^&]+)/);
      expect(match).toBeTruthy();
      const decodedTitle = decodeURIComponent(match![1]);
      expect(decodedTitle.length).toBeLessThanOrEqual(103); // Includes '...'
    });

    test('should map account when provided', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      const transaction = createTransaction();
      const link = generateCashewLink(transaction, { account: 'Mono' });

      // Cashew uses 'wallet' parameter for account (internally referred to as wallet in code)
      expect(link).toContain('wallet=Mono');
    });

    test('should use mapped account in wallet parameter', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      const transaction = createTransaction();
      // When account is provided and in config, use it in wallet parameter
      const link = generateCashewLink(transaction, { account: 'Privat' });

      expect(link).toContain('wallet=Privat');
    });

    test('should validate category when config provided', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Food',
      ]);

      const transaction = createTransaction({ category: 'Food' });
      const link = generateCashewLink(transaction);

      expect(link).toContain('category=Food');
    });

    test('should handle decimal amounts', () => {
      const transaction = createTransaction({ amount: 99.99 });

      const link = generateCashewLink(transaction);

      expect(link).toContain('amount=99.99');
    });

    test('should handle various currency codes', () => {
      const currencies = ['USD', 'EUR', 'UAH', 'GBP', 'JPY', 'CHF'];

      currencies.forEach(currency => {
        const transaction = createTransaction({ currency });
        const link = generateCashewLink(transaction);

        expect(link).toContain(`currency=${currency}`);
      });
    });

    test('should include date parameter', () => {
      const transaction = createTransaction();
      const link = generateCashewLink(transaction);

      // Should have a date like YYYY-MM-DD
      expect(link).toMatch(/date=\d{4}-\d{2}-\d{2}/);
    });

    test('should include transaction type as notes if provided', () => {
      const transaction = createTransaction({
        transactionType: 'Payment',
      });

      const link = generateCashewLink(transaction);

      expect(link).toContain('notes=Payment');
    });

    test('should handle negative amount in validation', () => {
      const transaction = createTransaction({ amount: -50 });
      const validation = validateTransactionForLink(transaction);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Amount must be a positive number');
    });

    test('should handle zero amount in validation', () => {
      const transaction = createTransaction({ amount: 0 });
      const validation = validateTransactionForLink(transaction);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Amount must be a positive number');
    });

    test('should handle missing category in validation', () => {
      const transaction = createTransaction({ category: '' });
      const validation = validateTransactionForLink(transaction);

      expect(validation.valid).toBe(false);
    });

    test('should handle missing currency in validation', () => {
      const transaction = createTransaction({ currency: '' });
      const validation = validateTransactionForLink(transaction);

      expect(validation.valid).toBe(false);
    });

    test('should handle missing merchant in validation', () => {
      const transaction = createTransaction({ merchant: '' });
      const validation = validateTransactionForLink(transaction);

      expect(validation.valid).toBe(false);
    });
  });

  describe('generateCashewLinkResult', () => {
    test('should generate complete result object', () => {
      const transaction = createTransaction();
      const result = generateCashewLinkResult(transaction);

      expect(result.link).toMatch(/^https:\/\/cashewapp\.web\.app\/addTransaction\?/);
      expect(result.transaction.amount).toBe(150);
      expect(result.transaction.category).toBe('Food');
      expect(result.transaction.merchant).toBe('Starbucks');
      expect(result.transaction.currency).toBe('UAH');
    });

    test('should include cost info when provided', () => {
      const transaction = createTransaction();
      const costInfo = { provider: 'gemini', costUSD: 0.00012 };

      const result = generateCashewLinkResult(transaction, {}, costInfo);

      expect(result.cost).toEqual(costInfo);
    });

    test('should not include debug log by default', () => {
      const transaction = createTransaction();
      const result = generateCashewLinkResult(transaction);

      expect(result.debugLog).toBeUndefined();
    });

    test('should include mapped account in result', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      const transaction = createTransaction();
      const result = generateCashewLinkResult(transaction, { account: 'Mono' });

      expect(result.transaction.account).toBe('Mono');
    });

    test('should include category in result', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Food',
      ]);

      const transaction = createTransaction({ category: 'Food' });
      const result = generateCashewLinkResult(transaction);

      expect(result.transaction.category).toBe('Food');
    });
  });

  describe('generateCashewLinkHtml', () => {
    test('should generate valid HTML', () => {
      const transaction = createTransaction();
      const html = generateCashewLinkHtml(transaction);

      expect(html).toContain('<a href=');
      expect(html).toContain('cashewapp.web.app');
      expect(html).toContain('class="cashew-btn"');
      expect(html).toContain('target="_blank"');
    });

    test('should include transaction details in HTML', () => {
      const transaction = createTransaction({
        amount: 250,
        merchant: 'Coffee Shop',
      });

      const html = generateCashewLinkHtml(transaction);

      expect(html).toContain('250');
      expect(html).toContain('Coffee Shop');
    });

    test('should escape HTML special characters', () => {
      const transaction = createTransaction({
        merchant: 'Store & <Shop>',
      });

      const html = generateCashewLinkHtml(transaction);

      expect(html).toContain('&amp;');
      expect(html).not.toContain('<Shop>'); // Should be escaped
    });

    test('should include proper styling', () => {
      const transaction = createTransaction();
      const html = generateCashewLinkHtml(transaction);

      expect(html).toContain('style=');
      expect(html).toContain('cashew-widget');
      expect(html).toContain('cashew-btn');
      expect(html).toContain('cashew-summary');
    });

    test('should include category in HTML', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Food',
      ]);

      const transaction = createTransaction({ category: 'Food' });
      const html = generateCashewLinkHtml(transaction);

      expect(html).toContain('Food');
    });
  });

  describe('validateTransactionForLink', () => {
    test('should validate correct transaction', () => {
      const transaction = createTransaction();
      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject negative amount', () => {
      const transaction = createTransaction({ amount: -50 });
      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount must be a positive number');
    });

    test('should reject zero amount', () => {
      const transaction = createTransaction({ amount: 0 });
      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount must be a positive number');
    });

    test('should reject missing category', () => {
      const transaction = createTransaction({ category: '' });
      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Category'))).toBe(true);
    });

    test('should reject missing currency', () => {
      const transaction = createTransaction({ currency: '' });
      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Currency'))).toBe(true);
    });

    test('should reject missing merchant', () => {
      const transaction = createTransaction({ merchant: '' });
      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Merchant'))).toBe(true);
    });

    test('should collect multiple errors', () => {
      const transaction = createTransaction({
        amount: 0,
        category: '',
        currency: '',
        merchant: '',
      });

      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test('should validate with optional transactionType', () => {
      const transaction = createTransaction({
        transactionType: 'Payment',
      });

      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate with optional details', () => {
      const transaction = createTransaction({
        details: 'Card ending in 1234',
      });

      const result = validateTransactionForLink(transaction);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('URL encoding edge cases', () => {
    test('should handle multiple spaces (normalized to single)', () => {
      const transaction = createTransaction({
        merchant: 'Store    Name',
      });

      const link = generateCashewLink(transaction);

      // Multiple spaces get normalized to single space during sanitization
      expect(link).toContain('title=Store%20Name');
    });

    test('should handle special characters in category', () => {
      const transaction = createTransaction({
        category: 'Bills & Utilities',
      });

      const link = generateCashewLink(transaction);

      expect(link).toContain('%26'); // & encoded
    });

    test('should handle quotes in merchant name', () => {
      const transaction = createTransaction({
        merchant: 'Store "Name"',
      });

      const link = generateCashewLink(transaction);

      expect(link).toMatch(/addTransaction\?/);
    });

    test('should handle hash symbols', () => {
      const transaction = createTransaction({
        merchant: '#1 Shop',
      });

      const link = generateCashewLink(transaction);

      expect(link).toContain('%23'); // # encoded
    });

    test('should handle question marks', () => {
      const transaction = createTransaction({
        merchant: 'Store? Really?',
      });

      const link = generateCashewLink(transaction);

      expect(link).toContain('%3F'); // ? encoded
    });
  });
});
