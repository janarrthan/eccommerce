import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { SHARED_ERROR_CODES } from "../errors/error-codes.js";
import { HttpError } from "../errors/http-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details,
        ...(error.code ? { code: error.code } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: SHARED_ERROR_CODES.VALIDATION_FAILED,
        message: "Validation failed.",
        details: error.flatten(),
      },
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    error: {
      code: SHARED_ERROR_CODES.INTERNAL_ERROR,
      message: "Internal server error.",
    },
  });
};
