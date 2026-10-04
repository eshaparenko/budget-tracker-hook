# AI Provider System

Pluggable, multi-provider AI system with automatic fallback logic and cost tracking.

## Quick Start

### 1. Configure Providers

Set environment variables in `.env.local`:

```bash
# Primary provider
AI_PRIMARY_PROVIDER=gemini

# Fallback providers (tried in order if primary fails)
AI_FALLBACK_PROVIDERS=claude,openai

# API Keys
GEMINI_API_KEY=your_key
CLAUDE_API_KEY=your_key
OPENAI_API_KEY=your_key
```

### 2. Use in Code

```typescript
import { aiFactory } from '@/lib/ai/AIFactory';

// Analyze transaction (uses primary provider with fallback)
const result = await aiFactory.analyze('Payment 500 UAH to Starbucks');

console.log(result.data);        // Parsed transaction
console.log(result.cost);        // Cost info
console.log(result.debugLog);    // Debug log

// Get cost summary
console.log(aiFactory.getTotalCost());        // $0.0345
console.log(aiFactory.getCostBreakdown());    // { gemini: 0.012, claude: 0.0225 }
console.log(aiFactory.getHealthStatus());     // Provider health info
```

## Architecture

### Providers

- **GeminiProvider** - Google Generative AI (cheapest)
- **ClaudeProvider** - Anthropic Claude (highest quality)
- **OpenAIProvider** - OpenAI GPT (balanced)
- **Extensible** - Add new providers by extending `BaseProvider`

### Core Components

- **AIFactory** - Creates and manages providers with fallback logic
- **BaseProvider** - Abstract base with common functionality
- **CostTracker** - Tracks API usage and costs across providers
- **environmentConfig** - Loads and validates configuration

## Cost Tracking

Every API call is tracked:

```typescript
const summary = costTracker.getSummary();
// {
//   totalCostUSD: 0.0345,
//   totalCalls: 23,
//   totalTokens: 3450,
//   avgTokensPerCall: 150,
//   costsByProvider: { gemini: 0.012, claude: 0.0225 },
//   costsByModel: { ... }
// }
```

Costs are persisted to `.ai-costs.json` in project root.

## Fallback Logic

If primary provider fails, tries fallback providers in order:

```
Request
  ↓
Try Primary (Gemini)
  ├─ Success? → Return result
  └─ Fail? → Continue
       ↓
Try Fallback 1 (Claude)
  ├─ Success? → Return result
  └─ Fail? → Continue
       ↓
Try Fallback 2 (OpenAI)
  ├─ Success? → Return result
  └─ Fail? → Continue
       ↓
All Failed → Throw error
```

## Testing

```bash
npm test                      # Run all tests
npm run test:watch           # Watch mode
npm run test:coverage        # Coverage report
```

Test files:
- `__tests__/CostTracker.test.ts` - Cost tracking
- `__tests__/providers.test.ts` - Provider implementation
- `__tests__/AIFactory.test.ts` - Factory and configuration
- `__tests__/integration.test.ts` - End-to-end scenarios

## Examples

### Basic Usage

```typescript
import { aiFactory } from '@/lib/ai/AIFactory';

const result = await aiFactory.analyze('text');
console.log(result.data); // ParsedTransaction
```

### Get Provider Health

```typescript
const status = aiFactory.getHealthStatus();
// [
//   { provider: 'gemini', configured: true, failures: 0 },
//   { provider: 'claude', configured: true, failures: 2 },
//   { provider: 'openai', configured: true, failures: 0 }
// ]
```

### Monitor Costs

```typescript
const breakdown = aiFactory.getCostBreakdown();
// { gemini: 0.012, claude: 0.0225, openai: 0.0089 }

const total = aiFactory.getTotalCost(); // 0.0434
```

### Get Specific Provider

```typescript
const provider = aiFactory.getProvider('claude');
if (provider) {
  console.log(provider.getTotalCost());
  console.log(provider.getDebugLog());
}
```

## Configuration

### Environment Variables

```bash
# Primary provider (required)
AI_PRIMARY_PROVIDER=gemini

# Fallback providers (optional, comma-separated)
AI_FALLBACK_PROVIDERS=claude,openai

# Provider-specific
GEMINI_API_KEY=key
GEMINI_MODEL=gemini-flash-lite-latest

CLAUDE_API_KEY=key
CLAUDE_MODEL=claude-3-5-haiku

OPENAI_API_KEY=key
OPENAI_MODEL=gpt-3.5-turbo
```

### Default Models

If model not specified, uses:
- Gemini: `gemini-flash-lite-latest`
- Claude: `claude-3-5-haiku`
- OpenAI: `gpt-3.5-turbo`

## Adding a New Provider

1. **Create class extending BaseProvider**

```typescript
export class MyProvider extends BaseProvider {
  async analyze(text: string): Promise<AnalysisResult> {
    // Implementation
  }
  
  getName(): string {
    return 'myprovider';
  }
  
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
```

2. **Register in AIFactory.createProvider()**

```typescript
case 'myprovider':
  if (config.apiKey) {
    provider = new MyProvider(config.apiKey, config.model);
  }
  break;
```

3. **Add pricing to types.ts**

```typescript
PROVIDER_PRICING['myprovider'] = {
  'model-name': {
    inputPrice: 0.5,
    outputPrice: 1.5,
  }
}
```

## Debugging

### Enable Debug Logging

```typescript
const result = await aiFactory.analyze('text');
console.log(result.debugLog);
// [
//   '=== Gemini Analysis Started ===',
//   '✓ Sanitized text: test',
//   '→ Calling Gemini API...',
//   '← Gemini response received: {...}',
//   '✓ Successfully parsed response',
//   'Tokens: 45 input, 23 output | Cost: $0.000028'
// ]
```

### Check Configuration

```typescript
import { logProviderConfiguration } from '@/lib/ai/config/environmentConfig';

logProviderConfiguration();
// === AI Provider Configuration ===
// Primary: gemini (gemini-flash-lite-latest)
// Fallbacks:
//   - claude (claude-3-5-haiku)
// ================================
```

## File Structure

```
lib/ai/
├── AIFactory.ts                      # Provider factory with fallback
├── types.ts                          # Interfaces & types
├── config/
│   └── environmentConfig.ts          # .env parsing & validation
├── services/
│   └── CostTracker.ts                # Cost tracking
├── providers/
│   ├── BaseProvider.ts               # Abstract base
│   ├── GeminiProvider.ts
│   ├── ClaudeProvider.ts
│   └── OpenAIProvider.ts
└── __tests__/
    ├── CostTracker.test.ts
    ├── providers.test.ts
    ├── AIFactory.test.ts
    └── integration.test.ts
```

## Documentation

See [`../../docs/AI_PROVIDER_SYSTEM.md`](../../docs/AI_PROVIDER_SYSTEM.md) for comprehensive documentation.

## Performance

| Provider | Avg Speed | Cost (1k calls) | Quality |
|----------|-----------|-----------------|---------|
| Gemini | ~500ms | $0.35 | Good |
| Claude | ~800ms | $0.90 | Excellent |
| OpenAI | ~600ms | $0.55 | Very Good |

## Troubleshooting

### Provider not initialized

**Error:** `No AI providers available`

**Solution:** Check `AI_PRIMARY_PROVIDER` env var and corresponding API key.

```bash
# Check configuration
npx ts-node -e "import { logProviderConfiguration } from './lib/ai/config/environmentConfig'; logProviderConfiguration();"
```

### All providers failed

**Error:** `All AI providers failed. No fallback available.`

**Solution:** Check API keys and network. See debug log for details.

```typescript
try {
  await aiFactory.analyze('test');
} catch (error) {
  const failures = aiFactory.getFailureLog();
  failures.forEach(f => console.log(`${f.provider}: ${f.error}`));
}
```

### High costs

**Solution:** Switch to cheaper model or provider.

```bash
# Current setup
AI_PRIMARY_PROVIDER=gemini           # ~$0.35 per 1k calls
AI_FALLBACK_PROVIDERS=claude,openai  # ~$0.90 per 1k calls

# Cheaper setup
AI_PRIMARY_PROVIDER=gemini           # CHEAPEST
AI_FALLBACK_PROVIDERS=openai,claude  # Use OpenAI before Claude
```

## License

MIT
