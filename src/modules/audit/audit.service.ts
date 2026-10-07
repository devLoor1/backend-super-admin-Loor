import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PaginationQueryDto, buildPaginatedMeta } from '../../common/dto/pagination-query.dto';

const SENSITIVE = /(password|secret|token|api[_-]?key|authorization|credential)/i;

export type AuditWriteInput = {
  action: string;
  superAdminId?: string | null;
  resourceType?: string | null;
  resourceId?: string | number | null;
  whitelabelId?: number | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  result?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        superAdminId: input.superAdminId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId != null ? String(input.resourceId) : null,
        whitelabelId: input.whitelabelId ?? null,
        beforeData: this.sanitize(input.beforeData) as Prisma.InputJsonValue,
        afterData: this.sanitize(input.afterData) as Prisma.InputJsonValue,
        result: input.result ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  async list(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const where = query.search
      ? {
          OR: [
            { action: { contains: query.search } },
            { resourceType: { contains: query.search } },
            { resourceId: { contains: query.search } },
          ],
        }
      : {};

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.order === 'asc' ? 'asc' : 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          superAdmin: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return { data, meta: buildPaginatedMeta(page, perPage, total) };
  }

  private sanitize(value?: Record<string, unknown> | null) {
    if (!value) return undefined;
    return this.walk(value);
  }

  private walk(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.walk(item));
    if (!value || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.test(key) ? '[REDACTED]' : this.walk(nested);
    }
    return out;
  }
}
