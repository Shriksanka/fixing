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

  private currentPositions: {
    [symbolId: string]: {
      direction: 'long' | 'short';
      timeframe: '15m' | '1h';
      entryPrice: number;
      entryType: 'strong' | 'confirmations';
      entryTime: Date;
    };
  } = {};

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

    await this.tryExitPosition(symbolId);
    await this.tryEnterPosition(symbolId);

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
      entry_type: 'strong',
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
      entry_type: 'confirmations',
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

  private async getTrend(
    symbolId: string,
    timeframeId: string,
    ttlMinutes: number,
  ): Promise<'long' | 'short' | null> {
    const long = await this.confirmationsService.getRecentConfirmations({
      symbolId,
      timeframeId,
      direction: 'long',
      ttlMinutes,
    });
    const short = await this.confirmationsService.getRecentConfirmations({
      symbolId,
      timeframeId,
      direction: 'short',
      ttlMinutes,
    });
    if (long.length === short.length) return null;
    return long.length > short.length ? 'long' : 'short';
  }

  // Попробовать открыть позицию (заглушка)
  async tryEnterPosition(symbolId: string) {
    if (this.currentPositions[symbolId]) return;

    const trend1d = await this.getTrend(
      symbolId,
      TradingConfig.timeframes.TF_1D,
      2880,
    ); // 48h
    const trend4h = await this.getTrend(
      symbolId,
      TradingConfig.timeframes.TF_4H,
      480,
    ); // 8h
    if (!trend1d || !trend4h || trend1d !== trend4h) return;

    const confirmations15m =
      await this.confirmationsService.getRecentConfirmations({
        symbolId,
        timeframeId: TradingConfig.timeframes.TF_15M,
        direction: trend1d,
        ttlMinutes: 30,
      });
    const confirmations1h =
      await this.confirmationsService.getRecentConfirmations({
        symbolId,
        timeframeId: TradingConfig.timeframes.TF_1H,
        direction: trend1d,
        ttlMinutes: 180,
      });

    // Strong Entry
    const strongEntry = [...confirmations15m, ...confirmations1h].find(
      (c) =>
        ['Strong Long Entry', 'Strong Short Entry'].includes(c.type.name) &&
        c.type.direction.name === trend1d,
    );

    if (strongEntry) {
      this.currentPositions[symbolId] = {
        direction: trend1d,
        timeframe: confirmations15m.some((c) => c === strongEntry)
          ? '15m'
          : '1h',
        entryPrice: strongEntry.price,
        entryType: 'strong',
        entryTime: new Date(),
      };
      await this.telegramService.sendMessage(
        `📥 Вход по STRONG ENTRY (${trend1d}) ${this.currentPositions[symbolId].timeframe} @ ${this.currentPositions[symbolId].entryPrice}`,
      );
      return;
    }
    // ≥4 подтверждения
    if (confirmations15m.length >= 4) {
      this.currentPositions[symbolId] = {
        direction: trend1d,
        timeframe: '15m',
        entryPrice: confirmations15m[0].price,
        entryType: 'confirmations',
        entryTime: new Date(),
      };
      await this.telegramService.sendMessage(
        `📥 Вход по ≥4 подтверждениям (${trend1d}) 15M @ ${this.currentPositions[symbolId].entryPrice}`,
      );
      return;
    }
    if (confirmations1h.length >= 4) {
      this.currentPositions[symbolId] = {
        direction: trend1d,
        timeframe: '1h',
        entryPrice: confirmations1h[0].price,
        entryType: 'confirmations',
        entryTime: new Date(),
      };
      await this.telegramService.sendMessage(
        `📥 Вход по ≥4 подтверждениям (${trend1d}) 1H @ ${this.currentPositions[symbolId].entryPrice}`,
      );
      return;
    }
  }

  // Попробовать выйти из позиции (заглушка)
  async tryExitPosition(symbolId: string) {
    if (!this.currentPositions[symbolId]) return;

    const confirmations =
      await this.confirmationsService.getConfirmationsWithTypesAndDirections({
        symbolId,
        timeframeId:
          this.currentPositions[symbolId].timeframe === '1h'
            ? TradingConfig.timeframes.TF_1H
            : TradingConfig.timeframes.TF_15M,
      });
    if (confirmations.some((c) => c.type.name.startsWith('Exit'))) {
      await this.telegramService.sendMessage(
        `📤 Выход по сигналу EXIT (${this.currentPositions[symbolId].direction}) @ ${this.currentPositions[symbolId].entryPrice}`,
      );
      return;
    }

    const currConfirms = await this.confirmationsService.getRecentConfirmations(
      {
        symbolId,
        timeframeId:
          this.currentPositions[symbolId].timeframe === '1h'
            ? TradingConfig.timeframes.TF_1H
            : TradingConfig.timeframes.TF_15M,
        direction: this.currentPositions[symbolId].direction,
        ttlMinutes:
          this.currentPositions[symbolId].timeframe === '1h' ? 180 : 30,
      },
    );
    const hasStrong = currConfirms.some((c) =>
      ['Strong Long Entry', 'Strong Short Entry'].includes(c.type.name),
    );
    if (currConfirms.length < 4 && !hasStrong) {
      await this.telegramService.sendMessage(
        `📤 Выход: подтверждений <4 по ${this.currentPositions[symbolId].timeframe.toUpperCase()} (${this.currentPositions[symbolId].direction})`,
      );
      return;
    }
  }

  // decision.service.ts

  // 1. Проверка условия входа по 15m и 1h
  async shouldOpenPosition(
    symbolId: string,
    tf: '15m' | '1h',
  ): Promise<{ direction: 'long' | 'short'; price: number } | null> {
    const timeframeId =
      tf === '15m'
        ? TradingConfig.timeframes.TF_15M
        : TradingConfig.timeframes.TF_1H;
    const trend1d = await this.confirmationsService.getDominantDirection(
      symbolId,
      TradingConfig.timeframes.TF_1D,
    );
    const trend4h = await this.confirmationsService.getDominantDirection(
      symbolId,
      TradingConfig.timeframes.TF_4H,
    );

    if (!trend1d || !trend4h || trend1d !== trend4h) return null;
    const direction = trend1d;

    const hasPosition = await this.positionsService.findPosition(
      symbolId,
      direction,
    );
    if (hasPosition) return null;

    const confirmations =
      await this.confirmationsService.getRecentConfirmations({
        symbolId,
        timeframeId,
        direction,
        ttlMinutes: tf === '15m' ? 30 : 180,
      });
    if (confirmations.length >= 4) {
      return { direction, price: confirmations[0].price };
    }
    return null;
  }

  // 2. Проверка Strong Entry (на 15m и 1h)
  async checkStrongEntry(
    symbolId: string,
  ): Promise<{ direction: 'long' | 'short'; price: number } | null> {
    for (const tf of ['15m', '1h'] as const) {
      const timeframeId =
        tf === '15m'
          ? TradingConfig.timeframes.TF_15M
          : TradingConfig.timeframes.TF_1H;
      const trend1d = await this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_1D,
      );
      const trend4h = await this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_4H,
      );

      if (!trend1d || !trend4h || trend1d !== trend4h) continue;
      const confirmations =
        await this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId,
          timeframeId,
        });
      const strong = confirmations.find(
        (c) =>
          c.type.name ===
          (trend1d === 'long' ? 'Strong Long Entry' : 'Strong Short Entry'),
      );
      if (strong) {
        const hasPosition = await this.positionsService.findPosition(
          symbolId,
          trend1d,
        );
        if (!hasPosition) {
          return { direction: trend1d, price: strong.price };
        }
      }
    }
    return null;
  }

  // 3. Попытка открыть позицию (универсально)
  async tryOpenPosition(symbolId: string) {
    const strong = await this.checkStrongEntry(symbolId);
    if (strong) {
      await this.openPosition(
        symbolId,
        strong.direction,
        strong.price,
        'Strong Entry',
      );
      return;
    }
    for (const tf of ['15m', '1h'] as const) {
      const res = await this.shouldOpenPosition(symbolId, tf);
      if (res) {
        await this.openPosition(
          symbolId,
          res.direction,
          res.price,
          `≥4 подтверждений (${tf})`,
        );
        return;
      }
    }
  }

  // 4. Вынесено открытие позиции
  async openPosition(
    symbolId: string,
    direction: 'long' | 'short',
    price: number,
    reason: string,
  ) {
    const symbolName =
      await this.confirmationsService.getSymbolNameById(symbolId);
    await this.positionsService.enterPosition({
      symbolId,
      direction,
      price,
      reason,
    });
    await this.telegramService.sendMessage(
      `📥 Открыта позиция по ${symbolName}: ${direction.toUpperCase()} @ ${price}\nПричина: ${reason}`,
    );
  }

  // 5. Проверка условия выхода
  async shouldClosePosition(
    symbolId: string,
    direction: 'long' | 'short',
    tf: '15m' | '1h',
  ): Promise<boolean> {
    const timeframeId =
      tf === '15m'
        ? TradingConfig.timeframes.TF_15M
        : TradingConfig.timeframes.TF_1H;
    const confirms = await this.confirmationsService.getRecentConfirmations({
      symbolId,
      timeframeId,
      direction,
      ttlMinutes: tf === '15m' ? 30 : 180,
    });
    if (confirms.length < 4) return true;
    const trend1d = await this.confirmationsService.getDominantDirection(
      symbolId,
      TradingConfig.timeframes.TF_1D,
    );
    const trend4h = await this.confirmationsService.getDominantDirection(
      symbolId,
      TradingConfig.timeframes.TF_4H,
    );
    if (!trend1d || !trend4h || trend1d !== direction || trend4h !== direction)
      return true;
    return false;
  }

  // 6. Попытка закрыть позицию
  async tryClosePosition(symbolId: string) {
    const position = await this.positionsService.getActivePosition(symbolId);
    if (!position) return;

    const direction = position.direction.name as 'long' | 'short';

    // --- Если позиция по Strong Entry:
    if (position.entry_type === 'strong') {
      // Проверяем, есть ли Strong Entry в подтверждениях 15m или 1h
      const confirms15m =
        await this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId,
          timeframeId: TradingConfig.timeframes.TF_15M,
        });
      const confirms1h =
        await this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId,
          timeframeId: TradingConfig.timeframes.TF_1H,
        });

      const strongTypeName =
        direction === 'long' ? 'Strong Long Entry' : 'Strong Short Entry';

      const strongExists =
        confirms15m.some((c) => c.type.name === strongTypeName) ||
        confirms1h.some((c) => c.type.name === strongTypeName);

      // Закрываем если Strong Entry исчез
      if (!strongExists) {
        await this.positionsService.exitPosition({
          symbolId,
          direction,
          price: position.entry_price,
          reason: 'strong_entry_disappeared',
        });
        await this.telegramService.sendMessage(
          `📤 Закрыта позиция по ${position.symbol.name}: ${direction.toUpperCase()} @ ${position.entry_price}\nПричина: Strong Entry исчез`,
        );
        return;
      }

      // Если тренд изменился — тоже закрываем
      const trend1d = await this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_1D,
      );
      const trend4h = await this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_4H,
      );

      if (trend1d !== direction || trend4h !== direction) {
        await this.positionsService.exitPosition({
          symbolId,
          direction,
          price: position.entry_price,
          reason: 'trend_changed',
        });
        await this.telegramService.sendMessage(
          `📤 Закрыта позиция по ${position.symbol.name}: ${direction.toUpperCase()} @ ${position.entry_price}\nПричина: тренд изменился`,
        );
        return;
      }
      // Не закрываем по другим причинам!
      return;
    }

    // --- Для обычных позиций (confirmations):
    // Проверяем количество подтверждений на 15m и 1h
    const confirms15m = await this.confirmationsService.getRecentConfirmations({
      symbolId,
      timeframeId: TradingConfig.timeframes.TF_15M,
      direction,
      ttlMinutes: 30,
    });
    const confirms1h = await this.confirmationsService.getRecentConfirmations({
      symbolId,
      timeframeId: TradingConfig.timeframes.TF_1H,
      direction,
      ttlMinutes: 180,
    });

    // Если подтверждений стало <4 на любом таймфрейме — закрываем
    if (confirms15m.length < 4 || confirms1h.length < 4) {
      await this.positionsService.exitPosition({
        symbolId,
        direction,
        price: position.entry_price,
        reason: 'less_than_4_confirmations',
      });
      await this.telegramService.sendMessage(
        `📤 Закрыта позиция по ${position.symbol.name}: ${direction.toUpperCase()} @ ${position.entry_price}\nПричина: подтверждений <4 (${confirms15m.length} на 15m, ${confirms1h.length} на 1h)`,
      );
      return;
    }

    // Если тренд изменился — закрываем
    const trend1d = await this.confirmationsService.getDominantDirection(
      symbolId,
      TradingConfig.timeframes.TF_1D,
    );
    const trend4h = await this.confirmationsService.getDominantDirection(
      symbolId,
      TradingConfig.timeframes.TF_4H,
    );

    if (trend1d !== direction || trend4h !== direction) {
      await this.positionsService.exitPosition({
        symbolId,
        direction,
        price: position.entry_price,
        reason: 'trend_changed',
      });
      await this.telegramService.sendMessage(
        `📤 Закрыта позиция по ${position.symbol.name}: ${direction.toUpperCase()} @ ${position.entry_price}\nПричина: тренд изменился`,
      );
      return;
    }
  }

  // 7. Универсальная проверка для алерта и крона
  async processAlertOrCron(symbolId: string) {
    await this.tryClosePosition(symbolId);
    await this.tryOpenPosition(symbolId);
  }
}
