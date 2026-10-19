/**
 * Circuit breaker over the MCP server health endpoint (blueprint §8.3 ladder —
 * client-side rungs; ADR-0003 thresholds-as-config).
 *
 *   closed ──(2 consecutive failures | 3-of-5 RTT > 1200 ms)──▶ open
 *   open ──(cooldown elapsed, next call allowed)──▶ half-open
 *   half-open ──(probe ok)──▶ closed
 *   half-open ──(probe fails)──▶ open (cooldown restarts)
 *
 * The breaker is intentionally synchronous and clock-injectable so tests can
 * drive every transition without sleeping.
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerConfig {
  /** RTT above this counts as "slow". */
  rttThresholdMs: number;
  /** Rolling window size for the slow rule. */
  windowSize: number;
  /** Slow observations inside the window that trip the breaker. */
  slowCount: number;
  /** Consecutive hard failures that trip the breaker. */
  failThreshold: number;
  /** Time in `open` before a single probe is allowed (half-open). */
  cooldownMs: number;
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  rttThresholdMs: 1200,
  windowSize: 5,
  slowCount: 3,
  failThreshold: 2,
  cooldownMs: 5000,
};

export interface BreakerSnapshot {
  state: BreakerState;
  consecutiveFails: number;
  recentRttMs: number[];
  slowInWindow: number;
  openedAt: number | null;
  transitions: number;
  lastTransitionAt: number | null;
  lastTransitionReason: string | null;
  /** Client-side L3 rung: true only while the breaker is open. */
  edgeMode: boolean;
}

export type BreakerListener = (from: BreakerState, to: BreakerState, reason: string) => void;

export class CircuitBreaker {
  private currentState: BreakerState = "closed";
  private consecutiveFails = 0;
  private recent: { ok: boolean; rttMs: number }[] = [];
  private openedAt: number | null = null;
  private halfOpenInFlight = false;
  private transitions = 0;
  private lastTransitionAt: number | null = null;
  private lastTransitionReason: string | null = null;
  private readonly listeners = new Set<BreakerListener>();

  constructor(
    private readonly cfg: BreakerConfig = DEFAULT_BREAKER_CONFIG,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): BreakerState {
    return this.currentState;
  }

  onTransition(listener: BreakerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * May a call be attempted right now?
   * false → breaker open (cooldown not elapsed). Side effect: entering the
   * half-open window marks the single allowed probe as in flight.
   */
  allow(): boolean {
    this.maybeHalfOpen();
    if (this.currentState === "open") return false;
    if (this.currentState === "half-open") {
      if (this.halfOpenInFlight) return false;
      this.halfOpenInFlight = true;
      return true;
    }
    return true;
  }

  /** Record one observation (probe or tool call) and apply transitions. */
  observe(ok: boolean, rttMs: number, reason?: string): BreakerSnapshot {
    const at = this.now();

    if (this.currentState === "half-open") {
      this.halfOpenInFlight = false;
      if (ok) {
        this.transition("closed", reason ?? "half-open probe succeeded", at);
        this.resetCounters();
      } else {
        this.transition("open", reason ?? "half-open probe failed", at);
        this.openedAt = at;
      }
      return this.snapshot();
    }

    if (this.currentState === "open") {
      // Stray observation while open (e.g. a call raced the transition): record
      // nothing — the state machine only moves via cooldown or a half-open probe.
      return this.snapshot();
    }

    this.recent.push({ ok, rttMs });
    if (this.recent.length > this.cfg.windowSize) this.recent.shift();
    this.consecutiveFails = ok ? 0 : this.consecutiveFails + 1;

    const slowInWindow = this.recent.filter((o) => o.rttMs > this.cfg.rttThresholdMs).length;

    if (this.consecutiveFails >= this.cfg.failThreshold) {
      this.transition(
        "open",
        `${this.consecutiveFails} consecutive failures${reason ? ` (${reason})` : ""}`,
        at,
      );
      this.openedAt = at;
    } else if (slowInWindow >= this.cfg.slowCount) {
      this.transition(
        "open",
        `${slowInWindow} of last ${this.cfg.windowSize} observations slower than ${this.cfg.rttThresholdMs}ms`,
        at,
      );
      this.openedAt = at;
    }
    return this.snapshot();
  }

  /** Manual probe path: force a half-open window without waiting for cooldown. */
  forceHalfOpen(reason = "manual probe"): void {
    if (this.currentState === "open") {
      this.transition("half-open", reason, this.now());
      this.halfOpenInFlight = false;
    }
  }

  reset(): void {
    this.transition("closed", "manual reset", this.now());
    this.resetCounters();
  }

  snapshot(): BreakerSnapshot {
    this.maybeHalfOpen();
    return {
      state: this.currentState,
      consecutiveFails: this.consecutiveFails,
      recentRttMs: this.recent.map((o) => o.rttMs),
      slowInWindow: this.recent.filter((o) => o.rttMs > this.cfg.rttThresholdMs).length,
      openedAt: this.openedAt,
      transitions: this.transitions,
      lastTransitionAt: this.lastTransitionAt,
      lastTransitionReason: this.lastTransitionReason,
      edgeMode: this.currentState === "open",
    };
  }

  private maybeHalfOpen(): void {
    if (this.currentState !== "open" || this.openedAt === null) return;
    if (this.now() - this.openedAt >= this.cfg.cooldownMs) {
      this.transition("half-open", "cooldown elapsed, single probe allowed", this.now());
      this.halfOpenInFlight = false;
    }
  }

  private transition(to: BreakerState, reason: string, at: number): void {
    if (this.currentState === to) return;
    const from = this.currentState;
    this.currentState = to;
    this.transitions += 1;
    this.lastTransitionAt = at;
    this.lastTransitionReason = reason;
    if (to !== "open") this.openedAt = null;
    for (const l of this.listeners) {
      try {
        l(from, to, reason);
      } catch {
        /* listeners must not break the state machine */
      }
    }
  }

  private resetCounters(): void {
    this.consecutiveFails = 0;
    this.recent = [];
    this.halfOpenInFlight = false;
  }
}
