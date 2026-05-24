import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { ParameterSelection } from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';
import { ParameterResolverService } from './parameter-resolver.service';

/**
 * The resolver maps human-readable enum values to parameter IDs by looking
 * up value_keys in the `parameters` table. These tests use a stubbed Prisma
 * client so they don't require a running database.
 */
describe('ParameterResolverService', () => {
  // Mirror a representative subset of the seeded parameter table
  const fakeParameters = [
    { id: 1, valueKey: 'mechanical_load.low' },
    { id: 2, valueKey: 'mechanical_load.medium' },
    { id: 3, valueKey: 'mechanical_load.high' },
    { id: 4, valueKey: 'mechanical_load.extreme' },
    { id: 5, valueKey: 'pot_life.open' },
    { id: 8, valueKey: 'temperature.0_30' },
    { id: 9, valueKey: 'temperature.5_30' },
    { id: 10, valueKey: 'temperature.15_30' },
    { id: 11, valueKey: 'humidity.20_40' },
    { id: 20, valueKey: 'substrate.concrete.none.grinding' },
    { id: 22, valueKey: 'substrate.concrete.oily.grinding' },
    { id: 89, valueKey: 'substrate.pvc.anti_slip.oily.base_cleaning' },
  ];

  let resolver: ParameterResolverService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ParameterResolverService,
        {
          provide: PrismaService,
          useValue: {
            parameter: {
              findMany: jest.fn().mockResolvedValue(fakeParameters),
            },
          },
        },
      ],
    }).compile();

    resolver = module.get(ParameterResolverService);
    await resolver.onModuleInit(); // load cache
  });

  it('resolves a minimal valid selection to the expected parameter IDs', () => {
    const selection: ParameterSelection = {
      mechanicalLoads: ['medium'],
      potLifeCategories: ['open'],
      temperatureRanges: ['5_30'],
      humidityRanges: ['20_40'],
      substrateConfigs: [
        {
          substrateType: 'concrete',
          contamination: 'none',
          preparationMethod: 'grinding',
        },
      ],
    };
    expect(resolver.resolve(selection)).toEqual(
      expect.arrayContaining([2, 5, 9, 11, 20]),
    );
    expect(resolver.resolve(selection)).toHaveLength(5);
  });

  it('handles multi-select dimensions correctly', () => {
    const selection: ParameterSelection = {
      mechanicalLoads: ['medium', 'high'],
      potLifeCategories: ['open'],
      temperatureRanges: ['0_30', '5_30'],
      humidityRanges: ['20_40'],
      substrateConfigs: [
        {
          substrateType: 'concrete',
          contamination: 'none',
          preparationMethod: 'grinding',
        },
      ],
    };
    const ids = resolver.resolve(selection);
    expect(ids).toEqual(expect.arrayContaining([2, 3, 5, 8, 9, 11, 20]));
    expect(ids).toHaveLength(7);
  });

  it('handles multiple substrate configs (AND across substrates per clarification #6)', () => {
    const selection: ParameterSelection = {
      mechanicalLoads: ['medium'],
      potLifeCategories: ['open'],
      temperatureRanges: ['5_30'],
      humidityRanges: ['20_40'],
      substrateConfigs: [
        {
          substrateType: 'concrete',
          contamination: 'none',
          preparationMethod: 'grinding',
        },
        {
          substrateType: 'pvc',
          surfaceTexture: 'anti_slip',
          contamination: 'oily',
          preparationMethod: 'base_cleaning',
        },
      ],
    };
    const ids = resolver.resolve(selection);
    expect(ids).toContain(20); // concrete.none.grinding
    expect(ids).toContain(89); // pvc.anti_slip.oily.base_cleaning
  });

  it('builds substrate keys with texture when present', () => {
    const ids = resolver.resolve({
      mechanicalLoads: ['medium'],
      potLifeCategories: ['open'],
      temperatureRanges: ['5_30'],
      humidityRanges: ['20_40'],
      substrateConfigs: [
        {
          substrateType: 'pvc',
          surfaceTexture: 'anti_slip',
          contamination: 'oily',
          preparationMethod: 'base_cleaning',
        },
      ],
    });
    expect(ids).toContain(89);
  });

  it('throws NotFoundException when a parameter key is missing in the DB', () => {
    expect(() =>
      resolver.resolve({
        mechanicalLoads: ['low'],
        potLifeCategories: ['extra_short'], // not seeded in fakeParameters
        temperatureRanges: ['0_30'],
        humidityRanges: ['20_40'],
        substrateConfigs: [
          {
            substrateType: 'concrete',
            contamination: 'none',
            preparationMethod: 'grinding',
          },
        ],
      }),
    ).toThrow(NotFoundException);
  });

  it('deduplicates resolved IDs', () => {
    // Selecting same value twice somehow shouldn't produce duplicate IDs
    const ids = resolver.resolve({
      mechanicalLoads: ['medium', 'medium'] as ['medium', 'medium'],
      potLifeCategories: ['open'],
      temperatureRanges: ['5_30'],
      humidityRanges: ['20_40'],
      substrateConfigs: [
        {
          substrateType: 'concrete',
          contamination: 'none',
          preparationMethod: 'grinding',
        },
      ],
    });
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
