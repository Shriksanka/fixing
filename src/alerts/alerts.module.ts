import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Confirmation } from '../database/entities/confirmation.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { Timeframe } from '../database/entities/timeframe.entity';
import { DecisionModule } from '../decision/decision.module';
import { ConfirmationsModule } from '../confirmations/confirmations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Confirmation,
      Symbol,
      ConfirmationType,
      Timeframe,
    ]),
    DecisionModule,
    ConfirmationsModule,
  ],
  providers: [AlertsService],
  controllers: [AlertsController],
})
export class AlertsModule {}
