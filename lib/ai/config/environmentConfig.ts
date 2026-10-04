/**
 * Environment Configuration for AI Providers
 * Validates and loads provider configuration from environment variables
 */

import {
  ProviderConfig,
  FallbackConfig,
  ConfigurationError,
} from '../types';

const SUPPORTED_PROVIDERS = ['gemini', 'claude', 'openai', 'local'];

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-flash-lite-latest',
  claude: 'claude-3-5-haiku',
  openai: 'gpt-3.5-turbo',
  local: 'ollama',
};

/**
 * Parse provider configuration from environment
 * @param providerName - Name of the provider
 * @param throwOnMissing - Whether to throw if API key is missing (false for fallback providers)
 */
function parseProviderConfig(providerName: string, throwOnMissing = true): ProviderConfig {
  const provider = providerName.toLowerCase();

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new ConfigurationError(
      `Unsupported provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`
    );
  }

  const apiKeyEnv = `${provider.toUpperCase()}_API_KEY`;
  const apiKey = process.env[apiKeyEnv];

  if (!apiKey && provider !== 'local' && throwOnMissing) {
    throw new ConfigurationError(
      `Missing ${apiKeyEnv} environment variable for ${provider} provider`
    );
  }

  const modelEnv = `${provider.toUpperCase()}_MODEL`;
  const model = process.env[modelEnv] || DEFAULT_MODELS[provider];

  return {
    provider,
    apiKey: apiKey || '',
    model,
  };
}

/**
 * Load primary and fallback providers from environment
 */
export function loadFallbackConfig(): FallbackConfig {
  const primaryProviderName = process.env.AI_PRIMARY_PROVIDER || 'gemini';
  const fallbackProvidersStr = process.env.AI_FALLBACK_PROVIDERS || '';

  const primary = parseProviderConfig(primaryProviderName, true);

  const fallbacks: ProviderConfig[] = [];
  if (fallbackProvidersStr) {
    const providerNames = fallbackProvidersStr
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && p !== primaryProviderName);

    for (const name of providerNames) {
      try {
        fallbacks.push(parseProviderConfig(name, false)); // Don't throw for fallbacks
      } catch (error) {
        console.warn(`Failed to configure fallback provider ${name}:`, error);
      }
    }
  }

  return { primary, fallbacks };
}

/**
 * Validate that at least one provider is configured
 */
export function validateProviderConfiguration(): void {
  try {
    const config = loadFallbackConfig();
    if (!config.primary.apiKey && config.primary.provider !== 'local') {
      throw new ConfigurationError('No AI provider is properly configured');
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to validate provider configuration: ${error}`
    );
  }
}

/**
 * Get all configured providers (primary + fallbacks)
 */
export function getAllConfiguredProviders(): ProviderConfig[] {
  const config = loadFallbackConfig();
  return [config.primary, ...config.fallbacks];
}

/**
 * Log current configuration (safe, no secrets)
 */
export function logProviderConfiguration(): void {
  const config = loadFallbackConfig();
  console.log('\n=== AI Provider Configuration ===');
  console.log(`Primary: ${config.primary.provider} (${config.primary.model})`);
  if (config.fallbacks.length > 0) {
    console.log('Fallbacks:');
    config.fallbacks.forEach((fb) => {
      console.log(`  - ${fb.provider} (${fb.model})`);
    });
  } else {
    console.log('No fallback providers configured');
  }
  console.log('================================\n');
}

/**
 * Export environment variable template for .env.local
 */
export const ENV_TEMPLATE = `# AI Provider Configuration
# Supported: gemini, claude, openai, local

# Primary provider
AI_PRIMARY_PROVIDER=gemini

# Fallback providers (comma-separated)
# Example: gemini,claude,openai
AI_FALLBACK_PROVIDERS=claude,openai

# Provider API Keys (remove if using local/ollama)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest

CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_MODEL=claude-3-5-haiku

OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo

# Local provider (if using Ollama or similar)
# LOCAL_API_URL=http://localhost:11434
# LOCAL_MODEL=llama2
`;
