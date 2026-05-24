# Flooring Platform

Industrial flooring & coating recommendation and calculation platform, built around a boolean compatibility-rule engine extracted from an existing Excel knowledge base.

## Current status — Phase 1 (Foundation) ✅

| Component | Status |
|---|---|
| Monorepo skeleton | ✅ Done |
| Prisma schema (full data model) | ✅ Done |
| Excel migration script | ✅ Done — runs cleanly, produces validated SQL/JSON |
| Database package | ✅ Skeleton ready |
| NestJS backend | 🔜 Phase 2 |
| Rule engine endpoint | 🔜 Phase 2 |
| Next.js frontend | 🔜 Phase 3 |
| Calculation engine | 🔜 Phase 3 |
| Exports | 🔜 Phase 4 |

## Repo structure

```
flooring-platform/
├── apps/
│   ├── api/                     ← NestJS backend (Phase 2)
│   └── web/                     ← Next.js frontend (Phase 3)
├── packages/
│   ├── db/                      ← Prisma schema + client
│   │   └── prisma/schema.prisma  ← Full data model (16 tables)
│   ├── validation/              ← Shared Zod schemas (Phase 2)
│   ├── types/                   ← Shared TypeScript types
│   └── calculation-engine/      ← Pure calc functions (Phase 3)
└── scripts/
    └── migrate-excel/           ← One-time Excel → DB migration ✅
        ├── src/
        │   ├── migrate.py        ← entry point
        │   ├── header_parser.py  ← rows 1–5 → parameters
        │   ├── product_parser.py ← rows 6+ → products + compatibility
        │   ├── price_parser.py   ← prices + colors
        │   ├── normalize.py      ← all naming/contamination cleanup rules
        │   └── sql_emitter.py    ← produces seed.sql
        └── output/
            ├── seed_data.json   ← 732 KB structured JSON
            ├── seed.sql         ← 186 KB PostgreSQL seed (8,795 INSERT rows)
            └── migration_report.md
```

## What's in the database after migration

| Table | Rows | Notes |
|---|---|---|
| `parameters` | **121** | Full 5-level hierarchical taxonomy |
| `product_groups` | **43** | EP/PU/PMMA/PUCEM/Mastic/etc. with chemistry + application type |
| `products` | **686** | After deduplication (was 774 in raw Excel) |
| `compatibility` | **7,378** | Sparse positive-only matrix (8.9% density) |
| `price_list_items` | **403** | Matched STO 2024 prices |
| `colors` | **163** | 26 PG11 + 137 PG12 RAL codes |

## Verified rule engine behavior

A query for `medium mechanical load + concrete + no contamination + grinding` returns **66 compatible products across 26 product groups** — exactly the universe a flooring contractor would expect for that scenario.

A restrictive query for `extreme load + PVC anti-slip oily + base_cleaning` correctly returns only **3 products** — strict AND filtering works.

## Setup (run order)

```bash
# 1. Install root dependencies
pnpm install

# 2. Start PostgreSQL (locally or via Docker)
docker run --name flooring-pg -e POSTGRES_PASSWORD=devpass -p 5432:5432 -d postgres:16

# 3. Configure connection
cat > packages/db/.env <<EOF
DATABASE_URL="postgresql://postgres:devpass@localhost:5432/flooring_platform"
EOF

# 4. Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# 5. Run the Excel migration (Python — needs openpyxl)
pip install -r scripts/migrate-excel/requirements.txt
pnpm migrate:excel

# 6. Load the generated seed.sql into PostgreSQL
psql "postgresql://postgres:devpass@localhost:5432/flooring_platform" \
     -f scripts/migrate-excel/output/seed.sql
```

After step 6, the database is fully populated and ready for the API layer (Phase 2).

## Next: Phase 2 — Backend API

The next coding session will deliver:
- NestJS application with module structure
- Auth module (JWT)
- Parameters endpoint (returns the hierarchical tree)
- Recommendations endpoint (the rule engine)
- Projects CRUD
- Parameter selection storage
- Zod-based validation

## Data model decisions worth knowing

- **All money columns are `NUMERIC(12,2)`** — never floats.
- **Compatibility is positive-only** — absence of a row means "not compatible / not applicable", not a stored FALSE.
- **`row_order` is preserved** for products — keeps the original Excel ordering for snapshot/export traceability.
- **Soft deletes** on Projects, Users, Organizations.
- **Optimistic locking** via `version` column on Calculations (prevents racing autosaves).
