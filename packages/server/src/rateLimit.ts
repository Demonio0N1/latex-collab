import type { Request, Response, NextFunction } from "express";

/**
 * Minimal in-memory fixed-window rate limiter (no external deps). Keyed by
 * a caller-supplied function (usually client IP, optionally + project id).
 * Good enough to blunt password brute-forcing and create-spam on a
 * single-process self-hosted server; not a distributed limiter.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  key: (req: Request) => string;
  message?: string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Opportunistic cleanup so the map doesn't grow unbounded.
  function sweep(now: number) {
    if (hits.size < 5000) return;
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = opts.key(req);
    const entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + opts.windowMs });
      sweep(now);
      return next();
    }
    entry.count++;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: opts.message ?? "Demasiados intentos, espera un momento." });
    }
    next();
  };
}

function isLoopbackAddr(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * Real client IP. When the immediate peer is loopback (a local reverse proxy
 * or Tailscale Funnel forwarding to 127.0.0.1), trust the first
 * X-Forwarded-For hop so rate limiting sees distinct callers.
 */
export function clientIp(req: Request): string {
  const peer = req.socket.remoteAddress ?? "unknown";
  if (isLoopbackAddr(peer)) {
    const xff = req.headers["x-forwarded-for"];
    const fwd = Array.isArray(xff) ? xff[0] : xff;
    if (fwd) return fwd.split(",")[0].trim();
  }
  return peer;
}

/**
 * True only for a genuinely local request: the peer is loopback AND it was
 * not forwarded (no X-Forwarded-For). A request arriving via Funnel/proxy is
 * loopback at the socket but carries X-Forwarded-For, so it is NOT local.
 */
export function isTrulyLocal(req: Request): boolean {
  const peer = req.socket.remoteAddress ?? "";
  return isLoopbackAddr(peer) && req.headers["x-forwarded-for"] === undefined;
}
