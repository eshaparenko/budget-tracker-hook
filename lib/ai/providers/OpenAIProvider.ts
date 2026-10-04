/**
 * OpenAI Provider
 * Implementation for OpenAI's GPT models
 */

import OpenAI from 'openai';
import { BaseProvider } from './BaseProvider';
import { AnalysisResult, AnalysisError } from '../types';

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-3.5-turbo') {
    super();
    this.apiKey = apiKey;
    this.model = model;
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true, // Allow in test environments
      });
    }
  }

  getName(): string {
    return 'openai';
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async analyze(text: string): Promise<AnalysisResult> {
    this.debugLog = [];
    this.logInfo('=== OpenAI Analysis Started ===');

    if (!this.isConfigured()) {
      throw new AnalysisError(
        this.getName(),
        'OpenAI provider is not configured (missing API key)'
      );
    }

    try {
      const sanitized = this.sanitizeForAnalysis(text);
      this.logSuccess(`Sanitized text: ${sanitized.substring(0, 80)}...`);

      const prompt = this.buildPrompt(sanitized);
      this.logInfo('Calling OpenAI API...');

      if (!this.client) {
        throw new AnalysisError(
          this.getName(),
          'OpenAI client not initialized'
        );
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      // Extract response text
      const responseText = response.choices[0]?.message?.content || '';

      this.logSuccess(
        `OpenAI response received: ${responseText.substring(0, 100)}...`
      );

      const parsed = this.parseJsonResponse(responseText);
      this.logSuccess('Successfully parsed OpenAI response');

      // Extract token usage
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;

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
