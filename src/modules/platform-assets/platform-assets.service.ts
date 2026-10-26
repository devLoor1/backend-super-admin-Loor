import { Injectable, Logger } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

type AuditMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class PlatformAssetsService {
  private readonly logger = new Logger(PlatformAssetsService.name);
  private base(whitelabelId: string) {
    return `/internal/super-admin/v1/whitelabels/${whitelabelId}/platform/assets`;
  }

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async get(whitelabelId: string, assetRef: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base(whitelabelId)}/${encodeURIComponent(assetRef)}`,
      correlationId,
    });
    return result.data;
  }

  async upload(whitelabelId: string, file: Express.Multer.File, slot: string, meta: AuditMeta) {
    const form = this.toForm(file, slot);
    try {
      const result = await this.core.request({
        method: 'POST',
        path: this.base(whitelabelId),
        body: form,
        multipart: true,
        correlationId: meta.correlationId,
      });
      const assetRef = (result.data as { data?: { asset_ref?: string } })?.data?.asset_ref;
      await this.safeAudit({
        action: 'UPLOAD_PLATFORM_ASSET',
        superAdminId: meta.operatorId,
        resourceType: 'platform_asset',
        resourceId: assetRef,
        whitelabelId: Number(whitelabelId) || null,
        afterData: {
          slot,
          mime: file.mimetype,
          sizeBytes: file.size,
          originalName: file.originalname,
          assetRef,
        },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'UPLOAD_PLATFORM_ASSET',
        superAdminId: meta.operatorId,
        resourceType: 'platform_asset',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { slot },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async replace(
    whitelabelId: string,
    assetRef: string,
    file: Express.Multer.File,
    meta: AuditMeta,
  ) {
    const form = this.toForm(file);
    try {
      const result = await this.core.request({
        method: 'PUT',
        path: `${this.base(whitelabelId)}/${encodeURIComponent(assetRef)}`,
        body: form,
        multipart: true,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'REPLACE_PLATFORM_ASSET',
        superAdminId: meta.operatorId,
        resourceType: 'platform_asset',
        resourceId: assetRef,
        whitelabelId: Number(whitelabelId) || null,
        afterData: { assetRef, mime: file.mimetype, sizeBytes: file.size },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'REPLACE_PLATFORM_ASSET',
        superAdminId: meta.operatorId,
        resourceType: 'platform_asset',
        resourceId: assetRef,
        whitelabelId: Number(whitelabelId) || null,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async remove(whitelabelId: string, assetRef: string, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'DELETE',
        path: `${this.base(whitelabelId)}/${encodeURIComponent(assetRef)}`,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'DELETE_PLATFORM_ASSET',
        superAdminId: meta.operatorId,
        resourceType: 'platform_asset',
        resourceId: assetRef,
        whitelabelId: Number(whitelabelId) || null,
        afterData: { assetRef },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data ?? { data: null };
    } catch (error) {
      await this.safeAudit({
        action: 'DELETE_PLATFORM_ASSET',
        superAdminId: meta.operatorId,
        resourceType: 'platform_asset',
        resourceId: assetRef,
        whitelabelId: Number(whitelabelId) || null,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  private toForm(file: Express.Multer.File, slot?: string) {
    const FormDataCtor = (globalThis as unknown as { FormData: typeof FormData }).FormData;
    const BlobCtor = (globalThis as unknown as { Blob: typeof Blob }).Blob;
    const form = new FormDataCtor();
    if (slot) form.append('slot', slot);
    const bytes = Uint8Array.from(file.buffer);
    form.append(
      'image',
      new BlobCtor([bytes], { type: file.mimetype || 'application/octet-stream' }),
      file.originalname || 'image.jpg',
    );
    return form;
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'platform_asset_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
