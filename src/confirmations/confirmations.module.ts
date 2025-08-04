import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfirmationsService } from './confirmations.service';
import { Confirmation } from '../database/entities/confirmation.entity';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { Symbol } from '../database/entities/symbol.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Confirmation, ConfirmationType, Symbol])],
  providers: [ConfirmationsService],
  exports: [ConfirmationsService],
})
export class ConfirmationsModule {}
