/**
 * Domain Models and Types
 */

export interface Transaction {
  date: string;
  category: string;
  amount: number;
  currency: string;
  merchant: string;
  source: string;
}

export interface ParsedTransaction {
  category: string;
  amount: number;
  currency: string;
  merchant: string;
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
