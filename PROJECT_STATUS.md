# Budget Tracker - Project Status & Architecture

**Last Updated:** October 9, 2026 (Cashew subcategories, x-api-key on all webhooks)  
**Version:** 0.4.0  
**Status:** Core system + AI providers + Cashew integration; all webhooks x-api-key protected

---

## 🎯 Project Vision

A **webhook-based budget tracking system** that:
1. Captures financial transactions via MacroDroid notifications from bank apps
2. Analyzes transactions intelligently with Gemini AI
3. Stores enriched data in Google Sheets
4. Syncs data bidirectionally with Android budget app

---

## 📋 What We've Built So Far

### ✅ Core Webhook System (Complete)

**Endpoint:** `POST /api/webhook/hook-with-params`

Processes financial transactions with the following pipeline:

```
Input Text (Bank SMS/Notification)
    ↓
[1] Parse request & extract parameters
    ↓
[2] Sanitize & validate input
    ↓
[3] Pre-extract amount (symbol-based: $, €, £, ₽)
    ↓
[4] Analyze with Gemini AI (categorize, extract merchant, detect intent)
    ↓
[5] Detect transaction type & extract details
    ↓
[6] Save to Google Sheets
    ↓
Response (with optional debug logs)
```

**Headers:** `x-api-key: <WEBHOOK_SECRET>` (required; also on its GET health check)

**Query Parameters:**
- `app`: Source app name (e.g., "Gmail", "Telegram", "Bank")
- `body`: Transaction text to analyze
- `source`: Source type - Email, Telegram, Viber, Bank, Other (optional)
- `debug`: Set to "true" for detailed logs (optional)

**Example:**
```
POST /api/webhook/hook-with-params?app=Gmail&source=Email&body=Payment%20500%20UAH%20Starbucks&debug=true
Header: x-api-key: <WEBHOOK_SECRET>
```

---

### 🏗️ Clean Architecture (7 Layers)

```
app/api/webhook/
  └─ hook-with-params/route.ts
     └─ Orchestrates all services

lib/
├── ai/                         # NEW: Pluggable AI Provider System
│   ├── AIFactory.ts            # Provider factory with fallback logic
│   ├── types.ts                # AI interfaces & cost tracking types
│   ├── config/
│   │   └── environmentConfig.ts # .env parsing & validation
│   ├── services/
│   │   └── CostTracker.ts      # Cost tracking & persistence
│   ├── providers/
│   │   ├── BaseProvider.ts     # Abstract base for all providers
│   │   ├── GeminiProvider.ts   # Google Generative AI
│   │   ├── ClaudeProvider.ts   # Anthropic Claude
│   │   └── OpenAIProvider.ts   # OpenAI GPT
│   └── __tests__/              # 4 test suites (114 tests passing)
│
├── config/
│   ├── environment.ts          # Load & validate .env
│   └── prompts.ts              # Centralized AI prompts
│
├── services/
│   ├── requestParser.ts        # Extract app, body, params
│   ├── amountExtractor.ts      # Pre-extract amounts (regex-based)
│   ├── transactionAnalyzer.ts  # AI-powered analysis (uses AIFactory)
│   └── transactionTypeDetector.ts # Extract card#, ref, type
│
├── repositories/
│   └── sheetsRepository.ts     # Google Sheets API wrapper
│
├── utils/
│   ├── errorHandler.ts         # Logger, Timer, error mapping
│   └── validation.ts           # Input sanitization
│
└── types.ts                    # Shared TypeScript interfaces
```

---

### 🤖 AI Provider System (NEW - October 4, 2026)

**Status:** ✅ Complete - Pluggable, tested, production-ready

#### What's New

The transaction analysis now uses a **pluggable AI provider system** with:

- ✅ **Multiple AI Providers** - Switch between Gemini, Claude, OpenAI
- ✅ **Automatic Fallback Logic** - If primary fails, tries fallback providers
- ✅ **Cost Tracking** - Monitor spending across all providers
- ✅ **Provider Agnostic** - Same prompt works across all providers
- ✅ **Extensible** - Add new providers by extending `BaseProvider`

#### How It Works

```
Request: "Payment 500 UAH"
    ↓
Try Primary Provider (from AI_PRIMARY_PROVIDER env)
    ├─ Success? → Return result + cost
    └─ Fail? → Continue
        ↓
Try Fallback Providers (in order from AI_FALLBACK_PROVIDERS)
    ├─ Success? → Return result + cost
    └─ Fail? → Continue
        ↓
All Failed → Return error with failure log
```

#### Configuration

```bash
# .env.local example
AI_PRIMARY_PROVIDER=gemini              # Try Gemini first
AI_FALLBACK_PROVIDERS=claude,openai     # Then Claude, then OpenAI

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-flash-lite-latest   # Cheapest option

CLAUDE_API_KEY=your_claude_key
CLAUDE_MODEL=claude-3-5-haiku           # Good balance

OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-3.5-turbo              # Budget option
```

#### Cost Tracking

Every API call is tracked:

```typescript
import { aiFactory } from '@/lib/ai/AIFactory';

const result = await aiFactory.analyze('Payment 500 UAH');

// Get total cost
console.log(aiFactory.getTotalCost()); // $0.0345

// Get breakdown by provider
console.log(aiFactory.getCostBreakdown()); 
// { gemini: 0.012, claude: 0.0225, openai: 0.0089 }

// Get health status
console.log(aiFactory.getHealthStatus());
// [
//   { provider: 'gemini', configured: true, failures: 0 },
//   { provider: 'claude', configured: true, failures: 1 },
//   { provider: 'openai', configured: true, failures: 0 }
// ]
```

Costs persisted to `.ai-costs.json` in project root.

#### Pricing (October 2026)

| Provider | Model | Input | Output | Per 1k Calls |
|----------|-------|-------|--------|--------------|
| **Gemini** | gemini-flash-lite | $0.075/M | $0.30/M | ~$0.35 |
| Claude | claude-3-5-haiku | $0.80/M | $4.00/M | ~$0.90 |
| OpenAI | gpt-3.5-turbo | $0.50/M | $1.50/M | ~$0.55 |

**Gemini is the cheapest, Claude has highest quality.**

---

### 🧠 Smart Features

#### 1. **Amount Extraction (Two-Stage)**
- **Stage 1**: Symbol-based regex (fast, local)
  - Detects: `$500`, `€100`, `£50`, `₽1000`, etc.
  - Returns immediately if found
  
- **Stage 2**: Gemini fallback (smart, handles edge cases)
  - "п'ять тисяч гривень" → 5000 UAH
  - "50 лек" → 50 ALL
  - "долар триста" → 300 USD

#### 2. **Currency Support (All ISO 4217)**
The Gemini prompt accepts any currency code with helpful mappings:
- `UAH` (грн, гривня)
- `USD` (долар, $)
- `EUR` (євро, €)
- `ALL` (лек)
- `RSD` (дин)
- `MDL` (лей)
- Any other ISO 4217 code

#### 3. **Transaction Intent Detection**
Filters **action requests** vs **completed transactions**:

✅ **Completed (Stored):**
- "Платив 500 грн за кофе" (I paid 500 UAH for coffee)
- "Перевів 1000 USD" (I transferred 1000 USD)
- "Отримав гривні" (I received UAH)

❌ **Rejected (Not stored):**
- "Проплати 500 грн" (Pay 500 UAH) — action request
- "Переведи 1000 USD" (Transfer 1000 USD) — action request
- "Закупи ліки" (Buy medicine) — action request

#### 4. **Rich Transaction Details**
Extracts and stores:
- ✅ `category` - AI-detected (Їжа, Транспорт, Розвага, etc.)
- ✅ `amount` - Numeric value
- ✅ `currency` - ISO code
- ✅ `merchant` - Store/vendor name
- ✅ `date` - DD.MM.YYYY HH:MM (includes time now)
- ✅ `source` - App name (Gmail, Telegram, etc.)
- ✅ `sourceType` - Channel type (Email, SMS, Telegram, Bank)
- ✅ `transactionType` - Payment, Transfer, Refund, etc.
- ✅ `details` - Card number, reference, receipt details

---

### 🧪 Test Coverage (245 Tests - All Passing)

| Suite | Tests | Covers |
|---|---|---|
| `lib/services/__tests__/amountExtractor.test.ts` | 21 | Symbol-based extraction, separators, decimals |
| `lib/utils/__tests__/validation.test.ts` | 27 | Sanitization (null bytes, control chars, XSS), normalization |
| `lib/utils/__tests__/apiKeyAuth.test.ts` | 16 | x-api-key: correct/wrong/missing/prefix/case, fails closed when secret unset, guard responses (401/500), no key/secret in responses or logs |
| `lib/services/__tests__/cashewConfigLoader.test.ts` | 32 | Env loading, bad JSON, Unicode, singleton, CASHEW_SUBCATEGORIES shape/warnings, getSubcategoriesFor, getCategoryOptions |
| `lib/services/__tests__/accountMapper.test.ts` | 31 | Case-insensitive matching, first-item fallback, passthrough when unconfigured, subcategory must belong to the chosen category |
| `lib/services/__tests__/cashewLinkGenerator.test.ts` | 24 | Parameter mapping incl. `subcategory`, no `date`/`currency`, encoding, truncation, invalid amounts |
| `lib/config/__tests__/prompts.test.ts` | 28 | Both prompts, category tree rendering, `$` safety, Cashew rules in prompt, provider wiring and subcategory parsing |
| `lib/ai/__tests__/CostTracker.test.ts` | 11 | Cost calculation, aggregation, persistence |
| `lib/ai/__tests__/providers.test.ts` | 24 | Provider init, JSON parsing, normalization |
| `lib/ai/__tests__/AIFactory.test.ts` | 17 | Singleton, creation, cost tracking, health, config validation |
| `lib/ai/__tests__/integration.test.ts` | 14 | Fallback scenarios, multi-provider setup |

```bash
npm test               # Run once
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

---

### 📊 Google Sheets Integration

**Stored Data (9 Columns):**

| Column | Type | Example | Source |
|--------|------|---------|--------|
| Date | Text | `03.10.2026 14:35` | System timestamp |
| Category | Text | `Їжа` | Gemini AI |
| Amount | Number | `150` | Regex + Gemini |
| Currency | Text | `UAH` | Gemini |
| Merchant | Text | `Starbucks` | Gemini |
| Source | Text | `Gmail` | URL param `app` |
| Source Type | Text | `Email` | URL param `source` |
| Transaction Type | Text | `Payment` | Transaction detector |
| Details | Text | `Card ending in 1234` | Transaction detector |

**Current Data:**
- 1,134 historical transactions in backup file (`MyFinance.db`)
- SQLite extracted from `.mmbackup` (iOS MinimalMoney backup)
- Ready to import

---

## 📁 Project Structure

```
budget-tracker/
├── app/
│   ├── api/
│   │   └── webhook/
│   │       ├── hook-with-params/
│   │       │   └── route.ts          # Sheets webhook (validation prompt)
│   │       └── cashew-link/
│   │           └── route.ts          # Cashew link webhook (x-api-key, direct prompt)
│   ├── page.tsx                      # Frontend (empty)
│   ├── layout.tsx                    # Next.js layout
│   └── globals.css                   # Tailwind styles
│
├── lib/
│   ├── ai/                          # Pluggable AI Provider System
│   │   ├── AIFactory.ts
│   │   ├── types.ts
│   │   ├── config/
│   │   │   └── environmentConfig.ts
│   │   ├── services/
│   │   │   └── CostTracker.ts
│   │   ├── providers/
│   │   │   ├── BaseProvider.ts
│   │   │   ├── GeminiProvider.ts
│   │   │   ├── ClaudeProvider.ts
│   │   │   └── OpenAIProvider.ts
│   │   ├── __tests__/
│   │   │   ├── CostTracker.test.ts
│   │   │   ├── providers.test.ts
│   │   │   ├── AIFactory.test.ts
│   │   │   └── integration.test.ts
│   │   └── README.md
│   │
│   ├── config/
│   │   ├── environment.ts
│   │   ├── prompts.ts               # Validation + direct AI prompts (single source)
│   │   └── __tests__/prompts.test.ts
│   │
│   ├── services/
│   │   ├── requestParser.ts
│   │   ├── amountExtractor.ts
│   │   ├── transactionAnalyzer.ts   # Uses AIFactory
│   │   ├── transactionTypeDetector.ts
│   │   ├── cashewConfigLoader.ts    # CASHEW_ACCOUNTS / CASHEW_CATEGORIES
│   │   ├── accountMapper.ts         # Constrain account/category (first item = fallback)
│   │   ├── cashewLinkGenerator.ts   # Build the Cashew app link
│   │   └── __tests__/               # amountExtractor, cashewConfigLoader, accountMapper, cashewLinkGenerator
│   │
│   ├── repositories/
│   │   └── sheetsRepository.ts
│   │
│   ├── utils/
│   │   ├── errorHandler.ts
│   │   ├── validation.ts
│   │   ├── apiKeyAuth.ts            # x-api-key vs WEBHOOK_SECRET
│   │   ├── urlEncoder.ts
│   │   └── __tests__/               # validation, apiKeyAuth
│   │
│   └── types.ts
│
├── docs/
│   ├── AI_PROVIDER_SYSTEM.md        # Comprehensive AI system docs
│   ├── API_REFERENCE.md             # HTTP API reference
│   ├── CASHEW_INTEGRATION.md        # Cashew link integration guide
│   └── MACRODROID_INTEGRATION.md    # MacroDroid setup
│
├── tmp/
│   ├── MyFinance.db              # Extracted SQLite database
│   ├── backup_meta               # Backup metadata
│   └── 2026_10_03_22_09_11_075893.mmbackup  # Original backup
│
├── .env.example                  # Environment template (NEW)
├── .env.local                    # Secrets (not committed)
├── .ai-costs.json                # Cost tracking (auto-generated, git-ignored)
├── package.json
├── tsconfig.json
├── jest.config.js
├── jest.setup.js
├── next.config.ts
├── README.md
└── PROJECT_STATUS.md             # This file
```

---

## 🔑 Environment Variables (.env.local)

See `.env.example` for complete template.

**Required (at least one AI provider):**
```
# AI Provider Configuration
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDERS=claude,openai

# At least primary provider API key
GEMINI_API_KEY=your_gemini_api_key
CLAUDE_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key

# Google Sheets
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

**Required for `/cashew-link`:**
```
WEBHOOK_SECRET=your_shared_secret          # clients send it as the x-api-key header
CASHEW_ACCOUNTS=["Ukrsib","Mono","Privat"] # first item = fallback account
CASHEW_CATEGORIES=["Інше","Авто","Доходи"] # first item = fallback category
CASHEW_SUBCATEGORIES={"Авто":["Паливо"]}   # optional: subcategories per category
```

---

## 🚀 Current Technology Stack

- **Framework:** Next.js 16.3.8 (App Router)
- **Language:** TypeScript 5
- **AI:** Pluggable system - Gemini (default), Claude, OpenAI
- **Database:** Google Sheets API v4
- **Testing:** Jest 29 + TypeScript (114 tests passing)
- **Linting:** ESLint 9
- **Styling:** Tailwind CSS 4
- **Dependencies Added:** @anthropic-ai/sdk, openai (for provider support)

---

## ✅ What's Working

1. ✅ **Webhook endpoints** - Two production-ready endpoints (hook-with-params, cashew-link)
2. ✅ **MacroDroid integration** - Accepts app + body notification parameters
3. ✅ **AI analysis** - Gemini with Claude/OpenAI fallback
4. ✅ **Amount extraction** (symbol-based + AI fallback)
5. ✅ **Intent detection** (rejects action requests)
6. ✅ **Multi-currency** support (all ISO 4217)
7. ✅ **Google Sheets storage** (9 enriched columns)
8. ✅ **Cashew link generation** (account/category constrained to your Cashew lists, direct AI prompt)
9. ✅ **Error handling** (comprehensive logging)
10. ✅ **Unit tests** (245 passing, 11 test suites)
11. ✅ **Debug mode** (`?debug=true` parameter with detailed logging)
12. ✅ **Cost tracking** (per-provider cost monitoring)
13. ✅ **Fallback logic** (automatic provider switching)
14. ✅ **Configuration validation** (environment config)
15. ✅ **Build & Type Safety** (TypeScript, Next.js)
16. ✅ **URL encoding** (special chars, Unicode, Cyrillic support)
17. ✅ **JSON response format** (matching hook-with-params pattern)
18. ✅ **Cashew subcategories** (`CASHEW_SUBCATEGORIES`, AI picks category + subcategory, validated against your config)
19. ✅ **API key protection** on all webhook endpoints (`x-api-key` header vs `WEBHOOK_SECRET`, fails closed)

---

### 📱 Cashew App Integration

**Status:** ✅ Working (last reviewed October 9, 2026)

```
GET/POST /api/webhook/cashew-link
```

Turns a bank notification (sent by MacroDroid) into a Cashew app link that adds the transaction in one tap.
Link parameters follow the official docs: <https://cashewapp.web.app/faq.html#app-links>
(raw page: <https://cashewapp.web.app/assets/docs/automation/app-links.md>).

**Request**
- Header `x-api-key: <WEBHOOK_SECRET>` (**required**)
  - missing/wrong key → `401 {"success":false,"error":"Unauthorized"}`
  - `WEBHOOK_SECRET` not set on the server → `500` (fails closed, never open)
  - the key is accepted **only** as a header, never as a query parameter
- Query parameters:
  - `app` - **account name** (e.g. `Mono`, `Privat`, `Ukrsib`), matched case-insensitively against `CASHEW_ACCOUNTS`. Missing/unknown → **first item of `CASHEW_ACCOUNTS`**.
    (Note: on `/hook-with-params` the same parameter means the *source app*.)
  - `body` - notification text (query parameter or request body)
  - `debug=true` - include `debugLog` (not returned on 401/500-auth responses)

**Pipeline**
```
x-api-key check
  → RequestParser (shared with hook-with-params)
  → validateTransactionBody (sanitize)
  → TransactionAnalyzer.analyzeDirect(text, categories + subcategories)   ← DIRECT prompt
  → amount > 0 check (422 if the AI found no amount)
  → generateCashewLink → account/category constrained (case-insensitive, first item = fallback);
    subcategory kept only if it belongs to the chosen category, otherwise dropped
  → { success, url, transaction }
```

**Two AI prompts (lib/config/prompts.ts - single source of truth)**

| | Validation prompt | Direct prompt |
|---|---|---|
| Used by | `/hook-with-params` | `/cashew-link` |
| Input | arbitrary text | already a bank notification |
| `isTransaction` check | yes | no |
| Categories | built-in default list | your `CASHEW_CATEGORIES` + `CASHEW_SUBCATEGORIES`, passed in by the route and rendered as a JSON tree `{"Авто":["Паливо",...],...}` |
| Returns | `isTransaction`, `category`, amount, currency, merchant, details | `category`, `subcategory`, amount, currency, merchant, details |
| Tuned for Cashew | no | yes: positive amount, ignores balance (`Залишок`/`Баланс`), income category for money received, subcategory only from the chosen category, short title, note ≤ 100 chars, notification text fenced as data |

**Link parameters sent**

| Cashew param | Source |
|---|---|
| `amount` | AI amount (always positive; income vs expense comes from the category's polarity in Cashew) |
| `category` | AI category constrained to `CASHEW_CATEGORIES` (case-insensitive, first item = fallback) |
| `subcategory` | AI subcategory, only if it is listed under the chosen category in `CASHEW_SUBCATEGORIES`; otherwise omitted (no fallback - the transaction stays in the main category) |
| `wallet` | `app` constrained to `CASHEW_ACCOUNTS` (Cashew accepts `account` or `wallet`) |
| `title` | AI `merchant` (≤ 100 chars) |
| `notes` | AI `details`, e.g. last card digits (≤ 200 chars); omitted when empty |

**Deliberately not sent**
- `date` - Cashew defaults to the **current date/time on your device**, so there is no server-timezone problem.
- `currency` - Cashew has no such parameter (currency belongs to the account). The AI still extracts it; it is returned in the JSON only.

**Example**
```bash
curl -G "http://localhost:3000/api/webhook/cashew-link" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Ukrsib" \
  --data-urlencode "body=Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH"
```
```json
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=405.5&category=%D0%9F%D0%BE%D0%BA%D1%83%D0%BF%D0%BA%D0%B8&wallet=Ukrsib&title=Pelham&notes=%D0%9A%D0%B0%D1%80%D1%82%D0%BA%D0%B0%20*4417",
  "transaction": { "amount": 405.5, "category": "Покупки", "subcategory": "Інші товари", "merchant": "Pelham", "currency": "UAH" }
}
```
`subcategory` is an empty string when none applies.

**Configuration (.env.local)** - see `.env.example` for the full approved structure
```bash
WEBHOOK_SECRET=<openssl rand -hex 32>

# ORDER MATTERS: first item = fallback. Names must match Cashew (case-insensitive).
CASHEW_ACCOUNTS=["Ukrsib","Mono","Privat"]

# Top-level categories; first item = fallback ("Інше"), include an income category ("Доходи").
# Values with an apostrophe: wrap in `backticks` (or paste raw in the Vercel dashboard).
CASHEW_CATEGORIES=`["Інше","Продукти","Кафе та ресторани","Транспорт","Авто","Дім","Рахунки та збори","Здоров'я","Покупки","Догляд за собою","Розваги","Підписки","Освіта","Подорожі","Подарунки","Благодійність","Доходи"]`

# Optional: subcategories per category (keys must be in CASHEW_CATEGORIES)
CASHEW_SUBCATEGORIES=`{"Авто":["Паливо","Тех обслуговування","Паркування"],"Транспорт":["Таксі","Громадський транспорт","Потяги та автобуси"],...}`
```
Subcategory names should be unique across categories: Cashew resolves `subcategory` by name and takes the first match (the loader warns about duplicates).
Config is read once at startup: **restart the server after editing**.

**Implementation**
- `app/api/webhook/cashew-link/route.ts` - thin handler (auth → parse → analyze → link)
- `lib/utils/apiKeyAuth.ts` - `checkApiKey()` + `guardApiKey()` (constant-time, fails closed, header-only), shared by all webhook routes
- `lib/services/cashewConfigLoader.ts` - loads `CASHEW_ACCOUNTS` / `CASHEW_CATEGORIES` / `CASHEW_SUBCATEGORIES`, `getCategoryOptions()` for the prompt
- `lib/services/accountMapper.ts` - case-insensitive constraint with first-item fallback; `validateSubcategory()` keeps a subcategory only under its own category; reports `accountMatched` / `categoryMatched` / `subcategoryMatched`
- `lib/services/cashewLinkGenerator.ts` - builds the link, returns `{ url, mapping }`
- `lib/utils/urlEncoder.ts` - query-string encoding, sanitizing, truncation
- `lib/config/prompts.ts` + `BaseProvider.analyzeDirect()` → `AIFactory.analyzeDirect()` → `TransactionAnalyzer.analyzeDirect()`

**Design review (Oct 9)** - removed ~12 unused exports and their tests (YAGNI); category is constrained in one place (DRY); the AI layer no longer imports Cashew config (DIP - categories are passed in); the route reuses `RequestParser` and `validateTransactionBody` like the first endpoint. `/hook-with-params` behaviour is unchanged (its prompt was verified byte-identical to the pre-refactor one).

**MacroDroid flow**
1. MacroDroid receives the bank notification
2. HTTP GET to `/api/webhook/cashew-link?app=<account>&body=<text>` with header `x-api-key`
3. Server returns JSON with `url`
4. MacroDroid opens `url` in Cashew → transaction is added with your device's current time

**Tests:** CashewConfigLoader 32, AccountMapper 31, CashewLinkGenerator 24, apiKeyAuth 16, prompts 28

---

## ⚠️ Known Limitations

1. **Android sync:**
   - Current app has no API
   - Can only import via manual backup
   - No automatic hourly sync

2. **Historical data:**
   - 1,134 transactions in backup file
   - Need to extract, enrich, and import
   - Not yet automated

3. **Bidirectional sync:**
   - Currently one-way: Android → Webhook → Sheets
   - Can't automatically push data back to Android
   - Requires manual re-import of backup

4. **AI Provider limitations:**
   - No concurrent provider attempts (sequential fallback only)
   - No provider load balancing
   - Cost tracking local only (not sent to remote analytics)

5. **Cashew link limitations:**
   - Cashew has no currency parameter: the amount is recorded in the *account's* currency. A EUR payment sent to a UAH account is stored as that number of UAH.
   - Account/category/subcategory names must exist in Cashew (name match, case-insensitive). An unknown category makes Cashew prompt you instead of adding silently.
   - A subcategory name that appears under two categories is ambiguous in Cashew (first match wins). Names that repeat across levels (e.g. top-level "Розваги" and "Подорожі → Розваги") are valid for Cashew but can make the AI's choice less obvious.
   - Unknown `app` values silently use the first account (`Ukrsib`); check `debug=true` output if a transaction lands in the wrong account.
   - Transaction time is when the link is opened, not when the bank notification arrived.

6. **Authentication:** every `/api/webhook/*` handler (`/cashew-link`, `/hook-with-params`, `/finance-hook`, GET and POST) starts with `guardApiKey()` from `lib/utils/apiKeyAuth.ts`. The key is header-only (`x-api-key`), compared in constant time, and an unset `WEBHOOK_SECRET` rejects everything. A new webhook route must call the guard as its first line - there is no global middleware, so it is not automatic. (The very first version of `finance-hook` had a similar check; it was removed in commit `675dbe6`.)

---

## 🎯 Next Steps (Prioritized)

### Phase 1: Testing & Validation (Current)
- [x] Full test suite green (245 tests, 11 suites)
- [x] Cashew endpoint verified with curl (auth, fallback account, balance-ignoring, income category)
- [ ] Verify the generated link on the device end-to-end (account, category, time, notes)
- [x] `WEBHOOK_SECRET` set in `.env.local`
- [x] `x-api-key` check on all `/api/webhook/*` endpoints (shared `guardApiKey`)
- [ ] Add the `x-api-key` header to **every** MacroDroid HTTP action (`/hook-with-params` too, or it will get 401)

### Phase 2: Production Deployment
- [ ] Deploy to production
- [ ] Monitor Cashew link generation success rate
- [ ] Set up error tracking/alerting

### Phase 3: Android Integration & Analytics
- [ ] Evaluate Firefly III migration (better API support)
- [ ] Build import pipeline for historical data (1,134 transactions)
- [ ] Auto-enrich with AI before Sheets insert
- [ ] Set up automated weekly backups
- [ ] Add Cashew link generation metrics/analytics

### Phase 4: Advanced Features
- [ ] Concurrent provider attempts (parallel, not sequential)
- [ ] Provider load balancing
- [ ] A/B testing between providers
- [ ] Custom prompt optimization per provider
- [ ] User analytics & insights
- [ ] QR code generation for Cashew links

---

## 📚 Documentation

- [`docs/AI_PROVIDER_SYSTEM.md`](docs/AI_PROVIDER_SYSTEM.md) - Comprehensive AI system documentation
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - HTTP API reference
- [`docs/CASHEW_INTEGRATION.md`](docs/CASHEW_INTEGRATION.md) - Cashew link integration guide
- [`docs/MACRODROID_INTEGRATION.md`](docs/MACRODROID_INTEGRATION.md) - MacroDroid setup
- [`lib/ai/README.md`](lib/ai/README.md) - Quick reference for AI providers
- [`.env.example`](.env.example) - Environment configuration template

---

## 🔗 Useful Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)

# Testing
npm test                 # Run tests once
npm run test:watch      # Run in watch mode
npm run test:coverage   # Coverage report

# Build
npm run build           # Compile TypeScript
npm run lint            # ESLint check

# Webhook Testing
curl -X POST \
  "http://localhost:3000/api/webhook/hook-with-params?app=Gmail&body=Payment%20150%20UAH%20to%20Starbucks&debug=true" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

# Cashew link (needs WEBHOOK_SECRET)
curl -G "http://localhost:3000/api/webhook/cashew-link" -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Ukrsib" --data-urlencode "body=230 Kastrati, bensina UAH" --data-urlencode "debug=true"

# Health Check
curl -H "x-api-key: $WEBHOOK_SECRET" http://localhost:3000/api/webhook/hook-with-params

# View Costs
tail -100 .ai-costs.json
```

---

## 📊 Development Metrics

| Metric | Value |
|--------|-------|
| Total Lines of Code | ~4,200+ |
| Test Coverage | 245 passing tests (all passing) |
| Test Files | 11 test suites |
| AI Providers Supported | 3 (Gemini, Claude, OpenAI) |
| Fallback Chains | Unlimited (configurable) |
| Transaction Categories | 11 predefined |
| Currencies Supported | All ISO 4217 |
| Build Time | ~15s |
| Test Suite Time | ~3.8s |
| Webhook Endpoints | 2 (hook-with-params, cashew-link) |
| Core Services | 8 services (Analyzer, AmountExtractor, TransactionTypeDetector, CashewConfigLoader, AccountMapper, CashewLinkGenerator, CostTracker, RequestParser) + apiKeyAuth util |

---

## 🎓 Architecture Decisions

### Why Pluggable AI Providers?

1. **Cost Optimization** - Switch to cheapest provider that meets quality needs
2. **Reliability** - Automatic fallback if primary provider fails
3. **Future-proof** - Easy to add new providers (Groq, Together, etc.)
4. **Flexibility** - Test different models without code changes
5. **Observability** - Track costs and performance per provider

### Why Cost Tracking?

1. **Budget Control** - Monitor spending in real-time
2. **Optimization** - Identify expensive operations
3. **Scaling** - Plan for growth with cost estimates
4. **Transparency** - Know exactly what each transaction costs

### Why Fallback Chain?

1. **Resilience** - Service survives provider outages
2. **Graceful Degradation** - Use slower/cheaper provider if needed
3. **No Manual Intervention** - Automatic switching
4. **Audit Trail** - Track which provider analyzed each transaction

---

## 🤝 Contributing

### Adding a New Provider

1. Create `lib/ai/providers/NewProvider.ts` extending `BaseProvider`
2. Implement `analyze()`, `getName()`, `isConfigured()`
3. Add to `AIFactory.createProvider()`
4. Add pricing to `PROVIDER_PRICING`
5. Add tests in `lib/ai/__tests__/`
6. Update `.env.example`

See [`docs/AI_PROVIDER_SYSTEM.md`](docs/AI_PROVIDER_SYSTEM.md) for detailed guide.

---

**Built with ❤️ for intelligent financial tracking**