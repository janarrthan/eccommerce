import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { getAuthenticatedUserId, requireAuthenticated } from "../../shared/middleware/authenticated.js";
import { requireCsrfToken } from "../../shared/middleware/csrf.js";
import { getCart, removeCartItem, setCartItemQuantity } from "./cart.service.js";
import { cartItemParamsSchema, cartQuerySchema } from "./cart.validation.js";

export const cartRouter = Router();

cartRouter.use(requireAuthenticated);

cartRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { currency } = cartQuerySchema.parse(req.query);
    const cart = await getCart(getAuthenticatedUserId(req), currency);

    res.status(200).json({ cart });
  }),
);

cartRouter.put(
  "/items/:variantId",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { variantId } = cartItemParamsSchema.parse(req.params);
    const { currency } = cartQuerySchema.parse(req.query);
    const result = await setCartItemQuantity(getAuthenticatedUserId(req), variantId, req.body, currency);

    res.status(result.created ? 201 : 200).json({ cart: result.cart });
  }),
);

cartRouter.delete(
  "/items/:variantId",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { variantId } = cartItemParamsSchema.parse(req.params);
    const { currency } = cartQuerySchema.parse(req.query);
    const cart = await removeCartItem(getAuthenticatedUserId(req), variantId, currency);

    res.status(200).json({ cart });
  }),
);
