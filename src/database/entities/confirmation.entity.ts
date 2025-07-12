import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Column,
} from 'typeorm';
import { Symbol } from './symbol.entity';
import { Timeframe } from './timeframe.entity';
import { ConfirmationType } from './confirmation-type.entity';

@Entity('confirmations')
export class Confirmation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Symbol, { eager: true })
  @JoinColumn({ name: 'symbol_id' })
  symbol: Symbol;

  @ManyToOne(() => Timeframe, { eager: true })
  @JoinColumn({ name: 'timeframe_id' })
  timeframe: Timeframe;

  @ManyToOne(() => ConfirmationType, { eager: true })
  @JoinColumn({ name: 'type_id' })
  type: ConfirmationType;

  @Column({ type: 'float' })
  price: number;

  @CreateDateColumn()
  created_at: Date;
}
