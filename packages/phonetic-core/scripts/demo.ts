/**
 * Runnable demo — REAL computation, no hardcoded outputs.
 *   npm run demo
 *
 * Loads the hi-IN pack from packs/hi-IN/*.json and runs three sample
 * mangled inputs through peel → variants → skeletons → articulatory
 * distance → ranking. Every number printed is computed at run time
 * (source badge: LIVE; no network, no fixtures read here).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPack,
  explainQuery,
  peel,
  resolveSkeletons,
  type PackJson,
  type PhoneticPack,
  type RulesJson,
  type TranslitJson,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/scripts/demo.js → package root → packs/hi-IN
const packDir = join(here, "..", "..", "packs", "hi-IN");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(packDir, name), "utf8")) as T;
}

const pack: PhoneticPack = createPack(
  readJson<PackJson>("pack.json"),
  readJson<RulesJson>("rules.json"),
  readJson<TranslitJson>("translit.json"),
);

const CANDIDATES = [
  "Lollipop Lagelu",
  "Raja Ji",
  "Mujhe Tum Yaad Aana",
];

const SAMPLES = [
  "lolly pop la gelu",
  "roger g",
  "mujhe tum yaad aana chahiye via spotify",
];

const fmt = (n: number): string => n.toFixed(3);

console.log("OmniBeat phonetic-core demo — pack:", pack.id, "| mode: LIVE (computed)");
console.log("candidates:", CANDIDATES.map((c) => JSON.stringify(c)).join(", "));
console.log("");

for (const [index, query] of SAMPLES.entries()) {
  const context = explainQuery(query, pack);
  const peeled = peel(query, pack);
  console.log(`[sample ${index + 1}] input: ${JSON.stringify(query)}`);
  console.log(`  peeled tokens : ${JSON.stringify(peeled.tokens)}`);
  console.log(`  intent        : live=${peeled.intent.live} artist=${JSON.stringify(peeled.intent.artist)}`);
  console.log(`  variants (≤8) : ${JSON.stringify(context.variants)}`);
  for (const variant of context.variants.slice(0, 3)) {
    console.log(`    skeleton(${JSON.stringify(variant)})`);
  }

  const ranked = resolveSkeletons(query, CANDIDATES, pack);
  for (const [rank, match] of ranked.entries()) {
    console.log(
      `  rank ${rank + 1}: ${JSON.stringify(match.candidate)}` +
        `  distance=${fmt(match.distance)}` +
        `  variant=${JSON.stringify(match.variant)}` +
        `  q-sk=${JSON.stringify(match.querySkeleton)}` +
        `  c-sk=${JSON.stringify(match.candidateSkeleton)}` +
        `  meta-agree=${match.metaphone.agreement}`,
    );
  }
  console.log("");
}
