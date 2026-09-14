import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { User } from "../../shared/types/user";
import styles from "./AuthPanel.module.css";
import {
  type LoginFormValues,
  type RegisterFormValues,
  loginSchema,
  registerSchema,
} from "./auth.validation";
import {
  type AuthMessage,
  type AuthMode,
  type AuthSubmitInput,
  useAuth,
} from "./useAuth";

export function AuthPanel() {
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

      {startupStatus === "checking" ? (
        <p className={styles.status}>Checking session...</p>
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

type AuthFormProps = {
  authMessage: AuthMessage | null;
  loading: boolean;
  onSubmit: (input: AuthSubmitInput) => Promise<void>;
};

function AuthForm({ authMessage, loading, onSubmit }: AuthFormProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  return (
    <div className={styles.authForm}>
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

      {authMode === "login" ? (
        <LoginForm
          authMessage={authMessage}
          loading={loading}
          onSubmit={onSubmit}
        />
      ) : (
        <RegisterForm
          authMessage={authMessage}
          loading={loading}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}

function LoginForm({ authMessage, loading, onSubmit }: AuthFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(loginSchema),
  });

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit((values) => {
        void onSubmit({
          mode: "login",
          email: values.email,
          password: values.password,
        });
      })}
    >
      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          aria-invalid={Boolean(errors.email)}
          className={styles.input}
          type="email"
          {...register("email")}
        />
        {errors.email?.message ? (
          <span className={styles.fieldError}>{errors.email.message}</span>
        ) : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          aria-invalid={Boolean(errors.password)}
          className={styles.input}
          type="password"
          {...register("password")}
        />
        {errors.password?.message ? (
          <span className={styles.fieldError}>{errors.password.message}</span>
        ) : null}
      </label>

      <button className={styles.primaryButton} disabled={loading} type="submit">
        {loading ? "Loading..." : "Login"}
      </button>

      <AuthApplicationMessage authMessage={authMessage} />
    </form>
  );
}

function RegisterForm({ authMessage, loading, onSubmit }: AuthFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    resolver: zodResolver(registerSchema),
  });

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit((values) => {
        void onSubmit({
          mode: "register",
          name: values.name,
          email: values.email,
          password: values.password,
        });
      })}
    >
      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          aria-invalid={Boolean(errors.name)}
          className={styles.input}
          {...register("name")}
        />
        {errors.name?.message ? (
          <span className={styles.fieldError}>{errors.name.message}</span>
        ) : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          aria-invalid={Boolean(errors.email)}
          className={styles.input}
          type="email"
          {...register("email")}
        />
        {errors.email?.message ? (
          <span className={styles.fieldError}>{errors.email.message}</span>
        ) : null}
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Password</span>
        <input
          aria-invalid={Boolean(errors.password)}
          className={styles.input}
          type="password"
          {...register("password")}
        />
        {errors.password?.message ? (
          <span className={styles.fieldError}>{errors.password.message}</span>
        ) : null}
      </label>

      <button className={styles.primaryButton} disabled={loading} type="submit">
        {loading ? "Loading..." : "Create account"}
      </button>

      <AuthApplicationMessage authMessage={authMessage} />
    </form>
  );
}

function AuthApplicationMessage({
  authMessage,
}: {
  authMessage: AuthMessage | null;
}) {
  if (!authMessage) {
    return null;
  }

  return (
    <p
      className={
        authMessage.type === "error"
          ? styles.errorMessage
          : styles.successMessage
      }
    >
      {authMessage.text}
    </p>
  );
}
