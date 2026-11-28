export interface UkrsibTransferSide {
  last4: string;
  currency: string;
  amount: number;
}

type UkrsibNotification =
  | { kind: 'skip'; reason: 'transfer' | 'confirmation' | 'card_hold' }
  | { kind: 'transfer'; from: UkrsibTransferSide; to: UkrsibTransferSide }
  | { kind: 'payment'; amount: number; currency: string };

export function classifyUkrsibNotification(text: string): UkrsibNotification | undefined {
  if (/^Perekaz\s+koshtiv\s*:/i.test(text)) {
    const match = /^Perekaz\s+koshtiv\s*:\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}\s+z\s+rakhunku\s+UA[\d*]+(\d{4})\s*([A-Z]{3})\s+na\s+sumu\s+(\d+(?:[.,]\d+)?)\s*\2\s+na\s+rakhunok\s+UA[\d*]+(\d{4})\s*([A-Z]{3})\s+na\s+sumu\s+(\d+(?:[.,]\d+)?)\s*\5(?=\s|\.|$)/i.exec(text);
    if (!match) return { kind: 'skip', reason: 'transfer' };

    const [, fromLast4, fromCurrency, fromValue, toLast4, toCurrency, toValue] = match;
    const fromAmount = Number(fromValue.replace(',', '.'));
    const toAmount = Number(toValue.replace(',', '.'));
    if (![fromAmount, toAmount].every((amount) => Number.isFinite(amount) && amount > 0)) {
      return { kind: 'skip', reason: 'transfer' };
    }
    return {
      kind: 'transfer',
      from: { last4: fromLast4, currency: fromCurrency.toUpperCase(), amount: fromAmount },
      to: { last4: toLast4, currency: toCurrency.toUpperCase(), amount: toAmount },
    };
  }
  if (/^Для\s+підтвердження\s+операції(?:\s|$)/iu.test(text)) return { kind: 'skip', reason: 'confirmation' };
  if (/^Blokuvannia\s*:/i.test(text)) return { kind: 'skip', reason: 'card_hold' };

  // This notification format ends with the available balance and the bank's
  // details link. Only Suma represents the purchase itself.
  if (!/^Oplata\s*:/i.test(text)) return undefined;
  const payment = /\bSuma\s+(\d+(?:[.,]\d+)?)\s*([A-Z]{3})\.\s*Dostupno\s+\d+(?:[.,]\d+)?\s*[A-Z]{3}\.?(?:\s*Detali:\s*ukrsibbank\.com\.?)?$/i.exec(text);
  if (payment) {
    return { kind: 'payment', amount: Number(payment[1].replace(',', '.')), currency: payment[2].toUpperCase() };
  }
}
