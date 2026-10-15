export async function api(path, { method = "GET", body, signal } = {}) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    signal,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error?.message || "Could not connect. Please retry.",
    );
    error.status = response.status;
    error.code = data.error?.code;
    if (response.status === 401 && !path.startsWith("/auth"))
      window.dispatchEvent(new Event("session-expired"));
    throw error;
  }
  return data;
}
export const localTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
