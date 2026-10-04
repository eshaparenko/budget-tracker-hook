/**
 * Transaction Analyzer Service
 * Handles AI-powered transaction analysis with pluggable AI providers
 */

import { aiFactory } from '@/lib/ai/AIFactory';
import { AnalysisError as AIAnalysisError } from '@/lib/ai/types';
import { ParsedTransaction } from '../types';

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export class TransactionAnalyzer {
  private debugLog: string[] = [];

  async analyze(bodyText: string): Promise<ParsedTransaction> {
    this.debugLog = [];
    this.debugLog.push('=== Transaction Analysis Started ===');

    try {
      // Use AI Factory with pluggable providers and fallback logic
      const result = await aiFactory.analyze(bodyText);

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
