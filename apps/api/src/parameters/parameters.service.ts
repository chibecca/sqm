import { Injectable } from '@nestjs/common';
import type {
  EnvironmentalOption,
  ParameterTree,
  SubstrateOption,
} from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';

/**
 * Reshapes the flat `parameters` table into the hierarchical tree the
 * UI uses to render the parameter selector.
 *
 * The Excel taxonomy is a tree, but storage is flat (one row per matrix
 * column). This service is the only place that knows the shape mapping.
 */
@Injectable()
export class ParametersService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<ParameterTree> {
    const params = await this.prisma.parameter.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    const env: ParameterTree['environmental'] = {
      mechanicalLoad: [],
      potLife: [],
      temperature: [],
      humidity: [],
    };
    const substrates: SubstrateOption[] = [];

    for (const p of params) {
      if (p.domain === 'environmental') {
        const opt: EnvironmentalOption = {
          parameterId: p.id,
          valueKey: p.valueKey,
          valueLabel: p.valueLabel,
          // The enum value is the part of value_key after the dot: 'mechanical_load.low' -> 'low'
          enumValue: p.valueKey.split('.').slice(1).join('.'),
        };
        switch (p.category) {
          case 'mechanical_load':
            env.mechanicalLoad.push(opt);
            break;
          case 'pot_life':
            env.potLife.push(opt);
            break;
          case 'temperature':
            env.temperature.push(opt);
            break;
          case 'humidity':
            env.humidity.push(opt);
            break;
          default:
            // Unknown env category — ignore, log if needed
            break;
        }
      } else if (p.domain === 'substrate') {
        // value_key shape: 'substrate.<type>[.<texture>].<contamination>.<preparation>'
        const parts = p.valueKey.split('.');
        // parts[0] == 'substrate'
        const substrateType = parts[1] ?? '';
        substrates.push({
          parameterId: p.id,
          valueKey: p.valueKey,
          substrateType,
          surfaceTexture: p.subcategory,
          contamination: p.contamination ?? 'none',
          preparationMethod: p.preparationMethod ?? '',
          valueLabel: p.valueLabel,
        });
      }
      // material_property domain is not exposed in the wizard for now
    }

    return { environmental: env, substrates };
  }
}
