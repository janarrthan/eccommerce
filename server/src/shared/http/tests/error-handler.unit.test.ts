import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { HttpError } from "../../errors/http-error.js";
import { errorHandler } from "../error-handler.js";

function handle(error: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }) as unknown as Response);

  errorHandler(error, {} as Request, { status } as unknown as Response, vi.fn() as NextFunction);

  return { json, status };
}

describe("errorHandler", () => {
  it("includes a stable application code when an HttpError provides one", () => {
    const { json, status } = handle(
      new HttpError(409, "That discount code already exists.", undefined, "promotion.code_conflict"),
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "promotion.code_conflict",
        message: "That discount code already exists.",
        details: undefined,
      },
    });
  });

  it("preserves the existing response shape when old callers do not provide a code", () => {
    const { json } = handle(new HttpError(404, "Product not found."));

    expect(json).toHaveBeenCalledWith({
      error: {
        message: "Product not found.",
        details: undefined,
      },
    });
  });
});
