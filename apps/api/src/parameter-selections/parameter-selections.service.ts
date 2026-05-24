import { Injectable, NotFoundException } from '@nestjs/common';
import type { ParameterSelection } from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';
import { ParameterResolverService } from '../recommendations/parameter-resolver.service';
import { ProjectsService } from '../projects/projects.service';
import type { AuthenticatedRequestUser } from '../auth/jwt.strategy';

@Injectable()
export class ParameterSelectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ParameterResolverService,
    private readonly projects: ProjectsService,
  ) {}

  async get(
    user: AuthenticatedRequestUser,
    projectId: string,
  ): Promise<{ selection: ParameterSelection | null; resolvedParameterIds: number[] }> {
    await this.projects.getById(user, projectId); // org access check
    const record = await this.prisma.parameterSelection.findUnique({
      where: { projectId },
    });
    if (!record) return { selection: null, resolvedParameterIds: [] };
    return {
      selection: record.selectionData as unknown as ParameterSelection,
      resolvedParameterIds: record.resolvedParameterIds,
    };
  }

  /**
   * Upsert the project's parameter selection. Always re-resolves the
   * cached parameter IDs so the rule engine can use them directly.
   */
  async upsert(
    user: AuthenticatedRequestUser,
    projectId: string,
    selection: ParameterSelection,
  ): Promise<{ resolvedParameterIds: number[] }> {
    await this.projects.getById(user, projectId);

    // resolve() throws NotFoundException if any value_key is missing
    const resolvedIds = this.resolver.resolve(selection);

    await this.prisma.parameterSelection.upsert({
      where: { projectId },
      create: {
        projectId,
        selectionData: selection as unknown as object,
        resolvedParameterIds: resolvedIds,
      },
      update: {
        selectionData: selection as unknown as object,
        resolvedParameterIds: resolvedIds,
        selectedAt: new Date(),
      },
    });

    return { resolvedParameterIds: resolvedIds };
  }

  async clear(user: AuthenticatedRequestUser, projectId: string): Promise<void> {
    await this.projects.getById(user, projectId);
    await this.prisma.parameterSelection
      .delete({ where: { projectId } })
      .catch((e: { code?: string }) => {
        // Don't error if it doesn't exist
        if (e.code !== 'P2025') throw e;
      });
  }
}
