import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { buildPaginatedMeta } from '../../common/dto/pagination-query.dto';
import { AuditFiltersDto } from './dto/audit-filters.dto';

const SENSITIVE =
  /(password|secret|token|api[_-]?key|authorization|credential|smtp|cpf|cnpj|spe[_-]?cnpj|document|pix)/i;

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

  async list(query: AuditFiltersDto) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.operatorId) where.superAdminId = query.operatorId;
    if (query.action) where.action = query.action;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.whitelabelId != null) where.whitelabelId = query.whitelabelId;
    if (query.result) where.result = query.result;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { action: { contains: query.search } },
        { resourceType: { contains: query.search } },
        { resourceId: { contains: query.search } },
        { correlationId: { contains: query.search } },
      ];
    }

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
