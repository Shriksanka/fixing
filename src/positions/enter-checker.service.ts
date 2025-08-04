import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfirmationsService } from '../confirmations/confirmations.service';
import { PositionsService } from '../positions/positions.service';
import { TelegramService } from '../telegram/telegram.service';
import { TradingConfig } from '../decision/trading.config';

@Injectable()
export class EntryCheckerService {
  private readonly logger = new Logger(EntryCheckerService.name);

  constructor(
    private readonly confirmationsService: ConfirmationsService,
    private readonly positionsService: PositionsService,
    private readonly telegramService: TelegramService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkEntries() {
    const symbols = await this.confirmationsService.getAllSymbols();
    for (const symbol of symbols) {
      const symbolId = symbol.id;
      const symbolName = symbol.name;

      this.logger.log('🔁 Проверка условий входа...');

      const trend4h = await this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_4H,
      );
      const trend1d = await this.confirmationsService.getDominantDirection(
        symbolId,
        TradingConfig.timeframes.TF_1D,
      );

      if (!trend4h || !trend1d || trend4h !== trend1d) continue;
      const direction = trend4h;

      const hasPosition = await this.positionsService.findPosition(
        symbolId,
        direction,
      );
      if (hasPosition) continue;

      const confirmations15m =
        await this.confirmationsService.getRecentConfirmations({
          symbolId,
          timeframeId: TradingConfig.timeframes.TF_15M,
          direction,
          ttlMinutes: 30,
        });

      const confirmations1h =
        await this.confirmationsService.getRecentConfirmations({
          symbolId,
          timeframeId: TradingConfig.timeframes.TF_1H,
          direction,
          ttlMinutes: 180,
        });

      if (confirmations15m.length >= 3 || confirmations1h.length >= 3) {
        const latest = [...confirmations15m, ...confirmations1h].sort(
          (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
        )[0];
        const price = latest?.price || 0;

        const result = await this.positionsService.enterPosition({
          symbolId,
          direction,
          price,
          reason: `auto_cron_${confirmations15m.length >= 3 ? '15m' : '1h'}`,
        });

        if (result?.status === 'position_entered') {
          await this.telegramService.sendMessage(
            `📥 Автовход в позицию ${direction.toUpperCase()} по ${symbolName} @ ${price}\n🕒 Причина: тренд совпадает (1D+4H) и ≥3 подтверждения на ${
              confirmations15m.length >= 3 ? '15M' : '1H'
            }`,
          );
        }
      }
    }
  }
}
