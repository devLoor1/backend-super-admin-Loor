import { Module } from '@nestjs/common';
import { AdministratorModule } from '../administrator/administrator.module';
import { AuditModule } from '../audit/audit.module';
import { GatewayModule } from '../gateway/gateway.module';
import { PlatformAssetsModule } from '../platform-assets/platform-assets.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { SmtpModule } from '../smtp/smtp.module';
import { TermsModule } from '../terms/terms.module';
import { WhitelabelModule } from '../whitelabel/whitelabel.module';
import { FrontendReadinessService } from './frontend-readiness.service';
import { NetlifyDomainService } from './netlify-domain.service';
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
    PlatformAssetsModule,
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
    FrontendReadinessService,
    NetlifyDomainService,
  ],
})
export class WhitelabelProvisioningModule {}
