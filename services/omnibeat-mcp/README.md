# omnibeat-mcp (Phase P1)

OmniBeat MCP server — Streamable HTTP (spec `2025-11-25`), default `:8080`,
endpoint `POST /mcp`. Tool contract is generated from `@omnibeat/schemas`
(8 tools, inputSchema+outputSchema from JSON Schema files).

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest smoke suite: 7 tests, real HTTP on :8099
npm start          # node dist/index.js  (port 8080)
```

- Health: `GET /healthz` — Probe: `node scripts/probe.mjs [baseUrl]`
- Fixtures: `npm run capture-fixtures` -> `fixtures/catalog-replay/catalog.json`
- `OMNIBEAT_REPLAY_ONLY=1` forces fixture sources (evidence badged REPLAY);
  without it, live iTunes/MusicBrainz calls are badged LIVE in `evidence[]`.
- Guards: missing/wrong `MCP-Protocol-Version` -> 400, unknown session -> 404,
  `Origin` mismatch -> 403.
- Live run outputs and honest gaps: see [PROOF.md](./PROOF.md).
