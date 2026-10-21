# Audio & data licences

Rule: nothing in this repo redistributes commercial audio.

## Provider previews (iTunes Search API, streamed only)
30-second previews are streamed from Apple's public preview endpoints under the
iTunes Search API terms ("provided courtesy of iTunes"; streamed only — never
downloaded, saved, or cached to disk). The MCP server's hook clips are ephemeral
in-memory only. Evidence: research/claims/INDEX.md CLM-MUS-001..004.

## Offline-cache demo tracks (Continuity act)
Only explicitly licensed royalty-free tracks are eligible for the on-disk cache:
- Pixabay Content Licence — download + cache + commercial use permitted,
  no attribution required (CLM-MUS-014).
- Incompetech (Kevin MacLeod) — CC BY 4.0, attribution strings kept alongside
  each cached track (CLM-MUS-016).

## Not used
- Deezer audio — their guidelines forbid local/offline storage of any audio
  (CLM-MUS-012); the adapter ships demoted/optional and caches nothing.
- YouTube suggest endpoints — undocumented and prohibited by Google's scraping
  policies (CLM-MUS-018); cut from the product.

## Locale-pack data
phonetic-core packs contain hand-authored phonetic rules and transliteration
tables only — no copyrighted lyrics, no extracted dataset content. Pack fixtures
are synthetic ASR-style transcripts written by the team.
