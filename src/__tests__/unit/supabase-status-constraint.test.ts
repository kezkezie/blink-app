/**
 * Supabase Status Constraint — Unit Tests
 *
 * Verifies that all auto-saving scripts insert rows with status: "draft",
 * not "success", to comply with the content_status_check DB constraint.
 *
 * The content_status_check constraint only allows:
 *   'draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published'
 *
 * Using "success" will cause a constraint violation error.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ────────────────────────────────────────────────────────────────
// Source file scan: ensure status: "draft" is used everywhere
// ────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published'];

/**
 * Scans a source file for Supabase .insert() calls and checks
 * that the `status` field uses a valid value.
 */
function findStatusValuesInInserts(fileContent: string): string[] {
    const statusValues: string[] = [];
    // Match all occurrences of status: "..." or status: '...'
    const regex = /status:\s*["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
        statusValues.push(match[1]);
    }
    return statusValues;
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('Supabase content_status_check Constraint', () => {
    it('should use valid status values in VideoEditorUI.tsx (handleRender)', () => {
        const filePath = path.resolve(__dirname, '../../components/layout/VideoEditorUI.tsx');
        const content = fs.readFileSync(filePath, 'utf-8');
        const statuses = findStatusValuesInInserts(content);

        expect(statuses.length).toBeGreaterThan(0);
        statuses.forEach((status) => {
            expect(VALID_STATUSES).toContain(status);
        });
    });

    it('should use valid status values in StorytellingSetup.tsx (handleGenerateSceneAudio)', () => {
        const filePath = path.resolve(__dirname, '../../components/video/StorytellingSetup.tsx');
        const content = fs.readFileSync(filePath, 'utf-8');
        const statuses = findStatusValuesInInserts(content);

        expect(statuses.length).toBeGreaterThan(0);
        statuses.forEach((status) => {
            expect(
                VALID_STATUSES,
                `Found invalid status: "${status}" in StorytellingSetup.tsx. ` +
                `The content_status_check constraint only allows: ${VALID_STATUSES.join(', ')}. ` +
                `This will cause a Supabase insert error.`
            ).toContain(status);
        });
    });

    it('should never use status: "success" in any insert statement', () => {
        const files = [
            path.resolve(__dirname, '../../components/layout/VideoEditorUI.tsx'),
            path.resolve(__dirname, '../../components/video/StorytellingSetup.tsx'),
        ];

        files.forEach((filePath) => {
            const content = fs.readFileSync(filePath, 'utf-8');
            const statuses = findStatusValuesInInserts(content);
            statuses.forEach((status) => {
                expect(
                    status,
                    `File ${path.basename(filePath)} uses status: "${status}" which is not allowed by the DB constraint.`
                ).not.toBe('success');
            });
        });
    });
});
