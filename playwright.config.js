const { defineConfig, devices } = require('@playwright/test');

// De poort is instelbaar met MINDER_TEST_PORT (standaard 5599), zodat een tweede worktree/sessie op een eigen
// poort draait en Playwright niet de serve.js van een andere checkout hergebruikt. tests/serve.js leest dezelfde
// variable, dus de env propageert naar de webServer-command.
const PORT = Number(process.env.MINDER_TEST_PORT) || 5599;
const ORIGIN = 'http://localhost:' + PORT;

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
  use: { baseURL: ORIGIN, serviceWorkers: 'block' },
  webServer: {
    command: 'node tests/serve.js',
    url: ORIGIN,
    reuseExistingServer: true,
    timeout: 20000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
