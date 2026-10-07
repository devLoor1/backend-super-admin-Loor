import { Module } from '@nestjs/common';
import { EntrepreneurController } from './entrepreneur.controller';
import { EntrepreneurService } from './entrepreneur.service';

@Module({
  controllers: [EntrepreneurController],
  providers: [EntrepreneurService],
})
export class EntrepreneurModule {}
