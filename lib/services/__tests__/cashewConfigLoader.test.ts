/**
 * Tests for CashewConfigLoader
 */

import {
  loadCashewConfig,
  getCashewConfig,
  resetCashewConfig,
  getParsedCashewConfig,
  isCashewConfigured,
} from '../cashewConfigLoader';

describe('CashewConfigLoader', () => {
  // Save original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Reset singleton
    resetCashewConfig();
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
    resetCashewConfig();
  });

  describe('loadCashewConfig', () => {
    test('should load empty config when no env variables are set', () => {
      delete process.env.CASHEW_ACCOUNTS;
      delete process.env.CASHEW_CATEGORIES;

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(0);
      expect(config.categories.length).toBe(0);
    });

    test('should load CASHEW_ACCOUNTS as array of account names', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat', 'Ukrsib']);
      delete process.env.CASHEW_CATEGORIES;

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(3);
      expect(config.accounts).toContain('Mono');
      expect(config.accounts).toContain('Privat');
      expect(config.accounts).toContain('Ukrsib');
      expect(config.categories.length).toBe(0);
    });

    test('should load CASHEW_CATEGORIES as array', () => {
      delete process.env.CASHEW_ACCOUNTS;
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Покупки',
        'Розваги',
      ]);

      const config = loadCashewConfig();

      expect(config.categories.length).toBe(3);
      expect(config.categories).toContain('Побут');
      expect(config.categories).toContain('Покупки');
      expect(config.categories).toContain('Розваги');
      expect(config.accounts.length).toBe(0);
    });

    test('should load both CASHEW_ACCOUNTS and CASHEW_CATEGORIES', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(2);
      expect(config.categories.length).toBe(2);
      expect(config.accounts).toContain('Mono');
      expect(config.categories).toContain('Побут');
    });

    test('should handle invalid JSON gracefully for accounts', () => {
      process.env.CASHEW_ACCOUNTS = 'not valid json';
      delete process.env.CASHEW_CATEGORIES;

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(0);
      expect(config.categories.length).toBe(0);
    });

    test('should handle invalid JSON gracefully for categories', () => {
      delete process.env.CASHEW_ACCOUNTS;
      process.env.CASHEW_CATEGORIES = '{broken json]';

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(0);
      expect(config.categories.length).toBe(0);
    });

    test('should handle non-array JSON for accounts gracefully', () => {
      process.env.CASHEW_ACCOUNTS = '{"key":"value"}'; // Object instead of array

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(0);
    });

    test('should handle non-array JSON for categories gracefully', () => {
      delete process.env.CASHEW_ACCOUNTS;
      process.env.CASHEW_CATEGORIES = '{"key":"value"}'; // Object instead of array

      const config = loadCashewConfig();

      expect(config.categories.length).toBe(0);
    });

    test('should handle null value in JSON gracefully', () => {
      process.env.CASHEW_ACCOUNTS = 'null';
      process.env.CASHEW_CATEGORIES = 'null';

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(0);
      expect(config.categories.length).toBe(0);
    });

    test('should preserve category strings exactly as provided', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'My Category',
        'UPPERCASE CATEGORY',
        'lowercase_category',
      ]);

      const config = loadCashewConfig();

      expect(config.categories).toContain('My Category');
      expect(config.categories).toContain('UPPERCASE CATEGORY');
      expect(config.categories).toContain('lowercase_category');
    });

    test('should handle Unicode accounts and categories', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Монобанк', 'УкрСиб', '日本銀行']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        '🍕 Food',
        'Продукты',
        '日本食',
      ]);

      const config = loadCashewConfig();

      expect(config.accounts).toContain('Монобанк');
      expect(config.accounts).toContain('УкрСиб');
      expect(config.categories).toContain('🍕 Food');
      expect(config.categories).toContain('Продукты');
      expect(config.categories).toContain('日本食');
    });

    test('should handle large arrays', () => {
      const largeAccounts = Array.from({ length: 50 }, (_, i) => `Account${i}`);
      const largeCategories = Array.from({ length: 50 }, (_, i) => `Category${i}`);
      process.env.CASHEW_ACCOUNTS = JSON.stringify(largeAccounts);
      process.env.CASHEW_CATEGORIES = JSON.stringify(largeCategories);

      const config = loadCashewConfig();

      expect(config.accounts.length).toBe(50);
      expect(config.categories.length).toBe(50);
      expect(config.accounts).toContain('Account0');
      expect(config.accounts).toContain('Account49');
      expect(config.categories).toContain('Category0');
      expect(config.categories).toContain('Category49');
    });
  });

  describe('getCashewConfig', () => {
    test('should return singleton instance', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);

      const config1 = getCashewConfig();
      const config2 = getCashewConfig();

      expect(config1).toBe(config2);
    });

    test('should cache config on first call', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);

      const config = getCashewConfig();
      expect(config.accounts.length).toBe(1);

      // Change env (should not affect cached config)
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Privat', 'Ukrsib']);

      const config2 = getCashewConfig();
      expect(config2.accounts.length).toBe(1); // Still 1, cached
      expect(config2).toBe(config);
    });
  });

  describe('resetCashewConfig', () => {
    test('should reset singleton for testing', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);

      let config = getCashewConfig();
      expect(config.accounts.length).toBe(1);

      resetCashewConfig();

      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Privat']);

      config = getCashewConfig();
      expect(config.accounts.length).toBe(1);
      expect(config.accounts).toContain('Privat');
    });
  });

  describe('getParsedCashewConfig', () => {
    test('should return configuration as plain objects', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono', 'Privat']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const parsed = getParsedCashewConfig();

      expect(parsed.categories).toEqual([
        'Побут',
        'Розваги',
      ]);
    });

    test('should return empty when no config', () => {
      delete process.env.CASHEW_ACCOUNTS;
      delete process.env.CASHEW_CATEGORIES;

      const parsed = getParsedCashewConfig();

      expect(parsed.accounts).toEqual({});
      expect(parsed.categories).toEqual([]);
    });
  });

  describe('isCashewConfigured', () => {
    test('should return false when no configuration', () => {
      delete process.env.CASHEW_ACCOUNTS;
      delete process.env.CASHEW_CATEGORIES;

      expect(isCashewConfigured()).toBe(false);
    });

    test('should return true when CASHEW_ACCOUNTS is configured', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);
      delete process.env.CASHEW_CATEGORIES;

      expect(isCashewConfigured()).toBe(true);
    });

    test('should return true when CASHEW_CATEGORIES is configured', () => {
      delete process.env.CASHEW_ACCOUNTS;
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      expect(isCashewConfigured()).toBe(true);
    });

    test('should return true when both are configured', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify(['Mono']);
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      expect(isCashewConfigured()).toBe(true);
    });
  });
});
