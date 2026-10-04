/**
 * AI Factory with Fallback Logic
 * Creates and manages AI provider instances with automatic fallback on failure
 */

import {
  IAIProvider,
  AnalysisResult,
  AnalysisError,
  ProviderConfig,
} from './types';
import { GeminiProvider } from './providers/GeminiProvider';
import { ClaudeProvider } from './providers/ClaudeProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import {
  loadFallbackConfig,
  logProviderConfiguration,
} from './config/environmentConfig';

export class AIFactory {
  private static instance: AIFactory;
  private providers: Map<string, IAIProvider> = new Map();
  private primaryProvider: IAIProvider | null = null;
  private fallbackProviders: IAIProvider[] = [];
  private failureLog: Array<{ provider: string; error: string; timestamp: Date }> = [];

  private constructor() {
    try {
      this.initialize();
    } catch (error) {
      console.warn('AI Factory initialization failed:', error);
      // Don't throw - allow factory to be created even if initialization fails
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AIFactory {
    if (!AIFactory.instance) {
      AIFactory.instance = new AIFactory();
    }
    return AIFactory.instance;
  }

  /**
   * Initialize providers from configuration
   */
  private initialize(): void {
    try {
      const config = loadFallbackConfig();
      logProviderConfiguration();

      // Create primary provider
      this.primaryProvider = this.createProvider(config.primary);

      // Create fallback providers
      this.fallbackProviders = config.fallbacks
        .map((cfg) => this.createProvider(cfg))
        .filter((p) => p !== null) as IAIProvider[];

      if (!this.primaryProvider) {
        throw new Error('Failed to initialize primary AI provider');
      }
    } catch (error) {
      console.error('AI Factory initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create a provider instance from configuration
   */
  private createProvider(config: ProviderConfig): IAIProvider | null {
    const cacheKey = `${config.provider}:${config.model}`;

    // Return cached instance if available
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey) || null;
    }

    let provider: IAIProvider | null = null;

    try {
      switch (config.provider.toLowerCase()) {
        case 'gemini':
          if (config.apiKey) {
            provider = new GeminiProvider(config.apiKey, config.model);
          }
          break;
        case 'claude':
          if (config.apiKey) {
            provider = new ClaudeProvider(config.apiKey, config.model);
          }
          break;
        case 'openai':
          if (config.apiKey) {
            provider = new OpenAIProvider(config.apiKey, config.model);
          }
          break;
        default:
          console.warn(`Unknown provider: ${config.provider}`);
      }

      if (provider && provider.isConfigured()) {
        this.providers.set(cacheKey, provider);
      }
    } catch (error) {
      console.warn(
        `Failed to create provider ${config.provider}:`,
        error instanceof Error ? error.message : error
      );
    }

    return provider;
  }

  /**
   * Analyze transaction with automatic fallback
   */
  async analyze(text: string): Promise<AnalysisResult> {
    // Reinitialize if no primary provider (handles test env setup)
    if (!this.primaryProvider) {
      try {
        this.initialize();
      } catch (error) {
        console.warn('Failed to reinitialize providers:', error);
      }
    }

    if (!this.primaryProvider) {
      throw new Error('No AI providers available');
    }

    // Try primary provider first
    try {
      return await this.primaryProvider.analyze(text);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.recordFailure(
        this.primaryProvider.getName(),
        errorMsg
      );
      console.warn(
        `Primary provider ${this.primaryProvider.getName()} failed:`,
        errorMsg
      );
    }

    // Try fallback providers in order
    for (const fallback of this.fallbackProviders) {
      try {
        console.log(`Attempting fallback provider: ${fallback.getName()}`);
        return await fallback.analyze(text);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.recordFailure(fallback.getName(), errorMsg);
        console.warn(
          `Fallback provider ${fallback.getName()} failed:`,
          errorMsg
        );
      }
    }

    // All providers failed
    throw new AnalysisError(
      'AIFactory',
      'All AI providers failed. No fallback available.'
    );
  }

  /**
   * Get primary provider
   */
  getPrimaryProvider(): IAIProvider | null {
    return this.primaryProvider;
  }

  /**
   * Get all available providers (primary + fallbacks)
   */
  getAllProviders(): IAIProvider[] {
    const all: IAIProvider[] = [];
    if (this.primaryProvider) {
      all.push(this.primaryProvider);
    }
    all.push(...this.fallbackProviders);
    return all;
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): IAIProvider | null {
    for (const [, provider] of this.providers) {
      if (provider.getName().toLowerCase() === name.toLowerCase()) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Record provider failure for monitoring
   */
  private recordFailure(provider: string, error: string): void {
    this.failureLog.push({
      provider,
      error,
      timestamp: new Date(),
    });
  }

  /**
   * Get failure log
   */
  getFailureLog(): Array<{ provider: string; error: string; timestamp: Date }> {
    return [...this.failureLog];
  }

  /**
   * Clear failure log
   */
  clearFailureLog(): void {
    this.failureLog = [];
  }

  /**
   * Get total cost from all providers
   */
  getTotalCost(): number {
    let total = 0;
    for (const [, provider] of this.providers) {
      total += provider.getTotalCost();
    }
    return total;
  }

  /**
   * Get cost breakdown by provider
   */
  getCostBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const [, provider] of this.providers) {
      breakdown[provider.getName()] = provider.getTotalCost();
    }
    return breakdown;
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus(): {
    provider: string;
    configured: boolean;
    failures: number;
  }[] {
    const status = [];

    const allProviders = this.getAllProviders();
    for (const provider of allProviders) {
      const failures = this.failureLog.filter(
        (f) => f.provider === provider.getName()
      ).length;
      status.push({
        provider: provider.getName(),
        configured: provider.isConfigured(),
        failures,
      });
    }

    return status;
  }

  /**
   * Reset all provider caches (for testing)
   */
  reset(): void {
    this.providers.clear();
    this.primaryProvider = null;
    this.fallbackProviders = [];
    this.failureLog = [];
    this.initialize();
  }
}

/**
 * Singleton instance export
 */
export const aiFactory = AIFactory.getInstance();
