import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ParameterSelection,
  ParameterSelectionSchema,
} from '@flooring/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/jwt.strategy';
import { ParameterSelectionsService } from './parameter-selections.service';

@Controller('projects/:projectId/parameters')
export class ParameterSelectionsController {
  constructor(private readonly service: ParameterSelectionsService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.service.get(user, projectId);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodValidationPipe(ParameterSelectionSchema)) selection: ParameterSelection,
  ) {
    return this.service.upsert(user, projectId, selection);
  }

  @Delete()
  @HttpCode(204)
  async clear(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<void> {
    await this.service.clear(user, projectId);
  }
}
