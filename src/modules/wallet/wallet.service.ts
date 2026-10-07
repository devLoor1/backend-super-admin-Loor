import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Wallet is Core-owned. No balance mutation endpoints exist here by design.
 */
@Injectable()
export class WalletService {
  private readonly base = '/internal/super-admin/v1/wallets';

  constructor(private readonly core: LoorCoreClient) {}

  list(query: PaginationQueryDto | Record<string, unknown>, correlationId?: string) {
    return this.core.request({ method: 'GET', path: this.base, query, correlationId });
  }

  detail(id: string, correlationId?: string) {
    return this.core.request({ method: 'GET', path: `${this.base}/${id}`, correlationId });
  }

  movements(id: string, query: PaginationQueryDto, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `${this.base}/${id}/movements`,
      query: { ...query },
      correlationId,
    });
  }

  investments(id: string, query: PaginationQueryDto, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `${this.base}/${id}/investments`,
      query: { ...query },
      correlationId,
    });
  }
}
