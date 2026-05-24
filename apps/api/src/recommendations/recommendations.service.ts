import { Injectable } from '@nestjs/common';
import { Prisma } from '@flooring/db';
import type {
  ParameterSelection,
  RecommendationResponse,
  RecommendedGroup,
  RecommendedProduct,
} from '@flooring/validation';
import { PrismaService } from '../database/prisma.service';
import { ParameterResolverService } from './parameter-resolver.service';

interface CompatibleProductRow {
  product_id: number;
  product_name: string;
  price_huf: Prisma.Decimal | null;
  package_size: Prisma.Decimal | null;
  package_unit: string | null;
  is_tool_item: boolean;
  group_id: number;
  group_name: string;
  group_chemistry: string | null;
  group_application_type: string | null;
  group_sort_order: number;
  product_row_order: number;
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ParameterResolverService,
  ) {}

  /**
   * Core rule engine query.
   *
   * Returns every product whose compatibility row count for the selected
   * parameter IDs equals the total number of selected parameters
   * (= strict AND across all selected dimensions, per clarifications #4 and #6).
   *
   * Products with NO compatibility data (e.g. catalog tail) are excluded
   * automatically since they have no rows in `compatibility` and therefore
   * cannot satisfy HAVING COUNT = N for any N > 0.
   */
  async recommend(selection: ParameterSelection): Promise<RecommendationResponse> {
    const paramIds = this.resolver.resolve(selection);
    const n = paramIds.length;

    // Edge case: an empty parameter set would match every product with compat — refuse.
    if (n === 0) {
      return {
        groups: [],
        totalCompatibleProducts: 0,
        selectedParameterCount: 0,
        resolvedParameterIds: [],
      };
    }

    const rows = await this.prisma.$queryRaw<CompatibleProductRow[]>(
      Prisma.sql`
        SELECT
          pr.id              AS product_id,
          pr.name            AS product_name,
          pr.price_huf       AS price_huf,
          pr.package_size    AS package_size,
          pr.package_unit    AS package_unit,
          pr.is_tool_item    AS is_tool_item,
          pg.id              AS group_id,
          pg.name            AS group_name,
          pg.chemistry       AS group_chemistry,
          pg.application_type AS group_application_type,
          pg.sort_order      AS group_sort_order,
          pr.row_order       AS product_row_order
        FROM products pr
        JOIN product_groups pg ON pg.id = pr.group_id
        WHERE pr.is_active = TRUE
          AND pr.id IN (
            SELECT product_id
            FROM compatibility
            WHERE parameter_id IN (${Prisma.join(paramIds)})
            GROUP BY product_id
            HAVING COUNT(DISTINCT parameter_id) = ${n}
          )
        ORDER BY pg.sort_order ASC, pr.row_order ASC
      `,
    );

    return {
      groups: groupRows(rows),
      totalCompatibleProducts: rows.length,
      selectedParameterCount: n,
      resolvedParameterIds: paramIds,
    };
  }

  /**
   * Lightweight count-only variant for the live "X products compatible"
   * indicator during parameter selection. Cheaper because it skips the
   * group join and projection.
   */
  async countCompatible(selection: ParameterSelection): Promise<number> {
    const paramIds = this.resolver.resolve(selection);
    const n = paramIds.length;
    if (n === 0) return 0;

    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT product_id FROM compatibility
          WHERE parameter_id IN (${Prisma.join(paramIds)})
          GROUP BY product_id
          HAVING COUNT(DISTINCT parameter_id) = ${n}
        ) AS t
      `,
    );
    return Number(result[0]?.count ?? 0n);
  }
}

/**
 * Group flat product rows by their ProductGroup, preserving the order
 * established by the SQL ORDER BY (group sort_order, then product row_order).
 */
function groupRows(rows: CompatibleProductRow[]): RecommendedGroup[] {
  const groupMap = new Map<number, RecommendedGroup>();
  for (const row of rows) {
    let group = groupMap.get(row.group_id);
    if (!group) {
      group = {
        id: row.group_id,
        name: row.group_name,
        chemistry: row.group_chemistry,
        applicationType: row.group_application_type,
        products: [],
      };
      groupMap.set(row.group_id, group);
    }
    const product: RecommendedProduct = {
      id: row.product_id,
      name: row.product_name,
      priceHuf: row.price_huf ? Number(row.price_huf) : null,
      packageSize: row.package_size ? Number(row.package_size) : null,
      packageUnit: row.package_unit,
      isToolItem: row.is_tool_item,
    };
    group.products.push(product);
  }
  return Array.from(groupMap.values());
}
