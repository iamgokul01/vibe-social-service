import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export const AuditAction = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_DELETED: 'USER_DELETED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  POST_CREATED: 'POST_CREATED',
  POST_UPDATED: 'POST_UPDATED',
  POST_DELETED: 'POST_DELETED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

@Entity('audit_logs')
@Index('IDX_audit_logs_action', ['action'])
@Index('IDX_audit_logs_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'actor_id', type: 'int', nullable: true })
  actorId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Column({ length: 80 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 40, nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'int', nullable: true })
  targetId: number | null;

  @Column({ type: 'simple-json', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
