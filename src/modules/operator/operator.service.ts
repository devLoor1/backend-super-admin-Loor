import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RoleSlug, SuperAdminStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaginationQueryDto, buildPaginatedMeta } from '../../common/dto/pagination-query.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { UpdateOperatorRolesDto } from './dto/update-operator-roles.dto';

type AuditMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class OperatorService {
  private readonly logger = new Logger(OperatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private serialize(admin: {
    id: string;
    name: string;
    email: string;
    status: SuperAdminStatus;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{ role: { slug: RoleSlug; name: string } }>;
  }) {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      status: admin.status,
      roles: admin.roles.map((r) => r.role.slug),
      roleDetails: admin.roles.map((r) => ({ slug: r.role.slug, name: r.role.name })),
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }

  async list(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { email: { contains: query.search } },
          ],
        }
      : {};

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.superAdmin.count({ where }),
      this.prisma.superAdmin.findMany({
        where,
        include: { roles: { include: { role: true } } },
        orderBy: { createdAt: query.order === 'asc' ? 'asc' : 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data: rows.map((r) => this.serialize(r)),
      meta: buildPaginatedMeta(page, perPage, total),
    };
  }

  async detail(id: string) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!admin) {
      throw new NotFoundException({ code: 'E_OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }
    return { data: this.serialize(admin) };
  }

  async create(dto: CreateOperatorDto, meta: AuditMeta) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.superAdmin.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({ code: 'E_EMAIL_TAKEN', message: 'Operator email already exists' });
    }

    const roles = await this.prisma.role.findMany({
      where: { slug: { in: dto.roles } },
    });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException({ code: 'E_VALIDATION', message: 'One or more roles are invalid' });
    }

    const passwordHash = await argon2.hash(dto.password);
    try {
      const admin = await this.prisma.superAdmin.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          status: SuperAdminStatus.ACTIVE,
          roles: {
            create: roles.map((role) => ({ roleId: role.id })),
          },
        },
        include: { roles: { include: { role: true } } },
      });

      await this.safeAudit({
        action: 'CREATE_OPERATOR',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: admin.id,
        afterData: { email, roles: dto.roles },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return { data: this.serialize(admin) };
    } catch (error) {
      await this.safeAudit({
        action: 'CREATE_OPERATOR',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        afterData: { email, roles: dto.roles },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async update(id: string, dto: UpdateOperatorDto, meta: AuditMeta) {
    const admin = await this.prisma.superAdmin.findUnique({ where: { id } });
    if (!admin) {
      throw new NotFoundException({ code: 'E_OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }

    const data: { name?: string; email?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const taken = await this.prisma.superAdmin.findFirst({
        where: { email, NOT: { id } },
      });
      if (taken) {
        throw new ConflictException({ code: 'E_EMAIL_TAKEN', message: 'Operator email already exists' });
      }
      data.email = email;
    }

    try {
      const updated = await this.prisma.superAdmin.update({
        where: { id },
        data,
        include: { roles: { include: { role: true } } },
      });
      await this.safeAudit({
        action: 'UPDATE_OPERATOR',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: id,
        beforeData: { name: admin.name, email: admin.email },
        afterData: data,
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { data: this.serialize(updated) };
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_OPERATOR',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: id,
        afterData: data,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async setActive(id: string, active: boolean, meta: AuditMeta) {
    if (!active && id === meta.operatorId) {
      throw new BadRequestException({
        code: 'E_SELF_DEACTIVATE',
        message: 'Cannot deactivate your own operator account',
      });
    }

    const admin = await this.prisma.superAdmin.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!admin) {
      throw new NotFoundException({ code: 'E_OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }

    const isSa = admin.roles.some((r) => r.role.slug === RoleSlug.SUPER_ADMIN);
    if (!active && isSa) {
      await this.assertNotLastActiveSuperAdmin(id);
    }

    try {
      const updated = await this.prisma.superAdmin.update({
        where: { id },
        data: { status: active ? SuperAdminStatus.ACTIVE : SuperAdminStatus.INACTIVE },
        include: { roles: { include: { role: true } } },
      });
      await this.safeAudit({
        action: active ? 'ACTIVATE_OPERATOR' : 'DEACTIVATE_OPERATOR',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: id,
        beforeData: { status: admin.status },
        afterData: { status: updated.status },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { data: this.serialize(updated) };
    } catch (error) {
      await this.safeAudit({
        action: active ? 'ACTIVATE_OPERATOR' : 'DEACTIVATE_OPERATOR',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: id,
        afterData: { active },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async updateRoles(id: string, dto: UpdateOperatorRolesDto, meta: AuditMeta) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!admin) {
      throw new NotFoundException({ code: 'E_OPERATOR_NOT_FOUND', message: 'Operator not found' });
    }

    const beforeRoles = admin.roles.map((r) => r.role.slug);
    const removingSa =
      beforeRoles.includes(RoleSlug.SUPER_ADMIN) && !dto.roles.includes(RoleSlug.SUPER_ADMIN);
    if (removingSa) {
      await this.assertNotLastActiveSuperAdmin(id);
    }

    const roles = await this.prisma.role.findMany({
      where: { slug: { in: dto.roles } },
    });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException({ code: 'E_VALIDATION', message: 'One or more roles are invalid' });
    }

    try {
      await this.prisma.$transaction([
        this.prisma.superAdminRole.deleteMany({ where: { superAdminId: id } }),
        this.prisma.superAdminRole.createMany({
          data: roles.map((role) => ({ superAdminId: id, roleId: role.id })),
        }),
      ]);
      const updated = await this.prisma.superAdmin.findUniqueOrThrow({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      await this.safeAudit({
        action: 'UPDATE_OPERATOR_ROLES',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: id,
        beforeData: { roles: beforeRoles },
        afterData: { roles: dto.roles },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return { data: this.serialize(updated) };
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_OPERATOR_ROLES',
        superAdminId: meta.operatorId,
        resourceType: 'operator',
        resourceId: id,
        afterData: { roles: dto.roles },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  private async assertNotLastActiveSuperAdmin(excludeId: string) {
    const activeSa = await this.prisma.superAdmin.count({
      where: {
        status: SuperAdminStatus.ACTIVE,
        id: { not: excludeId },
        roles: { some: { role: { slug: RoleSlug.SUPER_ADMIN } } },
      },
    });
    if (activeSa < 1) {
      throw new BadRequestException({
        code: 'E_LAST_SUPER_ADMIN',
        message: 'Cannot deactivate or remove SUPER_ADMIN from the last active SUPER_ADMIN',
      });
    }
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'operator_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
