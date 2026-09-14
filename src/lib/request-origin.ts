/**
 * Match the browser origin to the public host, as Next's Server Actions do.
 * request.url can contain an internal hostname behind Next or a reverse proxy.
 * The deployment proxy must overwrite forwarded host/protocol headers.
 */
export function isSameOriginRequest(request: Request): boolean {
  const raw = request.headers.get("origin");
  if (!raw || raw === "null") return false;
  try {
    const origin = new URL(raw);
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(request.url).protocol.slice(0, -1);
    return (origin.protocol === "https:" || origin.protocol === "http:") &&
      origin.origin === raw && origin.host === host && origin.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
