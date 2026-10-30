import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { LoorCoreAuthService } from './loor-core-auth.service';
import { LoorCoreException } from './loor-core.exception';
import { LoorCoreRequestOptions, LoorCoreResponse } from './loor-core.types';

/**
 * Single outbound client for Core /internal/super-admin/v1.
 * Controllers must never call axios/fetch directly.
 */
@Injectable()
export class LoorCoreClient {
  private readonly logger = new Logger(LoorCoreClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly auth: LoorCoreAuthService,
  ) {}

  async request<T = unknown>(
    options: LoorCoreRequestOptions,
  ): Promise<LoorCoreResponse<T>> {
    const correlationId = options.correlationId || uuidv4();
    const baseUrl = this.config.get<string>('loorCore.baseUrl');
    const timeout = this.config.get<number>('loorCore.timeoutMs') || 10000;
    const clientId = this.config.get<string>('loorCore.clientId');
    const token = this.auth.mintServiceToken();
    const url = `${baseUrl}${options.path}`;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-Service-Name': clientId || 'loor-super-admin',
        'X-Correlation-ID': correlationId,
        Accept: 'application/json',
        ...(options.headers || {}),
      };
      // Multipart must let axios set Content-Type with boundary.
      if (!options.multipart) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await firstValueFrom(
        this.http.request<T>({
          method: options.method,
          url,
          params: options.query,
          data: options.body,
          timeout: options.multipart ? Math.max(timeout, 60000) : (options.timeoutMs ?? timeout),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
          headers,
        }),
      );

      if (response.status >= 200 && response.status < 300) {
        return {
          data: response.data,
          status: response.status,
          correlationId,
        };
      }

      throw new LoorCoreException({
        message: this.extractSafeMessage(response.data) || `Core request failed (${response.status})`,
        status: this.mapStatus(response.status),
        code: this.extractSafeCode(response.data) || 'CORE_HTTP_ERROR',
        correlationId,
        details: {
          coreStatus: response.status,
          coreBody: this.extractSafeBody(response.data),
        },
      });
    } catch (error) {
      if (error instanceof LoorCoreException) {
        throw error;
      }

      const axiosError = error as AxiosError;
      this.logger.warn({
        msg: 'loor_core_request_failed',
        correlationId,
        code: axiosError.code,
        message: axiosError.message,
      });

      throw new LoorCoreException({
        message: 'Core API unavailable',
        status: 502,
        code: 'CORE_UNAVAILABLE',
        correlationId,
        details: { transportCode: axiosError.code },
      });
    }
  }

  private mapStatus(status: number): number {
    if (status === 401 || status === 403) return 502;
    if (status >= 400 && status < 500) return status;
    return 502;
  }

  private extractSafeMessage(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
    return null;
  }

  private extractSafeCode(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    return typeof record.code === 'string' && record.code.trim() ? record.code : null;
  }

  private extractSafeBody(data: unknown): Record<string, unknown> | undefined {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
    const record = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of ['code', 'message', 'error']) {
      if (typeof record[key] === 'string') out[key] = record[key];
    }
    return Object.keys(out).length ? out : undefined;
  }
}
