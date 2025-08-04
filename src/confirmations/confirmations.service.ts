import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Confirmation } from '../database/entities/confirmation.entity';
import { Repository, MoreThan, In } from 'typeorm';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { Symbol } from '../database/entities/symbol.entity';

@Injectable()
export class ConfirmationsService {
  constructor(
    @InjectRepository(Confirmation)
    private readonly confirmationRepository: Repository<Confirmation>,
    @InjectRepository(ConfirmationType)
    private readonly confirmationTypeRepository: Repository<ConfirmationType>,
    @InjectRepository(Symbol)
    private readonly symbolRepository: Repository<Symbol>,
  ) {}

  async getRecentConfirmations({
    symbolId,
    timeframeId,
    direction,
    ttlMinutes,
  }: {
    symbolId: string;
    timeframeId: string;
    direction: 'long' | 'short';
    ttlMinutes: number;
  }) {
    const since = new Date(Date.now() - ttlMinutes * 60_000);

    return this.confirmationRepository.find({
      where: {
        symbol: { id: symbolId },
        timeframe: { id: timeframeId },
        created_at: MoreThan(since),
        type: { direction: { name: direction } },
      },
      relations: ['type', 'type.direction'],
      order: { created_at: 'DESC' },
    });
  }

  async saveUniqueConfirmation({
    symbolId,
    timeframeId,
    typeId,
    price,
  }: {
    symbolId: string;
    timeframeId: string;
    typeId: string;
    price: number;
  }) {
    const existing = await this.confirmationRepository.findOne({
      where: {
        symbol: { id: symbolId },
        timeframe: { id: timeframeId },
        type: { id: typeId },
      },
      relations: ['symbol', 'timeframe', 'type'],
    });

    if (existing) {
      existing.price = price;
      existing.created_at = new Date();
      await this.confirmationRepository.save(existing);
      return { updated: true };
    }

    const type = await this.confirmationTypeRepository.findOne({
      where: { id: typeId },
      relations: ['direction'],
    });

    if (!type) throw new Error('Invalid typeId');

    if (type.antagonist_name) {
      const antagonist = await this.confirmationTypeRepository.findOne({
        where: { name: type.antagonist_name },
      });

      if (antagonist) {
        await this.confirmationRepository.delete({
          symbol: { id: symbolId },
          timeframe: { id: timeframeId },
          type: { id: antagonist.id },
        });
      }
    }

    await this.confirmationRepository.save({
      symbol: { id: symbolId },
      timeframe: { id: timeframeId },
      type: { id: typeId },
      price,
      created_at: new Date(),
    });

    return { created: true };
  }

  async countConfirmationsByDirection({
    symbolId,
    timeframeId,
    directionId,
  }: {
    symbolId: string;
    timeframeId: string;
    directionId: string;
  }): Promise<number> {
    return this.confirmationRepository.count({
      where: {
        symbol: { id: symbolId },
        timeframe: { id: timeframeId },
        type: {
          direction: { id: directionId },
        },
      },
      relations: ['type', 'type.direction'],
    });
  }

  async getDominantDirection(
    symbolId: string,
    timeframeId: string,
  ): Promise<'long' | 'short' | null> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const confirmations = await this.confirmationRepository.find({
      where: {
        symbol: { id: symbolId },
        timeframe: { id: timeframeId },
        created_at: MoreThan(startOfDay),
      },
      relations: ['type', 'type.direction'],
      order: { created_at: 'DESC' },
    });

    const longConfirmations = confirmations.filter(
      (c) => c.type.direction.name === 'long',
    );
    const shortConfirmations = confirmations.filter(
      (c) => c.type.direction.name === 'short',
    );

    if (longConfirmations.length > shortConfirmations.length) return 'long';
    if (shortConfirmations.length > longConfirmations.length) return 'short';

    // Если одинаково - по последнему сигналу
    const latestLong = longConfirmations[0]?.created_at;
    const latestShort = shortConfirmations[0]?.created_at;

    if (latestLong && latestShort) {
      return latestLong > latestShort ? 'long' : 'short';
    }

    if (latestLong) return 'long';
    if (latestShort) return 'short';

    return null;
  }

  async clearDirectionConfirmations({
    symbolId,
    timeframeId,
    directionId,
  }: {
    symbolId: string;
    timeframeId: string;
    directionId: string;
  }): Promise<number> {
    const types = await this.confirmationTypeRepository.find({
      where: {
        direction: { id: directionId },
      },
    });

    if (!types.length) return 0;

    const result = await this.confirmationRepository.delete({
      symbol: { id: symbolId },
      timeframe: { id: timeframeId },
      type: In(types.map((t) => t.id)),
    });

    return result.affected ?? 0;
  }

  async getConfirmationsWithTypesAndDirections({
    symbolId,
    timeframeId,
  }: {
    symbolId: string;
    timeframeId: string;
  }) {
    return this.confirmationRepository.find({
      where: {
        symbol: { id: symbolId },
        timeframe: { id: timeframeId },
      },
      relations: ['type', 'type.direction'],
      order: { created_at: 'DESC' },
    });
  }

  async getSymbolNameById(symbolId: string): Promise<string> {
    const symbol = await this.confirmationRepository.manager
      .getRepository('Symbol')
      .findOne({ where: { id: symbolId } });

    return symbol?.name ?? symbolId;
  }

  async getAllSymbols() {
    return this.symbolRepository.find();
  }
}
