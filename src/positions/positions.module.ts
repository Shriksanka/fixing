import { Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { TelegramModule } from '../telegram/telegram.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Position } from '../database/entities/position.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { Direction } from '../database/entities/direction.entity';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    TypeOrmModule.forFeature([Position, Symbol, Direction]),
    TelegramModule,
    HttpModule,
  ],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
