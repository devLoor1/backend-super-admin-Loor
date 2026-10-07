import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdministratorController } from './administrator.controller';
import { AdministratorService } from './administrator.service';

@Module({
  imports: [AuditModule],
  controllers: [AdministratorController],
  providers: [AdministratorService],
})
export class AdministratorModule {}
