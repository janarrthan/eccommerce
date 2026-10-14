# Server Architecture

This backend uses a modular monolith structure.

- `modules/` contains business modules. Each module owns its routes, validation, service logic, and tests where practical.
- `shared/` contains cross-cutting infrastructure such as config, database access, HTTP helpers, middleware, errors, and validation utilities.

The commerce model is single-store. Public client APIs live under `/api/storefront`, protected administration APIs live under `/api/admin`, and roles and permissions are resolved from database assignments on each administrative request.

The `pricing` module owns currency settings, exchange-rate cache ingestion, deterministic minor-unit conversion, and price resolution. Product variants own explicit price records, while product and cart modules ask pricing for customer-currency prices instead of implementing conversion themselves. The cart stores variant identities and quantities, resolves current prices on every response, and leaves immutable charged-price and exchange-rate snapshots to the future order and checkout boundary.

The authenticated cart API lives under `/api/storefront/cart`. `GET /` reads the current cart without creating an empty database row. `PUT /items/:variantId` idempotently creates a line or replaces its absolute quantity, and `DELETE /items/:variantId` idempotently removes it. Mutations require the session's CSRF token. Serializable transactions, bounded conflict retries, database uniqueness, stock checks, and request limits protect concurrent writes. A cart response keeps unavailable lines visible with an explicit availability reason and marks whether the complete cart is checkout-ready.

The `promotions` module starts with a database-free domain foundation: typed benefit contracts, discount-code normalization, derived lifecycle status, targeting and minimum primitives, integer-only benefit calculations, and deterministic largest-remainder allocation. It deliberately does not import Prisma or Express. Later persistence and cart orchestration will load server-owned data and call this pure layer, which keeps one calculation contract reusable by cart previews and authoritative checkout revalidation.

Prisma models are split by concern under `prisma/models/`: core products and variants, categories, product options, product images, pricing, carts, authentication, and authorization. Relations may cross these files because `prisma.config.ts` loads the complete `prisma` schema directory.

The app should remain one deployable Express service. Do not split this project into microservices.

Backend tests use separate Vitest unit and integration projects. Integration tests run against a dedicated disposable PostgreSQL database, with a migrated schema per worker and shared provisioning, reset, and teardown. See [Database Test Isolation](shared/testing/README.md) for the safety boundaries, file responsibilities, and local commands. Production builds exclude tests; the separate type-check configuration still checks test infrastructure and tool configuration.
