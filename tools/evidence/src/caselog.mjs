// caselog.mjs — single-case evidence record writer + completeness validation (E5 §4).
// A case record must carry every field of the E5 §4 table; validation fails loudly on gaps.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// E5 §4 field names (the §4 table rows, in order).
export const CASE_FIELDS = [
  'caseIdNamespace',
  'sourceClause',
  'scope',
  'precondition',
  'inputFault',
  'expected',
  'actual',
  'invariants',
  'evidence',
  'result',
  'evaluator',
  'defectsFollowUp',
];

export function validateCaseRecord(record) {
  const missing = [];
  const empty = [];
  for (const field of CASE_FIELDS) {
    if (!(field in record)) missing.push(field);
    else if (record[field] === null || record[field] === undefined || record[field] === '') {
      empty.push(field);
    }
  }
  const validResult = ['PASS', 'FAIL', 'BLOCKED', 'NOT RUN', 'DEFERRED'].includes(record.result);
  return {
    valid: missing.length === 0 && empty.length === 0 && validResult,
    missing,
    empty,
    invalidResult: validResult ? null : record.result,
  };
}

export async function writeCaseRecord(casesDir, record) {
  const check = validateCaseRecord(record);
  if (!check.valid) {
    throw new Error(
      `case record ${record.caseIdNamespace ?? '<unknown>'} is incomplete: missing=[${check.missing}] empty=[${check.empty}] invalidResult=${check.invalidResult}`,
    );
  }
  await mkdir(casesDir, { recursive: true });
  const fileName = `${record.caseIdNamespace.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`;
  const filePath = path.join(casesDir, fileName);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return { filePath, fileName };
}
