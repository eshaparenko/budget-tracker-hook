/**
 * Gemini Provider
 * Implementation for Google Generative AI (Gemini)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './BaseProvider';
import { AnalysisResult, AnalysisError } from '../types';

export class GeminiProvider extends BaseProvider {
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-flash-lite-latest') {
    super();
    this.apiKey = apiKey;
    this.model = model;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  getName(): string {
    return 'gemini';
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.genAI;
  }

  async analyze(text: string): Promise<AnalysisResult> {
    this.debugLog = [];
    this.logInfo('=== Gemini Analysis Started ===');

    if (!this.isConfigured()) {
      throw new AnalysisError(
        this.getName(),
        'Gemini provider is not configured (missing API key)'
      );
    }

    try {
      const sanitized = this.sanitizeForAnalysis(text);
      this.logSuccess(`Sanitized text: ${sanitized.substring(0, 80)}...`);

      const prompt = this.buildPrompt(sanitized);
      this.logInfo('Calling Gemini API...');

      if (!this.genAI) {
        throw new AnalysisError(
          this.getName(),
          'Gemini AI client not initialized'
        );
      }

      const model = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      this.logSuccess(
        `Gemini response received: ${responseText.substring(0, 100)}...`
      );

      const parsed = this.parseJsonResponse(responseText);
      this.logSuccess('Successfully parsed Gemini response');

      // Extract token usage from response metadata
      const usageMetadata = result.response.usageMetadata;
      const inputTokens = usageMetadata?.promptTokenCount || 0;
      const outputTokens = usageMetadata?.candidatesTokenCount || 0;

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
