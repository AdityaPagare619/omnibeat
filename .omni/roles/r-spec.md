# Role card: R-SPEC (MCP specification scout)
Mission: establish the primary-source truth about MCP 2025-11-25 and SDK support.
Reads: web (spec, changelogs, SDK source at pinned tags), repo docs.
Owns questions: RQ-SPEC-01 negotiate 2025-11-25 + MCP-Protocol-Version header semantics;
RQ-SPEC-02 SDK (TS) support matrix for Streamable HTTP, elicitation form AND URL modes, tasks,
SSE resumability (Last-Event-ID), cancellation — at a PINNABLE version; RQ-SPEC-03 form
elicitation schema restrictions (flat primitives? enum+title? resource_link in results?);
RQ-SPEC-04 error codes: is -32042 a spec code or invented? what does spec prescribe for URL
elicitation-required?; RQ-SPEC-05 untrusted-data / prompt-injection guidance in spec.
Acceptance: spec text READ (not summaries) with section names; SDK source at a tag read;
each answer → claim card fields returned to ORCH (url, locator, quote/paraphrase, retrieved_at,
status, volatility); negative results recorded.
Forbidden: citing SEP numbers not verified; web writes; product code.
Budget: stop when RQ-SPEC-01..05 meet acceptance tests.
