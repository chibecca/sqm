import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { AuthUser, LoginRequest, LoginResponse, RegisterRequest } from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';
import type { AppConfig } from '../config/configuration';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async register(dto: RegisterRequest): Promise<LoginResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await argon2.hash(dto.password);

    // First user of a new organization becomes OWNER
    const result = await this.prisma.$transaction(async (tx) => {
      const slug = slugify(dto.organizationName) + '-' + randomSuffix();
      const org = await tx.organization.create({
        data: { name: dto.organizationName, slug },
      });
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          role: 'OWNER',
          organizationId: org.id,
        },
      });
      return { org, user };
    });

    return this.buildLoginResponse(
      {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        organizationId: result.org.id,
        organizationName: result.org.name,
      },
    );
  }

  async login(dto: LoginRequest): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: { organization: true },
    });

    // Same exception regardless of which check failed — don't reveal whether email exists
    const invalidCredentials = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });

    if (!user || !user.passwordHash) {
      // Run a dummy hash verify to keep response time constant — defends against
      // email-enumeration timing attacks. The verify will fail; we ignore result.
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$dummysaltdummysalt$dummyhashdummyhashdummyhashdumm',
        dto.password,
      ).catch(() => false);
      throw invalidCredentials;
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw invalidCredentials;

    return this.buildLoginResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organization.id,
      organizationName: user.organization.name,
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { organization: true },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organization.id,
      organizationName: user.organization.name,
    };
  }

  private buildLoginResponse(user: AuthUser): LoginResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      role: user.role,
    };
    const token = this.jwt.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
    return { token, user };
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
