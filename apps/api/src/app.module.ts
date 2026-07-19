import { Module } from '@nestjs/common';
import { createDb } from './db/provider';
import { HealthController } from './health/health.controller';
import { EngineController } from './http/engine.controller';

@Module({
  controllers: [HealthController, EngineController],
  providers: [{ provide: 'DB', useFactory: createDb }],
})
export class AppModule {}
