import { Module } from '@nestjs/common';
import { DecisionService } from './decision.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Confirmation } from '../database/entities/confirmation.entity';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { PositionsModule } from '../positions/positions.module';
import { ConfirmationsModule } from '../confirmations/confirmations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Confirmation, ConfirmationType]),
    PositionsModule,
    ConfirmationsModule,
  ],
  providers: [DecisionService],
  exports: [DecisionService],
})
export class DecisionModule {}
