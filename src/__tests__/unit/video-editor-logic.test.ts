/**
 * Video Editor Logic — Unit Tests
 *
 * Tests extracted pure-logic from VideoEditorUI.tsx:
 * - getProxyUrl() — CORS proxy routing
 * - loadDatabaseContent limit behavior for audio tab
 * - Audio/media type detection heuristics
 * - dragTextRef.current null-safety in onMouseMove
 */

import { describe, it, expect } from 'vitest';

// ────────────────────────────────────────────────────────────────
// Extracted from VideoEditorUI.tsx
// ────────────────────────────────────────────────────────────────

function getProxyUrl(originalUrl: string): string {
    if (originalUrl.startsWith('blob:')) return originalUrl;
    return `/api/fetch-media?url=${encodeURIComponent(originalUrl)}`;
}

function determineFetchLimit(filterType: 'library' | 'sequence' | 'audio', baseLimit: number): number {
    return filterType === 'audio' ? 50 : baseLimit;
}

function isAudioUrl(url: string, contentType?: string): boolean {
    return (
        url.includes('.mp3') ||
        url.includes('.wav') ||
        url.includes('audios/') ||
        contentType === 'generated_audio'
    );
}

function isVideoUrl(url: string, contentType?: string): boolean {
    return (
        url.includes('.mp4') ||
        url.includes('.mov') ||
        contentType === 'sequence_clip' ||
        contentType === 'reel'
    );
}

function shouldIncludeInFilter(
    filterType: 'library' | 'sequence' | 'audio',
    isAudio: boolean,
    contentType?: string
): boolean {
    if (filterType === 'audio' && !isAudio) return false;
    if (filterType === 'library' && (isAudio || contentType === 'sequence_clip')) return false;
    return true;
}

type DragTextRef = { id: string; startX: number; startY: number; initX: number; initY: number } | null;

/**
 * Simulates the onMouseMove handler's dragTextRef.current null check.
 * Returns the new position or null if the ref was null.
 */
function calculateTextDragPosition(
    dragTextRefCurrent: DragTextRef,
    canvasRect: { width: number; height: number } | null,
    clientX: number,
    clientY: number
): { x: number; y: number } | null {
    if (!dragTextRefCurrent || !canvasRect) return null;

    const currentDrag = dragTextRefCurrent; // Cached into local variable
    const dx = ((clientX - currentDrag.startX) / canvasRect.width) * 100;
    const dy = ((clientY - currentDrag.startY) / canvasRect.height) * 100;
    const newX = Math.min(95, Math.max(5, currentDrag.initX + dx));
    const newY = Math.min(95, Math.max(5, currentDrag.initY + dy));

    return { x: newX, y: newY };
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('getProxyUrl', () => {
    it('should return blob URLs as-is (no proxying)', () => {
        const blobUrl = 'blob:http://localhost:3000/some-uuid';
        expect(getProxyUrl(blobUrl)).toBe(blobUrl);
    });

    it('should route HTTPS URLs through the fetch-media proxy', () => {
        const url = 'https://cdn.supabase.co/storage/v1/object/public/assets/video.mp4';
        const result = getProxyUrl(url);
        expect(result).toBe(`/api/fetch-media?url=${encodeURIComponent(url)}`);
    });

    it('should correctly encode special characters in the URL', () => {
        const url = 'https://example.com/path?foo=bar&baz=qux';
        const result = getProxyUrl(url);
        expect(result).toContain(encodeURIComponent(url));
        expect(result).toMatch(/^\/api\/fetch-media\?url=/);
    });
});

describe('determineFetchLimit (audio tab handling)', () => {
    it('should return 50 for audio filter type regardless of base limit', () => {
        expect(determineFetchLimit('audio', 4)).toBe(50);
        expect(determineFetchLimit('audio', 8)).toBe(50);
        expect(determineFetchLimit('audio', 100)).toBe(50);
    });

    it('should return the base limit for library filter type', () => {
        expect(determineFetchLimit('library', 4)).toBe(4);
        expect(determineFetchLimit('library', 8)).toBe(8);
    });

    it('should return the base limit for sequence filter type', () => {
        expect(determineFetchLimit('sequence', 4)).toBe(4);
        expect(determineFetchLimit('sequence', 8)).toBe(8);
    });
});

describe('Audio detection heuristics', () => {
    it('should detect .mp3 extension', () => {
        expect(isAudioUrl('https://cdn.example.com/narration.mp3')).toBe(true);
    });

    it('should detect .wav extension', () => {
        expect(isAudioUrl('https://cdn.example.com/sound.wav')).toBe(true);
    });

    it('should detect audios/ path segment', () => {
        expect(isAudioUrl('https://cdn.example.com/audios/track.ogg')).toBe(true);
    });

    it('should detect by content_type "generated_audio"', () => {
        expect(isAudioUrl('https://cdn.example.com/file.bin', 'generated_audio')).toBe(true);
    });

    it('should NOT detect a plain image URL as audio', () => {
        expect(isAudioUrl('https://cdn.example.com/image.png')).toBe(false);
    });

    it('should detect .mp3 URL stored in video_urls JSONB (cross-field detection)', () => {
        // Audio files can be stored in video_urls JSONB per the implementation
        const urlFromVideoUrlsField = 'https://cdn.supabase.co/storage/v1/object/public/assets/videos/client123/scene_1_audio.mp3';
        expect(isAudioUrl(urlFromVideoUrlsField)).toBe(true);
    });
});

describe('Video detection heuristics', () => {
    it('should detect .mp4 extension', () => {
        expect(isVideoUrl('https://example.com/clip.mp4')).toBe(true);
    });

    it('should detect .mov extension', () => {
        expect(isVideoUrl('https://example.com/clip.mov')).toBe(true);
    });

    it('should detect by content_type "sequence_clip"', () => {
        expect(isVideoUrl('https://example.com/file.bin', 'sequence_clip')).toBe(true);
    });

    it('should detect by content_type "reel"', () => {
        expect(isVideoUrl('https://example.com/file', 'reel')).toBe(true);
    });
});

describe('Filter inclusion logic', () => {
    it('should exclude non-audio items from audio filter', () => {
        expect(shouldIncludeInFilter('audio', false)).toBe(false);
    });

    it('should include audio items in audio filter', () => {
        expect(shouldIncludeInFilter('audio', true)).toBe(true);
    });

    it('should exclude audio items from library filter', () => {
        expect(shouldIncludeInFilter('library', true)).toBe(false);
    });

    it('should exclude sequence_clip from library filter', () => {
        expect(shouldIncludeInFilter('library', false, 'sequence_clip')).toBe(false);
    });

    it('should include standard images in library filter', () => {
        expect(shouldIncludeInFilter('library', false, 'generated_image')).toBe(true);
    });
});

describe('dragTextRef null safety (onMouseMove)', () => {
    it('should return null when dragTextRef.current is null', () => {
        const result = calculateTextDragPosition(
            null,
            { width: 800, height: 450 },
            400,
            225
        );
        expect(result).toBeNull();
    });

    it('should return null when canvasRect is null', () => {
        const result = calculateTextDragPosition(
            { id: 'abc', startX: 100, startY: 100, initX: 50, initY: 50 },
            null,
            400,
            225
        );
        expect(result).toBeNull();
    });

    it('should calculate correct position when both refs are valid', () => {
        const result = calculateTextDragPosition(
            { id: 'abc', startX: 400, startY: 225, initX: 50, initY: 50 },
            { width: 800, height: 450 },
            500, // moved 100px right → +12.5% of 800
            300  // moved 75px down → +16.67% of 450
        );

        expect(result).not.toBeNull();
        expect(result!.x).toBeCloseTo(62.5);
        expect(result!.y).toBeCloseTo(66.67, 1);
    });

    it('should clamp position between 5% and 95%', () => {
        // Moving far off screen to the right and down
        const result = calculateTextDragPosition(
            { id: 'abc', startX: 0, startY: 0, initX: 90, initY: 90 },
            { width: 100, height: 100 },
            200, // would push to 290%
            200
        );

        expect(result!.x).toBe(95);
        expect(result!.y).toBe(95);
    });

    it('should clamp position to minimum 5% when moving far left', () => {
        const result = calculateTextDragPosition(
            { id: 'abc', startX: 500, startY: 500, initX: 10, initY: 10 },
            { width: 100, height: 100 },
            0, // would push to -490%
            0
        );

        expect(result!.x).toBe(5);
        expect(result!.y).toBe(5);
    });
});
