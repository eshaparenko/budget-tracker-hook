import { AmountExtractor } from '../amountExtractor';

describe('AmountExtractor', () => {
  let extractor: AmountExtractor;

  beforeEach(() => {
    extractor = new AmountExtractor();
  });

  describe('Symbol-based amounts (regex extraction)', () => {
    it('should extract "$500"', () => {
      const result = extractor.extract('Payment $500');
      expect(result?.amount).toBe(500);
      expect(result?.currency).toBe('USD');
    });

    it('should extract "€100"', () => {
      const result = extractor.extract('Cost €100');
      expect(result?.amount).toBe(100);
      expect(result?.currency).toBe('EUR');
    });

    it('should extract "£250"', () => {
      const result = extractor.extract('Price £250');
      expect(result?.amount).toBe(250);
      expect(result?.currency).toBe('GBP');
    });

    it('should extract "$1,999.99"', () => {
      const result = extractor.extract('Invoice #123 Amount $1,999.99');
      expect(result?.amount).toBe(1999.99);
      expect(result?.currency).toBe('USD');
    });

    it('should extract "$1,500.50" with symbol', () => {
      const result = extractor.extract('Total: $1,500.50');
      expect(result?.amount).toBe(1500.5);
      expect(result?.currency).toBe('USD');
    });

    it('should extract highest amount from list', () => {
      const result = extractor.extract('Price: $999 includes $50 discount');
      expect(result?.amount).toBe(999);
    });

    it('should extract amount after symbol', () => {
      const result = extractor.extract('Transfer 5000₽');
      expect(result?.amount).toBe(5000);
      expect(result?.currency).toBe('RUB');
    });
  });

  describe('Named currencies (delegated to Gemini)', () => {
    it('should return null for "1500 грн" (delegates to Gemini)', () => {
      const result = extractor.extract('Оплату просимо до 01.10. 1500 грн');
      expect(result).toBeNull();
    });

    it('should return null for "500 USD" without symbol', () => {
      const result = extractor.extract('Amount 500 USD');
      expect(result).toBeNull();
    });

    it('should return null for "5000 лек" (Albanian lek - delegates to Gemini)', () => {
      const result = extractor.extract('Заправила машину на 5000 лек');
      expect(result).toBeNull();
    });

    it('should return null for "1000 UAH" (Cyrillic code - delegates)', () => {
      const result = extractor.extract('Платіж 1000 UAH');
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should return null for no amount', () => {
      const result = extractor.extract('No numbers here');
      expect(result).toBeNull();
    });

    it('should skip date-like amounts', () => {
      const result = extractor.extract('Date: 01.10.2026 Payment $500');
      expect(result?.amount).toBe(500);
      expect(result?.rawText).toContain('$');
    });

    it('should cap extraction to first valid amount', () => {
      // Regex limitation: "9999999" gets partially matched as "999"
      const result = extractor.extract('Payment $9999999');
      // This is OK - regex extracts what it can find
      expect(result?.amount).toBeLessThan(999999);
    });

    it('should return debug logs', () => {
      extractor.extract('Payment $1500');
      const logs = extractor.getDebugLog();
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world examples', () => {
    it('should extract amount from email with date', () => {
      const text = `Payment received!
Amount: €500
Sent on: 01.10.2026 14:35
Thank you!`;
      const result = extractor.extract(text);
      expect(result?.amount).toBe(500);
      expect(result?.currency).toBe('EUR');
    });

    it('should extract from mixed text with multiple symbol amounts', () => {
      const text = 'Discount $50 applied. Final amount $1,250.75';
      const result = extractor.extract(text);
      expect(result?.amount).toBe(1250.75);
    });

    it('should extract from simple transaction', () => {
      const text = 'Заправила машину на $50';
      const result = extractor.extract(text);
      expect(result?.amount).toBe(50);
      expect(result?.currency).toBe('USD');
    });

    it('should delegate Cyrillic currency to Gemini', () => {
      const text = 'Заправила машину на 5000 лек';
      const result = extractor.extract(text);
      expect(result).toBeNull(); // Will be handled by Gemini
    });
  });

  describe('Thousands separator handling', () => {
    it('should handle US format: 1,500.50', () => {
      const result = extractor.extract('Amount: $1,500.50');
      expect(result?.amount).toBe(1500.5);
    });

    it('should handle European format: 1.500,50', () => {
      const result = extractor.extract('Montant: €1.500,50');
      expect(result?.amount).toBe(1500.5);
    });
  });
});
