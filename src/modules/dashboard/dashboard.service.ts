import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';

@Injectable()
export class DashboardService {
  constructor(private readonly core: LoorCoreClient) {}

  async overview(query: Record<string, unknown>, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: '/internal/super-admin/v1/dashboard',
      query,
      correlationId,
    });
    return result.data;
  }
}
