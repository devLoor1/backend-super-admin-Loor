import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../../integrations/loor-core/loor-core.client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@Injectable()
export class KycService {
  private readonly base = '/internal/super-admin/v1/kyc';

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

  /**
   * Detail includes Face Match as part of KYC payload from Core — not a separate menu.
   */
  async detail(id: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/${id}`,
      correlationId,
    });
    return result.data;
  }
}
