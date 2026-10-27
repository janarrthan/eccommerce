import { expect } from "vitest";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads PostgreSQL's error category, such as "23514" for a failed CHECK constraint.
 *
 * Prisma's PostgreSQL adapter preserves it in the driver error's originalCode. Older raw-query errors expose
 * it directly in meta.code. Model writes can expose DriverAdapterError directly, without Prisma's raw-query wrapper.
 * Keep those layouts here so a dependency update does not require changing every test.
 * Unknown layouts return undefined; an error message alone must never count as proof that a constraint worked.
 */
export function getPostgresErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  const meta = isRecord(error.meta) ? error.meta : undefined;
  const adapterError = error.name === "DriverAdapterError" ? error : meta?.driverAdapterError;
  const adapterCause = isRecord(adapterError) ? adapterError.cause : undefined;
  const code = isRecord(adapterCause) ? adapterCause.originalCode : error.code === "P2010" ? meta?.code : undefined;

  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

/**
 * Requires an operation to fail with a specific PostgreSQL error, such as "23505" for duplicate codes.
 *
 * A missing table ("42P01"), an unknown adapter layout, or a successful write must fail this assertion rather
 * than masquerade as the expected integrity protection. This helper never matches human-readable messages.
 */
export async function expectPostgresRejection(operation: Promise<unknown>, expectedCode: string): Promise<void> {
  await expect(operation).rejects.toSatisfy((error: unknown) => getPostgresErrorCode(error) === expectedCode);
}
