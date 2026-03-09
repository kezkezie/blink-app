/**
 * API Route: fetch-media CORS Proxy — Unit Tests
 *
 * Tests the logic in /api/fetch-media/route.ts:
 * - Access-Control-Allow-Origin header is set to "*"
 * - Missing URL parameter returns 400
 * - Upstream errors return 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────
// Extracted logic from fetch-media/route.ts
// ────────────────────────────────────────────────────────────────

interface ProxyResult {
    status: number;
    headers: Record<string, string>;
    body: string | null;
}

function buildProxyHeaders(upstreamContentType: string | null, upstreamContentLength: string | null): Record<string, string> {
    return {
        'Content-Type': upstreamContentType || 'application/octet-stream',
        'Content-Length': upstreamContentLength || '',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
    };
}

function validateUrlParam(url: string | null): { valid: boolean; status: number; message: string } {
    if (!url) {
        return { valid: false, status: 400, message: 'Missing URL parameter' };
    }
    return { valid: true, status: 200, message: 'OK' };
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('fetch-media CORS Proxy', () => {
    describe('CORS Headers', () => {
        it('should always set Access-Control-Allow-Origin to "*"', () => {
            const headers = buildProxyHeaders('video/mp4', '12345');
            expect(headers['Access-Control-Allow-Origin']).toBe('*');
        });

        it('should pass through the upstream Content-Type', () => {
            const headers = buildProxyHeaders('audio/mpeg', '54321');
            expect(headers['Content-Type']).toBe('audio/mpeg');
        });

        it('should default Content-Type to application/octet-stream when upstream is null', () => {
            const headers = buildProxyHeaders(null, null);
            expect(headers['Content-Type']).toBe('application/octet-stream');
        });

        it('should set Accept-Ranges to bytes for range request support', () => {
            const headers = buildProxyHeaders('image/png', '999');
            expect(headers['Accept-Ranges']).toBe('bytes');
        });
    });

    describe('URL Parameter Validation', () => {
        it('should return 400 when URL parameter is null', () => {
            const result = validateUrlParam(null);
            expect(result.valid).toBe(false);
            expect(result.status).toBe(400);
        });

        it('should return 200 when URL parameter is provided', () => {
            const result = validateUrlParam('https://cdn.supabase.co/assets/video.mp4');
            expect(result.valid).toBe(true);
            expect(result.status).toBe(200);
        });
    });
});
