import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { ParameterSelection, SubstrateConfig } from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';

/**
 * Resolves a user's ParameterSelection (enum values) to the concrete
 * parameter_id integers needed by the rule engine SQL query.
 *
 * Caches the value_key → id mapping at startup. Total parameter count is
 * ~121, so the entire mapping fits in memory trivially.
 */
@Injectable()
export class ParameterResolverService implements OnModuleInit {
  private readonly logger = new Logger(ParameterResolverService.name);
  private keyToId = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    const params = await this.prisma.parameter.findMany({
      select: { id: true, valueKey: true },
    });
    const next = new Map<string, number>();
    for (const p of params) next.set(p.valueKey, p.id);
    this.keyToId = next;
    this.logger.log(`Parameter cache loaded: ${this.keyToId.size} entries`);
  }

  /**
   * Resolve every selection enum value to its parameter_id.
   * Throws NotFoundException if any value_key is missing in the DB.
   */
  resolve(selection: ParameterSelection): number[] {
    const ids: number[] = [];
    const missing: string[] = [];

    const lookup = (key: string): void => {
      const id = this.keyToId.get(key);
      if (id === undefined) missing.push(key);
      else ids.push(id);
    };

    for (const load of selection.mechanicalLoads) {
      lookup(`mechanical_load.${load}`);
    }
    for (const potLife of selection.potLifeCategories) {
      lookup(`pot_life.${potLife}`);
    }
    for (const temp of selection.temperatureRanges) {
      lookup(`temperature.${temp}`);
    }
    for (const humid of selection.humidityRanges) {
      lookup(`humidity.${humid}`);
    }
    for (const sub of selection.substrateConfigs) {
      lookup(this.substrateKey(sub));
    }

    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PARAMETERS_NOT_FOUND',
        message: 'One or more selected parameters do not exist in the database',
        details: { missing },
      });
    }

    // Deduplicate (a user might select the same value twice somehow)
    return Array.from(new Set(ids));
  }

  private substrateKey(s: SubstrateConfig): string {
    // value_key shape mirrors the seed: substrate.<type>[.<texture>].<contamination>.<preparation>
    const parts = ['substrate', s.substrateType];
    if (s.surfaceTexture) parts.push(s.surfaceTexture);
    parts.push(s.contamination);
    parts.push(s.preparationMethod);
    return parts.join('.');
  }
}
