import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  name: z.string().trim().min(2).max(80),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/, "Password must include at least one letter.")
    .regex(/[0-9]/, "Password must include at least one number."),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
