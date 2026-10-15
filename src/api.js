const failure = (code, message, status) =>
  Object.assign(new Error(message), { code, status });
export async function api(
  path,
  { method = "GET", body, signal, timeoutMs = 90000 } = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      signal: controller.signal,
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (
      response.status === 401 &&
      /^Basic\s/i.test(response.headers.get("www-authenticate") || "")
    ) {
      window.dispatchEvent(new Event("basic-auth-required"));
      throw failure(
        "BASIC_AUTH_REQUIRED",
        "Open shared access to continue.",
        401,
      );
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw failure(
        "PROXY_RESPONSE",
        "The server may be waking up. Please retry.",
        response.status,
      );
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw failure(
        "PROXY_RESPONSE",
        "The server returned an incomplete response. Please retry.",
        response.status,
      );
    }
    if (!response.ok) {
      const expired =
        response.status === 401 &&
        (!path.startsWith("/auth") || path === "/auth/me");
      if (expired) window.dispatchEvent(new Event("session-expired"));
      throw failure(
        expired ? "SESSION_EXPIRED" : data.error?.code,
        data.error?.message || "Could not connect. Please retry.",
        response.status,
      );
    }
    return data;
  } catch (error) {
    if (timedOut)
      throw failure(
        "TIMEOUT",
        "The server is taking longer than expected. Please retry.",
      );
    if (controller.signal.aborted)
      throw failure("ABORTED", "Request cancelled.");
    if (error.code) throw error;
    throw failure("NETWORK", "Could not connect. Please retry.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const localTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
