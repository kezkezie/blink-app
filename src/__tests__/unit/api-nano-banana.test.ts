/**
 * API Route: nano-banana "Traffic Cop" — Unit Tests
 *
 * Tests the routing logic in /api/video/nano-banana/route.ts
 * that directs requests to the correct n8n webhook based on `body.mode`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────
// Extracted routing logic from nano-banana/route.ts
// ────────────────────────────────────────────────────────────────

const N8N_DIRECTOR_URL = 'https://n8n.srv1166077.hstgr.cloud/webhook/ai-director-prompts';
const N8N_GENERATOR_URL = 'https://n8n.srv1166077.hstgr.cloud/webhook/generate-single-frame';
const N8N_VIDEO_GENERATOR_URL = 'https://n8n.srv1166077.hstgr.cloud/webhook/generate-video';

function resolveTargetUrl(mode?: string): string {
    let targetUrl = N8N_GENERATOR_URL; // Default to images

    if (mode === 'director') {
        targetUrl = N8N_DIRECTOR_URL;
    } else if (mode === 'scene_video_generator') {
        targetUrl = N8N_VIDEO_GENERATOR_URL;
    }

    return targetUrl;
}

/**
 * Simulates the non-JSON response handling from the route.
 */
function parseN8nResponse(rawText: string, isOk: boolean): { data: any; isError: boolean } {
    let data;
    try {
        data = JSON.parse(rawText);
    } catch (parseError) {
        if (isOk) {
            data = { success: true, message: rawText };
        } else {
            return { data: null, isError: true };
        }
    }

    if (!isOk) {
        return { data, isError: true };
    }

    return { data, isError: false };
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('nano-banana Traffic Cop Routing', () => {
    it('should route mode="director" to the AI Director webhook', () => {
        expect(resolveTargetUrl('director')).toBe(N8N_DIRECTOR_URL);
    });

    it('should route mode="scene_video_generator" to the Video Studio webhook', () => {
        expect(resolveTargetUrl('scene_video_generator')).toBe(N8N_VIDEO_GENERATOR_URL);
    });

    it('should route mode="generator" (default) to the Image Generator webhook', () => {
        expect(resolveTargetUrl('generator')).toBe(N8N_GENERATOR_URL);
    });

    it('should route undefined mode to the Image Generator webhook (default)', () => {
        expect(resolveTargetUrl(undefined)).toBe(N8N_GENERATOR_URL);
    });

    it('should route mode="manual" to the Image Generator webhook (default fallback)', () => {
        expect(resolveTargetUrl('manual')).toBe(N8N_GENERATOR_URL);
    });

    it('should NOT route to an empty or undefined URL', () => {
        const url = resolveTargetUrl('scene_video_generator');
        expect(url).toBeDefined();
        expect(url.length).toBeGreaterThan(0);
        expect(url).toMatch(/^https:\/\//);
    });
});

describe('nano-banana Non-JSON Response Handling', () => {
    it('should gracefully handle "Workflow was started" plain-text response on success', () => {
        const result = parseN8nResponse('Workflow was started', true);
        expect(result.isError).toBe(false);
        expect(result.data).toEqual({ success: true, message: 'Workflow was started' });
    });

    it('should parse valid JSON response normally', () => {
        const result = parseN8nResponse('{"url":"https://example.com/image.png"}', true);
        expect(result.isError).toBe(false);
        expect(result.data.url).toBe('https://example.com/image.png');
    });

    it('should flag error when non-JSON response comes with not-ok status', () => {
        const result = parseN8nResponse('Internal Server Error', false);
        expect(result.isError).toBe(true);
    });

    it('should parse JSON error responses and flag as error', () => {
        const result = parseN8nResponse('{"message":"Webhook not found"}', false);
        expect(result.isError).toBe(true);
        expect(result.data.message).toBe('Webhook not found');
    });
});
