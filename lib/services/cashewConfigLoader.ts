/**
 * Cashew Configuration Loader
 * Loads CASHEW_ACCOUNTS (map) and CASHEW_CATEGORIES (array) from environment variables
 * Supports graceful fallback if configuration is missing
 */

import { ValidationError } from '../utils/errorHandler';

export interface CashewConfig {
  accounts: string[]; // Array of allowed account names (no mapping)
  categories: string[]; // Array of allowed category names (any language)
}

export interface ParsedCashewConfig {
  accounts: Record<string, string>;
  categories: string[];
}

/**
 * Parse JSON array of accounts or categories
 */
function parseJsonArray(jsonString: string | undefined, configName: string): string[] {
  if (!jsonString) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      console.warn(
        `[Cashew] ${configName} is not a valid JSON array, using empty config`
      );
      return [];
    }
    return parsed as string[];
  } catch (error) {
    console.warn(
      `[Cashew] Failed to parse ${configName}: ${error instanceof Error ? error.message : 'Unknown error'}, using empty config`
    );
    return [];
  }
}

/**
 * Load and parse Cashew configuration from environment variables
 * 
 * CASHEW_ACCOUNTS: JSON array of allowed account names (e.g., ["Mono", "Privat", "Ukrsib"])
 * CASHEW_CATEGORIES: JSON array of allowed category names (e.g., ["Їжа", "Транспорт"])
 * 
 * Falls back to empty config if variables are missing or invalid
 */
export function loadCashewConfig(): CashewConfig {
  const rawAccounts = process.env.CASHEW_ACCOUNTS;
  const rawCategories = process.env.CASHEW_CATEGORIES;

  const accountsArray = parseJsonArray(rawAccounts, 'CASHEW_ACCOUNTS');
  const categoriesArray = parseJsonArray(rawCategories, 'CASHEW_CATEGORIES');

  const debugLog = [];
  if (!rawAccounts) {
    debugLog.push('[Cashew] CASHEW_ACCOUNTS not configured, first category will be used as fallback');
  } else {
    debugLog.push(`[Cashew] Loaded ${accountsArray.length} allowed accounts: [${accountsArray.join(', ')}]`);
  }

  if (!rawCategories) {
    debugLog.push('[Cashew] CASHEW_CATEGORIES not configured, AI will return any language');
  } else {
    debugLog.push(`[Cashew] Loaded ${categoriesArray.length} allowed categories`);
  }

  if (debugLog.length > 0) {
    debugLog.forEach(msg => console.log(msg));
  }

  return {
    accounts: accountsArray,
    categories: categoriesArray,
  };
}

/**
 * Singleton instance of Cashew configuration
 */
let cashewConfig: CashewConfig | null = null;

/**
 * Get the singleton Cashew configuration instance
 */
export function getCashewConfig(): CashewConfig {
  if (!cashewConfig) {
    cashewConfig = loadCashewConfig();
  }
  return cashewConfig;
}

/**
 * Reset configuration (mainly for testing)
 */
export function resetCashewConfig(): void {
  cashewConfig = null;
}

/**
 * Get parsed configuration as plain objects (for debugging/logging)
 */
export function getParsedCashewConfig(): ParsedCashewConfig {
  const config = getCashewConfig();
  return {
    accounts: {}, // Not used anymore - accounts is now an array
    categories: config.categories,
  };
}

/**
 * Check if configuration is available (not empty)
 */
export function isCashewConfigured(): boolean {
  const config = getCashewConfig();
  return config.accounts.length > 0 || config.categories.length > 0;
}
