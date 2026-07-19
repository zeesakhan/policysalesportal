import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports ok with service identity and timestamp', () => {
    const result = new HealthController().health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('psp-api');
    expect(new Date(result.time).getTime()).not.toBeNaN();
  });
});
