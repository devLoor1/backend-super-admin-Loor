import { BadRequestException, Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AccountFiltersDto, AccountTipo } from './dto/account-filters.dto';

type AccountKind = 'investor' | 'entrepreneur' | 'admin';

/**
 * Tenant-scoped account list for FE Account Control V1.
 * Routes mirror `#/whitelabels/:whitelabelId/accounts?tipo=...`.
 * Core internal endpoints for investors/entrepreneurs are still pending;
 * admins reuse the existing whitelabel admins path when available.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly core: LoorCoreClient) {}

  list(whitelabelId: string, query: AccountFiltersDto, correlationId?: string) {
    this.assertNumericId(whitelabelId);
    const kind = this.resolveKind(query);
    const { page = 1, perPage = 20, search, sort, order, access } = query;

    if (kind === 'admin') {
      return this.core.request({
        method: 'GET',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/admins`,
        query: { page, perPage, search, sort, order },
        correlationId,
      });
    }

    const path =
      kind === 'investor'
        ? '/internal/super-admin/v1/investors'
        : '/internal/super-admin/v1/entrepreneurs';

    return this.core.request({
      method: 'GET',
      path,
      query: {
        page,
        perPage,
        search,
        sort,
        order,
        access,
        whitelabelId,
      },
      correlationId,
    });
  }

  detail(
    whitelabelId: string,
    accountId: string,
    query: AccountFiltersDto,
    correlationId?: string,
  ) {
    this.assertNumericId(whitelabelId);
    const kind = this.resolveKind(query);

    if (kind === 'admin') {
      return this.core.request({
        method: 'GET',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/admins/${accountId}`,
        correlationId,
      });
    }

    const path =
      kind === 'investor'
        ? `/internal/super-admin/v1/investors/${accountId}`
        : `/internal/super-admin/v1/entrepreneurs/${accountId}`;

    return this.core.request({
      method: 'GET',
      path,
      query: { whitelabelId },
      correlationId,
    });
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
