/**
 * Domain Models and Types
 */

export interface Transaction {
  date: string;
  category: string;
  amount: number;
  currency: string;
  merchant: string;
  source: string; // App name (Gmail, Telegram, etc.)
  sourceType?: string; // Source type (Email, Telegram, Viber, Bank, etc.)
  transactionType?: string; // Payment, Transfer, Refund, etc.
  details?: string; // Additional details (card number, reference, etc.)
}

/** A category the AI may pick, with the subcategories allowed under it */
export interface CategoryOption {
  name: string;
  subcategories?: readonly string[];
}

export interface ParsedTransaction {
  category: string;
  subcategory?: string; // Only set by the direct (Cashew) flow; '' = none
  amount: number;
  currency: string;
  merchant: string;
  transactionType?: string; // Payment, Transfer, Refund, etc.
  details?: string; // Additional data: card number, reference, etc.
}

export interface WebhookRequest {
  app: string;
  body: string;
}

export interface WebhookResponse {
  success: boolean;
  parsedData?: ParsedTransaction;
  error?: string;
  debugLog: string[];
}

export interface ValidationError {
  field: string;
  message: string;
}
