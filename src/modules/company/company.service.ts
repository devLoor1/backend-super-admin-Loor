import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class CompanyService {
  private readonly base = '/internal/super-admin/v1/companies';

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

  async byEntrepreneur(entrepreneurId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `/internal/super-admin/v1/entrepreneurs/${entrepreneurId}/company`,
      correlationId,
    });
    return result.data;
  }
}
