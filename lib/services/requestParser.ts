/**
 * Request Parsing Service
 * Handles extraction and validation of webhook request parameters
 */

import { WebhookRequest, ValidationError } from '../types';

const MAX_BODY_LENGTH = 10000; // 10KB limit
const MAX_APP_LENGTH = 100;

export class RequestParserError extends Error {
  constructor(
    message: string,
    public readonly debugInfo: string[] = []
  ) {
    super(message);
    this.name = 'RequestParserError';
  }
}

export class RequestParser {
  private debugLog: string[] = [];

  async parse(request: Request): Promise<WebhookRequest> {
    this.debugLog = [];
    this.debugLog.push('=== Request Parsing Started ===');

    try {
      const url = new URL(request.url);
      this.debugLog.push(`Full URL: ${url.toString()}`);

      // Extract URL parameters
      const app = this.extractAndValidateApp(url);
      const body = await this.extractAndValidateBody(request, url);

      this.debugLog.push(`✓ Successfully parsed request`);

      return { app, body };
    } catch (error) {
      this.debugLog.push(
        `❌ Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw new RequestParserError(
        error instanceof Error ? error.message : 'Failed to parse request',
        this.debugLog
      );
    }
  }

  private extractAndValidateApp(url: URL): string {
    const app = url.searchParams.get('app')?.trim() || 'unknown';

    if (app.length > MAX_APP_LENGTH) {
      throw new Error(`App name exceeds ${MAX_APP_LENGTH} characters`);
    }

    this.debugLog.push(`✓ App: ${app}`);
    return app;
  }

  private async extractAndValidateBody(request: Request, url: URL): Promise<string> {
    // Priority 1: URL parameter
    const urlBody = url.searchParams.get('body');
    if (urlBody) {
      return this.validateBody(urlBody, 'URL parameter');
    }

    // Priority 2: Request body
    this.debugLog.push('No body in URL params, checking request body...');
    const body = await this.parseRequestBody(request);

    if (!body) {
      throw new Error('No body content found in URL params or request body');
    }

    return this.validateBody(body, 'request body');
  }

  private async parseRequestBody(request: Request): Promise<string | null> {
    try {
      const contentType = request.headers.get('content-type') || '';
      const rawText = await request.text();

      if (!rawText || rawText.trim() === '') {
        this.debugLog.push('Request body is empty');
        return null;
      }

      // Skip empty JSON objects
      if (rawText.trim() === '{}' || rawText.trim() === '[]') {
        this.debugLog.push('Request body is empty JSON');
        return null;
      }

      this.debugLog.push(`Request body length: ${rawText.length}`);

      // Try parsing as JSON
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(rawText);
          const extracted = json.body || json.message || json.text;

          if (typeof extracted === 'string') {
            this.debugLog.push('✓ Extracted body from JSON');
            return extracted;
          }
        } catch {
          // Not valid JSON, use raw text
          this.debugLog.push('Request body is not valid JSON, using raw text');
        }
      }

      return rawText;
    } catch (error) {
      this.debugLog.push(
        `Error reading request body: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return null;
    }
  }

  private validateBody(body: string, source: string): string {
    const trimmed = body.trim();

    if (!trimmed) {
      throw new Error(`Body from ${source} is empty`);
    }

    if (trimmed.length > MAX_BODY_LENGTH) {
      throw new Error(`Body exceeds ${MAX_BODY_LENGTH} character limit`);
    }

    this.debugLog.push(`✓ Body from ${source}: ${trimmed.length} chars`);
    return trimmed;
  }

  getDebugLog(): string[] {
    return this.debugLog;
  }
}
