import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import { Symbol } from './symbol.entity';
import { Direction } from './direction.entity';

@Entity('positions')
export class Position {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Symbol, { eager: true })
  @JoinColumn({ name: 'symbol_id' })
  symbol: Symbol;

  @ManyToOne(() => Direction, { eager: true })
  @JoinColumn({ name: 'direction_id' })
  direction: Direction;

  @Column({ type: 'float' })
  amount: number;

  @Column({ type: 'float' })
  entry_price: number;

  @CreateDateColumn()
  opened_at: Date;

  @UpdateDateColumn()
  last_updated: Date;
}
