export function mindlawAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("mindlaw_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function mindlawJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...mindlawAuthHeaders(), ...init?.headers }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("mindlaw_token");
      window.location.href = "/login";
    }
    throw new Error((data as { error?: string }).error || "Erro na requisição.");
  }
  return data as T;
}
