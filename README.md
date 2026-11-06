# Eccommerce

Eccommerce is a headless commerce backend built with TypeScript, Express, PostgreSQL, and Prisma. It provides
storefront and administrative APIs for a single store, with server-side pricing, session authentication, and an
authenticated cart.

The application is under active development. The backend can serve independent clients; a new storefront client is
planned. Checkout, orders, payments, and promotion administration are not yet available.

## Features

- **Catalog:** product listing and search, category filtering, product details, structured options, variant resolution,
  and product and variant images.
- **Pricing:** explicit prices in multiple currencies or conversion from the base currency using cached exchange rates.
  Prices use integer minor units, and missing or stale rates produce explicit errors.
- **Cart:** authenticated, persistent carts with server-resolved prices, stock and availability checks, and idempotent
  quantity updates and removal.
- **Administration:** permission-protected APIs for product options and variants, image assignments, pricing settings,
  and exchange-rate ingestion.
- **Security:** server-side sessions, database-backed roles and permissions, CSRF checks for authenticated mutations,
  credentialed CORS configuration, and session regeneration after login or registration.
- **Reliability:** serializable transactions and bounded conflict retries for supported concurrent cart and catalog
  mutations, plus isolated PostgreSQL schemas for parallel integration tests.

## Architecture

The backend is a modular monolith: business modules own their routes, validation, services, and tests, while shared
infrastructure provides configuration, database access, sessions, authorization, and HTTP error handling. The Prisma
schema is organized by domain under `server/prisma/`.

```text
Storefront or admin client
          |
          v
   Express API (server)
   |                 |
   v                 v
Commerce modules   Shared infrastructure
   |                 |
   +--------+--------+
            v
       PostgreSQL
```

See [Server Architecture](server/src/README.md) and
[Database Test Isolation](server/src/shared/testing/README.md) for more detail.

## Requirements

- Node.js 20 or later and npm. CI uses Node.js 24.
- Docker and Docker Compose for the local PostgreSQL services, or a compatible PostgreSQL installation.

## Getting started

The following commands start the backend and a local development database. Run them from the repository root unless
otherwise noted.

1. Start PostgreSQL:

   ```sh
   docker compose up -d --wait
   ```

2. Copy `server/.env.example` to `server/.env`. Set `SESSION_SECRET` to a unique random value of at least 32
   characters. The example database URL matches the Compose service on `localhost:5433`. Adjust `CLIENT_ORIGIN` to
   match the origin of the client making browser requests.

3. Install dependencies, generate Prisma Client, apply the committed migrations, and seed the local database:

   ```sh
   cd server
   npm ci
   npm run db:generate
   npx prisma migrate deploy
   npm run db:seed
   ```

   The seed creates demo catalog, pricing, and user records. Use it only with a database intended for development; it
   updates its demo-owned records when run again.

4. Start the API from `server/`:

   ```sh
   npm run dev
   ```

   The default API address is `http://localhost:4000`. Check `/health` for liveness and `/ready` for database
   readiness.

The local seed includes an administrator (`admin@example.com`) and a customer (`customer@example.com`), both with
the password `DemoPass123!`. These credentials are for local development only and must not be used in a deployed
environment.

## API overview

| Area           | Endpoints                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health         | `GET /health`, `GET /ready`                                                                                                                                     |
| Authentication | `GET /api/auth/me`, `GET /api/auth/csrf-token`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`                                      |
| Storefront     | `GET /api/storefront/pricing`, `GET /api/storefront/products`, `GET /api/storefront/products/:productSlug`, `GET /api/storefront/products/:productSlug/variant` |
| Cart           | `GET /api/storefront/cart`, `PUT /api/storefront/cart/items/:variantId`, `DELETE /api/storefront/cart/items/:variantId`                                         |
| Administration | `GET /api/admin/context`, product option and variant-image endpoints, and pricing settings and exchange-rate endpoints under `/api/admin`                       |

Login or registration establishes a session cookie. Authenticated mutation requests, including logout and cart
changes, must send the token returned by `GET /api/auth/csrf-token` in the `x-csrf-token` header. Browser clients must
send credentials and use the configured `CLIENT_ORIGIN`. Administrative endpoints also check database-backed
permissions.

Cart quantities are absolute: sending the same `PUT` again sets the same quantity rather than adding it twice. The
server calculates prices and totals; clients do not supply authoritative prices.

## Verification

Run these commands from `server/`:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run test:unit
```

Integration tests require a separate disposable PostgreSQL database. Set `TEST_DATABASE_URL` in `server/.env` using
the example value, start the test service from the repository root, and then run the tests from `server/`:

```sh
# From the repository root
docker compose -f docker-compose.test.yml up -d --wait

# From server/
npm run test:integration
```

The integration test setup applies committed migrations to temporary worker schemas and removes those schemas after
the run. It requires a test database name and never falls back to the development database. Stop the disposable service
from the repository root when finished:

```sh
docker compose -f docker-compose.test.yml down
```

GitHub Actions runs server quality checks, unit tests, PostgreSQL integration tests, and container verification. See
the [test isolation documentation](server/src/shared/testing/README.md) for configuration and lifecycle details.

## Current limitations

- The storefront client is being rebuilt. The current repository focuses on the backend API.
- Promotion domain and persistence foundations exist, but promotion administration and cart discounts are not yet
  operational.
- Checkout, order management, inventory reservation, Stripe payments, and payment webhooks are not implemented.
- Exchange-rate ingestion is available, but a production provider adapter and scheduled refresh are still required.
- Production deployment requires environment-specific secrets, session and proxy configuration, migration procedures,
  monitoring, and a review of the unfinished commerce workflows.
