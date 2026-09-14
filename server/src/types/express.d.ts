import type { AuthorizationContext } from "../modules/authorization/authorization.service.js";

declare global {
  namespace Express {
    interface Locals {
      authorization: AuthorizationContext;
    }
  }
}

export {};
