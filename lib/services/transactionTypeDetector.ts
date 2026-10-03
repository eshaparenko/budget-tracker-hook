/**
 * Transaction Type Detector
 * Detects transaction type and extracts details from text patterns
 */

export enum TransactionType {
  PAYMENT = 'Payment', // платіж, оплата, oplata
  TRANSFER = 'Transfer', // перекинь, transfer, відправ
  REFUND = 'Refund', // повернення, refund
  WITHDRAWAL = 'Withdrawal', // зняття, withdrawal
  DEPOSIT = 'Deposit', // поповнення, deposit
  UNKNOWN = 'Other',
}

export interface DetectionResult {
  transactionType: string;
  details: string;
}

const TRANSACTION_TYPE_PATTERNS: Record<TransactionType, RegExp[]> = {
  [TransactionType.PAYMENT]: [
    /платіж/i,
    /оплата/i,
    /oplata/i,
    /payment/i,
    /purchase/i,
    /charge/i,
  ],
  [TransactionType.TRANSFER]: [
    /перекинь/i,
    /перевод/i,
    /transfer/i,
    /відправ/i,
    /sent/i,
    /переводе/i,
  ],
  [TransactionType.REFUND]: [
    /повернення/i,
    /refund/i,
    /повертання/i,
    /возврат/i,
  ],
  [TransactionType.WITHDRAWAL]: [
    /зняття/i,
    /withdrawal/i,
    /withdraw/i,
    /снятие/i,
  ],
  [TransactionType.DEPOSIT]: [
    /поповнення/i,
    /deposit/i,
    /поступ/i,
    /зачисл/i,
  ],
  [TransactionType.UNKNOWN]: [],
};

// Patterns to extract additional details
const DETAIL_PATTERNS = {
  cardNumber: /(?:card|карт|кард)?\s*(?:number|номер|no\.?)?\s*[:#]?\s*(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|\*+\d{4})/i,
  reference: /(?:ref|reference|ref\.|рефер|проводка|квитанция)\s*[:#]?\s*([A-Z0-9]{6,}|[0-9]{6,})/i,
  description: /(?:desc|description|описание|опис)\s*[:#]?\s*([^\n,;]+)/i,
  recipientCard: /(?:to|recipient|одержувач|счет|рахунок)\s*[:#]?\s*(\*+\d{4}|\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})/i,
};

export class TransactionTypeDetector {
  private debugLog: string[] = [];

  detect(bodyText: string): DetectionResult {
    this.debugLog = [];

    const detectedType = this.detectType(bodyText);
    const extractedDetails = this.extractDetails(bodyText);

    this.debugLog.push(`✓ Transaction type: ${detectedType}`);
    if (extractedDetails) {
      this.debugLog.push(`✓ Details extracted: ${extractedDetails.substring(0, 50)}...`);
    }

    return {
      transactionType: detectedType,
      details: extractedDetails,
    };
  }

  private detectType(text: string): string {
    // Check each transaction type
    for (const [type, patterns] of Object.entries(TRANSACTION_TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          this.debugLog.push(`Matched pattern for: ${type}`);
          return type;
        }
      }
    }

    return TransactionType.UNKNOWN;
  }

  private extractDetails(text: string): string {
    const details: string[] = [];

    // Try to extract card number
    const cardMatch = text.match(DETAIL_PATTERNS.cardNumber);
    if (cardMatch) {
      details.push(`Card: ${cardMatch[1]}`);
    }

    // Try to extract reference number
    const refMatch = text.match(DETAIL_PATTERNS.reference);
    if (refMatch) {
      details.push(`Ref: ${refMatch[1]}`);
    }

    // Try to extract recipient card
    const recipientMatch = text.match(DETAIL_PATTERNS.recipientCard);
    if (recipientMatch) {
      details.push(`To: ${recipientMatch[1]}`);
    }

    // Try to extract description
    const descMatch = text.match(DETAIL_PATTERNS.description);
    if (descMatch) {
      const desc = descMatch[1].trim().substring(0, 50);
      details.push(`Desc: ${desc}`);
    }

    return details.join(' | ');
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
