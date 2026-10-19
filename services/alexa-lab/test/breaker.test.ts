import { describe, expect, it } from "vitest";
import { CircuitBreaker, DEFAULT_BREAKER_CONFIG, type BreakerState } from "../src/breaker.js";

function makeBreaker(cooldownMs = 5000) {
  let clock = 0;
  const breaker = new CircuitBreaker(
    { ...DEFAULT_BREAKER_CONFIG, cooldownMs },
    () => clock,
  );
  return {
    breaker,
    advance: (ms: number) => {
      clock += ms;
    },
    transitions: [] as string[],
  };
}

describe("circuit breaker — closed → open → half-open → closed", () => {
  it("opens after 2 consecutive failures and reports edge mode", () => {
    const { breaker, transitions } = makeBreaker();
    breaker.onTransition((from, to) => transitions.push(`${from}->${to}`));
    const seen: BreakerState[] = [];

    expect(breaker.allow()).toBe(true);
    expect(breaker.observe(false, 5, "ECONNREFUSED").state).toBe("closed");
    seen.push(breaker.state);

    const opened = breaker.observe(false, 5, "ECONNREFUSED");
    seen.push(opened.state);
    expect(seen).toEqual(["closed", "open"]);
    expect(opened.edgeMode).toBe(true);
    expect(opened.lastTransitionReason).toContain("2 consecutive failures");
    expect(transitions).toEqual(["closed->open"]);
  });

  it("opens when 3 of the last 5 observations exceed 1200ms RTT", () => {
    const { breaker } = makeBreaker();
    expect(breaker.observe(true, 1500).state).toBe("closed"); // slow 1/5
    expect(breaker.observe(true, 300).state).toBe("closed");
    expect(breaker.observe(true, 1400).state).toBe("closed"); // slow 2/5
    expect(breaker.observe(true, 200).state).toBe("closed");
    expect(breaker.observe(true, 1300).state).toBe("open"); // slow 3/5 → trip
    const snap = breaker.snapshot();
    expect(snap.slowInWindow).toBeGreaterThanOrEqual(3);
    expect(snap.lastTransitionReason).toContain("slower than 1200ms");
    expect(snap.edgeMode).toBe(true);
  });

  it("stays open during cooldown, half-opens after it, closes on a good probe", () => {
    const { breaker, advance } = makeBreaker(5000);
    breaker.observe(false, 5);
    breaker.observe(false, 5);
    expect(breaker.state).toBe("open");

    // Cooldown not elapsed: calls are refused, no probe dial happens.
    advance(4999);
    expect(breaker.allow()).toBe(false);
    expect(breaker.state).toBe("open");

    // Cooldown elapsed: exactly one probe is allowed through.
    advance(2);
    expect(breaker.allow()).toBe(true);
    expect(breaker.state).toBe("half-open");
    expect(breaker.allow()).toBe(false); // single-flight: second caller waits

    expect(breaker.observe(true, 90).state).toBe("closed");
    expect(breaker.snapshot().edgeMode).toBe(false);
    expect(breaker.allow()).toBe(true);
  });

  it("re-opens when the half-open probe fails", () => {
    const { breaker, advance } = makeBreaker(1000);
    breaker.observe(false, 5);
    breaker.observe(false, 5);
    advance(1001);
    expect(breaker.allow()).toBe(true);
    expect(breaker.state).toBe("half-open");

    const snap = breaker.observe(false, 3000, "half-open probe failed");
    expect(snap.state).toBe("open");
    expect(snap.edgeMode).toBe(true);
    // Cooldown restarts from this failure.
    expect(breaker.allow()).toBe(false);
    advance(1001);
    expect(breaker.allow()).toBe(true);
    expect(breaker.state).toBe("half-open");
  });

  it("records every transition with a reason", () => {
    const { breaker, advance } = makeBreaker(100);
    const log: { from: string; to: string; reason: string }[] = [];
    breaker.onTransition((from, to, reason) => log.push({ from, to, reason }));

    breaker.observe(false, 1);
    breaker.observe(false, 1); // open
    advance(101);
    breaker.allow(); // half-open
    breaker.observe(true, 50); // closed

    expect(log.map((l) => `${l.from}->${l.to}`)).toEqual([
      "closed->open",
      "open->half-open",
      "half-open->closed",
    ]);
    expect(log[0]?.reason).toContain("consecutive failures");
    expect(log[2]?.reason).toContain("half-open probe succeeded");
    expect(breaker.snapshot().transitions).toBe(3);
  });
});
