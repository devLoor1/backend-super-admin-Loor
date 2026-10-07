import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';

@Injectable()
export class DashboardService {
  constructor(private readonly core: LoorCoreClient) {}

  /**
   * Prefers a single Core aggregate endpoint over fan-out of many requests.
   */
  overview(query: Record<string, unknown>, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: '/internal/super-admin/v1/dashboard',
      query,
      correlationId,
    });
  }
}
