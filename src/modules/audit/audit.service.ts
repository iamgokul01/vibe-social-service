import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export interface AuditEntry {
  actorId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.auditRepository.save(
      this.auditRepository.create({
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        meta: entry.meta ?? null,
        ip: entry.ip ?? null,
      }),
    );
  }
}
