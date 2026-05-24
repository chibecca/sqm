import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from './jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedRequestUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedRequestUser }>();
    return req.user;
  },
);
