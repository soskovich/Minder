/* v352: DE SHEET ACHTER "DEZE MAAND" OP GRIP DRAAGT GEEN TWEEDE BRIDGE MEER, EN DE AS VAN DE BRIDGE OP DE
   KAART NOEMT GEEN BEDRAG. Op keuze van de gebruiker: het as-label (EUR 2.000 op de stand van 6 oktober)
   stond op 360px half buiten de kaart en zei niets wat de uitkomst boven de bridge niet al zei, en de
   waterval in de sheet (uitgegeven, vast nog, per potje) was een tweede weergave van de bridge op de
   kaart. De sheet houdt de band als EEN regel bovenaan en "Wat je deze maand kunt doen". */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');
const { boot: bootBrug } = require('./deze-maand-stand');
const { LOG } = require('./grip-stand');

const SET = { budgetMonth: '2026-10', budgets: { boodschappen: 500, huur: 900, abonnement: 30, uiteten: 150 }, valtOpLog: LOG, maandGelezen: '2026-10-03' };
/* Uit eten: potje 150, in juli tot september telkens 80 na dag 4, in oktober op dag 2 al 100. Op tempo
   eindigt het op 180, dus er is een handeling. */
const UIT = [
  ...['2026-07', '2026-08', '2026-09'].map((m, i) => ({ id: 'u' + i, date: m + '-20', amount: -80, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' })),
  { id: 'u9', date: '2026-10-02', amount: -100, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' },
];
const stand = (page) => boot(page, { dag: '2026-10-04', set: SET, extraTx: UIT });
const sheet = (page) => page.evaluate(() => {
  closeSheet(); go('maand'); openGripVooruit();
  const g = document.getElementById('gripVooruit'), b = g.querySelector('[data-bandregel]');
  const kop = [...g.querySelectorAll('.hlabel')].map((e) => e.innerText.trim());
  return { stappen: g.querySelectorAll('[data-vstap],[data-brugstap],[data-budgetlijn],[data-band]').length,
    proj: +g.dataset.projectie, band: b ? b.innerText.replace(/\s+/g, ' ') : null, bandIdx: b ? [...g.children].indexOf(b) : -1,
    kop, hand: g.querySelectorAll('[data-handeling]').length, tekst: g.innerText.replace(/\s+/g, ' ') };
});

test('a. de sheet draagt geen tweede bridge, wel de band als regel en de handelingen', async ({ page }) => {
  await stand(page);
  const V = await page.evaluate(() => { const V = maandVooruit(); return { proj: V.projectie, min: V.band.min, max: V.band.max, h: V.handelingen.length }; });
  // invoermeting: de stand draagt een handeling, anders zegt "de handelingen blijven" niets
  expect(V.h).toBe(1);
  const s = await sheet(page);
  expect(s.stappen).toBe(0);
  expect(s.proj).toBe(V.proj);
  expect(s.bandIdx).toBe(1);                                  // direct onder de titel
  const e = (n) => `€${n.toLocaleString('nl-NL')}`;
  expect(s.band).toContain(`Rond ${e(V.proj)}`);
  expect(s.band).toContain(`tussen ${e(V.min)} en ${e(V.max)}`);
  expect(s.kop.map((k) => k.toUpperCase())).toEqual(['WAT JE DEZE MAAND KUNT DOEN']);
  expect(s.hand).toBe(1);
  // wat de tweede bridge droeg staat er niet meer als opbouw
  for (const weg of ['Uitgegeven', 'Vast nog', 'Bovenop je budget']) expect(s.tekst).not.toContain(weg);
});

test('b. de functie van de tweede bridge bestaat niet meer, en de sheet leest maandVooruit opnieuw', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => ({ grafiek: typeof window.vooruitGrafiek, los: typeof window.VOORUIT_LOS, maanden: typeof VOORUIT_MAANDEN,
    bron: renderGripVooruit.toString().includes('maandVooruit(') }));
  expect(r).toEqual({ grafiek: 'undefined', los: 'undefined', maanden: 'number', bron: true });
});

for (const w of [360, 390]) {
  test(`c. op ${w}px: de bandregel en de sheet lopen niet over`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
    await stand(page);
    await sheet(page);
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => { const g = document.getElementById('gripVooruit'), b = g.querySelector('[data-bandregel]');
      const lh = parseFloat(getComputedStyle(b).lineHeight);
      return { band: Math.round(b.getBoundingClientRect().height), regels: Math.round(b.getBoundingClientRect().height / lh),
        sheet: Math.round(g.getBoundingClientRect().height), over: g.scrollWidth > g.clientWidth || document.getElementById('sheet').scrollWidth > document.getElementById('sheet').clientWidth };
    });
    console.log(`v352 ${w}px`, JSON.stringify(m));
    expect(m.over).toBe(false);
    // GEMETEN: een zin over twee regels (38px) op beide breedtes; de sheet is 299px op 360 en 265px op 390
    expect(m.regels).toBeLessThanOrEqual(2);
  });
}

test('d. de as van de bridge op de kaart begint bij de ondergrens zonder bedrag erbij', async ({ page }) => {
  await bootBrug(page);
  const r = await page.evaluate(() => { closeSheet(); go('maand'); const a = document.querySelector('#gripBrug [data-asbasis]');
    return { basis: a ? +a.dataset.asbasis : null, label: a ? a.innerText : null, kaart: document.getElementById('gripBrug').innerText }; });
  // v354: de bridge gaat over de variabele potjes (550 naar 694), dus de as begint bij 450
  expect(r.basis).toBe(450);
  expect(r.label).toBe('');
  expect(r.kaart).not.toContain('€450');
});
