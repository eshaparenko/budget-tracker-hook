type UkrsibNotification =
  | { kind: 'skip'; reason: 'transfer' | 'confirmation' | 'card_hold' }
  | { kind: 'payment'; amount: number; currency: string };

export function classifyUkrsibNotification(text: string): UkrsibNotification | undefined {
  if (/^Perekaz\s+koshtiv\s*:/i.test(text)) return { kind: 'skip', reason: 'transfer' };
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
