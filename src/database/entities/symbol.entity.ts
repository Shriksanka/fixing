import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Confirmation } from './confirmation.entity';
import { Position } from './position.entity';

@Entity('symbols')
export class Symbol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Confirmation, (c) => c.symbol)
  confirmations: Confirmation[];

  @OneToMany(() => Position, (p) => p.symbol)
  positions: Position[];
}
