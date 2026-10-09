/**
 * Base Provider Class
 * Common functionality for all AI providers
 */

import { IAIProvider, AnalysisResult, AnalysisError, CostInfo } from '../types';
import { CategoryOption, ParsedTransaction } from '@/lib/types';
import { costTracker } from '../services/CostTracker';
import { buildValidationPrompt, buildDirectPrompt, PromptType } from '@/lib/config/prompts';

/**
 * Default categories: used by the validation flow (/hook-with-params) and as
 * the fallback for the direct flow when the caller supplies none.
 */
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

/** Fallback options for the direct flow when the caller supplies none */
const DEFAULT_CATEGORY_OPTIONS: readonly CategoryOption[] = TRANSACTION_CATEGORIES.map(
  (name) => ({ name })
);

/**
 * Base provider with common functionality
 */
export abstract class BaseProvider implements IAIProvider {
  protected debugLog: string[] = [];
  protected totalCost: number = 0;

  abstract analyze(text: string): Promise<AnalysisResult>;

  /**
   * Run analysis with the given prompt type. Each provider implements the
   * actual API call; prompt text lives in lib/config/prompts.ts.
   */
  protected abstract analyzeWithPrompt(
    text: string,
    promptType: PromptType,
    categories?: readonly CategoryOption[]
  ): Promise<AnalysisResult>;

  abstract isConfigured(): boolean;

  abstract getName(): string;

  /**
   * Analyze text that is already known to be a transaction (no isTransaction
   * check). The caller decides which categories (and subcategories) the model
   * may pick from; the result is NOT constrained to them here.
   */
  async analyzeDirect(
    text: string,
    categories?: readonly CategoryOption[]
  ): Promise<AnalysisResult> {
    return this.analyzeWithPrompt(text, 'direct', categories);
  }

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
   * Build analysis prompt from the shared templates in lib/config/prompts.ts.
   * Only the direct flow honours a caller-supplied category list.
   */
  protected buildPrompt(
    text: string,
    promptType: PromptType = 'validation',
    categories?: readonly CategoryOption[]
  ): string {
    if (promptType === 'direct') {
      const options = categories && categories.length > 0 ? categories : DEFAULT_CATEGORY_OPTIONS;
      return buildDirectPrompt(text, options);
    }
    return buildValidationPrompt(text, TRANSACTION_CATEGORIES);
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
  protected parseJsonResponse(
    responseText: string,
    promptType: PromptType = 'validation'
  ): ParsedTransaction {
    try {
      const parsed = JSON.parse(responseText);

      // isTransaction only exists in the validation prompt
      if (promptType === 'validation' && parsed.isTransaction === false) {
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

      return this.normalizeTransaction(parsed, promptType);
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
  private normalizeTransaction(data: any, promptType: PromptType): ParsedTransaction {
    const normalized: ParsedTransaction = {
      category: typeof data.category === 'string' ? data.category : 'Інше',
      amount: typeof data.amount === 'number' ? data.amount : 0,
      currency: typeof data.currency === 'string' ? data.currency : '',
      merchant: typeof data.merchant === 'string' ? data.merchant : '',
      transactionType: typeof data.transactionType === 'string' ? data.transactionType : 'Other',
      details: typeof data.details === 'string' ? data.details : '',
    };

    // Only the direct prompt asks for a subcategory; keep the validation result unchanged.
    if (promptType === 'direct') {
      normalized.subcategory =
        typeof data.subcategory === 'string' ? data.subcategory.trim() : '';
    }

    // Validation flow constrains to the default list (original behaviour).
    // The direct flow leaves category and subcategory to the caller (Cashew boundary).
    if (
      promptType === 'validation' &&
      !TRANSACTION_CATEGORIES.includes(normalized.category as any)
    ) {
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
