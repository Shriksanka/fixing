import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { ConfirmationsService } from '../confirmations/confirmations.service';
import { PositionsService } from '../positions/positions.service';

@Injectable()
export class DecisionService {
  constructor(
    @InjectRepository(ConfirmationType)
    private readonly confirmationTypeRepository: Repository<ConfirmationType>,
    private readonly confirmationsService: ConfirmationsService,
    private readonly positionsService: PositionsService,
  ) {}

  private readonly timeframe4hId = 'e6938b7c-c055-4653-82cf-b42b23822e0a';
  private readonly timeframe1dId = 'cc03715b-0b7d-4a39-979d-26b2eb26314a';

  async processAlert({
    symbolId,
    timeframeId,
    typeName,
    price,
  }: {
    symbolId: string;
    timeframeId: string;
    typeName: string;
    price: number;
  }) {
    const type = await this.confirmationTypeRepository.findOne({
      where: { name: typeName },
      relations: ['direction'],
    });

    if (!type) throw new Error('Unknown confirmation type');

    // Save or update confirmation
    const saveResult = await this.confirmationsService.saveUniqueConfirmation({
      symbolId,
      timeframeId,
      typeId: type.id,
      price,
    });

    const directionId = type.direction.id;

    console.log('--- Считаем подтверждения для выхода ---');
    console.log('symbolId:', symbolId);
    console.log('timeframeId:', timeframeId);
    console.log('directionId:', directionId);

    // Подсчёт подтверждений
    const count = await this.confirmationsService.countConfirmationsByDirection(
      {
        symbolId,
        timeframeId,
        directionId,
      },
    );

    // Exit-сигнал — очистить подтверждения противоположного направления
    if (type.name === 'Exit Buy' || type.name === 'Exit Sell') {
      await this.confirmationsService.clearDirectionConfirmations({
        symbolId,
        timeframeId,
        directionId,
      });

      return this.positionsService.exitPosition({
        symbolId,
        direction: type.direction.name,
        reason: 'exit_signal',
        price,
      });
    }

    const hasPosition = await this.positionsService.findPosition(
      symbolId,
      type.direction.name,
    );

    if (count === 5) {
      const tf4h = await this.confirmationsService.getDominantDirection(
        symbolId,
        this.timeframe4hId,
      );
      const tf1d = await this.confirmationsService.getDominantDirection(
        symbolId,
        this.timeframe1dId,
      );

      const signalDirection = type.direction.name;

      if (tf4h !== signalDirection || tf1d !== signalDirection) {
        return {
          status: 'blocked_by_trend',
          message: `❌ Тренд 4H (${tf4h}) или 1D (${tf1d}) не совпадает с сигналом ${signalDirection}`,
        };
      }

      if (!hasPosition) {
        return this.positionsService.enterPosition({
          symbolId,
          direction: signalDirection,
          price,
          reason: 'entry',
        });
      }

      // ничего не делаем, позиция уже есть
      return { status: 'already_in_position' };
    }

    if (count > 5 && count <= 7) {
      if (hasPosition) {
        return this.positionsService.addToPosition({
          symbolId,
          direction: type.direction.name as 'long' | 'short',
          price,
          reason: 'scale_in',
        });
      }
      return { status: 'no_position_for_scale_in' };
    }

    const activePosition =
      await this.positionsService.getActivePosition(symbolId);

    // частичный выход при снижении
    if (
      count === 6 &&
      activePosition &&
      activePosition.direction.name === type.direction.name
    ) {
      return this.positionsService.reducePosition({
        symbolId,
        direction: type.direction.name as 'long' | 'short',
        reason: 'scale_out',
        price,
      });
    }

    // полный выход при count < 5
    if (
      count < 5 &&
      activePosition &&
      activePosition.direction.name === type.direction.name
    ) {
      return this.positionsService.exitPosition({
        symbolId,
        direction: type.direction.name as 'long' | 'short',
        reason: 'too_few_confirmations',
        price,
      });
    }
  }
}
