/**
 * Transaction Intent Detector
 * Determines if a message is an actual transaction or just informational
 * Helps filter out pricing info, FAQ, general messages
 */

export interface IntentDetectionResult {
  isTransaction: boolean;
  confidence: number; // 0-1, higher = more confident it's a transaction
  reason: string;
}

export class TransactionIntentDetector {
  private debugLog: string[] = [];

  detect(text: string): IntentDetectionResult {
    this.debugLog = [];

    // Patterns that indicate IS-transaction (actual payment/purchase) - check first
    const transactionPatterns = [
      // Clear transaction keywords
      /(?:платіж|оплат|витр|покуп|замовлен|рахунок|рецепт|кас|чек|квитанція|транзаціі|отримання|вилучен|зняття|перекидн|поповнен|депозит|внески)/i,
      
      // Financial operations - but NOT if it's preceded by "комісія" or "збір" (fee context)
      /(?<!комісія\s)(?<!збір\s)(?:перевід|переводи|трансфер)(?!\s+2\.\d|за)/i,
      
      // Action words indicating transaction
      /(?:відправ.*на|відправ.*сум|прошу.*суму|надійш|надійшли|зараховано|знято|списано|повернено)/i,
    ];

    // Check for amounts early
    const amountPattern = /\d+(?:[.,]\d{1,2})?\s*(?:€|грн|uah|usd|eur|gbp|руб)/i;
    const hasAmount = amountPattern.test(text);

    // Check if message contains clear transaction indicators
    let transactionScore = 0;
    for (const pattern of transactionPatterns) {
      if (pattern.test(text)) {
        this.debugLog.push(`Matched transaction pattern: ${pattern.source}`);
        transactionScore++;
      }
    }

    if (hasAmount) {
      this.debugLog.push('Contains amount format');
      transactionScore++;
    }

    // Patterns that indicate NON-transaction (informational) messages
    // Only check if we don't have strong transaction signals
    if (transactionScore <= 1) {
      const nonTransactionPatterns = [
        // Pricing info / rates - key pattern for this use case
        /мінімальна\s+(?:вартість|сума|ціна|вартості).*?(?:€|грн|uah|usd|eur).*?(?:до|від|за|кг|км|на)/i,
        
        // Tariff/rate information
        /(?:тариф|розцінк|ставка)[\s\-:]/i,
        
        // FAQ with pricing
        /^(?:як|що|де|коли|чому)[\s\w]*[\?？]/i,
        
        // Rules, terms, regulations with amounts
        /(?:правил|умов|регламент|поліцій|положен)[\s\w]*?(?:€|грн|uah|usd|eur)/i,
        
        // Menu/price list structure
        /(?:меню|категорії|розділ|прайс|кошторис|список|тарифи)[\s\-:]/i,
        
        // Commission/fee announcements - includes "збір"
        /(?:комісія|збір).*?(?:€|грн|uah|usd|eur)/i,
        
        // Shipping/delivery rates without action words
        /(?:доставка|передач|вивіз|перевез).*?(?:від|до|за).*?(?:€|грн|uah|usd|eur)(?!.*(?:платіж|оплач|замовлен))/i,
      ];

      for (const pattern of nonTransactionPatterns) {
        if (pattern.test(text)) {
          this.debugLog.push(`Matched non-transaction pattern: ${pattern.source}`);
          return {
            isTransaction: false,
            confidence: 0.85,
            reason: 'Informational message (pricing, rates, FAQ)',
          };
        }
      }
    }

    // Decision logic
    if (transactionScore >= 2) {
      this.debugLog.push(`✓ Is transaction (score: ${transactionScore})`);
      return {
        isTransaction: true,
        confidence: Math.min(0.95, transactionScore / 3),
        reason: 'Matched transaction patterns and/or contains amount',
      };
    }

    if (transactionScore === 1 && hasAmount) {
      this.debugLog.push(`✓ Likely transaction (score: ${transactionScore}, has amount)`);
      return {
        isTransaction: true,
        confidence: 0.7,
        reason: 'Contains amount format',
      };
    }

    this.debugLog.push(`❌ Not a transaction (score: ${transactionScore})`);
    return {
      isTransaction: false,
      confidence: 0.6,
      reason: 'Does not match transaction patterns',
    };
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
