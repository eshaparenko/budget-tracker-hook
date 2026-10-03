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

    return `You are a financial transaction analyzer. Your task is to extract structured data from transaction text.

IMPORTANT: Determine if this is a REAL FINANCIAL TRANSACTION or just informational/reference text.

Transaction text: "${text}"

Extract ONLY the following JSON (no markdown, no code blocks, no extra text):
{
  "isTransaction": true/false (is this a real financial transaction or just info?),
  "category": "select ONE from: ${categoriesStr}, or empty string if not a transaction",
  "amount": number or 0 if not found (extract numeric value only),
  "currency": "3-letter code (UAH, USD, EUR, GBP) or empty string",
  "merchant": "business/service name or empty string",
  "transactionType": "Payment, Transfer, Refund, Withdrawal, Deposit, or Other",
  "details": "any useful info like card/reference or empty string"
}

GUIDELINES:
- isTransaction = true ONLY if: someone paid, received money, transferred funds, made a purchase, invoice for payment, or withdrawal
- isTransaction = false if: pricing info, tariffs, menus, FAQ, rules, shipping rates without purchase context
- If amount contains text like "1500 грн", extract ONLY the number: 1500
- If no merchant found, return empty string, NOT null
- category should be one of the provided options (or empty if not a transaction)
- Do not include any text before or after JSON`;
  }

  private parseGeminiResponse(responseText: string): ParsedTransaction {
    try {
      const parsed = JSON.parse(responseText);

      // Check if this is actually a transaction
      if (parsed.isTransaction === false) {
        this.debugLog.push('⚠ Gemini determined this is not a transaction');
        // Return a marker that this is not a transaction
        return {
          category: 'Інше',
          amount: 0,
          currency: '',
          merchant: '',
          transactionType: 'Other',
          details: 'NOT_A_TRANSACTION',
        } as ParsedTransaction;
      }

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
      if (typeof parsed.transactionType !== 'string') {
        parsed.transactionType = 'Other';
      }
      if (typeof parsed.details !== 'string') {
        parsed.details = '';
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
