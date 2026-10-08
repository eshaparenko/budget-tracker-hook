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

**Generate Cashew app-links from transaction text**

#### Request

```
GET /api/webhook/cashew-link?app=<source>&body=<transaction>&debug=<true|false>
POST /api/webhook/cashew-link (with query params or JSON body)
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `app` | string | No | Source app name (e.g., "Gmail", "Telegram", "Monobank") |
| `body` | string | **Yes** | Transaction text to analyze (e.g., "500 UAH Starbucks") |
| `debug` | boolean | No | Enable debug logging (true/false). Default: false |

**Headers:**

```
Content-Type: application/json (for POST with body)
```

#### Response (Success)

```json
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=500&category=%D0%9F%D0%BE%D0%BA%D1%83%D0%BF%D0%BA%D0%B8&merchant=Starbucks&currency=UAH&date=2026-10-04",
  "transaction": {
    "amount": 500,
    "category": "Покупки",
    "merchant": "Starbucks",
    "currency": "UAH"
  },
  "debugLog": [                        // Only if debug=true
    "=== Cashew Link Generator Started ===",
    "Debug mode: ENABLED",
    "App: Gmail",
    "→ Sanitizing input",
    "✓ Body sanitized: \"500 UAH Starbucks...\"",
    "→ Analyzing transaction with AI",
    "✓ Analysis complete",
    "→ Generating Cashew link",
    "✓ Link generated (185 chars)",
    "✓ Request completed in 2345ms"
  ]
}
```

**Status:** `200 OK`

#### Response (Error)

```json
{
  "success": false,
  "error": "Missing required parameter: body",
  "debugLog": [                        // Only if debug=true
    "=== Cashew Link Generator Started ===",
    "❌ Missing body parameter"
  ]
}
```

**Status:** `400 Bad Request`

#### Examples

**Simple Request:**
```bash
curl "http://localhost:3000/api/webhook/cashew-link?app=Gmail&body=500%20UAH%20Starbucks"
```

**With Debug:**
```bash
curl "http://localhost:3000/api/webhook/cashew-link?app=Telegram&body=150%20EUR%20coffee&debug=true"
```

**POST Request:**
```bash
curl -X POST http://localhost:3000/api/webhook/cashew-link \
  -H "Content-Type: application/json" \
  -d '{
    "app": "Viber",
    "body": "200 USD payment",
    "debug": true
  }'
```

**With MacroDroid:**
```
HTTP Request → GET
URL: http://yourserver.com/api/webhook/cashew-link
Parameters:
  app=Monobank
  body={sms_message}
  debug=false
```

---

### 2. Hook with Parameters (Original Endpoint)

**Analyze transactions with full details**

#### Request

```
POST /api/webhook/hook-with-params?app=<source>&body=<transaction>&source=<type>&debug=<true|false>
GET  /api/webhook/hook-with-params (same params)
```

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
curl "http://localhost:3000/api/webhook/hook-with-params?app=Gmail&body=Payment%20500%20UAH%20Starbucks"

# With all parameters
curl "http://localhost:3000/api/webhook/hook-with-params?app=Telegram&body=Paid%20150%20EUR&source=Telegram&debug=true"

# POST with JSON body
curl -X POST http://localhost:3000/api/webhook/hook-with-params \
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

### `app` Parameter Values

Common source applications:

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

# Account Mapping (for Cashew endpoint)
CASHEW_ACCOUNTS='{"Mono":"Monobank","Privat":"PrivatBank"}'

# Category Validation (for Cashew endpoint)
CASHEW_CATEGORIES='["Їжа","Транспорт","Розваги"]'

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
# Send SMS notification to Cashew endpoint
curl "http://yourserver.com/api/webhook/cashew-link?app=Monobank&body=500%20UAH%20for%20Starbucks"

# Response:
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=500&merchant=Starbucks&currency=UAH&date=2026-10-04",
  "transaction": {
    "amount": 500,
    "category": "Їжа й хозяйство",
    "merchant": "Starbucks",
    "currency": "UAH"
  }
}
```

### Google Sheets Import

```bash
# Store full transaction details
curl "http://localhost:3000/api/webhook/hook-with-params?app=Gmail&body=Payment%20150%20UAH%20for%20groceries"

# Response includes row URL to Google Sheets
```

### With Debug Logging

```bash
# Enable debug for troubleshooting
curl "http://localhost:3000/api/webhook/cashew-link?app=Telegram&body=100%20EUR%20coffee&debug=true"

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
