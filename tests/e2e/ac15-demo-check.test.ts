/**
 * AC15-demo-check — Charter Part 8.5 AC-15 (blueprint §11.4 reliability of the demo itself).
 *
 * `make demo-check` passes the four-act smoke test in LIVE, FIXTURE and REPLAY
 * modes. Each mode is its own stable test id so a mode-specific failure is
 * unambiguous in the receipt.
 *
 * depends: ARCH contract v0 / J-DEMO — the demo-check target's exit contract and
 * where per-act transcripts land.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function runDemoCheck(mode: "LIVE" | "FIXTURE" | "REPLAY"): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = await execFileAsync("make", ["demo-check"], {
      cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      env: { ...process.env, OMNIBEAT_DEMO_MODE: mode },
      timeout: 120_000,
    });
    return { stdout, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; code?: number; message: string };
    return { stdout: e.stdout ?? "", code: e.code ?? 1 };
  }
}

describe("AC15-demo-check", () => {
  it("AC15-demo-check/live: make demo-check passes the 4-act smoke in LIVE mode", async () => {
    const { code, stdout } = await runDemoCheck("LIVE");
    expect(code, `make demo-check (LIVE) must exit 0; output tail:\n${stdout.slice(-2000)}`).toBe(0);
    // TODO harness (Phase 2): assert the 4 acts each report PASS in stdout, not just exit 0,
    // once J-DEMO fixes the demo-check output format (depends: ARCH/J-DEMO contract v0).
  });

  it("AC15-demo-check/fixture: make demo-check passes the 4-act smoke in FIXTURE mode", async () => {
    const { code, stdout } = await runDemoCheck("FIXTURE");
    expect(code, `make demo-check (FIXTURE) must exit 0; output tail:\n${stdout.slice(-2000)}`).toBe(0);
  });

  it("AC15-demo-check/replay: make demo-check passes the 4-act smoke in REPLAY mode", async () => {
    const { code, stdout } = await runDemoCheck("REPLAY");
    expect(code, `make demo-check (REPLAY) must exit 0; output tail:\n${stdout.slice(-2000)}`).toBe(0);
  });
});
