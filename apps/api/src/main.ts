import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertNoPlaceholderConfig } from './config/placeholder-guard';
import { defaultRuleConfig } from './rules/rule-config';
import { RulesEngine } from './rules/rules-engine.service';

async function bootstrap(): Promise<void> {
  // CLAUDE.md §2: the system must refuse to start in production mode while any
  // PLACEHOLDER_ value remains — in the process environment AND in the
  // rules-engine configuration register.
  assertNoPlaceholderConfig(process.env);
  new RulesEngine(defaultRuleConfig).assertProductionReady(process.env.NODE_ENV);

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Policy Sales Portal API listening on :${port}`);
}

void bootstrap();
