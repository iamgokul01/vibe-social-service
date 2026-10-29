import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';

const REFRESH_COOKIE = 'vibesocial_refresh';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, request: Request, response: Response) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email: dto.email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'This account is pending activation. Contact an administrator.',
      );
    }

    const { accessToken, refreshToken } = await this.issueSession(user, request);
    this.setRefreshCookie(response, refreshToken);
    await this.touchLastActive(user.id);
    await this.auditService.record({
      actorId: user.id,
      action: AuditAction.USER_LOGIN,
      targetType: 'user',
      targetId: user.id,
      ip: this.extractIp(request),
    });

    return {
      accessToken,
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
      user: this.toProfile(user),
    };
  }

  async refresh(request: Request, response: Response) {
    const rawToken = this.readRefreshCookie(request);

    if (!rawToken) {
      throw new UnauthorizedException('No active session');
    }

    const tokenHash = this.tokenService.hashRefreshToken(rawToken);
    const stored = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
    });

    if (!stored || !this.tokenService.isRefreshTokenValid(stored)) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    const user = await this.usersRepository.findOne({ where: { id: stored.userId } });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active');
    }

    const issued = await this.issueSession(user, request, stored);
    this.setRefreshCookie(response, issued.refreshToken);

    return {
      accessToken: issued.accessToken,
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
      user: this.toProfile(user),
    };
  }

  async logout(request: Request, response: Response): Promise<{ revoked: boolean }> {
    const rawToken = this.readRefreshCookie(request);

    if (rawToken) {
      const tokenHash = this.tokenService.hashRefreshToken(rawToken);
      const stored = await this.refreshTokensRepository.findOne({
        where: { tokenHash },
      });

      await this.refreshTokensRepository.update(
        { tokenHash },
        { revokedAt: new Date() },
      );

      if (stored) {
        await this.auditService.record({
          actorId: stored.userId,
          action: AuditAction.USER_LOGOUT,
          targetType: 'user',
          targetId: stored.userId,
          ip: this.extractIp(request),
        });
      }
    }

    this.clearRefreshCookie(response);
    return { revoked: true };
  }

  async me(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    return this.toProfile(user);
  }

  private async issueSession(
    user: User,
    request: Request,
    replacedToken?: RefreshToken,
  ) {
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    const refreshToken = this.tokenService.createRefreshToken();

    const saved = await this.refreshTokensRepository.save(
      this.refreshTokensRepository.create({
        userId: user.id,
        tokenHash: this.tokenService.hashRefreshToken(refreshToken),
        expiresAt: this.tokenService.buildRefreshTokenExpiry(),
        userAgent: request.headers['user-agent']?.slice(0, 255) ?? null,
        ip: this.extractIp(request),
      }),
    );

    if (replacedToken) {
      await this.refreshTokensRepository.update(
        { id: replacedToken.id },
        { revokedAt: new Date(), replacedBy: saved.id },
      );
    }

    return { accessToken, refreshToken };
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get<boolean>('secureCookies'),
      path: '/api/auth',
      maxAge: this.configService.get<number>('jwt.refreshTtlMs'),
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get<boolean>('secureCookies'),
      path: '/api/auth',
    });
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private extractIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim().slice(0, 64);
    }
    return (request.ip ?? '').slice(0, 64);
  }

  private async touchLastActive(userId: number): Promise<void> {
    await this.usersRepository.update(userId, { lastActiveAt: new Date() });
  }

  private toProfile(user: User) {
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
    };
  }
}
