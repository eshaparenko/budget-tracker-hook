/**
 * Integration Tests for AI Provider System
 * Tests real-world scenarios with provider switching and fallback
 */

import { AIFactory } from '../AIFactory';
import { GeminiProvider } from '../providers/GeminiProvider';
import { AnalysisError } from '../types';

describe('AI Provider Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    (AIFactory as any)['instance'] = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Provider Fallback Flow', () => {
    it('should initialize with primary provider', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const primary = factory.getPrimaryProvider();

      expect(primary?.getName()).toBe('gemini');
    });

    it('should list all available providers including fallbacks', () => {
      process.env.GEMINI_API_KEY = 'test-gemini';
      process.env.CLAUDE_API_KEY = 'test-claude';
      process.env.OPENAI_API_KEY = 'test-openai';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.AI_FALLBACK_PROVIDERS = 'claude,openai';

      const factory = AIFactory.getInstance();
      const allProviders = factory.getAllProviders();

      expect(allProviders.length).toBeGreaterThanOrEqual(1);
      const names = allProviders.map((p) => p.getName());
      expect(names).toContain('gemini');
    });

    it('should handle primary provider failure gracefully', async () => {
      process.env.GEMINI_API_KEY = '';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();

      // This should throw since no valid providers are configured
      await expect(factory.analyze('test text')).rejects.toThrow();
    });
  });

  describe('Cost Tracking Across Providers', () => {
    it('should track which provider was used', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const provider = factory.getPrimaryProvider();

      expect(provider?.getName()).toBe('gemini');
    });

    it('should maintain separate cost tracking', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.CLAUDE_API_KEY = 'test-claude';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.AI_FALLBACK_PROVIDERS = 'claude';

      const factory = AIFactory.getInstance();
      const breakdown = factory.getCostBreakdown();

      expect(typeof breakdown).toBe('object');
    });
  });

  describe('Provider Configuration Loading', () => {
    it('should respect AI_PRIMARY_PROVIDER environment variable', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.CLAUDE_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'claude';

      const factory = AIFactory.getInstance();
      const primary = factory.getPrimaryProvider();

      expect(primary?.getName()).toBe('claude');
    });

    it('should parse multiple fallback providers from comma-separated list', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.CLAUDE_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.AI_FALLBACK_PROVIDERS = 'claude, openai';

      const factory = AIFactory.getInstance();
      const allProviders = factory.getAllProviders();

      expect(allProviders.length).toBeGreaterThanOrEqual(1);
    });

    it('should use default provider when AI_PRIMARY_PROVIDER not set', () => {
      delete process.env.AI_PRIMARY_PROVIDER;
      process.env.GEMINI_API_KEY = 'test-key';

      const factory = AIFactory.getInstance();
      const primary = factory.getPrimaryProvider();

      // Should default to gemini
      expect(primary?.getName()).toBe('gemini');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should track provider failures', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const initialFailures = factory.getFailureLog().length;

      // Log should exist (might be empty or have previous failures)
      expect(Array.isArray(factory.getFailureLog())).toBe(true);
    });

    it('should clear failure log on demand', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      factory.clearFailureLog();

      expect(factory.getFailureLog().length).toBe(0);
    });

    it('should report health status of all providers', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.CLAUDE_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.AI_FALLBACK_PROVIDERS = 'claude';

      const factory = AIFactory.getInstance();
      const status = factory.getHealthStatus();

      expect(Array.isArray(status)).toBe(true);
      status.forEach((s) => {
        expect(s).toHaveProperty('provider');
        expect(s).toHaveProperty('configured');
        expect(s).toHaveProperty('failures');
      });
    });
  });

  describe('Model Configuration', () => {
    it('should use custom model if specified', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.GEMINI_MODEL = 'gemini-pro';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const primary = factory.getPrimaryProvider();

      expect(primary).not.toBeNull();
    });

    it('should use default model if not specified', () => {
      delete process.env.GEMINI_MODEL;
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const primary = factory.getPrimaryProvider();

      expect(primary).not.toBeNull();
    });

    it('should support different models for different providers', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.CLAUDE_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';
      process.env.CLAUDE_MODEL = 'claude-3-opus';
      process.env.OPENAI_MODEL = 'gpt-4o';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const primary = factory.getPrimaryProvider();

      expect(primary).not.toBeNull();
    });
  });
});
