/**
 * Account and Category Mapper
 * Constrains an account / category to the values configured in
 * CASHEW_ACCOUNTS / CASHEW_CATEGORIES (case-insensitive, canonical casing kept).
 *
 * Fallback rule: a value that is missing or not in the configured list is
 * replaced by the FIRST configured item. With no configuration the value is
 * passed through unchanged.
 */

import { getCashewConfig, getSubcategoriesFor } from './cashewConfigLoader';

export interface MappingResult {
  account: string;
  category: string;
  /** '' when none was requested or the requested one does not belong to the category */
  subcategory: string;
  /** false when the requested account was missing/unknown and a fallback was used */
  accountMatched: boolean;
  /** false when the requested category was missing/unknown and a fallback was used */
  categoryMatched: boolean;
  /** false when a subcategory was requested but dropped (not under the chosen category) */
  subcategoryMatched: boolean;
}

function findIgnoreCase(list: readonly string[], value: string): string | undefined {
  const needle = value.trim().toLowerCase();
  return list.find((item) => item.toLowerCase() === needle);
}

export function mapAccount(accountName: string = ''): { account: string; matched: boolean } {
  const { accounts } = getCashewConfig();
  const requested = accountName.trim();

  if (accounts.length === 0) {
    return { account: requested || 'Default', matched: requested !== '' };
  }

  const hit = findIgnoreCase(accounts, requested);
  return hit
    ? { account: hit, matched: true }
    : { account: accounts[0], matched: false };
}

export function validateCategory(categoryName: string = ''): { category: string; matched: boolean } {
  const { categories } = getCashewConfig();
  const requested = categoryName.trim();

  if (categories.length === 0) {
    return { category: requested, matched: requested !== '' };
  }

  const hit = findIgnoreCase(categories, requested);
  return hit
    ? { category: hit, matched: true }
    : { category: categories[0], matched: false };
}

/**
 * A subcategory is only valid under the category it is configured for.
 * Unlike account/category there is no fallback: dropping it is harmless because
 * the transaction simply stays in the main category.
 * `category` must already be the constrained category name.
 */
export function validateSubcategory(
  category: string,
  subcategoryName: string = ''
): { subcategory: string; matched: boolean } {
  const requested = subcategoryName.trim().toLowerCase();
  if (!requested) {
    return { subcategory: '', matched: true }; // nothing requested, nothing dropped
  }

  const hit = getSubcategoriesFor(category).find((s) => s.toLowerCase() === requested);
  return hit ? { subcategory: hit, matched: true } : { subcategory: '', matched: false };
}

export function mapTransaction(
  accountName: string | undefined,
  categoryName: string | undefined,
  subcategoryName?: string
): MappingResult {
  const account = mapAccount(accountName);
  const category = validateCategory(categoryName);
  const subcategory = validateSubcategory(category.category, subcategoryName);

  return {
    account: account.account,
    category: category.category,
    subcategory: subcategory.subcategory,
    accountMatched: account.matched,
    categoryMatched: category.matched,
    subcategoryMatched: subcategory.matched,
  };
}
