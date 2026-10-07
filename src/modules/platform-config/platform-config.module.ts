import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';

@Module({
  imports: [AuditModule],
  controllers: [PlatformConfigController],
  providers: [PlatformConfigService],
})
export class PlatformConfigModule {}
