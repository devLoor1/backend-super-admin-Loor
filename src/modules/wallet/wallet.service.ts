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

  async list(query: PaginationQueryDto | Record<string, unknown>, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: this.base,
      query,
      correlationId,
    });
    return result.data;
  }

  async detail(id: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/${id}`,
      correlationId,
    });
    return result.data;
  }

  async movements(id: string, query: PaginationQueryDto, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/${id}/movements`,
      query: { ...query },
      correlationId,
    });
    return result.data;
  }

  async investments(id: string, query: PaginationQueryDto, correlationId?: string) {
    // Prefer Investments domain; kept for path compatibility — proxies wallet-scoped movements filter if Core adds it later.
    const result = await this.core.request({
      method: 'GET',
      path: `/internal/super-admin/v1/investments`,
      query: { ...query, whitelabelId: id },
      correlationId,
    });
    return result.data;
  }
}
