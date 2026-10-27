import { describe, expect, it } from "vitest";

import { expectPostgresRejection, getPostgresErrorCode } from "../postgres-error.js";

function adapterError(originalCode: string): unknown {
  return {
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode } } },
  };
}

describe("PostgreSQL integrity assertions", () => {
  it.each(["23514", "23505", "23503", "23P01", "40001", "22001"])("reads adapter SQLSTATE %s", (code) => {
    expect(getPostgresErrorCode(adapterError(code))).toBe(code);
  });

  it("reads the legacy Prisma raw-query layout", () => {
    expect(getPostgresErrorCode({ code: "P2010", meta: { code: "23514" } })).toBe("23514");
  });

  it("reads a direct adapter error from a Prisma model write", async () => {
    const error = Object.assign(new Error("Database rejected the quantity."), {
      name: "DriverAdapterError",
      cause: { originalCode: "23514", kind: "postgres" },
    });
    expect(getPostgresErrorCode(error)).toBe("23514");
    await expectPostgresRejection(Promise.reject(error), "23514");
  });

  it("uses the driver's original SQLSTATE instead of conflicting legacy metadata", () => {
    expect(
      getPostgresErrorCode({
        code: "P2010",
        meta: { code: "23514", driverAdapterError: { cause: { originalCode: "42P01" } } },
      }),
    ).toBe("42P01");
  });

  it.each([
    undefined,
    null,
    new Error("violates check constraint"),
    { code: "23514" },
    { name: "Error", cause: { originalCode: "23514" } },
    { name: "DriverAdapterError", cause: { kind: "UniqueConstraintViolation" } },
    { code: "P2002", meta: { code: "23514" } },
    { code: "P2010", meta: null },
    { code: "P2010", meta: { driverAdapterError: { cause: { kind: "UniqueConstraintViolation" } } } },
    adapterError("not-a-sqlstate"),
    adapterError(""),
  ])("does not infer SQLSTATE from an unknown error: %j", (error) => {
    expect(getPostgresErrorCode(error)).toBeUndefined();
  });

  it("accepts the intended check violation", async () => {
    await expectPostgresRejection(Promise.reject(adapterError("23514")), "23514");
  });

  it.each([
    adapterError("42P01"),
    adapterError("42601"),
    adapterError("23505"),
    new Error("The database accepted an invalid write."),
  ])("rejects unrelated failures instead of reporting a working CHECK: %j", async (error) => {
    await expect(expectPostgresRejection(Promise.reject(error), "23514")).rejects.toThrow();
  });

  it("rejects a successful operation", async () => {
    await expect(expectPostgresRejection(Promise.resolve(1), "23514")).rejects.toThrow();
  });
});
