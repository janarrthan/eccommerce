import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { getStorefrontPricingConfiguration } from "./pricing.service.js";

export const pricingRouter = Router();

pricingRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const pricing = await getStorefrontPricingConfiguration();
    res.status(200).json({ pricing });
  }),
);
