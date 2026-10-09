/**
 * Tests for CashewConfigLoader
 */

import {
  loadCashewConfig,
  getCashewConfig,
  getSubcategoriesFor,
  getCategoryOptions,
  resetCashewConfig,
} from '../cashewConfigLoader';

describe('CashewConfigLoader', () => {
  // Save original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.CASHEW_SUBCATEGORIES;
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

  describe('CASHEW_SUBCATEGORIES', () => {
    let warnSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    });

    const configure = (categories: string[] | undefined, subcategories: unknown) => {
      if (categories) process.env.CASHEW_CATEGORIES = JSON.stringify(categories);
      else delete process.env.CASHEW_CATEGORIES;
      process.env.CASHEW_SUBCATEGORIES =
        typeof subcategories === 'string' ? subcategories : JSON.stringify(subcategories);
      resetCashewConfig();
      return loadCashewConfig();
    };

    test('is empty when not configured', () => {
      delete process.env.CASHEW_SUBCATEGORIES;

      expect(loadCashewConfig().subcategories).toEqual({});
    });

    test('loads an object of subcategory arrays', () => {
      const config = configure(['Авто', 'Транспорт'], { Авто: ['Паливо', 'Паркування'], Транспорт: ['Таксі'] });

      expect(config.subcategories).toEqual({ Авто: ['Паливо', 'Паркування'], Транспорт: ['Таксі'] });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('supports Unicode names with apostrophes and spaces', () => {
      const config = configure(["Здоров'я"], { "Здоров'я": ['Аптека', 'Лікарі'] });

      expect(config.subcategories["Здоров'я"]).toEqual(['Аптека', 'Лікарі']);
    });

    test('ignores invalid JSON with a warning', () => {
      expect(configure(['Авто'], '{broken').subcategories).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse CASHEW_SUBCATEGORIES'));
    });

    test.each([['an array', '["Паливо"]'], ['null', 'null'], ['a string', '"Паливо"']])(
      'ignores %s (must be an object) with a warning',
      (_label, raw) => {
        expect(configure(['Авто'], raw).subcategories).toEqual({});
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('must be a JSON object'));
      }
    );

    test('skips a category whose value is not an array', () => {
      const config = configure(['Авто', 'Транспорт'], { Авто: 'Паливо', Транспорт: ['Таксі'] });

      expect(config.subcategories).toEqual({ Транспорт: ['Таксі'] });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"Авто"] is not an array'));
    });

    test('ignores categories that are not in CASHEW_CATEGORIES', () => {
      const config = configure(['Авто'], { Авто: ['Паливо'], Невідома: ['X'] });

      expect(config.subcategories).toEqual({ Авто: ['Паливо'] });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"Невідома"] is not in CASHEW_CATEGORIES'));
    });

    test('keeps all categories when CASHEW_CATEGORIES is not configured', () => {
      expect(configure(undefined, { Авто: ['Паливо'] }).subcategories).toEqual({ Авто: ['Паливо'] });
    });

    test('drops non-string, empty and duplicate subcategory entries', () => {
      const config = configure(['Авто'], { Авто: ['Паливо', ' паливо ', '', 5, null, '  Паркування  '] });

      expect(config.subcategories.Авто).toEqual(['Паливо', 'Паркування']);
    });

    test('warns when a subcategory name is used under two categories', () => {
      configure(['Освіта', 'Подорожі'], { Освіта: ['Квитки'], Подорожі: ['Квитки'] });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"Квитки" is used under both'));
    });

    test('does not warn when the same name only appears at different levels', () => {
      // "Розваги" is both a top-level category and a subcategory of "Подорожі": allowed
      configure(['Розваги', 'Подорожі'], { Подорожі: ['Розваги'] });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    describe('getSubcategoriesFor', () => {
      test('returns the subcategories of a category, case-insensitively', () => {
        configure(['Авто'], { Авто: ['Паливо'] });

        expect(getSubcategoriesFor('Авто')).toEqual(['Паливо']);
        expect(getSubcategoriesFor(' авто ')).toEqual(['Паливо']);
      });

      test('returns an empty list for an unknown category', () => {
        configure(['Авто'], { Авто: ['Паливо'] });

        expect(getSubcategoriesFor('Інше')).toEqual([]);
      });
    });

    describe('getCategoryOptions', () => {
      test('lists categories in configured order with their subcategories', () => {
        configure(['Інше', 'Авто', 'Доходи'], { Авто: ['Паливо'] });

        expect(getCategoryOptions()).toEqual([
          { name: 'Інше', subcategories: [] },
          { name: 'Авто', subcategories: ['Паливо'] },
          { name: 'Доходи', subcategories: [] },
        ]);
      });

      test('is empty when no categories are configured', () => {
        configure(undefined, { Авто: ['Паливо'] });

        expect(getCategoryOptions()).toEqual([]);
      });
    });
  });
});
