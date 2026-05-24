# `@flooring/api`

NestJS backend for the flooring platform. Implements auth, the parameter tree, the rule engine, and project CRUD.

## Module map

| Module | Path | Responsibility |
|---|---|---|
| `AuthModule` | `src/auth/` | Register / login / JWT issuance · password hashing (argon2) · `JwtStrategy` · `JwtAuthGuard` (global) · `@Public()` / `@CurrentUser()` decorators |
| `PrismaModule` | `src/database/` | Global Prisma service, connection lifecycle |
| `ParametersModule` | `src/parameters/` | `GET /parameters` — flat→hierarchical tree for the UI |
| `RecommendationsModule` | `src/recommendations/` | **The rule engine.** `ParameterResolverService` maps enum values to parameter IDs; `RecommendationsService` runs the AND-counting SQL |
| `ProjectsModule` | `src/projects/` | Project CRUD scoped to the authenticated user's organization |
| `ParameterSelectionsModule` | `src/parameter-selections/` | Upsert per-project parameter selections, re-resolves IDs on every update |

## Cross-cutting

- **Validation** — Every controller validates inbound payloads via `ZodValidationPipe(SomeZodSchema)`. Schemas live in `@flooring/validation` and are shared with the frontend.
- **Response envelope** — `ResponseEnvelopeInterceptor` wraps every successful response in `{ success: true, data, requestId }`.
- **Errors** — `HttpExceptionFilter` produces `{ success: false, error: { code, message, details? }, requestId }`. Unknown exceptions are logged with full stack but only `"Internal server error"` is returned.
- **Request ID** — `RequestIdMiddleware` generates a ULID for every request, echoes it in `x-request-id` response header, and includes it in the envelope. Use this for tracing.
- **Auth** — `JwtAuthGuard` is registered globally. Opt out per-route with `@Public()`.
- **Rate limiting** — `ThrottlerModule` registered globally: 20 req/sec and 600 req/min. Tighten per-endpoint later.

## Endpoints (Phase 2)

All under `/api/v1`.

### Auth (public)

```http
POST   /auth/register     { email, password, name, organizationName }
POST   /auth/login        { email, password }
GET    /auth/me           Authorization: Bearer <token>
```

### Parameters (authenticated)

```http
GET    /parameters
  → returns the full hierarchical parameter tree:
    { environmental: { mechanicalLoad, potLife, temperature, humidity },
      substrates: [...] }
```

### Recommendations — the rule engine

```http
POST   /recommendations
  body: ParameterSelection
  → { groups: [{ id, name, chemistry, applicationType, products: [...] }],
      totalCompatibleProducts, selectedParameterCount, resolvedParameterIds }

POST   /recommendations/count
  body: ParameterSelection
  → { count }   ← for the live UI counter during parameter selection
```

Example body (medium load + concrete + grinding):

```json
{
  "mechanicalLoads": ["medium"],
  "potLifeCategories": ["open"],
  "temperatureRanges": ["5_30"],
  "humidityRanges": ["40_60"],
  "substrateConfigs": [
    {
      "substrateType": "concrete",
      "contamination": "none",
      "preparationMethod": "grinding"
    }
  ]
}
```

### Projects

```http
GET    /projects
POST   /projects                       { name, description?, clientName?, siteAddress? }
GET    /projects/:id
PUT    /projects/:id                   partial
DELETE /projects/:id                   soft delete (OWNER / ADMIN only)
POST   /projects/:id/duplicate
POST   /projects/:id/archive
```

### Parameter selections (per project)

```http
GET    /projects/:projectId/parameters
PUT    /projects/:projectId/parameters     body: ParameterSelection
DELETE /projects/:projectId/parameters
```

## Setup

```bash
# 1. Install deps (workspace root)
cd ../..
pnpm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Generate Prisma client
pnpm db:generate

# 4. Apply DB schema
pnpm db:migrate

# 5. Seed reference data (Excel → DB)
pip install -r scripts/migrate-excel/requirements.txt
pnpm migrate:excel
psql "postgresql://postgres:devpass@localhost:5432/flooring_platform" \
     -f scripts/migrate-excel/output/seed.sql

# 6. Configure the API
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — at minimum set a real JWT_SECRET (openssl rand -base64 64)

# 7. Run the API
pnpm --filter @flooring/api dev
# → http://localhost:3001/api/v1
```

## Quick end-to-end smoke test

```bash
# Register a user (creates an org)
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"me@test.com","password":"changeme123","name":"Test","organizationName":"Acme"}'
# → { success:true, data:{ token, user }, requestId }

TOKEN="paste-the-token-here"

# Get the parameter tree
curl http://localhost:3001/api/v1/parameters -H "Authorization: Bearer $TOKEN"

# Run a recommendation query (expect ~66 products in ~26 groups)
curl -X POST http://localhost:3001/api/v1/recommendations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mechanicalLoads": ["medium"],
    "potLifeCategories": ["open"],
    "temperatureRanges": ["5_30"],
    "humidityRanges": ["40_60"],
    "substrateConfigs": [
      { "substrateType": "concrete", "contamination": "none", "preparationMethod": "grinding" }
    ]
  }'

# Create a project
curl -X POST http://localhost:3001/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Warehouse floor coating"}'

# Save the parameter selection to the project
PROJECT_ID="paste-from-above"
curl -X PUT http://localhost:3001/api/v1/projects/$PROJECT_ID/parameters \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... same body as recommendations ... }'
```

## Testing

```bash
# All unit tests (mocks Prisma — no DB needed)
pnpm --filter @flooring/api test

# Specifically the rule engine
pnpm --filter @flooring/api test recommendations
```

The included test suite covers:

| File | Coverage |
|---|---|
| `parameter-resolver.service.spec.ts` | All ParameterSelection shapes → ID resolution; missing keys; deduplication |
| `recommendations.service.spec.ts` | Grouping, ordering, Decimal conversion, edge cases (empty results, count-only) |
| `parameter-selection.spec.ts` (validation package) | Zod schema rules: texture required/forbidden per substrate, valid preparations |

## Security notes for production

- Replace `JWT_SECRET` with a real 64+ char secret
- Set `NODE_ENV=production`
- Enable PostgreSQL RLS policies (see architecture doc Part 10.2)
- Add per-endpoint rate limits beyond the global defaults
- Move CORS allowlist to a proper config table once multiple frontends exist
- Add Sentry or equivalent for error tracking
