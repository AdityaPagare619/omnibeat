# es-US phonetic pack — EXPERIMENTAL

**Status: experimental.** US-Spanish code-switched queries (Latin script).

## Coverage
- Accent normalizations: á/é/í/ó/ú/ü/ñ→base, ¿/¡ stripped, yeísmo alias
  **ll→y** ("llamas" ≡ "yamas"); digraphs ch rr qu gu; vowels aa ee oo ii uu.
- Grammar: wake (oye/alexa), verbs (reproduce/pon/busca…), providers,
  fillers (por/favor/la/el/de/en/cancion…), intents live→"vivo"/remix/
  acoustic/original→"oficial"/by-artist.
- 12 fixtures incl. mangled "despasito", "dansa kuduro", "ya no me yamas".

## Known gaps (honest)
- ñ→n is lossy for display ("año"→"ano"); "de" not an artist marker (would
  eat titles); b/v and seseo/ceceo not modeled; voseo verbs not stripped.

## Reviewer needed
Spanish reviewer must vet ll→y display loss, filler list ("de"/"y" occur
inside titles), and "vivo" as live-hint before any demo claims.
