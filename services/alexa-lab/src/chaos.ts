/**
 * Chaos injection for the demo (tests/chaos/FAULT_PLAN.md).
 *
 * `POST /chaos {latencyMs?, failNext?}` arms faults that are *really* applied:
 *  - latencyMs: the caller genuinely waits that long before the network call
 *    (so the circuit breaker observes a real, inflated RTT);
 *  - failNext: the next N network calls are rejected before dialing, with an
 *    unmistakably-labelled CHAOS_INJECTED error — never dressed up as a
 *    genuine upstream failure.
 */
export class ChaosError extends Error {
  readonly code = "CHAOS_INJECTED" as const;
  readonly injected = true;
  constructor(message: string) {
    super(message);
    this.name = "ChaosError";
  }
}

export interface ChaosSnapshot {
  latencyMs: number;
  failNext: number;
  injections: number;
}

export class ChaosController {
  latencyMs = 0;
  failNext = 0;
  injections = 0;

  set(next: { latencyMs?: number; failNext?: number }): ChaosSnapshot {
    if (next.latencyMs !== undefined) this.latencyMs = Math.max(0, Math.floor(next.latencyMs));
    if (next.failNext !== undefined) this.failNext = Math.max(0, Math.floor(next.failNext));
    return this.snapshot();
  }

  clear(): ChaosSnapshot {
    this.latencyMs = 0;
    this.failNext = 0;
    return this.snapshot();
  }

  snapshot(): ChaosSnapshot {
    return { latencyMs: this.latencyMs, failNext: this.failNext, injections: this.injections };
  }

  /** Gate every outbound network call (health probes and MCP calls alike). */
  async gate(): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      this.injections += 1;
      throw new ChaosError("chaos: failNext injected before dialing (demo control)");
    }
    if (this.latencyMs > 0) {
      this.injections += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
