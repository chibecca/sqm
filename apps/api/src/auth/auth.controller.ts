import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import {
  LoginRequest,
  LoginRequestSchema,
  LoginResponse,
  RegisterRequest,
  RegisterRequestSchema,
  AuthUser,
} from '@flooring/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import type { AuthenticatedRequestUser } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterRequestSchema))
  register(@Body() dto: RegisterRequest): Promise<LoginResponse> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginRequestSchema))
  login(@Body() dto: LoginRequest): Promise<LoginResponse> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedRequestUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }
}
