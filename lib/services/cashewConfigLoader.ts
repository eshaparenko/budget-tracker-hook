/**
 * Cashew Configuration Loader
 * Loads from environment variables:
 *   CASHEW_ACCOUNTS       JSON array of account names
 *   CASHEW_CATEGORIES     JSON array of category names
 *   CASHEW_SUBCATEGORIES  JSON object { "<category>": ["<subcategory>", ...] }
 * Supports graceful fallback if configuration is missing
 */

export interface CashewConfig {
  accounts: string[]; // Array of allowed account names (no mapping)
  categories: string[]; // Array of allowed category names (any language)
  subcategories: Record<string, string[]>; // Allowed subcategories per category
}

/** Shape handed to the AI layer: a category and the subcategories allowed under it */
export interface CategoryOptionConfig {
  name: string;
  subcategories: string[];
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
 * Parse CASHEW_SUBCATEGORIES: a JSON object mapping a category to its subcategories.
 * Invalid entries are skipped with a warning; the rest of the config keeps working.
 * Subcategory names should be unique across categories because Cashew resolves a
 * `subcategory` link parameter by name and takes the first match.
 */
function parseSubcategories(
  jsonString: string | undefined,
  categories: string[]
): Record<string, string[]> {
  if (!jsonString) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    console.warn(
      `[Cashew] Failed to parse CASHEW_SUBCATEGORIES: ${error instanceof Error ? error.message : 'Unknown error'}, ignoring subcategories`
    );
    return {};
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn('[Cashew] CASHEW_SUBCATEGORIES must be a JSON object {"category":["sub", ...]}, ignoring subcategories');
    return {};
  }

  const result: Record<string, string[]> = {};
  const ownerBySub = new Map<string, string>();

  for (const [category, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      console.warn(`[Cashew] CASHEW_SUBCATEGORIES["${category}"] is not an array, ignored`);
      continue;
    }
    if (
      categories.length > 0 &&
      !categories.some((c) => c.toLowerCase() === category.toLowerCase())
    ) {
      console.warn(`[Cashew] CASHEW_SUBCATEGORIES["${category}"] is not in CASHEW_CATEGORIES, ignored`);
      continue;
    }

    const subs: string[] = [];
    for (const item of value) {
      const name = typeof item === 'string' ? item.trim() : '';
      if (!name || subs.some((s) => s.toLowerCase() === name.toLowerCase())) {
        continue;
      }
      const owner = ownerBySub.get(name.toLowerCase());
      if (owner && owner !== category) {
        console.warn(
          `[Cashew] Subcategory "${name}" is used under both "${owner}" and "${category}"; Cashew resolves it by name and takes the first match`
        );
      } else {
        ownerBySub.set(name.toLowerCase(), category);
      }
      subs.push(name);
    }
    result[category] = subs;
  }

  return result;
}

/**
 * Load and parse Cashew configuration from environment variables
 * 
 * CASHEW_ACCOUNTS: JSON array of allowed account names (e.g., ["Mono", "Privat", "Ukrsib"])
 * CASHEW_CATEGORIES: JSON array of allowed category names (e.g., ["Їжа", "Транспорт"])
 * CASHEW_SUBCATEGORIES: JSON object of subcategories per category (e.g., {"Авто":["Паливо"]})
 * 
 * Falls back to empty config if variables are missing or invalid
 */
export function loadCashewConfig(): CashewConfig {
  const rawAccounts = process.env.CASHEW_ACCOUNTS;
  const rawCategories = process.env.CASHEW_CATEGORIES;

  const accountsArray = parseJsonArray(rawAccounts, 'CASHEW_ACCOUNTS');
  const categoriesArray = parseJsonArray(rawCategories, 'CASHEW_CATEGORIES');
  const subcategories = parseSubcategories(process.env.CASHEW_SUBCATEGORIES, categoriesArray);

  const debugLog = [];
  if (!rawAccounts) {
    debugLog.push('[Cashew] CASHEW_ACCOUNTS not configured, account names will be passed through as provided');
  } else {
    debugLog.push(`[Cashew] Loaded ${accountsArray.length} allowed accounts: [${accountsArray.join(', ')}]`);
  }

  if (!rawCategories) {
    debugLog.push('[Cashew] CASHEW_CATEGORIES not configured, categories will not be constrained');
  } else {
    debugLog.push(`[Cashew] Loaded ${categoriesArray.length} allowed categories`);
  }

  if (Object.keys(subcategories).length > 0) {
    const total = Object.values(subcategories).reduce((n, list) => n + list.length, 0);
    debugLog.push(`[Cashew] Loaded ${total} subcategories under ${Object.keys(subcategories).length} categories`);
  }

  if (debugLog.length > 0) {
    debugLog.forEach(msg => console.log(msg));
  }

  return {
    accounts: accountsArray,
    categories: categoriesArray,
    subcategories,
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
 * Subcategories configured for a category (case-insensitive), or [] if none
 */
export function getSubcategoriesFor(categoryName: string): string[] {
  const needle = categoryName.trim().toLowerCase();
  const { subcategories } = getCashewConfig();
  const key = Object.keys(subcategories).find((k) => k.toLowerCase() === needle);
  return key ? subcategories[key] : [];
}

/**
 * Categories with their subcategories, in configured order, for the AI prompt.
 * Empty when CASHEW_CATEGORIES is not configured (the AI then uses its default list).
 */
export function getCategoryOptions(): CategoryOptionConfig[] {
  return getCashewConfig().categories.map((name) => ({
    name,
    subcategories: getSubcategoriesFor(name),
  }));
}
