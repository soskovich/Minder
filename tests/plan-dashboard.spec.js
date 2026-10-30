/* v380 (deel 2): Plan is een dashboard. Bovenaan de kop met het geld tegen de doelen, wat er deze maand opzij gaat en
   wanneer alles vol is; een schakelaar Lijst / Tijdlijn; per doel een rijvorm zonder rekensom; de rekensom in een
   detailsheet; de instellingen achter "verdeling ⚙". Fixture: de stand van het toestel (plan-toestel-stand.js). */
const { test, expect } = require('@playwright/test');
const T = require('./plan-toestel-stand');
const tekst = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);

test.describe('a · de kop', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit')); });

  test('geld, doelen en percentage: EUR 2.850 van EUR 22.000, 13 procent', async ({ page }) => {
    const k = await page.evaluate(() => { const e = document.getElementById('planKpi'); return { geld: +e.dataset.kpigeld, doel: +e.dataset.kpidoel, pct: +e.dataset.kpipct, w: e.querySelector('[data-kpibalk] i').style.width }; });
    expect(Math.round(k.geld)).toBe(2850); expect(k.doel).toBe(22000); expect(k.pct).toBe(13); expect(k.w).toBe('13%');
    const se = await page.evaluate(() => { const S = planStandEind(); return Object.values(S.per).reduce((a, x) => a + x.geld, 0); });
    expect(Math.round(se)).toBe(Math.round(k.geld));
    expect(await tekst(page, '#planKpi')).toContain('€2.850 van €22.000');
  });

  /* v440: de tegel "Deze maand opzij" (inleg + terug) en de terug-chip zijn vervallen; de kop toont nu "Opzij deze periode"
     (opzijPeriode: netto naar je spaarrekening tegen het doel uit Kiezen). Dat getest in v440.spec.js. */

  test('alles vol is de laatste vol-datum van de rijen, uit dezelfde projectie', async ({ page }) => {
    const r = await page.evaluate(() => { const TL = planTijdlijnData(); const v = Object.values(TL.per).map((x) => x.vol).filter((x) => x != null);
      return { kpi: +document.querySelector('[data-kpivol]').dataset.kpivol, max: Math.max(...v), lbl: etaDatum(Math.max(...v)) }; });
    expect(r.kpi).toBe(r.max);
    expect(await tekst(page, '[data-kpivol]')).toContain(r.lbl);
  });

  test('de kop draagt nog te gaan als attribuut, en toont het niet', async ({ page }) => {
    expect(await page.evaluate(() => +document.getElementById('planKpi').dataset.nogtegaan)).toBe(16262);
    expect(await page.evaluate(() => /te gaan/.test(document.getElementById('s-vooruit').innerText))).toBe(false);
  });

  test('geen instelregels in de kop: geen "Te verdelen", geen verdeling-regel, geen gekozen-regel', async ({ page }) => {
    const r = await page.evaluate(() => { const t = document.getElementById('s-vooruit').innerText;
      return { kop: /Te verdelen/.test(t), vd: !!document.querySelector('[data-verdelingregel]'), gek: !!document.getElementById('terugzetGekozen'), best: /Bestemmingen/.test(t) }; });
    expect(r).toEqual({ kop: false, vd: false, gek: false, best: false });
  });
});

test.describe('b · de chip alleen bij terug', () => {
  test('zonder opname en zonder keuze staat er geen chip', async ({ page }) => {
    const O = require('./opschonen-stand');
    await O.boot(page, { zonderOpname: true });
    await page.evaluate(() => go('vooruit'));
    expect(await page.locator('[data-kpiterug]').count()).toBe(0);
    expect(await page.evaluate(() => planStandEind() && Object.values(planStandEind().per).reduce((a, x) => a + x.tb, 0))).toBe(0);
    /* hier haalt Inrichting (streef mrt 2027, na Kosten Koper) zijn datum niet; sinds v502 noemt de tegel eerst dat alles vol een
       maand na de laatste streefdatum ligt (planSchema()), en de waarschuwing per doel blijft in de rij en de tijdlijn */
    expect(await tekst(page, '[data-kpischema]')).toBe('1 maand na je streefdatum (mei 2027)');
    expect(await page.evaluate(() => Object.values(planTijdlijnData().per).some((x) => x.warn))).toBe(true);
  });
  test('op de stand van het toestel staat alles op schema', async ({ page }) => {
    await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit'));
    expect(await tekst(page, '[data-kpischema]')).toBe('in de maand van je streefdatum (jun 2027)');   // v502: in maanden, niet meer "op schema"
    expect(await page.evaluate(() => Object.values(planTijdlijnData().per).some((x) => x.warn))).toBe(false);
  });
});

test.describe('c · de rijen', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit')); });

  test('elke rij heeft dezelfde onderdelen, en geen rekensom', async ({ page }) => {
    const r = await page.evaluate(() => [...document.querySelectorAll('#planLijst .plan-item[data-id]')].map((e) => ({
      id: e.dataset.id, delen: ['[data-rijnr]', '[data-rijnaam]', '[data-planstatus]', '[data-rijbalk]', '[data-rijgeld]', '[data-rijvol]', '[data-rijsub]'].map((s) => e.querySelectorAll(s).length),
      som: /=|\+ €|in geld|terug \+|toegewezen/.test(e.innerText), kind: e.children.length })));
    expect(r.length).toBe(3);
    for (const x of r) { expect(x.delen).toEqual([1, 1, 1, 1, 1, 1, 1]); expect(x.som).toBe(false); }
    expect(new Set(r.map((x) => x.kind)).size).toBe(1);
  });

  test('een rijvorm: er staat geen tweede rij-klasse of geldregel', async ({ page }) => {
    const r = await page.evaluate(() => ({ geldregel: document.querySelectorAll('[data-geldregel]').length, rij: document.querySelectorAll('#planLijst > div').length, item: document.querySelectorAll('#planLijst > .plan-item.plan-rij2').length }));
    expect(r.geldregel).toBe(0); expect(r.rij).toBe(r.item);
  });

  test('noodfonds: bijna vol, EUR 2.850 / EUR 4.000, vol dec 2026, en +EUR 1.050 deze maand met EUR 100 later (v385)', async ({ page }) => {
    expect(await tekst(page, '[data-id="noodfonds"] [data-planstatus]')).toBe('bijna vol');
    expect(await tekst(page, '[data-id="noodfonds"] [data-rijgeld]')).toBe('€2.850 / €4.000');
    expect(await tekst(page, '[data-id="noodfonds"] [data-rijvol]')).toBe('vol dec 2026 ›');
    expect(await tekst(page, '[data-id="noodfonds"] [data-rijsub]')).toBe('+€1.050 deze maand · €100 later');
  });

  test('inrichting: nu actief, +EUR 1.838 deze maand; kosten koper wacht vanaf november met haalbaarheid', async ({ page }) => {
    expect(await tekst(page, '[data-id="iw"] [data-planstatus]')).toBe('nu actief');
    expect(await tekst(page, '[data-id="iw"] [data-rijsub]')).toBe('+€1.838 deze maand');
    expect(await tekst(page, '[data-id="kk"] [data-planstatus]')).toBe('vanaf nov');
    expect(await tekst(page, '[data-id="kk"] [data-rijsub]')).toMatch(/^streef jun 2027 · (haalbaar|niet haalbaar)$/);
  });

  test('de balk: het geld dicht, wat deze maand bijkomt gearceerd', async ({ page }) => {
    const r = await page.evaluate(() => { const e = document.querySelector('[data-id="noodfonds"]'); return { g: +e.querySelector('[data-geldvat]').dataset.pct, b: +e.querySelector('[data-bijvat]').dataset.pct }; });
    expect(r.g).toBeCloseTo(2850.2 / 4000 * 100, 1); expect(r.b).toBeCloseTo(1050 / 4000 * 100, 1);
  });

  test('weg: de inlegbalk, de volgorde-zin, het controletotaal, blijft over EUR 0', async ({ page }) => {
    const r = await page.evaluate(() => ({ seg: document.querySelectorAll('[data-seg]').length, volg: !!document.querySelector('[data-planvolgorde]'), toe: !!document.getElementById('planToeMaand'), vrij: !!document.getElementById('planVrij'), t: document.getElementById('s-vooruit').innerText }));
    expect(r.seg).toBe(0); expect(r.volg).toBe(false); expect(r.toe).toBe(false); expect(r.vrij).toBe(false);
    expect(r.t).not.toMatch(/Volgorde:|Toegewezen deze maand|Blijft over/);
  });

  test('het controletotaal blijft als functie: EUR 2.888 van EUR 2.888', async ({ page }) => {
    expect(await page.evaluate(() => planToeMaand())).toEqual({ toegewezen: 2888, teVerdelen: 2888 });
  });
});

test.describe('d · de detailsheet', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit')); });
  const lees = (page) => page.evaluate(() => { const ops = [...document.querySelectorAll('#planDoelSheet [data-op]')];
    const v = (k) => { const e = ops.find((o) => o.dataset.op === k); return e ? +e.dataset.bedrag : null; };
    const eind = document.querySelector('#planDoelSheet [data-op="eind"]');
    return { geld: v('geld'), terug: v('terug'), inleg: v('inleg'), later: v('later'), eind: +eind.dataset.bedrag, vol: eind.dataset.vol, eindTekst: eind.innerText.replace(/\s+/g, ' ').trim(),
      nog: document.querySelector('#planDoelSheet [data-nognodig]') ? +document.querySelector('#planDoelSheet [data-nognodig]').dataset.nognodig : null,
      eindvol: document.querySelector('#planDoelSheet [data-eindvol]') ? document.querySelector('#planDoelSheet [data-eindvol]').innerText.trim() : null,
      later_t: document.querySelector('#planDoelSheet [data-op="later"]') ? document.querySelector('#planDoelSheet [data-op="later"]').innerText.replace(/\s+/g, ' ').trim() : null,
      kop: document.querySelector('#planDoelSheet .small.muted').innerText.trim(), t: document.getElementById('planDoelSheet').innerText }; });

  test('noodfonds: de som van de regels is de eindregel, geen vol, de rode rest en de B-regels', async ({ page }) => {
    await page.locator('[data-id="noodfonds"]').click();
    const r = await lees(page);
    expect(Math.round(r.geld)).toBe(2850); expect(r.terug).toBe(688); expect(r.inleg).toBe(362);
    expect(Math.round((r.geld + r.terug + r.inleg) * 100) / 100).toBe(r.eind);
    expect(r.eindTekst).toBe('Eind oktober €3.900');
    expect(r.vol).toBe('0'); expect(r.eindTekst).not.toContain('vol');
    expect(Math.round(r.nog)).toBe(100);
    expect(r.later_t).toBe('+ nog terug na oktober €100 (nov €50, dec €50)');
    expect(r.eindvol).toBe('vol dec 2026 (met het laatste terugzetdeel)');
    expect(r.kop).toBe('doel €4.000 · eerste in de volgorde');
    expect(r.t).toContain('Terug naar je noodfonds'); expect(r.t).toContain('opnames in oktober ›');
    expect(r.t).toContain('Doel aanpassen'); expect(r.t).toContain('Pauzeren');
  });

  test('inrichting: geen terugregel, en de som haalt het doel niet: rode rest', async ({ page }) => {
    await page.locator('[data-id="iw"]').click();
    const r = await lees(page);
    expect(r.terug).toBeNull(); expect(r.later).toBeNull();
    expect(r.geld + r.inleg).toBe(r.eind); expect(r.eind).toBe(1838);
    expect(r.vol).toBe('0'); expect(r.nog).toBe(1162);
  });

  test('alles terug in een keer: de som haalt het doel, "vol" en geen rode regel', async ({ page }) => {
    await T.boot(page, 'gister'); await page.evaluate(() => go('vooruit'));
    await page.locator('[data-id="noodfonds"]').click();
    const r = await lees(page);
    expect(r.eind).toBe(4000); expect(r.vol).toBe('1'); expect(r.eindTekst).toContain('· vol'); expect(r.nog).toBeNull();
    expect(await tekst(page, '[data-id="noodfonds"] [data-planstatus]')).toBe('vol in okt');
  });

  test('doel aanpassen opent de bestaande editor', async ({ page }) => {
    await page.locator('[data-id="iw"]').click();
    await page.locator('[data-doelaanpassen]').click();
    expect(await page.evaluate(() => window._goalEdit)).toBe('iw');
  });
});

test.describe('e · lijst en tijdlijn', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit')); });

  test('standaard lijst; tijdlijn wordt onthouden (in SET, dus per gebruiker en in de back-up)', async ({ page }) => {
    expect(await page.locator('#planLijst').count()).toBe(1);
    await page.locator('[data-planweergave="tijdlijn"]').click();
    expect(await page.locator('#planTijdlijnInline').count()).toBe(1);
    expect(await page.locator('#planLijst').count()).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).planWeergave)).toBe('tijdlijn');
    await page.evaluate(() => { go('dash'); go('vooruit'); });
    expect(await page.locator('#planTijdlijnInline').count()).toBe(1);
  });

  test('de tijdlijn-datums zijn de vol-datums uit de lijst', async ({ page }) => {
    await page.locator('[data-planweergave="tijdlijn"]').click();
    const tl = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#planTijdlijnInline [data-tlrij]')].map((e) => [e.dataset.tlrij, e.dataset.tlvol])));
    await page.locator('[data-planweergave="lijst"]').click();
    for (const id of Object.keys(tl)) {
      const lijst = await tekst(page, `[data-id="${id}"] [data-rijvol]`);
      const lbl = await page.evaluate((m) => etaDatum(+m), tl[id]);
      expect(lijst).toBe(`vol ${lbl} ›`);
    }
    expect(Object.keys(tl).length).toBe(3);
  });
});

test.describe('f · verdeling ⚙', () => {
  test('toont de huidige keuzes gemarkeerd', async ({ page }) => {
    await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit'));
    await page.locator('[data-planinstel]').click();
    const r = await page.evaluate(() => ({ terug: [...document.querySelectorAll('[data-instelterug]')].map((e) => e.dataset.instelterug + e.dataset.gekozen),
      verdeel: [...document.querySelectorAll('[data-instelverdeel]')].map((e) => e.dataset.instelverdeel + e.dataset.gekozen), gat: document.querySelectorAll('[data-instelgat]').length }));
    expect(r.terug).toEqual(['alles1', 'drie0', 'niet0']);
    expect(r.verdeel).toEqual(['volgorde1', 'zelf0']);
    expect(r.gat).toBe(2);
  });

  test('een andere keuze loopt via de bestaande flow, en openen schrijft niets', async ({ page }) => {
    await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit'));
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('[data-planinstel]').click();
    await page.locator('[data-instelverdeel="zelf"]').click();
    expect(await page.locator('#verdelingSheet').count()).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
});
