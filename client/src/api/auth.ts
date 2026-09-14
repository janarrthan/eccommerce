import type { User } from "../shared/types/user";
import { request } from "./client";

export const authApi = {
  currentUser: () => request<{ user: User | null }>("/auth/me"),

  csrfToken: () => request<{ csrfToken: string }>("/auth/csrf-token"),

  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: (csrfToken: string) =>
    request<void>("/auth/logout", {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrfToken,
      },
    }),
};
