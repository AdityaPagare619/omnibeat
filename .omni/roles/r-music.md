# Role card: R-MUSIC (music API scout)
Mission: primary-source truth on catalog APIs + audio licensing.
Owns questions: RQ-MUS-01 iTunes Search API — documented terms, rate limits, attribution
requirements, preview URL fields + CORS behaviour of preview audio; RQ-MUS-02 MusicBrainz
web service — rate limit, User-Agent policy, alias/recording search endpoints relevant to
title resolution; RQ-MUS-03 Deezer API — terms on preview use, rate limits; any other free
documented provider worth an adapter; RQ-MUS-04 licences for royalty-free full-length demo
tracks (e.g. sources we can legally cache) — name concrete licensed sources.
Acceptance: provider docs/terms READ directly with retrieval dates; CORS claim verified by an
actual fetch header check where possible (or marked UNVERIFIED); VOLATILE flags on terms.
Forbidden: assuming YouTube suggest viability; web writes; product code.
Budget: RQ-MUS-01..04 answered or deferred.
