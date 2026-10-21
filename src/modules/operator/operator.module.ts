import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperatorController } from './operator.controller';
import { OperatorService } from './operator.service';

@Module({
  imports: [AuditModule],
  controllers: [OperatorController],
  providers: [OperatorService],
})
export class OperatorModule {}
