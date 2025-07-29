import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { ConfirmationsService } from '../confirmations/confirmations.service';
import { PositionsService } from '../positions/positions.service';
import { TelegramService } from '../telegram/telegram.service';
import { TradingConfig } from './trading.config';

@Injectable()
export class DecisionService {
  constructor(
    @InjectRepository(ConfirmationType)
    private readonly confirmationTypeRepository: Repository<ConfirmationType>,
    private readonly confirmationsService: ConfirmationsService,
    private readonly positionsService: PositionsService,
    private readonly telegramService: TelegramService,
  ) {}

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
    const opposite = direction === 'long' ? 'short' : 'long';
    const symbolName =
      await this.confirmationsService.getSymbolNameById(symbolId);
    const saveResult = await this.confirmationsService.saveUniqueConfirmation({
      symbolId,
      timeframeId,
      typeId: type.id,
      price,
    });
    const hasPosition = !!(await this.positionsService.findPosition(
      symbolId,
      direction,
    ));

    if (
      await this.handleExit(
        type.name,
        directionId,
        symbolName,
        symbolId,
        timeframeId,
        direction,
        hasPosition,
        price,
      )
    )
      return;
    if (
      await this.handleStrongEntry(
        type.name,
        direction,
        opposite,
        symbolId,
        timeframeId,
        price,
        symbolName,
        hasPosition,
      )
    )
      return;
    if (
      await this.handleTimeframeEntry(
        symbolId,
        timeframeId,
        direction,
        price,
        symbolName,
        hasPosition,
      )
    )
      return;
    if (
      await this.handleAddToPosition(
        direction,
        symbolId,
        timeframeId,
        price,
        symbolName,
        hasPosition,
        !!saveResult.created,
      )
    )
      return;
    if (
      await this.handleCloseIfLessThan3(
        direction,
        directionId,
        symbolId,
        timeframeId,
        price,
        symbolName,
        hasPosition,
      )
    )
      return;

    return { status: 'handled' };
  }

  private async handleExit(
    typeName: string,
    directionId: string,
    symbolName: string,
    symbolId: string,
    timeframeId: string,
    direction: string,
    hasPosition: boolean,
    price: number,
  ) {
    if (typeName === 'Exit Buy' || typeName === 'Exit Sell') {
      await this.confirmationsService.clearDirectionConfirmations({
        symbolId,
        timeframeId,
        directionId,
      });
      if (hasPosition) {
        const result = await this.positionsService.exitPosition({
          symbolId,
          direction,
          price,
          reason: 'exit_signal',
        });
        if (result?.status === 'position_exited') {
          await this.telegramService.sendMessage(
            `📤 Закрытие позиции ${direction.toUpperCase()} по ${symbolName} @ ${price}\nПричина: сигнал ${typeName}`,
          );
        }
        return true;
      }
      return true;
    }
    return false;
  }

  private async handleStrongEntry(
    typeName: string,
    direction: string,
    opposite: string,
    symbolId: string,
    timeframeId: string,
    price: number,
    symbolName: string,
    hasPosition: boolean,
  ) {
    if (typeName !== 'Strong Long Entry' && typeName !== 'Strong Short Entry')
      return false;

    const [tf4h, tf1d] = await this.getTrendDirections(symbolId);
    if (tf4h !== direction || tf1d !== direction) return false;

    const all =
      await this.confirmationsService.getConfirmationsWithTypesAndDirections({
        symbolId,
        timeframeId,
      });
    const oppositeCount = all.filter(
      (c) => c.type.direction.name === opposite,
    ).length;
    if (oppositeCount >= 3 || hasPosition) return false;

    const [confirmations15m, confirmations4h, confirmations1d] =
      await this.getAllConfirmations(symbolId, timeframeId);
    const result = await this.positionsService.enterPosition({
      symbolId,
      direction,
      price,
      reason: 'strong_entry',
    });
    if (result?.status === 'position_entered') {
      await this.telegramService.sendMessage(
        this.buildOpenMessage(
          'Strong Entry + совпадение тренда + <3 противоположных',
          direction,
          symbolName,
          price,
          confirmations15m,
          confirmations4h,
          confirmations1d,
        ),
      );
    }
    return true;
  }

  private async handleAddToPosition(
    direction: string,
    symbolId: string,
    timeframeId: string,
    price: number,
    symbolName: string,
    hasPosition: boolean,
    created: boolean,
  ) {
    if (!hasPosition || !created) return false;
    const [confirmations15m, confirmations4h, confirmations1d] =
      await this.getAllConfirmations(symbolId, timeframeId);
    await this.telegramService.sendMessage(
      this.buildOpenMessage(
        'Долив позиции',
        direction,
        symbolName,
        price,
        confirmations15m,
        confirmations4h,
        confirmations1d,
      ),
    );
    return true;
  }

  private async handleCloseIfLessThan3(
    direction: string,
    directionId: string,
    symbolId: string,
    timeframeId: string,
    price: number,
    symbolName: string,
    hasPosition: boolean,
  ) {
    if (!hasPosition) return false;

    const ttlMinutes =
      timeframeId === TradingConfig.timeframes.TF_15M
        ? 30
        : timeframeId === TradingConfig.timeframes.TF_1H
          ? 180
          : null;

    if (!ttlMinutes) return false;

    const recentConfirmations =
      await this.confirmationsService.getRecentConfirmations({
        symbolId,
        timeframeId,
        direction: direction as 'long' | 'short',
        ttlMinutes,
      });

    if (recentConfirmations.length >= 3) return false;

    const result = await this.positionsService.exitPosition({
      symbolId,
      direction,
      price,
      reason: 'too_few_confirmations',
    });

    if (result?.status === 'position_exited') {
      await this.telegramService.sendMessage(
        `📤 Закрытие позиции ${direction.toUpperCase()} по ${symbolName} @ ${price}\nПричина: подтверждений <3 на ${ttlMinutes === 30 ? '15M' : '1H'}`,
      );
    }

    return true;
  }

  private async handleTimeframeEntry(
    symbolId: string,
    timeframeId: string,
    direction: 'long' | 'short',
    price: number,
    symbolName: string,
    hasPosition: boolean,
  ): Promise<boolean> {
    if (hasPosition) return false;

    const [tf4h, tf1d] = await this.getTrendDirections(symbolId);
    if (tf4h !== direction || tf1d !== direction) return false;

    const ttlMinutes =
      timeframeId === TradingConfig.timeframes.TF_15M
        ? 30
        : timeframeId === TradingConfig.timeframes.TF_1H
          ? 180
          : null;

    if (!ttlMinutes) return false;

    const recentConfirmations =
      await this.confirmationsService.getRecentConfirmations({
        symbolId,
        timeframeId,
        direction,
        ttlMinutes,
      });

    if (recentConfirmations.length < 3) return false;

    const [confirmations15m, confirmations4h, confirmations1d] =
      await this.getAllConfirmations(symbolId, timeframeId);

    const result = await this.positionsService.enterPosition({
      symbolId,
      direction,
      price,
      reason:
        timeframeId === TradingConfig.timeframes.TF_15M
          ? 'entry_15m'
          : 'entry_1h',
    });

    if (result?.status === 'position_entered') {
      await this.telegramService.sendMessage(
        this.buildOpenMessage(
          `≥3 подтверждения на ${timeframeId === TradingConfig.timeframes.TF_15M ? '15M (до 30 мин)' : '1H (до 3ч)'}`,
          direction,
          symbolName,
          price,
          confirmations15m,
          confirmations4h,
          confirmations1d,
        ),
      );
    }

    return true;
  }

  private getTrendDirections(symbolId: string) {
    return Promise.all([
      this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_4H,
      ),
      this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_1D,
      ),
    ]);
  }

  private buildOpenMessage(
    reason: string,
    direction: string,
    symbolName: string,
    price: number,
    c15m: any[],
    c4h: any[],
    c1d: any[],
  ) {
    const fmt = (list: any[]) =>
      list
        .filter((c) => c.type.direction.name === direction)
        .map((c) => c.type.name)
        .join(', ') || '—';
    return `📥 Открытие позиции ${direction.toUpperCase()} по ${symbolName} @ ${price}\n📌 Причина: ${reason}\n— 1D: ${fmt(c1d)}\n— 4H: ${fmt(c4h)}\n— 15M: ${fmt(c15m)}`;
  }

  private getAllConfirmations(symbolId: string, timeframeId?: string) {
    return Promise.all([
      this.confirmationsService.getConfirmationsWithTypesAndDirections({
        symbolId,
        timeframeId: timeframeId!,
      }),
      this.confirmationsService.getConfirmationsWithTypesAndDirections({
        symbolId,
        timeframeId: TradingConfig.timeframes.TF_4H,
      }),
      this.confirmationsService.getConfirmationsWithTypesAndDirections({
        symbolId,
        timeframeId: TradingConfig.timeframes.TF_1D,
      }),
    ]);
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
