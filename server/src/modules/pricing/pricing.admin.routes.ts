import { Router } from "express";

import { asyncHandler } from "../../shared/http/async-handler.js";
import { requireCsrfToken } from "../../shared/middleware/csrf.js";
import { PERMISSION_CODES } from "../authorization/authorization.constants.js";
import { requirePermission } from "../authorization/authorization.middleware.js";
import { configurePricingSettings, getAdminPricingConfiguration, storeExchangeRates } from "./pricing.service.js";

export const pricingAdminRouter = Router();

pricingAdminRouter.get(
  "/",
  requirePermission(PERMISSION_CODES.SETTINGS_READ),
  asyncHandler(async (_req, res) => {
    const pricing = await getAdminPricingConfiguration();
    res.status(200).json({ pricing });
  }),
);

pricingAdminRouter.put(
  "/settings",
  requirePermission(PERMISSION_CODES.SETTINGS_WRITE),
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const pricing = await configurePricingSettings(req.body);
    res.status(200).json({ pricing });
  }),
);

// A provider adapter or scheduled job can call this same service after fetching rates.
pricingAdminRouter.put(
  "/exchange-rates",
  requirePermission(PERMISSION_CODES.SETTINGS_WRITE),
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const pricing = await storeExchangeRates(req.body);
    res.status(200).json({ pricing });
  }),
);
