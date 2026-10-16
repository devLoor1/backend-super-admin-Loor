import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertVisibilityMap } from './dto/update-menu-visibility.dto';
import {
  applyLockedVisibility,
  defaultVisibilityMap,
  KNOWN_MENU_IDS,
  LOCKED_VISIBLE_MENU_IDS,
} from './menu-ids';

const SCOPE = 'global';
const SINGLETON_ID = 'global';

@Injectable()
export class MenuVisibilityService {
  private readonly logger = new Logger(MenuVisibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const row = await this.prisma.menuVisibilityConfig.findUnique({
      where: { id: SINGLETON_ID },
    });

    const visibility = applyLockedVisibility({
      ...defaultVisibilityMap(),
      ...((row?.visibility as Record<string, boolean> | null) ?? {}),
    });

    for (const id of KNOWN_MENU_IDS) {
      if (typeof visibility[id] !== 'boolean') {
        visibility[id] = true;
      }
    }

    return {
      data: {
        scope: SCOPE,
        visibility,
        version: row?.version ?? 0,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
        lockedIds: [...LOCKED_VISIBLE_MENU_IDS],
        notes: {
          visibilityIsSidebarOnly: true,
          rbacIndependent: true,
          childrenRetainPreferenceWhenParentHidden: true,
        },
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
      version?: number;
    },
  ) {
    const checked = assertVisibilityMap(
      visibilityInput,
      KNOWN_MENU_IDS,
      LOCKED_VISIBLE_MENU_IDS,
    );
    if (!checked.ok) {
      throw new BadRequestException({
        code: checked.code ?? 'E_INVALID_MENU_VISIBILITY',
        message: checked.message,
      });
    }

    const map = applyLockedVisibility(checked.map);
    const before = await this.get();
    const beforeMap = before.data.visibility;
    const currentVersion = before.data.version;

    // Optimistic concurrency: when a persisted row exists (version > 0) or any row,
    // require matching version. Fresh install (no row, version 0) accepts omitted/0.
    const existing = await this.prisma.menuVisibilityConfig.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) {
      if (meta.version === undefined || meta.version !== existing.version) {
        throw new ConflictException({
          code: 'E_MENU_VERSION_CONFLICT',
          message: 'Menu visibility was updated by another operator. Re-fetch and retry.',
          currentVersion: existing.version,
        });
      }
    } else if (meta.version !== undefined && meta.version !== 0) {
      throw new ConflictException({
        code: 'E_MENU_VERSION_CONFLICT',
        message: 'Menu visibility was updated by another operator. Re-fetch and retry.',
        currentVersion: 0,
      });
    }

    const row = await this.prisma.menuVisibilityConfig.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        scope: SCOPE,
        visibility: map,
        version: 1,
        updatedBy: meta.operatorId,
      },
      update: {
        visibility: map,
        version: { increment: 1 },
        updatedBy: meta.operatorId,
      },
    });

    // Guard against lost update if two PUTs raced past the check above.
    if (existing && row.version !== existing.version + 1) {
      throw new ConflictException({
        code: 'E_MENU_VERSION_CONFLICT',
        message: 'Menu visibility was updated by another operator. Re-fetch and retry.',
        currentVersion: row.version,
      });
    }

    const changed: Record<string, { from: boolean; to: boolean }> = {};
    for (const id of KNOWN_MENU_IDS) {
      if (beforeMap[id] !== map[id]) {
        changed[id] = { from: beforeMap[id], to: map[id] };
      }
    }

    await this.safeAudit({
      action: 'UPDATE_MENU_VISIBILITY',
      superAdminId: meta.operatorId,
      resourceType: 'menu_visibility',
      resourceId: SINGLETON_ID,
      beforeData: { visibility: beforeMap, version: currentVersion },
      afterData: { visibility: map, changed, version: row.version },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      data: {
        scope: SCOPE,
        visibility: map,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
        lockedIds: [...LOCKED_VISIBLE_MENU_IDS],
        notes: {
          visibilityIsSidebarOnly: true,
          rbacIndependent: true,
          childrenRetainPreferenceWhenParentHidden: true,
        },
      },
    };
  }

  /** Persistence already succeeded — never fail the HTTP response because Audit failed. */
  private async safeAudit (input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'menu_visibility_audit_failed_after_success',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
