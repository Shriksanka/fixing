import { Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { TelegramModule } from '../telegram/telegram.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Position } from '../database/entities/position.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { Direction } from '../database/entities/direction.entity';
import { HttpModule } from '@nestjs/axios';
import { EntryCheckerService } from './enter-checker.service';
import { ConfirmationsModule } from '../confirmations/confirmations.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, Symbol, Direction]),
    TelegramModule,
    HttpModule,
    ConfigModule,
    ConfirmationsModule,
  ],
  providers: [PositionsService, EntryCheckerService],
  exports: [PositionsService],
})
export class PositionsModule {}
