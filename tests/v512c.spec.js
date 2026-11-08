/* v512c: DE OPDRACHT VAN DE GEBRUIKER NA v512b (werk/v512), punt 1 t/m 3.
   1. "Herstelt zich" alleen als het potje in minstens een van de twee vorige maanden boven zijn potje eindigde en nu op dagtempo
      eronder zit met een verschil dat afgerond boven EUR 0 ligt; het bedrag van het signaal is dat verschil (insPatronen).
   2. Afgehandeld staat in Terugblik en niet in Signalen, met precies de punten die tot v512b in Signalen stonden (d46a6f1, v511).
   3. Onder "Al gekozen" staat de afspraak uit het gesprek alleen als hij gekozen is en nog geldt, met vinkje en datum
      (coachGekozenStand); een acceptatie die niet meer geldt is een open keuze onder Te kiezen.
   Fixtures GECONSTRUEERD: inzichten-stand (oktober 2026), v421-stand (10 oktober 2026) en de dekkingsstand van aandacht-lijstregel
   (EUR 37 in de pot, een boete van EUR 299 in oktober, 3 oktober 2026). */
const { execSync } = require('child_process');
const { test, expect } = require('./klok');
const { pinDatum } = require('./vaste-dag');
const I = require('./inzichten-stand');
const S421 = require('./v421-stand');

const pat = page => page.evaluate(() => insPatronen('alle').filter(p => p.soort === 'herstelt').map(p => ({ k: p.k, bedrag: p.bedrag, tekst: p.tekst })));

test.describe('v512c · 1. herstelt zich', () => {
  test('1a. een overschrijding twee maanden terug telt ook (vorige maand binnen, augustus erboven)', async ({ page }) => {
    await I.boot(page, { dag: '2026-10-16' });
    await page.evaluate(() => { const t = TX.find(x => x.name === 'Albert Heijn' && x.date === '2026-10-03'); t.amount = -40; save(); });
    const r = await page.evaluate(() => { const orig = window.insVorigeBoven;
      window.insVorigeBoven = (k, ym) => k !== 'boodschappen' ? orig(k, ym) : ym === '2026-08' ? { bedrag: 60, log: false } : null;
      try { return insPatronen('alle').filter(p => p.soort === 'herstelt' && p.k === 'boodschappen').map(p => ({ bedrag: p.bedrag, tekst: p.tekst })); } finally { window.insVorigeBoven = orig; } });
    expect(r.length).toBe(1);
    expect(r[0].bedrag).toBe(39);
    expect(r[0].tekst).toContain('In augustus €60 boven je potje');
    /* tegenproef: zonder overschrijding in beide maanden geen herstel */
    const geen = await page.evaluate(() => { const orig = window.insVorigeBoven; window.insVorigeBoven = (k, ym) => k === 'boodschappen' ? null : orig(k, ym);
      try { return insPatronen('alle').some(p => p.soort === 'herstelt' && p.k === 'boodschappen'); } finally { window.insVorigeBoven = orig; } });
    expect(geen).toBe(false);
  });
  test('1b. een verschil dat afgerond EUR 0 is geeft geen signaal, ook na de helft en met september erboven', async ({ page }) => {
    await I.boot(page, { dag: '2026-10-16' });
    await page.evaluate(() => { const t = TX.find(x => x.name === 'Albert Heijn' && x.date === '2026-10-03'); t.amount = -40; save(); });
    expect((await pat(page)).map(p => p.k)).toContain('boodschappen');   // tegenproef: met een echt verschil wel
    /* maandVooruit rondt af, dus een verschil onder de euro is met boekingen niet te maken: de vooruitblik krijgt het hier, met een
       achterstand van EUR 0,30 (achter op tempo, maar afgerond EUR 0) */
    const r = await page.evaluate(() => { const orig = window.maandVooruit;
      window.maandVooruit = (...a) => { const V = orig(...a); const x = V.potjes.find(p => p.k === 'boodschappen'); if (x) x.uit = x.typisch - 0.3; return V; };
      try { return insPatronen('alle').filter(p => p.soort === 'herstelt').map(p => ({ k: p.k, bedrag: p.bedrag })); } finally { window.maandVooruit = orig; } });
    expect(r.filter(p => p.k === 'boodschappen')).toEqual([]);
    for (const p of r) expect(p.bedrag).toBeGreaterThan(0);
  });
});

test.describe('v512c · 2. afgehandeld in Terugblik', () => {
  const stand = page => page.evaluate(() => { const G = vastGestegenData(), N = naJeSalarisData();
    SET.vastAccept = SET.vastAccept || {}; for (const p of G.stijg) SET.vastAccept[p.key] = { op: '2026-10-10', bedrag: p.verschil, cat: p.cat, bron: 'budget' };
    SET.inkomenVerdeeld = { [N.ym]: { bedrag: 100, op: '2026-10-10', van: SET.savingAmount || 0 } };
    inkomenBewustZet('bewust'); window._gripCyc = null; go('maand'); renderMaand(); });
  const ids = (page, sel) => page.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.dataset.afgehandeldrij), sel);
  test('2. Terugblik toont precies de afgehandelde punten die v511 in Signalen toonde, en Signalen toont er geen', async ({ page, browser }) => {
    /* v511 (d46a6f1): de lijst in Signalen, opengeklapt */
    const p0 = await browser.newPage();
    const html = execSync('git show d46a6f1:index.html', { maxBuffer: 64 * 1024 * 1024 });
    await p0.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await S421.boot(p0); await stand(p0);
    await p0.evaluate(() => { window._gripTab = 'zien'; window._gripAfOpen = true; renderMaand(); });
    const oud = await ids(p0, '#gripSignalen [data-afgehandeldrij]'); await p0.close();
    expect(oud.length).toBeGreaterThan(0);                   // de invoer draagt afgehandelde punten
    /* nu */
    await S421.boot(page); await stand(page);
    await page.evaluate(() => { window._gripTab = 'zien'; renderMaand(); });
    await expect(page.locator('#gripSignalen [data-afgehandeld], #gripSignalen [data-afgehandeldrij]')).toHaveCount(0);
    await page.evaluate(() => gripKiesTab('terugblik'));
    expect(await ids(page, '#gripAfgehandeld [data-afgehandeldrij]')).toEqual(oud);
    expect(await page.locator('#gripAfgehandeld').innerText()).toContain('Vaste lasten gestegen · alles geaccepteerd');
  });
});

/* 3: de dekkingsstand van aandacht-lijstregel (de boete van EUR 299 in de lopende maand, dus een tekort) */
const MAIN = 'NL01MAIN0000001111', RES = 'NL01RESV0000007586';
function seed() {
  const tx = [];
  ['2026-07', '2026-08', '2026-09', '2026-10'].forEach((m, i) => tx.push({ id: 'i' + i, date: m + '-01', amount: 4200, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }));
  tx.push({ id: 'r0', date: '2026-07-08', amount: 37, acc: RES, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const set = { mode: 'begeleid', autoIncome: false, income: 4200, bufferNorm: 2, budgetMonth: '2026-10', manualBal: { [MAIN]: 3000, [RES]: 37 }, resAcc: RES, resCheck: '2026-10',
    reserveringen: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: '2026-10', intervalM: 0 }] };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page) {
  await pinDatum(page, '2026-10-03');
  await page.addInitScript(d => { if (!sessionStorage.getItem('z')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('z', '1'); } }, seed());
  await page.goto('/index.html'); await page.waitForFunction(() => typeof renderMaand === 'function');
  /* de keuze zoals het gesprek hem vastlegt (coMaandBevestig: eerst de afspraak, dan de acceptatie) */
  await page.evaluate(() => { const R = maandRegels().find(r => r.key === 'dekking'), opt = maandRegelOpties(R, thisYM()).find(o => o.accept === 'dekking');
    coAfspraakSchrijf(opt.tekst, Object.assign({ regel: 'dekking' }, opt.extra)); maandAcceptZet('dekking'); window._gripCyc = null; window._gripTab = 'kiezen'; go('maand'); renderMaand(); });
}
const kiezen = page => page.evaluate(() => { window._gripCyc = null; window._gripTab = 'kiezen'; renderMaand(); const A = document.getElementById('gripAlGekozen'), T = document.getElementById('gripTeKiezen');
  return { al: A.innerText, coach: [...A.querySelectorAll('[data-afspraak="coach"]')].map(e => ({ box: (e.querySelector('[data-box]') || {}).dataset?.box, op: (e.querySelector('[data-afspraakop]') || {}).dataset?.afspraakop })),
    leeg: A.querySelectorAll('[data-box="uit"]').length, open: [...T.querySelectorAll('[data-kies]')].map(e => e.dataset.kies) }; });

test.describe('v512c · 3. Al gekozen', () => {
  test('3a. een gekozen acceptatie staat onder Al gekozen met vinkje en datum, en niet onder Te kiezen', async ({ page }) => {
    await boot(page);
    const k = await kiezen(page);
    expect(k.al).toContain('Ik accepteer dit');
    expect(k.coach).toEqual([{ box: 'aan', op: '2026-10-03' }]);
    expect(k.al).toContain('gekozen op 3 okt');
    expect(k.leeg).toBe(0);
    expect(k.open).not.toContain('accept:dekking');
  });
  test('3b. een acceptatie die niet meer geldt is een open keuze: niet onder Al gekozen, wel onder Te kiezen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { maandAcceptWis('dekking'); });   // de acceptatie vervalt (geen geldige SET.maandAccept meer), de afspraak staat nog in het logboek
    expect(await page.evaluate(() => !!coachThisMonthAfspraak())).toBe(true);
    const k = await kiezen(page);
    expect(k.coach).toEqual([]);
    expect(k.al).not.toContain('Ik accepteer dit');
    expect(k.leeg).toBe(0);
    expect(k.open).toContain('accept:dekking');
  });
  test('3c. onder Al gekozen staat nooit een leeg vakje', async ({ page }) => {
    await boot(page);
    for (const wis of [false, true]) { if (wis) await page.evaluate(() => maandAcceptWis('dekking'));
      expect((await kiezen(page)).leeg).toBe(0); }
  });
});
