import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { HttpError } from "../errors/http-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Validation failed.",
        details: error.flatten(),
      },
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    error: {
      message: "Internal server error.",
    },
  });
};
