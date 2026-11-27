/**
 * Tests for CashewLinkGenerator
 * Parameter reference: https://cashewapp.web.app/faq.html#app-links
 */

import { generateCashewLink } from '../cashewLinkGenerator';
import { ParsedTransaction } from '../../types';
import { resetCashewConfig } from '../cashewConfigLoader';

describe('generateCashewLink', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CASHEW_ACCOUNTS;
    delete process.env.CASHEW_CATEGORIES;
    delete process.env.CASHEW_SUBCATEGORIES;
    process.env.CASHEW_ACCOUNT_CURRENCIES = '{"Default":"UAH","Mono":"UAH","Privat":"UAH"}';
    resetCashewConfig();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetCashewConfig();
  });

  const tx = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
    amount: 150,
    category: 'Food',
    merchant: 'Starbucks',
    currency: 'UAH',
    ...overrides,
  });

  const params = async (transaction: ParsedTransaction, account?: string) =>
    new URL((await generateCashewLink(transaction, { account })).url).searchParams;

  test('targets the Cashew addTransaction endpoint', async () => {
    const { url } = await generateCashewLink(tx());

    expect(url).toMatch(/^https:\/\/cashewapp\.web\.app\/addTransaction\?/);
  });

  test('maps transaction fields to Cashew parameters', async () => {
    const p = await params(tx({ details: 'card *1234' }));

    expect(p.get('amount')).toBe('150');
    expect(p.get('category')).toBe('Food');
    expect(p.get('title')).toBe('Starbucks');
    expect(p.get('notes')).toBe('card *1234');
  });

  test('does not send parameters Cashew does not support', async () => {
    const p = await params(tx());

    expect(p.has('currency')).toBe(false);
  });

  test('does not use transactionType as notes', async () => {
    const p = await params(tx({ transactionType: 'Payment' }));

    expect(p.has('notes')).toBe(false);
  });

  test('omits empty title and notes', async () => {
    const p = await params(tx({ merchant: '', details: '' }));

    expect(p.has('title')).toBe(false);
    expect(p.has('notes')).toBe(false);
  });

  test('does not send a date, so Cashew uses the device current date/time', async () => {
    const p = await params(tx());

    expect(p.has('date')).toBe(false);
    expect(p.has('dateCreated')).toBe(false);
  });

  test('keeps decimal amounts', async () => {
    expect((await params(tx({ amount: 99.99 }))).get('amount')).toBe('99.99');
  });

  test('round-trips special characters, Cyrillic and emoji', async () => {
    const p = await params(tx({ merchant: 'Coffee & Tea #1? "Кафе" ☕', category: 'Їжа й напої' }));

    expect(p.get('title')).toBe('Coffee & Tea #1? "Кафе" ☕');
    expect(p.get('category')).toBe('Їжа й напої');
  });

  test('never leaves raw "&", "#" or spaces inside a value', async () => {
    const { url } = await generateCashewLink(tx({ merchant: 'A & B #1' }));
    const query = url.split('?')[1];

    expect(query.split('&')).toHaveLength(4); // amount, category, wallet, title
    expect(query).not.toContain(' ');
    expect(query).not.toContain('#');
  });

  test('normalizes whitespace and control characters', async () => {
    expect((await params(tx({ merchant: 'Store \n   Name' }))).get('title')).toBe('Store Name');
  });

  test('truncates long titles', async () => {
    const title = (await params(tx({ merchant: 'A'.repeat(200) }))).get('title')!;

    expect(title.length).toBeLessThanOrEqual(103); // 100 + '...'
  });

  describe('with Cashew config', () => {
    beforeEach(() => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Побут', 'Авто']);
      resetCashewConfig();
    });

    test('writes the configured account as wallet (case-insensitive)', async () => {
      expect((await params(tx({ category: 'Авто' }), 'privat')).get('wallet')).toBe('Privat');
    });

    test('falls back to the first account when unknown', async () => {
      expect((await params(tx({ category: 'Авто' }), 'Приват')).get('wallet')).toBe('Mono');
    });

    test('constrains the category to the configured list', async () => {
      expect((await params(tx({ category: 'Паливо' }))).get('category')).toBe('Побут');
      expect((await params(tx({ category: 'авто' }))).get('category')).toBe('Авто');
    });

    test('returns the mapping that was written into the link', async () => {
      const { mapping } = await generateCashewLink(tx({ category: 'Паливо' }), { account: 'Unknown' });

      expect(mapping).toEqual({
        account: 'Mono',
        category: 'Побут',
        subcategory: '',
        accountMatched: false,
        categoryMatched: false,
        subcategoryMatched: true,
      });
    });
  });

  describe('with subcategories', () => {
    beforeEach(() => {
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Інше', 'Авто', 'Транспорт']);
      process.env.CASHEW_SUBCATEGORIES = JSON.stringify({ Авто: ['Паливо', 'Паркування'], Транспорт: ['Таксі'] });
      resetCashewConfig();
    });

    test('sends a subcategory that belongs to the category', async () => {
      const p = await params(tx({ category: 'Авто', subcategory: 'Паливо' }));

      expect(p.get('category')).toBe('Авто');
      expect(p.get('subcategory')).toBe('Паливо');
    });

    test('normalizes the subcategory to the configured casing', async () => {
      expect((await params(tx({ category: 'Авто', subcategory: 'паливо' }))).get('subcategory')).toBe('Паливо');
    });

    test('omits a subcategory from the wrong category', async () => {
      const p = await params(tx({ category: 'Транспорт', subcategory: 'Паливо' }));

      expect(p.get('category')).toBe('Транспорт');
      expect(p.has('subcategory')).toBe(false);
    });

    test('omits the subcategory when the category fell back', async () => {
      const p = await params(tx({ category: 'Невідома', subcategory: 'Паливо' }));

      expect(p.get('category')).toBe('Інше');
      expect(p.has('subcategory')).toBe(false);
    });

    test('omits an empty or missing subcategory', async () => {
      expect((await params(tx({ category: 'Авто', subcategory: '' }))).has('subcategory')).toBe(false);
      expect((await params(tx({ category: 'Авто' }))).has('subcategory')).toBe(false);
    });

    test('encodes subcategory names with spaces and apostrophes', async () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Рахунки']);
      process.env.CASHEW_SUBCATEGORIES = JSON.stringify({ Рахунки: ["Зв'язок та інтернет"] });
      resetCashewConfig();

      const { url } = await generateCashewLink(tx({ category: 'Рахунки', subcategory: "Зв'язок та інтернет" }));

      expect(new URL(url).searchParams.get('subcategory')).toBe("Зв'язок та інтернет");
      expect(url.split('?')[1]).not.toContain(' ');
    });
  });

  test('uses "Default" as wallet when no accounts are configured and none is given', async () => {
    expect((await params(tx())).get('wallet')).toBe('Default');
  });

  describe('invalid input', () => {
    test.each([-50, NaN])('throws for amount %p', async (amount) => {
      await expect(generateCashewLink(tx({ amount }))).rejects.toThrow('Invalid transaction amount');
    });
  });
});
