import { BadRequestException, Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';
import { AccountFiltersDto, AccountTipo } from './dto/account-filters.dto';
import { CreateInvestorDto } from './dto/create-investor.dto';
import { CreateEntrepreneurDto } from './dto/create-entrepreneur.dto';

type AccountKind = 'investor' | 'entrepreneur' | 'admin';
type AuditMeta = { operatorId: string; correlationId?: string; ip?: string; userAgent?: string };

@Injectable()
export class AccountsService {
  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async list(whitelabelId: string, query: AccountFiltersDto, correlationId?: string) {
    this.assertNumericId(whitelabelId);
    const kind = this.resolveKind(query);
    const { page = 1, perPage = 20, search, sort, order, access } = query;

    if (kind === 'admin') {
      const result = await this.core.request({
        method: 'GET',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/admins`,
        query: { page, perPage, search, sort, order },
        correlationId,
      });
      return result.data;
    }

    const path =
      kind === 'investor'
        ? '/internal/super-admin/v1/investors'
        : '/internal/super-admin/v1/entrepreneurs';

    const result = await this.core.request({
      method: 'GET',
      path,
      query: { page, perPage, search, sort, order, access, whitelabelId },
      correlationId,
    });
    return result.data;
  }

  async detail(
    whitelabelId: string,
    accountId: string,
    query: AccountFiltersDto,
    correlationId?: string,
  ) {
    this.assertNumericId(whitelabelId);
    const kind = this.resolveKind(query);

    if (kind === 'admin') {
      const result = await this.core.request({
        method: 'GET',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/admins/${accountId}`,
        correlationId,
      });
      return result.data;
    }

    const path =
      kind === 'investor'
        ? `/internal/super-admin/v1/investors/${accountId}`
        : `/internal/super-admin/v1/entrepreneurs/${accountId}`;

    const result = await this.core.request({
      method: 'GET',
      path,
      query: { whitelabelId },
      correlationId,
    });
    return result.data;
  }

  async pause(
    whitelabelId: string,
    accountId: string,
    query: AccountFiltersDto,
    body: { reason?: string },
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    this.assertNumericId(whitelabelId);
    const kind = this.resolveKind(query);
    const result = await this.core.request({
      method: 'POST',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/accounts/${kind}/${accountId}/pause`,
      body: { reason: body.reason },
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'PAUSE_ACCOUNT',
      superAdminId: meta.operatorId,
      resourceType: kind,
      resourceId: accountId,
      whitelabelId: Number(whitelabelId),
      afterData: { reason: body.reason },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result.data;
  }

  async reactivate(
    whitelabelId: string,
    accountId: string,
    query: AccountFiltersDto,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    this.assertNumericId(whitelabelId);
    const kind = this.resolveKind(query);
    const result = await this.core.request({
      method: 'POST',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/accounts/${kind}/${accountId}/reactivate`,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'REACTIVATE_ACCOUNT',
      superAdminId: meta.operatorId,
      resourceType: kind,
      resourceId: accountId,
      whitelabelId: Number(whitelabelId),
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result.data;
  }

  async createInvestor(whitelabelId: string, body: CreateInvestorDto, meta: AuditMeta) {
    this.assertNumericId(whitelabelId);
    const result = await this.core.request({
      method: 'POST',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/investors`,
      body: { fullName: body.fullName, email: body.email, phone: body.phone, type: body.type },
      correlationId: meta.correlationId,
    });
    await this.safeAudit({
      action: 'CREATE_INVESTOR',
      superAdminId: meta.operatorId,
      resourceType: 'investor',
      whitelabelId: Number(whitelabelId),
      afterData: { email: body.email, type: body.type },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result.data;
  }

  async createEntrepreneur(whitelabelId: string, body: CreateEntrepreneurDto, meta: AuditMeta) {
    this.assertNumericId(whitelabelId);
    const result = await this.core.request({
      method: 'POST',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/entrepreneurs`,
      body: { fullName: body.fullName, email: body.email, phone: body.phone },
      correlationId: meta.correlationId,
    });
    await this.safeAudit({
      action: 'CREATE_ENTREPRENEUR',
      superAdminId: meta.operatorId,
      resourceType: 'entrepreneur',
      whitelabelId: Number(whitelabelId),
      afterData: { email: body.email },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result.data;
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch {
      // audit failure does not fail the creation
    }
  }

  private resolveKind(query: AccountFiltersDto): AccountKind {
    if (query.type) return query.type;
    if (query.tipo) return this.tipoToKind(query.tipo);
    return 'investor';
  }

  private tipoToKind(tipo: AccountTipo): AccountKind {
    switch (tipo) {
      case 'investidores':
        return 'investor';
      case 'empreendedores':
        return 'entrepreneur';
      case 'administradores':
        return 'admin';
      default:
        throw new BadRequestException({
          code: 'INVALID_ACCOUNT_TIPO',
          message: 'tipo must be investidores | empreendedores | administradores',
        });
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
}
