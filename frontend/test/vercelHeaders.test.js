import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';

const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

describe('vercel security headers', () => {
  it('sets a restrictive content security policy for all routes', () => {
    const allRouteHeaders = vercelConfig.headers.find((entry) => entry.source === '/(.*)')?.headers ?? [];
    const csp = allRouteHeaders.find((header) => header.key === 'Content-Security-Policy')?.value;

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('https://vercel.live');
  });
});
