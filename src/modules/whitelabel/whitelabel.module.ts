import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WhitelabelController } from './whitelabel.controller';
import { WhitelabelService } from './whitelabel.service';

@Module({
  imports: [AuditModule],
  controllers: [WhitelabelController],
  providers: [WhitelabelService],
})
export class WhitelabelModule {}
