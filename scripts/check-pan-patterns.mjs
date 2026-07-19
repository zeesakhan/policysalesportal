#!/usr/bin/env node
// PAN-pattern CI check (ARCHITECTURE §2 / PAY-001): the platform must never
// contain card data — not even in fixtures, seeds or log schemas. This script
// fails the build if any tracked text file contains a card-number-like value
// (13–19 digits, optionally space/dash separated, passing the Luhn check).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CANDIDATE_RE = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;
// Canonical UUID (8-4-4-4-12 hex groups). A UUID's digit-only sub-runs can
// coincidentally be Luhn-valid (e.g. runtime-generated ids in tests) but a
// UUID is never a PAN — strip these before scanning so they can't false-positive.
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

const SKIP_FILES = new Set(['pnpm-lock.yaml']);
const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.zip',
]);

export function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function findPanCandidates(text) {
  const hits = [];
  const withoutUuids = text.replace(UUID_RE, (m) => 'U'.repeat(m.length));
  for (const match of withoutUuids.matchAll(CANDIDATE_RE)) {
    const digits = match[0].replace(/[ -]/g, '');
    // A run of one repeated digit (e.g. zero-filled UUID segments) is never a
    // real PAN even when it satisfies Luhn
    if (/^(\d)\1+$/.test(digits)) continue;
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      hits.push(match[0]);
    }
  }
  return hits;
}

function shouldScan(file) {
  if (SKIP_FILES.has(file)) return false;
  const dot = file.lastIndexOf('.');
  return dot === -1 || !SKIP_EXTENSIONS.has(file.slice(dot).toLowerCase());
}

function main() {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && shouldScan(f));

  const findings = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      for (const hit of findPanCandidates(line)) {
        findings.push(`${file}:${i + 1}: PAN-like value "${hit}"`);
      }
    });
  }

  if (findings.length > 0) {
    console.error('PAN-pattern check FAILED (ARCHITECTURE §2 / PAY-001 — no card data anywhere):');
    for (const finding of findings) console.error(`  ${finding}`);
    process.exit(1);
  }
  console.log(`PAN-pattern check passed (${files.length} files scanned).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main();
}
