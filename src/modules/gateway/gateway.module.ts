import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [AuditModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
