import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderConfigRegister } from './config-register';
import { defaultRuleConfig } from './rule-config';

const outPath = resolve(process.argv[2] ?? 'docs/build/CONFIG-REGISTER.md');
writeFileSync(outPath, renderConfigRegister(defaultRuleConfig, new Date()));
console.log(`CONFIG-REGISTER written to ${outPath}`);
