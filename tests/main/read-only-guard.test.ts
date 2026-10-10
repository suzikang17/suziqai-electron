// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decideRequest } from '../../src/main/read-only-guard';

const allow = ['/auth/v1/token\\?grant_type=(password|refresh_token)', '/rest/v1/rpc/get_prospect_counts_by_position$'];

describe('decideRequest', () => {
  it('lets reads through', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(decideRequest(method, 'https://x.supabase.co/rest/v1/job_orders', allow)).toBe('allow');
    }
  });

  it('blocks writes', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(decideRequest(method, 'https://x.supabase.co/rest/v1/job_orders', allow)).toBe('block');
    }
  });

  it('allows login and allowlisted read-only RPCs', () => {
    expect(decideRequest('POST', 'https://x.supabase.co/auth/v1/token?grant_type=password', allow)).toBe('allow');
    expect(decideRequest('POST', 'https://x.supabase.co/rest/v1/rpc/get_prospect_counts_by_position', allow)).toBe('allow');
    expect(decideRequest('POST', 'https://x.supabase.co/rest/v1/rpc/assign_employee', allow)).toBe('block');
  });

  it('blocks monitoring beacons quietly', () => {
    expect(decideRequest('POST', 'https://sentry.delegate.ws/api/8/envelope/', allow)).toBe('block-quiet');
    expect(decideRequest('POST', 'https://app.example.com/cdn-cgi/rum', allow)).toBe('block-quiet');
  });

  it('ignores invalid allowlist patterns instead of throwing', () => {
    expect(decideRequest('POST', 'https://x/a', ['(unclosed'])).toBe('block');
  });
});
