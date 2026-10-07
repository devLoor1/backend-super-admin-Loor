import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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

/**
 * Control Plane Whitelabel rules (Arthur handoff + architecture):
 * - Core is source of truth (registry).
 * - CP authenticates operators, audits mutations, maps safe fields.
 * - No prototype IDs (wl_proto_*), no invented lifecycle beyond active/inactive.
 * - Create/update/status still go to Core when endpoints exist; Product Q-WL-01–03 open.
 */
@Injectable()
export class WhitelabelService {
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
        throw new NotFoundException('Whitelabel not found');
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

      await this.audit.write({
        action: 'CREATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: result.data?.data?.id,
        afterData: { name: dto.name, slug: dto.slug, baseUrl: dto.baseUrl },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return result.data?.data ? mapWhitelabel(result.data.data) : result.data;
    } catch (error) {
      await this.audit.write({
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

    try {
      const result = await this.core.request<DetailCore>({
        method: 'PATCH',
        path: `${this.base}/${id}`,
        body: dto,
        correlationId: meta.correlationId,
      });

      await this.audit.write({
        action: 'UPDATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        afterData: { ...dto },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return result.data?.data ? mapWhitelabel(result.data.data) : result.data;
    } catch (error) {
      await this.audit.write({
        action: 'UPDATE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        afterData: { ...dto },
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

    try {
      const result = await this.core.request<DetailCore>({
        method: 'PATCH',
        path: `${this.base}/${id}/status`,
        body: { active },
        correlationId: meta.correlationId,
      });

      await this.audit.write({
        action: active ? 'ENABLE_WHITELABEL' : 'DISABLE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
        afterData: { active },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return result.data?.data ? mapWhitelabel(result.data.data) : result.data;
    } catch (error) {
      await this.audit.write({
        action: active ? 'ENABLE_WHITELABEL' : 'DISABLE_WHITELABEL',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel',
        resourceId: id,
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

  private rethrowCore(error: unknown): never {
    if (error instanceof LoorCoreException) {
      if (error.getStatus() === 404) {
        throw new NotFoundException(error.message);
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
