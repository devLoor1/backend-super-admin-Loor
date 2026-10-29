import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccountsController } from './accounts.controller';
import { AccountCreationController } from './account-creation.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [AuditModule],
  controllers: [AccountsController, AccountCreationController],
  providers: [AccountsService],
})
export class AccountsModule {}
