import { Module } from '@nestjs/common';
import { LoorCoreModule } from '../../integrations/loor-core/loor-core.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';

@Module({
  imports: [LoorCoreModule],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
