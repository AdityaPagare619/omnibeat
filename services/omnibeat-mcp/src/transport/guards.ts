/**
 * OUR OWN request guards for the /mcp endpoint.
 *
 * Why our own: evidence CLM-SPEC-007/004 - the SDK's Origin/Host validation
 * options are @deprecated and OFF by default, so shipping without middleware
 * would be a DNS-rebinding hole (blueprint 5.1: "validate Origin (403 on
 * mismatch)" and 8.9 security baseline).
 *
 * Guards, in order:
 *  1. securityGuard  : Origin 403 on mismatch, Host 403 on non-loopback
 *                      (DNS-rebinding protection), bearer auth 401/403 when
 *                      enabled (blueprint 5.1, 8.9).
 *  2. protocolGuard  : MCP-Protocol-Version must be "2025-11-25" - 400 on any
 *                      other value (blueprint 5.1: "wrong version -> 400").
 *  3. sessionGuard   : Mcp-Session-Id must exist in the session registry for
 *                      every non-initialize request (POST/GET/DELETE) -
 *                      404 on unknown or missing id (blueprint 5.1).
 *
 * All three respond with the same JSON-RPC error body shape the SDK transport
 * uses ({jsonrpc, error:{code,message}, id:null}) so clients see one dialect.
 */
import type { NextFunction, Request, Response } from "express";
import type { LabConfig } from "../config.js";
import { log } from "../logging.js";

export const SUPPORTED_PROTOCOL_VERSION = "2025-11-25";

export function jsonRpcHttpError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostnameOf(hostHeader: string): string {
  // [::1]:8080 -> [::1] ; 127.0.0.1:8080 -> 127.0.0.1
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(0, end + 1);
  }
  const colon = trimmed.indexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

function originHostname(origin: string): string | undefined {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Origin + Host validation. Rules:
 *  - Origin present and not allow-listed and not loopback  -> 403
 *  - Host not loopback and not explicitly allowed          -> 403
 * The default allow-list is the typed config's allowedOrigins (localhost:3000
 * lab-console, localhost:4000 alexa-lab) plus the server's own loopback origin.
 */
export function securityGuard(cfg: LabConfig): (req: Request, res: Response, next: NextFunction) => void {
  const allowedOrigins = new Set(cfg.allowedOrigins.map((o) => o.replace(/\/$/, "")));
  const allowedHosts = new Set(
    (process.env.OMNIBEAT_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  );

  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin !== undefined && origin !== "") {
      const normalized = origin.replace(/\/$/, "");
      const host = originHostname(normalized);
      const loopbackOrigin =
        host !== undefined &&
        LOOPBACK_HOSTNAMES.has(host) &&
        (normalized.startsWith("http://") || normalized.startsWith("https://"));
      if (!allowedOrigins.has(normalized) && !loopbackOrigin) {
        log.warn("guard_origin_rejected", { origin: normalized, path: req.path });
        jsonRpcHttpError(res, 403, -32000, `Forbidden: Origin not allowed: ${normalized}`);
        return;
      }
    }

    const hostHeader = req.get("host");
    if (hostHeader !== undefined && hostHeader !== "") {
      const hostname = hostnameOf(hostHeader);
      if (!LOOPBACK_HOSTNAMES.has(hostname) && !allowedHosts.has(hostname)) {
        log.warn("guard_host_rejected", { host: hostHeader, path: req.path });
        jsonRpcHttpError(res, 403, -32000, `Forbidden: Host not allowed: ${hostHeader}`);
        return;
      }
    }

    if (cfg.requireBearerAuth) {
      const header = req.get("authorization") ?? "";
      const expected = cfg.bearerToken;
      const ok = expected !== undefined && expected !== "" && header === `Bearer ${expected}`;
      if (!ok) {
        // Fail closed: auth required but no token configured -> reject too.
        log.warn("guard_bearer_rejected", { configured: expected !== undefined && expected !== "" });
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unauthorized: bearer token missing or invalid" },
          id: null,
        });
        return;
      }
    }

    next();
  };
}

/** blueprint 5.1: wrong MCP-Protocol-Version -> 400. Missing is tolerated (SDK
 *  defaults it to the negotiated version; we still record what we saw). */
export function protocolVersionGuard(): (
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  return (req, res, next) => {
    const version = req.get("mcp-protocol-version");
    if (version !== undefined && version !== "" && version !== SUPPORTED_PROTOCOL_VERSION) {
      log.warn("guard_protocol_version_rejected", { version, path: req.path });
      jsonRpcHttpError(
        res,
        400,
        -32000,
        `Bad Request: Unsupported protocol version: ${version} (supported: ${SUPPORTED_PROTOCOL_VERSION})`,
      );
      return;
    }
    next();
  };
}

/** blueprint 5.1: unknown or missing session -> 404 for every non-initialize
 *  request. Session existence is checked against the live registry (the map
 *  that mirrors rows in data/sessions.db). */
export function sessionGuard(
  isSessionLive: (sessionId: string) => boolean,
  isInitializeBody: (body: unknown) => boolean,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (req.method === "OPTIONS") {
      next();
      return;
    }
    const sessionId = req.get("mcp-session-id") ?? undefined;

    if (req.method === "POST" && isInitializeBody(req.body)) {
      // A client that presents a session id it never got is confused -> 404.
      if (sessionId !== undefined && !isSessionLive(sessionId)) {
        jsonRpcHttpError(res, 404, -32001, "Session not found");
        return;
      }
      next();
      return;
    }

    if (sessionId === undefined || !isSessionLive(sessionId)) {
      jsonRpcHttpError(res, 404, -32001, "Session not found");
      return;
    }
    next();
  };
}
