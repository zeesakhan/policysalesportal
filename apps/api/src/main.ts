import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertNoPlaceholderConfig } from './config/placeholder-guard';

async function bootstrap(): Promise<void> {
  // CLAUDE.md §2: the system must refuse to start in production mode while any
  // PLACEHOLDER_ config value remains. M0-T4 extends this to the rules-engine
  // config register; from M0-T1 it already covers the process environment.
  assertNoPlaceholderConfig(process.env);

  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`Policy Sales Portal API listening on :${port}`);
}

void bootstrap();
