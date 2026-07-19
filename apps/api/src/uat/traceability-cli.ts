import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * UAT-PLAN §1: "traceability matrix is a build artifact" — generated from the
 * scenario spec files themselves, so it can never drift from what actually
 * runs. Parses `// rules: <IDS>` comments immediately preceding each
 * `it('U-XX ...')` in apps/api/src/uat/scenarios/*.uat.spec.ts.
 */
interface Row {
  scenario: string;
  title: string;
  ruleIds: string[];
  testFile: string;
}

function parseFile(path: string, text: string): Row[] {
  const rows: Row[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const itMatch = /^\s*it\(\s*'(U-\d+)\s+([^']*)'/.exec(lines[i]!);
    if (!itMatch) continue;
    let ruleIds: string[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const ruleMatch = /^\s*\/\/\s*rules:\s*(.+)$/.exec(lines[j]!);
      if (ruleMatch) {
        ruleIds = ruleMatch[1]!.split(',').map((s) => s.trim());
        break;
      }
      if (!/^\s*$/.test(lines[j]!) && !/^\s*(describe|it)\(/.test(lines[j]!)) break;
    }
    rows.push({ scenario: itMatch[1]!, title: itMatch[2]!.trim(), ruleIds, testFile: path });
  }
  return rows;
}

function main(): void {
  const repoRoot = resolve(process.argv[3] ?? '.');
  const outPath = resolve(process.argv[2] ?? 'uat/matrix/TRACEABILITY.md');
  const scenariosDir = resolve(repoRoot, 'apps/api/src/uat/scenarios');
  const files = readdirSync(scenariosDir).filter((f) => f.endsWith('.uat.spec.ts'));

  const allRows: Row[] = [];
  for (const file of files) {
    const relPath = `apps/api/src/uat/scenarios/${file}`;
    const text = readFileSync(resolve(scenariosDir, file), 'utf8');
    allRows.push(...parseFile(relPath, text));
  }
  allRows.sort((a, b) =>
    a.scenario.localeCompare(b.scenario, undefined, { numeric: true }),
  );

  const unmapped = allRows.filter((r) => r.ruleIds.length === 0);
  const rows = allRows
    .map(
      (r) =>
        `| ${r.scenario} | ${r.title} | ${r.ruleIds.join(', ') || '**UNMAPPED**'} | \`${r.testFile}\` |`,
    )
    .join('\n');

  const md = `# UAT Traceability Matrix (generated)
Source of scenarios: WP-12 Part B. Generated from \`apps/api/src/uat/scenarios/*.uat.spec.ts\` — do not edit by hand;
run \`pnpm gen:traceability\`.

Total scenarios automated: **${allRows.length}**. Unmapped (no rule-ID citation): **${unmapped.length}**.

| Scenario | Title | Rule IDs | Test file |
|---|---|---|---|
${rows}
`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  console.log(`Traceability matrix written to ${outPath} (${allRows.length} scenarios, ${unmapped.length} unmapped)`);
  if (unmapped.length > 0) process.exitCode = 1;
}

main();
