/**
 * Account and Category Mapper
 * Maps transaction accounts to Cashew app format
 * Validates categories against allowed list (if configured)
 */

import { getCashewConfig } from './cashewConfigLoader';

export interface MappingResult {
  account: string;
  category: string;
  accountMapped: boolean; // true if found in config, false if passthrough
  categoryValid: boolean; // true if in allowed list or no config
}

/**
 * Map account name using Cashew configuration
 * Falls back to original name if not in config (passthrough)
 */
export function mapAccount(accountName: string): { mapped: string; isMapped: boolean } {
  if (!accountName || accountName.trim() === '') {
    return { mapped: 'Default', isMapped: false };
  }

  const config = getCashewConfig();
  const mapped = config.accounts.get(accountName);

  if (mapped) {
    return { mapped, isMapped: true };
  }

  // Passthrough: return original name
  return { mapped: accountName, isMapped: false };
}

/**
 * Validate category against allowed list
 * If no CASHEW_CATEGORIES configured, any category is valid (AI determines language)
 */
export function validateCategory(categoryName: string): { valid: boolean; category: string } {
  if (!categoryName || categoryName.trim() === '') {
    return { valid: false, category: '' };
  }

  const config = getCashewConfig();

  // If no categories configured, accept any category in any language
  if (config.categories.length === 0) {
    return { valid: true, category: categoryName };
  }

  // If categories configured, validate against the list
  const isValid = config.categories.includes(categoryName);
  return { valid: isValid, category: categoryName };
}

/**
 * Map account and validate category for a transaction
 */
export function mapTransaction(
  accountName: string | undefined,
  categoryName: string | undefined
): MappingResult {
  const account = mapAccount(accountName || '');
  const category = validateCategory(categoryName || '');

  return {
    account: account.mapped,
    category: category.category,
    accountMapped: account.isMapped,
    categoryValid: category.valid,
  };
}

/**
 * Get available accounts from configuration
 */
export function getAvailableAccounts(): string[] {
  const config = getCashewConfig();
  return Array.from(config.accounts.keys()).sort();
}

/**
 * Get allowed categories from configuration
 */
export function getAllowedCategories(): string[] {
  const config = getCashewConfig();
  return [...config.categories].sort();
}

/**
 * Validate if account exists in configuration
 * Returns true even for passthrough (no config) case
 */
export function isValidAccount(accountName: string): boolean {
  if (!accountName || accountName.trim() === '') {
    return false;
  }

  const config = getCashewConfig();
  // Valid if in config OR if no config exists (passthrough mode)
  return config.accounts.size === 0 || config.accounts.has(accountName);
}

/**
 * Validate if category is in allowed list
 * If no CASHEW_CATEGORIES configured, any non-empty category is valid
 */
export function isValidCategory(categoryName: string): boolean {
  if (!categoryName || categoryName.trim() === '') {
    return false;
  }

  const config = getCashewConfig();
  
  // If no categories configured, any category is valid (AI in any language)
  if (config.categories.length === 0) {
    return true;
  }

  // If categories configured, check against list
  return config.categories.includes(categoryName);
}
