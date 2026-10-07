import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoorCoreException } from '../../integrations/loor-core/loor-core.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId =
      request.correlationId ||
      (request.headers['x-correlation-id'] as string | undefined);

    if (exception instanceof LoorCoreException) {
      return response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        correlationId: exception.correlationId || correlationId,
        details: exception.details,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);

      return response.status(status).json({
        statusCode: status,
        code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR',
        message,
        correlationId,
        details: typeof body === 'object' ? body : undefined,
      });
    }

    const isProd = process.env.NODE_ENV === 'production';
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Internal server error' : (exception as Error)?.message,
      correlationId,
    });
  }
}
