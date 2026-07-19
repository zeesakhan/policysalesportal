import { PLACEHOLDER_PREFIX } from '@psp/shared';

export class PlaceholderConfigError extends Error {
  constructor(public readonly keys: string[]) {
    super(
      `Refusing to start in production mode: ${keys.length} config value(s) still ` +
        `carry the ${PLACEHOLDER_PREFIX} prefix (CLAUDE.md §2): ${keys.join(', ')}`,
    );
    this.name = 'PlaceholderConfigError';
  }
}

export function findPlaceholderKeys(config: Record<string, string | undefined>): string[] {
  return Object.entries(config)
    .filter(([, value]) => typeof value === 'string' && value.startsWith(PLACEHOLDER_PREFIX))
    .map(([key]) => key)
    .sort();
}

/**
 * Production startup gate (CLAUDE.md §2): the system must refuse to start in
 * production mode while any PLACEHOLDER_ config value remains. Non-production
 * environments may run with placeholders — that is the point of them.
 */
export function assertNoPlaceholderConfig(
  config: Record<string, string | undefined>,
  env: string | undefined = config.NODE_ENV,
): void {
  if (env !== 'production') return;
  const keys = findPlaceholderKeys(config);
  if (keys.length > 0) throw new PlaceholderConfigError(keys);
}
