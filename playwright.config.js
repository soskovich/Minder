const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5599' },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://localhost:5599',
    reuseExistingServer: true,
    timeout: 20000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
