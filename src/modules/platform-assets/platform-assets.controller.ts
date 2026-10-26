import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { PlatformAssetsService } from './platform-assets.service';

@ApiTags('Platform Assets')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/platform/assets')
export class PlatformAssetsController {
  constructor(private readonly service: PlatformAssetsService) {}

  @Get(':assetRef')
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  get(
    @Param('whitelabelId') whitelabelId: string,
    @Param('assetRef') assetRef: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.get(whitelabelId, assetRef, req.correlationId);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'AST-01 upload main_area platform asset' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('whitelabelId') whitelabelId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('slot') slot: string | undefined,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertFile(file);
    return this.service.upload(whitelabelId, file, slot || 'main_area', {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Put(':assetRef')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  replace(
    @Param('whitelabelId') whitelabelId: string,
    @Param('assetRef') assetRef: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertFile(file);
    return this.service.replace(whitelabelId, assetRef, file, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':assetRef')
  @Roles(ROLES.SUPER_ADMIN)
  remove(
    @Param('whitelabelId') whitelabelId: string,
    @Param('assetRef') assetRef: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.remove(whitelabelId, assetRef, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  private assertFile(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'image file is required (jpg/png/jpeg ≤20MiB)',
      });
    }
  }
}
