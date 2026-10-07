import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';
import { CreateWhitelabelDto } from './dto/create-whitelabel.dto';
import { UpdateWhitelabelDto } from './dto/update-whitelabel.dto';
import { WhitelabelFiltersDto } from './dto/whitelabel-filters.dto';

@Injectable()
export class WhitelabelService {
  private readonly base = '/internal/super-admin/v1/whitelabels';

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  list(query: WhitelabelFiltersDto, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: this.base,
      query: { ...query },
      correlationId,
    });
  }

  detail(id: string, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `${this.base}/${id}`,
      correlationId,
    });
  }

  async create(
    dto: CreateWhitelabelDto,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'POST',
      path: this.base,
      body: dto,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'CREATE_WHITELABEL',
      superAdminId: meta.operatorId,
      resourceType: 'whitelabel',
      afterData: dto as unknown as Record<string, unknown>,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }

  async update(
    id: string,
    dto: UpdateWhitelabelDto,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
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
      afterData: dto as unknown as Record<string, unknown>,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }

  async setStatus(
    id: string,
    active: boolean,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
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
    return result;
  }
}
