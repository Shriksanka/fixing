import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from './alerts/alerts.module';
import AppDataSource from './database/data-source';
import { ConfirmationsModule } from './confirmations/confirmations.module';
import { DecisionModule } from './decision/decision.module';
import { PositionsModule } from './positions/positions.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(AppDataSource.options),
    AlertsModule,
    ConfirmationsModule,
    DecisionModule,
    PositionsModule,
    TelegramModule,
  ],
})
export class AppModule {}
