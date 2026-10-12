// v392 (keuzes van de gebruiker). A: de uitschieter-drempel blijft voor de signalen in Begrijpen; de bridge en de meter
// tellen elk bedrag mee, en een potje dat boven budget eindigt maar onder de drempel blijft staat sinds v393 als kleine
// grijze noot "+EUR X" bij de stap overig in de bridge op Zien (geen eigen regel meer); een tik zegt "<potje> · onder de
// drempel". Geen signaal en geen patroon. B: een gemengd potje toetst zijn variabele
// deel apart met RUIMER_DREMPEL; het vaste deel blijft beschermd door de posten in hun eigen maand.
// Fixture: grip-kring-stand (10 okt 2026). Vices eindigt EUR 5 boven EUR 20 (onder de drempel van EUR 10), Uit eten
// EUR 67 boven (een uitschieter). Vervoer: vast 603, variabel 497 met drie maanden EUR 0 en verwacht eind EUR 99.
// Verzekeringen: vast 164, variabel 171 met drie maanden EUR 0, maar DELA EUR 160 in december.
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const grip = async page => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page); await page.evaluate(() => go('maand')); };

test.describe('A · onder de drempel', () => {
  test('Vices +EUR 5 staat als noot bij overig, Uit eten niet; een tik zegt "Vices · onder de drempel" (v393)', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), x = V.potjes.find(p => p.k === 'vices');
      const noten = [...document.querySelectorAll('#gripZien [data-brugnoot]')].map(e => [e.closest('[data-brugstap]').dataset.brugstap, e.innerText]);
      const toasts = []; const t0 = window.toast; window.toast = m => toasts.push(m);
      let kolom = 0; const o0 = window.openGripOverig; window.openGripOverig = () => { kolom++; };
      document.querySelector('#gripZien [data-brugnoot]').click(); window.toast = t0; window.openGripOverig = o0;
      return { over: Math.round(x.overR), uit: potjeUitschieter(x), noten, toasts, kolom,
        regels: document.querySelectorAll('[data-onderdrempel]').length }; });
    expect(r.over).toBe(5); expect(r.uit).toBe(false);
    expect(r.noten).toEqual([['overig', '+€5']]);
    expect(r.toasts).toEqual(['Vices · onder de drempel']);
    expect(r.kolom).toBe(0);   // de noot heeft een eigen tik; de kolom (de sheet overig) opent niet
    expect(r.regels).toBe(0);  // geen eigen grijze regel meer
  });
  test('de noot staat binnen het grafiekvlak: de bridge wordt er niet hoger van', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const h = () => document.querySelector('#gripBrug').getBoundingClientRect().height;
      const met = h(); SET.budgets.vices = 60; save(); renderMaand(); return { met, zonder: h(), n: document.querySelectorAll('[data-brugnoot]').length }; });
    expect(r.n).toBe(0); expect(r.met).toBe(r.zonder);
  });
  test('geen signaal en geen patroon: Vices staat niet in uitschieters, Begrijpen of de patronen op Inzichten', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit();
      return { uit: uitschieters(V).map(x => x.k), grip: JSON.stringify(gripPatronen()), ins: (insPatronen() || []).map(p => p.k) }; });
    expect(r.uit).not.toContain('vices'); expect(r.uit).toContain('uiteten');
    expect(r.grip).not.toContain('vices'); expect(r.ins).not.toContain('vices');
  });
  test('de bridge telt het bedrag wel mee: begin plus de stappen is de uitkomst', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V);
      return { som: B.stappen.slice(1, -1).reduce((a, x) => a + x.waarde, B.stappen[0].waarde), eind: Math.round(V.projectie), budget: V.budget, verwacht: gripMeterBudget(V).verwacht }; });   // v398: vanaf het maandbudget
    expect(r.som).toBe(r.eind); expect(r.verwacht).toBe(r.eind);
  });
  test('zonder potje onder de drempel geen noot', async ({ page }) => {
    await grip(page);
    const n = await page.evaluate(() => { SET.budgets.vices = 60; save(); renderMaand(); return document.querySelectorAll('[data-brugnoot]').length; });
    expect(n).toBe(0);
  });
});

test.describe('B · het variabele deel van een gemengd potje', () => {
  test('Vervoer: variabel deel te ruim, potje 1.100 naar 710; Verzekeringen: variabel deel wel, potje niet (DELA in december)', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const L = teRuimLijst(); const f = k => { const x = L.find(y => y.k === k); return { ruim: x.ruim, deel: x.deel || '', voorstel: x.voorstel, teRuim: x.teRuim, d: x.variabelDeel }; };
      return { v: f('vervoer'), z: f('verzekering') }; });
    expect(r.v).toEqual({ ruim: true, deel: 'variabel', voorstel: 710, teRuim: 390, d: { bud: 497, nodig: 99, voorstel: 100, ruim: true } });
    expect(r.z.ruim).toBe(false); expect(r.z.d.ruim).toBe(true); expect(r.z.voorstel).toBe(330);
  });
  test('het voorstel komt niet onder vast deel plus het variabele voorstel', async ({ page }) => {
    await grip(page);
    const x = await page.evaluate(() => teRuimLijst().find(y => y.k === 'vervoer'));
    expect(x.voorstel).toBeGreaterThanOrEqual(x.vast.bud + x.variabelDeel.voorstel);
    expect(x.voorstel).toBeGreaterThanOrEqual(x.nodig);
  });
  test('de melding per deel: "Vervoer & auto · variabel deel te ruim (€497, 3 mnd €0)"', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const x = teRuim().find(y => y.k === 'vervoer');
      openTeRuim('vervoer'); const deel = document.querySelector('#teRuimSheet[data-teruimpotje="vervoer"] [data-teruimdeel]');
      return { label: teRuimLabel(x), deel: deel ? deel.innerText : null, huur: teRuimLabel(teRuim().find(y => y.k === 'huur')) }; });
    expect(r.label).toBe('Vervoer & auto · variabel deel te ruim (€497, 3 mnd €0)');
    expect(r.deel).toContain('variabel deel te ruim (€497, 3 mnd €0)'); expect(r.deel).toContain('vaste deel (€603) blijft staan');
    expect(r.huur).toBe('Huur te ruim');
  });
  test('maanden die verschillen heten "3 mnd hoogst"', async ({ page }) => {
    await grip(page);
    expect(await page.evaluate(() => [teRuimMaandenTekst([0, 0, 0]), teRuimMaandenTekst([10, 40, 20])])).toEqual(['3 mnd €0', '3 mnd hoogst €40']);
  });
  test('de Budget-meter-sheet draagt het label van het deel (v394: de melding op Zien is weg)', async ({ page }) => {
    await grip(page);
    const t = await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); openGripMeter('budget'); return document.querySelector('[data-meterruim="vervoer"]').innerText; });
    expect(t).toContain('Vervoer & auto · variabel deel te ruim (€497, 3 mnd €0)');
  });
  test('verlagen naar het voorstel zet het hele potje op het voorstel (v398: met een bestemming)', async ({ page }) => {
    await grip(page);
    const b = await page.evaluate(() => { openTeRuim('vervoer'); teRuimKies('a'); window._tr.bestem = 'plan'; teRuimBevestig(); return SET.budgets.vervoer; });
    expect(b).toBe(710);
  });
  test('blok 19: vast en variabel als aparte regels bij een gemengd potje', async ({ page }) => {
    await grip(page);
    const t = (await page.evaluate(() => diagTeRuim())).join('\n');
    expect(t).toMatch(/Vervoer & auto: 1100[^\n]*\n\s+vast deel: budget 603[^\n]*\n\s+variabel deel: budget 497[^\n]*voorstel 100 \| JA/);
    expect(t).toMatch(/Verzekeringen: 335[^\n]*\n(\s+post[^\n]*\n)?\s+vast deel: budget 164[^\n]*\n\s+variabel deel: budget 171[^\n]*JA/);
    expect(t).toContain('variabel deel te ruim, maar het potje als geheel komt niet 50 boven 330');
  });
});
