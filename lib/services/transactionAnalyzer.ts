/**
 * Transaction Analyzer Service
 * Handles AI-powered transaction analysis using Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedTransaction } from '../types';

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
  'Інше'
] as const;

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export class TransactionAnalyzer {
  private genAI: GoogleGenerativeAI;
  private debugLog: string[] = [];

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    this.genAI = new GoogleGenerativeAI(key);
  }

  async analyze(bodyText: string): Promise<ParsedTransaction> {
    this.debugLog = [];
    this.debugLog.push('=== Transaction Analysis Started ===');

    try {
      const sanitized = this.sanitizeForAnalysis(bodyText);
      this.debugLog.push(`✓ Sanitized text: ${sanitized.substring(0, 80)}...`);

      const prompt = this.buildPrompt(sanitized);
      this.debugLog.push('→ Calling Gemini API...');

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-flash-lite-latest',
        generationConfig: { responseMimeType: 'application/json' }
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      this.debugLog.push(`← Gemini response received: ${responseText.substring(0, 100)}...`);

      const parsed = this.parseGeminiResponse(responseText);
      this.debugLog.push('✓ Successfully parsed Gemini response');

      return parsed;
    } catch (error) {
      this.debugLog.push(
        `❌ Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw new AnalysisError(
        error instanceof Error ? error.message : 'Failed to analyze transaction'
      );
    }
  }

  private sanitizeForAnalysis(text: string): string {
    return text
      .replace(/[\r\n]+/g, ' ') // Replace newlines with spaces
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();
  }

  private buildPrompt(text: string): string {
    const categoriesStr = TRANSACTION_CATEGORIES.join(', ');

    return `Analyze this transaction text and extract structured data.

Text: "${text}"

Extract the following information and return ONLY valid JSON (no markdown, no extra text):
{
  "category": "one of: ${categoriesStr}",
  "amount": number (0 if not found),
  "currency": "currency code like UAH, USD, EUR, GBP (or empty string if unknown)",
  "merchant": "name of the business or service (or empty string if unknown)"
}`;
  }

  private parseGeminiResponse(responseText: string): ParsedTransaction {
    try {
      const parsed = JSON.parse(responseText);

      // Validate required fields exist
      if (typeof parsed.category !== 'string') {
        parsed.category = 'Інше';
      }
      if (typeof parsed.amount !== 'number') {
        parsed.amount = 0;
      }
      if (typeof parsed.currency !== 'string') {
        parsed.currency = '';
      }
      if (typeof parsed.merchant !== 'string') {
        parsed.merchant = '';
      }

      // Ensure category is valid
      if (!TRANSACTION_CATEGORIES.includes(parsed.category as any)) {
        parsed.category = 'Інше';
      }

      // Ensure amount is non-negative
      if (parsed.amount < 0) {
        parsed.amount = 0;
      }

      return parsed as ParsedTransaction;
    } catch (error) {
      throw new AnalysisError(
        `Invalid JSON from Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
