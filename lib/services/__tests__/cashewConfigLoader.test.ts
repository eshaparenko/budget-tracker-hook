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

      expect(config.accounts.size).toBe(0);
      expect(config.categories.length).toBe(0);
    });

    test('should load CASHEW_ACCOUNTS configuration', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
        Ukrsib: 'UkrSibbank',
      });
      delete process.env.CASHEW_CATEGORIES;

      const config = loadCashewConfig();

      expect(config.accounts.size).toBe(2);
      expect(config.accounts.get('Mono')).toBe('Monobank');
      expect(config.accounts.get('Ukrsib')).toBe('UkrSibbank');
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
      expect(config.accounts.size).toBe(0);
    });

    test('should load both CASHEW_ACCOUNTS and CASHEW_CATEGORIES', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
        Privat: 'PrivatBank',
      });
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const config = loadCashewConfig();

      expect(config.accounts.size).toBe(2);
      expect(config.categories.length).toBe(2);
      expect(config.accounts.get('Mono')).toBe('Monobank');
      expect(config.categories).toContain('Побут');
    });

    test('should handle invalid JSON gracefully for accounts', () => {
      process.env.CASHEW_ACCOUNTS = 'not valid json';
      delete process.env.CASHEW_CATEGORIES;

      const config = loadCashewConfig();

      expect(config.accounts.size).toBe(0);
      expect(config.categories.length).toBe(0);
    });

    test('should handle invalid JSON gracefully for categories', () => {
      delete process.env.CASHEW_ACCOUNTS;
      process.env.CASHEW_CATEGORIES = '{broken json]';

      const config = loadCashewConfig();

      expect(config.accounts.size).toBe(0);
      expect(config.categories.length).toBe(0);
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

      expect(config.accounts.size).toBe(0);
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

    test('should handle Unicode categories', () => {
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        '🍕 Food',
        'Продукты',
        '日本食',
      ]);

      const config = loadCashewConfig();

      expect(config.categories).toContain('🍕 Food');
      expect(config.categories).toContain('Продукты');
      expect(config.categories).toContain('日本食');
    });

    test('should handle large category arrays', () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => `Category${i}`);
      process.env.CASHEW_CATEGORIES = JSON.stringify(largeArray);

      const config = loadCashewConfig();

      expect(config.categories.length).toBe(100);
      expect(config.categories).toContain('Category0');
      expect(config.categories).toContain('Category99');
    });
  });

  describe('getCashewConfig', () => {
    test('should return singleton instance', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

      const config1 = getCashewConfig();
      const config2 = getCashewConfig();

      expect(config1).toBe(config2);
    });

    test('should cache config on first call', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

      const config = getCashewConfig();
      expect(config.accounts.size).toBe(1);

      // Change env (should not affect cached config)
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Privat: 'PrivatBank',
        Ukrsib: 'UkrSibbank',
      });

      const config2 = getCashewConfig();
      expect(config2.accounts.size).toBe(1); // Still 1, cached
      expect(config2).toBe(config);
    });
  });

  describe('resetCashewConfig', () => {
    test('should reset singleton for testing', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });

      let config = getCashewConfig();
      expect(config.accounts.size).toBe(1);

      resetCashewConfig();

      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Privat: 'PrivatBank',
      });

      config = getCashewConfig();
      expect(config.accounts.size).toBe(1);
      expect(config.accounts.get('Privat')).toBe('PrivatBank');
    });
  });

  describe('getParsedCashewConfig', () => {
    test('should return configuration as plain objects', () => {
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
        'Розваги',
      ]);

      const parsed = getParsedCashewConfig();

      expect(parsed.accounts).toEqual({
        Mono: 'Monobank',
      });
      expect(parsed.categories).toEqual([
        'Побут',
        'Розваги',
      ]);
    });

    test('should return empty objects when no config', () => {
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
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });
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
      process.env.CASHEW_ACCOUNTS = JSON.stringify({
        Mono: 'Monobank',
      });
      process.env.CASHEW_CATEGORIES = JSON.stringify([
        'Побут',
      ]);

      expect(isCashewConfigured()).toBe(true);
    });
  });
});
