/**
 * Claude Provider
 * Implementation for Anthropic's Claude
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './BaseProvider';
import { AnalysisResult, AnalysisError } from '../types';

export class ClaudeProvider extends BaseProvider {
  private client: Anthropic | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-haiku') {
    super();
    this.apiKey = apiKey;
    this.model = model;
    if (apiKey) {
      this.client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true, // Allow in test environments
      });
    }
  }

  getName(): string {
    return 'claude';
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async analyze(text: string): Promise<AnalysisResult> {
    this.debugLog = [];
    this.logInfo('=== Claude Analysis Started ===');

    if (!this.isConfigured()) {
      throw new AnalysisError(
        this.getName(),
        'Claude provider is not configured (missing API key)'
      );
    }

    try {
      const sanitized = this.sanitizeForAnalysis(text);
      this.logSuccess(`Sanitized text: ${sanitized.substring(0, 80)}...`);

      const prompt = this.buildPrompt(sanitized);
      this.logInfo('Calling Claude API...');

      if (!this.client) {
        throw new AnalysisError(
          this.getName(),
          'Claude client not initialized'
        );
      }

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract response text
      const responseText =
        response.content[0].type === 'text' ? response.content[0].text : '';

      this.logSuccess(
        `Claude response received: ${responseText.substring(0, 100)}...`
      );

      const parsed = this.parseJsonResponse(responseText);
      this.logSuccess('Successfully parsed Claude response');

      // Extract token usage
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      const cost = this.recordCost(this.model, inputTokens, outputTokens);

      this.logInfo(
        `Tokens: ${inputTokens} input, ${outputTokens} output | Cost: $${cost.costUSD.toFixed(6)}`
      );

      return {
        data: parsed,
        cost,
        debugLog: [...this.debugLog],
      };
    } catch (error) {
      if (error instanceof AnalysisError) {
        this.logError(error.message);
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logError(`Analysis error: ${message}`);
      throw new AnalysisError(this.getName(), message, error instanceof Error ? error : undefined);
    }
  }
}
