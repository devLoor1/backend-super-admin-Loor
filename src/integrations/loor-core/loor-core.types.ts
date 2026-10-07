export type LoorCoreMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface LoorCoreRequestOptions {
  method: LoorCoreMethod;
  path: string;
  query?: Record<string, unknown> | object;
  body?: unknown;
  correlationId?: string;
  headers?: Record<string, string>;
}

export interface LoorCoreResponse<T = unknown> {
  data: T;
  status: number;
  correlationId: string;
}
