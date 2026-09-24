import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/integration', outputDir: './test-results/integration', fullyParallel: false, workers: 1, timeout: 60000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  projects: [{ name: 'integration-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1365, height: 1000 } } }],
  webServer: [
    { command: 'node ../backend/test/integration/serve.js', url: 'http://127.0.0.1:5005/api/v1/auth/me', timeout: 180000 },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', env: { VITE_API_URL: 'http://127.0.0.1:5005/api/v1' } }
  ]
});
