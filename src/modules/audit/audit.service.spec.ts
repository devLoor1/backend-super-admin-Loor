import { AuditService } from './audit.service';

describe('AuditService', () => {
  const prisma = {
    auditLog: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => args.data),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const service = new AuditService(prisma as never);

  it('redacts sensitive keys before persistence', async () => {
    await service.write({
      action: 'UPDATE_SMTP',
      afterData: {
        host: 'smtp.example.com',
        password: 'secret-value',
        nested: { apiKey: 'abc' },
      },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        afterData: {
          host: 'smtp.example.com',
          password: '[REDACTED]',
          nested: { apiKey: '[REDACTED]' },
        },
      }),
    });
  });
});
