import {
  validateAndSanitize,
  validateAppName,
  validateTransactionBody,
  containsSuspiciousPatterns,
  validateCurrencyCode,
  validateAmount,
} from '../validation';

describe('Validation Utilities', () => {
  describe('validateAndSanitize', () => {
    it('should accept valid string', () => {
      const result = validateAndSanitize('Hello World');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized).toBe('Hello World');
    });

    it('should reject non-string input', () => {
      const result = validateAndSanitize(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Input must be a string');
    });

    it('should enforce min length', () => {
      const result = validateAndSanitize('', { minLength: 1 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 1'))).toBe(true);
    });

    it('should enforce max length', () => {
      const result = validateAndSanitize('a'.repeat(101), { maxLength: 100 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceed 100'))).toBe(true);
    });

    it('should remove null bytes', () => {
      const result = validateAndSanitize('Hello\x00World');
      expect(result.sanitized).toBe('Hello World');
    });

    it('should remove control characters', () => {
      const result = validateAndSanitize('Hello\x01\x02World');
      expect(result.sanitized).toBe('Hello World');
    });

    it('should normalize whitespace', () => {
      const result = validateAndSanitize('Hello   World\n\n  ');
      expect(result.sanitized).toBe('Hello World');
    });

    it('should handle newlines when allowed', () => {
      const result = validateAndSanitize('Line 1\nLine 2', { allowNewlines: true });
      expect(result.sanitized).toContain('Line 1');
      expect(result.sanitized).toContain('Line 2');
    });

    it('should reject pattern when provided', () => {
      const result = validateAndSanitize('invalid123', { pattern: /^[a-z]+$/ });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('pattern'))).toBe(true);
    });
  });

  describe('validateAppName', () => {
    it('should accept valid app names', () => {
      expect(validateAppName('Gmail').isValid).toBe(true);
      expect(validateAppName('Telegram').isValid).toBe(true);
      expect(validateAppName('app_name').isValid).toBe(true);
      expect(validateAppName('app-123').isValid).toBe(true);
    });

    it('should reject invalid characters', () => {
      const result = validateAppName('App@#$%');
      expect(result.isValid).toBe(false);
    });

    it('should reject too long names', () => {
      const result = validateAppName('a'.repeat(101));
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateTransactionBody', () => {
    it('should accept valid transaction text', () => {
      const result = validateTransactionBody('Payment 150 UAH to Starbucks');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty body', () => {
      const result = validateTransactionBody('');
      expect(result.isValid).toBe(false);
    });

    it('should reject very long body', () => {
      const result = validateTransactionBody('a'.repeat(10001));
      expect(result.isValid).toBe(false);
    });

    it('should preserve newlines in transaction body', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const result = validateTransactionBody(text);
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toContain('Line 1');
      expect(result.sanitized).toContain('Line 2');
    });
  });

  describe('containsSuspiciousPatterns', () => {
    it('should detect SQL injection patterns', () => {
      expect(containsSuspiciousPatterns("'; DROP TABLE users; --")).toBe(true);
      expect(containsSuspiciousPatterns("1' OR '1'='1")).toBe(true);
    });

    it('should detect XSS patterns', () => {
      expect(containsSuspiciousPatterns('<script>alert("xss")</script>')).toBe(true);
      expect(containsSuspiciousPatterns('javascript:alert(1)')).toBe(true);
      expect(containsSuspiciousPatterns('onload=alert(1)')).toBe(true);
    });

    it('should detect template injection', () => {
      expect(containsSuspiciousPatterns('${7*7}')).toBe(true);
      expect(containsSuspiciousPatterns('`${process.env.SECRET}`')).toBe(true);
    });

    it('should not flag legitimate text', () => {
      expect(containsSuspiciousPatterns('Payment 150 UAH to Starbucks')).toBe(false);
      expect(containsSuspiciousPatterns('Invoice #12345')).toBe(false);
    });
  });

  describe('validateCurrencyCode', () => {
    it('should accept valid currency codes', () => {
      expect(validateCurrencyCode('USD')).toBe(true);
      expect(validateCurrencyCode('EUR')).toBe(true);
      expect(validateCurrencyCode('UAH')).toBe(true);
      expect(validateCurrencyCode('GBP')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(validateCurrencyCode('US')).toBe(false);
      expect(validateCurrencyCode('USDA')).toBe(false);
      expect(validateCurrencyCode('us')).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should accept valid amounts', () => {
      expect(validateAmount(0)).toBe(true);
      expect(validateAmount(150)).toBe(true);
      expect(validateAmount(1500.99)).toBe(true);
      expect(validateAmount(999999999)).toBe(true);
    });

    it('should reject negative amounts', () => {
      expect(validateAmount(-100)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(validateAmount(NaN)).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(validateAmount(Infinity)).toBe(false);
    });

    it('should reject extremely large amounts', () => {
      expect(validateAmount(1000000000)).toBe(false);
    });
  });
});
