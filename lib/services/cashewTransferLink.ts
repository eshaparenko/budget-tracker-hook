import { getCashewConfig } from './cashewConfigLoader';
import { normalizeCurrency } from './currencyConversion';
import { UkrsibTransferSide } from './ukrsibNotification';
import { buildQueryString } from '../utils/urlEncoder';

function resolveWallet(entries: unknown[], side: UkrsibTransferSide): string | undefined {
  const matches = entries.filter((entry): entry is { wallet?: unknown } => {
    if (!entry || typeof entry !== 'object') return false;
    const mapping = entry as Record<string, unknown>;
    return mapping.bank === 'ukrsib' && mapping.type === 'account'
      && mapping.last4 === side.last4 && normalizeCurrency(mapping.currency) === side.currency;
  });

  if (matches.length !== 1 || typeof matches[0].wallet !== 'string') return undefined;
  const wallet = matches[0].wallet.trim();
  const key = wallet.toLowerCase();
  const config = getCashewConfig();
  if (!wallet || normalizeCurrency(config.accountCurrencies.get(key)) !== side.currency) return undefined;

  const accounts = config.accounts.filter((account) => account.toLowerCase() === key);
  if (config.accounts.length > 0) return accounts.length === 1 ? accounts[0] : undefined;
  return wallet;
}

export function buildUkrsibTransferDraft(from: UkrsibTransferSide, to: UkrsibTransferSide) {
  let entries: unknown;
  try {
    entries = JSON.parse(process.env.CASHEW_TRANSFER_ACCOUNTS || '[]');
  } catch {
    return undefined;
  }
  if (!Array.isArray(entries)) return undefined;

  const walletFrom = resolveWallet(entries, from);
  const walletTo = resolveWallet(entries, to);
  if (!walletFrom || !walletTo || walletFrom.toLowerCase() === walletTo.toLowerCase()) return undefined;

  const query = buildQueryString({ walletFrom, walletTo, amountFrom: from.amount, amountTo: to.amount });
  return {
    success: true,
    url: 'https://cashewapp.web.app/addTransferRoute?' + query,
    transfer: {
      from: { wallet: walletFrom, amount: from.amount, currency: from.currency },
      to: { wallet: walletTo, amount: to.amount, currency: to.currency },
    },
  };
}
