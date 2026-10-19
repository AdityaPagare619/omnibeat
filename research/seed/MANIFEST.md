# Seed manifest - research/seed/

Generated: 2026-10-19T12:25:15.7731738Z

| file | sha256 | bytes | status |
|---|---|---|---|
| DOCUMENT 6_ EDGE DSP ENGINE, DYNAMIC CHORUS HOOK EXTRACTOR & OFFLINE BUNKER.txt | `58ce377eb50f5212e61177f61111db58e03dacc702e50515b8c7ae6df538776e` | 46403 | PRESENT |
| GROUND-TRUTH-AND-IDEA-BANK.md | `9c07ca3208217d8a22dc5684c7fc550bf93b50968048949671eb6bc71ade7a25` | 20955 | PRESENT |
| I WOULD REQUEST YOU NOW SEE USE THESE FOR YOUR-SE....txt | `ff99ff0dc2bf7b7f60d448a1f84b4b7f8f0913aab7b52b9c21c862d15e0b0e7b` | 53798 | PRESENT |
| MASTER-BLUEPRINT.txt | `7aa6541468ef971217a483af3ff947879b6ff9b8180a932834b0374f62cc0ecc` | 32640 | PRESENT |
| omnibeat-v2-final-architecture.md | `efb3c6d80c183dd2066514b1b05e4b20a6b3997cf8fef08b83fb97af77fda46d` | 16317 | PRESENT |
| PILLAR-1.txt | `747bdbd7c21457d9642e3f0b729737093bf6db589294eb5959892b126930e3e5` | 4252 | PRESENT |
| RESEARCH-THESIS-1.txt | `f39c5cd2678a8f95691e37b5427d09e3959346338ea7ffc42aa458468361bbc8` | 4252 | PRESENT |
| SPIRIT.txt | `13c3b974dfb17cde0a89cbed7283c47683170bd0bbe522d1d5ed42374f9d3337` | 1504 | PRESENT |
| WORKING-STYLE-METHODOLOGY.txt | `1b101da2e441affef9d9fb59417812f752dbbc22aff93054438c3a3616d1cbf6` | 12588 | PRESENT |
| Yes, generate the complete standalone open-source....txt | `60220ab857c8c0b82ed8209b60ff76cdd22c9dcabe8ca4de1ae911c403ab140f` | 30767 | PRESENT |
| MASTER-BLUEPRINT.docx | - | - | MISSING (only .txt supplied) |
| THESE_DOC_WAS_CREATED_BEFORE_MASTER_BLUEPRINT.docx | - | - | MISSING (never supplied) |
| DOCUMENT_7 (tactile studio web app) | - | - | MISSING |
| DOCUMENT_8 (automated red-team harness) | - | - | MISSING |
| DOCUMENT_9 (Makefile runbook / rubric map) | - | - | MISSING |
| Principal systems bible documents 1-5 | - | - | UNVERIFIED (possibly contained in MASTER-BLUEPRINT.txt; DOC-JUDGE to confirm) |
| polyglot-phonetic-judo package | - | - | MISSING |

---

## DOC-JUDGE AUDIT APPENDIX (2026-10-19, branch agent/doc-judge/p0-audit)

Corrections discovered while auditing (original rows left intact; see research/AUDIT_OF_PRIOR_RESEARCH.md §2-§3 for receipts):

1. **Hash rows for GROUND-TRUTH-AND-IDEA-BANK.md and omnibeat-v2-final-architecture.md match LF-normalised content, not the delivered CRLF bytes.** Raw-file SHA-256: `6cd0cee7990b992deeb54d7f9f5d852a476e39bba3f2b013b53410460dab77859` (21,101 B) and `a6f62d6f5ea54710c5958022ad2c5815f6899dbc4e7638a104ed58e00d80e411` (16,501 B). Re-hashing after CRLF→LF reproduces the original manifest values exactly. Process fix: hash LF-normalised content and state that, or hash raw bytes at generation time.
2. **DOCUMENT_7, DOCUMENT_8 and DOCUMENT_9 are missing as standalone files but their content is PRESENT** inside `DOCUMENT 6_ EDGE DSP ENGINE...txt` (section headers at lines 260, 970, 1113). Any scope that assumed the content was lost is wrong.
3. **"Principal systems bible documents 1-5" are PRESENT** in `I WOULD REQUEST YOU NOW SEE USE THESE FOR YOUR-SE....txt` (Docs 1-5 at lines 4, 35, 171, 298, 351) — not in MASTER-BLUEPRINT.txt as the row above guessed.
4. **The polyglot-phonetic-judo package is missing as a package directory, but its full source, tsconfig, 25-test spec and README are PRESENT** in `Yes, generate the complete standalone open-source....txt` (lines 11-774). Extracted and executed by this audit: **6 of 25 tests pass**; see audit findings F-01..F-03.
5. **MASTER-BLUEPRINT.txt is truncated**: it announces "5 mandatory rules" (line 440) but ends at rule 4 (444 lines total).
6. **RESEARCH-THESIS-1.txt contains 2 recipes, not the 5 the Charter describes**, and no "Kitchen Panic" framing.
