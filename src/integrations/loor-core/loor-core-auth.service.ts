import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class LoorCoreAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  mintServiceToken(): string {
    const secret = this.config.get<string>('loorCore.secret') || '';
    const issuer = this.config.get<string>('loorCore.issuer');
    const audience = this.config.get<string>('loorCore.audience');
    const clientId = this.config.get<string>('loorCore.clientId');
    const ttl = this.config.get<number>('loorCore.jwtTtlSeconds') || 60;

    return this.jwt.sign(
      {
        sub: clientId,
        typ: 'service',
      },
      {
        secret,
        issuer,
        audience,
        expiresIn: ttl,
      },
    );
  }
}
