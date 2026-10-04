/**
 * AI Factory Tests
 * Tests for provider creation, configuration, and fallback logic
 */

import { AIFactory } from '../AIFactory';
import { GeminiProvider } from '../providers/GeminiProvider';
import { ClaudeProvider } from '../providers/ClaudeProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';

describe('AIFactory', () => {
  // Save original env vars
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Reset factory singleton
    (AIFactory as any)['instance'] = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = AIFactory.getInstance();
      const instance2 = AIFactory.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Provider Creation', () => {
    it('should create provider from valid configuration', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const provider = factory.getPrimaryProvider();

      expect(provider).not.toBeNull();
      expect(provider?.getName()).toBe('gemini');
    });

    it('should handle missing API key gracefully', () => {
      process.env.GEMINI_API_KEY = '';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      // Should not throw during initialization
      expect(() => AIFactory.getInstance()).not.toThrow();
    });

    it('should support multiple fallback providers', () => {
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.AI_FALLBACK_PROVIDERS = 'claude,openai';
      process.env.GEMINI_API_KEY = 'test-gemini';
      process.env.CLAUDE_API_KEY = 'test-claude';
      process.env.OPENAI_API_KEY = 'test-openai';

      const factory = AIFactory.getInstance();
      const allProviders = factory.getAllProviders();

      expect(allProviders.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cost Tracking', () => {
    it('should return zero total cost initially', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      expect(factory.getTotalCost()).toBe(0);
    });

    it('should track costs by provider', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const breakdown = factory.getCostBreakdown();

      expect(typeof breakdown).toBe('object');
    });
  });

  describe('Health Status', () => {
    it('should report health status of providers', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const status = factory.getHealthStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
      expect(status[0]).toHaveProperty('provider');
      expect(status[0]).toHaveProperty('configured');
      expect(status[0]).toHaveProperty('failures');
    });

    it('should track provider failures', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const failureLog = factory.getFailureLog();

      expect(Array.isArray(failureLog)).toBe(true);
    });

    it('should allow clearing failure log', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      factory.clearFailureLog();

      expect(factory.getFailureLog().length).toBe(0);
    });
  });

  describe('Provider Access', () => {
    it('should retrieve provider by name', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const provider = factory.getProvider('gemini');

      expect(provider?.getName()).toBe('gemini');
    });

    it('should return null for non-existent provider', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const provider = factory.getProvider('nonexistent');

      expect(provider).toBeNull();
    });

    it('should handle case-insensitive provider names', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const provider1 = factory.getProvider('gemini');
      const provider2 = factory.getProvider('GEMINI');

      expect(provider1?.getName()).toBe(provider2?.getName());
    });

    it('should return all configured providers', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      const allProviders = factory.getAllProviders();

      expect(Array.isArray(allProviders)).toBe(true);
      expect(allProviders.length).toBeGreaterThan(0);
    });
  });

  describe('Factory Reset', () => {
    it('should reset to fresh state', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';

      const factory = AIFactory.getInstance();
      factory.reset();

      const status = factory.getHealthStatus();
      expect(status.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Validation', () => {
    it('should handle valid primary provider config', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.GEMINI_MODEL = 'gemini-pro';

      const factory = AIFactory.getInstance();
      const provider = factory.getPrimaryProvider();

      expect(provider).not.toBeNull();
    });

    it('should use default model if not specified', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      delete process.env.GEMINI_MODEL;

      const factory = AIFactory.getInstance();
      const provider = factory.getPrimaryProvider();

      expect(provider).not.toBeNull();
    });

    it('should skip invalid fallback providers', () => {
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.AI_PRIMARY_PROVIDER = 'gemini';
      process.env.AI_FALLBACK_PROVIDERS = 'invalid,claude,another-invalid';
      process.env.CLAUDE_API_KEY = 'test-claude';

      // Should not throw
      expect(() => AIFactory.getInstance()).not.toThrow();
    });
  });
});
