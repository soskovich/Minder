/* v524 (punt 6 + stop-1 nazorg): een bereikt (vol) doel toont in het app-pad "vol", niet "nu actief", en de Plan-paint rondt af.
   BEVINDING: go('vooruit') hertekent Plan NIET (het togglet alleen de .active-klasse; alleen 'maand'/'logboek' hertekenen in go()).
   De app hertekent Plan via render() (regel 4026, bij de boot en na elke actie die save()+render() doet). Een directe aanroep van
   renderVooruit() in page.evaluate gevolgd door een screenshot triggert de gedocumenteerde Chromium-futex-deadlock; render() (het
   echte app-pad) niet. GEMETEN: render() + screenshot 3/3 OK en de rij toont "vol". De eerdere observatie "go toont nu actief" was dus
   de stale boot-render (bij de boot staat iw op gespaard 0 = actief), geen code-bug. Deze test rendert de vol-stand via het app-pad en
   toetst dat de rij "vol" toont, met de geld-balk vol, en dat de paint binnen 5 s af is.
   SABOTAGE voor punt 6 (de "volgorde" in allocatePlan): haal de bereikt-status weg (regel ~17471 'else if(rest<=0) status=bereikt'
   of de continue op ~17492) → een gefund doel verliest "bereikt" en de rij toont geen "vol" meer. Geconstrueerde fixture
   (plan-toestel-stand met Inrichting op zijn doel = scenario e2), geen back-up. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

test('een bereikt (vol) doel toont in het app-pad "vol", en de Plan-paint rondt af binnen 5 s', async ({ page }) => {
  await T.boot(page, 'nu');
  const st = await page.evaluate(() => {
    // Inrichting echt vol (e2): op zijn doel toegewezen EN het geld staat er (ruim spaarsaldo via extraSavings), geen concurrentie
    SET.nfToegewezen = 0; SET.terugzet = {}; SET.terugzetGat = []; SET.extraSavings = 20000;
    const g = (SET.goals || []).find(x => x.id === 'iw'); g.gespaard = g.doel; _dataGen++;
    render(); go('vooruit');   // het app-pad: render() hertekent Plan; go('vooruit') navigeert alleen (hertekent niet)
    const rij = document.querySelector('#planLijst .plan-item[data-id="iw"]');
    const P = allocatePlan(); const p = P.find(x => x.id === 'iw'); const x = planStandEind(P).per['iw'];
    return { kids: document.getElementById('s-vooruit').children.length,
      rijStatus: rij ? (rij.querySelector('[data-planstatus]') || {}).textContent || '' : '(geen rij)',
      geldvat: rij ? +(rij.querySelector('[data-geldvat]') || { dataset: {} }).dataset.pct : null,
      allocStatus: p && p.status, vol: planVolEcht(p, x) };
  });
  expect(st.kids).toBeGreaterThan(0);          // de render voltooit (geen lus / self-render)
  expect(st.allocStatus).toBe('bereikt');      // allocatePlan: rest<=0 -> bereikt (de volgorde; zie de sabotage in de kop)
  expect(st.vol).toBe(true);                   // planVolEcht: het geld haalt het doel
  expect(st.rijStatus).toMatch(/vol/);         // de rij toont "vol", NIET "nu actief" (punt 6)
  expect(st.geldvat).toBe(100);                // de geld-balk is vol
  // de paint zelf: een schermafdruk van het volle Plan-scherm met de vol-stand moet binnen 5 s af zijn
  await page.locator('#s-vooruit').screenshot({ path: test.info().outputPath('plan-vol.png'), timeout: 5000 });
});
