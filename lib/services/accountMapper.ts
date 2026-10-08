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
 * If account is in CASHEW_ACCOUNTS array, use it directly
 * If not in array or empty, use first account from array as default
 * If no accounts configured, use account name as-is (passthrough)
 */
export function mapAccount(accountName: string): { mapped: string; isMapped: boolean } {
  const config = getCashewConfig();

  // If no accounts configured, use passthrough mode
  if (config.accounts.length === 0) {
    // Return provided name or 'Default'
    return { mapped: accountName || 'Default', isMapped: false };
  }

  // If no account name provided, use first account from array
  if (!accountName || accountName.trim() === '') {
    return { mapped: config.accounts[0], isMapped: true };
  }

  // Check if provided account name is in the allowed list
  if (config.accounts.includes(accountName)) {
    return { mapped: accountName, isMapped: false };
  }

  // Account not in allowed list - use first account as fallback
  return { mapped: config.accounts[0], isMapped: true };
}

/**
 * Validate and constrain category against allowed list
 * If category is not in CASHEW_CATEGORIES, use the first item (default)
 * If no CASHEW_CATEGORIES configured, return AI's category as-is
 */
export function validateCategory(categoryName: string): { valid: boolean; category: string } {
  if (!categoryName || categoryName.trim() === '') {
    const config = getCashewConfig();
    // If empty, use first category as default, or empty if no config
    const defaultCategory = config.categories.length > 0 ? config.categories[0] : '';
    return { valid: config.categories.length > 0, category: defaultCategory };
  }

  const config = getCashewConfig();

  // If no categories configured, accept any category in any language (AI determines)
  if (config.categories.length === 0) {
    return { valid: true, category: categoryName };
  }

  // If categories configured, check if AI's category is in the list
  const isValid = config.categories.includes(categoryName);
  
  // If valid, use it. If not valid, use first category as default
  if (isValid) {
    return { valid: true, category: categoryName };
  } else {
    // Category not in allowed list - use first category as default
    return { valid: false, category: config.categories[0] };
  }
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
  return [...config.accounts].sort();
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
 * If no accounts configured, any account is valid (passthrough)
 * If accounts configured, check if account is in the allowed list
 */
export function isValidAccount(accountName: string): boolean {
  if (!accountName || accountName.trim() === '') {
    return false;
  }

  const config = getCashewConfig();
  // Valid if in the allowed list OR if no accounts configured (passthrough mode)
  return config.accounts.length === 0 || config.accounts.includes(accountName);
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
