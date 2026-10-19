import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { LoorCoreException } from '../../integrations/loor-core/loor-core.exception';
import { AuditService } from '../audit/audit.service';
import { CreateWhitelabelDto } from './dto/create-whitelabel.dto';
import { UpdateWhitelabelDto } from './dto/update-whitelabel.dto';
import { WhitelabelFiltersDto } from './dto/whitelabel-filters.dto';
import {
  ControlPlaneWhitelabel,
  CoreWhitelabelSummary,
  mapWhitelabel,
} from './whitelabel.mapper';

type PaginatedCore = {
  data: CoreWhitelabelSummary[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
  };
};

type DetailCore = { data: CoreWhitelabelSummary };

@Injectable()
export class WhitelabelService {
  private readonly logger = new Logger(WhitelabelService.name);
  private readonly base = '/internal/super-admin/v1/whitelabels';

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: WhitelabelFiltersDto, correlationId?: string) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);

    try {
      const result = await this.core.request<PaginatedCore>({
        method: 'GET',
        path: this.base,
        query: {
          page,
          perPage,
          search: query.search,
          active: query.active,
          sort: query.sort,
          order: query.order,
        },
        correlationId,
      });

      const body = result.data;
      const rows = Array.isArray(body?.data) ? body.data : [];
      return {
        data: rows.map(mapWhitelabel),
        meta: body.meta ?? {
          page,
          perPage,
          total: rows.length,
          lastPage: 1,
        },
      };
    } catch (error) {
      this.rethrowCore(error);
    }
  }

  async detail(id: string, correlationId?: string): Promise<ControlPlaneWhitelabel> {
    this.assertNumericId(id);

    try {
      const result = await this.core.request<DetailCore>({
        method: 'GET',
        path: `${this.base}/${id}`,
        correlationId,
      });

      const row = result.data?.data;
      if (!row) {
        throw new NotFoundException({
          code: 'E_WHITELABEL_NOT_FOUND',
          message: 'Whitelabel not found',
        });
      }
      return mapWhitelabel(row);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.rethrowCore(error);
    }
  }

  async create(
    dto: CreateWhitelabelDto,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    try {
      const result = await this.core.request<DetailCore>({
        method: 'POST',
        path: this.base,
        body: dto,
        correlationId: meta.correlationId,
      });

      const mapped = result.data?.data ? mapWhitelabel(result.data.data) : null;
      await this.safeAudit({
        action: 'CREATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: mapped?.id != null ? String(mapped.id) : undefined,
        whitelabelId: mapped?.id != null ? Number(mapped.id) : undefined,
        afterData: { name: dto.name, slug: dto.slug, baseUrl: dto.baseUrl },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return { data: mapped ?? result.data };
    } catch (error) {
      await this.safeAudit({
        action: 'CREATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        afterData: { name: dto.name, slug: dto.slug },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      this.rethrowCore(error);
    }
  }

  async update(
    id: string,
    dto: UpdateWhitelabelDto,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    this.assertNumericId(id);

    // Operational V1: name-only — never forward slug/baseUrl even if somehow present.
    const body = { name: dto.name.trim() };
    if (!body.name) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'name is required',
      });
    }

    let beforeData: ControlPlaneWhitelabel | null = null;
    try {
      beforeData = await this.detail(id, meta.correlationId);
    } catch {
      beforeData = null;
    }

    try {
      const result = await this.core.request<DetailCore>({
        method: 'PATCH',
        path: `${this.base}/${id}`,
        body,
        correlationId: meta.correlationId,
      });

      const mapped = result.data?.data ? mapWhitelabel(result.data.data) : null;
      await this.safeAudit({
        action: 'UPDATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        whitelabelId: Number(id),
        beforeData: beforeData
          ? { name: beforeData.name, slug: beforeData.slug, baseUrl: beforeData.baseUrl }
          : undefined,
        afterData: { name: body.name },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return { data: mapped ?? result.data };
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        whitelabelId: Number(id),
        beforeData: beforeData
          ? { name: beforeData.name, slug: beforeData.slug, baseUrl: beforeData.baseUrl }
          : undefined,
        afterData: { name: body.name },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      this.rethrowCore(error);
    }
  }

  async setStatus(
    id: string,
    active: boolean,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    this.assertNumericId(id);

    let beforeData: ControlPlaneWhitelabel | null = null;
    try {
      beforeData = await this.detail(id, meta.correlationId);
    } catch {
      beforeData = null;
    }

    try {
      const result = await this.core.request<DetailCore>({
        method: 'PATCH',
        path: `${this.base}/${id}/status`,
        body: { active },
        correlationId: meta.correlationId,
      });

      const mapped = result.data?.data ? mapWhitelabel(result.data.data) : null;
      await this.safeAudit({
        action: active ? 'ENABLE_WHITELABEL' : 'DISABLE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        whitelabelId: Number(id),
        beforeData: beforeData ?? undefined,
        afterData: { active, semantics: 'logical_deactivate_no_cascade' },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return { data: mapped ?? result.data };
    } catch (error) {
      await this.safeAudit({
        action: active ? 'ENABLE_WHITELABEL' : 'DISABLE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        whitelabelId: Number(id),
        afterData: { active },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      this.rethrowCore(error);
    }
  }

  private assertNumericId(id: string) {
    if (!/^\d+$/.test(id)) {
      throw new BadRequestException({
        code: 'INVALID_WHITELABEL_ID',
        message: 'Whitelabel id must be a Core numeric id (not a prototype wl_proto_* id)',
      });
    }
  }

  /** Core already applied (or failed) — Audit must not invert the HTTP outcome. */
  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'whitelabel_audit_failed',
        action: input.action,
        result: input.result,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private rethrowCore(error: unknown): never {
    if (error instanceof LoorCoreException) {
      if (error.code === 'E_SLUG_TAKEN') {
        throw new ConflictException({
          code: 'E_SLUG_TAKEN',
          message: error.message,
          correlationId: error.correlationId,
        });
      }
      if (error.getStatus() === 404) {
        throw new NotFoundException({
          code: error.code || 'E_WHITELABEL_NOT_FOUND',
          message: error.message,
        });
      }
      if (error.getStatus() === 422) {
        throw new UnprocessableEntityException({
          code: error.code || 'E_VALIDATION',
          message: error.message,
          correlationId: error.correlationId,
        });
      }
      if (error.getStatus() === 502) {
        throw new ServiceUnavailableException({
          code: error.code,
          message: error.message,
          correlationId: error.correlationId,
        });
      }
      throw error;
    }
    throw error;
  }
}
