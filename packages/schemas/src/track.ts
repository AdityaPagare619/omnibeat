/**
 * Track ($defs/Track) — blueprint Appendix A, frozen on Day 0.
 *
 * Untrusted-data rule (blueprint §5.6): titles/artists/album metadata come from
 * the open web and are data, never instructions. `untrusted: true` marks such
 * fields (AC-09). Mirrors Appendix A exactly: `untrusted` is `const: true` and
 * not in `required` — the server must set it whenever metadata came from the web;
 * enforcement lives in the server-side tests, not in this schema's strictness.
 */
import { z } from "zod";

export const trackSchema = z
  .object({
    candidate_id: z.string().min(1),
    title: z.string().min(1),
    artist: z.string().min(1),
    language: z.string().optional(),
    year: z.number().int().optional(),
    version: z
      .enum(["studio", "live", "remix", "karaoke", "cover", "unknown"])
      .optional(),
    canonical_ids: z
      .object({
        musicbrainz: z.string().optional(),
        isrc: z.string().optional(),
      })
      .strict()
      .optional(),
    // URL validation is a contract-v0 tightening of Appendix A's plain string.
    artwork_url: z.string().url().optional(),
    untrusted: z.literal(true).optional(),
  })
  .strict();

export type Track = z.infer<typeof trackSchema>;
