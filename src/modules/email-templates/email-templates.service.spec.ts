import 'reflect-metadata';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import type { LoorCoreRequestOptions } from '../../integrations/loor-core/loor-core.types';
import { AuditService } from '../audit/audit.service';
import type { AuditWriteInput } from '../audit/audit.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('Operator email templates', () => {
  const core = {
    request: jest.fn<
      Promise<{ data: { data: { id: number } }; status: number }>,
      [LoorCoreRequestOptions]
    >(),
  };
  const audit = { write: jest.fn<Promise<void>, [AuditWriteInput]>() };
  let service: EmailTemplatesService;
  beforeEach(() => {
    jest.clearAllMocks();
    core.request.mockResolvedValue({ data: { data: { id: 33 } }, status: 200 });
    audit.write.mockResolvedValue(undefined);
    service = new EmailTemplatesService(
      core as unknown as LoorCoreClient,
      audit as unknown as AuditService,
    );
  });

  test('scopes list and detail to the selected tenant using internal service client', async () => {
    await service.list('8', 'email_confirmation', 'correlation');
    expect(core.request).toHaveBeenLastCalledWith({
      method: 'GET',
      path: '/internal/super-admin/v1/whitelabels/8/emails/templates',
      query: { type: 'email_confirmation' },
      correlationId: 'correlation',
    });
    await service.show('8', '33');
    expect(core.request.mock.calls[1][0].path).toBe(
      '/internal/super-admin/v1/whitelabels/8/emails/templates/33',
    );
    expect(audit.write).not.toHaveBeenCalled();
  });

  test.each([
    '../9',
    '8/../../admins',
    '0',
    '-1',
    '1.2',
    '1e3',
    '9007199254740992',
  ])('rejects unsafe tenant %s before network', async (tenant) => {
    await expect(service.list(tenant)).rejects.toThrow(
      'Invalid numeric identifier',
    );
    expect(core.request).not.toHaveBeenCalled();
  });

  test('preview forwards only allowed preview data and does not audit or dispatch mail', async () => {
    const body = {
      type: 'email_confirmation',
      subject: 'Exemplo',
      body_html: '<p>{{url}}</p>',
    };
    await service.preview('8', body, 'preview');
    expect(core.request).toHaveBeenCalledTimes(1);
    expect(core.request.mock.calls[0][0]).toEqual({
      method: 'POST',
      path: '/internal/super-admin/v1/whitelabels/8/emails/templates/preview',
      body,
      correlationId: 'preview',
    });
    expect(audit.write).not.toHaveBeenCalled();
    await expect(
      service.preview('8', { ...body, to: 'someone@example.invalid' }),
    ).rejects.toThrow();
    await expect(
      service.preview('8', { ...body, variables: { token: 'secret' } }),
    ).rejects.toThrow();
  });

  test('write is dispatched once and audit excludes content/subjects/secrets', async () => {
    await service.mutate(
      '8',
      'PATCH',
      { subject: 'Sensitive editorial', body_html: '<p>PRIVATE BODY</p>' },
      { operatorId: 'operator', correlationId: 'qa' },
      '33',
    );
    expect(core.request).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        superAdminId: 'operator',
        whitelabelId: 8,
        result: 'success',
        afterData: { templateId: 33, changedFields: ['subject', 'body_html'] },
      }),
    );
    expect(JSON.stringify(audit.write.mock.calls)).not.toContain('PRIVATE');
    expect(JSON.stringify(audit.write.mock.calls)).not.toContain('Sensitive');
  });

  test('uncertain Core error is not retried', async () => {
    core.request.mockRejectedValue(new Error('timeout'));
    await expect(
      service.mutate(
        '8',
        'POST',
        { name: 'QA', type: 'email_confirmation' },
        { operatorId: 'operator' },
      ),
    ).rejects.toThrow('timeout');
    expect(core.request).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed' }),
    );
  });

  test('create audit captures authoritative returned ID without content', async () => {
    await service.mutate(
      '8',
      'POST',
      {
        name: 'QA',
        type: 'email_confirmation',
        subject: 'Private subject',
        body_html: '<p>PRIVATE</p>',
      },
      { operatorId: 'operator' },
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 33,
        afterData: {
          templateId: 33,
          changedFields: ['name', 'type', 'subject', 'body_html'],
        },
      }),
    );
    expect(JSON.stringify(audit.write.mock.calls)).not.toContain('PRIVATE');
  });

  test('audit outage cannot replay or misreport a successful mutation', async () => {
    audit.write.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.mutate(
        '8',
        'PATCH',
        { name: 'QA edit' },
        { operatorId: 'operator' },
        '33',
      ),
    ).resolves.toEqual({ data: { id: 33 } });
    expect(core.request).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledTimes(1);
  });

  test('DELETE has no request body and cannot retarget via body fields', async () => {
    await service.mutate('8', 'DELETE', {}, { operatorId: 'operator' }, '33');
    expect(core.request.mock.calls[0][0]).not.toHaveProperty('body');
    await expect(
      service.mutate(
        '8',
        'PATCH',
        { wtlb_id: 7 },
        { operatorId: 'operator' },
        '33',
      ),
    ).rejects.toThrow();
  });

  test('role metadata preserves read-only preview and SUPER_ADMIN-only writes', () => {
    for (const method of ['list', 'show', 'types', 'preview'] as const)
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          Object.getOwnPropertyDescriptor(
            EmailTemplatesController.prototype,
            method,
          )?.value as object,
        ),
      ).toEqual(['SUPER_ADMIN', 'READ_ONLY']);
    for (const method of ['create', 'update', 'remove'] as const)
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          Object.getOwnPropertyDescriptor(
            EmailTemplatesController.prototype,
            method,
          )?.value as object,
        ),
      ).toEqual(['SUPER_ADMIN']);
  });
});
