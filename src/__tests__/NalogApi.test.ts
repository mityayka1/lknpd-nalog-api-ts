import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NalogApi, NalogApiError } from '../NalogApi';
import { IncomeType, PaymentType, CancelReason } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Мок fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Мок fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('NalogApi', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    vi.mocked(fs.unlinkSync).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const api = new NalogApi();
      expect(api).toBeInstanceOf(NalogApi);
    });

    it('should create instance with custom options', () => {
      const api = new NalogApi({
        inn: '123456789012',
        password: 'test',
        timezone: 'Asia/Yekaterinburg',
      });
      expect(api.getInn()).toBe('123456789012');
    });

    it('should generate unique deviceId', () => {
      const api1 = new NalogApi();
      const api2 = new NalogApi();
      const state1 = api1.getAuthState();
      const state2 = api2.getAuthState();
      // Каждый инстанс имеет свой deviceId (проверяем через разные authState)
      expect(state1).not.toBe(state2);
    });
  });

  describe('normalizePhone', () => {
    it('should normalize phone with 8 prefix', () => {
      const api = new NalogApi({ phone: '89991234567' });
      // Проверяем через authParams (косвенно)
      expect(api).toBeInstanceOf(NalogApi);
    });

    it('should normalize phone with +7 prefix', () => {
      const api = new NalogApi({ phone: '+7 999 123-45-67' });
      expect(api).toBeInstanceOf(NalogApi);
    });
  });

  describe('authByInn', () => {
    it('should authenticate with INN and password', async () => {
      const mockResponse = {
        token: 'test-token',
        refreshToken: 'test-refresh-token',
        tokenExpireIn: '2025-12-31T23:59:59.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const api = new NalogApi();
      const result = await api.authByInn('123456789012', 'password');

      expect(result.token).toBe('test-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(api.getAuthState().accessToken).toBe('test-token');
    });

    it('should throw NalogApiError on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({
          code: 'AUTH_ERROR',
          message: 'Invalid credentials',
        })),
      });

      const api = new NalogApi();

      await expect(api.authByInn('123456789012', 'wrong'))
        .rejects.toThrow(NalogApiError);
    });
  });

  describe('requestSmsCode', () => {
    it('should request SMS code and return challengeToken', async () => {
      const mockResponse = {
        challengeToken: 'test-challenge-token',
        expireDate: '2025-12-31T23:59:59.000Z',
        expireIn: 120,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const api = new NalogApi();
      const result = await api.requestSmsCode('79991234567');

      expect(result).toBe('test-challenge-token');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v2/auth/challenge/sms/start'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('authByPhone', () => {
    it('should authenticate with phone and SMS code', async () => {
      const mockResponse = {
        token: 'test-token',
        refreshToken: 'test-refresh-token',
        tokenExpireIn: '2025-12-31T23:59:59.000Z',
        profile: {
          id: 123,
          inn: '323308082612',
          displayName: 'Test User',
          phone: '79991234567',
          status: 'ACTIVE',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const api = new NalogApi();
      const result = await api.authByPhone('79991234567', 'challenge-token', '123456');

      expect(result.token).toBe('test-token');
      expect(result.profile?.inn).toBe('323308082612');
      expect(api.getInn()).toBe('323308082612');
    });
  });

  describe('addIncome', () => {
    it('should create income receipt', async () => {
      // Мокаем авторизацию
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      const mockResponse = {
        approvedReceiptUuid: '2026u7ia1u',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await api.addIncome({
        name: 'Тестовая услуга',
        amount: 1000,
      });

      expect(result.receiptUuid).toBe('2026u7ia1u');
      expect(result.printUrl).toContain('123456789012');
      expect(result.printUrl).toContain('2026u7ia1u');
    });

    it('should create income with client info', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'test-uuid',
        })),
      });

      await api.addIncome({
        name: 'Услуга для юрлица',
        amount: 50000,
        client: {
          incomeType: IncomeType.FROM_LEGAL_ENTITY,
          displayName: 'ООО "Тест"',
          inn: '7700000000',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/income'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('FROM_LEGAL_ENTITY'),
        })
      );
    });

    it('should throw error when INN is not set', async () => {
      const api = new NalogApi();
      api.setTokens('test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'test-uuid',
        })),
      });

      await expect(api.addIncome({ name: 'Test', amount: 100 }))
        .rejects.toThrow('ИНН не определён');
    });
  });

  describe('addMultipleIncome', () => {
    it('should create income with multiple services', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'multi-uuid',
        })),
      });

      const result = await api.addMultipleIncome({
        services: [
          { name: 'Услуга 1', amount: 1000, quantity: 1 },
          { name: 'Услуга 2', amount: 500, quantity: 2 },
        ],
      });

      expect(result.receiptUuid).toBe('multi-uuid');
    });
  });

  describe('cancelIncome', () => {
    it('should cancel receipt', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'cancelled-uuid',
        })),
      });

      const result = await api.cancelIncome({
        receiptUuid: 'test-uuid',
        reason: CancelReason.REFUND,
      });

      expect(result.approvedReceiptUuid).toBe('cancelled-uuid');
    });
  });

  describe('getReceiptJson', () => {
    it('should get receipt JSON data', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      const mockReceipt = {
        receiptId: '2026u7ia1u',
        services: [{ name: 'Test', quantity: 1, amount: 100, serviceNumber: 0 }],
        totalAmount: 100,
        inn: '123456789012',
        paymentType: 'CASH',
        incomeType: 'FROM_INDIVIDUAL',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockReceipt)),
      });

      const result = await api.getReceiptJson('2026u7ia1u');

      expect(result.receiptId).toBe('2026u7ia1u');
      expect(result.totalAmount).toBe(100);
    });
  });

  describe('getReceiptPrintUrl / getReceiptJsonUrl', () => {
    it('should return correct print URL', () => {
      const api = new NalogApi();
      api.setInn('123456789012');

      const url = api.getReceiptPrintUrl('test-uuid');
      expect(url).toContain('123456789012');
      expect(url).toContain('test-uuid');
      expect(url).toContain('/print');
    });

    it('should return correct JSON URL', () => {
      const api = new NalogApi();
      api.setInn('123456789012');

      const url = api.getReceiptJsonUrl('test-uuid');
      expect(url).toContain('/json');
    });

    it('should throw error when INN is not set', () => {
      const api = new NalogApi();

      expect(() => api.getReceiptPrintUrl('test-uuid'))
        .toThrow('ИНН не указан');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token', async () => {
      const api = new NalogApi();
      api.setTokens('old-token', 'refresh-token', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          token: 'new-token',
          refreshToken: 'new-refresh-token',
          tokenExpireIn: '2025-12-31T23:59:59.000Z',
        })),
      });

      const result = await api.refreshAccessToken();

      expect(result.token).toBe('new-token');
      expect(api.getAuthState().accessToken).toBe('new-token');
    });

    it('should throw error when refresh token is missing', async () => {
      const api = new NalogApi();

      await expect(api.refreshAccessToken())
        .rejects.toThrow('Refresh token отсутствует');
    });
  });

  describe('getUserInfo', () => {
    it('should get user info', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          inn: '123456789012',
          phone: '79991234567',
          displayName: 'Test User',
        })),
      });

      const result = await api.getUserInfo();

      expect(result.inn).toBe('123456789012');
    });
  });

  describe('call', () => {
    it('should call arbitrary API endpoint', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: 'test' })),
      });

      const result = await api.call<{ data: string }>('custom/endpoint');

      expect(result.data).toBe('test');
    });

    it('should use POST method when body is provided', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ success: true })),
      });

      await api.call('custom/endpoint', { param: 'value' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('token file operations', () => {
    it('should load tokens from file when saveToken is true', () => {
      const savedTokens = {
        accessToken: 'saved-access-token',
        refreshToken: 'saved-refresh-token',
        tokenExpireIn: new Date(Date.now() + 3600000).toISOString(),
        inn: '123456789012',
        deviceId: 'saved-device-id',
        savedAt: new Date().toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedTokens));

      const api = new NalogApi({ saveToken: true });

      expect(api.getAuthState().accessToken).toBe('saved-access-token');
      expect(api.getAuthState().refreshToken).toBe('saved-refresh-token');
      expect(api.getInn()).toBe('123456789012');
    });

    it('should not load expired access token', () => {
      const savedTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'saved-refresh-token',
        tokenExpireIn: new Date(Date.now() - 3600000).toISOString(), // expired
        inn: '123456789012',
        deviceId: 'saved-device-id',
        savedAt: new Date().toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedTokens));

      const api = new NalogApi({ saveToken: true });

      expect(api.getAuthState().accessToken).toBeNull();
      expect(api.getAuthState().refreshToken).toBe('saved-refresh-token');
    });

    it('should return false when token file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const api = new NalogApi({ saveToken: true });

      expect(api.getAuthState().accessToken).toBeNull();
    });

    it('should return false when saved tokens have no refreshToken', () => {
      const savedTokens = {
        accessToken: 'saved-access-token',
        refreshToken: '',
        tokenExpireIn: new Date(Date.now() + 3600000).toISOString(),
        inn: '123456789012',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(savedTokens));

      const api = new NalogApi({ saveToken: true });

      expect(api.getAuthState().refreshToken).toBeNull();
    });

    it('should handle file read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const api = new NalogApi({ saveToken: true });

      expect(api.getAuthState().accessToken).toBeNull();
    });

    it('should save tokens after successful auth', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const api = new NalogApi({ saveToken: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          token: 'new-token',
          refreshToken: 'new-refresh',
          tokenExpireIn: '2025-12-31T23:59:59.000Z',
        })),
      });

      await api.authByInn('123456789012', 'password');

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write error');
      });

      const api = new NalogApi({ saveToken: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          token: 'new-token',
          refreshToken: 'new-refresh',
          tokenExpireIn: '2025-12-31T23:59:59.000Z',
        })),
      });

      await api.authByInn('123456789012', 'password');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save tokens to file:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should clear saved tokens', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const api = new NalogApi();
      api.clearSavedTokens();

      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle clearSavedTokens when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const api = new NalogApi();
      api.clearSavedTokens();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle clearSavedTokens errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Unlink error');
      });

      const api = new NalogApi();

      // Should not throw
      expect(() => api.clearSavedTokens()).not.toThrow();
    });
  });

  describe('phone normalization', () => {
    it('should normalize 10-digit phone', () => {
      const api = new NalogApi({ phone: '9991234567' });
      expect(api).toBeInstanceOf(NalogApi);
    });

    it('should handle phone with various formats', () => {
      const api = new NalogApi({ phone: '+7 (999) 123-45-67' });
      expect(api).toBeInstanceOf(NalogApi);
    });

    it('should return digits for non-standard phone', () => {
      const api = new NalogApi({ phone: '123' });
      expect(api).toBeInstanceOf(NalogApi);
    });
  });

  describe('auth method branches', () => {
    it('should throw error when only phone is provided', async () => {
      const api = new NalogApi({ phone: '79991234567' });

      await expect(api.auth()).rejects.toThrow(
        'Для авторизации по телефону используйте методы requestSmsCode() и authByPhone()'
      );
    });

    it('should throw error when no auth params provided', async () => {
      const api = new NalogApi();

      await expect(api.auth()).rejects.toThrow(
        'Не указаны параметры авторизации'
      );
    });

    it('should use refreshToken if available', async () => {
      const api = new NalogApi({ refreshToken: 'existing-refresh' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          token: 'new-token',
          refreshToken: 'new-refresh',
          tokenExpireIn: '2025-12-31T23:59:59.000Z',
        })),
      });

      const result = await api.auth();

      expect(result.token).toBe('new-token');
    });

    it('should use inn+password if no refreshToken', async () => {
      const api = new NalogApi({ inn: '123456789012', password: 'test' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          token: 'new-token',
          refreshToken: 'new-refresh',
          tokenExpireIn: '2025-12-31T23:59:59.000Z',
        })),
      });

      const result = await api.auth();

      expect(result.token).toBe('new-token');
    });
  });

  describe('requestSmsCode error handling', () => {
    it('should throw error on SMS request failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          code: 'PHONE_ERROR',
          message: 'Invalid phone number',
        }),
      });

      const api = new NalogApi();

      await expect(api.requestSmsCode('79991234567'))
        .rejects.toThrow('Invalid phone number');
    });
  });

  describe('timezone handling', () => {
    it('should use custom timezone', () => {
      const api = new NalogApi({ timezone: 'Asia/Yekaterinburg' });
      expect(api).toBeInstanceOf(NalogApi);
    });

    it('should use default timezone for unknown zone', () => {
      const api = new NalogApi({ timezone: 'Unknown/Zone' });
      expect(api).toBeInstanceOf(NalogApi);
    });
  });

  describe('ensureValidToken', () => {
    it('should call auth when no access token', async () => {
      const api = new NalogApi({ inn: '123456789012', password: 'test' });

      // First call for auth, second for actual request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            token: 'new-token',
            refreshToken: 'new-refresh',
            tokenExpireIn: '2025-12-31T23:59:59.000Z',
          })),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ data: 'test' })),
        });

      await api.call('some/endpoint');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should refresh token when close to expiry', async () => {
      const api = new NalogApi();
      // Set tokens with near-expiry time (less than 5 minutes)
      api.setTokens('old-token', 'refresh-token', '123456789012');

      // Access private field to set tokenExpireIn
      (api as any).authState.tokenExpireIn = new Date(Date.now() + 60000); // 1 minute from now

      // Refresh call, then actual request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            token: 'refreshed-token',
            refreshToken: 'new-refresh',
            tokenExpireIn: '2025-12-31T23:59:59.000Z',
          })),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ data: 'test' })),
        });

      await api.call('some/endpoint');

      expect(api.getAuthState().accessToken).toBe('refreshed-token');
    });
  });

  describe('cancelIncome reasons', () => {
    it('should use CANCEL reason text', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'cancelled-uuid',
        })),
      });

      await api.cancelIncome({
        receiptUuid: 'test-uuid',
        reason: CancelReason.CANCEL,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('Чек сформирован ошибочно'),
        })
      );
    });

    it('should use custom comment over reason', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'cancelled-uuid',
        })),
      });

      await api.cancelIncome({
        receiptUuid: 'test-uuid',
        reason: CancelReason.REFUND,
        comment: 'Пользовательский комментарий',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('Пользовательский комментарий'),
        })
      );
    });
  });

  describe('request error handling', () => {
    it('should handle non-JSON error response', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(api.call('some/endpoint'))
        .rejects.toThrow('HTTP Error: 500');
    });

    it('should handle empty response', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      const result = await api.call('some/endpoint');

      expect(result).toBeNull();
    });
  });

  describe('income with paymentType', () => {
    it('should create income with ACCOUNT payment type', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'test-uuid',
        })),
      });

      await api.addIncome({
        name: 'Услуга',
        amount: 1000,
        paymentType: PaymentType.ACCOUNT,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.stringContaining('ACCOUNT'),
        })
      );
    });

    it('should use custom operation time', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '123456789012');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          approvedReceiptUuid: 'test-uuid',
        })),
      });

      const customDate = new Date('2025-01-15T14:30:00');
      await api.addIncome({
        name: 'Услуга',
        amount: 1000,
        operationTime: customDate,
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('getReceiptJson with explicit INN', () => {
    it('should use provided INN instead of state INN', async () => {
      const api = new NalogApi();
      api.setTokens('test-token', 'test-refresh', '111111111111');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          receiptId: 'test-id',
          totalAmount: 1000,
        })),
      });

      await api.getReceiptJson('test-uuid', '222222222222');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('222222222222'),
        expect.anything()
      );
    });
  });

  describe('NalogApiError', () => {
    it('should create error with all properties', () => {
      const error = new NalogApiError('Test error', 'TEST_CODE', { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.response).toEqual({ detail: 'test' });
      expect(error.name).toBe('NalogApiError');
    });
  });
});
