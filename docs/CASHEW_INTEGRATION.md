# Cashew App Integration - Feature Spec (SDD)

**Created:** October 4, 2026  
**Status:** Ready for Implementation  
**Owner:** Yevhen Shaparenko  
**Version:** 1.2.0 - English categories + International accounts

---

## 📋 Overview

Implement a new webhook endpoint that generates Cashew App Links for quick transaction logging. Users can send transaction data to the webhook, which returns a Cashew app-link that automatically adds the transaction to their Cashew budget app.

This enables MacroDroid automation → Budget Tracker API → Cashew App integration for seamless expense tracking.

---

## 🎯 Goals

1. ✅ Generate Cashew app-links from transaction data
2. ✅ Support main payment accounts (via local config, international examples)
3. ✅ Map custom categories (via local config, English names)
4. ✅ Handle currency conversion/selection
5. ✅ Provide URL-encoded, mobile-friendly links
6. ✅ Support batch link generation (multiple transactions)

---

## 🏗️ Architecture

### New Endpoint

```
POST /api/webhook/cashew-link
GET  /api/webhook/cashew-link
```

### Request Format

**Query Parameters:**
```
app: string              // Source app (Gmail, Telegram, Viber, Bank, Other)
body: string            // Transaction text to analyze
source: string          // Source type (Email, Telegram, Viber, Bank, Other)
debug: boolean          // Enable debug logging (optional)
format: string          // Output format: 'url' | 'json' | 'html' (default: 'url')
account: string         // Target Cashew account name (optional)
```

**JSON Body (POST):**
```json
{
  "app": "Gmail",
  "body": "Payment 500 UAH to Starbucks",
  "source": "Email",
  "account": "Monobank",
  "format": "json",
  "debug": false
}
```

### Response Format

**URL Format (default):**
```
https://cashewapp.web.app/addTransaction?amount=500&category=Food%20%26%20Groceries&account=Monobank&title=Starbucks&notes=Payment&date=2026-10-04
```

**JSON Format:**
```json
{
  "success": true,
  "link": "https://cashewapp.web.app/addTransaction?amount=500&category=...",
  "transaction": {
    "amount": 500,
    "category": "Food & Groceries",
    "merchant": "Starbucks",
    "currency": "UAH",
    "account": "Monobank",
    "date": "2026-10-04"
  },
  "cost": {
    "provider": "gemini",
    "costUSD": 0.000037
  },
  "debugLog": ["✓ Sanitized text...", "→ Calling Gemini API..."]
}
```

**HTML Format (for web/email links):**
```html
<a href="https://cashewapp.web.app/addTransaction?..." 
   class="cashew-link" 
   target="_blank">
  📊 Add to Cashew: 500 UAH - Starbucks
</a>
```

---

## 📊 Data Mapping (Locally Configurable)

### Payment Accounts (Configurable - International)

Stored locally in `.env.local` as JSON. Supports any bank or financial account worldwide:

**Ukrainian Banks Example:**
```bash
# .env.local
CASHEW_ACCOUNTS='{
  "Ukrsib": "UkrSibbank",
  "Mono": "Monobank",
  "Privat": "PrivatBank",
  "Ukrsib EUR": "UkrSibbank EUR",
  "Privat EUR": "PrivatBank EUR"
}'
```

**US Banks Example:**
```bash
CASHEW_ACCOUNTS='{
  "Checking": "Wells Fargo Checking",
  "Savings": "Chase Savings",
  "AmEx": "American Express",
  "Investment": "Fidelity Brokerage",
  "HSA": "HSA Bank"
}'
```

**European Banks Example:**
```bash
CASHEW_ACCOUNTS='{
  "ING": "ING Orange Account",
  "Revolut": "Revolut EUR",
  "Wise": "Wise Multi-Currency",
  "Bunq": "Bunq Easy Bank",
  "N26": "N26 Checking"
}'
```

**Multi-Currency Example:**
```bash
CASHEW_ACCOUNTS='{
  "UAH Checking": "UkrSibbank UAH",
  "EUR Savings": "ING Europe EUR",
  "USD Investment": "Fidelity USD",
  "BTC Wallet": "Crypto Wallet BTC",
  "Card": "Visa Debit Card"
}'
```

**Configuration:**
- Key: Budget tracker account name (internal identifier)
- Value: Cashew account name (what Cashew app expects)
- Fully customizable per user deployment
- Loaded at runtime via `CashewConfigLoader`
- No restrictions on account types: banks, wallets, cards, crypto, etc.
- Can map any local name to any international account name

---

### Category Handling (Configurable - Any Language)

Stored locally in `.env.local` as JSON array of allowed category names. Categories can be in any language:

```bash
# .env.local - Ukrainian categories (example)
CASHEW_CATEGORIES='["Побут", "Покупки", "Розваги", "Рахунки та засоби", "Подарунки", "Освіта", "Здоров\'я", "Підписки", "Доходи", "Краса", "Подорожі", "Донати", "Авто", "Транспорт", "Будинок"]'
```

Or in English:
```bash
# Alternative: English categories
CASHEW_CATEGORIES='["Food & Groceries", "Shopping", "Entertainment", "Bills & Utilities", "Gifts", "Education", "Health & Medical", "Subscriptions", "Income", "Beauty", "Travel", "Donations", "Automotive", "Transportation", "Home & Housing"]'
```

**Configuration:**
- Array of category names (any language supported)
- If `CASHEW_CATEGORIES` not configured: AI returns categories in detected language
- If configured: Only categories in the list are accepted
- Fully customizable per user deployment

**Without configuration** (recommended):
- Skip `CASHEW_CATEGORIES` entirely
- AI will detect and return category names in the transaction's language
- English transaction → English categories (Food, Shopping, etc.)
- Ukrainian transaction → Ukrainian categories (Побут, Покупки, etc.)
- Any language works ✅

### Default Fallback

If config not found in `.env.local`:
- Accounts: Use account name directly (passthrough)
- Categories: Use category name directly (passthrough)
- No hardcoded mappings - purely configurable

### Currency Handling

| Currency | Code | Example | Cashew Format |
|---|---|---|---|
| Ukrainian Hryvnia | UAH | 500 UAH | `UAH` |
| Euro | EUR | €100 | `EUR` |
| US Dollar | USD | $200 | `USD` |
| British Pound | GBP | £50 | `GBP` |
| Polish Zloty | PLN | 250 PLN | `PLN` |
| Czech Koruna | CZK | 1000 CZK | `CZK` |
| Swiss Franc | CHF | CHF 100 | `CHF` |
| Canadian Dollar | CAD | CAD 150 | `CAD` |

**Default behavior:**
- If currency detected → include in Cashew link
- If no currency → use account's default currency
- Cashew will auto-convert based on exchange rates

---

## 🔄 Processing Flow

```
Request
  ↓
[1] Parse request params (app, body, source, account, format, debug)
  ↓
[2] Validate input (sanitize, check for XSS)
  ↓
[3] Use TransactionAnalyzer to analyze text
    - Extract: amount, category, merchant, currency, type
    - Uses AI (Gemini/Claude/OpenAI via AIFactory)
    - Returns: ParsedTransaction + CostInfo
  ↓
[4] Load local config (CASHEW_ACCOUNTS, CASHEW_CATEGORIES)
    - Map account name via CashewConfigLoader
    - Map category name via CashewConfigLoader
    - Fallback to passthrough if not in config
  ↓
[5] Validate against mapped account, category, currency
  ↓
[6] Build Cashew app-link
    - URL encode parameters
    - Handle special characters
    - Set proper date format
  ↓
[7] Format response (url | json | html)
  ↓
[8] Return with cost tracking
```

---

## 💾 Implementation Files

### New Files

```
lib/
├── services/
│   ├── cashewLinkGenerator.ts     # Core link generation
│   ├── cashewConfigLoader.ts      # Load accounts/categories from .env
│   ├── accountMapper.ts            # Map accounts & categories
│   └── __tests__/
│       ├── cashewLinkGenerator.test.ts
│       ├── cashewConfigLoader.test.ts
│       └── accountMapper.test.ts
│
└── utils/
    └── urlEncoder.ts               # URL encoding utilities
```

### Modified Files

```
app/api/webhook/
└── cashew-link/                   # New endpoint
    └── route.ts                   # GET/POST handler

.env.example                        # Add CASHEW_ACCOUNTS, CASHEW_CATEGORIES
```

---

## 🔌 Integration Points

### Use Existing Services

1. **TransactionAnalyzer** - Analyze transaction text
   - Uses AIFactory (pluggable providers)
   - Returns ParsedTransaction + CostInfo
   - Handles amount extraction, categorization

2. **AmountExtractor** - Pre-extract amounts
   - Symbol-based regex: $, €, £, ₽
   - Fast local extraction

3. **Configuration System** - Load local mappings
   - Parse JSON from `.env.local`
   - Fallback to defaults
   - Runtime validation

### Reuse Configuration

- Use existing `.env.local` for AI provider config
- Add `CASHEW_ACCOUNTS` and `CASHEW_CATEGORIES` (custom)
- Access to category lists via TransactionAnalyzer
- Currency definitions from types.ts

---

## 📝 Examples

### Example 1: Simple Payment (Ukraine)

**Request:**
```
POST /api/webhook/cashew-link?app=Gmail&body=Payment%20500%20UAH%20to%20Starbucks&account=Monobank&format=json
```

**Response:**
```json
{
  "success": true,
  "link": "https://cashewapp.web.app/addTransaction?amount=500&category=Food%20%26%20Groceries&account=Monobank&title=Starbucks&date=2026-10-04",
  "transaction": {
    "amount": 500,
    "category": "Food & Groceries",
    "merchant": "Starbucks",
    "currency": "UAH",
    "account": "Monobank"
  }
}
```

---

### Example 2: US Account (Wells Fargo)

**Config (.env.local):**
```bash
CASHEW_ACCOUNTS='{
  "Checking": "Wells Fargo Checking",
  "Savings": "Chase Savings"
}'
```

**Request:**
```
POST /api/webhook/cashew-link?body=Filled%20up%20gas%2045%20USD&account=Checking
```

**Response:**
```json
{
  "transaction": {
    "amount": 45,
    "account": "Wells Fargo Checking",
    "category": "Transportation",
    "currency": "USD"
  }
}
```

---

### Example 3: European Multi-Currency

**Config (.env.local):**
```bash
CASHEW_ACCOUNTS='{
  "ING": "ING Orange Account",
  "Revolut": "Revolut EUR"
}'

CASHEW_CATEGORIES='{
  "Дохід": "Income",
  "Розваги": "Entertainment",
  "Транспорт": "Transportation"
}'
```

**Request:**
```
POST /api/webhook/cashew-link?body=Movie%20tickets%20%E2%82%AC15&account=ING&format=json
```

**Response:**
```json
{
  "transaction": {
    "amount": 15,
    "currency": "EUR",
    "account": "ING Orange Account",
    "category": "Entertainment"
  }
}
```

---

### Example 4: HTML for Email

**Request:**
```
GET /api/webhook/cashew-link?body=Coffee%20150%20UAH&format=html&account=Monobank
```

**Response:**
```html
<div class="cashew-widget">
  <a href="https://cashewapp.web.app/addTransaction?amount=150&..." 
     class="cashew-btn">
    📊 Add to Cashew
  </a>
  <p class="cashew-summary">150 UAH • Food & Groceries • Monobank</p>
</div>
```

---

## 🧪 Test Cases

### Happy Path
- [ ] Single transaction → Cashew link
- [ ] Account mapping from config → Correct Cashew account
- [ ] Category mapping from config → Correct Cashew category (English)
- [ ] Multiple currencies → Proper encoding
- [ ] Special characters → URL encoded
- [ ] International accounts → Works with any bank/wallet
- [ ] Batch links (JSON array) → Multiple transactions
- [ ] Fallback mapping (passthrough) → Direct use of names

### Edge Cases
- [ ] Missing CASHEW_ACCOUNTS in .env → Use passthrough
- [ ] Missing CASHEW_CATEGORIES in .env → Use passthrough
- [ ] Invalid JSON in config → Fallback gracefully
- [ ] Missing category → Use fallbackCategory
- [ ] Missing amount → Prompt in Cashew
- [ ] Invalid account in request → Error response
- [ ] XSS attempt in title → Sanitized
- [ ] Unicode text (Cyrillic, Latin, etc.) → Properly encoded
- [ ] Very long notes → Truncated appropriately

### Error Handling
- [ ] Invalid request params → 400
- [ ] Config parse error → 500 with error
- [ ] Analysis fails → 422 with reason
- [ ] Unknown account (not in config) → 404
- [ ] Rate limited → 429

---

## 📐 URL Encoding

### Cashew App-Link Format

```
https://cashewapp.web.app/addTransaction?
  amount={number}
  &category={URL_ENCODED}
  &account={URL_ENCODED}
  &title={URL_ENCODED}
  &notes={URL_ENCODED}
  &date={YYYY-MM-DD}
  &currency={CODE}
```

**Special Handling:**
- Ukrainian/Cyrillic characters: UTF-8 → URL encoded
- English characters: ASCII safe encoding
- Spaces: `%20` or `+`
- Special chars: `&` → `%26`, `#` → `%23`, `&` → `%26`
- Emoji: UTF-8 → URL encoded (optional)

---

## 🔐 Security

**Input Validation:**
- [ ] Sanitize all user input (XSS prevention)
- [ ] Validate account names against config (or allow passthrough)
- [ ] Validate categories against config (or allow passthrough)
- [ ] Length limits on title/notes (max 500 chars)
- [ ] Amount validation (positive numbers)
- [ ] JSON config parsing with error handling

**Rate Limiting:**
- [ ] 100 requests/minute per IP
- [ ] 1000 requests/hour per IP

**Logging:**
- [ ] Log all successful links created
- [ ] Log API errors
- [ ] Track cost per request
- [ ] Log config parsing errors
- [ ] Don't log sensitive transaction details

---

## 📱 Mobile Optimization

**Link Behavior:**
- Works on: Android (Cashew app installed) + iOS + Web
- Fallback: Opens web version if app not installed
- Encoding: Compact, <2KB per link
- QR Code: Generate QR code option for complex links

---

## 🚀 Deployment

### Dependencies
- Existing: TransactionAnalyzer, AmountExtractor, AIFactory
- New: URL encoder utilities, JSON config parser
- Libraries: `node-url-encode` (built-in)

### Configuration Files

**Update `.env.example`:**
```bash
# Cashew Integration - Ukrainian Banks
CASHEW_ACCOUNTS='{
  "Ukrsib": "UkrSibbank",
  "Mono": "Monobank",
  "Privat": "PrivatBank"
}'

# Or use international example
# CASHEW_ACCOUNTS='{
#   "Checking": "Wells Fargo Checking",
#   "Savings": "Chase Savings"
# }'

# Category Mapping (English names)
CASHEW_CATEGORIES='{
  "Їжа й хозяйство": "Food & Groceries",
  "Покупки": "Shopping",
  "Розваги": "Entertainment",
  "Рахунки та засоби": "Bills & Utilities",
  "Подарунки": "Gifts",
  "Освіта": "Education",
  "Здоров\'я": "Health & Medical",
  "Підписки": "Subscriptions",
  "Дохід": "Income",
  "Краса": "Beauty & Personal Care",
  "Подорожі": "Travel",
  "Донати": "Donations",
  "Авто": "Automotive",
  "Транспорт": "Transportation",
  "Будинок": "Home & Housing"
}'
```

### Backward Compatibility
- No changes to existing endpoints
- New endpoint is additive only
- Doesn't affect webhook processing
- Configuration purely optional

### Environment
- No new database changes required
- Uses existing AI provider config
- Custom config in `.env.local` only

---

## 📊 Monitoring

**Metrics to Track:**
- [ ] Links generated per day
- [ ] Success rate (valid links/total requests)
- [ ] Average link length
- [ ] Most used accounts
- [ ] Most used categories
- [ ] Cost per link (via AI provider)
- [ ] Error rate by type
- [ ] Config parsing errors

---

## 🎓 Documentation

### User Guide
- How to create Cashew links
- Mobile app requirements
- Custom account/category setup (per region/bank)
- Troubleshooting

### API Reference
- Endpoint documentation
- Parameter descriptions
- Response examples
- Error codes

### Integration Guide
- MacroDroid → Cashew Link workflow
- Gmail → Cashew Link workflow
- Email → HTML link embedding
- Custom configuration guide (international examples)

---

## ✅ Acceptance Criteria

**Must Have:**
- [ ] Endpoint accepts transaction text
- [ ] Generates valid Cashew app-links
- [ ] Loads CASHEW_ACCOUNTS from .env (or defaults to passthrough)
- [ ] Loads CASHEW_CATEGORIES from .env (or defaults to passthrough)
- [ ] Maps accounts correctly
- [ ] Maps categories correctly (English names)
- [ ] Handles currencies properly
- [ ] Returns JSON response
- [ ] Returns plain URL response
- [ ] Returns HTML response
- [ ] 114 existing tests still pass
- [ ] New tests ≥80% coverage
- [ ] Graceful fallback if config missing
- [ ] Works with international accounts/currencies

**Should Have:**
- [ ] Batch link generation
- [ ] QR code generation
- [ ] Email-friendly HTML format
- [ ] Debug mode with detailed logs

**Nice to Have:**
- [ ] Custom styling/branding
- [ ] Link expiration (optional)
- [ ] Analytics dashboard
- [ ] Webhook history

---

## 📋 Files Checklist

- [ ] `lib/services/cashewLinkGenerator.ts` - Core logic
- [ ] `lib/services/cashewConfigLoader.ts` - Load config from .env
- [ ] `lib/services/accountMapper.ts` - Map accounts/categories
- [ ] `lib/utils/urlEncoder.ts` - URL encoding utilities
- [ ] `app/api/webhook/cashew-link/route.ts` - HTTP endpoint
- [ ] `lib/services/__tests__/cashewLinkGenerator.test.ts` - Tests
- [ ] `lib/services/__tests__/cashewConfigLoader.test.ts` - Tests
- [ ] `lib/services/__tests__/accountMapper.test.ts` - Tests
- [ ] `docs/CASHEW_INTEGRATION.md` - User documentation (this file)
- [ ] `.env.example` - Updated with CASHEW_* config
- [ ] Update `PROJECT_STATUS.md` - Add Cashew integration section

---

## 🔗 References

- Cashew App Link Docs: https://cashewapp.web.app/faq.html#app-links
- Budget Tracker AI System: See PROJECT_STATUS.md
- TransactionAnalyzer: `lib/services/transactionAnalyzer.ts`
- Transaction Types: `lib/services/transactionTypeDetector.ts`

---

**Ready for sprint planning! 🚀**

**Key Features v1.2:**
- ✅ English category names for international compatibility
- ✅ International account examples (US, Europe, Ukraine)
- ✅ Multi-currency support with examples
- ✅ All mappings stored locally in `.env.local`
- ✅ No hardcoded values
- ✅ Graceful fallback if config missing
