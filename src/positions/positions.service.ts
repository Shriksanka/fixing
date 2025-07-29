import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position } from '../database/entities/position.entity';
import { Symbol } from '../database/entities/symbol.entity';
import { HttpService } from '@nestjs/axios';
import { retry, catchError } from 'rxjs/operators';
import { firstValueFrom, timer } from 'rxjs';
import { TradingConfig } from '../decision/trading.config';
import { EnterExitDto } from './dto/enterexit.dto';

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(Symbol)
    private readonly symbolRepo: Repository<Symbol>,
    private readonly http: HttpService,
  ) {}

  private BASE_URL = 'http://localhost:3100';
  private readonly retryAttempts = TradingConfig.retry.attempts;
  private readonly retryDelay = TradingConfig.retry.delayMs;

  private postWithRetry(path: string, body: any) {
    return firstValueFrom(
      this.http.post(`${this.BASE_URL}${path}`, body).pipe(
        retry({
          count: this.retryAttempts,
          delay: () => timer(this.retryDelay),
        }),
        catchError((err) => {
          throw new HttpException(err.message, 500);
        }),
      ),
    );
  }

  async enterPosition(params: EnterExitDto) {
    try {
      await this.postWithRetry('/positions/enter', params);
      return { status: 'position_entered' };
    } catch (error) {
      console.error('enterPosition failed', params, error);
      return { status: 'error' };
    }
  }

  async exitPosition(params: EnterExitDto) {
    try {
      await this.postWithRetry('/positions/exit', params);
      return { status: 'position_exited' };
    } catch (error) {
      console.error('exitPosition failed', params, error);
      return { status: 'error' };
    }
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

    if (!symbol) return symbolId;
    return symbol.name;
  }
}
