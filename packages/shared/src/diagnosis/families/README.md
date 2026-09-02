# Diagnosis code family catalogs

One file per `docs/diagnose.md` §II family (`rb.ts`, `bv.ts`, `ms.ts`, `ta.ts`,
`ca.ts`, `tm.ts`, `mx.ts`, `op.ts`, `ev.ts`, `st.ts`, `pw.ts`, `at.ts`,
`df.ts`, `cv.ts`, `eg.ts`, `ps.ts`, `lr.ts`, `pd.ts`), each exporting a
`readonly DiagnosisCodeEntry[]` named `<FAMILY>_CODES` (e.g. `RB_CODES`), plus
a colocated `<family>.test.ts`.

## What comes straight from the spec

`id`, `label`, `diagnosis` and `ratingPrior` are transcribed **verbatim** from
the family's own table in `docs/diagnose.md` §II — mechanical, not
paraphrased. `family` is the two-letter prefix of `id`.

## What the spec's tables don't give you

The spec's tables have no `directions` / `evidenceTrack` / `detectability` /
`parentCategory` columns — `docs/plan.md` Task 52.2 asks the implementer to
assign them. To keep 410 rows consistent instead of 410 individual judgment
calls, use these mechanical rules:

### `detectability`

- `family === 'RB'` → `'probe'` (§DQ-17: online play blocks illegal moves, so
  rules knowledge cannot be tested in games).
- `id` is `MX-01`, `MX-02`, or `MX-03` → `'unsupported'`.
- Everything else → `'dialogue'`.

### `directions`

- `family === 'TA'` → `['O', 'D']` (§E's own intro: "Test offensive and
  defensive directions separately").
- `family === 'AT'` → `['O']` (attacking play is the offensive application).
- `family === 'DF'` → `['D']` (defensive play is the defensive application).
- `family === 'BV'` → label starts with `'Own'` → `['D']`; starts with
  `'Opponent'` → `['O']`; otherwise `['B']` (a board-vision gap impairs both
  spotting your own exposure and spotting the opponent's).
- Every other family → label starts with `'Own-'` or `'Own '` → `['O']`;
  starts with `'Opponent-'` or `'Opponent '` → `['D']`; otherwise `['N']`.
- Two manual exceptions (the rule above gives the wrong answer): `LR-03`
  (`Offensive-tactics-only imbalance`) and `LR-04` (`Defensive-tactics
  training gap`) → `['B']` — both describe an O/D *imbalance* itself, not a
  single direction.

### `evidenceTrack`

- `family === 'RB'` → `'knowledge_inventory'`.
- `family === 'PS'` → `'state_finding'`.
- `family === 'MX'` or `family === 'LR'` → `'process_finding'`.
- Everything else: `ratingPrior[0] >= 1400` → `'curriculum_only_gap'` (rare,
  high-rating-only content has little game exposure for most students);
  otherwise → `'game_leak'`.

### `parentCategory`

One constant per family (this only has to keep the existing 13-value
dashboard non-broken — the `id` carries the real precision, per
`docs/plan.md`'s `DiagnosisCodeEntry` note):

| Family | `parentCategory` |
|---|---|
| RB | `calculation_error` |
| BV | `hanging_piece` |
| MS | `calculation_error` |
| TA | `missed_tactic` |
| CA | `calculation_error` |
| TM | `time_management` |
| MX | `premature_action` |
| OP | `opening_knowledge` |
| EV | `calculation_error` |
| ST | `no_plan` |
| PW | `pawn_structure` |
| AT | `piece_activity` |
| DF | `king_safety` |
| CV | `no_plan` |
| EG | `endgame_technique` |
| PS | `premature_action` |
| LR | `no_plan` |
| PD | `no_plan` |

## Adding a family file

1. Read only that family's table in `docs/diagnose.md` §II (see `docs/plan.md`
   Task 52.2's own family → section mapping).
2. Transcribe `id`/`label`/`diagnosis`/`ratingPrior` verbatim; apply the rules
   above for the other four fields.
3. Every entry must satisfy `DiagnosisCodeEntrySchema` (`../catalog-types.ts`).
4. Test: array length matches `DIAGNOSIS_FAMILY_CODE_COUNTS[family]`, every id
   is unique and family-prefixed, and `DiagnosisCodeEntrySchema.parse` doesn't
   throw for any entry.
5. Do **not** touch `../index.ts` — it aggregates all 18 families in one pass
   once every family file exists, to avoid 18 conflicting edits to one file.
