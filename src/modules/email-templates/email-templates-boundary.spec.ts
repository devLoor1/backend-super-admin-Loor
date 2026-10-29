import 'reflect-metadata';
import {
  Body,
  Controller,
  ExecutionContext,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { RolesGuard } from '../../common/guards/roles.guard';
import { EmailTemplatesController } from './email-templates.controller';
import {
  EMAIL_TEMPLATES_BODY_PATH,
  emailTemplatesBodyParser,
} from './email-templates-body-parser';
import {
  EmailTemplateCreateDto,
  EmailTemplatePreviewDto,
  EmailTemplateUpdateDto,
} from './dto/email-template.dto';

@Controller()
class ParserBoundaryController {
  @Post('whitelabels/:whitelabelId/emails/templates/preview')
  preview(@Body() body: EmailTemplatePreviewDto) {
    return { receivedLength: body.body_html.length };
  }

  @Post('other')
  other(@Body() body: Record<string, unknown>) {
    return { received: body.value };
  }
}

describe('Email template HTTP boundaries', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const valid = {
    name: 'QA inactive',
    type: 'email_confirmation',
    subject: 'Exemplo',
    body_html: '<p>{{url}}</p>',
  };

  test('create accepts an omitted active flag and rejects body retargeting', async () => {
    const result: unknown = await pipe.transform(valid, {
      type: 'body',
      metatype: EmailTemplateCreateDto,
    });
    expect(result).toEqual(valid);
    for (const extra of [
      { active: null },
      { active: 'true' },
      { wtlb_id: 9 },
    ]) {
      await expect(
        pipe.transform(
          { ...valid, ...extra },
          {
            type: 'body',
            metatype: EmailTemplateCreateDto,
          },
        ),
      ).rejects.toThrow();
    }
  });

  test('update cannot change type and preview cannot inject variables, recipients or nested extensions', async () => {
    await expect(
      pipe.transform(
        { type: 'password_recovery' },
        {
          type: 'body',
          metatype: EmailTemplateUpdateDto,
        },
      ),
    ).rejects.toThrow();
    const preview = {
      type: valid.type,
      subject: valid.subject,
      body_html: valid.body_html,
    };
    for (const extra of [
      { variables: { token: 'private' } },
      { to: 'someone@example.invalid' },
      { brandingDraft: { token: 'private' } },
      { brandingDraft: null },
    ]) {
      await expect(
        pipe.transform(
          { ...preview, ...extra },
          {
            type: 'body',
            metatype: EmailTemplatePreviewDto,
          },
        ),
      ).rejects.toThrow();
    }
    await expect(
      pipe.transform(
        { ...preview, brandingDraft: { primary_color: null, logo_url: null } },
        {
          type: 'body',
          metatype: EmailTemplatePreviewDto,
        },
      ),
    ).resolves.toMatchObject({
      brandingDraft: { primary_color: null, logo_url: null },
    });
  });

  test('real role guard allows read-only preview and blocks read-only writes', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (
      method: keyof EmailTemplatesController,
      roles?: string[],
    ) =>
      ({
        // Reflect on the original handler identity without invoking or binding it.
        getHandler: () =>
          Object.getOwnPropertyDescriptor(
            EmailTemplatesController.prototype,
            method,
          )?.value as object,
        getClass: () => EmailTemplatesController,
        switchToHttp: () => ({
          getRequest: () => ({ user: roles ? { roles } : undefined }),
        }),
      }) as unknown as ExecutionContext;
    expect(guard.canActivate(context('preview', ['READ_ONLY']))).toBe(true);
    expect(guard.canActivate(context('list', ['READ_ONLY']))).toBe(true);
    expect(guard.canActivate(context('create', ['SUPER_ADMIN']))).toBe(true);
    expect(() => guard.canActivate(context('update', ['READ_ONLY']))).toThrow(
      'Insufficient role',
    );
    expect(() => guard.canActivate(context('remove', ['SUPPORT']))).toThrow(
      'Insufficient role',
    );
    expect(() => guard.canActivate(context('preview'))).toThrow(
      'Missing operator context',
    );
  });

  test('scoped JSON limit supports advertised Unicode HTML while unrelated endpoints retain their limit', async () => {
    const module = await Test.createTestingModule({
      controllers: [ParserBoundaryController],
    }).compile();
    const app = module.createNestApplication<INestApplication<Server>>();
    app.use(EMAIL_TEMPLATES_BODY_PATH, emailTemplatesBodyParser);
    app.useGlobalPipes(pipe);
    app.setGlobalPrefix('api');
    await app.init();
    const server = app.getHttpServer();
    const body = {
      type: valid.type,
      subject: valid.subject,
      body_html: '界'.repeat(150000),
    };
    try {
      await request(server)
        .post('/api/whitelabels/8/emails/templates/preview')
        .send(body)
        .expect(201)
        .expect({ receivedLength: 150000 });
      await request(server)
        .post('/api/other')
        .send({ value: 'normal parser retained' })
        .expect(201)
        .expect({ received: 'normal parser retained' });
      await request(server).post('/api/other').send(body).expect(413);
      await request(server)
        .post('/api/whitelabels/8/emails/templates/preview')
        .send({ ...body, body_html: 'x'.repeat(1048576) })
        .expect(413);
    } finally {
      await app.close();
    }
  });
});
