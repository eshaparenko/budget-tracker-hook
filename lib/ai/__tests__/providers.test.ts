/**
 * AI Provider Tests
 * Tests for Gemini, Claude, and OpenAI providers
 */

import { GeminiProvider } from '../providers/GeminiProvider';
import { ClaudeProvider } from '../providers/ClaudeProvider';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { AnalysisError } from '../types';

describe('AI Providers', () => {
  describe('GeminiProvider', () => {
    it('should return false for isConfigured when no API key', () => {
      const provider = new GeminiProvider('');
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true for isConfigured when API key provided', () => {
      const provider = new GeminiProvider('fake-api-key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should return correct name', () => {
      const provider = new GeminiProvider('fake-api-key');
      expect(provider.getName()).toBe('gemini');
    });

    it('should throw error when API key is empty and analyze is called', async () => {
      const provider = new GeminiProvider('');
      await expect(provider.analyze('test')).rejects.toThrow(AnalysisError);
    });

    it('should initialize with custom model', () => {
      const provider = new GeminiProvider('fake-api-key', 'gemini-pro');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should maintain debug log', () => {
      const provider = new GeminiProvider('fake-api-key');
      expect(provider.getDebugLog()).toEqual([]);

      provider.resetDebugLog();
      expect(provider.getDebugLog()).toEqual([]);
    });

    it('should return zero total cost initially', () => {
      const provider = new GeminiProvider('fake-api-key');
      expect(provider.getTotalCost()).toBe(0);
    });
  });

  describe('ClaudeProvider', () => {
    it('should return false for isConfigured when no API key', () => {
      const provider = new ClaudeProvider('');
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true for isConfigured when API key provided', () => {
      const provider = new ClaudeProvider('fake-api-key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should return correct name', () => {
      const provider = new ClaudeProvider('fake-api-key');
      expect(provider.getName()).toBe('claude');
    });

    it('should throw error when API key is empty and analyze is called', async () => {
      const provider = new ClaudeProvider('');
      await expect(provider.analyze('test')).rejects.toThrow(AnalysisError);
    });

    it('should initialize with custom model', () => {
      const provider = new ClaudeProvider('fake-api-key', 'claude-3-opus');
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('OpenAIProvider', () => {
    it('should return false for isConfigured when no API key', () => {
      const provider = new OpenAIProvider('');
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true for isConfigured when API key provided', () => {
      const provider = new OpenAIProvider('fake-api-key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('should return correct name', () => {
      const provider = new OpenAIProvider('fake-api-key');
      expect(provider.getName()).toBe('openai');
    });

    it('should throw error when API key is empty and analyze is called', async () => {
      const provider = new OpenAIProvider('');
      await expect(provider.analyze('test')).rejects.toThrow(AnalysisError);
    });

    it('should initialize with custom model', () => {
      const provider = new OpenAIProvider('fake-api-key', 'gpt-4o');
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('Provider Base Functionality', () => {
    it('should sanitize text correctly', () => {
      const provider = new GeminiProvider('fake-api-key');
      const sanitized = provider['sanitizeForAnalysis'](
        'Hello\nWorld\u0000\u0001  Multiple   spaces'
      );
      expect(sanitized).toBe('Hello World Multiple spaces');
    });

    it('should parse valid transaction JSON', () => {
      const provider = new GeminiProvider('fake-api-key');
      const json = JSON.stringify({
        isTransaction: true,
        category: 'Їжа й хозяйство',
        amount: 150,
        currency: 'UAH',
        merchant: 'Starbucks',
        transactionType: 'Payment',
        details: 'Card ending in 1234',
      });

      const result = provider['parseJsonResponse'](json);
      expect(result.amount).toBe(150);
      expect(result.currency).toBe('UAH');
      expect(result.merchant).toBe('Starbucks');
    });

    it('should handle non-transaction response', () => {
      const provider = new GeminiProvider('fake-api-key');
      const json = JSON.stringify({
        isTransaction: false,
        category: '',
        amount: 0,
        currency: '',
        merchant: '',
      });

      const result = provider['parseJsonResponse'](json);
      expect(result.details).toBe('NOT_A_TRANSACTION');
      expect(result.amount).toBe(0);
    });

    it('should normalize invalid category to default', () => {
      const provider = new GeminiProvider('fake-api-key');
      const json = JSON.stringify({
        isTransaction: true,
        category: 'Invalid Category',
        amount: 100,
        currency: 'UAH',
        merchant: 'Test',
      });

      const result = provider['parseJsonResponse'](json);
      expect(result.category).toBe('Інше');
    });

    it('should handle missing fields gracefully', () => {
      const provider = new GeminiProvider('fake-api-key');
      const json = JSON.stringify({
        isTransaction: true,
        amount: 100,
      });

      const result = provider['parseJsonResponse'](json);
      expect(result.category).toBe('Інше');
      expect(result.currency).toBe('');
      expect(result.merchant).toBe('');
    });

    it('should throw error on invalid JSON', () => {
      const provider = new GeminiProvider('fake-api-key');
      expect(() => provider['parseJsonResponse']('invalid json')).toThrow(
        AnalysisError
      );
    });

    it('should ensure amount is non-negative', () => {
      const provider = new GeminiProvider('fake-api-key');
      const json = JSON.stringify({
        isTransaction: true,
        category: 'Їжа й хозяйство',
        amount: -100,
        currency: 'UAH',
      });

      const result = provider['parseJsonResponse'](json);
      expect(result.amount).toBe(0);
    });
  });
});
