/**
 * URL Encoder Utilities
 * Handles proper URL encoding for Cashew app-links
 * Supports Unicode characters (Cyrillic, Latin, emoji, etc.)
 */

/**
 * Encode a string for use in URL query parameters
 * Handles Unicode, special characters, and spaces
 */
export function encodeQueryParam(value: string): string {
  if (!value) {
    return '';
  }

  // Use standard encodeURIComponent for proper encoding
  // This handles:
  // - Unicode characters (Cyrillic, emoji, etc.)
  // - Special characters (&, #, =, ?, etc.)
  // - Spaces (as %20)
  return encodeURIComponent(value);
}

/**
 * Decode a URL-encoded query parameter
 */
export function decodeQueryParam(encoded: string): string {
  if (!encoded) {
    return '';
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    // If decoding fails, return the original
    return encoded;
  }
}

/**
 * Build a URL query string from an object
 * All values are properly encoded
 */
export function buildQueryString(params: Record<string, string | number | undefined>): string {
  const encoded = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeQueryParam(key)}=${encodeQueryParam(String(value))}`)
    .join('&');

  return encoded;
}

/**
 * Truncate string to maximum length, preserving word boundaries
 */
export function truncateString(value: string, maxLength: number = 500): string {
  if (!value || value.length <= maxLength) {
    return value;
  }

  // Truncate and try to break at word boundary
  const truncated = value.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    // If there's a space in the last 20%, use it
    return truncated.substring(0, lastSpace).trim() + '...';
  }

  // Otherwise just truncate
  return truncated.trim() + '...';
}

/**
 * Sanitize string for safe use in URLs and HTML attributes
 * Removes control characters and very long sequences
 */
export function sanitizeForUrl(value: string): string {
  if (!value) {
    return '';
  }

  // Remove control characters (ASCII 0-31, 127)
  let sanitized = value.replace(/[\x00-\x1F\x7F]/g, '');

  // Replace multiple spaces with single space
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  return sanitized;
}

/**
 * Escape HTML entities for safe rendering in HTML
 */
export function escapeHtml(value: string): string {
  if (!value) {
    return '';
  }

  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return value.replace(/[&<>"']/g, char => map[char] || char);
}

/**
 * Get safe filename from transaction title
 * Used for QR code alt text, file naming, etc.
 */
export function getSafeFilename(title: string, maxLength: number = 100): string {
  if (!title) {
    return 'transaction';
  }

  // Remove/replace unsafe filename characters
  let safe = title
    .replace(/[/\\:*?"<>|]/g, '-') // Replace unsafe chars
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/-+/g, '-') // Replace multiple dashes
    .toLowerCase();

  // Truncate
  if (safe.length > maxLength) {
    safe = safe.substring(0, maxLength);
  }

  return safe || 'transaction';
}

/**
 * Format currency code for URL (ensure uppercase)
 */
export function formatCurrencyCode(currency: string): string {
  if (!currency) {
    return '';
  }

  return currency.toUpperCase().substring(0, 3); // ISO 4217 is 3 chars max
}

/**
 * Format date for Cashew link (yyyy-MM-dd HH:mm:ss format)
 * Cashew accepts full datetime format, not just date
 * Reference: https://github.com/jameskokoska/Cashew/blob/5.2.3%2B328/budget/lib/struct/commonDateFormats.dart
 */
export function formatDateForCashew(date: Date | string): string {
  let dateObj: Date;

  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }

  if (isNaN(dateObj.getTime())) {
    // Invalid date, use today
    dateObj = new Date();
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');

  // Format: yyyy-MM-dd HH:mm:ss (supported by Cashew)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Validate and format amount for Cashew link
 * Ensures it's a positive number
 */
export function formatAmount(amount: number | string): string | null {
  let num: number;

  if (typeof amount === 'string') {
    num = parseFloat(amount);
  } else {
    num = amount;
  }

  if (isNaN(num) || num < 0) {
    return null;
  }

  // Return as string with 2 decimal places if needed
  return num.toString();
}
