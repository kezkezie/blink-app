import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load .env.local so E2E tests have access to SUPABASE_SERVICE_ROLE_KEY etc.
config({ path: '.env.local' });

export default defineConfig({
    testDir: './src/__tests__/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    timeout: 60_000,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
