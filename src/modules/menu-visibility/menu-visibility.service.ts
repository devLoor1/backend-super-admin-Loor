import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertVisibilityMap } from './dto/update-menu-visibility.dto';
import { defaultVisibilityMap, KNOWN_MENU_IDS } from './menu-ids';

const SCOPE = 'global';
const SINGLETON_ID = 'global';

@Injectable()
export class MenuVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const row = await this.prisma.menuVisibilityConfig.findUnique({
      where: { id: SINGLETON_ID },
    });

    const visibility = {
      ...defaultVisibilityMap(),
      ...((row?.visibility as Record<string, boolean> | null) ?? {}),
    };

    // Ensure every known id is present (default = visible for new ids after deploy)
    for (const id of KNOWN_MENU_IDS) {
      if (typeof visibility[id] !== 'boolean') {
        visibility[id] = true;
      }
    }

    return {
      data: {
        scope: SCOPE,
        visibility,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
      },
    };
  }

  async put(
    visibilityInput: Record<string, unknown>,
    meta: {
      operatorId: string;
      operatorEmail?: string;
      correlationId?: string;
      ip?: string;
      userAgent?: string;
    },
  ) {
    const checked = assertVisibilityMap(visibilityInput, KNOWN_MENU_IDS);
    if (!checked.ok) {
      throw new BadRequestException({ code: 'E_INVALID_MENU_VISIBILITY', message: checked.message });
    }

    const before = await this.get();
    const beforeMap = before.data.visibility;

    const row = await this.prisma.menuVisibilityConfig.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        scope: SCOPE,
        visibility: checked.map,
        updatedBy: meta.operatorId,
      },
      update: {
        visibility: checked.map,
        updatedBy: meta.operatorId,
      },
    });

    const changed: Record<string, { from: boolean; to: boolean }> = {};
    for (const id of KNOWN_MENU_IDS) {
      if (beforeMap[id] !== checked.map[id]) {
        changed[id] = { from: beforeMap[id], to: checked.map[id] };
      }
    }

    await this.audit.write({
      action: 'UPDATE_MENU_VISIBILITY',
      superAdminId: meta.operatorId,
      resourceType: 'menu_visibility',
      resourceId: SINGLETON_ID,
      beforeData: { visibility: beforeMap },
      afterData: { visibility: checked.map, changed },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      data: {
        scope: SCOPE,
        visibility: checked.map,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
      },
    };
  }
}
