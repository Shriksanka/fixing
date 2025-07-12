import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position } from '../database/entities/position.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { Direction } from '../database/entities/direction.entity';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Symbol)
    private readonly symbolRepo: Repository<Symbol>,
    @InjectRepository(Direction)
    private readonly directionRepo: Repository<Direction>,
    private readonly telegramService: TelegramService,
  ) {}

  private async getDirectionEntity(name: string): Promise<Direction> {
    const dir = await this.directionRepo.findOne({ where: { name } });
    if (!dir) throw new Error(`Direction ${name} not found`);
    return dir;
  }

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
    const dir = await this.getDirectionEntity(direction);

    const exists = await this.positionRepo.findOne({
      where: { symbol: { id: symbolId }, direction: { id: dir.id } },
    });

    if (exists) return;

    const symbolName = await this.getSymbolName(symbolId);

    await this.positionRepo.save({
      symbol: { id: symbolId },
      direction: dir,
      price,
      reason,
      amount: 10000,
      entry_price: 121412,
      created_at: new Date(),
    });

    await this.telegramService.sendMessage(
      `🟢 Вход в позицию: ${symbolName} ${direction} по ${price} (${reason})`,
    );
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
    const position = await this.findPosition(symbolId, direction);
    if (!position) return { skipped: 'no_position' };

    const dir = await this.getDirectionEntity(direction);

    const symbolName = await this.getSymbolName(symbolId);

    await this.positionRepo.delete({
      symbol: { id: symbolId },
      direction: { id: dir.id },
    });

    await this.telegramService.sendMessage(
      `🔴 Выход из позиции: ${symbolName} ${direction} по ${price} (${reason})`,
    );
  }

  async addToPosition({
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
    const symbolName = await this.getSymbolName(symbolId);

    const position = await this.findPosition(symbolId, direction);
    if (!position) return { skipped: 'no_position' };

    await this.telegramService.sendMessage(
      `🟡 Долив позиции: ${symbolName} ${direction} по ${price} (${reason})`,
    );
  }

  async reducePosition({
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
    const symbolName = await this.getSymbolName(symbolId);

    const position = await this.findPosition(symbolId, direction);
    if (!position) return { skipped: 'no_position' };

    await this.telegramService.sendMessage(
      `🟠 Частичный выход: ${symbolName} ${direction} по ${price} (${reason})`,
    );
  }

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
