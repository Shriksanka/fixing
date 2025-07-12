import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TelegramService {
  private readonly botToken: string;
  private readonly chatId: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.getOrThrow('TELEGRAM_BOT_TOKEN');
    this.chatId = this.configService.getOrThrow('TELEGRAM_CHAT_ID');
  }

  async sendMessage(message: string) {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    await axios.post(url, {
      chat_id: this.chatId,
      text: message,
    });
  }
}
