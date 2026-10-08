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
    test('should map account when found in config', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
        Privat: 'PrivatBank',
      });

      const result = mapAccount('Mono');

      expect(result.mapped).toBe('Monobank');
      expect(result.isMapped).toBe(true);
    });

    test('should use passthrough when account not in config', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

      const result = mapAccount('UnknownBank');

      expect(result.mapped).toBe('UnknownBank');
      expect(result.isMapped).toBe(false);
    });

    test('should use passthrough when no config exists', () => {
      delete process.env.CASHEW_ACCOUNTS;

      const result = mapAccount('MyBank');

      expect(result.mapped).toBe('MyBank');
      expect(result.isMapped).toBe(false);
    });

    test('should use default for empty account name', () => {
      const result = mapAccount('');

      expect(result.mapped).toBe('Default');
      expect(result.isMapped).toBe(false);
    });

    test('should use default for whitespace-only account name', () => {
      const result = mapAccount('   ');

      expect(result.mapped).toBe('Default');
      expect(result.isMapped).toBe(false);
    });

    test('should be case-sensitive', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        mono: 'Monobank lowercase',
      });

      const result = mapAccount('Mono');

      expect(result.mapped).toBe('Mono');
      expect(result.isMapped).toBe(false);
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

    test('should reject category when not in allowed list', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      const result = validateCategory('UnknownCategory');

      expect(result.valid).toBe(false);
      expect(result.category).toBe('UnknownCategory');
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

    test('should reject empty category name', () => {
      const result = validateCategory('');

      expect(result.valid).toBe(false);
      expect(result.category).toBe('');
    });

    test('should reject whitespace-only category name', () => {
      const result = validateCategory('   ');

      expect(result.valid).toBe(false);
    });

    test('should be case-sensitive for category matching', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Food',
      ]);

      const resultLower = validateCategory('food');
      const resultUpper = validateCategory('FOOD');
      const resultExact = validateCategory('Food');

      expect(resultLower.valid).toBe(false);
      expect(resultUpper.valid).toBe(false);
      expect(resultExact.valid).toBe(true);
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
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      const result = mapTransaction('Mono', 'Побут');

      expect(result.account).toBe('Monobank');
      expect(result.category).toBe('Побут');
      expect(result.accountMapped).toBe(true);
      expect(result.categoryValid).toBe(true);
    });

    test('should handle partial mapping (account mapped, category not)', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      const result = mapTransaction('Mono', 'UnknownCategory');

      expect(result.account).toBe('Monobank');
      expect(result.category).toBe('UnknownCategory');
      expect(result.accountMapped).toBe(true);
      expect(result.categoryValid).toBe(false);
    });

    test('should handle no mapping (both not mapped)', () => {
      delete process.env.CASHEW_ACCOUNTS;
      delete process.env.CASHEW_CATEGORIES;

      const result = mapTransaction('CustomBank', 'CustomCategory');

      expect(result.account).toBe('CustomBank');
      expect(result.category).toBe('CustomCategory');
      expect(result.accountMapped).toBe(false);
      expect(result.categoryValid).toBe(true); // Any category valid when no config
    });

    test('should handle undefined account', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      const result = mapTransaction(undefined, 'Побут');

      expect(result.account).toBe('Default');
      expect(result.category).toBe('Побут');
    });

    test('should handle undefined category', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

      const result = mapTransaction('Mono', undefined);

      expect(result.account).toBe('Monobank');
      expect(result.category).toBe('');
      expect(result.categoryValid).toBe(false);
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
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Zebra: 'Zebra Bank',
        Apple: 'Apple Bank',
        Middle: 'Middle Bank',
      });

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
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

      expect(isValidAccount('Mono')).toBe(true);
    });

    test('should return false when account is not in config but config exists', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

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
