import { Module } from '@nestjs/common';
import { AdministratorModule } from '../administrator/administrator.module';
import { AuditModule } from '../audit/audit.module';
import { GatewayModule } from '../gateway/gateway.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { SmtpModule } from '../smtp/smtp.module';
import { TermsModule } from '../terms/terms.module';
import { WhitelabelModule } from '../whitelabel/whitelabel.module';
import { ProvisioningRunnerService } from './provisioning-runner.service';
import { ProvisioningSecretsStore } from './provisioning-secrets.store';
import { ProvisioningStepsService } from './provisioning-steps.service';
import {
  WhitelabelProvisioningByTenantController,
  WhitelabelProvisioningController,
} from './whitelabel-provisioning.controller';
import { WhitelabelProvisioningService } from './whitelabel-provisioning.service';

@Module({
  imports: [
    AuditModule,
    WhitelabelModule,
    AdministratorModule,
    PlatformConfigModule,
    SmtpModule,
    GatewayModule,
    TermsModule,
  ],
  controllers: [
    WhitelabelProvisioningController,
    WhitelabelProvisioningByTenantController,
  ],
  providers: [
    WhitelabelProvisioningService,
    ProvisioningRunnerService,
    ProvisioningStepsService,
    ProvisioningSecretsStore,
  ],
})
export class WhitelabelProvisioningModule {}
