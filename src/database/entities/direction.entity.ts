import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ConfirmationType } from './confirmation-type.entity';
import { Confirmation } from './confirmation.entity';
import { Position } from './position.entity';

@Entity('directions')
export class Direction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => ConfirmationType, (t) => t.direction)
  types: ConfirmationType[];

  @OneToMany(() => Confirmation, (c) => c.type)
  confirmations: Confirmation[];

  @OneToMany(() => Position, (p) => p.direction)
  positions: Position[];
}
