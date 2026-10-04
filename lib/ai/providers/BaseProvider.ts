/**
 * Base Provider Class
 * Common functionality for all AI providers
 */

import { IAIProvider, AnalysisResult, AnalysisError, CostInfo } from '../types';
import { ParsedTransaction } from '@/lib/types';
import { costTracker } from '../services/CostTracker';

const TRANSACTION_CATEGORIES = [
  'Дім',
  'Одяг',
  'Авто',
  'Їжа й хозяйство',
  'Освіта',
  'Паливо',
  'Комуналка',
  'Розваги',
  'Підписки',
  'Здоров\'я',
  'Інше',
] as const;

/**
 * Base provider with common functionality
 */
export abstract class BaseProvider implements IAIProvider {
  protected debugLog: string[] = [];
  protected totalCost: number = 0;

  abstract analyze(text: string): Promise<AnalysisResult>;

  abstract isConfigured(): boolean;

  abstract getName(): string;

  getDebugLog(): string[] {
    return this.debugLog;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  resetDebugLog(): void {
    this.debugLog = [];
  }

  /**
   * Build analysis prompt - same for all providers
   */
  protected buildPrompt(text: string): string {
    const categoriesStr = Array.from(TRANSACTION_CATEGORIES).join(', ');
    return `You are a financial transaction analyzer. Your task is to extract structured data from transaction text.

IMPORTANT: Determine if this is a REAL COMPLETED FINANCIAL TRANSACTION or just informational/reference text.

Guidelines for transaction vs non-transaction:
- TRANSACTION = Someone ALREADY paid, received money, transferred funds, made a purchase, received invoice for payment, or made withdrawal
- NOT TRANSACTION = Pricing info, tariffs, menus, FAQ, rules, shipping rates, or ACTION REQUESTS like "Проплати 30000 грн" (pay 30k UAH)
- Action requests use imperative verbs: проплати (pay), переведи (transfer), зніми (withdraw), закупи (buy)

Transaction text: "${text}"

Extract ONLY the following JSON (no markdown, no code blocks, no extra text):
{
  "isTransaction": true/false (is this a completed financial transaction or just info/action request?),
  "category": "select ONE from: ${categoriesStr}, or empty string if not a transaction",
  "amount": number or 0 if not found (extract numeric value only),
  "currency": "ISO 4217 currency code (UAH, USD, EUR, GBP, ALL, HRK, RUB, etc.) or empty string if not found",
  "merchant": "business/service name or empty string",
  "transactionType": "Payment, Transfer, Refund, Withdrawal, Deposit, or Other",
  "details": "any useful info like card/reference or empty string"
}

GUIDELINES:
- isTransaction = true ONLY if: transaction ALREADY HAPPENED (past tense) - paid, received, transferred, purchased, withdrawn
- isTransaction = false if: action request (imperative: "Проплати", "Переведи", "Закупи"), pricing info, tariffs, menus, FAQ, rules
- Extract currency code from ANY format: "5000 лек" → "ALL", "1500 грн" → "UAH", "$500" → "USD"
- If you see a currency word/symbol, convert it to ISO 4217 code (e.g., лек=ALL, грн=UAH, евро=EUR, долар=USD, дин=RSD, etc.)
- If amount contains text like "1500 грн", extract ONLY the number: 1500
- If no merchant found, return empty string, NOT null
- category should be one of the provided options (or empty if not a transaction)
- Do not include any text before or after JSON`;
  }

  /**
   * Sanitize text for analysis
   */
  protected sanitizeForAnalysis(text: string): string {
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse JSON response from any provider
   */
  protected parseJsonResponse(responseText: string): ParsedTransaction {
    try {
      const parsed = JSON.parse(responseText);

      // Check if this is actually a transaction
      if (parsed.isTransaction === false) {
        this.debugLog.push('⚠ Provider determined this is not a transaction');
        return {
          category: 'Інше',
          amount: 0,
          currency: '',
          merchant: '',
          transactionType: 'Other',
          details: 'NOT_A_TRANSACTION',
        } as ParsedTransaction;
      }

      // Validate and normalize fields
      return this.normalizeTransaction(parsed);
    } catch (error) {
      throw new AnalysisError(
        this.getName(),
        `Invalid JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Normalize and validate transaction data
   */
  private normalizeTransaction(data: any): ParsedTransaction {
    const normalized: ParsedTransaction = {
      category: typeof data.category === 'string' ? data.category : 'Інше',
      amount: typeof data.amount === 'number' ? data.amount : 0,
      currency: typeof data.currency === 'string' ? data.currency : '',
      merchant: typeof data.merchant === 'string' ? data.merchant : '',
      transactionType: typeof data.transactionType === 'string' ? data.transactionType : 'Other',
      details: typeof data.details === 'string' ? data.details : '',
    };

    // Validate category
    if (!TRANSACTION_CATEGORIES.includes(normalized.category as any)) {
      normalized.category = 'Інше';
    }

    // Ensure amount is non-negative
    if (normalized.amount < 0) {
      normalized.amount = 0;
    }

    return normalized;
  }

  /**
   * Record API call cost
   */
  protected recordCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): CostInfo {
    const cost = costTracker.recordCost(
      this.getName(),
      model,
      inputTokens,
      outputTokens
    );
    this.totalCost += cost.costUSD;
    return cost;
  }

  /**
   * Log provider info
   */
  protected log(message: string): void {
    this.debugLog.push(message);
  }

  protected logError(message: string): void {
    this.debugLog.push(`❌ ${message}`);
  }

  protected logSuccess(message: string): void {
    this.debugLog.push(`✓ ${message}`);
  }

  protected logInfo(message: string): void {
    this.debugLog.push(`→ ${message}`);
  }
}
