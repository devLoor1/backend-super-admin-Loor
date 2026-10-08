import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  development = 'development',
  production = 'production',
  test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV?: NodeEnv;

  @IsNumberString()
  @IsOptional()
  PORT?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  LOOR_CORE_BASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  LOOR_CORE_SERVICE_SECRET!: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  // Nest merges .env + process.env; keep an explicit merge so watch restarts
  // still see values even if the host env was empty at process spawn.
  const merged = {
    ...process.env,
    ...config,
  } as Record<string, unknown>;

  const validated = plainToInstance(EnvironmentVariables, merged, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `${errors.toString()}\nHint: ensure backend-super-admin-Loor/.env exists (copy from .env.example) and restart npm run start:dev from that folder.`,
    );
  }
  return validated;
}
