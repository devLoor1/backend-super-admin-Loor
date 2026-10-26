import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlatformAssetsController } from './platform-assets.controller';
import { PlatformAssetsService } from './platform-assets.service';

@Module({
  imports: [AuditModule],
  controllers: [PlatformAssetsController],
  providers: [PlatformAssetsService],
})
export class PlatformAssetsModule {}
