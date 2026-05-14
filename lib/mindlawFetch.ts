/** Cabeçalhos JSON; autenticação via cookie httpOnly `mindlaw_token` (credentials: include). */
export function mindlawAuthHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
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
      window.location.href = "/login";
    }
    throw new Error((data as { error?: string }).error || "Erro na requisição.");
  }
  return data as T;
}
