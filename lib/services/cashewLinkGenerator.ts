/**
 * Cashew Link Generator
 * Builds an app link that adds a transaction in Cashew without a UI prompt.
 * Parameters: https://cashewapp.web.app/faq.html#app-links
 *
 * Parameter mapping:
 *   amount   <- amount in the mapped wallet currency (positive; category controls sign)
 *   category <- constrained to CASHEW_CATEGORIES
 *   subcategory <- only if it belongs to the chosen category in CASHEW_SUBCATEGORIES
 *   wallet   <- constrained to CASHEW_ACCOUNTS (Cashew also accepts `account`)
 *   title    <- transaction.merchant
 *   notes    <- original amount when adjusted, and transaction.details
 * Not sent on purpose:
 *   date     - Cashew defaults to the current date/time on the user's device
 *   currency - Cashew has no such parameter (currency belongs to the account)
 */

import { getAccountCurrency } from './cashewConfigLoader';
import { currencyConversion, CurrencyConversion, normalizeCurrency } from './currencyConversion';
import { ParsedTransaction } from '../types';
import { mapTransaction, MappingResult } from './accountMapper';
import {
  buildQueryString,
  sanitizeForUrl,
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
  conversion: CurrencyConversion;
}

export async function generateCashewLink(
  transaction: ParsedTransaction,
  options: CashewLinkOptions = {}
): Promise<CashewLink> {
  const mapping = mapTransaction(
    options.account,
    sanitizeForUrl(transaction.category || ''),
    sanitizeForUrl(transaction.subcategory || '')
  );

  const conversion = await currencyConversion.convert(transaction, getAccountCurrency(mapping.account));
  const originalCurrency = normalizeCurrency(transaction.currency);
  const adjusted = originalCurrency !== conversion.walletCurrency || transaction.amount !== conversion.walletAmount;
  const notes = [
    adjusted ? `Original: ${transaction.amount} ${originalCurrency}` : '',
    sanitizeForUrl(transaction.details || ''),
  ].filter(Boolean).join(' | ');

  const query = buildQueryString({
    amount: conversion.walletAmount,
    category: mapping.category,
    subcategory: mapping.subcategory,
    wallet: mapping.account,
    title: truncateString(sanitizeForUrl(transaction.merchant || ''), MAX_TITLE_LENGTH),
    notes: truncateString(notes, MAX_NOTES_LENGTH),
  });

  return { url: `${CASHEW_ADD_TRANSACTION_URL}?${query}`, mapping, conversion };
}
