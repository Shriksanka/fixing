import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Confirmation } from './confirmation.entity';

@Entity('timeframes')
export class Timeframe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Confirmation, (c) => c.timeframe)
  confirmations: Confirmation[];
}
