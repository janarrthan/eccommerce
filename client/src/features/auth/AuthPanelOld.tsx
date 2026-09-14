import { useState } from "react";

import type { User } from "../../shared/types/user";
import styles from "./AuthPanel.module.css";
import { loginSchema, registerSchema } from "./auth.validation";
import {
  type AuthMessage,
  type AuthMode,
  type AuthSubmitInput,
  useAuth,
} from "./useAuthOld";

type FieldName = "name" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

export function AuthPanelOld() {
  const { authMessage, loading, logout, startupStatus, submitAuth, user } =
    useAuth();

  return (
    <section className={styles.panel}>
      <h1 className={styles.title}>Eccommerce Auth</h1>
      <p className={styles.subtitle}>
        Login or create a customer account using the Express session backend.
      </p>

      {startupStatus === "offline" ? (
        <p className={styles.warning}>
          Unable to reach the API. Check the server or your connection.
        </p>
      ) : null}

      {startupStatus !== "checking" && user ? (
        <UserInfo user={user} loading={loading} handleLogout={logout} />
      ) : null}

      {startupStatus !== "checking" && !user ? (
        <AuthForm
          authMessage={authMessage}
          loading={loading}
          onSubmit={submitAuth}
        />
      ) : null}

      {startupStatus !== "checking" && user && authMessage ? (
        <p
          className={
            authMessage.type === "error"
              ? styles.errorMessage
              : styles.successMessage
          }
        >
          {authMessage.text}
        </p>
      ) : null}
    </section>
  );
}

function UserInfo({
  user,
  loading,
  handleLogout,
}: {
  user: User;
  loading: boolean;
  handleLogout: () => void;
}) {
  return (
    <div className={styles.userCard}>
      <p className={styles.eyebrow}>Signed in as</p>
      <h2 className={styles.userName}>{user.name}</h2>
      <p className={styles.userEmail}>{user.email}</p>
      <p className={styles.role}>
        {user.roles.length > 0 ? user.roles.join(", ") : "CUSTOMER"}
      </p>

      <button
        className={styles.secondaryButton}
        disabled={loading}
        onClick={handleLogout}
        type="button"
      >
        {loading ? "Working..." : "Logout"}
      </button>
    </div>
  );
}

function AuthForm({
  authMessage,
  loading,
  onSubmit,
}: {
  authMessage: AuthMessage | null;
  loading: boolean;
  onSubmit: (input: AuthSubmitInput) => Promise<void>;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function updateField(fieldName: FieldName, value: string) {
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [fieldName]: undefined,
    }));

    if (fieldName === "name") {
      setName(value);
      return;
    }

    if (fieldName === "email") {
      setEmail(value);
      return;
    }

    setPassword(value);
  }

  function getFieldErrors(
    issues: Array<{ path: PropertyKey[]; message: string }>,
  ) {
    const errors: FieldErrors = {};

    for (const issue of issues) {
      const fieldName = issue.path[0];

      if (
        (fieldName === "name" ||
          fieldName === "email" ||
          fieldName === "password") &&
        !errors[fieldName]
      ) {
        errors[fieldName] = issue.message;
      }
    }

    return errors;
  }

  function validateForm(): AuthSubmitInput | null {
    if (authMode === "login") {
      const result = loginSchema.safeParse({ email, password });

      if (!result.success) {
        setFieldErrors(getFieldErrors(result.error.issues));
        return null;
      }

      setFieldErrors({});
      return {
        mode: "login",
        email: result.data.email,
        password: result.data.password,
      };
    }

    const result = registerSchema.safeParse({ name, email, password });

    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error.issues));
      return null;
    }

    setFieldErrors({});
    return {
      mode: "register",
      name: result.data.name,
      email: result.data.email,
      password: result.data.password,
    };
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();

        const input = validateForm();
        if (!input) {
          return;
        }

        void onSubmit(input);
      }}
    >
      <div className={styles.tabs}>
        <button
          className={authMode === "login" ? styles.activeTab : styles.tab}
          onClick={() => setAuthMode("login")}
          type="button"
        >
          Login
        </button>
        <button
          className={authMode === "register" ? styles.activeTab : styles.tab}
          onClick={() => setAuthMode("register")}
          type="button"
        >
          Register
        </button>
      </div>

      {authMode === "register" ? (
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            aria-invalid={Boolean(fieldErrors.name)}
            className={styles.input}
            onChange={(event) => updateField("name", event.target.value)}
            value={name}
          />
          {fieldErrors.name ? (
            <span className={styles.fieldError}>{fieldErrors.name}</span>
          ) : null}
        </label>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          aria-invalid={Boolean(fieldErrors.email)}
          className={styles.input}
          onChange={(event) => updateField("email", event.target.value)}
          type="email"
          value={email}
        />
        {fieldErrors.email ? (
          <span className={styles.fieldError}>{fieldErrors.email}</span>
        ) : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          aria-invalid={Boolean(fieldErrors.password)}
          className={styles.input}
          onChange={(event) => updateField("password", event.target.value)}
          type="password"
          value={password}
        />
        {fieldErrors.password ? (
          <span className={styles.fieldError}>{fieldErrors.password}</span>
        ) : null}
      </label>

      <button className={styles.primaryButton} disabled={loading} type="submit">
        {loading
          ? "Loading..."
          : authMode === "login"
            ? "Login"
            : "Create account"}
      </button>

      {authMessage ? (
        <p
          className={
            authMessage.type === "error"
              ? styles.errorMessage
              : styles.successMessage
          }
        >
          {authMessage.text}
        </p>
      ) : null}
    </form>
  );
}
