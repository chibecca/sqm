# Flooring Platform

Industrial flooring & coating recommendation and calculation platform, built around a boolean compatibility-rule engine extracted from an existing Excel knowledge base.

## Current status

| Phase | Status | What's in it |
|---|---|---|
| **1 — Foundation** | ✅ Done | Monorepo skeleton, Prisma schema (16 tables), Excel migration script (validated against real data) |
| **2 — Backend API** | ✅ Done | NestJS API with auth, the rule engine, parameter tree, projects CRUD, parameter selections, full test suite |
| **3 — Layer builder & calculator** | 🔜 Next | Calculation engine, layer/item CRUD, autosave |
| **4 — Exports & persistence** | 🔜 | PDF/XLSX exports, versions, audit log |
| **5 — Frontend** | 🔜 | Next.js app, wizard UI |

## Repository structure

```
flooring-platform/
├── apps/
│   ├── api/                          ← NestJS backend (Phase 2 ✅)
│   │   ├── src/
│   │   │   ├── auth/                  ← register / login / JWT / guards
│   │   │   ├── common/                ← Zod pipe, envelope, exception filter
│   │   │   ├── config/                ← env loader with Zod validation
│   │   │   ├── database/              ← Prisma module
│   │   │   ├── parameters/            ← parameter tree endpoint
│   │   │   ├── recommendations/       ← THE RULE ENGINE
│   │   │   ├── projects/              ← project CRUD
│   │   │   ├── parameter-selections/  ← per-project parameter storage
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── README.md
│   └── web/                          ← Next.js (Phase 5)
├── packages/
│   ├── db/                            ← Prisma schema + client
│   ├── validation/                    ← Shared Zod schemas (TS source of truth)
│   ├── types/                         ← Shared TypeScript types
│   └── calculation-engine/            ← Pure calc functions (Phase 3)
├── scripts/
│   └── migrate-excel/                 ← Excel → seed.sql (Phase 1)
├── docker-compose.yml                 ← Postgres + Redis for local dev
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Verified rule engine behavior

After loading the seed data, the rule engine produces:
- `medium load + concrete + no contamination + grinding` → **66 products across 26 groups**
- `extreme load + PVC anti-slip oily + base_cleaning` → **3 products**
- Multi-substrate AND filtering works per clarification #6
- K5 datetime bug already fixed at the seed stage

## Setup

```bash
# 1. Install root dependencies (Phase 2 added many)
pnpm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure DB connection for Prisma
cat > packages/db/.env <<'ENV'
DATABASE_URL="postgresql://postgres:devpass@localhost:5432/flooring_platform"
ENV

# 4. Generate Prisma client + apply schema
pnpm db:generate
pnpm db:migrate

# 5. Run the Excel migration
pip install -r scripts/migrate-excel/requirements.txt
pnpm migrate:excel

# 6. Load the seed data
psql "postgresql://postgres:devpass@localhost:5432/flooring_platform" \
     -f scripts/migrate-excel/output/seed.sql

# 7. Configure the API
cp apps/api/.env.example apps/api/.env
# IMPORTANT: edit apps/api/.env and set a real JWT_SECRET
# (the default is < 32 chars and will fail the config check)
# Generate one: openssl rand -base64 64

# 8. Run the API
pnpm --filter @flooring/api dev
```

The API will be at `http://localhost:3001/api/v1`. See `apps/api/README.md` for endpoint reference and smoke-test curl commands.

## Test suite

```bash
# Validation package — Zod schema rules
pnpm --filter @flooring/validation test

# API — rule engine, parameter resolver, controllers
pnpm --filter @flooring/api test
```

Tests run against mocked Prisma — no DB required. There are 16 unit tests covering:
- Parameter resolution (multi-select, multi-substrate, dedup, missing keys)
- Rule engine query shape (Prisma.sql parameters, grouping, ordering)
- Decimal-to-number conversion
- Validation rules (texture required/forbidden per substrate, valid preparations)

## Next: Phase 3 — Calculation Engine

- `packages/calculation-engine` — pure functions, Decimal.js precision
- Calculation, Layer, LayerItem, ToolItem, LaborItem entities
- Layer/item CRUD endpoints
- Autosave with optimistic locking on `Calculation.version`
- Calculation test suite from architecture Appendix A
