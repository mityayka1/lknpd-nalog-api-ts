import * as fs from 'fs';
import * as path from 'path';
import {
  NalogApiOptions,
  AuthState,
  DeviceInfo,
  SourceType,
  IncomeType,
  PaymentType,
  CancelReason,
  CreateIncomeParams,
  CreateMultipleIncomeParams,
  CancelIncomeParams,
  IncomeResult,
  Receipt,
  ReceiptJson,
  TokenResponse,
  UserInfo,
  IncomeClient,
  IncomeService,
  SavedTokens,
} from './types.js';

/**
 * Ошибка API налоговой
 */
export class NalogApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public response?: unknown
  ) {
    super(message);
    this.name = 'NalogApiError';
  }
}

/**
 * Клиент API для работы с lknpd.nalog.ru (Мой налог)
 *
 * @example
 * ```typescript
 * // Авторизация по ИНН и паролю
 * const api = new NalogApi({ inn: '123456789012', password: 'myPassword' });
 * await api.auth();
 *
 * // Создание чека
 * const receipt = await api.addIncome({
 *   name: 'Консультационные услуги',
 *   amount: 5000,
 * });
 * console.log(receipt.printUrl);
 * ```
 */
export class NalogApi {
  private readonly baseUrl: string;
  private readonly timezone: string;
  private readonly deviceInfo: DeviceInfo;
  private readonly autoRefreshToken: boolean;
  private readonly saveToken: boolean;
  private readonly saveTokenPath: string;

  private authState: AuthState = {
    accessToken: null,
    refreshToken: null,
    tokenExpireIn: null,
    inn: null,
  };

  private authParams: {
    inn?: string;
    password?: string;
    phone?: string;
  } = {};

  constructor(options: NalogApiOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://lknpd.nalog.ru/api/v1';
    this.timezone = options.timezone || 'Europe/Moscow';
    this.autoRefreshToken = options.autoRefreshToken ?? true;
    this.saveToken = options.saveToken ?? false;
    this.saveTokenPath = options.saveTokenPath || 'session-token.json';

    this.deviceInfo = {
      sourceDeviceId: options.deviceId || this.generateDeviceId(),
      sourceType: SourceType.WEB,
      appVersion: '1.0.0',
      metaDetails: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    // Пытаемся загрузить сохранённые токены
    if (this.saveToken) {
      this.loadTokensFromFile();
    }

    if (options.inn) {
      this.authParams.inn = options.inn;
      if (!this.authState.inn) {
        this.authState.inn = options.inn;
      }
    }
    if (options.password) {
      this.authParams.password = options.password;
    }
    if (options.phone) {
      this.authParams.phone = this.normalizePhone(options.phone);
    }
    if (options.accessToken && !this.authState.accessToken) {
      this.authState.accessToken = options.accessToken;
    }
    if (options.refreshToken && !this.authState.refreshToken) {
      this.authState.refreshToken = options.refreshToken;
    }
    
    // Используем deviceId из сохранённых токенов или из опций
    if (options.deviceId) {
      this.deviceInfo.sourceDeviceId = options.deviceId;
    }
  }

  /**
   * Генерирует уникальный Device ID
   */
  private generateDeviceId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Загружает токены из файла
   */
  private loadTokensFromFile(): boolean {
    try {
      const filePath = path.resolve(this.saveTokenPath);
      
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      const saved: SavedTokens = JSON.parse(data);

      // Проверяем наличие обязательных полей
      if (!saved.refreshToken) {
        return false;
      }

      // Проверяем не просрочен ли access token
      const tokenExpireIn = new Date(saved.tokenExpireIn);
      const now = new Date();
      const isAccessTokenValid = tokenExpireIn > now;

      // Загружаем данные
      this.authState.refreshToken = saved.refreshToken;
      this.authState.inn = saved.inn;
      this.authState.tokenExpireIn = tokenExpireIn;

      // Access token загружаем только если он ещё валиден
      if (isAccessTokenValid) {
        this.authState.accessToken = saved.accessToken;
      }

      // Восстанавливаем deviceId
      if (saved.deviceId) {
        this.deviceInfo.sourceDeviceId = saved.deviceId;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Сохраняет токены в файл
   */
  private saveTokensToFile(): void {
    if (!this.saveToken) {
      return;
    }

    try {
      const filePath = path.resolve(this.saveTokenPath);
      
      const data: SavedTokens = {
        accessToken: this.authState.accessToken || '',
        refreshToken: this.authState.refreshToken || '',
        tokenExpireIn: this.authState.tokenExpireIn?.toISOString() || '',
        inn: this.authState.inn,
        deviceId: this.deviceInfo.sourceDeviceId,
        savedAt: new Date().toISOString(),
      };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      // Логируем ошибку, но не прерываем выполнение
      console.error('Failed to save tokens to file:', error);
    }
  }

  /**
   * Удаляет файл с токенами
   */
  clearSavedTokens(): void {
    try {
      const filePath = path.resolve(this.saveTokenPath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Игнорируем ошибки
    }
  }

  /**
   * Нормализует номер телефона
   */
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('8') && digits.length === 11) {
      return '7' + digits.slice(1);
    }
    if (digits.startsWith('7') && digits.length === 11) {
      return digits;
    }
    if (digits.length === 10) {
      return '7' + digits;
    }
    return digits;
  }

  /**
   * Форматирует дату в ISO формат с таймзоной
   */
  private formatDate(date: Date = new Date()): string {
    const offset = this.getTimezoneOffset();
    const localDate = new Date(date.getTime());
    return localDate.toISOString().slice(0, -1) + offset;
  }

  /**
   * Получает смещение часового пояса
   */
  private getTimezoneOffset(): string {
    const timezoneOffsets: Record<string, string> = {
      'Europe/Moscow': '+03:00',
      'Europe/Kaliningrad': '+02:00',
      'Europe/Samara': '+04:00',
      'Asia/Yekaterinburg': '+05:00',
      'Asia/Omsk': '+06:00',
      'Asia/Krasnoyarsk': '+07:00',
      'Asia/Irkutsk': '+08:00',
      'Asia/Yakutsk': '+09:00',
      'Asia/Vladivostok': '+10:00',
      'Asia/Magadan': '+11:00',
      'Asia/Kamchatka': '+12:00',
    };
    return timezoneOffsets[this.timezone] || '+03:00';
  }

  /**
   * Выполняет HTTP запрос к API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    requireAuth = true
  ): Promise<T> {
    if (requireAuth && this.autoRefreshToken) {
      await this.ensureValidToken();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
    };

    if (requireAuth && this.authState.accessToken) {
      headers['Authorization'] = `Bearer ${this.authState.accessToken}`;
    }

    const url = `${this.baseUrl}/${endpoint}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data: unknown;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const errorData = data as { code?: string; message?: string } | null;
      throw new NalogApiError(
        errorData?.message || `HTTP Error: ${response.status}`,
        errorData?.code,
        data
      );
    }

    return data as T;
  }

  /**
   * Проверяет и обновляет токен при необходимости
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.authState.accessToken) {
      await this.auth();
      return;
    }

    if (this.authState.tokenExpireIn) {
      const now = new Date();
      const expireTime = new Date(this.authState.tokenExpireIn);
      // Обновляем за 5 минут до истечения
      if (now >= new Date(expireTime.getTime() - 5 * 60 * 1000)) {
        await this.refreshAccessToken();
      }
    }
  }

  /**
   * Авторизация в API
   *
   * @throws {NalogApiError} При ошибке авторизации
   */
  async auth(): Promise<TokenResponse> {
    if (this.authState.refreshToken) {
      return this.refreshAccessToken();
    }

    if (this.authParams.inn && this.authParams.password) {
      return this.authByInn(this.authParams.inn, this.authParams.password);
    }

    if (this.authParams.phone) {
      throw new NalogApiError(
        'Для авторизации по телефону используйте методы requestSmsCode() и authByPhone()'
      );
    }

    throw new NalogApiError(
      'Не указаны параметры авторизации. Укажите inn+password или phone'
    );
  }

  /**
   * Авторизация по ИНН и паролю от ЛК ФНС
   */
  async authByInn(inn: string, password: string): Promise<TokenResponse> {
    const response = await this.request<TokenResponse>(
      'POST',
      'auth/lkfl',
      {
        inn,
        password,
        deviceInfo: this.deviceInfo,
      },
      false
    );

    this.authState.accessToken = response.token;
    this.authState.refreshToken = response.refreshToken;
    this.authState.tokenExpireIn = new Date(response.tokenExpireIn);
    this.authState.inn = inn;

    this.saveTokensToFile();

    return response;
  }

  /**
   * Запрос SMS-кода для авторизации по телефону
   *
   * @returns challengeToken для последующей авторизации
   */
  async requestSmsCode(phone: string): Promise<string> {
    const normalizedPhone = this.normalizePhone(phone);

    // Используем v2 API для запроса SMS
    const url = this.baseUrl.replace('/v1', '/v2') + '/auth/challenge/sms/start';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        requireTpToBeActive: true,
        deviceData: {
          sourceType: SourceType.WEB,
        },
      }),
    });

    const data = await response.json() as { challengeToken: string };

    if (!response.ok) {
      throw new NalogApiError(
        (data as unknown as { message?: string }).message || `HTTP Error: ${response.status}`,
        (data as unknown as { code?: string }).code,
        data
      );
    }

    return data.challengeToken;
  }

  /**
   * Авторизация по телефону с SMS-кодом
   */
  async authByPhone(
    phone: string,
    challengeToken: string,
    code: string
  ): Promise<TokenResponse> {
    const normalizedPhone = this.normalizePhone(phone);

    const response = await this.request<TokenResponse>(
      'POST',
      'auth/challenge/sms/verify',
      {
        phone: normalizedPhone,
        code,
        challengeToken,
        deviceInfo: this.deviceInfo,
      },
      false
    );

    this.authState.accessToken = response.token;
    this.authState.refreshToken = response.refreshToken;
    this.authState.tokenExpireIn = new Date(response.tokenExpireIn);

    // ИНН приходит в profile из ответа
    if (response.profile?.inn) {
      this.authState.inn = response.profile.inn;
    }

    this.saveTokensToFile();

    return response;
  }

  /**
   * Обновление access token через refresh token
   */
  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.authState.refreshToken) {
      throw new NalogApiError('Refresh token отсутствует');
    }

    const response = await this.request<TokenResponse>(
      'POST',
      'auth/token',
      {
        refreshToken: this.authState.refreshToken,
        deviceInfo: this.deviceInfo,
      },
      false
    );

    this.authState.accessToken = response.token;
    this.authState.refreshToken = response.refreshToken;
    this.authState.tokenExpireIn = new Date(response.tokenExpireIn);

    this.saveTokensToFile();

    return response;
  }

  /**
   * Получение информации о пользователе
   */
  async getUserInfo(): Promise<UserInfo> {
    const response = await this.request<UserInfo>('GET', 'user');
    if (response.inn) {
      this.authState.inn = response.inn;
    }
    return response;
  }

  /**
   * Получение текущего ИНН
   */
  getInn(): string | null {
    return this.authState.inn;
  }

  /**
   * Установка ИНН вручную
   */
  setInn(inn: string): void {
    this.authState.inn = inn;
  }

  /**
   * Создание чека (регистрация дохода)
   *
   * @example
   * ```typescript
   * const receipt = await api.addIncome({
   *   name: 'Разработка сайта',
   *   amount: 50000,
   *   client: {
   *     incomeType: IncomeType.FROM_LEGAL_ENTITY,
   *     displayName: 'ООО "Компания"',
   *     inn: '7700000000',
   *   },
   * });
   * ```
   */
  async addIncome(params: CreateIncomeParams): Promise<Receipt> {
    const {
      name,
      amount,
      quantity = 1,
      operationTime = new Date(),
      paymentType = PaymentType.CASH,
      client,
      ignoreMaxTotalIncomeRestriction = false,
    } = params;

    const incomeClient: IncomeClient = {
      incomeType: client?.incomeType || IncomeType.FROM_INDIVIDUAL,
      displayName: client?.displayName || null,
      contactPhone: client?.contactPhone || null,
      inn: client?.inn || null,
    };

    const requestBody = {
      operationTime: this.formatDate(operationTime),
      requestTime: this.formatDate(),
      paymentType,
      ignoreMaxTotalIncomeRestriction,
      client: incomeClient,
      services: [
        {
          name,
          amount: String(amount),
          quantity,
        },
      ],
      totalAmount: String(amount * quantity),
    };

    const response = await this.request<IncomeResult>('POST', 'income', requestBody);

    return this.buildReceipt(response.approvedReceiptUuid);
  }

  /**
   * Создание чека с несколькими позициями
   */
  async addMultipleIncome(params: CreateMultipleIncomeParams): Promise<Receipt> {
    const {
      services,
      operationTime = new Date(),
      paymentType = PaymentType.CASH,
      client,
      ignoreMaxTotalIncomeRestriction = false,
    } = params;

    const incomeClient: IncomeClient = {
      incomeType: client?.incomeType || IncomeType.FROM_INDIVIDUAL,
      displayName: client?.displayName || null,
      contactPhone: client?.contactPhone || null,
      inn: client?.inn || null,
    };

    const totalAmount = services.reduce(
      (sum: number, s: IncomeService) => sum + s.amount * (s.quantity || 1),
      0
    );

    const requestBody = {
      operationTime: this.formatDate(operationTime),
      requestTime: this.formatDate(),
      paymentType,
      ignoreMaxTotalIncomeRestriction,
      client: incomeClient,
      services: services.map((s: IncomeService) => ({
        name: s.name,
        amount: String(s.amount),
        quantity: s.quantity || 1,
      })),
      totalAmount: String(totalAmount),
    };

    const response = await this.request<IncomeResult>('POST', 'income', requestBody);

    return this.buildReceipt(response.approvedReceiptUuid);
  }

  /**
   * Отмена чека
   *
   * @example
   * ```typescript
   * await api.cancelIncome({
   *   receiptUuid: '20hykdxbp8',
   *   reason: CancelReason.REFUND,
   * });
   * ```
   */
  async cancelIncome(params: CancelIncomeParams): Promise<IncomeResult> {
    const {
      receiptUuid,
      reason,
      comment,
      operationTime = new Date(),
      requestTime = new Date(),
    } = params;

    const requestBody = {
      receiptUuid,
      comment: comment || this.getCancelReasonText(reason),
      operationTime: this.formatDate(operationTime),
      requestTime: this.formatDate(requestTime),
      partnerCode: null,
    };

    return this.request<IncomeResult>('POST', 'cancel', requestBody);
  }

  /**
   * Получение текста причины отмены
   */
  private getCancelReasonText(reason: CancelReason): string {
    switch (reason) {
      case CancelReason.CANCEL:
        return 'Чек сформирован ошибочно';
      case CancelReason.REFUND:
        return 'Возврат средств';
      default:
        return 'Отмена чека';
    }
  }

  /**
   * Формирует объект Receipt с ссылками
   */
  private buildReceipt(receiptUuid: string): Receipt {
    const inn = this.authState.inn;
    if (!inn) {
      throw new NalogApiError('ИНН не определён. Выполните авторизацию или установите ИНН вручную через setInn()');
    }

    return {
      receiptUuid,
      printUrl: `${this.baseUrl}/receipt/${inn}/${receiptUuid}/print`,
      jsonUrl: `${this.baseUrl}/receipt/${inn}/${receiptUuid}/json`,
    };
  }

  /**
   * Получение ссылки на печатную форму чека
   */
  getReceiptPrintUrl(receiptUuid: string, inn?: string): string {
    const receiptInn = inn || this.authState.inn;
    if (!receiptInn) {
      throw new NalogApiError('ИНН не указан');
    }
    return `${this.baseUrl}/receipt/${receiptInn}/${receiptUuid}/print`;
  }

  /**
   * Получение ссылки на JSON чека
   */
  getReceiptJsonUrl(receiptUuid: string, inn?: string): string {
    const receiptInn = inn || this.authState.inn;
    if (!receiptInn) {
      throw new NalogApiError('ИНН не указан');
    }
    return `${this.baseUrl}/receipt/${receiptInn}/${receiptUuid}/json`;
  }

  /**
   * Получение JSON-данных чека
   *
   * @example
   * ```typescript
   * const receipt = await api.getReceiptJson('2026u7ia1u');
   * console.log(receipt.totalAmount);
   * console.log(receipt.services);
   * ```
   */
  async getReceiptJson(receiptUuid: string, inn?: string): Promise<ReceiptJson> {
    const receiptInn = inn || this.authState.inn;
    if (!receiptInn) {
      throw new NalogApiError('ИНН не указан');
    }
    return this.request<ReceiptJson>('GET', `receipt/${receiptInn}/${receiptUuid}/json`);
  }

  /**
   * Вызов произвольного метода API
   *
   * @example
   * ```typescript
   * const summary = await api.call('incomes/summary');
   * ```
   */
  async call<T>(
    endpoint: string,
    body?: unknown,
    method: 'GET' | 'POST' = body ? 'POST' : 'GET'
  ): Promise<T> {
    return this.request<T>(method, endpoint, body);
  }

  /**
   * Получение текущего состояния авторизации
   */
  getAuthState(): Readonly<AuthState> {
    return { ...this.authState };
  }

  /**
   * Установка токенов (для восстановления сессии)
   */
  setTokens(accessToken: string, refreshToken?: string, inn?: string): void {
    this.authState.accessToken = accessToken;
    if (refreshToken) {
      this.authState.refreshToken = refreshToken;
    }
    if (inn) {
      this.authState.inn = inn;
    }
  }
}

export default NalogApi;
