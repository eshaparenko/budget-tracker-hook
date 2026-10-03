/**
 * Google Sheets Repository
 * Handles all data persistence to Google Sheets
 */

import { google } from 'googleapis';
import { Transaction } from '../types';

export class SheetsRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetsRepositoryError';
  }
}

export class SheetsRepository {
  private sheets: any;
  private spreadsheetId: string;
  private debugLog: string[] = [];

  constructor(spreadsheetId?: string) {
    this.spreadsheetId = spreadsheetId || process.env.GOOGLE_SHEET_ID || '';

    if (!this.spreadsheetId) {
      throw new Error('GOOGLE_SHEET_ID environment variable is not set');
    }

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
      throw new Error('Google credentials not configured (GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY)');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async appendTransaction(transaction: Transaction): Promise<void> {
    this.debugLog = [];
    this.debugLog.push('=== Appending Transaction to Sheets ===');

    try {
      this.validateTransaction(transaction);

      const row = [
        transaction.date,
        transaction.category,
        transaction.amount,
        transaction.currency,
        transaction.merchant,
        transaction.source,
      ];

      this.debugLog.push(`→ Writing row: ${JSON.stringify(row)}`);

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Transactions!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [row],
        },
      });

      this.debugLog.push(`✓ Successfully appended to Sheets`);
      this.debugLog.push(`  Updated range: ${response.data.updates?.updatedRange}`);
      this.debugLog.push(`  Updated rows: ${response.data.updates?.updatedRows}`);
    } catch (error) {
      this.debugLog.push(
        `❌ Sheets error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw new SheetsRepositoryError(
        error instanceof Error ? error.message : 'Failed to write to Google Sheets'
      );
    }
  }

  private validateTransaction(transaction: Transaction): void {
    const errors: string[] = [];

    if (!transaction.date || typeof transaction.date !== 'string') {
      errors.push('Date is required and must be a string');
    }

    if (!transaction.category || typeof transaction.category !== 'string') {
      errors.push('Category is required and must be a string');
    }

    if (typeof transaction.amount !== 'number' || transaction.amount < 0) {
      errors.push('Amount must be a non-negative number');
    }

    if (typeof transaction.currency !== 'string') {
      errors.push('Currency must be a string');
    }

    if (typeof transaction.merchant !== 'string') {
      errors.push('Merchant must be a string');
    }

    if (!transaction.source || typeof transaction.source !== 'string') {
      errors.push('Source is required and must be a string');
    }

    if (errors.length > 0) {
      throw new SheetsRepositoryError(`Transaction validation failed: ${errors.join(', ')}`);
    }
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
