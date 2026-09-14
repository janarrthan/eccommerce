const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
  message?: string;
};

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiErrorPayload | null;
    throw new Error(
      payload?.error?.message ?? payload?.message ?? "Request failed",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
