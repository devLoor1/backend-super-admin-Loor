import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoorCoreAuthService } from './loor-core-auth.service';
import { LoorCoreClient } from './loor-core.client';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('loorCore.timeoutMs') || 10000,
        maxRedirects: 0,
      }),
    }),
    JwtModule.register({}),
  ],
  providers: [LoorCoreAuthService, LoorCoreClient],
  exports: [LoorCoreAuthService, LoorCoreClient],
})
export class LoorCoreModule {}
