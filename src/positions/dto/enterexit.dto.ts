import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class EnterExitDto {
  @IsString()
  @IsNotEmpty()
  symbolId: string;

  @IsString()
  @IsNotEmpty()
  direction: string;

  @IsNumber()
  @IsNotEmpty()
  price: number;

  @IsString()
  reason: string;
}
