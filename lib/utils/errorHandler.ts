/**
 * Error Handling and Logging Utilities
 * Centralized error handling, logging, and response formatting
 */

import { NextResponse } from 'next/server';
import { WebhookResponse } from '../types';

export enum ErrorSeverity {
  LOW = 'LOW', // User error, validation failed
  MEDIUM = 'MEDIUM', // Service error, retry might help
  HIGH = 'HIGH', // Critical error, data integrity risk
}

export interface ErrorContext {
  severity: ErrorSeverity;
  statusCode: number;
  userMessage: string;
  debugInfo?: Record<string, any>;
  stack?: string;
}

/**
 * Structured logger for consistent logging
 */
export class Logger {
  private logs: string[] = [];
  private isDevelopment = process.env.NODE_ENV === 'development';

  log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);

    if (this.isDevelopment && data) {
      console.log(logEntry, data);
    } else if (this.isDevelopment) {
      console.log(logEntry);
    }
  }

  error(message: string, error?: Error | any): void {
    const timestamp = new Date().toISOString();
    const errorMsg = error instanceof Error ? error.message : String(error);
    const logEntry = `[${timestamp}] ERROR: ${message} - ${errorMsg}`;
    this.logs.push(logEntry);

    if (this.isDevelopment) {
      console.error(logEntry);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] DEBUG: ${message}`, data || '');
    }
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }
}

/**
 * Custom application error base class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly context: ErrorContext
  ) {
    super(message);
    this.name = 'AppError';
  }

  toResponse(debugLog: string[]): NextResponse<WebhookResponse> {
    return NextResponse.json(
      {
        success: false,
        error: this.context.userMessage,
        debugLog,
      },
      { status: this.context.statusCode }
    );
  }
}

/**
 * Error mapper - converts different error types to AppError
 */
export class ErrorMapper {
  static map(error: unknown, debugLog: string[]): AppError {
    // Handle custom application errors
    if (error instanceof AppError) {
      return error;
    }

    // Handle validation errors
    if (error instanceof ValidationError) {
      return new AppError(error.message, {
        severity: ErrorSeverity.LOW,
        statusCode: 400,
        userMessage: 'Request validation failed',
        debugInfo: { field: error.field, message: error.message },
      });
    }

    // Handle request parsing errors
    if (error instanceof RequestParsingError) {
      return new AppError(error.message, {
        severity: ErrorSeverity.LOW,
        statusCode: 400,
        userMessage: 'Failed to parse request parameters',
        debugInfo: { originalError: error.message },
      });
    }

    // Handle analysis errors
    if (error instanceof AnalysisError) {
      return new AppError(error.message, {
        severity: ErrorSeverity.MEDIUM,
        statusCode: 500,
        userMessage: 'Failed to analyze transaction',
        debugInfo: { originalError: error.message },
      });
    }

    // Handle repository errors
    if (error instanceof RepositoryError) {
      return new AppError(error.message, {
        severity: ErrorSeverity.HIGH,
        statusCode: 500,
        userMessage: 'Failed to save transaction',
        debugInfo: { originalError: error.message },
      });
    }

    // Handle generic errors
    if (error instanceof Error) {
      return new AppError(error.message, {
        severity: ErrorSeverity.MEDIUM,
        statusCode: 500,
        userMessage: 'An unexpected error occurred',
        debugInfo: { originalError: error.message },
        stack: error.stack,
      });
    }

    // Handle unknown errors
    return new AppError('Unknown error', {
      severity: ErrorSeverity.HIGH,
      statusCode: 500,
      userMessage: 'An unexpected error occurred',
      debugInfo: { rawError: String(error) },
    });
  }
}

/**
 * Specific error types for different layers
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RequestParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestParsingError';
  }
}

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Response builder for successful responses
 */
export class ResponseBuilder {
  static success(
    data: any,
    debugLog: string[]
  ): NextResponse<WebhookResponse> {
    return NextResponse.json(
      {
        success: true,
        parsedData: data,
        debugLog,
      },
      { status: 200 }
    );
  }

  static error(
    message: string,
    statusCode: number,
    debugLog: string[]
  ): NextResponse<WebhookResponse> {
    return NextResponse.json(
      {
        success: false,
        error: message,
        debugLog,
      },
      { status: statusCode }
    );
  }
}

/**
 * Request/response timing utility
 */
export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.startTime;
  }

  elapsedMs(): string {
    return `${this.elapsed()}ms`;
  }
}
