import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from './loor-core.client';
import { LoorCoreMethod } from './loor-core.types';

/**
 * Thin helper for domain services that only orchestrate Core calls.
 */
@Injectable()
export abstract class CoreProxyBase {
  protected abstract readonly basePath: string;

  constructor(protected readonly core: LoorCoreClient) {}

  protected call<T>(
    method: LoorCoreMethod,
    path = '',
    options?: {
      query?: Record<string, unknown>;
      body?: unknown;
      correlationId?: string;
    },
  ) {
    return this.core.request<T>({
      method,
      path: `${this.basePath}${path}`,
      query: options?.query,
      body: options?.body,
      correlationId: options?.correlationId,
    });
  }
}
