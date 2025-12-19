/**
 * Тип клиента (получателя услуги)
 */
export enum IncomeType {
  /** Физическое лицо */
  FROM_INDIVIDUAL = 'FROM_INDIVIDUAL',
  /** Юридическое лицо (ИП, ООО и т.п.) */
  FROM_LEGAL_ENTITY = 'FROM_LEGAL_ENTITY',
  /** Иностранная организация */
  FROM_FOREIGN_AGENCY = 'FROM_FOREIGN_AGENCY',
}

/**
 * Тип оплаты
 */
export enum PaymentType {
  /** Наличные */
  CASH = 'CASH',
  /** Безналичный расчёт */
  ACCOUNT = 'ACCOUNT',
}

/**
 * Причина отмены чека
 */
export enum CancelReason {
  /** Чек сформирован ошибочно */
  CANCEL = 'CANCEL',
  /** Возврат средств */
  REFUND = 'REFUND',
}

/**
 * Тип источника устройства
 */
export enum SourceType {
  WEB = 'WEB',
  ANDROID = 'android',
  IOS = 'ios',
}

/**
 * Параметры авторизации через ИНН и пароль
 */
export interface AuthByInnParams {
  inn: string;
  password: string;
}

/**
 * Параметры авторизации через телефон
 */
export interface AuthByPhoneParams {
  phone: string;
}

/**
 * Информация об устройстве для API
 */
export interface DeviceInfo {
  sourceDeviceId: string;
  sourceType: SourceType;
  appVersion: string;
  metaDetails: {
    userAgent: string;
  };
}

/**
 * Клиент (получатель услуги)
 */
export interface IncomeClient {
  /** Тип клиента */
  incomeType: IncomeType;
  /** Отображаемое имя */
  displayName?: string | null;
  /** Телефон */
  contactPhone?: string | null;
  /** ИНН клиента */
  inn?: string | null;
}

/**
 * Услуга/товар для чека
 */
export interface IncomeService {
  /** Наименование услуги/товара */
  name: string;
  /** Сумма */
  amount: number;
  /** Количество */
  quantity?: number;
}

/**
 * Параметры создания чека
 */
export interface CreateIncomeParams {
  /** Наименование услуги/товара */
  name: string;
  /** Сумма */
  amount: number;
  /** Количество (по умолчанию 1) */
  quantity?: number;
  /** Дата и время операции (по умолчанию текущее время) */
  operationTime?: Date;
  /** Тип оплаты */
  paymentType?: PaymentType;
  /** Информация о клиенте */
  client?: Partial<IncomeClient>;
  /** Игнорировать ограничение максимального дохода */
  ignoreMaxTotalIncomeRestriction?: boolean;
}

/**
 * Параметры создания чека с несколькими позициями
 */
export interface CreateMultipleIncomeParams {
  /** Список услуг/товаров */
  services: IncomeService[];
  /** Дата и время операции */
  operationTime?: Date;
  /** Тип оплаты */
  paymentType?: PaymentType;
  /** Информация о клиенте */
  client?: Partial<IncomeClient>;
  /** Игнорировать ограничение максимального дохода */
  ignoreMaxTotalIncomeRestriction?: boolean;
}

/**
 * Параметры отмены чека
 */
export interface CancelIncomeParams {
  /** UUID чека */
  receiptUuid: string;
  /** Причина отмены */
  reason: CancelReason;
  /** Комментарий к отмене */
  comment?: string;
  /** Дата и время отмены */
  operationTime?: Date;
  /** Время запроса */
  requestTime?: Date;
}

/**
 * Результат создания чека
 */
export interface IncomeResult {
  /** UUID подтверждённого чека */
  approvedReceiptUuid: string;
  /** Название */
  name?: string;
  /** Сумма */
  amount?: number;
}

/**
 * Информация о чеке
 */
export interface Receipt {
  /** UUID чека */
  receiptUuid: string;
  /** Ссылка на печатную форму */
  printUrl: string;
  /** Ссылка на JSON-данные */
  jsonUrl: string;
}

/**
 * JSON-данные чека из API
 */
export interface ReceiptJson {
  /** ID чека */
  receiptId: string;
  /** Список услуг/товаров */
  services: {
    name: string;
    quantity: number;
    serviceNumber: number;
    amount: number;
  }[];
  /** Время операции */
  operationTime: string;
  /** Время запроса */
  requestTime: string;
  /** Время регистрации */
  registerTime: string;
  /** ID налогового периода (YYYYMM) */
  taxPeriodId: number;
  /** Тип оплаты */
  paymentType: string;
  /** Тип дохода */
  incomeType: string;
  /** Общая сумма */
  totalAmount: number;
  /** Информация об отмене */
  cancellationInfo: {
    operationTime: string;
    registerTime: string;
    taxPeriodId: number;
    comment: string;
  } | null;
  /** ID устройства */
  sourceDeviceId: string;
  /** ИНН клиента */
  clientInn: string | null;
  /** Имя клиента */
  clientDisplayName: string | null;
  /** Название партнёра */
  partnerDisplayName: string | null;
  /** ИНН партнёра */
  partnerInn: string | null;
  /** ИНН самозанятого */
  inn: string;
  /** Профессия */
  profession: string;
  /** Описание */
  description: string[];
  /** Email */
  email: string | null;
  /** Телефон */
  phone: string | null;
  /** ID счёта */
  invoiceId: string | null;
}

/**
 * Профиль пользователя из ответа авторизации
 */
export interface AuthProfile {
  id: number;
  displayName: string;
  inn: string;
  phone: string;
  email?: string;
  snils?: string;
  status: string;
  firstReceiptRegisterTime?: string;
  registrationDate?: string;
}

/**
 * Ответ API с токеном
 */
export interface TokenResponse {
  token: string;
  refreshToken: string;
  tokenExpireIn: string;
  refreshTokenExpiresIn?: string | null;
  profile?: AuthProfile;
}

/**
 * Информация о пользователе
 */
export interface UserInfo {
  inn: string;
  phone?: string;
  email?: string;
  displayName?: string;
  firstReceiptRegisterTime?: string;
  region?: string;
}

/**
 * Ошибка API
 */
export interface ApiError {
  code: string;
  message: string;
}

/**
 * Опции клиента API
 */
export interface NalogApiOptions {
  /** ИНН самозанятого */
  inn?: string;
  /** Пароль от ЛК ФНС */
  password?: string;
  /** Номер телефона (без +7, 10 цифр) */
  phone?: string;
  /** Access Token (если уже получен) */
  accessToken?: string;
  /** Refresh Token */
  refreshToken?: string;
  /** Device ID */
  deviceId?: string;
  /** Часовой пояс */
  timezone?: string;
  /** Базовый URL API */
  baseUrl?: string;
  /** Автоматически обновлять токен */
  autoRefreshToken?: boolean;
  /** Сохранять токены в файл */
  saveToken?: boolean;
  /** Путь к файлу с токенами (по умолчанию "session-token.json") */
  saveTokenPath?: string;
}

/**
 * Структура сохранённых токенов
 */
export interface SavedTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpireIn: string;
  inn: string | null;
  deviceId: string;
  savedAt: string;
}

/**
 * Состояние авторизации
 */
export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpireIn: Date | null;
  inn: string | null;
}
