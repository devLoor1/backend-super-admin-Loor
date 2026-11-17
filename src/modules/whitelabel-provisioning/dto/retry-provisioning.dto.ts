import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { ProvisioningStepKey } from '@prisma/client';
import {
  InitialAdminDto,
  ProvisioningGatewayDto,
} from './create-provisioning.dto';

/**
 * Secrets live only in process memory. After a restart (or an expired TTL) a FAILED
 * SMTP / INITIAL_ADMIN / GATEWAY_CONFIG step can only be retried if the credentials are re-supplied here.
 */
export class RetryProvisioningDto {
  @ApiPropertyOptional({
    enum: ProvisioningStepKey,
    description:
      'Defaults to the first FAILED step. Only FAILED steps can be retried.',
  })
  @IsOptional()
  @IsEnum(ProvisioningStepKey)
  stepKey?: ProvisioningStepKey;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  smtp?: Record<string, unknown>;

  @ApiPropertyOptional({ type: InitialAdminDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialAdminDto)
  initialAdmin?: InitialAdminDto;

  @ApiPropertyOptional({ type: ProvisioningGatewayDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisioningGatewayDto)
  gateway?: ProvisioningGatewayDto;
}
