import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common';
import {
  CreateProjectDto,
  CreateProjectSchema,
  ProjectSummary,
  UpdateProjectDto,
  UpdateProjectSchema,
} from '@flooring/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/jwt.strategy';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequestUser): Promise<ProjectSummary[]> {
    return this.service.list(user);
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProjectSummary> {
    const p = await this.service.getById(user, id);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      clientName: p.clientName,
      siteAddress: p.siteAddress,
      status: p.status.toLowerCase() as ProjectSummary['status'],
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateProjectSchema))
  create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectSummary> {
    return this.service.create(user, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema)) dto: UpdateProjectDto,
  ): Promise<ProjectSummary> {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.service.softDelete(user, id);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProjectSummary> {
    return this.service.duplicate(user, id);
  }

  @Post(':id/archive')
  archive(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProjectSummary> {
    return this.service.archive(user, id);
  }
}
