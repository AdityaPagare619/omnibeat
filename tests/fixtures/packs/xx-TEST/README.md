# xx-TEST — dummy locale pack (T-TEST fixture)

Synthetic data-only pack used by acceptance test `AC16-pack-data-only`.
It exists to prove that adding a locale requires **data files and a manifest
only** (blueprint §7.1) — no code changes.

- Reviewer: none (T-TEST synthetic) → therefore `status: experimental`
  and a stricter T_play threshold applies (AC-06 / blueprint §7.1).
- Coverage: one synthetic collision-free fixture.
- Known gaps: everything; this is not a real locale.
