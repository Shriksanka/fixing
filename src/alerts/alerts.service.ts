import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Symbol } from '../database/entities/symbol.entity';
import { Timeframe } from '../database/entities/timeframe.entity';
import { ConfirmationType } from '../database/entities/confirmation-type.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { DecisionService } from '../decision/decision.service';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Symbol) private readonly symbolRepo: Repository<Symbol>,
    @InjectRepository(Timeframe)
    private readonly timeframeRepo: Repository<Timeframe>,
    @InjectRepository(ConfirmationType)
    private readonly typeRepo: Repository<ConfirmationType>,
    private readonly decisionService: DecisionService,
  ) {}

  async handleAlert(dto: CreateAlertDto) {
    const {
      alertName,
      symbol: symbolName,
      timeframe: timeframeName,
      price,
    } = dto;

    // тип подтверждения обязателен
    const type = await this.typeRepo.findOne({
      where: { name: alertName },
      relations: ['direction'],
    });
    if (!type) {
      throw new NotFoundException(`ConfirmationType '${alertName}' not found`);
    }

    // символ создаём при необходимости
    let symbol = await this.symbolRepo.findOne({ where: { name: symbolName } });
    if (!symbol) {
      symbol = this.symbolRepo.create({ name: symbolName });
      symbol = await this.symbolRepo.save(symbol);
    }

    // таймфрейм должен существовать
    const timeframe = await this.timeframeRepo.findOne({
      where: { name: timeframeName },
    });
    if (!timeframe) {
      throw new NotFoundException(`Timeframe '${timeframeName}' not found`);
    }

    await this.decisionService.processAlert({
      symbolId: symbol.id,
      timeframeId: timeframe.id,
      typeName: alertName,
      price,
    });
  }
}
