import { Injectable } from '@nestjs/common';
import { sanitizeWalletMovementsPayload } from '../../common/privacy/document-privacy';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';

/**
 * Wallet is Core-owned. No balance mutation endpoints exist here by design.
 */
@Injectable()
export class WalletService {
  private readonly base = '/internal/super-admin/v1/wallets';

  constructor(private readonly core: LoorCoreClient) {}

  async list(query: object, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: this.base,
      query: query as Record<string, unknown>,
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

  async movements(id: string, query: object, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/${id}/movements`,
      query: query as Record<string, unknown>,
      correlationId,
    });
    // Defense-in-depth: Core already redacts; Nest re-applies before FE.
    return sanitizeWalletMovementsPayload(result.data);
  }

  /**
   * Compatibility alias: same payload as GET /api/investments?whitelabelId=:id
   */
  async investments(id: string, query: object, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: '/internal/super-admin/v1/investments',
      query: { ...(query as Record<string, unknown>), whitelabelId: id },
      correlationId,
    });
    return result.data;
  }
}
