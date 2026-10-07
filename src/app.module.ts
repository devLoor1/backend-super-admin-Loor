import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { PrismaModule } from './database/prisma/prisma.module';
import { LoorCoreModule } from './integrations/loor-core/loor-core.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AdministratorModule } from './modules/administrator/administrator.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EntrepreneurModule } from './modules/entrepreneur/entrepreneur.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HealthModule } from './modules/health/health.module';
import { InvestmentModule } from './modules/investment/investment.module';
import { InvestorModule } from './modules/investor/investor.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { SmtpModule } from './modules/smtp/smtp.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WhitelabelModule } from './modules/whitelabel/whitelabel.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel') || 'info',
          transport:
            config.get<string>('nodeEnv') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'passwordHash',
            'body.password',
            'body.secret',
            'body.apiKey',
          ],
          autoLogging: true,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl') || 60000,
          limit: config.get<number>('throttle.limit') || 120,
        },
      ],
    }),
    PrismaModule,
    LoorCoreModule,
    HealthModule,
    AuthModule,
    AuditModule,
    DashboardModule,
    WhitelabelModule,
    AccountsModule,
    AdministratorModule,
    PlatformConfigModule,
    SmtpModule,
    OpportunityModule,
    InvestorModule,
    EntrepreneurModule,
    InvestmentModule,
    PaymentModule,
    WalletModule,
    GatewayModule,
    ComplianceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseTimeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
