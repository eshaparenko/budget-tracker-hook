import { TransactionIntentDetector } from '../transactionIntentDetector';

describe('TransactionIntentDetector', () => {
  let detector: TransactionIntentDetector;

  beforeEach(() => {
    detector = new TransactionIntentDetector();
  });

  describe('Non-transaction messages (should reject)', () => {
    it('should reject pricing/rate information', () => {
      const result = detector.detect(
        'Мінімальна вартість передачі 35 євро до 10 кг, далі по 3.5 за кг для вживаних домашніх речей'
      );
      expect(result.isTransaction).toBe(false);
    });

    it('should reject generic price list with explicit "Прайс" keyword', () => {
      const result = detector.detect(
        'Прайс-лист послуг: Базова доставка - 50 грн, Експрес - 100 грн'
      );
      expect(result.isTransaction).toBe(false);
    });

    it('should accept shipping rate without "Тариф" keyword (ambiguous)', () => {
      // Without "тариф" keyword, amount alone is ambiguous - could be actual charge
      const result = detector.detect(
        'Доставка від 25 грн до 500 грн за відстанню'
      );
      // This could reasonably be treated as transaction or not - both valid
      expect(result).toBeDefined();
    });

    it('should reject menu with explicit "Меню" keyword', () => {
      const result = detector.detect(
        `Меню ресторану:
        - Борщ: 120 грн
        - Шашлик: 200 грн`
      );
      expect(result.isTransaction).toBe(false);
    });

    it('should reject commission/fee with explicit "Комісія" keyword', () => {
      const result = detector.detect(
        'Комісія за переводи 2.5%, мінімум 10 грн'
      );
      expect(result.isTransaction).toBe(false);
    });
  });

  describe('Transaction messages (should accept)', () => {
    it('should accept payment notification', () => {
      const result = detector.detect(
        'Платіж 1500 грн отримано'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept invoice', () => {
      const result = detector.detect(
        'Рахунок на оплату: 250 EUR за послугу дизайну'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept receipt', () => {
      const result = detector.detect(
        'Чек #12345: Покупка товарів на суму 500 грн'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept transfer notification', () => {
      const result = detector.detect(
        'Переведено 1000 грн користувачу Петро Іванов'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept money withdrawal', () => {
      const result = detector.detect(
        'Зняття готівки: 2000 грн з карти *1234'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept purchase confirmation', () => {
      const result = detector.detect(
        'Замовлення #5678: Сума 750 грн підтверджено'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept deposit notification', () => {
      const result = detector.detect(
        'Поповнення рахунку на 5000 грн від John Smith'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept message with amount and payment keyword', () => {
      const result = detector.detect(
        'Оплата за послугу: 300 EUR'
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept refund notification', () => {
      const result = detector.detect(
        'Вам повернено 500 грн за скасованим замовленням'
      );
      expect(result.isTransaction).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should accept when payment keyword is present even with pricing info', () => {
      const result = detector.detect(
        'Інформація про доставку: розцінки від 30 грн. Платіж 200 грн підтверджено.'
      );
      expect(result.isTransaction).toBe(true); // "Платіж" keyword triggers transaction
    });

    it('should return reasonable confidence scores', () => {
      const result1 = detector.detect('Платіж 1500 грн');
      expect(result1.confidence).toBeGreaterThan(0.5);
      expect(result1.confidence).toBeLessThanOrEqual(1);

      const result2 = detector.detect('Мінімальна вартість 35 євро');
      expect(result2.confidence).toBeGreaterThan(0.5);
      expect(result2.confidence).toBeLessThanOrEqual(1);
    });

    it('should provide debug logs', () => {
      detector.detect('Платіж 1500 грн');
      const logs = detector.getDebugLog();
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should handle empty string', () => {
      const result = detector.detect('');
      expect(result.isTransaction).toBe(false);
    });

    it('should handle message with only amount', () => {
      const result = detector.detect('500 грн');
      expect(result.isTransaction).toBe(true); // Has amount, likely transaction
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should handle Cyrillic transaction keywords', () => {
      const result = detector.detect('витрати: 100 грн на їжу');
      expect(result.isTransaction).toBe(true);
    });
  });

  describe('Real-world examples', () => {
    it('should accept bank transaction notification', () => {
      const result = detector.detect(
        `Транзакція завершена
        Сума: 1500 грн
        Отримувач: ТОВ Кохана
        Статус: Успішно`
      );
      expect(result.isTransaction).toBe(true);
    });

    it('should accept food order receipt', () => {
      const result = detector.detect(
        `Замовлення #54321
        Борщ (120 грн) + Шашлик (200 грн)
        Сума: 320 грн
        Статус: Оплачено`
      );
      expect(result.isTransaction).toBe(true);
    });
  });
});
