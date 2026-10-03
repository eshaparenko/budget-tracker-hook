/**
 * Input Validation and Security Sanitization
 * Prevents injection attacks, XSS, and validates input constraints
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: string;
}

/**
 * Validates and sanitizes string input for security
 */
export function validateAndSanitize(
  input: string,
  options: {
    maxLength?: number;
    minLength?: number;
    allowNewlines?: boolean;
    pattern?: RegExp;
  } = {}
): ValidationResult {
  const errors: string[] = [];
  const {
    maxLength = 10000,
    minLength = 1,
    allowNewlines = true,
    pattern = null,
  } = options;

  // Check if input is string
  if (typeof input !== 'string') {
    errors.push('Input must be a string');
    return { isValid: false, errors };
  }

  const trimmed = input.trim();

  // Check length constraints
  if (trimmed.length < minLength) {
    errors.push(`Input must be at least ${minLength} character(s)`);
  }

  if (trimmed.length > maxLength) {
    errors.push(`Input must not exceed ${maxLength} character(s)`);
  }

  // Check pattern if provided
  if (pattern && !pattern.test(trimmed)) {
    errors.push(`Input does not match required pattern`);
  }

  // Sanitize the input
  let sanitized = trimmed;

  // Remove null bytes (null injection) - replace with space to preserve word separation
  sanitized = sanitized.replace(/\x00/g, ' ');

  // Remove control characters except newlines and tabs
  if (!allowNewlines) {
    sanitized = sanitized.replace(/[\r\n\t]/g, ' ');
  } else {
    // Remove other control characters but keep newlines/tabs
    sanitized = sanitized.replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ' ');
  }

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (errors.length > 0) {
    return { isValid: false, errors, sanitized };
  }

  return { isValid: true, errors: [], sanitized };
}

/**
 * Validates app/source name
 */
export function validateAppName(appName: string): ValidationResult {
  return validateAndSanitize(appName, {
    minLength: 1,
    maxLength: 100,
    allowNewlines: false,
    pattern: /^[a-zA-Z0-9_\-\.]+$/,
  });
}

/**
 * Validates transaction body text
 */
export function validateTransactionBody(body: string): ValidationResult {
  return validateAndSanitize(body, {
    minLength: 1,
    maxLength: 10000,
    allowNewlines: true,
  });
}

/**
 * Sanitizes text for safe display/logging
 */
export function sanitizeForDisplay(text: string, maxLength: number = 100): string {
  return text
    .replace(/[\r\n]/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Normalize spaces
    .substring(0, maxLength)
    .trim();
}

/**
 * Checks if string looks like it could be dangerous (SQL injection, script injection, etc.)
 */
export function containsSuspiciousPatterns(text: string): boolean {
  const suspiciousPatterns = [
    /('|(--)|;|\/\*|\*\/)/i, // SQL injection patterns
    /(<script|javascript:|on\w+\s*=)/i, // XSS patterns
    /(\$\{|`)/i, // Template injection patterns
    /(%27|%2D%2D|%3B)/i, // URL encoded SQL injection
  ];

  return suspiciousPatterns.some(pattern => pattern.test(text));
}

/**
 * Environment variable validation
 */
export function validateEnvironmentVariables(requiredVars: string[]): ValidationResult {
  const errors: string[] = [];
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
      errors.push(`Missing environment variable: ${varName}`);
    }
  }

  return {
    isValid: missing.length === 0,
    errors,
  };
}

/**
 * Validates currency code format (3 letter ISO 4217)
 */
export function validateCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/**
 * Validates amount is a reasonable number
 */
export function validateAmount(amount: number): boolean {
  return (
    typeof amount === 'number' &&
    !isNaN(amount) &&
    isFinite(amount) &&
    amount >= 0 &&
    amount <= 999999999 // Max ~1 billion
  );
}
