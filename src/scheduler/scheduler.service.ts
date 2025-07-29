import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Symbol } from '../database/entities/symbol.entity';
import { Timeframe } from '../database/entities/timeframe.entity';
import { Direction } from '../database/entities/direction.entity';
import { Confirmation } from '../database/entities/confirmation.entity';
import { ConfirmationsService } from '../confirmations/confirmations.service';
import { TelegramService } from '../telegram/telegram.service';
import { PositionsService } from '../positions/positions.service';
import { TradingConfig } from '../decision/trading.config';

@Injectable()
export class SchedulerService {
  constructor(
    @InjectRepository(Symbol)
    private readonly symbolRepo: Repository<Symbol>,
    @InjectRepository(Timeframe)
    private readonly timeframeRepo: Repository<Timeframe>,
    private readonly confirmationsService: ConfirmationsService,
    private readonly telegramService: TelegramService,
    private readonly positionsService: PositionsService,
  ) {}

  @Cron('0 * * * *') // каждый час
  async sendHourlyOverview() {
    const symbols = await this.symbolRepo.find();

    for (const symbol of symbols) {
      const [tf1h, tf15m, tf4h, tf1d] = await Promise.all([
        this.timeframeRepo.findOne({
          where: { id: TradingConfig.timeframes.TF_1H },
        }),
        this.timeframeRepo.findOne({
          where: { id: TradingConfig.timeframes.TF_15M },
        }),
        this.timeframeRepo.findOne({
          where: { id: TradingConfig.timeframes.TF_4H },
        }),
        this.timeframeRepo.findOne({
          where: { id: TradingConfig.timeframes.TF_1D },
        }),
      ]);

      const [c1h, c15m, trend4h, trend1d, position] = await Promise.all([
        this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId: symbol.id,
          timeframeId: tf1h!.id,
        }),
        this.confirmationsService.getConfirmationsWithTypesAndDirections({
          symbolId: symbol.id,
          timeframeId: tf15m!.id,
        }),
        this.confirmationsService.getDominantDirection(symbol.id, tf4h!.id),
        this.confirmationsService.getDominantDirection(symbol.id, tf1d!.id),
        this.positionsService.getActivePosition(symbol.id),
      ]);

      const formatList = (confirmations: any[]) => {
        const grouped: Record<string, string[]> = { long: [], short: [] };
        for (const c of confirmations) {
          const dir = c.type.direction.name;
          grouped[dir]?.push(c.type.name);
        }
        return {
          long: grouped.long.join(', ') || '—',
          short: grouped.short.join(', ') || '—',
        };
      };

      const c1hFmt = formatList(c1h);
      const c15mFmt = formatList(c15m);

      let msg = `📊 Обзор по ${symbol.name}\n`;
      msg += `— Тренд 1D: ${trend1d ?? 'neutral'}\n`;
      msg += `— Тренд 4H: ${trend4h ?? 'neutral'}\n`;
      msg += `— Подтверждения 1H:\n  🟩 Long: ${c1hFmt.long}\n  🟥 Short: ${c1hFmt.short}\n`;
      msg += `— Подтверждения 15M:\n  🟩 Long: ${c15mFmt.long}\n  🟥 Short: ${c15mFmt.short}\n`;

      if (position) {
        msg += `— Открыта позиция: ${position.direction.name.toUpperCase()} @ ${position.entry_price}`;
      }

      await this.telegramService.sendMessage(msg);
    }
  }
}
