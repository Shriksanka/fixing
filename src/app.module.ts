import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from './alerts/alerts.module';
import AppDataSource from './database/data-source';
import { ConfirmationsModule } from './confirmations/confirmations.module';
import { DecisionModule } from './decision/decision.module';
import { PositionsModule } from './positions/positions.module';
import { TelegramModule } from './telegram/telegram.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(AppDataSource.options),
    AlertsModule,
    ConfirmationsModule,
    DecisionModule,
    PositionsModule,
    TelegramModule,
    ScheduleModule.forRoot(),
    SchedulerModule,
  ],
})
export class AppModule {}
