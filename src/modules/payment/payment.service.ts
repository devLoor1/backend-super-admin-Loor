import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class PaymentService {
  private readonly base = '/internal/super-admin/v1/payments';

  constructor(private readonly core: LoorCoreClient) {}

  list(query: PaginationQueryDto | Record<string, unknown>, correlationId?: string) {
    return this.core.request({ method: 'GET', path: this.base, query, correlationId });
  }

  detail(id: string, correlationId?: string) {
    return this.core.request({ method: 'GET', path: `${this.base}/${id}`, correlationId });
  }
}
