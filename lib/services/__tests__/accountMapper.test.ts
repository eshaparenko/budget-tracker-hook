/**
 * Tests for AccountMapper
 */

import {
  mapAccount,
  validateCategory,
  mapTransaction,
  getAvailableAccounts,
  getAllowedCategories,
  isValidAccount,
  isValidCategory,
} from '../accountMapper';
import { resetCashewConfig } from '../cashewConfigLoader';

describe('AccountMapper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetCashewConfig();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetCashewConfig();
  });

  describe('mapAccount', () => {
    test('should use account directly when found in config array', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat', 'Ukrsib']);

      const result = mapAccount('Mono');

      expect(result.mapped).toBe('Mono');
      expect(result.isMapped).toBe(false);
    });

    test('should use first account as fallback when not in config but config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      const result = mapAccount('UnknownBank');

      expect(result.mapped).toBe('Mono');
      expect(result.isMapped).toBe(true);
    });

    test('should use passthrough when no config exists', () => {
      delete process.env.CASHEW_ACCOUNTS;

      const result = mapAccount('MyBank');

      expect(result.mapped).toBe('MyBank');
      expect(result.isMapped).toBe(false);
    });

    test('should use first account for empty account name when config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      const result = mapAccount('');

      expect(result.mapped).toBe('Mono');
      expect(result.isMapped).toBe(true);
    });

    test('should use Default for empty account name when no config', () => {
      delete process.env.CASHEW_ACCOUNTS;

      const result = mapAccount('');

      expect(result.mapped).toBe('Default');
      expect(result.isMapped).toBe(false);
    });

    test('should use first account for whitespace-only account name when config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Privat', 'Ukrsib']);

      const result = mapAccount('   ');

      expect(result.mapped).toBe('Privat');
      expect(result.isMapped).toBe(true);
    });

    test('should be case-sensitive for account matching', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      const resultLower = mapAccount('mono');
      const resultUpper = mapAccount('MONO');
      const resultExact = mapAccount('Mono');

      expect(resultLower.mapped).toBe('Mono'); // Fallback to first
      expect(resultUpper.mapped).toBe('Mono'); // Fallback to first
      expect(resultExact.mapped).toBe('Mono'); // Exact match
    });
  });

  describe('validateCategory', () => {
    test('should accept category when found in allowed list', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const result = validateCategory('Побут');

      expect(result.valid).toBe(true);
      expect(result.category).toBe('Побут');
    });

    test('should use first category as default when not in allowed list', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const result = validateCategory('UnknownCategory');

      expect(result.valid).toBe(false);
      expect(result.category).toBe('Побут'); // First category
    });

    test('should accept any category when no config exists (any language)', () => {
      delete process.env.CASHEW_CATEGORIES;

      const resultUkr = validateCategory('Побут');
      const resultEng = validateCategory('Food');
      const resultEs = validateCategory('Comida');

      expect(resultUkr.valid).toBe(true);
      expect(resultEng.valid).toBe(true);
      expect(resultEs.valid).toBe(true);
    });

    test('should use first category as default for empty category when config exists', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const result = validateCategory('');

      expect(result.valid).toBe(true);
      expect(result.category).toBe('Побут'); // First category
    });

    test('should return empty for empty category when no config', () => {
      delete process.env.CASHEW_CATEGORIES;

      const result = validateCategory('');

      expect(result.valid).toBe(false);
      expect(result.category).toBe('');
    });

    test('should use first category for whitespace-only category when config exists', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Розваги',
        'Побут',
      ]);

      const result = validateCategory('   ');

      expect(result.valid).toBe(true);
      expect(result.category).toBe('Розваги'); // First category
    });

    test('should be case-sensitive for category matching', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Food',
        'Drinks',
      ]);

      const resultLower = validateCategory('food');
      const resultUpper = validateCategory('FOOD');
      const resultExact = validateCategory('Food');

      expect(resultLower.valid).toBe(false);
      expect(resultLower.category).toBe('Food'); // Defaults to first
      expect(resultUpper.valid).toBe(false);
      expect(resultUpper.category).toBe('Food'); // Defaults to first
      expect(resultExact.valid).toBe(true);
      expect(resultExact.category).toBe('Food');
    });

    test('should support Unicode categories in allowed list', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        '🍕 Food',
        'Продукты',
        '日本食',
      ]);

      expect(validateCategory('🍕 Food').valid).toBe(true);
      expect(validateCategory('Продукты').valid).toBe(true);
      expect(validateCategory('日本食').valid).toBe(true);
    });
  });

  describe('mapTransaction', () => {
    test('should map account and validate category', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const result = mapTransaction('Mono', 'Побут');

      expect(result.account).toBe('Mono');
      expect(result.category).toBe('Побут');
      expect(result.accountMapped).toBe(false);
      expect(result.categoryValid).toBe(true);
    });

    test('should use first account and category when both not found', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const result = mapTransaction('UnknownBank', 'UnknownCategory');

      expect(result.account).toBe('Mono'); // First account
      expect(result.category).toBe('Побут'); // First category
      expect(result.accountMapped).toBe(true);
      expect(result.categoryValid).toBe(false);
    });

    test('should use first account when not provided but config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Побут']);

      const result = mapTransaction('', 'Побут');

      expect(result.account).toBe('Mono');
      expect(result.category).toBe('Побут');
      expect(result.accountMapped).toBe(true);
      expect(result.categoryValid).toBe(true);
    });

    test('should use first category when not provided but config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const result = mapTransaction('Mono', '');

      expect(result.account).toBe('Mono');
      expect(result.category).toBe('Побут');
      expect(result.categoryValid).toBe(true);
    });

    test('should handle undefined account and category', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);
      process.env.CASHEW_CATEGORIES = JSON.stringify(['Побут']);

      const result = mapTransaction(undefined, undefined);

      expect(result.account).toBe('Mono');
      expect(result.category).toBe('Побут');
    });

    test('should accept any language when no category config', () => {
      delete process.env.CASHEW_CATEGORIES;

      const resultUkr = mapTransaction(undefined, 'Побут');
      const resultEng = mapTransaction(undefined, 'Food');
      const resultEs = mapTransaction(undefined, 'Comida');

      expect(resultUkr.categoryValid).toBe(true);
      expect(resultEng.categoryValid).toBe(true);
      expect(resultEs.categoryValid).toBe(true);
    });
  });

  describe('getAvailableAccounts', () => {
    test('should return sorted list of available accounts', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Zebra', 'Apple', 'Middle']);

      const accounts = getAvailableAccounts();

      expect(accounts).toEqual(['Apple', 'Middle', 'Zebra']);
    });

    test('should return empty list when no config', () => {
      delete process.env.CASHEW_ACCOUNTS;

      const accounts = getAvailableAccounts();

      expect(accounts).toEqual([]);
    });
  });

  describe('getAllowedCategories', () => {
    test('should return sorted list of allowed categories', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Zebra',
        'Apple',
        'Middle',
      ]);

      const categories = getAllowedCategories();

      expect(categories).toEqual(['Apple', 'Middle', 'Zebra']);
    });

    test('should return empty list when no config', () => {
      delete process.env.CASHEW_CATEGORIES;

      const categories = getAllowedCategories();

      expect(categories).toEqual([]);
    });
  });

  describe('isValidAccount', () => {
    test('should return true when account is in config', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);

      expect(isValidAccount('Mono')).toBe(true);
    });

    test('should return false when account is not in config but config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);

      expect(isValidAccount('Unknown')).toBe(false);
    });

    test('should return true when account is any string and no config exists (passthrough)', () => {
      delete process.env.CASHEW_ACCOUNTS;

      expect(isValidAccount('AnyBank')).toBe(true);
    });

    test('should return false for empty account', () => {
      expect(isValidAccount('')).toBe(false);
    });

    test('should return false for whitespace-only account', () => {
      expect(isValidAccount('   ')).toBe(false);
    });
  });

  describe('isValidCategory', () => {
    test('should return true when category is in allowed list', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      expect(isValidCategory('Побут')).toBe(true);
    });

    test('should return false when category is not in list but config exists', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      expect(isValidCategory('Unknown')).toBe(false);
    });

    test('should return true when category is any string and no config exists (any language)', () => {
      delete process.env.CASHEW_CATEGORIES;

      expect(isValidCategory('Побут')).toBe(true);
      expect(isValidCategory('Food')).toBe(true);
      expect(isValidCategory('Comida')).toBe(true);
    });

    test('should return false for empty category', () => {
      expect(isValidCategory('')).toBe(false);
    });

    test('should return false for whitespace-only category', () => {
      expect(isValidCategory('   ')).toBe(false);
    });
  });
});
