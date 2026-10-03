/**
 * Gemini Prompts Configuration
 * Centralized prompt templates for different analysis scenarios
 * 
 * Usage:
 * - Transaction analysis: ANALYZE_TRANSACTION_PROMPT
 * - Future: Action analysis, category suggestions, etc.
 */

export const ANALYZE_TRANSACTION_PROMPT = `You are a financial transaction analyzer. Your task is to extract structured data from transaction text.

IMPORTANT: Determine if this is a REAL COMPLETED FINANCIAL TRANSACTION or just informational/reference text.

Guidelines for transaction vs non-transaction:
- TRANSACTION = Someone ALREADY paid, received money, transferred funds, made a purchase, received invoice for payment, or made withdrawal
- NOT TRANSACTION = Pricing info, tariffs, menus, FAQ, rules, shipping rates, or ACTION REQUESTS like "Проплати 30000 грн" (pay 30k UAH)
- Action requests use imperative verbs: проплати (pay), переведи (transfer), зніми (withdraw), закупи (buy)

Transaction text: "{TEXT}"

Extract ONLY the following JSON (no markdown, no code blocks, no extra text):
{
  "isTransaction": true/false (is this a completed financial transaction or just info/action request?),
  "category": "select ONE from: {CATEGORIES}, or empty string if not a transaction",
  "amount": number or 0 if not found (extract numeric value only),
  "currency": "ISO 4217 currency code (UAH, USD, EUR, GBP, ALL, HRK, RUB, etc.) or empty string if not found",
  "merchant": "business/service name or empty string",
  "transactionType": "Payment, Transfer, Refund, Withdrawal, Deposit, or Other",
  "details": "any useful info like card/reference or empty string"
}

GUIDELINES:
- isTransaction = true ONLY if: transaction ALREADY HAPPENED (past tense) - paid, received, transferred, purchased, withdrawn
- isTransaction = false if: action request (imperative: "Проплати", "Переведи", "Закупи"), pricing info, tariffs, menus, FAQ, rules
- Extract currency code from ANY format: "5000 лек" → "ALL", "1500 грн" → "UAH", "$500" → "USD"
- If you see a currency word/symbol, convert it to ISO 4217 code (e.g., лек=ALL, грн=UAH, евро=EUR, долар=USD, дин=RSD, etc.)
- If amount contains text like "1500 грн", extract ONLY the number: 1500
- If no merchant found, return empty string, NOT null
- category should be one of the provided options (or empty if not a transaction)
- Do not include any text before or after JSON`;

/**
 * Build the complete prompt with categories and text
 */
export function buildAnalysisPrompt(
  text: string,
  categories: readonly string[]
): string {
  const categoriesStr = Array.from(categories).join(', ');
  
  return ANALYZE_TRANSACTION_PROMPT
    .replace('{TEXT}', text)
    .replace('{CATEGORIES}', categoriesStr);
}
