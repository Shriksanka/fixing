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

    if (!type) throw new Error(`Unknown confirmation type: ${typeName}`);

    const direction = type.direction.name as 'long' | 'short';
    const directionId = type.direction.id;

    // Сохраняем подтверждение, включая логику удаления антагониста
    const saveResult = await this.confirmationsService.saveUniqueConfirmation({
      symbolId,
      timeframeId,
      typeId: type.id,
      price,
    });

    console.log('[processAlert]', { type: typeName, direction });

    // 🚨 Спец-обработка: проверка, пострадал ли антагонист
    if (type.antagonist_name) {
      const antagonistType = await this.confirmationTypeRepository.findOne({
        where: { name: type.antagonist_name },
        relations: ['direction'],
      });

      if (antagonistType) {
        const antagonistDirection = antagonistType.direction.name as
          | 'long'
          | 'short';
        const antagonistDirectionId = antagonistType.direction.id;

        const antagCount =
          await this.confirmationsService.countConfirmationsByDirection({
            symbolId,
            timeframeId,
            directionId: antagonistDirectionId,
          });

        const activePosition = await this.positionsService.findPosition(
          symbolId,
          antagonistDirection,
        );

        console.log('[antagonist check]', {
          antagDirection: antagonistDirection,
          antagCount,
          hasActive: !!activePosition,
        });

        if (antagCount < 5 && activePosition) {
          return this.positionsService.exitPosition({
            symbolId,
            direction: antagonistDirection,
            price,
            reason: 'too_few_confirmations',
          });
        }
      }
    }

    // Если сигнал — Exit Buy/Sell
    if (type.name === 'Exit Buy' || type.name === 'Exit Sell') {
      await this.confirmationsService.clearDirectionConfirmations({
        symbolId,
        timeframeId,
        directionId,
      });

      return this.positionsService.exitPosition({
        symbolId,
        direction,
        price,
        reason: 'exit_signal',
      });
    }

    // Нормальный сценарий: вход
    const count = await this.confirmationsService.countConfirmationsByDirection(
      {
        symbolId,
        timeframeId,
        directionId,
      },
    );

    const hasPosition = await this.positionsService.findPosition(
      symbolId,
      direction,
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

      if (tf4h !== direction || tf1d !== direction) {
        return {
          status: 'blocked_by_trend',
          message: `❌ Тренд 4H (${tf4h}) или 1D (${tf1d}) не совпадает с направлением ${direction}`,
        };
      }

      if (!hasPosition) {
        return this.positionsService.enterPosition({
          symbolId,
          direction,
          price,
          reason: 'entry',
        });
      }

      return { status: 'already_in_position' };
    }

    // Закрытие позиции по текущему направлению
    if (count < 5 && hasPosition) {
      return this.positionsService.exitPosition({
        symbolId,
        direction,
        price,
        reason: 'too_few_confirmations',
      });
    }

    return { status: 'no_action', count };
  }
}
