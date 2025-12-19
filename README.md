# lknpd-nalog-api-ts

[![npm version](https://img.shields.io/npm/v/lknpd-nalog-api-ts.svg)](https://www.npmjs.com/package/lknpd-nalog-api-ts)
[![CI](https://github.com/mityayka1/lknpd-nalog-api-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/mityayka1/lknpd-nalog-api-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mityayka1/lknpd-nalog-api-ts/branch/master/graph/badge.svg)](https://codecov.io/gh/mityayka1/lknpd-nalog-api-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

TypeScript клиент для работы с API lknpd.nalog.ru (Мой налог) — формирование и отмена чеков для самозанятых.

## Возможности

- Авторизация по ИНН/паролю или SMS
- Создание чеков (с одной или несколькими позициями)
- Отмена чеков
- Получение данных чека
- Автоматическое обновление токенов
- Сохранение сессии между запусками
- CLI для быстрой авторизации

## Установка

```bash
npm install lknpd-nalog-api-ts
```

## Быстрый старт

```typescript
import { NalogApi, IncomeType, PaymentType, CancelReason } from 'lknpd-nalog-api-ts';

// Создание клиента с авторизацией по ИНН и паролю от ЛК ФНС
const api = new NalogApi({
  inn: '123456789012',
  password: 'your_password',
});

// Авторизация
await api.auth();

// Создание чека
const receipt = await api.addIncome({
  name: 'Консультационные услуги',
  amount: 5000,
});

console.log('Чек создан:', receipt.printUrl);
```

## Способы авторизации

### По ИНН и паролю от ЛК ФНС

```typescript
const api = new NalogApi({
  inn: '123456789012',
  password: 'your_password',
});

await api.auth();
```

### По номеру телефона (SMS)

**Через CLI (рекомендуется для первичной авторизации):**

```bash
npx lknpd-authorize
```

Скрипт запросит номер телефона, отправит SMS и сохранит токены в `session-token.json`.

**Программно:**

```typescript
const api = new NalogApi({
  saveToken: true,
});

// Запрос SMS-кода
const challengeToken = await api.requestSmsCode('79001234567');

// Ввод кода из SMS (получен от пользователя)
await api.authByPhone('79001234567', challengeToken, '123456');
```

### С использованием refresh token

```typescript
const api = new NalogApi({
  refreshToken: 'your_refresh_token',
});

await api.auth();
```

## Создание чеков

### Простой чек

```typescript
const receipt = await api.addIncome({
  name: 'Разработка сайта',
  amount: 50000,
});
```

### Чек с указанием клиента (юр. лицо)

```typescript
const receipt = await api.addIncome({
  name: 'Разработка сайта',
  amount: 50000,
  client: {
    incomeType: IncomeType.FROM_LEGAL_ENTITY,
    displayName: 'ООО "Компания"',
    inn: '7700000000',
  },
});
```

### Чек с указанием клиента (физ. лицо)

```typescript
const receipt = await api.addIncome({
  name: 'Консультация',
  amount: 3000,
  client: {
    incomeType: IncomeType.FROM_INDIVIDUAL,
    displayName: 'Иванов Иван',
    contactPhone: '+79001234567',
  },
});
```

### Чек с несколькими позициями

```typescript
const receipt = await api.addMultipleIncome({
  services: [
    { name: 'Дизайн логотипа', amount: 10000, quantity: 1 },
    { name: 'Визитки', amount: 500, quantity: 100 },
  ],
  client: {
    incomeType: IncomeType.FROM_LEGAL_ENTITY,
    displayName: 'ИП Петров',
    inn: '123456789012',
  },
});
```

### Полный набор параметров

```typescript
const receipt = await api.addIncome({
  name: 'Услуга',
  amount: 1000,
  quantity: 2,
  operationTime: new Date('2025-01-15 14:30:00'),
  paymentType: PaymentType.ACCOUNT, // безналичный расчёт
  client: {
    incomeType: IncomeType.FROM_LEGAL_ENTITY,
    displayName: 'ООО "Компания"',
    inn: '7700000000',
  },
  ignoreMaxTotalIncomeRestriction: false,
});
```

## Отмена чеков

```typescript
// Отмена по причине ошибки
await api.cancelIncome({
  receiptUuid: '20hykdxbp8',
  reason: CancelReason.CANCEL,
});

// Возврат средств
await api.cancelIncome({
  receiptUuid: '20hykdxbp8',
  reason: CancelReason.REFUND,
  comment: 'Возврат по заявлению клиента',
});
```

## Получение данных чека

```typescript
// После создания чека
const receipt = await api.addIncome({ name: 'Услуга', amount: 1000 });
console.log('Печатная форма:', receipt.printUrl);
console.log('JSON данные:', receipt.jsonUrl);

// Получение полных данных чека
const receiptData = await api.getReceiptJson('20hykdxbp8');
console.log('Сумма:', receiptData.totalAmount);
console.log('Услуги:', receiptData.services);
console.log('Клиент:', receiptData.clientDisplayName);
console.log('Статус отмены:', receiptData.cancellationInfo);

// Получение ссылок для существующего чека
const printUrl = api.getReceiptPrintUrl('20hykdxbp8');
const jsonUrl = api.getReceiptJsonUrl('20hykdxbp8');
```

## Вызов произвольных методов API

```typescript
// GET запрос
const summary = await api.call('incomes/summary');

// POST запрос
const result = await api.call('some/endpoint', { param: 'value' });
```

## Работа с токенами

```typescript
// Получение текущего состояния
const state = api.getAuthState();
console.log('Access Token:', state.accessToken);
console.log('Refresh Token:', state.refreshToken);
console.log('ИНН:', state.inn);

// Восстановление сессии
api.setTokens('access_token', 'refresh_token', '123456789012');
```

## Типы

### IncomeType — тип клиента

| Значение | Описание |
|----------|----------|
| `FROM_INDIVIDUAL` | Физическое лицо |
| `FROM_LEGAL_ENTITY` | Юридическое лицо (ИП, ООО) |
| `FROM_FOREIGN_AGENCY` | Иностранная организация |

### PaymentType — тип оплаты

| Значение | Описание |
|----------|----------|
| `CASH` | Наличные |
| `ACCOUNT` | Безналичный расчёт |

### CancelReason — причина отмены

| Значение | Описание |
|----------|----------|
| `CANCEL` | Чек сформирован ошибочно |
| `REFUND` | Возврат средств |

## Конфигурация

```typescript
const api = new NalogApi({
  inn: '123456789012',
  password: 'password',
  timezone: 'Asia/Yekaterinburg', // часовой пояс (по умолчанию Europe/Moscow)
  autoRefreshToken: true, // автообновление токена (по умолчанию true)
  baseUrl: 'https://lknpd.nalog.ru/api/v1', // базовый URL API
  saveToken: true, // сохранять токены в файл (по умолчанию false)
  saveTokenPath: './my-tokens.json', // путь к файлу (по умолчанию "session-token.json")
});
```

## Сохранение токенов между запусками

По умолчанию токены хранятся только в памяти. Чтобы сохранять их в файл и автоматически восстанавливать при следующем запуске:

```typescript
const api = new NalogApi({
  saveToken: true,
  saveTokenPath: './session-token.json',
});

// После авторизации токены автоматически сохраняются
await api.auth();

// При следующем запуске токены загрузятся из файла
// Если access token просрочен — автоматически обновится через refresh token
```

> **Важно:** Добавьте `session-token.json` в `.gitignore`, чтобы токены не попали в репозиторий.

## Обработка ошибок

```typescript
import { NalogApi, NalogApiError } from 'lknpd-nalog-api-ts';

try {
  await api.addIncome({ name: 'Услуга', amount: 1000 });
} catch (error) {
  if (error instanceof NalogApiError) {
    console.error('Ошибка API:', error.message);
    console.error('Код ошибки:', error.code);
    console.error('Ответ сервера:', error.response);
  }
}
```

## TODO

- [ ] Создание счетов на оплату (invoices)
- [ ] Отмена счетов на оплату
- [ ] Получение списка счетов
- [ ] Получение списка чеков
- [ ] Получение статистики доходов

## Требования

- Node.js >= 20.0.0
- Регистрация как самозанятый в приложении "Мой налог"

## Лицензия

MIT

## Дисклеймер

Это неофициальная библиотека. Используйте на свой риск. API может измениться без предупреждения со стороны ФНС.

## Благодарности

Вдохновлено проектом [lknpd-nalog-api](https://github.com/miglm/lknpd-nalog-api).
