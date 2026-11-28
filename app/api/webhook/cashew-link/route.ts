/**
 * Cashew Link Webhook Handler
 * Turns a bank notification into a Cashew app link (MacroDroid integration).
 *
 * GET|POST /api/webhook/cashew-link?app=Mono&body=230%20Kastrati%20bensina%20UAH[&debug=true]
 *
 * Headers:
 * - x-api-key: must equal WEBHOOK_SECRET (401 otherwise; 500 if WEBHOOK_SECRET is unset)
 *
 * Query parameters (same parsing rules as /hook-with-params):
 * - app:   account name, matched against CASHEW_ACCOUNTS (case-insensitive;
 *          unknown/missing falls back to the first configured account)
 * - body:  notification text (query parameter, or request body)
 * - debug: "true" to include debugLog in the response
 *
 * Response:
 * { "success": true,
 *   "url": "https://cashewapp.web.app/addTransaction?...",
 *   "transaction": { "amount", "category", "subcategory", "merchant", "currency" },
 *   "conversion": { "walletAmount", "walletCurrency", "source" },
 *   "debugLog": [...] }   // only with debug=true
 */

import { NextResponse } from 'next/server';
import { RequestParser, RequestParserError } from '@/lib/services/requestParser';
import { TransactionAnalyzer } from '@/lib/services/transactionAnalyzer';
import { CurrencyConversionError } from '@/lib/services/currencyConversion';
import { generateCashewLink } from '@/lib/services/cashewLinkGenerator';
import { mapAccount } from '@/lib/services/accountMapper';
import { buildUkrsibTransferDraft } from '@/lib/services/cashewTransferLink';
import { classifyUkrsibNotification } from '@/lib/services/ukrsibNotification';
import { getCategoryOptions } from '@/lib/services/cashewConfigLoader';
import { Logger, Timer } from '@/lib/utils/errorHandler';
import { validateTransactionBody } from '@/lib/utils/validation';
import { guardApiKey } from '@/lib/utils/apiKeyAuth';

export async function POST(request: Request) {
  const timer = new Timer();
  const logger = new Logger();
  // Authenticate first: nothing below (parsing, paid AI call) runs for strangers.
  const denied = guardApiKey(request);
  if (denied) return denied;

  const debugLog: string[] = ['=== Cashew Link Generator Started ==='];

  const debugEnabled =
    new URL(request.url).searchParams.get('debug')?.toLowerCase() === 'true';

  const fail = (status: number, error: string, details?: string | string[]) =>
    NextResponse.json(
      { success: false, error, ...(details && { details }), ...(debugEnabled && { debugLog }) },
      { status }
    );

  try {
    // Step 1: parse request
    const parser = new RequestParser();
    let app: string;
    let body: string;
    try {
      ({ app, body } = await parser.parse(request));
      debugLog.push(...parser.getDebugLog());
    } catch (error) {
      if (error instanceof RequestParserError) {
        debugLog.push(...error.debugInfo);
      }
      const message = error instanceof Error ? error.message : 'unknown';
      logger.error('Request parsing failed', error);
      return fail(400, 'Failed to parse request', message);
    }

    // Step 2: validate / sanitize body
    const validation = validateTransactionBody(body);
    if (!validation.isValid || !validation.sanitized) {
      debugLog.push(`❌ Validation errors: ${validation.errors.join(', ')}`);
      return fail(400, 'Invalid transaction body', validation.errors);
    }

    const isUkrsib = app.toLowerCase() === 'ukrsib' || mapAccount(app).account.toLowerCase() === 'ukrsib';
    const notification = isUkrsib
      ? classifyUkrsibNotification(validation.sanitized)
      : undefined;

    if (notification?.kind === 'transfer') {
      const draft = buildUkrsibTransferDraft(notification.from, notification.to);
      if (draft) {
        return NextResponse.json({
          ...draft,
          ...(debugEnabled && { debugLog: ['Prepared Ukrsib transfer for review'] }),
        });
      }
    }

    if (notification?.kind === 'skip' || notification?.kind === 'transfer') {
      const reason = notification.kind === 'transfer' ? 'transfer' : notification.reason;
      return NextResponse.json({
        success: false,
        skipped: true,
        reason,
        ...(debugEnabled && { debugLog: [`Skipped Ukrsib notification: ${reason}`] }),
      });
    }

    // Step 3: analyze with the direct prompt (input is already a notification;
    // the model picks from the user's Cashew categories and their subcategories)
    debugLog.push('→ Analyzing transaction with AI (direct prompt)');
    const analyzer = new TransactionAnalyzer();
    let parsed;
    try {
      parsed = await analyzer.analyzeDirect(validation.sanitized, getCategoryOptions());
      debugLog.push(...analyzer.getDebugLog());
    } catch (error) {
      debugLog.push(...analyzer.getDebugLog());
      logger.error('Transaction analysis failed', error);
      return fail(
        422,
        'Failed to analyze transaction',
        error instanceof Error ? error.message : 'unknown'
      );
    }

    if (notification?.kind === 'payment') {
      parsed = {
        ...parsed,
        amount: notification.amount,
        currency: notification.currency,
        settlementAmount: undefined,
        settlementCurrency: undefined,
      };
    }

    if (!(parsed.amount > 0)) {
      debugLog.push('❌ No amount found in notification');
      return fail(422, 'No amount found in the transaction text');
    }

    // Step 4: build the link (account/category constrained to the Cashew config)
    const { url, mapping, conversion } = await generateCashewLink(parsed, { account: app });
    if (!mapping.accountMatched) {
      debugLog.push(`⚠ Account "${app}" not in CASHEW_ACCOUNTS, using "${mapping.account}"`);
    }
    if (!mapping.categoryMatched) {
      debugLog.push(`⚠ Category "${parsed.category}" not in CASHEW_CATEGORIES, using "${mapping.category}"`);
    }
    if (!mapping.subcategoryMatched) {
      debugLog.push(`⚠ Subcategory "${parsed.subcategory}" is not configured under "${mapping.category}", dropped`);
    }
    debugLog.push(`✓ Completed in ${timer.elapsedMs()}`);
    logger.log('Cashew link generated', { duration: timer.elapsedMs() });

    return NextResponse.json({
      success: true,
      url,
      transaction: {
        amount: parsed.amount,
        category: mapping.category,
        subcategory: mapping.subcategory,
        merchant: parsed.merchant,
        currency: parsed.currency,
      },
      conversion,
      ...(debugEnabled && { debugLog }),
    });
  } catch (error) {
    logger.error('Cashew link generation failed', error);
    if (error instanceof CurrencyConversionError) return fail(error.status, error.message);
    debugLog.push(`❌ Unexpected error: ${error instanceof Error ? error.message : 'unknown'}`);
    return fail(500, 'An unexpected error occurred');
  }
}

/** MacroDroid usually sends GET; behave identically. */
export async function GET(request: Request) {
  return POST(request);
}
