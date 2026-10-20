/**
 * Metadata hygiene - blueprint 5.6 untrusted-data rule: titles/artists/album
 * metadata come from the open web and are DATA, never instructions.
 * Strip control characters and markdown, cap lengths, mark `untrusted: true`.
 */
import type { Track } from "@omnibeat/schemas";

export const MAX_TEXT_FIELD = 200;

// C0/C1 controls except tab/newline (those get collapsed by whitespace
// normalisation below), plus zero-width and BOM characters.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g;
// Markdown emphasis/code markers that a hostile title could carry.
const MARKDOWN_CHARS = /[*`~#]+/g;
const WHITESPACE = /\s+/g;

/** Sanitize one untrusted web text field. Never returns an empty string. */
export function sanitizeWebText(value: string, maxLength = MAX_TEXT_FIELD): string {
  const cleaned = value
    .replace(CONTROL_CHARS, "")
    .replace(MARKDOWN_CHARS, "")
    .replace(WHITESPACE, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned.length > 0 ? cleaned : "unknown";
}

/**
 * Sanitize every text field of a Track and stamp `untrusted: true`
 * (AC-09 / blueprint 5.6). artwork_url is left as the provider sent it - it is
 * validated by the contract schema's URL rule.
 */
export function sanitizeTrack(track: Track): Track {
  const out: Track = {
    ...track,
    title: sanitizeWebText(track.title),
    artist: sanitizeWebText(track.artist),
    untrusted: true,
  };
  if (track.language !== undefined) out.language = sanitizeWebText(track.language, 64);
  return out;
}
