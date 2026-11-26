/* v524 (stop-1 nazorg): GUARD op de Plan-paint met een vol/gefund doel. In een eerdere iteratie leek een schermafdruk van Plan met
   Inrichting vol Chromium in deze VM te laten hangen. GEMETEN dat het GEEN app-oorzaak is maar een test-antipatroon: een DIRECTE
   aanroep van renderVooruit() in page.evaluate gevolgd door een screenshot triggert de gedocumenteerde Chromium-futex-deadlock (zwaar
   rekenwerk in page.evaluate, dan een layout). Meting op deze fixture, elk 5-8x:
     - renderVooruit() + screenshot, MET of ZONDER vol doel: 0/5 (hangt altijd) — dus niet het vol doel en niet blok 1/2.
     - go('dash');go('vooruit') + screenshot (het app-pad), met de gefunde stand: 8/8 (voltooit).
   De app navigeert met go() en hangt dus niet; alleen een test die renderVooruit() direct aanroept hangt. Deze guard schildert de
   gefunde e2-stand via het app-pad binnen 5 s en toetst op functie-niveau dat het doel bereikt is en het geld het doel haalt.
   SABOTAGE: vervang "go('dash'); go('vooruit')" door "renderVooruit()" → de screenshot haalt de 5 s niet (HANG).
   OBSERVATIE voor stop 2: hetzelfde doel labelt via go() "nu actief" en via renderVooruit() "vol" (een render-ordening in de
   status-tekst, los van de paint). Nagaan in de app of een bereikt doel in het app-pad als vol toont. Geconstrueerde fixture
   (plan-toestel-stand, Inrichting op zijn doel = scenario e2), geen back-up. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

test('de Plan-paint met een gefund (vol) doel voltooit en rondt de schermafdruk af binnen 5 s', async ({ page }) => {
  await T.boot(page, 'nu');
  const st = await page.evaluate(() => {
    // Inrichting op zijn doel toegewezen EN het geld staat er (ruim spaarsaldo via extraSavings), zodat planVolEcht waar is (e2)
    const g = (SET.goals || []).find(x => x.id === 'iw'); g.gespaard = g.doel; SET.extraSavings = 20000; _dataGen++;
    go('dash'); go('vooruit');   // het app-pad (navigatie), NIET renderVooruit() direct: dat laatste hangt de paint (zie de kop)
    const P = allocatePlan(); const p = P.find(x => x.id === 'iw'); const x = planStandEind(P).per['iw'];
    return { kids: document.getElementById('s-vooruit').children.length, status: p && p.status, geld: x && Math.round(x.geld), doel: x && Math.round(x.doel), vol: planVolEcht(p, x) };
  });
  expect(st.kids).toBeGreaterThan(0);          // de render voltooit (geen lus / self-render)
  expect(st.status).toBe('bereikt');           // het doel is bereikt
  expect(st.geld).toBe(st.doel);               // het geld haalt het doel (echt vol, niet "nog terug")
  expect(st.vol).toBe(true);                   // planVolEcht: de laag Doelen telt het als vol
  // de paint zelf: een schermafdruk van het volle Plan-scherm moet binnen 5 s af zijn (anders hang/crash)
  await page.locator('#s-vooruit').screenshot({ path: test.info().outputPath('plan-vol.png'), timeout: 5000 });
});
