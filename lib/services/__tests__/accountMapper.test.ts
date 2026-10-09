/**
 * Tests for AccountMapper
 */

import { mapAccount, validateCategory, validateSubcategory, mapTransaction } from '../accountMapper';
import { resetCashewConfig } from '../cashewConfigLoader';

describe('AccountMapper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CASHEW_ACCOUNTS;
    delete process.env.CASHEW_CATEGORIES;
    resetCashewConfig();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetCashewConfig();
  });

  describe('mapAccount', () => {
    beforeEach(() => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat', 'Ukrsib']);
    });

    test('returns the configured account when it matches', () => {
      expect(mapAccount('Privat')).toEqual({ account: 'Privat', matched: true });
    });

    test('matches case-insensitively and returns the configured casing', () => {
      expect(mapAccount('ukrsib')).toEqual({ account: 'Ukrsib', matched: true });
      expect(mapAccount('MONO')).toEqual({ account: 'Mono', matched: true });
    });

    test('ignores surrounding whitespace', () => {
      expect(mapAccount('  Mono ')).toEqual({ account: 'Mono', matched: true });
    });

    test('falls back to the first account when unknown', () => {
      expect(mapAccount('Приват')).toEqual({ account: 'Mono', matched: false });
    });

    test.each([undefined, '', '   '])('falls back to the first account for %p', (value) => {
      expect(mapAccount(value)).toEqual({ account: 'Mono', matched: false });
    });

    test('passes the name through when no accounts are configured', () => {
      delete process.env.CASHEW_ACCOUNTS;
      resetCashewConfig();

      expect(mapAccount('Anything')).toEqual({ account: 'Anything', matched: true });
    });

    test('uses "Default" when nothing is configured and no name is given', () => {
      delete process.env.CASHEW_ACCOUNTS;
      resetCashewConfig();

      expect(mapAccount('')).toEqual({ account: 'Default', matched: false });
    });
  });

  describe('validateCategory', () => {
    beforeEach(() => {
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Побут', 'Авто', 'Доходи']);
    });

    test('returns the configured category when it matches', () => {
      expect(validateCategory('Авто')).toEqual({ category: 'Авто', matched: true });
    });

    test('matches case-insensitively and returns the configured casing', () => {
      expect(validateCategory('авто')).toEqual({ category: 'Авто', matched: true });
    });

    test('falls back to the first category when unknown', () => {
      expect(validateCategory('Паливо')).toEqual({ category: 'Побут', matched: false });
    });

    test.each([undefined, '', '   '])('falls back to the first category for %p', (value) => {
      expect(validateCategory(value)).toEqual({ category: 'Побут', matched: false });
    });

    test('supports Unicode / emoji category names', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify(['🍕 Food', 'Транспорт']);
      resetCashewConfig();

      expect(validateCategory('🍕 Food')).toEqual({ category: '🍕 Food', matched: true });
    });

    test('does not constrain when no categories are configured', () => {
      delete process.env.CASHEW_CATEGORIES;
      resetCashewConfig();

      expect(validateCategory('Anything')).toEqual({ category: 'Anything', matched: true });
      expect(validateCategory('')).toEqual({ category: '', matched: false });
    });
  });

  describe('mapTransaction', () => {
    test('maps account and category together', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Побут', 'Авто']);

      expect(mapTransaction('privat', 'авто')).toEqual({
        account: 'Privat',
        category: 'Авто',
        subcategory: '',
        accountMatched: true,
        categoryMatched: true,
        subcategoryMatched: true,
      });
    });

    test('reports fallbacks independently', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Побут', 'Авто']);

      expect(mapTransaction('Unknown', 'Авто')).toMatchObject({
        account: 'Mono',
        category: 'Авто',
        accountMatched: false,
        categoryMatched: true,
      });
      expect(mapTransaction('Privat', 'Unknown')).toMatchObject({
        account: 'Privat',
        category: 'Побут',
        accountMatched: true,
        categoryMatched: false,
      });
    });
  });

  describe('subcategories', () => {
    beforeEach(() => {
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Інше', 'Авто', 'Транспорт', 'Доходи']);
      process.env.CASHEW_SUBCATEGORIES = JSON.stringify({
        Авто: ['Паливо', 'Тех обслуговування'],
        Транспорт: ['Таксі'],
      });
      resetCashewConfig();
    });

    describe('validateSubcategory', () => {
      test('accepts a subcategory configured under the category', () => {
        expect(validateSubcategory('Авто', 'Паливо')).toEqual({ subcategory: 'Паливо', matched: true });
      });

      test('matches case-insensitively and returns the configured casing', () => {
        expect(validateSubcategory('авто', 'тех ОБСЛУГОВУВАННЯ')).toEqual({
          subcategory: 'Тех обслуговування',
          matched: true,
        });
      });

      test('drops a subcategory that belongs to a different category', () => {
        expect(validateSubcategory('Авто', 'Таксі')).toEqual({ subcategory: '', matched: false });
      });

      test('drops an unknown subcategory (no fallback to the first one)', () => {
        expect(validateSubcategory('Авто', 'Мийка')).toEqual({ subcategory: '', matched: false });
      });

      test('drops a subcategory for a category that has none configured', () => {
        expect(validateSubcategory('Доходи', 'Зарплата')).toEqual({ subcategory: '', matched: false });
      });

      test.each([undefined, '', '   '])('nothing requested (%p) is not reported as dropped', (value) => {
        expect(validateSubcategory('Авто', value)).toEqual({ subcategory: '', matched: true });
      });
    });

    describe('mapTransaction', () => {
      test('keeps a valid subcategory', () => {
        expect(mapTransaction('Mono', 'Авто', 'Паливо')).toMatchObject({
          category: 'Авто',
          subcategory: 'Паливо',
          subcategoryMatched: true,
        });
      });

      test('drops the subcategory when the category had to fall back', () => {
        // AI said "Паливо" is a subcategory of an unknown category -> category falls back to "Інше"
        expect(mapTransaction('Mono', 'Невідома', 'Паливо')).toMatchObject({
          category: 'Інше',
          categoryMatched: false,
          subcategory: '',
          subcategoryMatched: false,
        });
      });

      test('drops a subcategory from the wrong parent', () => {
        expect(mapTransaction('Mono', 'Транспорт', 'Паливо')).toMatchObject({
          category: 'Транспорт',
          subcategory: '',
          subcategoryMatched: false,
        });
      });

      test('works without any subcategory configuration', () => {
        delete process.env.CASHEW_SUBCATEGORIES;
        resetCashewConfig();

        expect(mapTransaction('Mono', 'Авто', 'Паливо')).toMatchObject({
          subcategory: '',
          subcategoryMatched: false,
        });
        expect(mapTransaction('Mono', 'Авто')).toMatchObject({ subcategory: '', subcategoryMatched: true });
      });
    });
  });
});
