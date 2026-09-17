# Server Architecture

This backend uses a modular monolith structure.

- `modules/` contains business modules. Each module owns its routes, validation, service logic, and tests where practical.
- `shared/` contains cross-cutting infrastructure such as config, database access, HTTP helpers, middleware, errors, and validation utilities.

The commerce model is single-store. Public client APIs live under `/api/storefront`, protected administration APIs live under `/api/admin`, and roles and permissions are resolved from database assignments on each administrative request.

The `pricing` module owns currency settings, exchange-rate cache ingestion, deterministic minor-unit conversion, and price resolution. Product variants own explicit price records, while the product module asks pricing for one customer-currency price instead of implementing conversion itself. Future cart and order modules must reuse this boundary and persist resolved-price snapshots.

Prisma models are split by concern under `prisma/models/`: core products and variants, categories, product options, product images, pricing, authentication, and authorization. Relations may cross these files because `prisma.config.ts` loads the complete `prisma` schema directory.

The app should remain one deployable Express service. Do not split this project into microservices.

Backend tests use separate Vitest unit and integration projects. Integration tests run against a dedicated disposable PostgreSQL database, with a migrated schema per worker and shared provisioning, reset, and teardown. See [Database Test Isolation](shared/testing/README.md) for the safety boundaries, file responsibilities, and local commands. Production builds exclude tests; the separate type-check configuration still checks test infrastructure and tool configuration.
