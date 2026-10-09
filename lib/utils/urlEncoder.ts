/**
 * URL Encoder Utilities
 * Helpers for building Cashew app-links.
 * Supports Unicode characters (Cyrillic, Latin, emoji, etc.)
 */

/**
 * Encode a string for use as a URL query parameter value.
 * Handles Unicode, special characters (&, #, =, ?) and spaces (as %20).
 */
export function encodeQueryParam(value: string): string {
  if (!value) {
    return '';
  }
  return encodeURIComponent(value);
}

/**
 * Build a URL query string from an object.
 * Parameter names are plain identifiers and are left as-is; values are encoded.
 * Empty values are omitted.
 */
export function buildQueryString(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeQueryParam(String(value))}`)
    .join('&');
}

/**
 * Truncate string to maximum length, preserving word boundaries
 */
export function truncateString(value: string, maxLength: number = 500): string {
  if (!value || value.length <= maxLength) {
    return value;
  }

  const truncated = value.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  // If there's a space in the last 20%, break there
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace).trim() + '...';
  }

  return truncated.trim() + '...';
}

/**
 * Remove control characters and collapse whitespace
 */
export function sanitizeForUrl(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/[\x00-\x1F\x7F]/g, '') // control characters (includes null bytes)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate an amount for a Cashew link.
 * Returns the amount as a string, or null if it is not a non-negative number.
 */
export function formatAmount(amount: number | string): string | null {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num) || num < 0) {
    return null;
  }

  return num.toString();
}
