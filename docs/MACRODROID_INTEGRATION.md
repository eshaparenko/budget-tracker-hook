# MacroDroid Integration Guide

## Overview

Use MacroDroid to automatically send financial notifications to the budget tracker, which analyzes them with AI and generates Cashew app-links for instant transaction logging.

**Flow:**
```
Bank SMS/Notification in MacroDroid
  ↓
Action: HTTP GET to cashew-link endpoint (with x-api-key header)
  ↓
Budget Tracker analyzes with AI
  ↓
Returns Cashew app-link
  ↓
MacroDroid opens link in Cashew app
  ↓
User confirms transaction in Cashew
```

---

## Prerequisites

1. **MacroDroid** installed on Android device
2. **Cashew App** installed on Android device
3. **Budget Tracker** deployed and running (e.g., http://yourserver.com)
4. **WEBHOOK_SECRET** set on the server. Generate one with `openssl rand -hex 32`

---

## Step 1: Extract Transaction Text

MacroDroid receives a notification or SMS from your bank:

```
Example:
"Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH"
```

In MacroDroid:
- **Trigger:** Notification/SMS received from your bank app or number
- **Action:** Keep the full text in a variable (e.g. `{sms_message}`). No pre-parsing needed, the AI extracts amount, merchant and category and ignores balance figures.

---

## Step 2: Call the Budget Tracker Endpoint

**Endpoint:** `GET /api/webhook/cashew-link`

**Header (required):**
- `x-api-key` - the value of `WEBHOOK_SECRET` from the server. It is accepted only as a header, never as a query parameter.

**Parameters:**
- `app` - **Account name** from `CASHEW_ACCOUNTS` (e.g., "Ukrsib", "Mono", "Privat"), case-insensitive. Missing or unknown falls back to the first account in `CASHEW_ACCOUNTS`.
- `body` - Notification text
- `debug` - Optional, set to `true` to add `debugLog` to the response

**Example MacroDroid Action:**

```
HTTP Request → GET
URL: http://yourserver.com/api/webhook/cashew-link
Headers:
  x-api-key=<your WEBHOOK_SECRET>
Query Parameters:
  app=Ukrsib
  body={sms_message}
  debug=false
```

Let MacroDroid URL-encode the variable, or pass the parameters as key/value pairs.

---

## Step 3: Parse the Response

The endpoint returns JSON:

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
  }
}
```

**Key fields:**
- `success` - True if analysis succeeded
- `url` - Cashew app-link (use this to open the app)
- `transaction.category` - Category chosen from `CASHEW_CATEGORIES`
- `transaction.subcategory` - Subcategory from `CASHEW_SUBCATEGORIES`, or `""` when none (the link then has no `subcategory` parameter)
- `transaction.merchant` - Vendor name (becomes the Cashew title)
- `transaction.currency` - Informational only. The link has no currency or date: Cashew records the amount in the account's currency, at the time the link is opened.

**Error statuses:** `401` wrong/missing `x-api-key`, `500` `WEBHOOK_SECRET` not set on the server, `422` AI failed or no amount found, `400` request cannot be parsed.

---

## Step 4: Open Cashew App Link

In MacroDroid:
- **Action:** Open URL
- **URL:** Extract `url` field from response
- **App:** "Cashew" (or default browser)

---

## Example MacroDroid Macro

### Macro: "Bank Notification → Cashew Link"

**Trigger:**
```
Notification Received
App: your bank app
Content: Contains "Оплата" OR "Зарахування"
```

**Actions:**

1. **Call Budget Tracker**
   ```
   HTTP Request: GET
   URL: http://yourserver.com/api/webhook/cashew-link
   Headers:
     x-api-key=<your WEBHOOK_SECRET>
   Parameters:
     app=Ukrsib
     body={notification_text}
   Response Variable: {response}
   ```

2. **Check Success**
   ```
   IF {response.success} == true
   THEN: Continue
   ELSE: Show Toast "Failed to analyze transaction"
   ```

3. **Extract Cashew Link**
   ```
   Variable: {cashew_url} = {response.url}
   ```

4. **Open Cashew**
   ```
   Open URL: {cashew_url}
   ```

---

## Testing

### Test Endpoint Directly

```bash
curl -G "http://localhost:3000/api/webhook/cashew-link" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Ukrsib" \
  --data-urlencode "body=Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH"

# With debug logging: add --data-urlencode "debug=true"

# Expected response:
# {
#   "success": true,
#   "url": "https://cashewapp.web.app/addTransaction?amount=405.5&category=...&wallet=Ukrsib&title=Pelham&notes=...",
#   "transaction": { "amount": 405.5, "category": "Покупки", "subcategory": "Одяг", "merchant": "Pelham", "currency": "UAH" }
# }
```

### Test in MacroDroid

1. Create test macro with HTTP request
2. Execute manually in MacroDroid
3. Check response in MacroDroid variables
4. Verify Cashew link is valid

---

## Configuration

### Budget Tracker (.env.local)

```bash
# AI Provider for transaction analysis
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDERS=claude,openai
GEMINI_API_KEY=your_gemini_api_key

# Required for /cashew-link (generate with: openssl rand -hex 32)
WEBHOOK_SECRET=your_secret

# JSON array of Cashew account names. ORDER MATTERS: the first item is the fallback
CASHEW_ACCOUNTS=["Ukrsib","Mono","Privat"]

# JSON array of Cashew category names. First item is the fallback when the AI's
# category is not in the list. If unset/empty, categories are not constrained
CASHEW_CATEGORIES=["Покупки","Їжа й хозяйство","Розваги","Транспорт","Доходи"]

# Optional JSON object: category -> its subcategories. Keys must be in CASHEW_CATEGORIES.
# Subcategory names should be unique across categories.
# If a value contains an apostrophe (Здоров'я), wrap the whole value in `backticks`.
CASHEW_SUBCATEGORIES={"Транспорт":["Таксі","Громадський транспорт"],"Покупки":["Одяг","Електроніка"]}
```

The config is read once at server start: **restart the server after editing**.

### Cashew App Configuration

1. Open Cashew app
2. Create the accounts (wallets), categories and subcategories you list in `.env.local`
3. Names must match, case-insensitive. An unknown category makes Cashew show a prompt instead of adding the transaction silently.

---

## Troubleshooting

### 401 Unauthorized / 500 "Server configuration error"

- 401: the `x-api-key` header is missing or differs from `WEBHOOK_SECRET`. A query parameter does not work.
- 500: `WEBHOOK_SECRET` is not set on the server. Set it and restart.

### "Failed to analyze transaction" (422)

**Causes:**
- API key not configured or invalid
- AI provider unreachable
- No amount in the text ("No amount found")

**Solution:**
- Check `.env.local` for API keys
- Test the endpoint manually with `debug=true`

### Wrong Account

**Cause:** `app` does not match any name in `CASHEW_ACCOUNTS`, so the first account is used (a warning is in `debugLog`).

**Solution:** Pass the exact account name, or fix `CASHEW_ACCOUNTS` and restart.

### Subcategory Missing in the Link

**Cause:** The subcategory is not configured under the category the AI chose, so it is omitted and the transaction stays in the main category.

**Solution:** Check the `debug=true` output, the spelling in `CASHEW_SUBCATEGORIES` (the key must be in `CASHEW_CATEGORIES`), and restart the server.

### Cashew Link Not Opening

**Causes:**
- Cashew app not installed
- URL encoding issues

**Solution:**
- Ensure Cashew app is installed
- Test the URL in a browser: `https://cashewapp.web.app/addTransaction?...`

### Slow Response

**Causes:**
- First request with a new AI provider (warm-up)
- Network latency to server

**Solution:** Use `debug=true` to see the timing breakdown.

---

## Example Notifications

**Expense:**
```
Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH
→ amount=405.5, title=Pelham, notes=card last digits, balance ignored
```

**Income:**
```
Зараховано 2500 UAH від Іван І. Залишок: 14 845.67 UAH
→ amount=2500, category=an income category (e.g. Доходи) if present in CASHEW_CATEGORIES
```

The amount is always positive. Income vs expense is decided by the category inside Cashew.

---

## Known Limitations

- Amount is stored in the Cashew account's currency (no currency conversion).
- Transaction time is when the link is opened on the device.
- An unknown `app` silently falls back to the first account.
- No subcategory fallback: an unknown subcategory, or one that belongs to another category, is omitted from the link.
- All `/api/webhook/*` endpoints (`/cashew-link`, `/hook-with-params`, `/finance-hook`) require the same `x-api-key` header. MacroDroid actions for every endpoint must send it.

---

## Support

- **Bug Report:** Include error message and `debug=true` logs
- **Reference:** See API_REFERENCE.md and CASHEW_INTEGRATION.md

---

**Last Updated:** October 4, 2026  
**Status:** Production Ready
