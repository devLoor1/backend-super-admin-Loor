import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());

  const corsOrigin = config.get<string>('corsOrigin') || '';
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((value) => value.trim()).filter(Boolean)
      : true,
    credentials: true,
    exposedHeaders: ['X-Correlation-ID', 'X-Response-Time'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  const swagger = new DocumentBuilder()
    .setTitle('LOOR Super Admin Control Plane')
    .setDescription(
      'Frontend-facing NestJS Control Plane. Operational rules stay in Adonis Core via LoorCoreClient.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Dashboard')
    .addTag('Whitelabels')
    .addTag('Accounts')
    .addTag('Administrators')
    .addTag('Platform Configuration')
    .addTag('SMTP')
    .addTag('Opportunities')
    .addTag('Investors')
    .addTag('Entrepreneurs')
    .addTag('Investments')
    .addTag('Payments')
    .addTag('Wallet')
    .addTag('Gateways')
    .addTag('Compliance')
    .addTag('Audit')
    .addTag('Health')
    .build();

  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document);

  // Liveness probe for the hosting platform: outside the `api` prefix, no auth,
  // no DB/Core calls. Readiness with dependency checks stays at /api/health.
  app
    .getHttpAdapter()
    .get('/health', (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json({
        status: 'ok',
        service: 'loor-super-admin-api',
        timestamp: new Date().toISOString(),
      });
    });

  // PORT is injected by the hosting platform; configuration.ts falls back to 3334 locally.
  const port = Number(process.env.PORT) || config.get<number>('port') || 3334;
  await app.listen(port, '0.0.0.0');
  logger.log(`Control Plane listening on :${port} — docs /api/docs`);
}

bootstrap();
