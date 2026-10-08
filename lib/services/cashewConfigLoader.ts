/**
 * Cashew Configuration Loader
 * Loads CASHEW_ACCOUNTS (map) and CASHEW_CATEGORIES (array) from environment variables
 * Supports graceful fallback if configuration is missing
 */

import { ValidationError } from '../utils/errorHandler';

export interface CashewConfig {
  accounts: Map<string, string>; // Internal name → Cashew account name
  categories: string[]; // Array of allowed category names (any language)
}

export interface ParsedCashewConfig {
  accounts: Record<string, string>;
  categories: string[];
}

/**
 * Parse JSON string to object with error handling
 */
function parseJsonConfig(jsonString: string | undefined, configName: string): Record<string, string> {
  if (!jsonString) {
    return {};
  }

  try {
    const parsed = JSON.parse(jsonString);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn(
        `[Cashew] ${configName} is not a valid JSON object, using empty config`
      );
      return {};
    }
    return parsed as Record<string, string>;
  } catch (error) {
    console.warn(
      `[Cashew] Failed to parse ${configName}: ${error instanceof Error ? error.message : 'Unknown error'}, using empty config`
    );
    return {};
  }
}

/**
 * Parse JSON array of categories
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
 * Falls back to empty config if variables are missing or invalid
 */
export function loadCashewConfig(): CashewConfig {
  const rawAccounts = process.env.CASHEW_ACCOUNTS;
  const rawCategories = process.env.CASHEW_CATEGORIES;

  const accountsRecord = parseJsonConfig(rawAccounts, 'CASHEW_ACCOUNTS');
  const categoriesArray = parseJsonArray(rawCategories, 'CASHEW_CATEGORIES');

  const debugLog = [];
  if (!rawAccounts) {
    debugLog.push('[Cashew] CASHEW_ACCOUNTS not configured, using passthrough mode');
  } else {
    debugLog.push(`[Cashew] Loaded ${Object.keys(accountsRecord).length} account mappings`);
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
    accounts: new Map(Object.entries(accountsRecord)),
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
    accounts: Object.fromEntries(config.accounts),
    categories: config.categories,
  };
}

/**
 * Check if configuration is available (not empty)
 */
export function isCashewConfigured(): boolean {
  const config = getCashewConfig();
  return config.accounts.size > 0 || config.categories.length > 0;
}
