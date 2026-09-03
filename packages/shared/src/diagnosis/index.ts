import type { DiagnosisCodeEntry, DiagnosisCodeId } from './catalog-types.js';
import { AT_CODES } from './families/at.js';
import { BV_CODES } from './families/bv.js';
import { CA_CODES } from './families/ca.js';
import { CV_CODES } from './families/cv.js';
import { DF_CODES } from './families/df.js';
import { EG_CODES } from './families/eg.js';
import { EV_CODES } from './families/ev.js';
import { LR_CODES } from './families/lr.js';
import { MS_CODES } from './families/ms.js';
import { MX_CODES } from './families/mx.js';
import { OP_CODES } from './families/op.js';
import { PD_CODES } from './families/pd.js';
import { PS_CODES } from './families/ps.js';
import { PW_CODES } from './families/pw.js';
import { RB_CODES } from './families/rb.js';
import { ST_CODES } from './families/st.js';
import { TA_CODES } from './families/ta.js';
import { TM_CODES } from './families/tm.js';

export * from './api.js';
export * from './axes.js';
export * from './catalog-types.js';
export * from './data-quality.js';
export * from './families/at.js';
export * from './families/bv.js';
export * from './families/ca.js';
export * from './families/cv.js';
export * from './families/df.js';
export * from './families/eg.js';
export * from './families/ev.js';
export * from './families/lr.js';
export * from './families/ms.js';
export * from './families/mx.js';
export * from './families/op.js';
export * from './families/pd.js';
export * from './families/ps.js';
export * from './families/pw.js';
export * from './families/rb.js';
export * from './families/st.js';
export * from './families/ta.js';
export * from './families/tm.js';
export * from './ref.js';

/** The full 410-code catalog, docs/diagnose.md §II.A–R in full — Task 52.2. */
export const ALL_DIAGNOSIS_CODES: readonly DiagnosisCodeEntry[] = [
  ...RB_CODES,
  ...BV_CODES,
  ...MS_CODES,
  ...TA_CODES,
  ...CA_CODES,
  ...TM_CODES,
  ...MX_CODES,
  ...OP_CODES,
  ...EV_CODES,
  ...ST_CODES,
  ...PW_CODES,
  ...AT_CODES,
  ...DF_CODES,
  ...CV_CODES,
  ...EG_CODES,
  ...PS_CODES,
  ...LR_CODES,
  ...PD_CODES
];

export const DIAGNOSIS_CODES_BY_ID: ReadonlyMap<DiagnosisCodeId, DiagnosisCodeEntry> = new Map(
  ALL_DIAGNOSIS_CODES.map((entry) => [entry.id, entry])
);
