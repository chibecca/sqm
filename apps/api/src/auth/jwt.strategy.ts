import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../config/configuration';

export interface JwtPayload {
  sub: string;            // user id (UUID)
  email: string;
  orgId: string;          // organization id
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  // The returned object is attached to req.user
  async validate(payload: JwtPayload): Promise<AuthenticatedRequestUser> {
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.orgId,
      role: payload.role,
    };
  }
}
