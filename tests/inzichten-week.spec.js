// v382: Inzichten op een scherm, met het trap-tempo, de weektegel, patronen als tegels en de verschuivingen.
// De stand is die van inzichten-stand.js (oktober 2026), met een vaste dag per test.
const { test, expect } = require('@playwright/test');
const S = require('./inzichten-stand');

const NIET = ['vakantie', 'abonnement', 'verzekering', 'sport'];
async function kies(page) {
  await page.evaluate((niet) => { SET.potWekelijks = {}; for (const k of wekKandidaten()) SET.potWekelijks[k] = !niet.includes(k); SET.weekStand = null; save(); render(); go('ins'); }, NIET);
}
async function boot(page, dag, o) { await S.boot(page, Object.assign({ dag }, o || {})); await page.evaluate(() => go('ins')); }

test.describe('a · de weekindeling', () => {
  test('oktober 2026: 1-4, 5-11, 12-18, 19-25, 26-31', async ({ page }) => {
    await boot(page, '2026-10-10');
    expect(await page.evaluate(() => weekIndeling('2026-10').map((w) => `${w.van}-${w.tot}`))).toEqual(['1-4', '5-11', '12-18', '19-25', '26-31']);
  });
  test('november 2026: zondag 1 hoort bij 2-8, en maandag 30 bij 23-29', async ({ page }) => {
    await boot(page, '2026-10-10');
    expect(await page.evaluate(() => weekIndeling('2026-11').map((w) => `${w.van}-${w.tot}`))).toEqual(['1-8', '9-15', '16-22', '23-30']);
  });
  test('februari 2027 begint op maandag en heeft vier hele weken', async ({ page }) => {
    await boot(page, '2026-10-10');
    expect(await page.evaluate(() => new Date(2027, 1, 1).getDay())).toBe(1);
    expect(await page.evaluate(() => weekIndeling('2027-02').map((w) => `${w.van}-${w.tot}`))).toEqual(['1-7', '8-14', '15-21', '22-28']);
  });
  test('juni 2026 begint op maandag; 29-30 is korter dan 4 dagen en gaat bij 22-28', async ({ page }) => {
    await boot(page, '2026-10-10');
    expect(await page.evaluate(() => new Date(2026, 5, 1).getDay())).toBe(1);
    expect(await page.evaluate(() => weekIndeling('2026-06').map((w) => `${w.van}-${w.tot}`))).toEqual(['1-7', '8-14', '15-21', '22-30']);
  });
});

test.describe('b · wekelijks per potje, zonder standaard', () => {
  test('zonder keuze staat er geen weektegel maar een regel naar de keuze', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => ({ open: wekOpen().length, kand: wekKandidaten().length, ws: SET.potWekelijks || null }));
    expect(r.kand).toBeGreaterThan(0);
    expect(r.open).toBe(r.kand);
    expect(r.ws).toBeNull();
    await expect(page.locator('#insWeek[data-weekkies]')).toHaveCount(1);
    await expect(page.locator('#insWeek[data-weekbedrag]')).toHaveCount(0);
  });
  test('bevestigen kan pas als elk potje gekozen is; het gevolg staat er live en schrijft niets', async ({ page }) => {
    await boot(page, '2026-10-10');
    await page.locator('#insWeek').click();
    await expect(page.locator('#wekSheet')).toHaveCount(1);
    expect(await page.locator('[data-wekkeuze].on').count()).toBe(0);
    await expect(page.locator('[data-wekbevestig]')).toBeDisabled();
    const voor = await page.evaluate(() => JSON.stringify(SET));
    const g0 = await page.locator('[data-wekgevolg]').innerText();
    await page.locator('[data-wekkeuze="vakantie:nee"]').click();
    const g1 = await page.locator('[data-wekgevolg]').innerText();
    expect(g1).not.toBe(g0);
    expect(await page.evaluate(() => JSON.stringify(SET))).toBe(voor);
    const K = await page.evaluate(() => wekKandidaten());
    for (const k of K) if (k !== 'vakantie') await page.locator(`[data-wekkeuze="${k}:${NIET.includes(k) ? 'nee' : 'ja'}"]`).click();
    await expect(page.locator('[data-wekbevestig]')).toBeEnabled();
    await page.locator('[data-wekbevestig]').click();
    await expect(page.locator('#insWeek[data-weekbedrag]')).toHaveCount(1);
    const w = await page.evaluate(() => SET.potWekelijks);
    expect(w.vakantie).toBe(false); expect(w.boodschappen).toBe(true);
  });
  test('wekBevestig weigert zelf zolang er een potje open staat', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => { window._wekKeuze = { boodschappen: true }; wekBevestig(); return SET.potWekelijks || null; });
    expect(r).toBeNull();
  });
  test('een nieuw potje vraagt de keuze, zonder voorkeuze', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => { openPotForm(); potFormZetVeld('cat', 'zorg'); potFormZetVeld('bedrag', '50'); potFormZetVeld('vanaf', thisYM());
      const P = potFormVoorstel(); return { nodig: P.wekNodig, wek: P.wek, chips: document.querySelectorAll('[data-potwek].on').length, n: document.querySelectorAll('[data-potwek]').length, reden: (potFormZetVeld('bron', 'verhoog'), potFormReden(potFormVoorstel(), window._potForm)), klaar: potFormVoorstel().klaar,
        na: (potFormZetVeld('wek', 'ja'), potFormVoorstel().klaar) }; });
    expect(r.nodig).toBe(true); expect(r.wek).toBeNull(); expect(r.n).toBe(2); expect(r.chips).toBe(0);
    expect(r.klaar).toBe(false); expect(r.reden).toBe('Kies of dit potje meetelt in je weekbedrag');
    expect(r.na).toBe(true);
  });
  test('in de sheet van een potje is de keuze aan te passen', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    await page.evaluate(() => openPotje('boodschappen'));
    await page.locator('[data-potwekelijks="nee"]').click();
    expect(await page.evaluate(() => SET.potWekelijks.boodschappen)).toBe(false);
  });
});

test.describe('c · het weekbedrag', () => {
  test('wekelijkse potjes min wat er voor deze week uitging, gedeeld door de dagen die over zijn, maal de dagen van de week', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const r = await page.evaluate(() => { const R = weekRekensom(), pb = weekPotBudget(R.m); let tot = 0; for (const k in pb) if (SET.potWekelijks[k]) tot += pb[k];
      let voor = 0; for (const t of txOfMonth(R.m)) { const d = +t.date.slice(8, 10); if (d < R.cur.van && weekTelt(t)) voor += uitgaveNorm(t); }
      return { cur: R.cur, tot: Math.round(tot), voor, verwacht: Math.round((tot - voor) / (R.dim - R.cur.van + 1) * R.cur.dagen), tegel: +document.querySelector('#insWeek').dataset.weekbedrag }; });
    expect(r.cur.van).toBe(5); expect(r.cur.tot).toBe(11);
    expect(r.voor).toBeGreaterThan(0);
    expect(r.cur.bedrag).toBe(r.verwacht);
    expect(r.tegel).toBe(r.verwacht);
  });
  test('niet-wekelijkse potjes en vaste lasten tellen niet, zonder potje wel', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const r = await page.evaluate(() => {
      const t0 = (cat, amount) => ({ amount, date: '2026-10-08', desc: 'BEA, BETAALPAS TEST', name: 'Test', _cat: cat });
      const tel = (cat) => { const t = TX.find((x) => catOf(x) === cat && x.date.startsWith('2026-10')) || TX.find((x) => catOf(x) === cat); return t ? weekTelt(t) : null; };
      return { bood: tel('boodschappen'), vak: SET.potWekelijks.vakantie, lease: (() => { const t = TX.find((x) => x.name === 'Hiltermann Lease'); return t ? weekTelt(t) : null; })() };
    });
    expect(r.bood).toBe(true); expect(r.vak).toBe(false); expect(r.lease).toBe(false);
    const z = await page.evaluate(() => { const t = { id: 'zp1', date: '2026-10-08', amount: -40, acc: TX[0].acc, name: 'Kapper Jan', desc: 'BEA, BETAALPAS KAPPER JAN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); OVR[t.id] = 'zorg'; save(); const s = insTxSoort(t); return { s, telt: weekTelt(t) }; });
    expect(z.s).toBe('zonder'); expect(z.telt).toBe(true);
  });
  test('een uitgave in een potje dat niet wekelijks is verandert het weekbedrag niet; in een wekelijks potje wel', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const r = await page.evaluate(() => { const a = weekRekensom().cur.bedrag;
      const mk = (id, cat) => { const t = { id, date: '2026-10-02', amount: -100, acc: TX[0].acc, name: 'Test ' + id, desc: 'BEA, BETAALPAS TEST ' + id, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
        TX.push(t); categorize(t); OVR[t.id] = cat; save(); return t; };
      const v = mk('vak1', 'vakantie'); const b1 = weekRekensom().cur.bedrag, telt = weekTelt(v);
      mk('bood1', 'boodschappen'); const b2 = weekRekensom().cur.bedrag;
      return { a, b1, b2, telt, vak: SET.potWekelijks.vakantie }; });
    expect(r.vak).toBe(false); expect(r.telt).toBe(false);
    expect(r.b1).toBe(r.a);
    expect(r.b2).toBeLessThan(r.a);
  });
  test('het bedrag staat vast binnen de week: een late boeking van vorige week verschuift het niet', async ({ page }) => {
    await boot(page, '2026-10-07'); await kies(page);
    const a = await page.evaluate(() => +document.querySelector('#insWeek').dataset.weekbedrag);
    await page.evaluate(() => { const t = { id: 'laat1', date: '2026-10-03', amount: -120, acc: TX[0].acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); save(); render(); go('ins'); });
    const b = await page.evaluate(() => ({ tegel: +document.querySelector('#insWeek').dataset.weekbedrag, rekensom: weekRekensom().cur.bedrag }));
    expect(b.tegel).toBe(a);
    expect(b.rekensom).toBeLessThan(a);   // de volgende rekensom ziet hem wel: dat schuift door naar de week erna
    const c = await page.evaluate(() => { const t = { id: 'deze1', date: '2026-10-07', amount: -30, acc: TX[0].acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); save(); render(); go('ins'); const e = document.querySelector('#insWeek').dataset; return { bedrag: +e.weekbedrag, uit: +e.weekuit }; });
    expect(c.bedrag).toBe(a);
  });
  test('overhouden of tekortkomen schuift door naar de volgende weken', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const r = await page.evaluate(() => { const a = weekRekensom().weken[2].bedrag;
      const t = { id: 'over1', date: '2026-10-06', amount: -200, acc: TX[0].acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); save(); const R = weekRekensom(); return { a, b: R.weken[2].bedrag, dagen: R.dim - R.weken[2].van + 1, d: R.weken[2].dagen }; });
    expect(r.a - r.b).toBe(Math.round(200 / r.dagen * r.d));
  });
  /* v383 (gevraagd door de gebruiker): de ring is het deel dat op is; boven het weekbedrag is hij vol in oker met het
     echte percentage, en het grote getal is "-EUR X" in oker met "boven je weekbedrag van EUR Y". Nooit de vorm van "nog". */
  const amber = (page) => page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--amber)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  test('binnen het weekbedrag: groot het bedrag dat over is, de ring het deel dat op is', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const w = page.locator('#insWeek');
    const r = await w.evaluate((e) => ({ b: +e.dataset.weekbedrag, nog: +e.dataset.weeknog, uit: +e.dataset.weekuit, ring: +e.querySelector('[data-weekring]').dataset.weekring, groot: e.querySelector('.ins-wk-v').textContent, regel: e.querySelector('.ins-wk-s').textContent, pct: e.querySelector('.ins-ring span').textContent }));
    expect(r.nog).toBeGreaterThan(0); expect(r.uit).toBeGreaterThan(0);
    expect(r.ring).toBe(Math.round(r.uit / r.b * 100));
    expect(r.pct).toBe(r.ring + '%');
    expect(r.groot).not.toMatch(/nog/); expect(r.groot).toMatch(/^€/);
    expect(r.regel).toMatch(/^nog te besteden · van €/);
    expect(await w.getAttribute('data-weekover')).toBeNull();
  });
  test('boven het weekbedrag: ring vol in oker met het echte percentage, groot -EUR X in oker', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    await page.evaluate(() => { const t = { id: 'veel1', date: '2026-10-09', amount: -900, acc: TX[0].acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); save(); render(); go('ins'); });
    const w = page.locator('#insWeek');
    expect(await w.getAttribute('data-weekover')).not.toBeNull();
    const r = await w.evaluate((e) => ({ b: +e.dataset.weekbedrag, nog: +e.dataset.weeknog, uit: +e.dataset.weekuit, ring: e.querySelector('[data-weekring]').dataset.weekring, op: +e.querySelector('[data-weekring]').dataset.weekop, bg: e.querySelector('[data-weekring]').style.background, groot: e.querySelector('.ins-wk-v').textContent, gk: getComputedStyle(e.querySelector('.ins-wk-v')).color, regel: e.querySelector('.ins-wk-s').textContent, pct: e.querySelector('.ins-ring span').textContent }));
    expect(r.nog).toBeLessThan(0);
    expect(r.ring).toBe('100');
    expect(r.op).toBe(Math.round(r.uit / r.b * 100)); expect(r.op).toBeGreaterThan(100);
    expect(r.pct).toBe(r.op + '%');
    expect(r.bg).toContain('--amber');
    expect(r.groot).toBe('-€' + (-r.nog).toLocaleString('nl-NL'));
    expect(r.gk).toBe(await amber(page));
    expect(r.regel).toBe('boven je weekbedrag van €' + r.b.toLocaleString('nl-NL'));
    expect(await w.innerText()).not.toMatch(/nog te besteden|\bnog €/);
  });
  test('de tik opent de rekensom', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    await page.locator('#insWeek').click();
    const t = await page.locator('#weekSheet').innerText();
    expect(t).toContain('Wekelijkse potjes oktober');
    expect(+(await page.locator('#weekSheet').getAttribute('data-weekbedrag'))).toBe(+(await page.locator('#insWeek').getAttribute('data-weekbedrag')));
    expect(t).toMatch(/Week 1 · do 1 – zo 4 okt · 4 dagen/);
  });
});

test.describe('d · het trap-tempo', () => {
  test('een huur op de 1e maakt dag 1 niet boven tempo', async ({ page }) => {
    await S.boot(page, { dag: '2026-10-01', tot: '2026-10-02', extraTx: [{ id: 'huur1', date: '2026-10-01', amount: -1200, name: 'Woonstichting', desc: 'SEPA INCASSO WOONSTICHTING HUUR' }],
      set: { budgets: Object.assign({}, S.BUDGETS, { huur: 1200 }), potAard: { huur: 'vast' } } });
    /* alleen de huur: de nieuwe Allianz-boeking van de 1e uit de stand halen, langs de route van de app */
    await page.evaluate(() => { for (let i = TX.length - 1; i >= 0; i--) if (TX[i].date >= '2026-10-01' && TX[i].name !== 'Woonstichting') TX.splice(i, 1); save(); render(); go('ins'); });
    const r = await page.evaluate(() => { const M = insMaandStand(); return { uit: M.uit, tempo: M.tempo, vast: M.vast, vt: M.vastTempo }; });
    expect(r.vast).toBeGreaterThanOrEqual(1200);
    expect(r.vt).toBeGreaterThanOrEqual(1200);
    expect(r.uit).toBeLessThanOrEqual(r.tempo);
    expect(await page.locator('[data-instempotxt]').innerText()).not.toMatch(/boven tempo/);
  });
  test('op de laatste dag is het tempo het maandbudget', async ({ page }) => {
    await boot(page, '2026-10-31');
    const r = await page.evaluate(() => { const M = insMaandStand(); return { tempo: M.tempo, B: M.B, vastSom: M.vastSom }; });
    expect(r.vastSom).toBeLessThanOrEqual(r.B);
    expect(r.tempo).toBe(r.B);
  });
  test('de streep op de balk staat op het tempo, en het verschil in de kop klopt', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => { const M = insMaandStand(); const k = document.querySelector('#insMaand').dataset; return { M, tempo: +document.querySelector('[data-instempo]').dataset.instempo, dt: +k.instempoverschil }; });
    expect(r.tempo).toBe(r.M.tempo);
    expect(r.dt).toBe(r.M.uit - r.M.tempo);
    expect(r.M.potTempo).toBe(Math.round(r.M.potDeel * 10 / 31));
  });
  test('een potje loopt lineair, met het patroon als grijze stip', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    await page.locator('[data-insleg="nogpot"]').click();
    await page.locator('[data-inspotrij="uiteten"]').click();
    const d = await page.locator('#insPotjeSheet').evaluate((e) => Object.assign({}, e.dataset));
    expect(+d.tempo).toBe(Math.round(+d.bud * 10 / 31));
    expect(d.normaal).toBeDefined();
    await expect(page.locator('#insPotjeSheet [data-potnormaal]')).toHaveCount(1);
    expect(await page.locator('#insPotjeSheet').innerText()).toMatch(/normaal op dag 10: €\d+ \(gemiddelde 3 mnd\)/);
    await expect(page.locator('#insPotjeSheet [data-potverwacht]')).toHaveCount(1);
  });
});

test.describe('e · de maandkaart', () => {
  test('de drie delen van uitgegeven tellen op tot de kop, en de balk draagt vijf soorten', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => { const M = insMaandStand(); return { M, spend: Math.round(totals(thisYM()).spendNorm), segs: [...document.querySelectorAll('#insMbBalk [data-insseg]')].map((e) => e.dataset.insseg) }; });
    expect(r.M.vast + r.M.potjes + r.M.zonder).toBe(r.M.uit);
    expect(Math.abs(r.M.uit - r.spend)).toBeLessThanOrEqual(1);
    expect(r.segs).toEqual(['vast', 'potjes', 'zonder', 'nogvast', 'nogpot']);
  });
  test('in potjes opent de potjeslijst, zonder potje de boekingen', async ({ page }) => {
    await S.boot(page, { dag: '2026-10-10', extraTx: [{ id: 'kap1', date: '2026-10-08', amount: -45, name: 'Kapper Jan', desc: 'BEA, BETAALPAS KAPPER JAN' }] });
    await page.evaluate(() => { const t = TX.find((x) => x.name === 'Kapper Jan'); OVR[t.id] = 'zorg'; save(); render(); go('ins'); });
    const z = +(await page.locator('[data-insleg="zonder"]').getAttribute('data-v'));
    expect(z).toBe(45);
    await page.locator('[data-insleg="zonder"]').click();
    expect(+(await page.locator('#insZonderSheet').getAttribute('data-inswaarde'))).toBe(45);
    expect(await page.locator('#insZonderSheet').innerText()).toContain('Kapper Jan');
    await page.evaluate(() => closeSheet());
    await page.locator('[data-insleg="nogpot"]').click();
    await expect(page.locator('#insTegelSheet[data-instegelsheet="potjes"]')).toHaveCount(1);
  });
  /* v383: de regel "boven budget" is weg; zonder potje zegt "EUR X · buiten budget". Eén getal, niet twee. */
  test('geen regel boven budget; zonder potje zegt buiten budget, ook als een potje erboven gaat', async ({ page }) => {
    await S.boot(page, { dag: '2026-10-10', extraTx: [{ id: 'kap1', date: '2026-10-08', amount: -45, name: 'Kapper Jan', desc: 'BEA, BETAALPAS KAPPER JAN' }] });
    await page.evaluate(() => { const t = TX.find((x) => x.name === 'Kapper Jan'); OVR[t.id] = 'zorg'; save(); render(); go('ins'); });
    const rij = page.locator('[data-insleg="zonder"]');
    expect(await rij.innerText()).toMatch(/€45 · buiten budget ›/);
    await page.evaluate(() => { const t = { id: 'vic2', date: '2026-10-09', amount: -300, acc: TX[0].acc, name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; TX.push(t); categorize(t); save(); render(); go('ins'); });
    const s = await page.evaluate(() => { const M = insMaandStand(); return { boven: M.boven, zonder: M.zonder, n: document.querySelectorAll('[data-insboven]').length, txt: document.getElementById('insMaand').innerText }; });
    expect(s.boven).toBeGreaterThan(s.zonder);   // het geval waarin de oude regel er stond
    expect(s.n).toBe(0);
    expect(s.txt).not.toMatch(/boven budget/);
    expect(s.txt).toMatch(/buiten budget/);
  });
  /* v383: de cel zelf mag niet overlopen; een meting op de kaart zag niet dat "buiten budget" over de buurkolom liep. */
  for (const w of [360, 390]) test(`zonder potje met buiten budget blijft in zijn eigen kolom op ${w}px, ook bij een groot bedrag`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await S.boot(page, { dag: '2026-10-10', extraTx: [{ id: 'kap1', date: '2026-10-08', amount: -1188, name: 'Kapper Jan', desc: 'BEA, BETAALPAS KAPPER JAN' }] });
    await page.evaluate(() => { const t = TX.find((x) => x.name === 'Kapper Jan'); OVR[t.id] = 'zorg'; save(); render(); go('ins'); });
    const r = await page.evaluate(() => [...document.querySelectorAll('.ins-leg2 [data-insleg]')].map((rij) => { const R = rij.getBoundingClientRect(); let uit = 0;
      for (const e of rij.querySelectorAll('*')) { const q = e.getBoundingClientRect(); if (q.width) uit = Math.max(uit, q.right - R.right, R.left - q.left); }
      return { k: rij.dataset.insleg, uit, txt: rij.innerText }; }));
    const z = r.find((x) => x.k === 'zonder'); expect(z.txt).toMatch(/€1\.188 · buiten budget ›/);
    for (const x of r) expect(x.uit).toBeLessThanOrEqual(0.5);
  });
  test('elk getal staat een keer op Inzichten', async ({ page }) => {
    await S.boot(page, { dag: '2026-10-10', extraTx: [{ id: 'kap1', date: '2026-10-08', amount: -45, name: 'Kapper Jan', desc: 'BEA, BETAALPAS KAPPER JAN' }] });
    await page.evaluate(() => { const t = TX.find((x) => x.name === 'Kapper Jan'); OVR[t.id] = 'zorg'; save(); });
    await kies(page);
    const g = await page.evaluate(() => [...document.querySelectorAll('#s-ins [data-insgetal]')].map((e) => (e.textContent.match(/€\s?[\d.]+/) || [null])[0]).filter(Boolean));
    expect(g.length).toBeGreaterThan(8);
    const dubbel = g.filter((x, i) => g.indexOf(x) !== i);
    expect(dubbel).toEqual([]);
  });
  test('met maar een deel uitgegeven zegt de rij alles, niet het bedrag van de kop nog eens', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const r = await page.evaluate(() => { const M = insMaandStand(); return { M, rij: document.querySelector('[data-insleg="potjes"]').innerText }; });
    expect(r.M.vast).toBe(0); expect(r.M.zonder).toBe(0);
    expect(r.rij).toMatch(/alles/); expect(r.rij).not.toContain('€');
  });
});

test.describe('f · weg van Inzichten', () => {
  test('geen kop-inzicht, geen Over de maanden, geen Tegen je potje, geen drie tegels en geen somregel', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    for (const sel of ['#insKop', '#insSpendCard', '#insKeuze', '#insTegels', '[data-somregel]', '[data-patronenteller]', '#insMaandBudget'])
      await expect(page.locator('#s-ins ' + sel)).toHaveCount(0);
    const t = await page.locator('#s-ins').innerText();
    expect(t).not.toMatch(/Over de maanden|Tegen je potje|verwacht einde maand|Alle \d+ potjes|Nog te betalen · vast/);
  });
});

test.describe('g · patronen als tegels', () => {
  test('herhaalt telt de maanden op rij boven het potje', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    await page.evaluate(() => { const t = { id: 'aug1', date: '2026-08-15', amount: -400, acc: TX[0].acc, name: 'Restaurant Aug', desc: 'BEA, BETAALPAS RESTAURANT AUG', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); OVR[t.id] = 'uiteten'; save(); render(); go('ins'); });
    const k = await page.evaluate(() => { const e = document.querySelector('#insPatronen .ins-pt[data-patroon="herhaalt"] .ins-pt-k'); return e ? e.textContent : null; });
    expect(k).toBe('3e maand');
  });
  test('hooguit vier, met chip, kerngetal en een regel; een tik opent de uitleg met bijsturen op Grip', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    const t = await page.evaluate(() => [...document.querySelectorAll('#insPatronen .ins-pt')].map((e) => ({ s: e.dataset.patroon, k: e.querySelector('.ins-pt-k').textContent, d: e.querySelector('.ins-pt-d').textContent })));
    expect(t.length).toBeLessThanOrEqual(4); expect(t.length).toBeGreaterThan(0);
    const h = t.find((x) => x.s === 'herhaalt'); expect(h.k).toBe('2e maand'); expect(h.d).toMatch(/Uit eten & café · sep \+€194/);
    const n = t.find((x) => x.s === 'nieuw'); expect(n.d).toMatch(/^[^·]+ · eerste keer$/);   // v383: partij · eerste keer, zonder categorie
    const r = t.find((x) => x.s === 'herstelt'); expect(r.k).toMatch(/^−€/); expect(r.d).toMatch(/gewoonlijk €\d+/);
    for (const x of t) expect(x.d).not.toMatch(/verwacht/);
    await page.locator('#insPatronen .ins-pt[data-patroon="herhaalt"]').click();
    await expect(page.locator('#insPatroonSheet [data-insgrip]')).toHaveCount(1);
  });
  /* v383: een patroontegel draagt hooguit twee regels tekst onder het kerngetal; de categorie van een nieuwe partij staat
     in de sheet en niet op de tegel. */
  for (const w of [360, 390]) test(`op ${w}px heeft elke patroontegel hooguit twee regels, en de sheet noemt de categorie`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await boot(page, '2026-10-10'); await kies(page);
    const r = await page.evaluate(() => [...document.querySelectorAll('#insPatronen .ins-pt-d')].map((e) => { const lh = parseFloat(getComputedStyle(e).lineHeight); return Math.round(e.getBoundingClientRect().height / lh); }));
    expect(r.length).toBeGreaterThan(0);
    for (const n of r) expect(n).toBeLessThanOrEqual(2);
    await page.locator('#insPatronen .ins-pt[data-patroon="nieuw"]').click();
    expect(await page.locator('#insPatroonSheet').innerText()).toMatch(/Vervoer/);
  });
});

test.describe('h · verschuivingen', () => {
  test('dicht een regel, open een bridge die optelt van totaal naar totaal', async ({ page }) => {
    await boot(page, '2026-10-10'); await kies(page);
    await expect(page.locator('#insVersch[data-versch="dicht"]')).toHaveCount(1);
    expect(await page.locator('#insVersch').innerText()).toMatch(/aug → sep/);
    await page.locator('[data-verschkop]').click();
    await expect(page.locator('#insVersch[data-versch="open"]')).toHaveCount(1);
    expect(await page.locator('[data-verschpaar]').count()).toBe(3);
    for (const p of ['2026-07:2026-08', '2026-08:2026-09', '2026-09:2026-10']) {
      await page.locator(`[data-verschpaar="${p}"]`).click();
      const r = await page.evaluate(() => ({ b: +document.querySelector('[data-verschbegin]').dataset.verschbegin, e: +document.querySelector('[data-verscheind]').dataset.verscheind,
        s: [...document.querySelectorAll('[data-verschstap]')].map((x) => +x.dataset.verschstap) }));
      expect(r.b + r.s.reduce((a, x) => a + x, 0)).toBe(r.e);
      expect(r.s.length).toBeLessThanOrEqual(5);
    }
  });
  test('de lopende maand vergelijkt tot en met vandaag met dezelfde dagen van de maand ervoor', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => { const V = verschuiving('2026-09', '2026-10');
      let a = 0; for (const t of txOfMonth('2026-09')) if (insInNorm(t) && +t.date.slice(8, 10) <= 10) a += uitgaveNorm(t);
      return { V, a: Math.round(a), heel: Math.round(totals('2026-09').spendNorm) }; });
    expect(r.V.lopend).toBe(true); expect(r.V.dag).toBe(10);
    expect(r.V.begin).toBe(r.a);
    expect(r.V.begin).toBeLessThan(r.heel);
  });
  test('met centen telt de bridge nog steeds exact op, want de stappen worden samen afgerond', async ({ page }) => {
    await boot(page, '2026-10-10');
    const r = await page.evaluate(() => {
      const cats = ['boodschappen', 'uiteten', 'vervoer', 'shopping', 'abonnement'];
      cats.forEach((c, i) => { const t = { id: 'ct' + i, date: '2026-09-12', amount: -0.6, acc: TX[0].acc, name: 'Cent ' + i, desc: 'BEA, BETAALPAS CENT ' + i, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
        TX.push(t); categorize(t); OVR[t.id] = c; });
      save(); const V = verschuiving('2026-08', '2026-09');
      return { begin: V.begin, eind: V.eind, som: V.stappen.reduce((a, x) => a + x.waarde, 0), n: V.stappen.length }; });
    expect(r.n).toBeGreaterThan(2);
    expect(r.begin + r.som).toBe(r.eind);
  });
  test('rood is meer, groen is minder', async ({ page }) => {
    await boot(page, '2026-10-10');
    await page.evaluate(() => { window._verschOpen = true; renderIns(); });
    const r = await page.evaluate(() => [...document.querySelectorAll('[data-verschstap]')].map((x) => ({ v: +x.dataset.verschstap, c: x.querySelector('.t i').style.background })));
    for (const x of r) { if (x.v > 0) expect(x.c).toContain('--red'); if (x.v < 0) expect(x.c).toContain('--green'); }
  });
});

test.describe('i · een scherm', () => {
  /* v383: de menubalk onderaan telt mee. Een scherm past als de onderkant van de laatste inhoud op Inzichten boven de
     bovenkant van de menubalk ligt (zichtbare hoogte = viewport min menubalk), niet als scrollHeight binnen de viewport
     valt: de menubalk ligt eroverheen. */
  const meet = (page) => page.evaluate(() => {
    const nav = document.querySelector('.nav').getBoundingClientRect();
    const scr = document.getElementById('s-ins');
    let onder = 0; for (const el of scr.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.width > 0) onder = Math.max(onder, r.bottom + scrollY); }
    return { onder, navTop: nav.top + scrollY, navH: nav.height, h: innerHeight };
  });
  test('Inzichten past op 390x844 boven de menubalk', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '2026-10-10'); await kies(page);
    const r = await meet(page);
    expect(r.navH).toBeGreaterThan(40);
    expect(r.navTop).toBeLessThan(r.h);
    expect(r.onder).toBeLessThanOrEqual(r.h - r.navH);
  });
  test('ook zonder keuze over wekelijks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '2026-10-10');
    const r = await meet(page);
    expect(r.onder).toBeLessThanOrEqual(r.h - r.navH);
  });
});

