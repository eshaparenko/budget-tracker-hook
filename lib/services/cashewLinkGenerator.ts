/**
 * Cashew Link Generator
 * Builds an app link that adds a transaction in Cashew without a UI prompt.
 * Parameters: https://cashewapp.web.app/faq.html#app-links
 *
 * Parameter mapping:
 *   amount   <- transaction.amount        (positive; income/expense comes from the category)
 *   category <- constrained to CASHEW_CATEGORIES
 *   subcategory <- only if it belongs to the chosen category in CASHEW_SUBCATEGORIES
 *   wallet   <- constrained to CASHEW_ACCOUNTS (Cashew also accepts `account`)
 *   title    <- transaction.merchant
 *   notes    <- transaction.details
 * Not sent on purpose:
 *   date     - Cashew defaults to the current date/time on the user's device
 *   currency - Cashew has no such parameter (currency belongs to the account)
 */

import { ParsedTransaction } from '../types';
import { mapTransaction, MappingResult } from './accountMapper';
import {
  buildQueryString,
  sanitizeForUrl,
  formatAmount,
  truncateString,
} from '../utils/urlEncoder';

const CASHEW_ADD_TRANSACTION_URL = 'https://cashewapp.web.app/addTransaction';
const MAX_TITLE_LENGTH = 100;
const MAX_NOTES_LENGTH = 200;

export interface CashewLinkOptions {
  /** Account name to use (matched against CASHEW_ACCOUNTS, case-insensitive) */
  account?: string;
}

export interface CashewLink {
  url: string;
  /** The account/category actually written into the link */
  mapping: MappingResult;
}

export function generateCashewLink(
  transaction: ParsedTransaction,
  options: CashewLinkOptions = {}
): CashewLink {
  const amount = formatAmount(transaction.amount);
  if (amount === null) {
    throw new Error(`Invalid amount: ${transaction.amount}`);
  }

  const mapping = mapTransaction(
    options.account,
    sanitizeForUrl(transaction.category || ''),
    sanitizeForUrl(transaction.subcategory || '')
  );

  const query = buildQueryString({
    amount,
    category: mapping.category,
    subcategory: mapping.subcategory,
    wallet: mapping.account,
    title: truncateString(sanitizeForUrl(transaction.merchant || ''), MAX_TITLE_LENGTH),
    notes: truncateString(sanitizeForUrl(transaction.details || ''), MAX_NOTES_LENGTH),
  });

  return { url: `${CASHEW_ADD_TRANSACTION_URL}?${query}`, mapping };
}
