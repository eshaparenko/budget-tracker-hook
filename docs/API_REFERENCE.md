# API Reference

Complete webhook API documentation for budget-tracker.

---

## Base URL

```
http://localhost:3000         # Development
https://yourserver.com        # Production
```

---

## Endpoints

### 1. Cashew Link Generator

**Turn a bank notification into a Cashew app-link. Protected by `x-api-key`.**

#### Request

```
GET  /api/webhook/cashew-link?app=<account>&body=<notification>&debug=<true|false>
POST /api/webhook/cashew-link (query params or request body, same parsing as hook-with-params)
```

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | **Yes** | Must equal the server's `WEBHOOK_SECRET`. Accepted only as a header, never as a query parameter |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app` | string | No | **Account name** (e.g., "Mono", "Privat", "Ukrsib"). Matched case-insensitively against `CASHEW_ACCOUNTS`; the configured spelling is returned. Missing or unknown falls back to the first item of `CASHEW_ACCOUNTS` (a warning appears in `debugLog`). Note: on `/hook-with-params` this same parameter is the source app (Gmail/Telegram) |
| `body` | string | **Yes** | Notification text (query param or request body) |
| `debug` | boolean | No | `true` adds `debugLog` to the response. Default: false |

**Link parameters sent to Cashew** (see [Cashew app-links](https://cashewapp.web.app/faq.html#app-links)):

| Parameter | Source |
|-----------|--------|
| `amount` | Always positive. Income vs expense is decided by the category's polarity inside Cashew |
| `category` | AI choice constrained to `CASHEW_CATEGORIES` (case-insensitive, first item is the fallback) |
| `subcategory` | Optional. AI choice, sent only if it is configured under the final category in `CASHEW_SUBCATEGORIES` (case-insensitive, configured spelling is used). No fallback: otherwise omitted |
| `wallet` | Constrained to `CASHEW_ACCOUNTS` (Cashew accepts `account` or `wallet`) |
| `title` | AI "merchant", max 100 chars, omitted if empty |
| `notes` | AI "details" (e.g., card last digits), max 200 chars, omitted if empty |

Not sent, on purpose: `date` (Cashew uses the current date/time on the device that opens the link) and `currency` (Cashew has no currency parameter; the amount is recorded in the account's currency). The JSON response still contains `currency` for information.

#### Response (Success)

```json
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=1200&category=%D0%90%D0%B2%D1%82%D0%BE&subcategory=%D0%9F%D0%B0%D0%BB%D0%B8%D0%B2%D0%BE&wallet=Ukrsib&title=WOG",
  "transaction": {
    "amount": 1200,
    "category": "Авто",
    "subcategory": "Паливо",
    "merchant": "WOG",
    "currency": "UAH"
  },
  "debugLog": [...]                    // Only if debug=true
}
```

`transaction.subcategory` is an empty string (`""`) when there is none, and the link then has no `subcategory` parameter.

**Status:** `200 OK`

#### Response (Error)

```json
{ "success": false, "error": "Unauthorized" }
```

| Status | Error | When |
|--------|-------|------|
| 400 | `Failed to parse request` / `Invalid transaction body` | Request or body cannot be parsed or fails validation |
| 401 | `Unauthorized` | `x-api-key` missing or wrong |
| 422 | `Failed to analyze transaction` / `No amount found in the transaction text` | AI failed, or no amount in the text |
| 500 | `Server configuration error` | `WEBHOOK_SECRET` is not set on the server (fails closed) |
| 500 | `An unexpected error occurred` | Unexpected failure |

401 and the auth-related 500 never include `debugLog`.

#### AI Behaviour

This endpoint uses a dedicated "direct" prompt (no "is this a transaction?" check) and passes the allowed categories as a JSON tree (e.g. `{"Авто":["Паливо",...],"Інше":[]}`). The model returns `category` (a key) and `subcategory` (a value from that category's array, or an empty string). Without `CASHEW_SUBCATEGORIES` the subcategory is always empty. It ignores balance figures (Залишок/Баланс), picks an income category (e.g., Доходи) for money received, and produces a short title and a short note. `/hook-with-params` keeps its original validation prompt.

#### Example

```bash
curl -G "http://localhost:3000/api/webhook/cashew-link" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Ukrsib" \
  --data-urlencode "body=Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH"
```

#### Known Limitations

- Amount is stored in the Cashew account's currency (no conversion).
- Transaction time is when the link is opened on the device.
- An unknown `app` silently falls back to the first account.
- No subcategory fallback: if the AI's subcategory is unknown, belongs to another category, or the category itself fell back to the first item, the subcategory is omitted and the transaction stays in the main category (warning in `debugLog` with `debug=true`).
- Subcategory names should be unique across categories. Cashew resolves `subcategory` by name and takes the first match; the loader warns about duplicates. The same name at different levels (top-level "Розваги" and "Подорожі → Розваги") is valid.
- All `/api/webhook/*` endpoints (`/cashew-link`, `/hook-with-params`, `/finance-hook`) require the same `x-api-key` header. MacroDroid actions for every endpoint must send it.

---

### 2. Hook with Parameters (Original Endpoint)

**Analyze transactions with full details**

#### Request

```
POST /api/webhook/hook-with-params?app=<source>&body=<transaction>&source=<type>&debug=<true|false>
GET  /api/webhook/hook-with-params (health check: AI provider status)
```

**Headers:** `x-api-key: <WEBHOOK_SECRET>` is **required** on both methods (401 if missing/wrong, 500 if `WEBHOOK_SECRET` is unset on the server). Header only, never a query parameter.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app` | string | **Yes** | Source app name (e.g., "Gmail", "Telegram") |
| `body` | string | **Yes** | Transaction text (e.g., "Payment 500 UAH to Starbucks") |
| `source` | string | No | Source type (Email, Telegram, Viber, Bank, Other). Default: Other |
| `debug` | boolean | No | Enable debug logging. Default: false |

#### Response (Success)

```json
{
  "success": true,
  "url": "https://docs.google.com/spreadsheets/...",
  "transaction": {
    "date": "04.10.2026 14:35:22",
    "category": "Їжа й хозяйство",
    "amount": 500,
    "currency": "UAH",
    "merchant": "Starbucks",
    "source": "Gmail",
    "sourceType": "Email",
    "transactionType": "Payment",
    "details": "Card ending in 1234"
  },
  "debugLog": [
    "=== Webhook Processing Started ===",
    "App: Gmail",
    "Body: Payment 500 UAH to Starbucks",
    "→ Stage 1: Parsing request",
    "...more logs...",
    "✓ Transaction stored successfully"
  ]
}
```

**Status:** `200 OK`

#### Examples

```bash
# Basic request
curl -H "x-api-key: $WEBHOOK_SECRET" \
  "http://localhost:3000/api/webhook/hook-with-params?app=Gmail&body=Payment%20500%20UAH%20Starbucks"

# With all parameters
curl -H "x-api-key: $WEBHOOK_SECRET" \
  "http://localhost:3000/api/webhook/hook-with-params?app=Telegram&body=Paid%20150%20EUR&source=Telegram&debug=true"

# POST with JSON body
curl -X POST http://localhost:3000/api/webhook/hook-with-params \
  -H "x-api-key: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "app": "Viber",
    "body": "Payment 200 USD",
    "source": "Viber",
    "debug": false
  }'
```

---

## Common Parameters

### `debug` Parameter

Enable detailed logging for debugging:

```
?debug=true     # Include debugLog array in response
?debug=false    # Default, no debug log
```

**Debug Log Contents:**
- Step-by-step processing stages
- Input validation checks
- AI analysis results
- Error messages with context
- Timing information

### `app` Parameter Values (`/hook-with-params` only)

On `/cashew-link`, `app` is the account name from `CASHEW_ACCOUNTS` instead. On `/hook-with-params` it is the source application:

| Value | Description |
|-------|-------------|
| `Gmail` | Email notification |
| `Telegram` | Telegram message |
| `Viber` | Viber message |
| `Bank` | Direct bank notification |
| `SMS` | SMS message |
| `Monobank` | Monobank app |
| `PrivatBank` | PrivatBank app |
| `ING` | ING app |
| `Wise` | Wise transfer |
| `PayPal` | PayPal notification |

---

## Response Format

### Success Response

```json
{
  "success": true,
  "url": "...",
  "transaction": {
    "amount": number,
    "currency": string,
    "category": string,
    "subcategory": string,   // /cashew-link only, "" when none
    "merchant": string,
    ...
  },
  "debugLog": [...]  // Optional, only if debug=true
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional context",
  "debugLog": [...]  // Optional, only if debug=true
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Transaction analyzed and stored |
| 400 | Bad Request | Missing required parameter |
| 401 | Unauthorized | Missing or wrong `x-api-key` (`/cashew-link`) |
| 422 | Unprocessable Entity | Transaction analysis failed |
| 500 | Server Error | Unexpected error |

---

## Error Handling

### Common Errors

**Missing `body` Parameter:**
```json
{
  "success": false,
  "error": "Missing required parameter: body",
  "status": 400
}
```

**Failed Analysis:**
```json
{
  "success": false,
  "error": "Failed to analyze transaction",
  "details": "[AIFactory] All AI providers failed. No fallback available.",
  "status": 422
}
```

**Invalid Input:**
```json
{
  "success": false,
  "error": "Invalid transaction body",
  "details": ["Input contains null bytes", "Text too short"],
  "status": 400
}
```

---

## Configuration

### Environment Variables (.env.local)

**Required:**
```bash
# At least one AI provider
GEMINI_API_KEY=your_key
```

**Optional:**
```bash
# AI Provider Selection
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDERS=claude,openai

# Cashew endpoint auth (required): generate with `openssl rand -hex 32`
WEBHOOK_SECRET=your_secret

# Cashew accounts: JSON array. Order matters, first item is the fallback
CASHEW_ACCOUNTS=["Ukrsib","Mono","Privat"]

# Cashew categories: JSON array. First item is the fallback; if unset, categories are not constrained
CASHEW_CATEGORIES=["Покупки","Їжа","Транспорт","Доходи"]

# Cashew subcategories (optional): JSON object, category name -> array of subcategory names.
# Keys must be in CASHEW_CATEGORIES (case-insensitive), other keys are ignored with a warning.
# Invalid JSON / not an object / a non-array value is ignored with a warning.
# If a value contains an apostrophe (Здоров'я), wrap the whole value in `backticks`.
# In the Vercel dashboard paste the raw JSON without surrounding quotes.
CASHEW_SUBCATEGORIES={"Транспорт":["Таксі","Громадський транспорт"],"Покупки":["Одяг","Електроніка"]}

# Cashew config is read once at server start: restart after editing.
# Names must exist in Cashew (case-insensitive name search).

# Google Sheets (for hook-with-params endpoint)
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

---

## Rate Limiting

### Current

No built-in rate limiting. Depends on:
- AI provider rate limits (usually 100+ requests/minute for Gemini free tier)
- Google Sheets API limits (300+ requests/minute)
- Server resources

### Recommended

For production, implement rate limiting:
```bash
# Example: 60 requests per minute per IP
x-ratelimit-limit: 60
x-ratelimit-remaining: 59
x-ratelimit-reset: 1234567890
```

---

## Examples

### MacroDroid Integration

```bash
# Send bank notification to Cashew endpoint
curl -G "http://yourserver.com/api/webhook/cashew-link" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Ukrsib" \
  --data-urlencode "body=Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH"

# Response:
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=405.5&category=...&wallet=Ukrsib&title=Pelham&notes=...",
  "transaction": { "amount": 405.5, "category": "Покупки", "subcategory": "Одяг", "merchant": "Pelham", "currency": "UAH" }
}
```

### Google Sheets Import

```bash
# Store full transaction details
curl -H "x-api-key: $WEBHOOK_SECRET" \
  "http://localhost:3000/api/webhook/hook-with-params?app=Gmail&body=Payment%20150%20UAH%20for%20groceries"

# Response includes row URL to Google Sheets
```

### With Debug Logging

```bash
# Enable debug for troubleshooting
curl -G "http://localhost:3000/api/webhook/cashew-link" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Mono" \
  --data-urlencode "body=Coffee 100 UAH" \
  --data-urlencode "debug=true"

# Response includes detailed processing steps
```

---

## Support

- **Documentation:** See `/docs` folder
- **Examples:** See examples above
- **Issues:** Check troubleshooting in MACRODROID_INTEGRATION.md

---

**Last Updated:** October 4, 2026  
**API Version:** 1.0  
**Status:** Production Ready
