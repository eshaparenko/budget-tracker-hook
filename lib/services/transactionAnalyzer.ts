/**
 * Transaction Analyzer Service
 * Handles AI-powered transaction analysis with pluggable AI providers
 */

import { aiFactory } from '@/lib/ai/AIFactory';
import { AnalysisError as AIAnalysisError } from '@/lib/ai/types';
import { CategoryOption, ParsedTransaction } from '../types';

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export class TransactionAnalyzer {
  private debugLog: string[] = [];

  /**
   * Analyze arbitrary text; the model decides whether it is a transaction.
   */
  async analyze(bodyText: string): Promise<ParsedTransaction> {
    return this.run('Transaction Analysis', () => aiFactory.analyze(bodyText));
  }

  /**
   * Analyze text already known to be a transaction (used by /cashew-link).
   * Skips the isTransaction check; the model picks a category (and optional
   * subcategory) from `categories`.
   */
  async analyzeDirect(
    bodyText: string,
    categories?: readonly CategoryOption[]
  ): Promise<ParsedTransaction> {
    return this.run('Direct Transaction Analysis', () =>
      aiFactory.analyzeDirect(bodyText, categories)
    );
  }

  private async run(
    label: string,
    call: () => ReturnType<typeof aiFactory.analyze>
  ): Promise<ParsedTransaction> {
    this.debugLog = [];
    this.debugLog.push(`=== ${label} Started ===`);

    try {
      // Use AI Factory with pluggable providers and fallback logic
      const result = await call();

      // Merge AI provider's debug log with transaction analyzer's log
      this.debugLog.push(...result.debugLog);
      this.debugLog.push(
        `💰 Cost: $${result.cost.costUSD.toFixed(6)} (${result.cost.provider}/${result.cost.model})`
      );

      return result.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.debugLog.push(`❌ Analysis error: ${message}`);
      throw new AnalysisError(message);
    }
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
