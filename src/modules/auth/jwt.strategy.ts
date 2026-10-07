import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { SuperAdminStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { RoleName } from '../../common/constants/roles';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') || 'insecure-dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedOperator> {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!admin || admin.status !== SuperAdminStatus.ACTIVE) {
      throw new UnauthorizedException('Operator inactive or not found');
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      roles: admin.roles.map((item) => item.role.slug as RoleName),
    };
  }
}
