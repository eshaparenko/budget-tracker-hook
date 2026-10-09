# Cashew App Integration

**Owner:** Yevhen Shaparenko  
**Status:** Implemented

---

## 📋 Overview

`/api/webhook/cashew-link` turns a bank notification into a [Cashew app-link](https://cashewapp.web.app/faq.html#app-links) that adds the transaction to the Cashew budget app.

```
MacroDroid → Budget Tracker (AI analysis) → Cashew link → Cashew app
```

See MACRODROID_INTEGRATION.md for the phone-side setup and API_REFERENCE.md for the full endpoint reference.

---

## 🏗️ Endpoint

```
GET | POST /api/webhook/cashew-link
```

### Authentication

- Header `x-api-key: <WEBHOOK_SECRET>` is **required**. It is accepted only as a header, never as a query parameter.
- Missing or wrong key: `401 {"success":false,"error":"Unauthorized"}`.
- `WEBHOOK_SECRET` not set on the server: `500 {"success":false,"error":"Server configuration error"}` (fails closed).
- 401 and the auth-related 500 never include `debugLog`.
- Generate a secret with `openssl rand -hex 32`.
- All `/api/webhook/*` endpoints (`/cashew-link`, `/hook-with-params`, `/finance-hook`) require the same `x-api-key` header. MacroDroid actions for every endpoint must send it.

### Query parameters

| Parameter | Description |
|---|---|
| `app` | **Account name** (e.g. Mono, Privat, Ukrsib). Matched case-insensitively against `CASHEW_ACCOUNTS`; the configured spelling is returned. Missing or unknown falls back to the first item of `CASHEW_ACCOUNTS` (warning in `debugLog`). On `/hook-with-params` the same parameter is the source app (Gmail/Telegram). |
| `body` | Notification text (query param or request body). Same parsing as `/hook-with-params`. |
| `debug` | `true` adds `debugLog` to the response. |

### Response (200)

```json
{
  "success": true,
  "url": "https://cashewapp.web.app/addTransaction?amount=1200&category=%D0%90%D0%B2%D1%82%D0%BE&subcategory=%D0%9F%D0%B0%D0%BB%D0%B8%D0%B2%D0%BE&wallet=Ukrsib&title=WOG",
  "transaction": { "amount": 1200, "category": "Авто", "subcategory": "Паливо", "merchant": "WOG", "currency": "UAH" },
  "debugLog": []
}
```

`transaction.subcategory` is an empty string (`""`) when there is none. `debugLog` is present only with `debug=true`. Errors: `400` (cannot parse request / invalid body), `401`, `422` (AI failed, or no amount found), `500`.

### Example

```bash
curl -G "http://localhost:3000/api/webhook/cashew-link" \
  -H "x-api-key: $WEBHOOK_SECRET" \
  --data-urlencode "app=Ukrsib" \
  --data-urlencode "body=Оплата 405.50 UAH, Pelham. Картка *4417. Залишок: 12 345.67 UAH"
```

---

## 🔗 Link Parameters

Sent to Cashew:

| Parameter | Value |
|---|---|
| `amount` | Always positive. Income vs expense is decided by the category's polarity inside Cashew. |
| `category` | AI choice constrained to `CASHEW_CATEGORIES` (case-insensitive, first item is the fallback). |
| `subcategory` | Optional. Sent only if the AI's choice is configured under the **final** category in `CASHEW_SUBCATEGORIES` (case-insensitive, configured spelling is used). Otherwise omitted. |
| `wallet` | Constrained to `CASHEW_ACCOUNTS` (Cashew accepts `account` or `wallet`). |
| `title` | AI "merchant", max 100 chars. Omitted if empty. |
| `notes` | AI "details" (e.g. card last digits), max 200 chars. Omitted if empty. |

Per the Cashew docs, `subcategory` is the name of the subcategory to add the transaction to. If provided, it overwrites the category when a subcategory with that name is found under a main category. Cashew runs a name search, takes the first entry, and ignores case.

Not sent, on purpose:

- `date`: Cashew defaults to the current date/time on the device that opens the link.
- `currency`: Cashew has no currency parameter (currency belongs to the account), so the amount is recorded in the account's currency. The JSON response still contains `currency` for information.

---

## ⚙️ Configuration (.env.local)

```bash
WEBHOOK_SECRET=your_secret

# JSON array of strings. ORDER MATTERS: the first item is the fallback.
CASHEW_ACCOUNTS=["Ukrsib","Mono","Privat"]

# JSON array of strings. The first item is the fallback when the AI's category
# is not in the list. If empty/unset, categories are not constrained.
CASHEW_CATEGORIES=["Покупки","Розваги","Транспорт","Доходи"]

# Optional. JSON OBJECT: top-level category -> array of its subcategories.
CASHEW_SUBCATEGORIES={"Транспорт":["Таксі","Громадський транспорт","Потяги та автобуси"],"Покупки":["Одяг","Електроніка"]}
```

- `CASHEW_ACCOUNTS` is a plain array. There is no name-mapping object.
- `CASHEW_CATEGORIES` is an array of **top-level** names only (first item = fallback).
- Any language works for names, e.g. `["Wells Fargo","Chase"]` or `["Food","Shopping","Other"]`.
- The config is read once at server start: **restart after editing**.
- Names must exist in Cashew (name search, case-insensitive). An unknown category makes Cashew show a prompt instead of adding the transaction silently.

### CASHEW_SUBCATEGORIES rules

- Keys must be present in `CASHEW_CATEGORIES` (case-insensitive). Other keys are ignored with a console warning.
- Invalid JSON, a non-object, or a value that is not an array: that part is ignored with a warning, the rest keeps working.
- Subcategory names should be unique across categories. Cashew resolves `subcategory` by name and takes the **first** match; the loader warns when the same name is configured under two categories. The same name at different levels (top-level "Розваги" and "Подорожі → Розваги") is valid.
- In a `.env` file, a value containing an apostrophe (Здоров'я, Зв'язок) must be wrapped in `` `backticks` `` instead of single quotes (works with Next.js env loading). In the Vercel dashboard paste the raw JSON with no surrounding quotes.

```bash
CASHEW_SUBCATEGORIES=`{"Здоров'я":["Аптека","Лікарі"],"Рахунки та збори":["Комуналка","Зв'язок та інтернет","Комісії банку"]}`
```

### Designing the category set

Keep 10-20 mutually exclusive top-level categories named with everyday words, and put nuance in subcategories. Put a catch-all first (it is the fallback) and include an income category: Cashew decides income vs expense from the category's own type, and the link always sends a positive amount. Create the same categories and subcategories in Cashew first, with exact names. Avoid income subcategory names that are bare words also seen in outgoing notifications (a subcategory named just "Перекази" pulled "Переказ на картку" into income in testing; "Перекази від людей" fixed it). An example set (17 top-level):

```
Інше (fallback), Продукти, Кафе та ресторани,
Транспорт [Таксі, Громадський транспорт, Потяги та автобуси],
Авто [Паливо, Тех обслуговування, Паркування],
Дім [Оренда, Ремонт та меблі],
Рахунки та збори [Комуналка, Зв'язок та інтернет, Комісії банку],
Здоров'я [Аптека, Лікарі],
Покупки [Одяг, Електроніка, Інші товари],
Догляд за собою, Розваги [Події, Ігри, Дозвілля],
Підписки [Сервіси, Додатки],
Освіта [Школа, Уроки англійської, Курси, Інше],
Подорожі [Квитки, Житло, Розваги, Транспорт],
Подарунки, Благодійність,
Доходи [Зарплата, Перекази від людей, Повернення та кешбек]
```

See `.env.example` for fuller examples.

---

## 🤖 AI Behaviour

`/cashew-link` uses a dedicated "direct" prompt (no "is this a transaction?" check). The allowed categories are shown to the model as a JSON tree, e.g. `{"Авто":["Паливо",...],"Інше":[]}`, and it returns `category` (a key) and `subcategory` (a value from **that** category's array, or an empty string). Without `CASHEW_SUBCATEGORIES` the subcategory is always empty, as before. The model:

- ignores balance figures (Залишок/Баланс)
- picks an income category (e.g. Доходи) for money received
- produces a short title and a short note

`/hook-with-params` keeps its original validation prompt.

---

## 🔄 Processing Flow

```
Request
  ↓
[1] Check x-api-key (401 / 500 before any parsing or AI call)
  ↓
[2] Parse request (app, body, debug) and sanitize body
  ↓
[3] Analyze with AI (direct prompt, allowed categories)
  ↓ 422 if AI failed or amount <= 0
[4] Constrain account and category to the Cashew config
  ↓
[5] Keep the subcategory only if it is configured under the final category
    (otherwise drop it, with a warning in debugLog)
  ↓
[6] Build the link and return JSON
```

---

## 💾 Implementation Files

- `app/api/webhook/cashew-link/route.ts` - HTTP handler
- `lib/utils/apiKeyAuth.ts` - `x-api-key` check
- `lib/services/cashewLinkGenerator.ts` - link building
- `lib/services/cashewConfigLoader.ts` - reads `CASHEW_ACCOUNTS` / `CASHEW_CATEGORIES` / `CASHEW_SUBCATEGORIES`
- `lib/services/transactionAnalyzer.ts` - `analyzeDirect()`
- `lib/services/__tests__/` - tests

---

## ⚠️ Known Limitations

- Amount is stored in the Cashew account's currency (no currency conversion).
- Transaction time is when the link is opened on the device.
- An unknown `app` silently falls back to the first account.
- No subcategory fallback: if the AI's subcategory is unknown, belongs to another category, or the category itself fell back to the first item, the subcategory is omitted and the transaction stays in the main category (warning in `debugLog` with `debug=true`).
- Subcategory names should be unique across categories (Cashew takes the first name match).
- All `/api/webhook/*` endpoints (`/cashew-link`, `/hook-with-params`, `/finance-hook`) require the same `x-api-key` header. MacroDroid actions for every endpoint must send it.

---

## 🔗 References

- Cashew App Link Docs: https://cashewapp.web.app/faq.html#app-links
- MACRODROID_INTEGRATION.md, API_REFERENCE.md
