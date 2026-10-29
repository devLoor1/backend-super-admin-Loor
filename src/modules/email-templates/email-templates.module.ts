import { Module } from '@nestjs/common';
import { LoorCoreModule } from '../../integrations/loor-core/loor-core.module';
import { AuditModule } from '../audit/audit.module';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  imports: [LoorCoreModule, AuditModule],
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService],
})
export class EmailTemplatesModule {}
