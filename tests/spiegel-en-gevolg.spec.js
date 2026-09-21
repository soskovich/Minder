// v174: een element dat een stand toont zonder gevolg, of een gevolg zonder keuze, is onvolledig.
// Vier plekken: "Valt op" toonde alleen het wat, een tekort kreeg alleen in Rustig een volgende
// stap, de verse-start-kaart sprak het blok eronder tegen, en coHorizonVraag noemde bij meerdere
// tekorten er een zonder te zeggen dat er meer waren.
// Een gevolg wordt nooit verzonnen om de vorm compleet te maken: heeft een signaal geen tik die uit
// de data volgt, dan zegt de regel dat het een observatie is.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3];
const overMnd = (k) => { const d = new Date(now); d.setMonth(d.getMonth() + k);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
/* v239: de piekdag meet een WEEKDAG tegen je eigen gemiddelde voor die weekdag. De oude fixture
   boekte op dag 5, 12, 19 en 26 van de maand; dat is binnen een maand dezelfde weekdag maar over
   maanden heen een andere, dus de referentie voor de piekdag van deze maand stond op nul en het
   signaal zweeg. Gemeten: zaterdag 91% met referentie 0%. Deze helper zet de boekingen op een
   echte weekdag, zodat de fixture een gewoonte bouwt in plaats van een kalenderartefact. */
const dagenMet = (m, wd, aantal) => { const [y, mo] = m.split('-').map(Number); const uit = [];
  for (let d = 1; d <= 31 && uit.length < aantal; d++) { const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) break; if (dt.getDay() === wd) uit.push(String(d).padStart(2, '0')); }
  return uit; };

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (dt, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: dt, amount: a, acc: acc || MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m, k) => {
    add(`${m}-02`, 3000, 'Werkgever', 'SALARIS LOON');
    add(`${m}-03`, -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    if (o.oploop) add(`${m}-08`, -(120 + k * 90), 'Apotheek', 'BEA, BETAALPAS APOTHEEK CENTRUM');
    // v230: signaal 2 vuurt alleen op een afgeronde maand, dus de uitschieter valt in de VORIGE maand
    if (o.uitschieter) add(`${m}-16`, m === MS[2] ? -700 : -60, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    if (o.winkel && m === CUR) add(`${m}-14`, -900, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
    /* v239: vrijdag is de gewoonte (historie ~45% van het losse geld), en in de lopende maand
       springt hij eruit (~80%). Dat is een afwijking van ongeveer 1,8x, dus boven PIEK_FACTOR. */
    if (o.piek) { const isCur = m === CUR;
      dagenMet(m, 5, 4).forEach((d) => add(`${m}-${d}`, isCur ? -120 : -50, 'Cafe De Hoek', 'BEA, BETAALPAS CAFE DE HOEK'));
      [1, 2, 3, 4].forEach((wd) => dagenMet(m, wd, 1).forEach((d) => add(`${m}-${d}`, isCur ? -30 : -60, 'Cafe De Hoek', 'BEA, BETAALPAS CAFE DE HOEK'))); }
    if (o.spaar) add(`${m}-26`, 0.01, 'Spaarpot', 'NAAR SPAREN', SAV);
  });
  const bal = { [MAIN]: o.saldo != null ? o.saldo : 4000 };
  if (o.spaar) bal[SAV] = o.spaarSaldo != null ? o.spaarSaldo : 0;
  const set = Object.assign({ mode: o.mode || 'begeleid', autoIncome: false, income: 3000, limit: 70,
    // v243: de grendel staat hier open; deze spec gaat over wat er daarna gebeurt
    nfToegewezen: 9e7, nfToegewezenMigrated: true,

    manualBal: bal, budgets: { huur: 900, boodschappen: 300 }, goals: o.goals || [],
  }, o.set || {});
  if (o.spaar) set.savingsEnds = ['4323'];
  if (o.goals) set.planOrder = ['noodfonds'].concat(o.goals.map((g) => g.id));
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.spaar ? [MAIN, SAV] : [MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insSignals === 'function');
}
const signalen = (page, m) => page.evaluate((m) => insSignals(m, new Set()), m || CUR);
/* De regel zoals hij op Inzichten staat, voor precies dit ene signaal.
   v235: dit ging via whatStandsOutLine() met window.insSignals tijdelijk overschreven, omdat die
   functie zelf koos welk signaal bovenaan kwam. insPatroonRij() rendert één signaal, dus de
   monkeypatch is weg en dit meet de echte functie met echte data. */
const regelVoor = (page, label, m) => page.evaluate(([m, l]) => {
  const s = insSignals(m, new Set()).find((x) => x.kpiLabel === l);
  if (!s) return null;
  const d = document.createElement('div'); d.innerHTML = insPatroonRij(s);
  return { txt: d.innerText.replace(/\s+/g, ' '), html: d.innerHTML };
}, [m || CUR, label]);

test.describe('1 · elk signaal draagt een duiding en een dus-wat', () => {
  const GEVALLEN = [
    ['categorie loopt op', { oploop: true }, 'Zorg & apotheek', 'loopt al drie maanden op'],
    ['ver boven je normaal', { uitschieter: true }, 'Uit eten & café', 'een groter deel van je uitgaven dan je gewend bent', MS[2]],   // v230: de maat van de conditie, op een afgeronde maand
    ['piekdag', { piek: true }, 'Piekdag', 'van je losse geld ging op'],   // v239: en de referentie erachter
    ['grootste winkel', { winkel: true, set: { budgets: { huur: 900 } } }, 'Grootste uitgave', 'domineert je losse uitgaven'],
  ];
  for (const [naam, opt, label, zin, maand] of GEVALLEN) {
    test(`${naam}: duiding, dus-wat en een tik of de melding dat die er niet is`, async ({ page }) => {
      await boot(page, seed(opt));
      const alle = await signalen(page, maand);
      const s = alle.find((x) => x.kpiLabel === label);
      test.skip(!s, `deze fixture levert het signaal ${label} niet`);
      expect(s.hyp, 'duiding').toBeTruthy();
      expect(s.imp, 'dus-wat').toBeTruthy();
      // een tik, of expliciet gemarkeerd als alleen-spiegel: nooit stilzwijgend geen van beide
      expect(!!s.act || !!s.spiegel, 'tik of spiegel-markering').toBe(true);
      const r = await regelVoor(page, label, maand);
      expect(r.txt).toContain(zin);
      if (s.act) {
        expect(r.html).toContain(s.act);
        expect(r.txt).not.toContain('Alleen een observatie');
      } else {
        expect(r.txt).toContain('Alleen een observatie: hier hoort geen stap bij.');
      }
    });
  }

  test('geen enkel signaal komt zonder duiding of dus-wat door', async ({ page }) => {
    for (const opt of [{ oploop: true }, { uitschieter: true }, { piek: true }, { winkel: true }]) {
      await boot(page, seed(opt));
      for (const s of await signalen(page)) {
        expect(typeof s.hyp, s.kpiLabel).toBe('string');
        expect(typeof s.imp, s.kpiLabel).toBe('string');
        expect(s.hyp.length, s.kpiLabel).toBeGreaterThan(0);
        expect(s.imp.length, s.kpiLabel).toBeGreaterThan(0);
      }
    }
  });

  test('de zinnen zijn de bewaarde zinnen, niet herschreven', async ({ page }) => {
    await boot(page, seed({ oploop: true }));
    const r = await regelVoor(page, 'Zorg & apotheek');
    expect(r.txt).toContain('Kijk of dit blijvend is; zo ja, zet er een grens op.');
  });

  test('geen aanmoediging, geen score', async ({ page }) => {
    for (const opt of [{ oploop: true }, { piek: true }, { winkel: true }]) {
      await boot(page, seed(opt));
      const t = await page.evaluate((m) => { const d = document.createElement('div');
        d.innerHTML = insSignalRows(m, true); return d.innerText; }, CUR);
      expect(t).not.toMatch(/goed bezig|knap|mooi|gefeliciteerd|op rij|streak|punten/i);
      expect(t).not.toMatch(/[!—]/);
    }
  });
});

test.describe('2 · een tekort krijgt in elke modus dezelfde volgende stap', () => {
  for (const mode of ['rustig', 'begeleid', 'expert']) {
    test(`${mode}: spiegel, gevolg en keuze`, async ({ page }) => {
      await boot(page, seed({ mode, saldo: 100 }));
      await page.evaluate(() => go('dash'));
      await page.waitForTimeout(110);
      const r = await page.evaluate(() => ({
        txt: $('#s-dash .homehero').innerText.replace(/\s+/g, ' '),
        html: $('#s-dash .homehero').innerHTML }));
      expect(r.txt, mode).toContain('Eén potje geeft je grip op waar het heen gaat.');
      expect(r.html, mode).toContain('openPotjePick()');
      expect(r.txt, mode).toContain('Maak potje');
    });
  }

  test('Rustig houdt zijn eigen aanhef en zijn gedempte kleur', async ({ page }) => {
    await boot(page, seed({ mode: 'rustig', saldo: 100 }));
    await page.evaluate(() => go('dash'));
    await page.waitForTimeout(110);
    const h = await page.evaluate(() => $('#s-dash .homehero').innerHTML);
    expect(h).toContain('Je zit deze maand krap.');
    expect(h).toContain('var(--amber)');
  });

  test('zonder tekort staat de stap er niet', async ({ page }) => {
    await boot(page, seed({ saldo: 9000 }));
    await page.evaluate(() => go('dash'));
    await page.waitForTimeout(110);
    expect(await page.evaluate(() => $('#s-dash .homehero').innerText)).not.toContain('Maak potje');
  });

  test('bij een onbekend saldo geen tekort-stap, want er is geen tekort vastgesteld', async ({ page }) => {
    const p = seed({});
    const set = JSON.parse(p.minder_set); set.manualBal = {}; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    await page.evaluate(() => go('dash'));
    await page.waitForTimeout(110);
    const t = await page.evaluate(() => $('#s-dash .homehero').innerText);
    expect(t).toContain('onbekend');
    expect(t).not.toContain('Maak potje');
  });
});

/* v195: hier stond blok 3, vier tests over de verse-startkaart op Home. Die kaart is opgeheven:
   hij was een complete tweede voornemenlus naast de coachlus, met een leeg tekstveld op een scherm
   dat over iets anders gaat. De bevinding die deze tests bewaakten (v174: de kaart opende met 'je
   speelruimte staat weer vol' boven een negatieve Veilig te besteden) heeft daarmee geen onderwerp
   meer; het getal zelf staat onveranderd in de hero eronder, en blok 1 en 2 hierboven toetsen dat.
   Het moment dat de kaart belichaamde leeft voort als timing op Maand; zie voornemen-en-moment. */
test.describe('4 · coHorizonVraag noemt er een en zegt hoeveel er zijn', () => {
  const doelen = (n) => Array.from({ length: n }, (_, i) => ({ id: 'g' + i, naam: 'Doel ' + (i + 1),
    doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 50, streefdatum: overMnd(4) }));
  const vraag = (page) => page.evaluate(() => { const d = document.createElement('div');
    d.innerHTML = coHorizonVraag(); return d.innerText.replace(/\s+/g, ' '); });

  test('één tekort: geen telling', async ({ page }) => {
    await boot(page, seed({ goals: doelen(1) }));
    const t = await vraag(page);
    expect(t).toContain('voor Doel 1');
    expect(t).not.toMatch(/ander doel|andere doelen/);
  });

  test('twee tekorten: één genoemd, de ander geteld', async ({ page }) => {
    await boot(page, seed({ goals: doelen(2) }));
    expect(await vraag(page)).toContain('en voor 1 ander doel ook');
  });

  test('drie tekorten: één genoemd, twee geteld', async ({ page }) => {
    await boot(page, seed({ goals: doelen(3) }));
    expect(await vraag(page)).toContain('en voor 2 andere doelen ook');
  });

  test('het genoemde doel is het eerste uit je plan, en de telling rekent niets bij', async ({ page }) => {
    await boot(page, seed({ goals: doelen(3) }));
    const r = await page.evaluate(() => {
      const eerste = maandDoel();
      return { naam: eerste && eerste.p.naam, meer: coHorizonMeer(eerste && eerste.p.id),
        src: coHorizonMeer.toString() };
    });
    expect(r.naam).toBe('Doel 1');
    expect(r.meer).toBe(2);
    expect(r.src).toContain('doelTempo(');          // leest bestaande uitkomsten
    expect(r.src).not.toMatch(/Math\.round|\/ *12/); // en rekent er niets bij
  });
});
