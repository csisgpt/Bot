import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { SignalsService } from './signals.service';

@Module({
  imports: [CoreModule],
  providers: [SignalsService],
  exports: [SignalsService],
})
export class SignalsModule {}
