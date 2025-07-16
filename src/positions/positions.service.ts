import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position } from '../database/entities/position.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Symbol)
    private readonly symbolRepo: Repository<Symbol>,
    private readonly http: HttpService,
  ) {}

  private BASE_URL = 'http://localhost:3100';

  async enterPosition({
    symbolId,
    direction,
    price,
    reason,
  }: {
    symbolId: string;
    direction: string;
    price: number;
    reason: string;
  }) {
    try {
      await firstValueFrom(
        this.http.post(`${this.BASE_URL}/positions/enter`, {
          symbolId,
          direction,
          price,
          reason,
        }),
      );

      return { status: 'position_entered' };
    } catch (error) {
      console.error('Error while entering position', error);
      return { status: 'error', error };
    }
  }

  async exitPosition({
    symbolId,
    direction,
    price,
    reason,
  }: {
    symbolId: string;
    direction: string;
    price: number;
    reason: string;
  }) {
    try {
      await firstValueFrom(
        this.http.post(`${this.BASE_URL}/positions/exit`, {
          symbolId,
          direction,
          price,
          reason,
        }),
      );

      return { status: 'position_exited' };
    } catch (error) {
      console.error('Error while exiting position', error);
      return { status: 'error', error };
    }
  }

  // async addToPosition({
  //   symbolId,
  //   direction,
  //   price,
  //   reason,
  // }: {
  //   symbolId: string;
  //   direction: string;
  //   price: number;
  //   reason: string;
  // }) {
  //   const symbolName = await this.getSymbolName(symbolId);

  //   const position = await this.findPosition(symbolId, direction);
  //   if (!position) return { skipped: 'no_position' };

  //   await this.telegramService.sendMessage(
  //     `🟡 Долив позиции: ${symbolName} ${direction} по ${price} (${reason})`,
  //   );
  // }

  // async reducePosition({
  //   symbolId,
  //   direction,
  //   price,
  //   reason,
  // }: {
  //   symbolId: string;
  //   direction: string;
  //   price: number;
  //   reason: string;
  // }) {
  //   const symbolName = await this.getSymbolName(symbolId);

  //   const position = await this.findPosition(symbolId, direction);
  //   if (!position) return { skipped: 'no_position' };

  //   await this.telegramService.sendMessage(
  //     `🟠 Частичный выход: ${symbolName} ${direction} по ${price} (${reason})`,
  //   );
  // }

  async findPosition(symbolId: string, direction: string) {
    return this.positionRepo.findOne({
      where: {
        symbol: { id: symbolId },
        direction: { name: direction },
      },
      relations: ['symbol', 'direction'],
    });
  }

  async getActivePosition(symbolId: string) {
    return this.positionRepo.findOne({
      where: {
        symbol: { id: symbolId },
      },
      relations: ['direction', 'symbol'],
    });
  }

  async getSymbolName(symbolId: string): Promise<string> {
    const symbol = await this.symbolRepo.findOne({ where: { id: symbolId } });

    if (!symbol) return symbolId; // fallback, чтобы не крашилось
    return symbol.name;
  }
}
