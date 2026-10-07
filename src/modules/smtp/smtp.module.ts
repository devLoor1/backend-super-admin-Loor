import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SmtpController } from './smtp.controller';
import { SmtpService } from './smtp.service';

@Module({
  imports: [AuditModule],
  controllers: [SmtpController],
  providers: [SmtpService],
})
export class SmtpModule {}
