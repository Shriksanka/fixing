import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Direction } from './direction.entity';
import { Confirmation } from './confirmation.entity';

@Entity('confirmation_types')
export class ConfirmationType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => Direction, { eager: true })
  @JoinColumn({ name: 'direction_id' })
  direction: Direction;

  @Column({ nullable: true })
  antagonist_name: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Confirmation, (c) => c.type)
  confirmations: Confirmation[];
}
