import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: LoorCoreClient,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Control Plane liveness/readiness' })
  async check() {
    let database: 'up' | 'down' = 'down';
    let core: 'up' | 'down' | 'unknown' = 'unknown';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    try {
      await this.core.request({
        method: 'GET',
        path: '/internal/super-admin/v1/health',
      });
      core = 'up';
    } catch {
      core = 'down';
    }

    const status = database === 'up' ? 'ok' : 'degraded';
    return {
      status,
      service: 'backend-super-admin-loor',
      role: 'control-plane',
      checks: { database, core },
    };
  }
}
