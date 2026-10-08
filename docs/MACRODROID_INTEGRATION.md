# MacroDroid Integration Guide

## Overview

Use MacroDroid to automatically send financial notifications to the budget tracker, which analyzes them with AI and generates Cashew app-links for instant transaction logging.

**Flow:**
```
Bank SMS/Notification in MacroDroid
  ↓
Trigger: Parse message content
  ↓
Action: HTTP GET to cashew-link endpoint
  ↓
Budget Tracker analyzes with Gemini AI
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
4. **API Key** (optional, if authentication is added later)

---

## Step 1: Extract Transaction Text

MacroDroid receives SMS from your bank (e.g., from Monobank, PrivatBank, ING):

```
Example SMS:
"Моноbank: Списано 500 грн за Starbucks
https://monobank.ua/transaction/123"
```

In MacroDroid:
- **Trigger:** SMS received from "Monobank" / "PrivatBank" / bank number
- **Action 1:** Extract transaction amount and merchant
- **Action 2:** Extract source app name
- **Action 3:** Build HTTP request body

---

## Step 2: Call the Budget Tracker Endpoint

**Endpoint:** `GET /api/webhook/cashew-link`

**Parameters:**
- `app` - Source app name (e.g., "Monobank", "PrivatBank", "SMS")
- `body` - Transaction text (e.g., "500 UAH to Starbucks")
- `debug` - Optional, set to `true` for debugging

**Example MacroDroid Action:**

```
HTTP Request → GET
URL: http://yourserver.com/api/webhook/cashew-link
Query Parameters:
  app=Monobank
  body=500%20UAH%20Starbucks
  debug=false
```

**Or with URL encoding in MacroDroid:**

```
GET http://yourserver.com/api/webhook/cashew-link?app=Monobank&body={sms_message}&debug=false
```

Where `{sms_message}` is the MacroDroid variable containing the full SMS text.

---

## Step 3: Parse the Response

The endpoint returns JSON:

```json
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=500&category=%D0%9F%D0%BE%D0%BA%D1%83%D0%BF%D0%BA%D0%B8&merchant=Starbucks&currency=UAH&date=2026-10-04",
  "transaction": {
    "amount": 500,
    "category": "Покупки",
    "merchant": "Starbucks",
    "currency": "UAH"
  }
}
```

**Key fields:**
- `success` - True if analysis succeeded
- `url` - Cashew app-link (use this to open app)
- `transaction.category` - AI-detected category
- `transaction.merchant` - Vendor name
- `transaction.currency` - Currency code

---

## Step 4: Open Cashew App Link

In MacroDroid:
- **Action:** Open URL
- **URL:** Extract `url` field from response
- **App:** "Cashew" (or default browser)

```
MacroDroid → Open Application
App: Cashew
Alternative: Open URL {response.url}
```

---

## Example MacroDroid Macro

### Macro: "Bank Notification → Cashew Link"

**Trigger:**
```
SMS Received
From: Monobank
Content: Contains "Списано" OR "Зараховано"
```

**Actions:**

1. **Extract SMS Details**
   ```
   Variable: {sms_text} = SMS Message
   Variable: {sms_sender} = SMS Sender
   ```

2. **Call Budget Tracker**
   ```
   HTTP Request: GET
   URL: http://yourserver.com/api/webhook/cashew-link
   Parameters:
     app={sms_sender}
     body={sms_text}
   Response Variable: {response}
   ```

3. **Check Success**
   ```
   IF {response.success} == true
   THEN: Continue
   ELSE: Show Toast "Failed to analyze transaction"
   ```

4. **Extract Cashew Link**
   ```
   Variable: {cashew_url} = {response.url}
   ```

5. **Show Notification**
   ```
   Notification:
   Title: "{response.transaction.amount} {response.transaction.currency}"
   Message: "{response.transaction.merchant} - {response.transaction.category}"
   Action: Open URL {cashew_url}
   ```

6. **Open Cashew App**
   ```
   Open Application: Cashew
   OR: Open URL: {cashew_url}
   ```

---

## Testing

### Test Endpoint Directly

```bash
# Simple request
curl "http://localhost:3000/api/webhook/cashew-link?app=Monobank&body=500%20UAH%20Starbucks"

# With debug logging
curl "http://localhost:3000/api/webhook/cashew-link?app=SMS&body=150%20EUR%20coffee&debug=true"

# Expected response:
# {
#   "success": true,
#   "url": "https://cashewapp.web.app/addTransaction?...",
#   "transaction": {
#     "amount": 500,
#     "category": "Їжа й хозяйство",
#     "merchant": "Starbucks",
#     "currency": "UAH"
#   }
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

# Gemini API Key (cheapest option)
GEMINI_API_KEY=your_gemini_api_key

# Account Name Mapping (optional)
# Maps source account names to Cashew account names
CASHEW_ACCOUNTS='{"Mono":"Monobank","Privat":"PrivatBank"}'

# Category Validation (optional)
# If set, AI must match one of these categories
CASHEW_CATEGORIES='["Їжа й хозяйство","Покупки","Розваги","Транспорт"]'
```

### Cashew App Configuration

1. Open Cashew app
2. Settings → Accounts
3. Add accounts you want to use
4. Note account names for CASHEW_ACCOUNTS mapping

---

## Troubleshooting

### "Failed to analyze transaction"

**Causes:**
- API key not configured or invalid
- AI provider unreachable
- Transaction text too short or unclear

**Solution:**
- Check `.env.local` for API keys
- Test endpoint manually with debug=true
- Include amount + currency + merchant in text

### Cashew Link Not Opening

**Causes:**
- Cashew app not installed
- URL encoding issues
- Special characters in transaction text

**Solution:**
- Ensure Cashew app is installed
- Test URL in browser: `https://cashewapp.web.app/addTransaction?...`
- Check debug log for special characters

### Transaction Not Recognized

**Causes:**
- Text format doesn't match bank notifications
- Missing amount or currency
- AI doesn't understand language

**Solution:**
- Include explicit amount: "500 UAH" not just "payment"
- Include merchant: "Starbucks" not just "shop"
- Use Ukrainian or English text (AI trained on both)

### Slow Response

**Causes:**
- First request with new AI provider (warm-up)
- Network latency to server
- Complex transaction text

**Solution:**
- Subsequent requests are faster (cached)
- Use `debug=true` to see timing breakdown
- Keep transaction text concise

---

## Example Notifications

### Ukrainian Banks

**Monobank:**
```
Моноbank: Списано 500 грн за Starbucks Ukraine https://monobank.ua/...
→ Parsed: "500 грн за Starbucks"
→ Generated: amount=500, currency=UAH, merchant=Starbucks
```

**PrivatBank:**
```
ПриватБанк: Картой ****1234 списано 1000 грн в "SILPO" 14:32 https://...
→ Parsed: "1000 грн в SILPO"
→ Generated: amount=1000, currency=UAH, merchant=SILPO
```

**ING:**
```
ING: Списано 150 EUR на ATM 14:45 Київ
→ Parsed: "150 EUR ATM"
→ Generated: amount=150, currency=EUR, merchant=ATM
```

### Messaging Apps

**Telegram Bot:**
```
💰 Платіж: 2500 грн за квартиру
→ Parsed: "2500 грн квартиру"
→ Generated: amount=2500, currency=UAH, merchant=квартиру, category=Комунальні послуги
```

---

## Advanced: Custom Categories

To use custom categories, update `.env.local`:

```bash
CASHEW_CATEGORIES='["Їжа","Транспорт","Розваги","Работа","Комунальні послуги"]'
```

Now AI will map transactions to these exact category names.

**Example:**
- Input: "150 UAH taxi"
- Without config: category might be "Транспортні послуги" (close match)
- With config: category is "Транспорт" (exact match from list)

---

## Support

- **Bug Report:** Include error message and `debug=true` logs
- **Feature Request:** Describe use case
- **Questions:** Check example macros above

---

**Last Updated:** October 4, 2026  
**Status:** Production Ready
