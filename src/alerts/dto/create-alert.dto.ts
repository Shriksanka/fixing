import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateAlertDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsString()
  @IsNotEmpty()
  alertName: string;

  @IsString()
  @IsNotEmpty()
  timeframe: string;

  @IsString()
  price: string;
}
