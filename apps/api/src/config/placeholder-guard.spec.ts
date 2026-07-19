import { describe, expect, it } from 'vitest';
import {
  assertNoPlaceholderConfig,
  findPlaceholderKeys,
  PlaceholderConfigError,
} from './placeholder-guard';

describe('placeholder startup guard (CLAUDE.md §2)', () => {
  const dirty = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://real',
    INSURER_API_KEY: 'PLACEHOLDER_insurer_api_key',
    ICP_GATEWAY_URL: 'PLACEHOLDER_icp_url',
  };

  it('finds every PLACEHOLDER_ value by key', () => {
    expect(findPlaceholderKeys(dirty)).toEqual(['ICP_GATEWAY_URL', 'INSURER_API_KEY']);
  });

  it('refuses to start in production mode while placeholders remain', () => {
    expect(() => assertNoPlaceholderConfig(dirty)).toThrow(PlaceholderConfigError);
    expect(() => assertNoPlaceholderConfig(dirty)).toThrow(/INSURER_API_KEY/);
  });

  it('starts in production once all placeholders are resolved', () => {
    expect(() =>
      assertNoPlaceholderConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://real' }),
    ).not.toThrow();
  });

  it('allows placeholders outside production (dev/uat run on fakes by design)', () => {
    expect(() => assertNoPlaceholderConfig({ ...dirty, NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertNoPlaceholderConfig({ ...dirty, NODE_ENV: undefined })).not.toThrow();
  });
});
