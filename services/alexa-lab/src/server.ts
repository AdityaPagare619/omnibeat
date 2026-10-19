/**
 * alexa-lab HTTP surface (:4000) — demo endpoints the judge drives.
 *
 *   GET  /healthz          liveness + mcp/breaker summary
 *   POST /turn             deterministic turn handler
 *   POST /barge-in         {atMs} cut a playing utterance
 *   GET  /state            circuit-breaker + mcp + tts + chaos state
 *   POST /chaos            {latencyMs?, failNext?} fault injection for demo
 *   POST /probe            one health probe now (drives the breaker by hand)
 *   GET  /frames?limit=    recent trace frames without a WebSocket
 *   GET  /tts.wav?text=    sine-wave placeholder for the utterance
 *   GET  /trace (ws)       trace bus (see src/trace-bus.ts)
 *   static /public         fixture audio for playback
 */
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import type { Server as HttpServer } from "node:http";
import { TraceBus, frameSchema } from "./trace-bus.js";
import { CircuitBreaker } from "./breaker.js";
import { ChaosController } from "./chaos.js";
import { McpHostClient, describeError } from "./mcp-client.js";
import { AgentLoop } from "./agent-loop.js";
import { BargeInController } from "./barge-in.js";
import { TtsPlayer, buildMarks, durationOf, sineWav, MS_PER_WORD } from "./tts.js";
import { logger } from "./logger.js";

export const bargeInSchema = z
  .object({
    atMs: z.number().int().min(0).max(600_000),
    traceId: z.string().min(1).max(64).optional(),
  })
  .strict();

export const chaosSchema = z
  .object({
    latencyMs: z.number().int().min(0).max(30_000).optional(),
    failNext: z.number().int().min(0).max(100).optional(),
    clear: z.boolean().optional(),
  })
  .strict();

export interface LabRuntime {
  bus: TraceBus;
  breaker: CircuitBreaker;
  chaos: ChaosController;
  mcp: McpHostClient;
  tts: TtsPlayer;
  loop: AgentLoop;
  bargeIn: BargeInController;
  startedAt: number;
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

/** express@4 does not catch rejected async handlers — wrap them. */
function wrap(handler: Handler): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function createApp(runtime: LabRuntime, publicDir: string): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Access log — method/path/status/duration only, never bodies (§9 privacy).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info("http", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  const { bus, breaker, chaos, mcp, tts, loop, bargeIn, startedAt } = runtime;

  app.get("/healthz", (_req, res) => {
    const breakerSnapshot = breaker.snapshot();
    res.json({
      ok: true,
      service: "alexa-lab",
      version: "0.1.0",
      uptimeMs: Date.now() - startedAt,
      mcp: mcp.snapshot(),
      breaker: breakerSnapshot,
      edgeMode: breakerSnapshot.edgeMode,
      chaos: chaos.snapshot(),
      trace: { frames: bus.size(), clients: bus.clientCount() },
      tts: { playing: tts.isPlaying() },
    });
  });

  app.get("/state", (_req, res) => {
    const breakerSnapshot = breaker.snapshot();
    res.json({
      breaker: breakerSnapshot,
      mcp: mcp.snapshot(),
      chaos: chaos.snapshot(),
      tts: tts.snapshot(),
      responseStyle: loop.getResponseStyle(),
      trace: { frames: bus.size(), clients: bus.clientCount() },
    });
  });

  app.get("/frames", (req, res) => {
    const limitRaw = Number.parseInt(String(req.query.limit ?? "200"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 200;
    const frames = bus.recent(limit);
    const parsed = frames.map((f) => frameSchema.safeParse(f));
    res.json({
      count: frames.length,
      total: bus.size(),
      replayLimit: bus.replayLimit,
      invalid: parsed.filter((p) => !p.success).length,
      frames,
    });
  });

  app.post(
    "/turn",
    wrap(async (req, res) => {
      const { status, body } = await loop.handleTurn(req.body ?? {});
      res.status(status).json(body);
    }),
  );

  app.post(
    "/barge-in",
    wrap(async (req, res) => {
      const parsed = bargeInSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "BAD_REQUEST", message: "barge-in body failed validation", detail: parsed.error.issues },
        });
        return;
      }
      const result = await bargeIn.cut(parsed.data.atMs, parsed.data.traceId);
      res.json({
        ...result,
        breaker: breaker.snapshot(),
        edgeMode: breaker.snapshot().edgeMode,
      });
    }),
  );

  app.post(
    "/chaos",
    wrap(async (req, res) => {
      const parsed = chaosSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "BAD_REQUEST", message: "chaos body failed validation", detail: parsed.error.issues },
        });
        return;
      }
      const snapshot = parsed.data.clear ? chaos.clear() : chaos.set(parsed.data);
      bus.emit({
        direction: "internal",
        method: "chaos.updated",
        payload: {
          ...snapshot,
          note: "injections are real: latencyMs really delays, failNext really refuses before dialing",
        },
      });
      res.json({ chaos: snapshot, breaker: breaker.snapshot() });
    }),
  );

  app.post(
    "/probe",
    wrap(async (_req, res) => {
      const probe = await mcp.probe();
      res.json({ probe, breaker: breaker.snapshot(), mcp: mcp.snapshot() });
    }),
  );

  app.get("/tts.wav", (req, res) => {
    const text = typeof req.query.text === "string" && req.query.text.length > 0
      ? req.query.text.slice(0, 500)
      : "OmniBeat alexa lab placeholder tone";
    const marks = buildMarks(text, MS_PER_WORD);
    const durationMs = durationOf(marks);
    const wav = sineWav(durationMs);
    res.setHeader("content-type", "audio/wav");
    res.setHeader("content-length", String(wav.length));
    res.setHeader("x-speech-marks", JSON.stringify(marks));
    res.send(wav);
  });

  app.use(express.static(publicDir));

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: `no route for ${req.method} ${req.path}` },
      routes: [
        "GET /healthz",
        "GET /state",
        "GET /frames?limit=",
        "POST /turn",
        "POST /barge-in",
        "POST /chaos",
        "POST /probe",
        "GET /tts.wav?text=",
        "WS /trace",
      ],
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("request failed", { error: describeError(err) });
    res.status(500).json({ error: { code: "INTERNAL", message: describeError(err) } });
  });

  return app;
}

/** Wire HTTP server + trace-bus WS endpoint. */
export function listen(app: Express, port: number, bus: TraceBus): Promise<HttpServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      bus.attach(server);
      resolve(server);
    });
    server.on("error", reject);
  });
}
