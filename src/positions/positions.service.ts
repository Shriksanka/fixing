import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position } from '../database/entities/position.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { Direction } from '../database/entities/direction.entity';

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Symbol)
    private readonly symbolRepo: Repository<Symbol>,
    @InjectRepository(Direction)
    private readonly directionRepo: Repository<Direction>,
  ) {}

  // Найти открытую позицию по символу и направлению
  async findPosition(symbolId: string, direction: string) {
    return this.positionRepo.findOne({
      where: {
        symbol: { id: symbolId },
        direction: { name: direction },
      },
      relations: ['symbol', 'direction'],
    });
  }

  // Найти открытую позицию по символу (любой direction)
  async getActivePosition(symbolId: string) {
    return this.positionRepo.findOne({
      where: {
        symbol: { id: symbolId },
      },
      relations: ['direction', 'symbol'],
    });
  }

  // Открыть позицию (если нет уже открытой)
  async enterPosition({
    symbolId,
    direction,
    price,
    entry_type = 'confirmations',
    reason,
  }: {
    symbolId: string;
    direction: string;
    price: number;
    entry_type?: 'strong' | 'confirmations';
    reason?: string;
  }) {
    // Проверяем, нет ли уже открытой позиции по символу
    const existing = await this.positionRepo.findOne({
      where: { symbol: { id: symbolId } }, // НЕ разрешаем две позиции на символ!
      relations: ['symbol'],
    });
    if (existing) {
      return { status: 'already_exists' };
    }

    // Получаем нужные сущности
    const symbol = await this.symbolRepo.findOne({ where: { id: symbolId } });
    const dir = await this.directionRepo.findOne({
      where: { name: direction },
    });

    if (!symbol || !dir) {
      return { status: 'error', message: 'Invalid symbol or direction' };
    }

    const position = this.positionRepo.create({
      symbol,
      direction: dir,
      amount: 200, // ОБЯЗАТЕЛЬНО передай число!
      entry_price: price,
      // opened_at и last_updated TypeORM сам заполнит!
    });
    await this.positionRepo.save(position);

    return { status: 'position_entered' };
  }

  // Закрыть (удалить) позицию
  async exitPosition({
    symbolId,
    direction,
    price,
    reason,
  }: {
    symbolId: string;
    direction: string;
    price: number;
    reason?: string;
  }) {
    const position = await this.positionRepo.findOne({
      where: { symbol: { id: symbolId }, direction: { name: direction } },
      relations: ['symbol', 'direction'],
    });
    if (!position) {
      return { status: 'not_found' };
    }
    await this.positionRepo.remove(position);
    return { status: 'position_exited' };
  }

  // Получить имя символа (для сообщений)
  async getSymbolName(symbolId: string): Promise<string> {
    const symbol = await this.symbolRepo.findOne({ where: { id: symbolId } });
    return symbol?.name ?? symbolId;
  }
}
