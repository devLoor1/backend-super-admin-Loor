import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MenuVisibilityController } from './menu-visibility.controller';
import { MenuVisibilityService } from './menu-visibility.service';

@Module({
  imports: [AuditModule],
  controllers: [MenuVisibilityController],
  providers: [MenuVisibilityService],
})
export class MenuVisibilityModule {}
