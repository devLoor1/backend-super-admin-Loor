import { Module } from '@nestjs/common';
import { KycModule } from './kyc/kyc.module';

@Module({
  imports: [KycModule],
})
export class ComplianceModule {}
