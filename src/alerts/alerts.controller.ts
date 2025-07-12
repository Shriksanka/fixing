import { Controller, Post, Body } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';

@Controller('alert')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  handleAlert(@Body() dto: CreateAlertDto) {
    return this.alertsService.handleAlert(dto);
  }
}
