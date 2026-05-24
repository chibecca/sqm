import { Test } from '@nestjs/testing';
import { Prisma } from '@flooring/db';
import type { ParameterSelection } from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';
import { ParameterResolverService } from './parameter-resolver.service';
import { RecommendationsService } from './recommendations.service';

/**
 * Tests the SQL contract of the rule engine.
 *
 * The actual AND-counting logic lives in PostgreSQL (`HAVING COUNT(DISTINCT
 * parameter_id) = N`); these tests verify that the service builds the right
 * query parameters and shapes the rows back into the expected response.
 *
 * For a true end-to-end test against a real database, see test/e2e/.
 */
describe('RecommendationsService', () => {
  const fakeParameters = [
    { id: 2, valueKey: 'mechanical_load.medium' },
    { id: 5, valueKey: 'pot_life.open' },
    { id: 9, valueKey: 'temperature.5_30' },
    { id: 11, valueKey: 'humidity.20_40' },
    { id: 20, valueKey: 'substrate.concrete.none.grinding' },
  ];

  let service: RecommendationsService;
  let mockQueryRaw: jest.Mock;

  beforeEach(async () => {
    mockQueryRaw = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        ParameterResolverService,
        {
          provide: PrismaService,
          useValue: {
            parameter: { findMany: jest.fn().mockResolvedValue(fakeParameters) },
            $queryRaw: mockQueryRaw,
          },
        },
      ],
    }).compile();

    service = module.get(RecommendationsService);
    const resolver = module.get(ParameterResolverService);
    await resolver.onModuleInit();
  });

  const validSelection: ParameterSelection = {
    mechanicalLoads: ['medium'],
    potLifeCategories: ['open'],
    temperatureRanges: ['5_30'],
    humidityRanges: ['20_40'],
    substrateConfigs: [
      { substrateType: 'concrete', contamination: 'none', preparationMethod: 'grinding' },
    ],
  };

  it('groups results by ProductGroup preserving order', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        product_id: 100, product_name: 'StoPox GH 205, 25 kg',
        price_huf: new Prisma.Decimal('12400'),
        package_size: new Prisma.Decimal('25'), package_unit: 'kg',
        is_tool_item: false,
        group_id: 13, group_name: 'Normál alapozó',
        group_chemistry: null, group_application_type: 'primer',
        group_sort_order: 12, product_row_order: 1,
      },
      {
        product_id: 101, product_name: 'StoQuarz, 25 kg',
        price_huf: new Prisma.Decimal('4500'),
        package_size: new Prisma.Decimal('25'), package_unit: 'kg',
        is_tool_item: false,
        group_id: 13, group_name: 'Normál alapozó',
        group_chemistry: null, group_application_type: 'primer',
        group_sort_order: 12, product_row_order: 2,
      },
      {
        product_id: 200, product_name: 'StoPox BB OS, 40 kg, PG 11',
        price_huf: new Prisma.Decimal('30000'),
        package_size: new Prisma.Decimal('40'), package_unit: 'kg',
        is_tool_item: false,
        group_id: 28, group_name: 'EP Fedőbevonatok',
        group_chemistry: 'EP', group_application_type: 'topcoat',
        group_sort_order: 27, product_row_order: 1,
      },
    ]);

    const result = await service.recommend(validSelection);

    expect(result.totalCompatibleProducts).toBe(3);
    expect(result.selectedParameterCount).toBe(5);
    expect(result.resolvedParameterIds).toEqual([2, 5, 9, 11, 20]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({
      id: 13,
      name: 'Normál alapozó',
      applicationType: 'primer',
    });
    expect(result.groups[0]?.products).toHaveLength(2);
    expect(result.groups[1]).toMatchObject({
      id: 28,
      name: 'EP Fedőbevonatok',
      chemistry: 'EP',
    });
  });

  it('returns empty groups when no products match', async () => {
    mockQueryRaw.mockResolvedValue([]);
    const result = await service.recommend(validSelection);
    expect(result.groups).toEqual([]);
    expect(result.totalCompatibleProducts).toBe(0);
    expect(result.selectedParameterCount).toBe(5);
  });

  it('passes the resolved parameter IDs and count N to the SQL query', async () => {
    mockQueryRaw.mockResolvedValue([]);
    await service.recommend(validSelection);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    const sqlArg = mockQueryRaw.mock.calls[0]?.[0];
    // Prisma.sql produces a Sql object containing the literal strings and the
    // interpolated values. With Prisma.join(ids), each id becomes an
    // individual parameter. The final value is the count N.
    expect(sqlArg.values).toContain(2);
    expect(sqlArg.values).toContain(5);
    expect(sqlArg.values).toContain(9);
    expect(sqlArg.values).toContain(11);
    expect(sqlArg.values).toContain(20);
    // Last bound parameter is the count
    expect(sqlArg.values[sqlArg.values.length - 1]).toBe(5);
  });

  it('converts Prisma Decimal to plain number in the response', async () => {
    mockQueryRaw.mockResolvedValue([
      {
        product_id: 100, product_name: 'X',
        price_huf: new Prisma.Decimal('12400.55'),
        package_size: new Prisma.Decimal('25.5'), package_unit: 'kg',
        is_tool_item: false,
        group_id: 1, group_name: 'G', group_chemistry: null,
        group_application_type: null, group_sort_order: 0, product_row_order: 1,
      },
    ]);
    const result = await service.recommend(validSelection);
    expect(result.groups[0]?.products[0]?.priceHuf).toBe(12400.55);
    expect(result.groups[0]?.products[0]?.packageSize).toBe(25.5);
  });

  it('countCompatible returns the integer count from the count-only query', async () => {
    mockQueryRaw.mockResolvedValue([{ count: 66n }]);
    const count = await service.countCompatible(validSelection);
    expect(count).toBe(66);
  });

  it('countCompatible returns 0 for an empty selection (would otherwise match everything)', async () => {
    // Build a selection that resolves to zero IDs by mocking the resolver
    const result = await service.countCompatible({
      mechanicalLoads: [],
      potLifeCategories: [],
      temperatureRanges: [],
      humidityRanges: [],
      substrateConfigs: [],
      // Zod would reject this, but the service must defend against it too
    } as unknown as ParameterSelection);
    expect(result).toBe(0);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
