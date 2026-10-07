import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../../integrations/loor-core/loor-core.client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@Injectable()
export class KycService {
  private readonly base = '/internal/super-admin/v1/kyc';

  constructor(private readonly core: LoorCoreClient) {}

  list(query: PaginationQueryDto | Record<string, unknown>, correlationId?: string) {
    return this.core.request({ method: 'GET', path: this.base, query, correlationId });
  }

  /**
   * Detail includes Face Match as part of KYC payload from Core — not a separate menu.
   */
  detail(id: string, correlationId?: string) {
    return this.core.request({ method: 'GET', path: `${this.base}/${id}`, correlationId });
  }
}
