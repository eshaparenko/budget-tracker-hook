/**
 * Webhook Handler - Refactored
 * Handles financial transaction webhooks with AI-powered categorization
 */

import { NextResponse } from 'next/server';
import { RequestParser } from '@/lib/services/requestParser';
import { TransactionAnalyzer } from '@/lib/services/transactionAnalyzer';
import { TransactionTypeDetector } from '@/lib/services/transactionTypeDetector';
import { AmountExtractor } from '@/lib/services/amountExtractor';
import { SheetsRepository } from '@/lib/repositories/sheetsRepository';
import { getEnvironmentConfig } from '@/lib/config/environment';
import { Logger, ErrorMapper, ResponseBuilder, Timer } from '@/lib/utils/errorHandler';
import { validateAndSanitize, validateTransactionBody } from '@/lib/utils/validation';
import { Transaction } from '@/lib/types';
import { guardApiKey } from '@/lib/utils/apiKeyAuth';

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
 * Headers:
 * - x-api-key: must equal WEBHOOK_SECRET (401 otherwise; 500 if WEBHOOK_SECRET is unset)
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
  // Authenticate first: nothing below (parsing, paid AI call, Sheets write) runs for strangers.
  const denied = guardApiKey(request);
  if (denied) return denied;

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

    // Step 2.5: Pre-extract amount (improves Gemini accuracy)
    debugLog.push('→ Step 2.5: Pre-extracting amount from text');
    const amountExtractor = new AmountExtractor();
    const preExtractedAmount = amountExtractor.extract(webhookRequest.body);
    debugLog.push(...amountExtractor.getDebugLog());

    // Step 3: Analyze transaction
    debugLog.push('→ Step 3: Analyzing transaction with AI');
    debugLog.push(`Input to AI (first 150 chars): ${(validation.sanitized || webhookRequest.body).substring(0, 150)}`);
    let parsedData;
    try {
      const analyzer = new TransactionAnalyzer();
      parsedData = await analyzer.analyze(validation.sanitized || webhookRequest.body);
      debugLog.push(...analyzer.getDebugLog());
      
      // Check if Gemini determined this is not a transaction
      if (parsedData.details === 'NOT_A_TRANSACTION') {
        debugLog.push(`⚠ Gemini determined this message is not a financial transaction`);
        return NextResponse.json({
          success: false,
          error: 'Message is not a financial transaction',
          ...(debugEnabled && { debugLog }),
        }, { status: 400 });
      }
      
      // Use pre-extracted amount if Gemini didn't find one
      if (preExtractedAmount && parsedData.amount === 0) {
        debugLog.push(`✓ Using pre-extracted amount: ${preExtractedAmount.amount} ${preExtractedAmount.currency}`);
        parsedData.amount = preExtractedAmount.amount;
        if (!parsedData.currency) {
          parsedData.currency = preExtractedAmount.currency;
        }
      }
      
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
 * Health check - AI provider status (requires x-api-key)
 */
export async function GET(request: Request) {
  const denied = guardApiKey(request);
  if (denied) return denied;

  const debugLog: string[] = [];

  try {
    debugLog.push('→ Checking AI provider configuration and health');
    
    // Import AIFactory for provider health check
    const { aiFactory } = await import('@/lib/ai/AIFactory');
    
    const status = aiFactory.getHealthStatus();
    const primaryProvider = aiFactory.getPrimaryProvider();
    
    debugLog.push(`Primary provider: ${primaryProvider?.getName()}`);
    status.forEach(s => {
      debugLog.push(`  ${s.provider}: configured=${s.configured}, failures=${s.failures}`);
    });
    
    debugLog.push(`✓ All AI providers configured and ready`);

    return NextResponse.json({
      health: 'ok',
      providers: status,
      primaryProvider: primaryProvider?.getName(),
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
