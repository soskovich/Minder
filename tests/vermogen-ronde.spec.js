/* v350: de ronde Home, Vermogen en Vermogensreis. Elke test op de stand van tests/vermogen-stand.js
   (6 oktober 2026), tenzij hij een variant noemt. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./vermogen-stand');
const dm = require('./deze-maand-stand');

const nietsOver = (page) => page.evaluate(() => {
  const w = document.documentElement.clientWidth; const uit = [];
  for (const e of document.querySelectorAll('#s-vermogen *, #s-dash *, #s-fire *, #sheet *')) { const r = e.getBoundingClientRect(); if (r.width && r.right > w + 1) uit.push(e.tagName + '.' + e.className); }
  return uit;
});

test.describe('D · een datum per schuld', () => {
  test('de rij, de sheet, de mijlpaal en de grafiek zeggen nov 2035', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const V = schuldVrij(SET.debts.find((d) => d.id === 'duo'));
      SET.openSchuld = true; go('vermogen'); renderVermogen();
      const rij = document.querySelector('[data-schuldsub="duo"]').textContent;
      openSchuldDetail('duo'); const sheet = document.querySelector('[data-schuldvrij="duo"]').textContent; closeSheet();
      const M = reisModel(); const ms = M.ms.find((m) => m.key === 'debt0');
      go('fire'); renderFire();
      const lijst = document.querySelector('[data-msmaand="debt0"]').textContent;
      return { V, rij, sheet, ms: [ms.yr, ms.maand], lijst, nowY: M.nowY };
    });
    expect(r.V.mo).toBe(109); expect(r.V.label).toBe('nov 2035');
    expect(r.rij).toBe('vrij in nov 2035 · €100 per maand');
    expect(r.sheet).toBe('nov 2035');
    // tot v349: nowY + ceil(109/12) = 2036
    expect(r.ms).toEqual([2035, 'nov 2035']);
    expect(r.lijst).toBe('nov 2035');
  });
  test('een gekoppelde schuld zonder betaling deze maand is een maand eerder af', async ({ page }) => {
    // stand 11.000 op 31 augustus, de betaling van 24 september gekoppeld: 10.900 na september, oktober nog open
    await boot(page, { set: { schuldKoppel: {}, debts: [{ id: 'duo', naam: 'DUO', type: 'studie', start: 15000, rest: 11000, restOp: '2026-08-31', perMaand: 100, rente: 0 }] } });
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.date === '2026-09-24' && x.amount === -100); zetSchuldKoppel(t.id, 'duo');
      const a = schuldVrij(SET.debts[0]);
      const o = TX.find((x) => x.date === '2026-10-03'); // een boeking in oktober koppelen als betaling van deze maand
      zetSchuldKoppel(o.id, 'duo');
      const b = schuldVrij(SET.debts[0]);
      return { a: [a.rest, a.mo, a.k, a.label, a.dezeMaandOpen], b: [b.rest, b.dezeMaandOpen, b.k] };
    });
    // invoer: de stand rekent de gekoppelde betaling
    expect(r.a[0]).toBe(10900);
    // 109 termijnen, de eerste valt in oktober: de laatste in oktober 2035
    expect(r.a).toEqual([10900, 109, 108, 'okt 2035', true]);
    // met een betaling in oktober is die maand al geweest
    expect(r.b[1]).toBe(false);
    expect(r.b[2]).toBe(Math.ceil(r.b[0] / 100));
  });
  test('de mijlpaal leest de maand van schuldVrij(), ook over een jaargrens', async ({ page }) => {
    // 1.600 op 31 augustus, de september-betaling gekoppeld: 1.500 en 15 termijnen, de eerste in oktober,
    // dus de laatste in december 2027 en niet in januari 2028
    await boot(page, { set: { debts: [{ id: 'k', naam: 'Krediet', type: 'lening', rest: 1600, restOp: '2026-08-31', perMaand: 100, rente: 0 }] } });
    const r = await page.evaluate(() => { const t = TX.find((x) => x.date === '2026-09-24' && x.amount === -100); zetSchuldKoppel(t.id, 'k');
      const V = schuldVrij(SET.debts[0]); const m = reisModel().ms.find((x) => x.key === 'debt'); return { V: [V.mo, V.k, V.label], m: [m.yr, m.maand] }; });
    expect(r.V).toEqual([15, 14, 'dec 2027']);
    expect(r.m).toEqual([2027, 'dec 2027']);
  });
  test('zonder koppeling telt hij vanaf volgende maand, ook met een invuldag van voor deze maand', async ({ page }) => {
    await boot(page, { set: { debts: [{ id: 'k', naam: 'Krediet', type: 'lening', rest: 1500, restOp: '2026-08-31', perMaand: 100, rente: 0 }] } });
    const V = await page.evaluate(() => schuldVrij(SET.debts[0]));
    expect([V.mo, V.k, V.label, V.dezeMaandOpen]).toEqual([15, 15, 'jan 2028', false]);
  });
  test('een schuld die niet daalt heeft geen datum en geen mijlpaaljaar', async ({ page }) => {
    await boot(page, { set: { debts: [{ id: 'x', naam: 'Krediet', type: 'lening', rest: 5000, restOp: '2026-10-01', perMaand: 20, rente: 12 }] } });
    const r = await page.evaluate(() => { const V = schuldVrij(SET.debts[0]); SET.openSchuld = true; go('vermogen'); renderVermogen();
      return { V: [V.k, V.label], rij: document.querySelector('[data-schuldsub="x"]').textContent, ms: reisModel().ms.filter((m) => /debt/.test(m.key)).length }; });
    expect(r.V).toEqual([null, '']);
    expect(r.rij).toBe('daalt niet op dit tempo · €20 per maand');
    expect(r.ms).toBe(0);
  });
});

test.describe('G en I · de schuld als lijstregel, de tekst in de sheet', () => {
  test('de rij draagt naam, datum, termijn, rest en een chevron, en verder niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { SET.openSchuld = true; go('vermogen'); renderVermogen();
      const e = document.querySelector('[data-schuldrij="lease"]'); return { t: e.innerText.replace(/\s+/g, ' ').trim(), knop: e.querySelectorAll('button,.debt-upd').length }; });
    expect(r.t).toBe('Auto Lease vrij in apr 2029 · €426 per maand €12.756 ›');
    expect(r.knop).toBe(0);
  });
  test('geen tekst verdwijnt: voortgang, looptijd, detectie en "zelf bijwerken" staan in de sheet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openSchuldDetail('duo'); return document.querySelector('#sheet').innerText.replace(/\s+/g, ' '); });
    expect(r).toContain('€4.100 van €15.000 afgelost.');
    expect(r).toContain('Nog 109 maanden van €100.');
    expect(r).toContain('Op dit tempo ben je hier vanaf in nov 2035 (zonder rente gerekend).');
    expect(r).toMatch(/De maandbetaling (is herkend|lijkt) in je uitgaven/);
    expect(r).toContain('die stand werk je zelf bij');
    expect(r).toContain('Restschuld bijwerken');
    expect(r).toContain('Alle gegevens bewerken');
  });
  test('de chevron opent de sheet, en de knop daar de bestaande sheet Restschuld', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.openSchuld = true; go('vermogen'); renderVermogen(); });
    await page.locator('[data-schuldrij="lease"]').click();
    await expect(page.locator('#sheet [data-schulddetail="lease"]')).toHaveCount(1);
    await page.locator('#sheet [data-schuldbijwerken]').click();
    await expect(page.locator('#duRest')).toHaveCount(1);
  });
  test('de sheet Restschuld zegt het zonder gedachtestreepjes, en de slottermijn in gewone taal', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openDebtUpdate('lease'); const a = document.querySelector('#sheet').innerText;
      openDebtUpdate('duo'); return { a, b: document.querySelector('#sheet').innerText, slot: document.querySelector('#sheet [data-slottermijn]') }; });
    expect(r.a).not.toMatch(/[—–]/);
    expect(r.b).not.toMatch(/[—–]/);
    expect(r.a).toContain('Aan het eind betaal je nog een slottermijn van €3.000. Lager dan dat bedrag zet de knop hieronder je restschuld niet.');
    expect(r.a).not.toContain('daaronder boekt deze knop');
    expect(r.b).toContain('Je restschuld daalt niet vanzelf mee met je betalingen. Die stand houd je zelf bij.');
    expect(r.b).toContain('Bij benadering: de rente is hier niet meegerekend.');
  });
});

test.describe('F · het netto vermogen met een regel context', () => {
  test('grootste schuld en wat er is opgebouwd, uit hetzelfde getal als de grafiek', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { go('vermogen'); renderVermogen();
      const ms = months().slice(-12); let s = 0; for (const m of ms) { const t = totals(m); s += (t.incomeAlles || 0) - (t.spend || 0); }
      return { ctx: document.querySelector('[data-vermctx]').textContent, kop: document.querySelector('[data-opbouwkop]').textContent,
        som: Math.round(s), n: ms.length, sam: !!document.querySelector('#vermSam'), t: document.querySelector('#s-vermogen').innerText }; });
    expect(r.ctx).toBe(`grootste schuld Auto Lease €12.756 · €${r.som.toLocaleString('nl-NL')} opgebouwd in ${r.n} maanden`);
    expect(r.kop).toBe(`+€${r.som.toLocaleString('nl-NL')}`);
    expect(r.sam).toBe(false);
    expect(r.t).not.toContain('Wat je minder uitgeeft');
    expect(r.t).not.toContain('Je netto vermogen is');
  });
  test('zonder schulden zegt de regel dat', async ({ page }) => {
    await boot(page, { set: { debts: [] } });
    const t = await page.evaluate(() => { go('vermogen'); renderVermogen(); return document.querySelector('[data-vermctx]').textContent; });
    expect(t).toMatch(/^geen schulden · /);
  });
});

test.describe('H · Home telt wat Vermogen toont', () => {
  test('de telling is de rijen van de pagina erachter', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { go('dash'); const t = document.querySelector('[data-vermteller]').textContent;
      SET.openBez = true; SET.openSchuld = true; go('vermogen'); renderVermogen();
      const bez = document.querySelectorAll('#s-vermogen .cz-card')[0];
      return { t, rijen: [...bez.querySelectorAll('.cz-pot')].length, schulden: document.querySelectorAll('[data-schuldrij]').length }; });
    // invoer: vijf rijen (rekeningen, drie bezittingen, de leaseauto) en twee uitgeleende bedragen
    expect(r.rijen).toBe(7);
    expect(r.t).toBe('5 bezittingen · 2 uitgeleend · 2 schulden');
    expect(r.schulden).toBe(2);
  });
  test('Recent toont een opgeschoonde naam, de bankomschrijving staat in de details', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { go('dash'); const nm = document.querySelector('#s-dash .txl .nm').textContent;
      const t = TX.find((x) => x.date === '2026-10-03'); openSheet(t.id); return { nm, sheet: document.querySelector('#sheet').innerHTML }; });
    expect(r.nm).toBe('Albert Heijn 1234');
    expect(r.sheet).toContain('BEA, BETAALPAS ALBERT HEIJN 1234 AMSTERDAM NR:7788, 03.10.26/14:02');
  });
});

test.describe('E · het FIRE-getal met de betekenis van de factor', () => {
  test('10x je uitgaven is 10% opname, met een route naar de aanname', async ({ page }) => {
    await boot(page, { set: { reis: { fireMult: 10 } } });
    const r = await page.evaluate(() => { go('fire'); renderFire(); const e = document.querySelector('[data-msroute="fire"]'); return e ? e.textContent : null; });
    expect(r).toMatch(/^10× je uitgaven, dat is 10% opname per jaar · €[\d.]+.* · aanpassen ›$/);
    await page.locator('[data-msroute="fire"] span').click();
    await expect(page.locator('#s-set')).toBeVisible();
    expect(await page.evaluate(() => fireFactorZin(25))).toBe('25× je uitgaven, dat is 4% opname per jaar');
    expect(await page.evaluate(() => fireFactorZin(30))).toBe('30× je uitgaven, dat is 3,3% opname per jaar');
  });
});

test.describe('ondergrens per maand bij Potje bijstellen', () => {
  const dela = [['2026-03-05'], ['2026-06-05'], ['2026-09-05']].map(([d], i) => ({ id: 'dela' + i, date: d, amount: -160, name: 'DELA', desc: 'SEPA INCASSO DELA COOPERATIE UITVAARTVERZEKERING' }));
  test('DELA in december zet de ondergrens van Verzekeringen, en de sheet noemt hem', async ({ page }) => {
    await dm.boot(page, { extraTx: dela });
    const r = await page.evaluate(() => { const P = potjeBijstelVoorstel('vices'); const v = P.kand.find((x) => x.k === 'verzekering');
      openPotjeBijstel('vices', 'verzekering'); return { meer: P.meer, v, gevolg: document.querySelector('[data-bijstelgevolg]').textContent,
        rij: document.querySelector('[data-dekkies="verzekering"] .cat').textContent }; });
    // invoer: DELA is per kwartaal, de volgende in december
    expect(r.meer).toBe(85);
    expect([r.v.gewoon, r.v.vloer, r.v.vloerMaand]).toEqual([150, 310, '2026-12']);
    expect(r.v.ruimte).toBe(675 - 310);
    expect(r.rij).toBe('potje €675, gewoonlijk €150, in december €310 · ruimte €365');
    expect(r.gevolg).toContain('In december vraagt Verzekeringen €310: gewoonlijk €150 plus Dela €160. Dat past in €590.');
  });
  test('een potje dat op het gemiddelde wel, maar in december niet past, staat er niet tussen', async ({ page }) => {
    await dm.boot(page, { extraTx: dela, set: { budgets: Object.assign({}, dm.BUDGETS, { verzekering: 300 }) } });
    const r = await page.evaluate(() => { const P = potjeBijstelVoorstel('vices');
      const ms = P.maanden; let s = 0; for (const m of ms) s += Math.max(catSpendMap(m).verzekering || 0, 0);
      return { meer: P.meer, gemiddeld: Math.round(s / ms.length), kand: P.kand.map((x) => x.k) }; });
    // invoer: tegen het gemiddelde (EUR 203) had verzekering EUR 97 ruimte en droeg hij EUR 85
    expect(r.gemiddeld).toBe(203);
    expect(300 - r.gemiddeld).toBeGreaterThanOrEqual(r.meer);
    // in december vraagt hij EUR 310, dus hij kan niet inleveren
    expect(r.kand).not.toContain('verzekering');
  });
});

test.describe('hoogtes op 360 en 390px', () => {
  for (const w of [360, 390]) {
    test(`Vermogen, de sheet en Home op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page);
      const r = await page.evaluate(() => { SET.openSchuld = true; SET.openBez = true; go('vermogen'); renderVermogen();
        const h = (q) => Math.round(document.querySelector(q).getBoundingClientRect().height);
        const o = { rij: h('[data-schuldrij="duo"]'), ctx: h('[data-vermctx]') };
        openSchuldDetail('duo'); o.sheet = h('#sheet'); closeSheet(); go('dash'); o.teller = h('[data-vermteller]'); return o; });
      console.log(w, JSON.stringify(r));
      expect(r.rij).toBeLessThanOrEqual(56);
      expect(r.ctx).toBeLessThanOrEqual(36);
      expect(r.teller).toBeLessThanOrEqual(20);
      expect(await nietsOver(page)).toEqual([]);
    });
  }
});

/* v350, na de ronde: Plan zet er extra bovenop, dus het aflos-vat noemt een andere datum dan de rij op
   Vermogen. De regel noemt beide en waar het verschil vandaan komt. */
test.describe('het aflos-vat noemt de datum zonder extra', () => {
  test('met extra: beide datums uit schuldVrij, met de reden', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const d = SET.debts.find((x) => x.id === 'duo');
      const met = vatRegels({ type: 'aflossen', debtId: 'duo', alloc: 100, eta: schuldVrij(d, 100).k }, false);
      const zonder = vatRegels({ type: 'aflossen', debtId: 'duo', alloc: 0, eta: schuldVrij(d, 0).k }, false);
      return { met, zonder, l1: schuldVrij(d, 100).label, l0: schuldVrij(d, 0).label };
    });
    expect(r.l0).toBe('nov 2035');
    expect(r.l1).not.toBe(r.l0);
    expect(r.met.regels.join(' ')).toContain(`vrij in ${r.l1} met je extra aflossing uit Plan · zonder: nov 2035`);
    expect(r.met.vol).toBeNull();
    // zonder extra: geen regel, gewoon de datum
    expect(r.zonder.regels).toEqual([]);
    expect(r.zonder.vol.datum).toBeTruthy();
  });
  test('op Plan zelf, op 360 en 390px zonder overloop', async ({ page }) => {
    for (const w of [360, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, { set: { nfToegewezenMigrated: true, extraSavings: 9000, planOrder: ['noodfonds', 'af:duo'], planAlloc: { 'af:duo': { mode: 'fixed', perMaand: 100 } } } });
      const r = await page.evaluate(() => {
        const p = allocatePlan().find((x) => x.type === 'aflossen');
        go('vooruit'); renderVooruit();
        const el = document.querySelector('[data-aflosverschil]');
        return { alloc: p ? p.alloc : null, tekst: el ? el.textContent : null, h: el ? el.getBoundingClientRect().height : 0 };
      });
      expect(r.alloc, 'de fixture moet het aflos-item een toewijzing geven').toBeGreaterThan(0);
      expect(r.tekst).toContain('met je extra aflossing uit Plan · zonder: nov 2035');
      const uit = await page.evaluate(() => {
        const w = document.documentElement.clientWidth; const o = [];
        for (const e of document.querySelectorAll('#s-vooruit *')) { const b = e.getBoundingClientRect(); if (b.width && b.right > w + 1) o.push(e.className); }
        return o;
      });
      expect(uit).toEqual([]);
      console.log('aflos-regel', w, r.h);
    }
  });
});
