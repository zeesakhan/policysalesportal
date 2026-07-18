#!/usr/bin/env node
// Content-key extraction check (M0-T5): every `t('...', 'some.key')` /
// `t(locale, 'some.key')` reference in app code must exist in the EN
// reference catalog — a missing key would surface as a runtime defect
// (ARCHITECTURE §2: hardcoded customer-facing strings are a defect).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const en = JSON.parse(
  readFileSync('packages/shared/src/i18n/catalogs/en.json', 'utf8'),
);

const KEY_REF_RE = /\bt\(\s*[^,)]+,\s*'([a-z0-9_.]+)'\s*\)/g;

const files = execFileSync('git', ['ls-files', 'apps'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.spec.ts'));

const missing = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(KEY_REF_RE)) {
    if (en[match[1]] === undefined) missing.push(`${file}: ${match[1]}`);
  }
}

if (missing.length > 0) {
  console.error('i18n key check FAILED — referenced keys missing from EN catalog:');
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`i18n key check passed (${files.length} files scanned).`);
