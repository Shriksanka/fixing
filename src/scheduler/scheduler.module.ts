import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Symbol } from '../database/entities/symbol.entity';
import { Confirmation } from '../database/entities/confirmation.entity';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { Timeframe } from '../database/entities/timeframe.entity';
import { Direction } from '../database/entities/direction.entity';
import { Position } from '../database/entities/position.entity';
import { ConfirmationsModule } from '../confirmations/confirmations.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PositionsModule } from '../positions/positions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Symbol,
      Confirmation,
      ConfirmationType,
      Timeframe,
      Direction,
      Position,
    ]),
    ConfirmationsModule,
    TelegramModule,
    PositionsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
