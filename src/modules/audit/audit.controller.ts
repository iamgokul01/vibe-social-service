import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginate } from '../../common/utils/pagination';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../rbac/roles';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(
    @InjectRepository(AuditLog) private readonly auditRepository: Repository<AuditLog>,
  ) {}

  @Get()
  @Permissions(Permission.USERS_READ)
  @ApiOperation({ summary: 'Recent security audit entries' })
  async list(@Query() query: PaginationDto & { action?: string }) {
    const [items, total] = await this.auditRepository.findAndCount({
      where: query.action ? { action: query.action } : {},
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
      relations: { actor: true },
    });

    return paginate(items, total, query.page, query.limit);
  }
}
