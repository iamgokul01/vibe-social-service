import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { RefreshToken } from '../../database/entities/refresh-token.entity';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
}

export interface RefreshTokenContext {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(payload: { sub: number; role: string; email: string }): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>(
        'jwt.expiresIn',
      ) as JwtSignOptions['expiresIn'],
    });
  }

  createRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  buildRefreshTokenExpiry(): Date {
    const ttl = this.configService.get<number>('jwt.refreshTtlMs') ?? 604800000;
    return new Date(Date.now() + ttl);
  }

  isRefreshTokenValid(token: RefreshToken): boolean {
    if (!token) return false;
    if (token.revokedAt) return false;
    return token.expiresAt.getTime() > Date.now();
  }

  async verifyAccessToken(
    token: string,
  ): Promise<{ sub: number; role: string; email: string }> {
    try {
      return await this.jwtService.verifyAsync<{
        sub: number;
        role: string;
        email: string;
      }>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }
  }
}
