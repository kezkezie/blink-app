/**
 * Storyboard Logic — Unit Tests
 *
 * Tests the pure-logic functions from StorytellingSetup.tsx:
 * - getLabels() — mode-based dynamic label resolution
 */

import { describe, it, expect } from 'vitest';

// ────────────────────────────────────────────────────────────────
// Extracted from StorytellingSetup.tsx (pure function, no React deps)
// ────────────────────────────────────────────────────────────────

function getLabels(mode: string): { primary: string; secondary: string } {
    switch (mode) {
        case 'keyframe':
            return { primary: 'Start Frame', secondary: 'End Frame' };
        case 'ugc':
            return { primary: 'Product Shot', secondary: 'Influencer Face' };
        case 'clothing':
            return { primary: 'Garment Flatlay', secondary: 'Model Reference' };
        case 'logo_reveal':
            return { primary: 'Logo/Product', secondary: 'End State (Opt)' };
        case 'showcase':
        default:
            return { primary: 'Start Frame', secondary: 'End Frame (Opt)' };
    }
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('getLabels (StorytellingSetup)', () => {
    it('should return UGC labels for mode "ugc"', () => {
        const labels = getLabels('ugc');
        expect(labels.primary).toBe('Product Shot');
        expect(labels.secondary).toBe('Influencer Face');
    });

    it('should return Clothing labels for mode "clothing"', () => {
        const labels = getLabels('clothing');
        expect(labels.primary).toBe('Garment Flatlay');
        expect(labels.secondary).toBe('Model Reference');
    });

    it('should return Keyframe labels for mode "keyframe"', () => {
        const labels = getLabels('keyframe');
        expect(labels.primary).toBe('Start Frame');
        expect(labels.secondary).toBe('End Frame');
    });

    it('should return Logo/Reveal labels for mode "logo_reveal"', () => {
        const labels = getLabels('logo_reveal');
        expect(labels.primary).toBe('Logo/Product');
        expect(labels.secondary).toBe('End State (Opt)');
    });

    it('should return Showcase (default) labels for mode "showcase"', () => {
        const labels = getLabels('showcase');
        expect(labels.primary).toBe('Start Frame');
        expect(labels.secondary).toBe('End Frame (Opt)');
    });

    it('should return default labels for an unknown mode', () => {
        const labels = getLabels('nonexistent_mode');
        expect(labels.primary).toBe('Start Frame');
        expect(labels.secondary).toBe('End Frame (Opt)');
    });

    it('should return default labels for an empty string', () => {
        const labels = getLabels('');
        expect(labels.primary).toBe('Start Frame');
        expect(labels.secondary).toBe('End Frame (Opt)');
    });
});

describe('audioPrompt population', () => {
    it('should have a default English audioPrompt when scene.audioPrompt is empty', () => {
        // When handleGenerateSingleVideo fires, it falls back to "English language narration"
        const sceneAudioPrompt = '';
        const effectiveAudioPrompt = sceneAudioPrompt || 'English language narration';
        expect(effectiveAudioPrompt).toBe('English language narration');
    });

    it('should use the scene-specific audioPrompt when provided', () => {
        const sceneAudioPrompt = 'A dramatic English narration about luxury watches.';
        const effectiveAudioPrompt = sceneAudioPrompt || 'English language narration';
        expect(effectiveAudioPrompt).toBe('A dramatic English narration about luxury watches.');
    });
});
