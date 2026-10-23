export type LoorCoreMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface LoorCoreRequestOptions {
  method: LoorCoreMethod;
  path: string;
  query?: Record<string, unknown> | object;
  body?: unknown;
  /** When true, do not force Content-Type: application/json (use for multipart/FormData). */
  multipart?: boolean;
  correlationId?: string;
  headers?: Record<string, string>;
}

export interface LoorCoreResponse<T = unknown> {
  data: T;
  status: number;
  correlationId: string;
}
