import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PackJson, PhoneticPack, RulesJson, TranslitJson } from "../src/index.js";
import { createPack } from "../src/index.js";

const packsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "packs");

export interface Fixture {
  input: string;
  expect: string;
  mode?: "peel" | "match";
}

function readJson<T>(...segments: string[]): T {
  return JSON.parse(readFileSync(join(packsDir, ...segments), "utf8")) as T;
}

export function listPacks(): string[] {
  return readdirSync(packsDir).filter((entry) =>
    statSync(join(packsDir, entry)).isDirectory(),
  );
}

export function loadPack(id: string): PhoneticPack {
  return createPack(
    readJson<PackJson>(id, "pack.json"),
    readJson<RulesJson>(id, "rules.json"),
    readJson<TranslitJson>(id, "translit.json"),
  );
}

export function loadFixtures(id: string): Fixture[] {
  const raw = readFileSync(join(packsDir, id, "fixtures.jsonl"), "utf8");
  return raw
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Fixture);
}

/** Title-case a peeled token list the way fixtures record expectations. */
export function titleCase(tokens: readonly string[]): string {
  return tokens
    .map((t) => (t.length === 0 ? t : t[0]!.toUpperCase() + t.slice(1)))
    .join(" ");
}
