/**
 * AI Provider Types and Interfaces
 * Defines the contract for pluggable AI providers
 */

import { ParsedTransaction } from '../types';

/**
 * Cost tracking information for an API call
 */
export interface CostInfo {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  totalTokens: number;
  timestamp: Date;
}

/**
 * Analysis result with cost tracking
 */
export interface AnalysisResult {
  data: ParsedTransaction;
  cost: CostInfo;
  debugLog: string[];
}

/**
 * Provider configuration from environment
 */
export interface ProviderConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  primary: ProviderConfig;
  fallbacks: ProviderConfig[];
}

/**
 * Abstract interface for AI providers
 */
export interface IAIProvider {
  /**
   * Analyze transaction text and extract structured data
   */
  analyze(text: string): Promise<AnalysisResult>;

  /**
   * Check if provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get provider name for identification
   */
  getName(): string;

  /**
   * Get debug logs from last analysis
   */
  getDebugLog(): string[];

  /**
   * Get total cost tracked so far
   */
  getTotalCost(): number;

  /**
   * Reset debug logs
   */
  resetDebugLog(): void;
}

/**
 * Analysis error with provider context
 */
export class AnalysisError extends Error {
  constructor(
    public provider: string,
    message: string,
    public originalError?: Error
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'AnalysisError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Token pricing data for cost calculation
 */
export interface TokenPricing {
  inputPrice: number; // Price per 1M input tokens
  outputPrice: number; // Price per 1M output tokens
}

/**
 * Provider pricing rates (as of October 2026)
 */
export const PROVIDER_PRICING: Record<string, Record<string, TokenPricing>> = {
  gemini: {
    'gemini-flash-lite-latest': {
      inputPrice: 0.075,
      outputPrice: 0.3,
    },
    'gemini-flash': {
      inputPrice: 0.15,
      outputPrice: 0.6,
    },
    'gemini-pro': {
      inputPrice: 1.5,
      outputPrice: 4.5,
    },
  },
  claude: {
    'claude-3-5-sonnet': {
      inputPrice: 3.0,
      outputPrice: 15.0,
    },
    'claude-3-5-haiku': {
      inputPrice: 0.8,
      outputPrice: 4.0,
    },
    'claude-3-opus': {
      inputPrice: 15.0,
      outputPrice: 75.0,
    },
  },
  openai: {
    'gpt-4o': {
      inputPrice: 5.0,
      outputPrice: 15.0,
    },
    'gpt-4-turbo': {
      inputPrice: 10.0,
      outputPrice: 30.0,
    },
    'gpt-3.5-turbo': {
      inputPrice: 0.5,
      outputPrice: 1.5,
    },
  },
};
