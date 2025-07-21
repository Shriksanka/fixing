import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { ConfirmationsService } from '../confirmations/confirmations.service';
import { PositionsService } from '../positions/positions.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class DecisionService {
  constructor(
    @InjectRepository(ConfirmationType)
    private readonly confirmationTypeRepository: Repository<ConfirmationType>,
    private readonly confirmationsService: ConfirmationsService,
    private readonly positionsService: PositionsService,
    private readonly telegramService: TelegramService,
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

    const symbolName =
      await this.confirmationsService.getSymbolNameById(symbolId);

    // Сохраняем подтверждение, включая логику удаления антагониста
    const saveResult = await this.confirmationsService.saveUniqueConfirmation({
      symbolId,
      timeframeId,
      typeId: type.id,
      price,
    });

    const hasPosition = await this.positionsService.findPosition(
      symbolId,
      direction,
    );

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

        if (antagCount < 3 && activePosition) {
          await this.telegramService.sendMessage(
            `📤 Закрытие позиции ${antagonistDirection.toUpperCase()} по ${price} для ${symbolName}\nПричина: недостаточно подтверждений (<3)\nТаймфрейм: 15M`,
          );
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

      if (hasPosition) {
        await this.telegramService.sendMessage(
          `📤 Закрытие позиции ${direction.toUpperCase()} по ${symbolName} @ ${price}\nПричина: сигнал ${type.name}`,
        );

        return this.positionsService.exitPosition({
          symbolId,
          direction,
          price,
          reason: 'exit_signal',
        });
      }

      return { status: 'exit_skipped', reason: 'no_active_position' };
    }

    // Нормальный сценарий: вход
    const count = await this.confirmationsService.countConfirmationsByDirection(
      {
        symbolId,
        timeframeId,
        directionId,
      },
    );

    if (count >= 4) {
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

      const confirmations15m =
        await this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId,
          timeframeId,
        });
      const signals15m = confirmations15m
        .filter((c) => c.type.direction.name === direction)
        .map((c) => c.type.name);

      const confirmations4h =
        await this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId,
          timeframeId: this.timeframe4hId,
        });
      const signals4h = confirmations4h
        .filter((c) => c.type.direction.name === tf4h)
        .map((c) => c.type.name);

      const confirmations1d =
        await this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId,
          timeframeId: this.timeframe1dId,
        });
      const signals1d = confirmations1d
        .filter((c) => c.type.direction.name === tf1d)
        .map((c) => c.type.name);

      const msg = `
      📥 Открытие позиции ${direction.toUpperCase()} по ${price} для ${symbolName}
      📌 Причина: >=5 подтверждений на 15M + тренд 4H/1D совпадает
      — 1D (${tf1d}): ${signals1d.join(', ') || '—'}
      — 4H (${tf4h}): ${signals4h.join(', ') || '—'}
      — 15M (${direction}): ${signals15m.join(', ') || '—'}
      `;

      await this.telegramService.sendMessage(msg.trim());

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
    if (count < 3 && hasPosition) {
      await this.telegramService.sendMessage(
        `📤 Закрытие позиции ${direction.toUpperCase()} по ${symbolName} @ ${price}\nПричина: подтверждений <3 на 15M`,
      );

      return this.positionsService.exitPosition({
        symbolId,
        direction,
        price,
        reason: 'too_few_confirmations',
      });
    }

    return { status: 'exit_skipped', reason: 'no_active_position' };
  }

  async getConfirmationsWithTypesAndDirections({
    symbolId,
    timeframeId,
  }: {
    symbolId: string;
    timeframeId: string;
  }) {
    return this.confirmationsService.getConfirmationsWithTypesAndDirections({
      symbolId,
      timeframeId,
    });
  }
}
