import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../database/entities/user.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { Role, ROLE_LABELS, ROLE_ORDER } from '../rbac/roles';
import { paginate } from '../../common/utils/pagination';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListUsersDto) {
    const builder = this.usersRepository
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    if (query.search) {
      builder.andWhere(
        '(LOWER(user.fullName) LIKE :search OR LOWER(user.email) LIKE :search OR LOWER(user.handle) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    if (query.role) {
      builder.andWhere('user.role = :role', { role: query.role });
    }

    if (query.status) {
      builder.andWhere('user.status = :status', { status: query.status });
    }

    const allowedSort = ['createdAt', 'fullName', 'email', 'role', 'lastActiveAt'];
    const sortBy = query.sortBy && allowedSort.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const sortDir = query.sortDir === 'asc' ? 'ASC' : 'DESC';

    builder.orderBy(`user.${sortBy}`, sortDir);

    const [items, total] = await builder.getManyAndCount();

    return paginate(items.map((user) => this.toSummary(user)), total, query.page, query.limit);
  }

  async stats() {
    const [totalMembers, activeAdmins, contentEditors, pendingInvites, activeMembers] =
      await Promise.all([
        this.usersRepository.count(),
        this.usersRepository.count({ where: { role: Role.ADMIN } }),
        this.usersRepository.count({ where: { role: Role.EDITOR } }),
        this.usersRepository.count({ where: { status: UserStatus.PENDING } }),
        this.usersRepository.count({ where: { status: UserStatus.ACTIVE } }),
      ]);

    const healthyPercent = totalMembers
      ? Number(((activeMembers / totalMembers) * 100).toFixed(1))
      : 0;

    return {
      totalMembers,
      activeAdmins,
      contentEditors,
      pendingInvites,
      activeMembers,
      healthyPercent,
    };
  }

  async roles() {
    const counts = await this.usersRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.role')
      .getRawMany<{ role: Role; count: string }>();

    const countMap = new Map(counts.map((row) => [row.role, Number(row.count)]));

    return ROLE_ORDER.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      count: countMap.get(role) ?? 0,
      permissions: this.rbacService.getPermissionsForRole(role),
    }));
  }

  async findOne(id: number) {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Member not found');
    }

    return this.toSummary(user);
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    this.assertAssignableRole(actor, dto.role);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersRepository.findOne({ where: { email } });

    if (existing) {
      throw new BadRequestException('A member with that email already exists');
    }

    const user = this.usersRepository.create({
      fullName: dto.fullName.trim(),
      email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      handle: await this.buildHandle(email),
      role: dto.role,
      status: dto.status ?? UserStatus.PENDING,
      jobTitle: dto.jobTitle ?? null,
      division: dto.division ?? null,
      inviteSent: dto.sendInvitation ?? false,
      lastActiveAt: null,
    });

    const saved = await this.usersRepository.save(user);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_CREATED,
      targetType: 'user',
      targetId: saved.id,
      meta: { role: saved.role, status: saved.status },
    });

    return this.toSummary(saved);
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthenticatedUser) {
    const user = await this.findRaw(id);
    this.assertCanManage(actor, user);

    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle;
    if (dto.division !== undefined) user.division = dto.division;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    const saved = await this.usersRepository.save(user);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_UPDATED,
      targetType: 'user',
      targetId: saved.id,
    });

    return this.toSummary(saved);
  }

  async updateRole(id: number, dto: UpdateRoleDto, actor: AuthenticatedUser) {
    const user = await this.findRaw(id);
    this.assertCanManage(actor, user);
    this.assertAssignableRole(actor, dto.role);

    if (user.role === dto.role) {
      return this.toSummary(user);
    }

    const previousRole = user.role;
    user.role = dto.role;

    const saved = await this.usersRepository.save(user);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_ROLE_CHANGED,
      targetType: 'user',
      targetId: saved.id,
      meta: { from: previousRole, to: saved.role },
    });

    return this.toSummary(saved);
  }

  async updateStatus(id: number, dto: UpdateStatusDto, actor: AuthenticatedUser) {
    const user = await this.findRaw(id);
    this.assertCanManage(actor, user);

    if (actor.id === id && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const previousStatus = user.status;
    user.status = dto.status;

    const saved = await this.usersRepository.save(user);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_STATUS_CHANGED,
      targetType: 'user',
      targetId: saved.id,
      meta: { from: previousStatus, to: saved.status },
    });

    return this.toSummary(saved);
  }

  async revokeAccess(id: number, actor: AuthenticatedUser) {
    const user = await this.findRaw(id);
    this.assertCanManage(actor, user);

    if (actor.id === id) {
      throw new BadRequestException('You cannot revoke your own access');
    }

    user.status = UserStatus.INACTIVE;
    user.role = Role.MEMBER;

    const saved = await this.usersRepository.save(user);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.ACCESS_REVOKED,
      targetType: 'user',
      targetId: saved.id,
    });

    return this.toSummary(saved);
  }

  async remove(id: number, actor: AuthenticatedUser) {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SuperAdmin can delete member records');
    }

    const user = await this.findRaw(id);

    if (actor.id === id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.usersRepository.remove(user);

    await this.auditService.record({
      actorId: actor.id,
      action: AuditAction.USER_DELETED,
      targetType: 'user',
      targetId: id,
      meta: { email: user.email, role: user.role },
    });

    return { deleted: true };
  }

  private async findRaw(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Member not found');
    }

    return user;
  }

  private assertCanManage(actor: AuthenticatedUser, target: User): void {
    if (target.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SuperAdmin can modify this member');
    }

    if (actor.id === target.id && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot modify your own role or status');
    }
  }

  private assertAssignableRole(actor: AuthenticatedUser, role: Role): void {
    if (role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a SuperAdmin can grant the SuperAdmin role');
    }
  }

  private async buildHandle(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'member';
    let handle = base;
    let suffix = 1;

    while (await this.usersRepository.findOne({ where: { handle } })) {
      suffix += 1;
      handle = `${base}${suffix}`;
    }

    return handle;
  }

  private toSummary(user: User) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      handle: user.handle,
      role: user.role,
      status: user.status,
      jobTitle: user.jobTitle,
      division: user.division,
      avatarUrl: user.avatarUrl,
      lastActiveAt: user.lastActiveAt,
      inviteSent: user.inviteSent,
      createdAt: user.createdAt,
    };
  }
}
