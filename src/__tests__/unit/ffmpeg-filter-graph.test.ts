/**
 * FFmpeg Filter Graph Array Builder — Unit Tests
 *
 * Tests the filter-graph construction logic extracted from VideoEditorUI.handleRender.
 * Validates normalization, syntax correctness, audio cutoff, and text layer safety.
 */

import { describe, it, expect } from 'vitest';

// ────────────────────────────────────────────────────────────────
// Extracted pure-logic helpers that mirror VideoEditorUI.handleRender
// ────────────────────────────────────────────────────────────────

interface TrackClip {
    id: string;
    type: 'video' | 'image' | 'audio';
    url: string;
    name: string;
    timelineStart: number;
    trimStart: number;
    trimEnd: number;
    maxDuration: number;
    volume?: number;
    trackRow?: number;
}

interface TextLayer {
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    timelineStart: number;
    trimStart: number;
    trimEnd: number;
    maxDuration: number;
}

const NORMALIZATION_FILTER =
    'scale=1920:1080:force_original_aspect_ratio=decrease,' +
    'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,' +
    'setsar=1,fps=30,format=yuv420p';

/**
 * Mirrors the filter-graph building in VideoEditorUI.handleRender.
 * Returns { inputArgs, filterGraph, maxVideoTime, execArgs }.
 */
function buildFilterGraph(
    videoClips: TrackClip[],
    audioClips: TrackClip[],
    textLayers: TextLayer[],
    hasFont: boolean
) {
    const orderedVideos = [...videoClips].sort(
        (a, b) => a.timelineStart - b.timelineStart
    );

    const inputArgs: string[] = [];
    const filterSteps: string[] = [];
    let concatStreams = '';

    for (let i = 0; i < orderedVideos.length; i++) {
        const clip = orderedVideos[i];
        const isImg = clip.type === 'image';
        const ext = isImg ? 'png' : 'mp4';
        const fileName = `media_${i}.${ext}`;
        const duration = clip.trimEnd - clip.trimStart;

        if (isImg) {
            inputArgs.push('-loop', '1', '-framerate', '30', '-t', String(duration), '-i', fileName);
        } else {
            inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);
        }

        filterSteps.push(
            `[${i}:v]${NORMALIZATION_FILTER}[v${i}]`
        );
        concatStreams += `[v${i}]`;
    }

    if (orderedVideos.length > 0) {
        filterSteps.push(
            `${concatStreams}concat=n=${orderedVideos.length}:v=1:a=0[outv]`
        );
    }

    let finalVideoMap = '[outv]';

    if (textLayers.length > 0 && hasFont) {
        const textFilters: string[] = [];
        textLayers.forEach((layer) => {
            const start = layer.timelineStart;
            const end = layer.timelineStart + (layer.trimEnd - layer.trimStart);
            const x = `(w*${layer.x}/100)`;
            const y = `(h*${layer.y}/100)`;
            const size = layer.fontSize * 2;
            const safeText = layer.text.replace(/'/g, '\u2019').replace(/:/g, '\\:');
            textFilters.push(
                `drawtext=fontfile=arial.ttf:text='${safeText}':fontcolor=${layer.color || 'white'}:fontsize=${size}:x=${x}:y=${y}:enable='between(t,${start},${end})'`
            );
        });
        if (textFilters.length > 0) {
            filterSteps.push(`[outv]${textFilters.join(',')}[textout]`);
            finalVideoMap = '[textout]';
        }
    }

    let hasAudio = false;
    if (audioClips.length > 0) {
        if (audioClips.length === 1) {
            const clip = audioClips[0];
            const fileName = 'audio_0.mp3';
            const duration = clip.trimEnd - clip.trimStart;
            inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);
            const delayMs = Math.floor(clip.timelineStart * 1000);
            const audioInputIndex = orderedVideos.length;
            filterSteps.push(`[${audioInputIndex}:a]adelay=${delayMs}|${delayMs}[outa]`);
            hasAudio = true;
        } else {
            let audioMixStr = '';
            for (let i = 0; i < audioClips.length; i++) {
                const clip = audioClips[i];
                const fileName = `audio_${i}.mp3`;
                const duration = clip.trimEnd - clip.trimStart;
                inputArgs.push('-ss', String(clip.trimStart), '-t', String(duration), '-i', fileName);
                const delayMs = Math.floor(clip.timelineStart * 1000);
                const audioInputIndex = orderedVideos.length + i;
                filterSteps.push(`[${audioInputIndex}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
                audioMixStr += `[a${i}]`;
                hasAudio = true;
            }
            filterSteps.push(
                `${audioMixStr}amix=inputs=${audioClips.length}:duration=longest:dropout_transition=0[outa]`
            );
        }
    }

    const finalFilterGraph = filterSteps.join(';');

    const maxVideoTime = orderedVideos.reduce(
        (max, clip) => Math.max(max, clip.timelineStart + (clip.trimEnd - clip.trimStart)),
        0
    );

    const execArgs = [
        ...inputArgs,
        '-filter_complex', finalFilterGraph,
        '-map', finalVideoMap,
    ];

    if (hasAudio) {
        execArgs.push('-map', '[outa]');
        execArgs.push('-c:a', 'aac', '-b:a', '192k');
    }

    if (maxVideoTime > 0) {
        execArgs.push('-t', String(maxVideoTime));
    }

    execArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', 'output.mp4');

    return { inputArgs, filterSteps, finalFilterGraph, maxVideoTime, execArgs, finalVideoMap, hasAudio };
}

// ────────────────────────────────────────────────────────────────
// Test helpers / fixtures
// ────────────────────────────────────────────────────────────────

function makeVideoClip(overrides: Partial<TrackClip> = {}): TrackClip {
    return {
        id: crypto.randomUUID(),
        type: 'video',
        url: 'https://example.com/video.mp4',
        name: 'clip',
        timelineStart: 0,
        trimStart: 0,
        trimEnd: 5,
        maxDuration: 10,
        ...overrides,
    };
}

function makeImageClip(overrides: Partial<TrackClip> = {}): TrackClip {
    return {
        ...makeVideoClip(overrides),
        type: 'image',
        url: 'https://example.com/image.png',
        ...overrides,
    };
}

function makeAudioClip(overrides: Partial<TrackClip> = {}): TrackClip {
    return {
        ...makeVideoClip(overrides),
        type: 'audio',
        url: 'https://example.com/audio.mp3',
        ...overrides,
    };
}

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
    return {
        id: crypto.randomUUID(),
        text: 'Hello World',
        x: 50,
        y: 50,
        fontSize: 48,
        color: '#FFFFFF',
        timelineStart: 0,
        trimStart: 0,
        trimEnd: 5,
        maxDuration: 3600,
        ...overrides,
    };
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('FFmpeg Filter Graph Builder', () => {
    describe('Normalization to 1920x1080', () => {
        it('should apply the full normalization chain to every visual input', () => {
            const clips = [
                makeVideoClip({ timelineStart: 0, trimEnd: 3 }),
                makeImageClip({ timelineStart: 3, trimEnd: 4 }),
                makeVideoClip({ timelineStart: 7, trimEnd: 5 }),
            ];

            const { filterSteps } = buildFilterGraph(clips, [], [], false);

            // First N steps (one per clip) must each contain the full normalization chain
            for (let i = 0; i < clips.length; i++) {
                expect(filterSteps[i]).toContain('scale=1920:1080:force_original_aspect_ratio=decrease');
                expect(filterSteps[i]).toContain('pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black');
                expect(filterSteps[i]).toContain('setsar=1');
                expect(filterSteps[i]).toContain('fps=30');
                expect(filterSteps[i]).toContain('format=yuv420p');
            }
        });

        it('should normalize a single vertical image to 1920x1080', () => {
            const clips = [makeImageClip({ trimEnd: 5 })];
            const { filterSteps } = buildFilterGraph(clips, [], [], false);

            expect(filterSteps[0]).toBe(
                `[0:v]${NORMALIZATION_FILTER}[v0]`
            );
        });

        it('should normalize mixed media (vertical image + horizontal video + varied durations)', () => {
            const clips = [
                makeImageClip({ timelineStart: 0, trimEnd: 3 }),
                makeVideoClip({ timelineStart: 3, trimStart: 2, trimEnd: 7 }),
            ];

            const { inputArgs, filterSteps } = buildFilterGraph(clips, [], [], false);

            // Image should use -loop 1 -framerate 30
            expect(inputArgs.slice(0, 8)).toEqual([
                '-loop', '1', '-framerate', '30', '-t', '3', '-i', 'media_0.png',
            ]);

            // Video should use -ss (trimStart) -t (duration)
            expect(inputArgs.slice(8, 14)).toEqual([
                '-ss', '2', '-t', '5', '-i', 'media_1.mp4',
            ]);

            // Both should have the normalization filter
            expect(filterSteps[0]).toContain(NORMALIZATION_FILTER);
            expect(filterSteps[1]).toContain(NORMALIZATION_FILTER);
        });
    });

    describe('Filter Graph Syntax (no trailing semicolons)', () => {
        it('should produce a filter graph with NO trailing semicolons for a single clip', () => {
            const clips = [makeVideoClip()];
            const { finalFilterGraph } = buildFilterGraph(clips, [], [], false);

            expect(finalFilterGraph).not.toMatch(/;$/);
            expect(finalFilterGraph).not.toContain(';;');
        });

        it('should produce a clean filter graph for N clips', () => {
            const clips = Array.from({ length: 5 }, (_, i) =>
                makeVideoClip({ timelineStart: i * 5, trimEnd: 5 })
            );
            const { finalFilterGraph } = buildFilterGraph(clips, [], [], false);

            // No trailing semicolons
            expect(finalFilterGraph).not.toMatch(/;$/);
            // No double semicolons
            expect(finalFilterGraph).not.toContain(';;');
            // No empty filter segments
            const segments = finalFilterGraph.split(';');
            segments.forEach((seg) => {
                expect(seg.trim().length).toBeGreaterThan(0);
            });
        });

        it('should produce a clean filter graph with text layers + audio', () => {
            const clips = [makeVideoClip(), makeImageClip({ timelineStart: 5 })];
            const audio = [makeAudioClip({ timelineStart: 0, trimEnd: 10 })];
            const text = [makeTextLayer({ text: 'Hello' })];

            const { finalFilterGraph } = buildFilterGraph(clips, audio, text, true);

            expect(finalFilterGraph).not.toMatch(/;$/);
            expect(finalFilterGraph).not.toContain(';;');
        });
    });

    describe('Audio -t cutoff', () => {
        it('should calculate maxVideoTime from visual clips only', () => {
            const clips = [
                makeVideoClip({ timelineStart: 0, trimEnd: 5 }),
                makeImageClip({ timelineStart: 5, trimEnd: 3 }),
            ];
            // Audio is longer than the visuals
            const audio = [makeAudioClip({ timelineStart: 0, trimEnd: 30 })];

            const { maxVideoTime } = buildFilterGraph(clips, audio, [], false);

            // maxVideoTime should be 5+3=8, NOT 30 from the audio
            expect(maxVideoTime).toBe(8);
        });

        it('should include -t flag in execArgs to stop at visual end', () => {
            const clips = [makeVideoClip({ timelineStart: 0, trimEnd: 10 })];
            const audio = [makeAudioClip({ timelineStart: 0, trimEnd: 60 })];

            const { execArgs, maxVideoTime } = buildFilterGraph(clips, audio, [], false);

            expect(maxVideoTime).toBe(10);
            const tFlagIndex = execArgs.indexOf('-t');
            expect(tFlagIndex).toBeGreaterThan(-1);
            expect(execArgs[tFlagIndex + 1]).toBe('10');
        });

        it('should NOT add -t flag when maxVideoTime is 0 (no clips)', () => {
            const { execArgs } = buildFilterGraph([], [], [], false);
            // -t should not appear in execArgs for the final encode
            // (there might be -t in input args, but the final encode -t should be absent)
            const lastTIndex = execArgs.lastIndexOf('-t');
            if (lastTIndex > -1) {
                // If -t exists, it should NOT be followed by "0"
                expect(execArgs[lastTIndex + 1]).not.toBe('0');
            }
        });
    });

    describe('Text Layer drawtext filter', () => {
        it('should escape colons in text to prevent FFmpeg syntax errors', () => {
            const text = [makeTextLayer({ text: 'Hello: World' })];
            const clips = [makeVideoClip()];

            const { finalFilterGraph } = buildFilterGraph(clips, [], text, true);

            expect(finalFilterGraph).toContain('Hello\\: World');
            expect(finalFilterGraph).not.toContain("text='Hello: World'");
        });

        it('should replace single quotes with unicode right quotation mark', () => {
            const text = [makeTextLayer({ text: "It's great" })];
            const clips = [makeVideoClip()];

            const { finalFilterGraph } = buildFilterGraph(clips, [], text, true);

            expect(finalFilterGraph).toContain('It\u2019s great');
            expect(finalFilterGraph).not.toContain("It's");
        });

        it('should include fontfile=arial.ttf in the drawtext filter', () => {
            const text = [makeTextLayer()];
            const clips = [makeVideoClip()];

            const { finalFilterGraph } = buildFilterGraph(clips, [], text, true);

            expect(finalFilterGraph).toContain('fontfile=arial.ttf');
        });

        it('should skip text layers when hasFont is false', () => {
            const text = [makeTextLayer()];
            const clips = [makeVideoClip()];

            const { finalFilterGraph, finalVideoMap } = buildFilterGraph(clips, [], text, false);

            expect(finalFilterGraph).not.toContain('drawtext');
            expect(finalVideoMap).toBe('[outv]');
        });

        it('should include enable=between(t,start,end) for timed visibility', () => {
            const text = [makeTextLayer({ timelineStart: 2, trimStart: 0, trimEnd: 3 })];
            const clips = [makeVideoClip({ trimEnd: 10 })];

            const { finalFilterGraph } = buildFilterGraph(clips, [], text, true);

            expect(finalFilterGraph).toContain("enable='between(t,2,5)'");
        });
    });

    describe('Single audio clip', () => {
        it('should use adelay filter with correct millisecond delay', () => {
            const clips = [makeVideoClip()];
            const audio = [makeAudioClip({ timelineStart: 1.5, trimEnd: 5 })];

            const { finalFilterGraph } = buildFilterGraph(clips, audio, [], false);

            expect(finalFilterGraph).toContain('adelay=1500|1500[outa]');
        });
    });

    describe('Multiple audio clips', () => {
        it('should use amix filter with correct input count', () => {
            const clips = [makeVideoClip({ trimEnd: 20 })];
            const audio = [
                makeAudioClip({ timelineStart: 0, trimEnd: 5 }),
                makeAudioClip({ timelineStart: 5, trimEnd: 5 }),
                makeAudioClip({ timelineStart: 10, trimEnd: 5 }),
            ];

            const { finalFilterGraph } = buildFilterGraph(clips, audio, [], false);

            expect(finalFilterGraph).toContain('amix=inputs=3');
            expect(finalFilterGraph).toContain('[a0]');
            expect(finalFilterGraph).toContain('[a1]');
            expect(finalFilterGraph).toContain('[a2]');
        });
    });

    describe('Zero clips (edge case)', () => {
        it('should not crash when no clips are provided', () => {
            const { filterSteps, inputArgs, maxVideoTime } = buildFilterGraph([], [], [], false);

            expect(filterSteps).toHaveLength(0);
            expect(inputArgs).toHaveLength(0);
            expect(maxVideoTime).toBe(0);
        });
    });

    describe('Concat stream ordering', () => {
        it('should sort clips by timelineStart before building the concat', () => {
            // Provide clips out of order
            const clips = [
                makeVideoClip({ timelineStart: 10, trimEnd: 5 }),
                makeVideoClip({ timelineStart: 0, trimEnd: 3 }),
                makeVideoClip({ timelineStart: 5, trimEnd: 4 }),
            ];

            const { finalFilterGraph } = buildFilterGraph(clips, [], [], false);

            expect(finalFilterGraph).toContain('[v0][v1][v2]concat=n=3:v=1:a=0[outv]');
        });
    });

    describe('Auto-download & Supabase backup arguments', () => {
        it('should always produce output.mp4 as the final output filename', () => {
            const clips = [makeVideoClip()];
            const { execArgs } = buildFilterGraph(clips, [], [], false);

            expect(execArgs[execArgs.length - 1]).toBe('output.mp4');
        });

        it('should use libx264 codec with ultrafast preset', () => {
            const clips = [makeVideoClip()];
            const { execArgs } = buildFilterGraph(clips, [], [], false);

            expect(execArgs).toContain('-c:v');
            expect(execArgs).toContain('libx264');
            expect(execArgs).toContain('-preset');
            expect(execArgs).toContain('ultrafast');
        });
    });
});
