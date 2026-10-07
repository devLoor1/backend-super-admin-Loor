import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SuperAdminStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string; correlationId?: string }) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });

    if (!admin) {
      await this.audit.write({
        action: 'LOGIN_FAILURE',
        result: 'failed',
        ip: meta.ip,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
        afterData: { email: dto.email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(admin.passwordHash, dto.password);
    if (!valid || admin.status !== SuperAdminStatus.ACTIVE) {
      await this.audit.write({
        action: 'LOGIN_FAILURE',
        superAdminId: admin.id,
        result: 'failed',
        ip: meta.ip,
        userAgent: meta.userAgent,
        correlationId: meta.correlationId,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.superAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: admin.id,
      email: admin.email,
    });

    await this.audit.write({
      action: 'LOGIN_SUCCESS',
      superAdminId: admin.id,
      result: 'success',
      ip: meta.ip,
      userAgent: meta.userAgent,
      correlationId: meta.correlationId,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      operator: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        roles: admin.roles.map((item) => item.role.slug),
      },
    };
  }

  async me(operatorId: string) {
    const admin = await this.prisma.superAdmin.findUniqueOrThrow({
      where: { id: operatorId },
      include: { roles: { include: { role: true } } },
    });

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      status: admin.status,
      roles: admin.roles.map((item) => item.role.slug),
      lastLoginAt: admin.lastLoginAt,
    };
  }
}
