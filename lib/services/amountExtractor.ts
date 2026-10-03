/**
 * Amount Extractor
 * Pre-processes text to extract amounts before Gemini analysis
 * Handles various formats: "1500 грн", "$500", "500 UAH", etc.
 */

export interface ExtractedAmount {
  amount: number;
  currency: string;
  rawText: string;
}

export class AmountExtractor {
  private debugLog: string[] = [];

  extract(text: string): ExtractedAmount | null {
    this.debugLog = [];

    // Patterns for different currency formats (in priority order)
    const patterns = [
      // Main pattern: "1500 грн", "1,500.50 грн", "500 UAH", etc
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(грн|грнс|uah|usd|eur|gbp|руб)/gi,
      // With symbols: "$500", "$1,500.50", "€1000", "£100"
      /[$€£₽]\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g,
      // Amount after symbol: "500$", "1,500.50$", "1000€"
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*[$€£₽]/g,
    ];

    let highestAmount: ExtractedAmount | null = null;

    for (const pattern of patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const amountStr = match[1];
        let currencyPart = match[2] || this.extractCurrency(match[0]);
        
        if (!amountStr) continue;
        
        // Remove thousands separators and normalize decimal separator to dot
        const normalizedAmount = amountStr
          .replace(/(\d),(\d{3})/g, '$1$2') // "1,500" -> "1500"
          .replace(/(\d)\.(\d{3})/g, '$1$2') // "1.500" -> "1500" (European format)
          .replace(',', '.'); // Normalize comma to dot for decimal
        
        const amount = parseFloat(normalizedAmount);
        
        // Exclude dates like "01.10" (day.month pattern)
        if (amount > 0 && amount < 999999 && amount !== Math.floor(amount) && amount < 32) {
          this.debugLog.push(`Skipping date-like value: ${amount}`);
          continue;
        }
        
        if (amount > 0 && amount < 999999) {
          this.debugLog.push(
            `Found amount: ${amount} ${currencyPart} from "${match[0].trim()}"`
          );
          
          // Keep the highest amount (usually the transaction amount)
          if (!highestAmount || amount > highestAmount.amount) {
            highestAmount = {
              amount,
              currency: this.normalizeCurrency(currencyPart),
              rawText: match[0].trim(),
            };
          }
        }
      }
    }

    if (highestAmount) {
      this.debugLog.push(
        `✓ Selected amount: ${highestAmount.amount} ${highestAmount.currency}`
      );
    } else {
      this.debugLog.push('❌ No amount found');
    }

    return highestAmount;
  }

  private extractCurrency(text: string): string {
    const currencyPatterns: Record<string, string> = {
      грн: 'UAH',
      грнс: 'UAH',
      uah: 'UAH',
      usd: 'USD',
      eur: 'EUR',
      gbp: 'GBP',
      руб: 'RUB',
      '$': 'USD',
      '€': 'EUR',
      '£': 'GBP',
      '₽': 'RUB',
    };

    for (const [pattern, currency] of Object.entries(currencyPatterns)) {
      if (text.toLowerCase().includes(pattern)) {
        return currency;
      }
    }

    return 'UAH'; // Default for Ukrainian context
  }

  private normalizeCurrency(currency: string): string {
    const normalized: Record<string, string> = {
      грн: 'UAH',
      грнс: 'UAH',
      uah: 'UAH',
      usd: 'USD',
      eur: 'EUR',
      gbp: 'GBP',
      руб: 'RUB',
    };

    return normalized[currency.toLowerCase()] || currency.toUpperCase();
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
