# Cashew Integration - Defect Fix Summary

**Date:** October 4, 2026 (Evening)  
**Status:** ✅ FIXED & TESTED  
**Tests:** All 212 passing  
**Issue:** AI categories not being constrained to CASHEW_CATEGORIES list

---

## 🐛 Defect Description

When `CASHEW_CATEGORIES` was configured in `.env.local`, the system was **not enforcing** the constraint. 

**Example:**
- User configured: `CASHEW_CATEGORIES=["Побут","Покупки","Розваги"]`
- AI returned: `"Їжа й хозяйство"` (not in allowed list)
- System used: `"Їжа й хозяйство"` directly ❌ (should have used "Побут")

**Root Cause:**
- `AccountMapper.validateCategory()` was only **validating** (returning `.valid: false`)
- But still returning the **invalid category unchanged**
- Endpoint was **ignoring the validation** and using it anyway

---

## ✅ Solution

### 1. **Simplified Config Format**
Changed `CASHEW_ACCOUNTS` from object mapping to simple array:
- **OLD:** `{"Mono": "Monobank", "Privat": "PrivatBank"}` (with mapping)
- **NEW:** `["Mono", "Privat", "Ukrsib"]` (no mapping)

Rationale: You said you don't need mapping - just need to use the account names directly!

### 2. **Enforce CASHEW_CATEGORIES Constraint**
Changed behavior of `validateCategory()`:
- **Before:** Return invalid category as-is (defect)
- **After:** Return **first category in array** if match not found (fix)

```typescript
// OLD behavior (defect)
if (config.categories.includes(categoryName)) {
  return { valid: true, category: categoryName };
} else {
  return { valid: false, category: categoryName }; // ❌ Returns invalid!
}

// NEW behavior (fix)
if (config.categories.includes(categoryName)) {
  return { valid: true, category: categoryName };
} else {
  return { valid: false, category: config.categories[0] }; // ✅ Returns first!
}
```

### 3. **Default Account Behavior**
When account not parsed/found:
- If `CASHEW_ACCOUNTS` configured → Use **first account** (e.g., "Mono")
- If not configured → Use provided name as-is (passthrough)

---

## 📝 Config Changes Required

### Before (Old Format - Object Mapping):
```bash
# .env.local
CASHEW_ACCOUNTS='{"Mono":"Monobank","Privat":"PrivatBank","Ukrsib":"UkrSibbank"}'
CASHEW_CATEGORIES='["Побут","Покупки","Розваги"]'
```

### After (New Format - Simple Arrays):
```bash
# .env.local
CASHEW_ACCOUNTS='["Mono","Privat","Ukrsib"]'
CASHEW_CATEGORIES='["Побут","Покупки","Розваги"]'
```

**Key Changes:**
1. `CASHEW_ACCOUNTS`: Object → Array (no mapping, simpler)
2. Behavior: If AI returns category not in list, use first category

---

## 🧪 Test Changes

Updated all 9 test suites to reflect new behavior:

- ✅ `cashewConfigLoader.test.ts` - Tests for array-based config (9 tests)
- ✅ `accountMapper.test.ts` - Tests for constraint enforcement (17 tests)
- ✅ `cashewLinkGenerator.test.ts` - Updated 2 tests for array format
- ✅ All other 7 test suites pass without changes

**Total:** 212 tests passing (3 new, 209 existing)

---

## 📊 Before & After Examples

### Example 1: Category Constraint

**Input:** Transaction text = "500 UAH Starbucks"

**Before (Defect):**
```bash
CASHEW_CATEGORIES=["Побут","Покупки","Розваги"]

AI returns: "Їжа й хозяйство"
System uses: "Їжа й хозяйство" ❌
Result: Invalid category sent to Cashew
```

**After (Fixed):**
```bash
CASHEW_CATEGORIES=["Побут","Покупки","Розваги"]

AI returns: "Їжа й хозяйство"
System uses: "Побут" (first in list) ✅
Result: Valid category sent to Cashew
```

### Example 2: Account Fallback

**Input:** App = "Gmail", Body = "500 UAH payment"

**Before:**
```bash
CASHEW_ACCOUNTS={"Mono":"Monobank"} # Old format with mapping
# Would have tried to map, but format doesn't match usage
```

**After:**
```bash
CASHEW_ACCOUNTS=["Mono","Privat","Ukrsib"]

AI can't parse account → Uses "Mono" (first) ✅
Result: Default account used consistently
```

---

## 🔧 Implementation Details

### Files Changed:
1. `lib/services/cashewConfigLoader.ts`
   - Changed `accounts` from `Map<string,string>` to `string[]`
   - Changed `parseJsonConfig()` → `parseJsonArray()` for both

2. `lib/services/accountMapper.ts`
   - Updated `mapAccount()` to use first account as default
   - Updated `validateCategory()` to use first category as default
   - Simplified all account logic (no mapping)

3. Test files (3):
   - `cashewConfigLoader.test.ts` - Updated all 9 tests
   - `accountMapper.test.ts` - Updated all 17 tests
   - `cashewLinkGenerator.test.ts` - Updated 2 tests

### Documentation Updated:
1. `docs/CASHEW_INTEGRATION.md` - Config examples with new format
2. `.env.example` - New array-based examples (though not committed due to .gitignore)

---

## ✅ Verification

### Test Results:
```bash
npm test
Test Suites: 9 passed, 9 total
Tests:       212 passed, 212 total
Time:        2.9s
```

### Git Commits:
```
72a5b8d - fix: Enforce CASHEW_CATEGORIES constraints and simplify CASHEW_ACCOUNTS
22700c2 - docs: Update CASHEW_INTEGRATION.md with new array-based config
```

---

## 🚀 Deployment Notes

### For Existing Deployments:
If you have `.env.local` with old format, update:
```bash
# OLD
CASHEW_ACCOUNTS='{"Mono":"Monobank","Privat":"PrivatBank"}'

# NEW
CASHEW_ACCOUNTS='["Mono","Privat"]'
```

### Key Behavior Changes:
1. **No more account mapping** - Values used directly
2. **Category constraint enforcement** - Invalid categories replaced with first
3. **First item as default** - If AI returns unknown account/category
4. **Simpler configuration** - Arrays instead of objects

### Rollback:
Not recommended - this is a bug fix. But if needed:
- Revert commits: `git revert 72a5b8d 22700c2`
- Restore old config format
- Tests will fail until old code is restored

---

## 📚 Documentation

- **CASHEW_INTEGRATION.md** - Updated with new format examples
- **MACRODROID_INTEGRATION.md** - References correct format
- **API_REFERENCE.md** - Endpoint docs (unchanged, still works)

---

## 🎯 Summary

- ✅ Fixed category constraint not being enforced
- ✅ Simplified account config (removed unnecessary mapping)
- ✅ Added sensible defaults (first item if not found)
- ✅ Updated all tests (212 passing)
- ✅ Updated documentation
- ✅ All 9 test suites passing

**Status: Production Ready** 🚀
