import {
  BadRequestException,
  Injectable,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import type { Type } from '@nestjs/common';

/**
 * Accepts the same DTO either as a plain JSON body or as multipart where the DTO travels as a
 * JSON string in the `payload` field (the image is a separate file part).
 *
 * The controller param is typed `unknown` on purpose: the global ValidationPipe skips plain
 * `Object` metatypes, so this pipe is the single place that validates (same options as main.ts).
 */
@Injectable()
export class ProvisioningPayloadPipe<
  T extends object,
> implements PipeTransform {
  private readonly validator = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  constructor(private readonly metatype: Type<T>) {}

  async transform(value: unknown): Promise<T> {
    const raw = this.unwrap(value);
    return (await this.validator.transform(raw, {
      type: 'body',
      metatype: this.metatype,
    })) as T;
  }

  private unwrap(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'Body must be a JSON object',
      });
    }
    const body = value as Record<string, unknown>;
    if (typeof body.payload !== 'string') return { ...body };
    try {
      const parsed: unknown = JSON.parse(body.payload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('payload is not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: '`payload` must be a JSON object string',
      });
    }
  }
}
