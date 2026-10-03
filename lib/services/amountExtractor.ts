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

    // Patterns for different currency formats
    const patterns = [
      // Ukrainian/Russian: "1500 грн", "500 UAH", "1000 uah"
      /(\d+(?:[.,]\d{1,2})?)\s*(грн|грнс|uah|usd|eur|gbp|uah|руб)/gi,
      // English: "$500", "€1000"
      /[$€£₽]\s*(\d+(?:[.,]\d{1,2})?)/g,
      // Spaced: "1500 $", "500 USD"
      /(\d+(?:[.,]\d{1,2})?)\s*[$€£₽usd|eur|gbp]/gi,
      // Just numbers (fallback for standalone amounts)
      /(\d+(?:[.,]\d{1,2})?)\s*(?:грн|грнс|uah|usd|eur|gbp|руб)?(?:\s|$)/gi,
    ];

    let highestAmount: ExtractedAmount | null = null;

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const amountStr = match[1] || match[0];
        const currencyPart = match[2] || this.extractCurrency(match[0]);
        
        const amount = parseFloat(amountStr.replace(',', '.'));
        
        if (amount > 0 && amount < 999999) { // Reasonable transaction limits
          this.debugLog.push(
            `Found amount: ${amount} ${currencyPart} from "${match[0].trim()}"`
          );
          
          // Keep the highest amount (usually the transaction amount, not a date)
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
      this.debugLog.push('No amount found');
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
