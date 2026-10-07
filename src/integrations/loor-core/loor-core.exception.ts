import { HttpException, HttpStatus } from '@nestjs/common';

export class LoorCoreException extends HttpException {
  public readonly code: string;
  public readonly correlationId?: string;
  public readonly details?: unknown;

  constructor(params: {
    message: string;
    status?: number;
    code?: string;
    correlationId?: string;
    details?: unknown;
  }) {
    super(params.message, params.status ?? HttpStatus.BAD_GATEWAY);
    this.code = params.code ?? 'CORE_ERROR';
    this.correlationId = params.correlationId;
    this.details = params.details;
  }
}
