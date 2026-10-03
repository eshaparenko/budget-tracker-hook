/**
 * Webhook Handler - Refactored
 * Handles financial transaction webhooks with AI-powered categorization
 */

import { NextResponse } from 'next/server';
import { RequestParser } from '@/lib/services/requestParser';
import { TransactionAnalyzer } from '@/lib/services/transactionAnalyzer';
import { TransactionTypeDetector } from '@/lib/services/transactionTypeDetector';
import { SheetsRepository } from '@/lib/repositories/sheetsRepository';
import { getEnvironmentConfig } from '@/lib/config/environment';
import { Logger, ErrorMapper, ResponseBuilder, Timer } from '@/lib/utils/errorHandler';
import { validateAndSanitize, validateTransactionBody } from '@/lib/utils/validation';
import { Transaction } from '@/lib/types';

/**
 * POST /api/webhook/hook-with-params
 * 
 * Accepts financial transaction data, analyzes it with AI, and stores in Google Sheets
 * 
 * Query Parameters:
 * - app: Source application (e.g., "Gmail", "Telegram", "Viber", "Bank")
 * - body: Transaction text to analyze
 * - source: Source type (e.g., "Email", "Telegram", "Viber", "Bank", "Other") [optional, defaults to "Other"]
 * - debug: Set to "true" to include debug logs in response [optional]
 * 
 * Request Body:
 * - Empty JSON object {} required (for proper content-type handling)
 * 
 * Examples:
 * POST /api/webhook/hook-with-params?app=Gmail&source=Email&body=Payment%20150%20UAH%20to%20Starbucks
 * POST /api/webhook/hook-with-params?app=Telegram&source=Telegram&body=💳%20150%20UAH&debug=true
 * POST /api/webhook/hook-with-params?app=Bank&source=Bank&body=Transfer%20500%20UAH
 */
export async function POST(request: Request) {
  const timer = new Timer();
  const logger = new Logger();
  const debugLog: string[] = [];

  // Extract debug parameter from URL
  const url = new URL(request.url);
  const debugEnabled = url.searchParams.get('debug')?.toLowerCase() === 'true';

  try {
    debugLog.push('=== Webhook Handler Started ===');
    debugLog.push(`Debug mode: ${debugEnabled ? 'ENABLED' : 'DISABLED'}`);
    logger.log('Webhook request received', { debug: debugEnabled });

    // Load configuration
    let config;
    try {
      config = getEnvironmentConfig();
      debugLog.push('✓ Environment configuration loaded');
    } catch (error) {
      debugLog.push(
        `❌ Configuration error: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return NextResponse.json({
        success: false,
        error: 'Server configuration error',
        ...(debugEnabled && { debugLog }),
      }, { status: 500 });
    }

    // Step 1: Parse request
    debugLog.push('→ Step 1: Parsing request');
    let webhookRequest;
    try {
      const parser = new RequestParser();
      webhookRequest = await parser.parse(request);
      debugLog.push(...parser.getDebugLog());
      logger.log('Request parsed successfully', {
        app: webhookRequest.app,
        bodyLength: webhookRequest.body.length,
      });
    } catch (error) {
      debugLog.push(
        `❌ Parse error: ${error instanceof Error ? error.message : 'unknown'}`
      );
      logger.error('Request parsing failed', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to parse request',
        ...(debugEnabled && { debugLog }),
      }, { status: 400 });
    }

    // Step 2: Validate body content
    debugLog.push('→ Step 2: Validating content');
    const validation = validateTransactionBody(webhookRequest.body);
    if (!validation.isValid) {
      debugLog.push(`❌ Validation errors: ${validation.errors.join(', ')}`);
      logger.error('Body validation failed', { errors: validation.errors });
      return NextResponse.json({
        success: false,
        error: 'Invalid transaction body',
        ...(debugEnabled && { debugLog }),
      }, { status: 400 });
    }
    debugLog.push('✓ Body content validated');

    // Step 3: Analyze transaction
    debugLog.push('→ Step 3: Analyzing transaction with AI');
    debugLog.push(`Input to Gemini (first 150 chars): ${(validation.sanitized || webhookRequest.body).substring(0, 150)}`);
    let parsedData;
    try {
      const analyzer = new TransactionAnalyzer(config.geminiApiKey);
      parsedData = await analyzer.analyze(validation.sanitized || webhookRequest.body);
      debugLog.push(...analyzer.getDebugLog());
      logger.log('Transaction analyzed', {
        category: parsedData.category,
        amount: parsedData.amount,
        merchant: parsedData.merchant,
      });
    } catch (error) {
      debugLog.push(
        `❌ Analysis error: ${error instanceof Error ? error.message : 'unknown'}`
      );
      logger.error('Transaction analysis failed', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to analyze transaction',
        ...(debugEnabled && { debugLog }),
      }, { status: 500 });
    }

    // Step 3.5: Detect transaction type and extract details
    debugLog.push('→ Step 3.5: Detecting transaction type and details');
    try {
      const typeDetector = new TransactionTypeDetector();
      const detectionResult = typeDetector.detect(validation.sanitized || webhookRequest.body);
      debugLog.push(...typeDetector.getDebugLog());
      
      // Merge detection results with parsed data
      if (detectionResult.transactionType !== 'Other') {
        parsedData.transactionType = detectionResult.transactionType;
      }
      if (detectionResult.details) {
        parsedData.details = detectionResult.details;
      }
      
      logger.log('Transaction type detected', {
        type: parsedData.transactionType,
        details: parsedData.details?.substring(0, 50),
      });
    } catch (error) {
      debugLog.push(
        `⚠ Type detection error: ${error instanceof Error ? error.message : 'unknown'}`
      );
      // Don't fail the whole request, just skip type detection
      logger.error('Transaction type detection failed', error);
    }

    // Step 4: Save to Google Sheets
    debugLog.push('→ Step 4: Saving to Google Sheets');
    try {
      const repository = new SheetsRepository(config.googleSheetId);
      
      // Extract sourceType from URL parameter (Telegram, Viber, Bank, Email, etc.)
      const sourceType = url.searchParams.get('source') || 'Other';
      
      const transaction: Transaction = {
        date: new Date().toLocaleString('uk-UA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        category: parsedData.category,
        amount: parsedData.amount,
        currency: parsedData.currency,
        merchant: parsedData.merchant,
        source: webhookRequest.app,
        sourceType,
        transactionType: parsedData.transactionType,
        details: parsedData.details,
      };

      await repository.appendTransaction(transaction);
      debugLog.push(...repository.getDebugLog());
      logger.log('Transaction saved', { source: webhookRequest.app, sourceType });
    } catch (error) {
      debugLog.push(
        `❌ Save error: ${error instanceof Error ? error.message : 'unknown'}`
      );
      logger.error('Failed to save transaction', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to save transaction',
        ...(debugEnabled && { debugLog }),
      }, { status: 500 });
    }

    // Success response
    debugLog.push(`✓ Webhook completed in ${timer.elapsedMs()}`);
    logger.log('Webhook processed successfully', {
      duration: timer.elapsedMs(),
    });

    return NextResponse.json({
      success: true,
      parsedData,
      ...(debugEnabled && { debugLog }),
    }, { status: 200 });
  } catch (error) {
    debugLog.push(
      `❌ Unexpected error: ${error instanceof Error ? error.message : 'unknown'}`
    );
    logger.error('Webhook failed', error);

    return NextResponse.json({
      success: false,
      error: 'An unexpected error occurred',
      ...(debugEnabled && { debugLog }),
    }, { status: 500 });
  }
}

/**
 * GET /api/webhook/hook-with-params
 * 
 * Health check - returns available Gemini models
 */
export async function GET() {
  const debugLog: string[] = [];

  try {
    const config = getEnvironmentConfig();
    debugLog.push('→ Fetching available Gemini models');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`
    );
    const data = await response.json();

    if (!data.models) {
      debugLog.push('❌ No models found in response');
      return NextResponse.json(
        { error: 'Failed to fetch models', debugLog },
        { status: 500 }
      );
    }

    const availableModels = data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name);

    debugLog.push(`✓ Found ${availableModels.length} available models`);

    return NextResponse.json({
      health: 'ok',
      count: availableModels.length,
      models: availableModels,
      debugLog,
    });
  } catch (error) {
    debugLog.push(
      `❌ Error: ${error instanceof Error ? error.message : 'unknown'}`
    );
    return NextResponse.json(
      { error: 'Internal server error', debugLog },
      { status: 500 }
    );
  }
}
