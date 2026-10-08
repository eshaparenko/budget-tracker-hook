/**
 * Cashew Link Generator Webhook Handler
 * Generates Cashew app-links from transaction data
 * 
 * Simple interface for MacroDroid automation:
 * - Send: app=Gmail&body=500%20UAH%20Starbucks&debug=true
 * - Get: { "success": true, "url": "https://cashewapp.web.app/addTransaction?..." }
 */

import { NextResponse } from 'next/server';
import { TransactionAnalyzer } from '@/lib/services/transactionAnalyzer';
import { generateCashewLink } from '@/lib/services/cashewLinkGenerator';
import { mapTransaction } from '@/lib/services/accountMapper';
import { Logger, Timer } from '@/lib/utils/errorHandler';
import { validateAndSanitize } from '@/lib/utils/validation';

/**
 * POST /api/webhook/cashew-link
 * GET  /api/webhook/cashew-link
 *
 * Simple endpoint for MacroDroid integration
 *
 * Query Parameters:
 * - app: Source app (Gmail, Telegram, Viber, Bank, etc.)
 * - body: Transaction text (e.g., "500 UAH Starbucks")
 * - debug: Enable debug logging (true/false)
 *
 * Response:
 * {
 *   "success": true,
 *   "url": "https://cashewapp.web.app/addTransaction?amount=500&...",
 *   "transaction": {
 *     "amount": 500,
 *     "category": "Побут",
 *     "merchant": "Starbucks",
 *     "currency": "UAH"
 *   },
 *   "debugLog": [...] // Only if debug=true
 * }
 *
 * Examples:
 * GET /api/webhook/cashew-link?app=Gmail&body=500%20UAH%20Starbucks
 * GET /api/webhook/cashew-link?app=Telegram&body=150%20EUR%20coffee&debug=true
 */
export async function POST(request: Request) {
  const timer = new Timer();
  const logger = new Logger();
  const debugLog: string[] = [];

  const url = new URL(request.url);
  const debugEnabled = url.searchParams.get('debug')?.toLowerCase() === 'true';

  try {
    debugLog.push('=== Cashew Link Generator Started ===');
    debugLog.push(`Debug mode: ${debugEnabled ? 'ENABLED' : 'DISABLED'}`);
    logger.log('Cashew link request received', { debug: debugEnabled });

    // Parse request parameters (supports both query string and body)
    let params: Record<string, string> = {};

    // Get query parameters
    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }

    // Merge body parameters (body params override query params)
    try {
      const body = await request.json();
      if (typeof body === 'object' && body !== null) {
        params = { ...params, ...body };
      }
    } catch {
      // No JSON body, use query params only
    }

    // Extract parameters
    const app = params.app || 'Unknown';
    const body = params.body;

    debugLog.push(`App: ${app}`);

    // Validate body parameter
    if (!body) {
      debugLog.push('❌ Missing body parameter');
      logger.error('Missing body parameter');
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: body',
          ...(debugEnabled && { debugLog }),
        },
        { status: 400 }
      );
    }

    // Sanitize input
    debugLog.push('→ Sanitizing input');
    const validationResult = validateAndSanitize(body);
    if (!validationResult.isValid || !validationResult.sanitized) {
      debugLog.push(`❌ Validation failed: ${validationResult.errors.join(', ')}`);
      logger.error('Body validation failed', { errors: validationResult.errors });
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid transaction body',
          details: validationResult.errors,
          ...(debugEnabled && { debugLog }),
        },
        { status: 400 }
      );
    }

    const sanitizedBody = validationResult.sanitized;
    debugLog.push(`✓ Body sanitized: "${sanitizedBody.substring(0, 80)}..."`);

    // Analyze transaction
    debugLog.push('→ Analyzing transaction with AI');
    logger.log('Analyzing transaction', { body: sanitizedBody, app });
    const analyzer = new TransactionAnalyzer();

    let parsedData;
    try {
      parsedData = await analyzer.analyze(sanitizedBody);
      debugLog.push(...analyzer.getDebugLog());
      logger.log('Transaction analyzed', {
        amount: parsedData.amount,
        category: parsedData.category,
        merchant: parsedData.merchant,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      debugLog.push(`❌ Analysis failed: ${errorMsg}`);
      logger.error('Transaction analysis failed', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to analyze transaction',
          details: errorMsg,
          ...(debugEnabled && { debugLog }),
        },
        { status: 422 }
      );
    }

    // Generate Cashew link with app/account option
    debugLog.push('→ Generating Cashew link');
    let link;
    try {
      // Pass app name as account for internal mapping; Cashew URL will still use 'Default'
      link = generateCashewLink(parsedData, { account: app });
      debugLog.push(`✓ Link generated (${link.length} chars)`);
      logger.log('Cashew link generated', { duration: timer.elapsedMs() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      debugLog.push(`❌ Link generation failed: ${errorMsg}`);
      logger.error('Link generation failed', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to generate Cashew link',
          details: errorMsg,
          ...(debugEnabled && { debugLog }),
        },
        { status: 422 }
      );
    }

    // Apply account and category mapping for response
    debugLog.push('→ Applying account/category constraints');
    // Map the provided account/app name
    const mapping = mapTransaction(app, parsedData.category);
    debugLog.push(`✓ Category mapped: "${parsedData.category}" → "${mapping.category}"`);

    // Return success response
    debugLog.push(`✓ Request completed in ${timer.elapsedMs()}ms`);
    
    return NextResponse.json(
      {
        success: true,
        url: link,
        transaction: {
          amount: parsedData.amount,
          category: mapping.category, // Use constrained category
          merchant: parsedData.merchant,
          currency: parsedData.currency,
        },
        ...(debugEnabled && { debugLog }),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    debugLog.push(`❌ Unexpected error: ${errorMsg}`);
    logger.error('Cashew link generation failed', error);

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
        ...(debugEnabled && { debugLog }),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhook/cashew-link
 * Same as POST, supports query parameters only
 */
export async function GET(request: Request) {
  return POST(request);
}

/**
 * OPTIONS /api/webhook/cashew-link
 * CORS preflight support
 */
export async function OPTIONS() {
  return NextResponse.json(
    { message: 'OK' },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}
