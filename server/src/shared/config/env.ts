import "dotenv/config";

import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
    SESSION_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.string().url().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_SUCCESS_URL: z.string().url().optional(),
    STRIPE_CANCEL_URL: z.string().url().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    SESSION_COOKIE_SAME_SITE: z.enum(["lax", "none"]).default("lax"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "test" && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required outside tests.",
      });
    }

    if (value.NODE_ENV === "production" && !value.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET is required in production.",
      });
    }
  });

// Remove DATABASE_URL from the validated test configuration so Prisma cannot use the development
// database by mistake. The test database helpers validate TEST_DATABASE_URL and worker ownership separately.
const sourceEnv = process.env.NODE_ENV === "test" ? { ...process.env, DATABASE_URL: undefined } : process.env;
const parsedEnv = envSchema.safeParse(sourceEnv);

if (!parsedEnv.success) {
  console.error("Invalid server environment configuration.");
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
