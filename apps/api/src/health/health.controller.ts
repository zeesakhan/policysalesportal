import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: 'psp-api';
  time: string;
}

@Controller('health')
export class HealthController {
  @Get()
  health(): HealthStatus {
    return { status: 'ok', service: 'psp-api', time: new Date().toISOString() };
  }
}
