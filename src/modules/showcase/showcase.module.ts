import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ShowcaseController } from './showcase.controller';
import { ShowcaseService } from './showcase.service';

@Module({
  imports: [AuditModule],
  controllers: [ShowcaseController],
  providers: [ShowcaseService],
})
export class ShowcaseModule {}
