import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '@flooring/db';
import type {
  CreateProjectDto,
  ProjectSummary,
  UpdateProjectDto,
} from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/jwt.strategy';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedRequestUser): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return projects.map(toSummary);
  }

  async getById(user: AuthenticatedRequestUser, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
      });
    }
    this.assertOrgAccess(user, project.organizationId);
    return project;
  }

  async create(user: AuthenticatedRequestUser, dto: CreateProjectDto): Promise<ProjectSummary> {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        clientName: dto.clientName,
        siteAddress: dto.siteAddress,
        status: 'DRAFT',
        organizationId: user.organizationId,
        createdById: user.id,
      },
    });
    return toSummary(project);
  }

  async update(
    user: AuthenticatedRequestUser,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectSummary> {
    await this.getById(user, id); // org check + existence
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.clientName !== undefined && { clientName: dto.clientName }),
        ...(dto.siteAddress !== undefined && { siteAddress: dto.siteAddress }),
      },
    });
    return toSummary(updated);
  }

  async softDelete(user: AuthenticatedRequestUser, id: string): Promise<void> {
    await this.getById(user, id);
    if (user.role === 'MEMBER') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only admins and owners can delete projects',
      });
    }
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async duplicate(user: AuthenticatedRequestUser, id: string): Promise<ProjectSummary> {
    const source = await this.getById(user, id);
    const copy = await this.prisma.project.create({
      data: {
        name: `${source.name} (copy)`,
        description: source.description,
        clientName: source.clientName,
        siteAddress: source.siteAddress,
        status: 'DRAFT',
        organizationId: user.organizationId,
        createdById: user.id,
      },
    });

    // Copy parameter selection if any
    const selection = await this.prisma.parameterSelection.findUnique({
      where: { projectId: source.id },
    });
    if (selection) {
      await this.prisma.parameterSelection.create({
        data: {
          projectId: copy.id,
          selectionData: selection.selectionData as any,
          resolvedParameterIds: selection.resolvedParameterIds,
        },
      });
    }
    return toSummary(copy);
  }

  async archive(user: AuthenticatedRequestUser, id: string): Promise<ProjectSummary> {
    await this.getById(user, id);
    const updated = await this.prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    return toSummary(updated);
  }

  private assertOrgAccess(user: AuthenticatedRequestUser, projectOrgId: string): void {
    if (projectOrgId !== user.organizationId) {
      // Don't differentiate between "not found" and "no access" — avoid leaking project existence
      throw new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
      });
    }
  }
}

function toSummary(p: Project): ProjectSummary {
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
