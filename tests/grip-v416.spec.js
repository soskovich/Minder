/* v416: VERVOLG. Op grip-v409-stand (10 oktober 2026).
   A1 "te krap" alleen als de post het verschil maakt: de gewone maand (mediaan van 3 afgeronde maanden zonder periodieke posten)
      past, en gewone maand + post gaat er met de uitschieter-drempel overheen. Gaat de gewone maand er zelf overheen: boven.
   A2 potNodig() telt een periodieke post bij de gewone variabele maand (mediaan), niet bij de hoogste.
   B3 de herzien-sheet van een te krap potje begint met "<post> is gestopt · telt niet meer mee".
   C4 herzien, zonder potje (reservering), te ruim verlagen en het potje-formulier sluiten met een toast "ongedaan maken". */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');

/* De stand van het toestel van de gebruiker, nagebouwd (GECONSTRUEERD): Online shopping EUR 95, gewone maand EUR 84, en een
   kwartaalpost van EUR 15 (Bol). In de maand met de post is het 99. */
const shopping = (page, gewoon, post) => page.evaluate(({ MAIN, gewoon, post }) => {
  for (const t of TX) { if (t.name === 'Bol Abonnement Select') t.amount = -post; if (t.name === 'Bol Com') t.amount = -gewoon; }
  const t = { id: 'v416sep', date: '2026-09-20', amount: -gewoon, acc: MAIN, name: 'Bol Com', desc: 'BEA, BETAALPAS BOL COM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
  categorize(t); TX.push(t); OVR[t.id] = 'shopping'; save(); render(); }, { MAIN: S.MAIN, gewoon, post });
const signalen = page => page.evaluate(() => ({ krap: potKrapLijst().map(x => x.k), boven: potBovenLijst().map(x => x.k),
  P: potMaanden('shopping', thisYM()), gewoon: potKrapGewoon(potMaanden('shopping', thisYM())) }));
const open = page => page.evaluate(() => document.getElementById('sheetBg').classList.contains('show'));
const toast = async page => (await page.locator('#toast').innerText()).replace(/\s+/g, ' ').trim();

test.describe('A1 · te krap alleen als de post het verschil maakt', () => {
  test('de stand van het toestel: Online shopping 84 + Bol 15 = 99 tegen 95: geen signaal', async ({ page }) => {
    await S.boot(page); await shopping(page, 84, 15);
    const r = await signalen(page);
    expect(r.P.bedragen).toEqual([84, 99, 84]);   // invoermeting
    expect(r.gewoon).toBe(84);
    expect(r.krap).not.toContain('shopping');
    expect(r.boven).not.toContain('shopping');
  });
  test('de post maakt het verschil met de drempel: gewone maand 65 + Bol 95 tegen 95 is te krap', async ({ page }) => {
    await S.boot(page);
    const r = await signalen(page);
    expect(r.gewoon).toBe(65);
    expect(r.krap).toContain('shopping');
  });
  test('de gewone maand gaat er zelf al overheen: boven, niet te krap', async ({ page }) => {
    await S.boot(page); await shopping(page, 130, 15);
    const r = await signalen(page);
    expect(r.gewoon).toBe(130);
    expect(r.krap).not.toContain('shopping');
    expect(r.boven).toContain('shopping');
  });
  test('de gewone maand is de mediaan, niet het gemiddelde of de hoogste', async ({ page }) => {
    await S.boot(page);
    const g = await page.evaluate(() => potKrapGewoon({ bedragen: [10, 200, 50], periodiek: [{}, { bedrag: 100 }, {}] }));
    expect(g).toBe(50);   // 10, 100, 50: mediaan 50 (gemiddeld 53, hoogst 100)
  });
});

test.describe('A2 · potNodig: de post bij de gewone maand', () => {
  test('Online shopping november: gewone maand 65 + Bol 95 = 160, niet hoogste 99 + 95', async ({ page }) => {
    await S.boot(page);
    const N = await page.evaluate(() => { const N = potNodig('shopping', maandVooruit()); return { nodig: N.nodig, maand: N.maand, varMed: N.varMed, varMax: N.varMax, delen: N.opbouw.delen }; });
    expect(N.maand).toBe('2026-11');
    expect(N.varMed).toBe(65); expect(N.varMax).toBe(99);
    expect(N.nodig).toBe(160);
    expect(N.delen[0]).toEqual({ naam: 'variabel gewoon', bedrag: 65 });
  });
  test('blok 19 toont de opbouw met "variabel gewoon"', async ({ page }) => {
    await S.boot(page);
    const d = (await page.evaluate(() => diagEenSignaal(maandVooruit()))).join('\n');
    expect(d).toContain('nodig 160 = nov 2026: variabel gewoon 65 + Bol Abonnement Select 95');
  });
});

test.describe('B3 · gestopt als eerste keuze in de herzien-sheet', () => {
  test('de eerste optie is de post, met laatste betaling, bedrag en cadans; geen losse link', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openPotHerzien('shopping'); const o = [...document.querySelectorAll('#potHerzienSheet [data-phoptie]')];
      return { eerste: o[0].dataset.phoptie, tekst: o[0].innerText.replace(/\s+/g, ' ').trim(), link: document.querySelectorAll('#potHerzienSheet [data-phgestopt]').length }; });
    expect(r.eerste).toBe('g:BOL ABONNEMENT SELEC');
    expect(r.tekst).toBe('Bol Abonnement Select is gestopt · telt niet meer mee laatste betaling 16 aug 2026 · €95 per kwartaal');
    expect(r.link).toBe(0);
  });
  test('bevestigen zet de post op gestopt, sluit de sheet, en ongedaan maken zet hem terug', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); openPotHerzien('shopping'); });
    await page.locator('[data-phoptie="g:BOL ABONNEMENT SELEC"]').click();
    expect((await page.locator('[data-phbevestig]').innerText()).trim()).toBe('Bol Abonnement Select gestopt');
    await page.locator('[data-phbevestig]').click();
    expect(await open(page)).toBe(false);
    expect(await page.evaluate(() => postStatus('BOL ABONNEMENT SELEC').status)).toBe('gestopt');
    expect(await page.evaluate(() => potKrapLijst().map(x => x.k))).not.toContain('shopping');
    expect(await toast(page)).toBe('Bol Abonnement Select gestopt · ongedaan maken');
    await page.locator('#toast [data-ongedaan]').click();
    expect(await page.evaluate(() => postStatus('BOL ABONNEMENT SELEC').status)).toBe('actief');
    expect(await page.evaluate(() => potKrapLijst().map(x => x.k))).toContain('shopping');
  });
});

test.describe('C4 · elke keuze sluit de sheet, met ongedaan maken', () => {
  const velden = page => page.evaluate(() => JSON.stringify(['budgets', 'budgetsNext', 'budgetPlan', 'planInleg', 'potHerzienLaten', 'potHerzienLog', 'teRuimLog', 'afspraken'].map(k => SET[k] === undefined ? null : SET[k])));
  const klaar = async (page, tekst, voor) => {
    expect(await open(page)).toBe(false);
    expect(await toast(page)).toBe(tekst + ' · ongedaan maken');
    expect(await velden(page)).not.toBe(voor);
    await page.locator('#toast [data-ongedaan]').click();
    expect(await velden(page)).toBe(voor);
  };
  test('herzien: laten staan', async ({ page }) => {
    await S.boot(page); const voor = await velden(page);
    await page.evaluate(() => { openPotHerzien('vices'); window._ph.optie = 'c'; potHerzienBevestig(); });
    await klaar(page, 'Vices laten staan', voor);
  });
  test('herzien: naar het voorstel uit het maandbudget', async ({ page }) => {
    await S.boot(page); const voor = await velden(page);
    const v = await page.evaluate(() => { openPotHerzien('vices'); window._ph.optie = 'a'; window._ph.bron = 'budget'; const v = potBovenLijst().find(x => x.k === 'vices').voorstel; potHerzienBevestig(); return v; });
    await klaar(page, `Vices op €${v} · uit het maandbudget`, voor);
  });
  test('zonder potje: reservering in Plan', async ({ page }) => {
    await S.boot(page); const voor = await velden(page);
    const t = await page.evaluate(() => { openZonderKeuze('e_kinderen'); window._zk.optie = 'res'; const Z = zonderKeuzeStand(); zonderKeuzeZet(); return `Kinderen: reservering €${Z.res}/mnd in Plan`; });
    await klaar(page, t, voor);
  });
  test('te ruim: verlagen naar het voorstel', async ({ page }) => {
    await S.boot(page); const voor = await velden(page);
    const ok = await page.evaluate(() => { const V = maandVooruit(), x = teRuim(V).find(t => t.k === 'huur'); openTeRuim('huur'); window._tr.optie = 'a';
      const D = teRuimBestemmingen(V, x); window._tr.bestem = D.vast.concat(D.ander).find(b => b.soort === 'res').id; teRuimBevestig(); return !!x; });
    expect(ok).toBe(true);
    const t = await toast(page);
    expect(t).toMatch(/^Huur op €\d+ · €\d+ naar .+ · ongedaan maken$/);
    await klaar(page, t.replace(' · ongedaan maken', ''), voor);
  });
  test('het potje-formulier: verhogen uit het maandbudget', async ({ page }) => {
    await S.boot(page); const voor = await velden(page);
    await page.evaluate(() => { openPotForm('vices'); Object.assign(window._potForm, { bedrag: '45', vanaf: nextYM(thisYM()), bron: 'verhoog' }); potFormZet(); });
    await klaar(page, `Vices €45 vanaf ${await page.evaluate(() => ymKort(nextYM(thisYM())))}`, voor);
  });
});

test.describe('fit 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const geenOverloop = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  test('Zien: koopknop minstens 16px boven de menubalk', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand');
      return { knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top }; });
    console.log(`v416 fit Zien: knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
    expect(r.nav - r.knop).toBeGreaterThanOrEqual(16);
    expect(await geenOverloop(page)).toBe(true);
  });
  test('Let op open: de lijst past in de sheet zonder overloop', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); openGripLetOpLijst(); const sh = document.getElementById('sheet');
      return { sw: sh.scrollWidth, cw: sh.clientWidth, n: document.querySelectorAll('#gripLetOpLijst [data-letop]').length }; });
    console.log(`v416 fit Let op: ${r.n} regels`);
    expect(r.sw).toBeLessThanOrEqual(r.cw);
    expect(await geenOverloop(page)).toBe(true);
  });
  test('herzien-sheet met de gestopt-keuze: past zonder scrollen, knop zichtbaar', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { openPotHerzien('shopping'); potHerzienKies('g:BOL ABONNEMENT SELEC'); });
    await page.waitForTimeout(600);   // de sheet schuift in
    const r = await page.evaluate(() => { const sh = document.getElementById('sheet'), k = document.querySelector('[data-phbevestig]').getBoundingClientRect();
      return { sh: sh.scrollHeight, ch: sh.clientHeight, sw: sh.scrollWidth, cw: sh.clientWidth, knop: k.bottom, vh: innerHeight }; });
    console.log(`v416 fit herzien: ${r.sh}px van ${r.ch}px, knop ${Math.round(r.knop)}px`);
    expect(r.sh).toBeLessThanOrEqual(r.ch);
    expect(r.knop).toBeLessThanOrEqual(r.vh);
    expect(r.sw).toBeLessThanOrEqual(r.cw);
  });
});
