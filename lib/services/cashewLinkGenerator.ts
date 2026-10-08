/**
 * Cashew Link Generator
 * Generates valid Cashew app-links from transaction data
 * Handles URL encoding, special characters, and currency conversion
 */

import { ParsedTransaction } from '../types';
import { mapTransaction } from './accountMapper';
import {
  encodeQueryParam,
  buildQueryString,
  sanitizeForUrl,
  formatCurrencyCode,
  formatDateForCashew,
  formatAmount,
  truncateString,
  escapeHtml,
} from '../utils/urlEncoder';

export interface CashewLinkOptions {
  account?: string; // Override account from request
  format?: 'url' | 'json' | 'html'; // Response format
  debug?: boolean; // Include debug logs
}

export interface CashewTransaction {
  amount: number;
  category: string;
  merchant: string;
  currency: string;
  account: string;
  date: string;
}

export interface CashewLinkResult {
  link: string;
  transaction: CashewTransaction;
  cost?: {
    provider: string;
    costUSD: number;
  };
  debugLog?: string[];
}

/**
 * Generate a Cashew app-link URL from transaction data
 */
export function generateCashewLink(
  transaction: ParsedTransaction,
  options: CashewLinkOptions = {}
): string {
  const debugLog: string[] = [];

  try {
    // Sanitize transaction data
    const sanitizedMerchant = sanitizeForUrl(transaction.merchant || 'Unknown');
    const sanitizedCategory = sanitizeForUrl(transaction.category || 'Other');
    const accountName = options.account || 'Default';

    debugLog.push('✓ Sanitized transaction data');

    // Map account and validate category through configuration
    const mapping = mapTransaction(accountName, sanitizedCategory);
    debugLog.push(
      `→ Mapped account "${accountName}" → "${mapping.account}" (${mapping.accountMapped ? 'configured' : 'passthrough'})`
    );
    debugLog.push(
      `→ Category "${sanitizedCategory}" (${mapping.categoryValid ? 'valid' : 'invalid/not in allowed list'})`
    );

    // Validate and format amount
    const formattedAmount = formatAmount(transaction.amount);
    if (!formattedAmount) {
      throw new Error(`Invalid amount: ${transaction.amount}`);
    }
    debugLog.push(`✓ Amount: ${formattedAmount}`);

    // Format currency
    const currencyCode = formatCurrencyCode(transaction.currency || '');
    debugLog.push(`✓ Currency: ${currencyCode}`);

    // Format date (use today if not provided)
    const date = formatDateForCashew(new Date());
    debugLog.push(`✓ Date: ${date}`);

    // Truncate title and notes for URL safety
    const title = truncateString(sanitizedMerchant, 100);
    const notes = truncateString(transaction.transactionType || '', 200);

    // Build query parameters
    // Use mapped account name (internally referred to as 'wallet' in Cashew)
    const params: Record<string, string | number> = {
      amount: parseFloat(formattedAmount),
      category: mapping.category,
      wallet: mapping.account,  // Use the mapped account name (Cashew internally uses 'wallet')
      title,
    };

    if (notes) {
      params.notes = notes;
    }

    if (currencyCode) {
      params.currency = currencyCode;
    }

    if (date) {
      params.date = date;
    }

    debugLog.push('✓ Built query parameters');

    // Generate URL
    const queryString = buildQueryString(params);
    const link = `https://cashewapp.web.app/addTransaction?${queryString}`;

    debugLog.push(`✓ Generated link (${link.length} chars)`);

    return link;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    debugLog.push(`✗ Error generating link: ${errorMsg}`);
    throw new Error(`Failed to generate Cashew link: ${errorMsg}`);
  }
}

/**
 * Generate a complete Cashew link result (with transaction data and metadata)
 */
export function generateCashewLinkResult(
  transaction: ParsedTransaction,
  options: CashewLinkOptions = {},
  costInfo?: { provider: string; costUSD: number }
): CashewLinkResult {
  const debugLog: string[] = [];

  const link = generateCashewLink(transaction, { ...options, debug: options.debug });

  const mapping = mapTransaction(options.account || 'Default', transaction.category);

  const result: CashewLinkResult = {
    link,
    transaction: {
      amount: transaction.amount,
      category: mapping.category,
      merchant: transaction.merchant || 'Unknown',
      currency: transaction.currency || 'UAH',
      account: mapping.account,
      date: formatDateForCashew(new Date()),
    },
  };

  if (costInfo) {
    result.cost = costInfo;
  }

  if (options.debug) {
    result.debugLog = debugLog;
  }

  return result;
}

/**
 * Generate HTML-formatted Cashew link for embedding in emails or web pages
 */
export function generateCashewLinkHtml(
  transaction: ParsedTransaction,
  options: CashewLinkOptions = {}
): string {
  const link = generateCashewLink(transaction, options);
  const mapping = mapTransaction(options.account || 'Default', transaction.category);

  const amount = formatAmount(transaction.amount);
  const currency = formatCurrencyCode(transaction.currency || 'UAH');
  const merchant = escapeHtml(transaction.merchant || 'Transaction');
  const category = escapeHtml(mapping.category);
  const account = escapeHtml(mapping.account);

  const title = `📊 Add to Cashew: ${amount} ${currency} - ${merchant}`;
  const summary = `${amount} ${currency} • ${category} • ${account}`;

  return `<div class="cashew-widget" style="margin: 16px 0; padding: 12px; border-radius: 8px; background: #f5f5f5; border-left: 4px solid #2e7d32;">
  <a href="${escapeHtml(link)}" class="cashew-btn" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 8px 16px; background: #2e7d32; color: white; text-decoration: none; border-radius: 4px; font-weight: 500;">
    ${title}
  </a>
  <p class="cashew-summary" style="margin-top: 8px; color: #666; font-size: 14px;">
    ${summary}
  </p>
</div>`;
}

/**
 * Generate plain text link for simple text responses
 */
export function generateCashewLinkPlainText(
  transaction: ParsedTransaction,
  options: CashewLinkOptions = {}
): string {
  return generateCashewLink(transaction, options);
}

/**
 * Generate batch links from multiple transactions
 */
export function generateCashewLinksBatch(
  transactions: ParsedTransaction[],
  options: CashewLinkOptions = {}
): CashewLinkResult[] {
  return transactions.map(transaction =>
    generateCashewLinkResult(transaction, options)
  );
}

/**
 * Validate transaction before generating link
 * Categories can be in any language - Cashew will accept them
 */
export function validateTransactionForLink(transaction: ParsedTransaction): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!transaction.amount || transaction.amount <= 0) {
    errors.push('Amount must be a positive number');
  }

  if (!transaction.category || transaction.category.trim() === '') {
    errors.push('Category is required');
  }

  if (!transaction.currency || transaction.currency.trim() === '') {
    errors.push('Currency is required');
  }

  if (!transaction.merchant || transaction.merchant.trim() === '') {
    errors.push('Merchant name is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
