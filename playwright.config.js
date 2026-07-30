const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // tests/wip/ staat buiten de standaardrun: specs voor features die nog niet gebouwd zijn (die lopen
  // dus in timeouts) en losse diagnostiek. Wel draaien:  WIP=1 npx playwright test tests/wip
  // PowerShell:  $env:WIP=1; npx playwright test tests/wip
  testIgnore: process.env.WIP ? [] : '**/wip/**',
  timeout: 30000,
  fullyParallel: false,
  reporter: 'list',
  // serviceWorkers:'block' geldt voor alle specs. Zonder dit registreert index.html sw.js, wordt de pagina
  // overgenomen en herlaadt de controllerchange-handler midden in een test ("Execution context was destroyed",
  // sheets die nooit verschijnen). page.route('**/sw.js') helpt daar niet tegen: dat onderschept het
  // worker-script niet. De service worker zelf testen we hier niet.
  use: { baseURL: 'http://localhost:5599', serviceWorkers: 'block' },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://localhost:5599',
    reuseExistingServer: true,
    timeout: 20000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
