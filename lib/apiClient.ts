"use client";

// Browser fetch wrapper. Sends the CSRF marker header, and on a 401 from a data
// route it transparently refreshes the session once and retries (single-flight
// on the server side prevents a refresh stampede).

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "X-BT-Request": "1" },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-BT-Request", "1");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const opts: RequestInit = { ...init, headers, credentials: "same-origin" };

  let res = await fetch(path, opts);
  if (res.status === 401 && !path.startsWith("/api/auth")) {
    if (await doRefresh()) {
      res = await fetch(path, opts); // retry once with fresh cookies
    } else if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }
  return res;
}

/** SWR fetcher — GET JSON or throw. */
export async function jsonFetcher<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function apiJson<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await apiFetch(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Failed (${res.status})`);
  return data as T;
}
