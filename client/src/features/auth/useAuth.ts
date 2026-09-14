import { useEffect, useState } from "react";

import { authApi } from "../../api/auth";
import type { User } from "../../shared/types/user";

export type AuthMode = "login" | "register";

export type AuthLoginInput = {
  mode: "login";
  email: string;
  password: string;
};

export type AuthRegisterInput = {
  mode: "register";
  name: string;
  email: string;
  password: string;
};

export type AuthSubmitInput = AuthLoginInput | AuthRegisterInput;
export type AuthStartupStatus = "checking" | "ready" | "offline";

export type AuthMessage = {
  type: "success" | "error";
  text: string;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [startupStatus, setStartupStatus] =
    useState<AuthStartupStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);

  useEffect(() => {
    authApi
      .currentUser()
      .then((payload) => {
        setUser(payload.user);
        setStartupStatus("ready");
      })
      .catch(() => {
        setUser(null);
        setStartupStatus("offline");
      });
  }, []);

  async function submitAuth(input: AuthSubmitInput) {
    setLoading(true);
    setAuthMessage(null);

    try {
      if (input.mode === "login") {
        const payload = await authApi.login(input.email, input.password);
        setUser(payload.user);
        setAuthMessage({ type: "success", text: "Logged in." });
        return;
      }

      const payload = await authApi.register(
        input.name,
        input.email,
        input.password,
      );
      setUser(payload.user);
      setAuthMessage({ type: "success", text: "Account created." });
    } catch (error) {
      setAuthMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Authentication failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    setAuthMessage(null);

    try {
      const { csrfToken } = await authApi.csrfToken();
      await authApi.logout(csrfToken);
      setUser(null);
      setAuthMessage({ type: "success", text: "Logged out." });
    } catch (error) {
      setAuthMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Logout failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  return {
    authMessage,
    loading,
    logout,
    startupStatus,
    submitAuth,
    user,
  };
}
