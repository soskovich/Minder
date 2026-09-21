// v246, ronde B: het beeld van Plan is een vertakte waterval.
//
// Bovenaan de inlegbalk, verdeeld in segmenten per bestemming. Per bestemming een tak, waarvan de
// dikte zegt wat er heen gaat. Per bestemming een vat, waarvan de HOOGTE het doelbedrag is, en in
// elk vat met een streefdatum twee data: wanneer het vol is en wanneer het vol moet zijn.
//
// GEEN TIJDAS. Met meerdere ontvangers is hoogte niet meer gelijk aan duur, dus een maandschaal
// langs de kolom zou liegen. Die afwezigheid staat hier als eis, niet als omissie.
//
// DE SCHAAL HEEFT EEN BODEM, EN DIE BODEM LIEGT. Een vat op de minimumhoogte staat niet op schaal:
// gemeten stond een doel van €3.000 op 78px naast een noodfonds van €5.301 op 100px, een
// verhouding van 1,3 terwijl het bedrag 1,8 keer zo groot is. Daarom draagt een geklemd vat een
// gestippelde bovenrand en een regel voor een schermlezer die hetzelfde zegt.
//
// KLEUR DRAAGT DE VERBINDING. Met de vaten onder elkaar staat het derde vat ver onder de balk, en
// dan draagt de afstand de tak niet meer. Segment en tak delen daarom hun tint.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
// een streefdatum n maanden vooruit, zodat de tests niet op een vaste kalender leunen
const overMnd = (n) => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: o.spaar != null ? o.spaar : 1100 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    // de gemeten toestand van het toestel: 1.100 van 5.301, dus 4.201 te gaan bij een inleg van 3.000
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 5301,
    nfToegewezen: o.nfToe != null ? o.nfToe : 1100,
    nfToegewezenMigrated: true,
    goals: o.goals || [], planOrder: o.planOrder,
    planAlloc: o.planAlloc || { noodfonds: { allocMode: 'auto' } },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
const VOL = { nfDoel: 5301, nfToe: 5301, spaar: 5301 };
async function boot(page, o, breed) {
  await page.setViewportSize({ width: breed || 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planVatHoogten === 'function');
  await page.evaluate(() => go('vooruit'));
}
const vaten = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .vat')].map((v) => ({
  id: v.closest('.plan-item').dataset.id,
  h: Math.round(v.getBoundingClientRect().height),
  nodig: Math.ceil(v.querySelector('.vat-in').getBoundingClientRect().height),
  geklemd: v.dataset.geklemd === '1', laat: v.dataset.laat === '1',
  dat: (v.querySelector('.vat-dat') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim(),
})));
const takken = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .plan-tak')]
  .map((t) => ({ id: t.dataset.tak, label: t.querySelector('span').innerText.replace(/\s+/g, ' ') })));
const KK = (o) => Object.assign({ id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, allocMode: 'auto' }, o);
const IW = (o) => Object.assign({ id: 'g2', naam: 'Inrichting woning', doel: 3000, gespaard: 0, allocMode: 'auto' }, o);

test.describe('a · de grendel in beeld', () => {
  const dicht = { goals: [KK({ streefdatum: overMnd(21) }), IW({ streefdatum: overMnd(28) })],
    planOrder: ['noodfonds', 'g1', 'g2'] };

  test('dichte grendel op de gemeten toestand: één tak, en die gaat naar de buffer', async ({ page }) => {
    await boot(page, dicht);
    expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 4201 });
    const T = await takken(page);
    expect(T.map((x) => x.id)).toEqual(['noodfonds']);      // de andere twee krijgen niets, dus geen tak
    expect(T[0].label).toContain('€3.000/mnd');             // de hele inleg
  });

  test('het noodfonds noemt de maand waarin hij vol is, en de twee doelen wachten', async ({ page }) => {
    await boot(page, dicht);
    const V = await vaten(page);
    const nf = V.find((x) => x.id === 'noodfonds');
    const dat = await page.evaluate(() => planGrendelDatum());
    expect(nf.dat).toBe(`vol in ${dat}`);
    for (const id of ['g1', 'g2']) {
      const v = V.find((x) => x.id === id);
      expect(v.dat, id).toMatch(/^moet in \w+ \d{4}/);
      expect(v.dat, id).toContain(`verdelen gaat open rond ${dat}`);
      expect(v.laat, id).toBe(false);          // wachten is geen achterstand
    }
  });

  test('de wachtende vaten staan doffer en de dofheid hangt aan de status', async ({ page }) => {
    await boot(page, dicht);
    const r = await page.evaluate(() => [...document.querySelectorAll('#s-vooruit .vat')].map((v) => ({
      id: v.closest('.plan-item').dataset.id, dof: v.classList.contains('vat-dof') })));
    expect(r.find((x) => x.id === 'noodfonds').dof).toBe(false);
    expect(r.filter((x) => x.id !== 'noodfonds').every((x) => x.dof)).toBe(true);
  });

  test('zodra de buffer vol is krimpt het noodfonds tot één regel, want het draagt geen tak meer',
    async ({ page }) => {
      await boot(page, Object.assign({}, dicht, VOL));
      expect(await page.evaluate(() => planGrendel())).toBe(null);
      const r = await page.evaluate(() => {
        const it = document.querySelector('#s-vooruit .plan-item[data-id="noodfonds"]');
        return { vol: it.classList.contains('vat-vol'), vat: !!it.querySelector('.vat'),
          h: Math.round(it.getBoundingClientRect().height) };
      });
      expect(r.vol).toBe(true);
      expect(r.vat).toBe(false);
      expect(r.h).toBeLessThan(80);
      expect((await takken(page)).some((t) => t.id === 'noodfonds')).toBe(false);
    });
});

test.describe('b · het datumpaar', () => {
  test('grendel open, alles naar één doel: beide streefdata staan er en allebei gehaald',
    async ({ page }) => {
      await boot(page, Object.assign({
        goals: [KK({ streefdatum: overMnd(40) }), IW({ streefdatum: overMnd(60), allocMode: 'fixed', perMaand: 0 })],
        planOrder: ['noodfonds', 'g1', 'g2'] }, VOL));
      const v = (await vaten(page)).find((x) => x.id === 'g1');
      expect(v.dat).toMatch(/^vol in \w+ \d{4} · moet in \w+ \d{4}$/);
      expect(v.laat).toBe(false);
    });

  test('twee doelen die het geen van beide halen: achterstand en het bedrag dat het wel haalt',
    async ({ page }) => {
      await boot(page, Object.assign({
        goals: [KK({ streefdatum: overMnd(4), allocMode: 'fixed', perMaand: 1500 }),
                IW({ streefdatum: overMnd(1), allocMode: 'fixed', perMaand: 1500 })],
        planOrder: ['noodfonds', 'g1', 'g2'] }, VOL));
      const V = await vaten(page);
      for (const id of ['g1', 'g2']) {
        const v = V.find((x) => x.id === id);
        expect(v.laat, id).toBe(true);
        expect(v.dat, id).toMatch(/\d+ maand(en)? te laat|nog niet te halen/);
        expect(v.dat, id).toMatch(/€[\d.]+ per maand haalt het wel/);
      }
      // het genoemde bedrag komt uit doelTempo() en wordt niet ter plekke herrekend
      const ben = await page.evaluate(() => {
        const p = allocatePlan().find((x) => x.id === 'g1');
        return euro0(doelTempo(p, p.alloc).benodigd);
      });
      expect(V.find((x) => x.id === 'g1').dat).toContain(ben);
    });

  test('een verdeling die net haalt zegt dat het net op tijd is', async ({ page }) => {
    // doel 3.000 bij 3.000 per maand: over één maand vol, en de streefdatum is over één maand
    await boot(page, Object.assign({
      goals: [IW({ streefdatum: overMnd(1), allocMode: 'auto' })], planOrder: ['noodfonds', 'g2'] }, VOL));
    const v = (await vaten(page)).find((x) => x.id === 'g2');
    expect(v.dat).toContain('net op tijd');
    expect(v.laat).toBe(false);
  });

  test('te laat door de grendel: geen bedrag, wel de openingsmaand en de markering', async ({ page }) => {
    await boot(page, { goals: [KK({ streefdatum: overMnd(1) })], planOrder: ['noodfonds', 'g1'] });
    const v = (await vaten(page)).find((x) => x.id === 'g1');
    expect(await page.evaluate(() => doelTempo(allocatePlan().find((x) => x.id === 'g1'), 0).soort)).toBe('telaat');
    expect(v.dat).toContain('niet te halen');
    expect(v.dat).toMatch(/je buffer is pas rond \w+ \d{4} vol/);
    expect(v.dat).not.toMatch(/per maand/);        // dat bedrag bestaat hier niet (v243)
    expect(v.laat).toBe(true);
  });

  test('onbekend: geen datum, wel de reden, en geen bedrag', async ({ page }) => {
    await boot(page, { set: { nfToegewezenMigrated: false, savingsAcc: {}, savingsEnds: [], extraSavings: 0 },
      goals: [KK({ streefdatum: overMnd(21) })], planOrder: ['noodfonds', 'g1'] });
    const soort = await page.evaluate(() => {
      const p = allocatePlan().find((x) => x.id === 'g1');
      return doelTempo(p, p.alloc).soort;
    });
    test.skip(soort !== 'onbekend', 'deze opzet levert geen onbekende openingsmaand');
    const v = (await vaten(page)).find((x) => x.id === 'g1');
    expect(v.dat).toContain('wanneer je buffer vol is is nog niet bekend');
    expect(v.dat).not.toMatch(/per maand/);
    expect(v.laat).toBe(false);
  });

  test('het noodfonds draagt nooit een tweede datum', async ({ page }) => {
    for (const o of [{ goals: [KK({ streefdatum: overMnd(21) })], planOrder: ['noodfonds', 'g1'] },
                     { goals: [], planOrder: ['noodfonds'] }]) {
      await boot(page, o);
      const nf = (await vaten(page)).find((x) => x.id === 'noodfonds');
      if (!nf) continue;
      expect(nf.dat).not.toMatch(/moet in/);
      expect(nf.dat).not.toMatch(/te laat/);
      expect(nf.laat).toBe(false);
    }
  });

  test('een onbekende spaarstand blijft onbekend: geen nul die als toewijzing leest', async ({ page }) => {
    await boot(page, { set: { nfToegewezenMigrated: false, savingsAcc: {}, savingsEnds: [], extraSavings: 0 },
      goals: [], planOrder: ['noodfonds'] });
    const onb = await page.evaluate(() => (planMap().noodfonds || {}).nfOnbekend);
    test.skip(!onb, 'deze opzet levert geen onbekende stand');
    const t = await page.locator('#s-vooruit .plan-item[data-id="noodfonds"]').innerText();
    expect(t).toContain('onbekend');
    expect(t).not.toMatch(/€0 toegewezen/);
  });
});

test.describe('c · de schaal', () => {
  const drie = { goals: [KK({ streefdatum: overMnd(21) }), IW({ streefdatum: overMnd(28) })],
    planOrder: ['noodfonds', 'g1', 'g2'] };

  test('geen vat onder de minimumhoogte, en geen vat knipt zijn eigen tekst af', async ({ page }) => {
    await boot(page, drie);
    const MIN = await page.evaluate(() => VAT_MIN);
    for (const v of await vaten(page)) {
      expect(v.h, v.id).toBeGreaterThanOrEqual(MIN);
      expect(v.nodig, v.id + ' inhoud past').toBeLessThanOrEqual(v.h);
    }
  });

  test('de kolom blijft binnen zijn budget, en de vrije vaten staan op schaal', async ({ page }) => {
    await boot(page, drie);
    const c = await page.evaluate(() => ({ MIN: VAT_MIN, BUD: VAT_BUDGET }));
    const V = await vaten(page);
    expect(V.reduce((a, v) => a + v.h, 0)).toBeLessThanOrEqual(Math.max(c.BUD, V.length * c.MIN) + 2);
    const doelen = await page.evaluate(() => Object.fromEntries(allocatePlan().map((p) => [p.id, p.doel])));
    const vrij = V.filter((v) => !v.geklemd);
    for (let i = 1; i < vrij.length; i++)
      expect(vrij[i].h / vrij[0].h).toBeCloseTo(doelen[vrij[i].id] / doelen[vrij[0].id], 1);
  });

  test('het kleinste vat houdt zijn minimumhoogte naast een doel van €16.000', async ({ page }) => {
    await boot(page, drie);
    const V = await vaten(page);
    const klein = V.find((x) => x.id === 'g2'), groot = V.find((x) => x.id === 'g1');
    expect(klein.geklemd).toBe(true);
    expect(klein.h).toBe(await page.evaluate(() => VAT_MIN));
    expect(groot.h).toBeGreaterThan(klein.h * 2);
  });

  test('precies de geklemde vaten dragen de markering, de andere niet', async ({ page }) => {
    await boot(page, drie);
    const r = await page.evaluate(() => {
      const H = planVatHoogten(allocatePlan());
      return [...document.querySelectorAll('#s-vooruit .vat')].map((v) => {
        const id = v.closest('.plan-item').dataset.id;
        return { id, geklemd: !!(H[id] || {}).geklemd,
          rand: v.classList.contains('vat-geklemd'),
          sr: !!v.querySelector('.sr-only'),
          srTekst: (v.querySelector('.sr-only') || {}).textContent || '' };
      });
    });
    expect(r.length).toBeGreaterThan(1);
    expect(r.some((x) => x.geklemd)).toBe(true);
    expect(r.some((x) => !x.geklemd)).toBe(true);
    for (const x of r) {
      expect(x.rand, x.id + ' gestippelde rand').toBe(x.geklemd);
      expect(x.sr, x.id + ' schermlezer').toBe(x.geklemd);
      if (x.geklemd) expect(x.srTekst).toMatch(/niet op schaal/);
    }
  });

  test('boven het breekpunt groeit de kolom mee in plaats van dat een vat verdwijnt', async ({ page }) => {
    const veel = []; for (let i = 1; i <= 8; i++) veel.push({ id: 'v' + i, naam: 'Doel ' + i,
      doel: 1000 * i, gespaard: 0, allocMode: 'auto', streefdatum: overMnd(24 + i) });
    await boot(page, Object.assign({ goals: veel, planOrder: ['noodfonds'].concat(veel.map((g) => g.id)) }, VOL));
    const c = await page.evaluate(() => ({ MIN: VAT_MIN, BUD: VAT_BUDGET }));
    const V = await vaten(page);
    expect(V.length).toBe(8);                       // het noodfonds is vol en ingeklapt
    const som = V.reduce((a, v) => a + v.h, 0);
    expect(som).toBeGreaterThan(c.BUD);             // het budget alleen kan dit niet meer dragen
    expect(som).toBeLessThanOrEqual(Math.max(c.BUD, V.length * c.MIN) + 2);
    for (const v of V) expect(v.h, v.id).toBeGreaterThanOrEqual(c.MIN);
  });
});

test.describe('d · de balk en de takken', () => {
  /* Twee doelen die precies krijgen wat ze nog nodig hebben, zodat er werkelijk iets onverdeeld
     blijft: met een doel van €16.000 erin zou ronde 2 het restant alsnog doorschuiven en is er
     geen vrij segment om te toetsen. */
  const twee = Object.assign({
    goals: [KK({ doel: 1500, streefdatum: overMnd(40), allocMode: 'fixed', perMaand: 1500 }),
            IW({ doel: 1000, streefdatum: overMnd(40), allocMode: 'fixed', perMaand: 1000 })],
    planOrder: ['noodfonds', 'g1', 'g2'] }, VOL);

  test('de inlegbalk is verdeeld per bestemming en telt op tot honderd procent', async ({ page }) => {
    await boot(page, twee);
    const segs = await page.evaluate(() => [...document.querySelectorAll('.inleg-balk > .bar-fill')]
      .map((x) => ({ id: x.dataset.seg, w: parseFloat(x.style.width) })));
    expect(segs.map((s) => s.id)).toEqual(['g1', 'g2', 'vrij']);
    expect(segs.reduce((a, s) => a + s.w, 0)).toBeCloseTo(100, 1);
    // en elk segment is zijn eigen aandeel van de inleg, niet een gelijk deel
    const P = await page.evaluate(() => ({ cap: planCapacity(),
      alloc: Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])) }));
    for (const s of segs.filter((x) => x.id !== 'vrij'))
      expect(s.w, s.id).toBeCloseTo(P.alloc[s.id] / P.cap * 100, 1);
  });

  test('wat onverdeeld blijft is een eigen leeg segment en geen weggelaten rest', async ({ page }) => {
    await boot(page, twee);
    const vrij = await page.evaluate(() => {
      const el = document.querySelector('.inleg-balk > [data-seg="vrij"]');
      return el ? parseFloat(el.style.width) : null;
    });
    const P = await page.evaluate(() => ({ cap: planCapacity(), vrij: planVrij() }));
    expect(vrij).toBeCloseTo(P.vrij / P.cap * 100, 1);
  });

  test('elk segment en zijn tak dragen dezelfde kleur', async ({ page }) => {
    await boot(page, twee);
    const r = await page.evaluate(() => {
      const uit = [];
      for (const seg of document.querySelectorAll('.inleg-balk > .bar-fill')) {
        const id = seg.dataset.seg; if (id === 'vrij') continue;
        const tak = document.querySelector(`.plan-tak[data-tak="${id}"] i`);
        uit.push({ id, seg: getComputedStyle(seg).backgroundColor,
          tak: tak ? getComputedStyle(tak).backgroundColor : null });
      }
      return uit;
    });
    expect(r.length).toBeGreaterThan(1);
    for (const x of r) {
      expect(x.tak, x.id + ' heeft een tak').not.toBe(null);
      expect(x.seg, x.id).toBe(x.tak);
    }
    // en twee bestemmingen delen niet dezelfde tint, anders zegt de kleur niets
    expect(new Set(r.map((x) => x.seg)).size).toBe(r.length);
  });

  test('de dikte van een tak volgt zijn maandbedrag, en een doel zonder inleg heeft geen tak',
    async ({ page }) => {
      await boot(page, Object.assign({}, twee, { goals: [
        KK({ streefdatum: overMnd(40), allocMode: 'fixed', perMaand: 2000 }),
        IW({ streefdatum: overMnd(40), allocMode: 'fixed', perMaand: 0 })] }));
      const r = await page.evaluate(() => ({
        takken: [...document.querySelectorAll('.plan-tak')].map((t) => ({
          id: t.dataset.tak, w: parseFloat(t.querySelector('i').style.width) })),
        alloc: Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])),
        cap: planCapacity() }));
      expect(r.takken.map((t) => t.id)).toEqual(['g1']);      // g2 krijgt niets, dus geen tak
      expect(r.takken[0].w).toBeCloseTo(r.alloc.g1 / r.cap * 100, 1);
    });

  test('de tak noemt hetzelfde bedrag als de balk erboven verdeelt', async ({ page }) => {
    await boot(page, twee);
    const T = await takken(page);
    const alloc = await page.evaluate(() => Object.fromEntries(allocatePlan().map((p) => [p.id, euro0(p.alloc)])));
    for (const t of T) expect(t.label, t.id).toContain(alloc[t.id] + '/mnd');
  });
});

test.describe('e · de bediening en de omgeving', () => {
  const drie = { goals: [KK({ streefdatum: overMnd(21) }), IW({ streefdatum: overMnd(28) })],
    planOrder: ['noodfonds', 'g1', 'g2'] };

  test('een pijltje dat niet mag is een uitgeschakelde knop, en tikken doet niets', async ({ page }) => {
    await boot(page, drie);
    const voor = await page.evaluate(() => planItems().map((x) => x.id));
    const knop = page.locator('#s-vooruit .plan-item[data-id="noodfonds"] .plan-mv').nth(1);
    await expect(knop).toBeDisabled();
    expect(await page.evaluate(() => {
      const el = document.querySelectorAll('#s-vooruit .plan-item[data-id="noodfonds"] .plan-mv')[1];
      return el.tagName.toLowerCase();
    })).toBe('button');
    await knop.click({ force: true });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => planItems().map((x) => x.id))).toEqual(voor);
  });

  test('de optelling staat onder de waterval en niet meer boven de reserveringen', async ({ page }) => {
    await boot(page, drie);
    const r = await page.evaluate(() => {
      const el = document.querySelector('#s-vooruit');
      const alinea = [...el.querySelectorAll('.small.mut2')].find((x) => /in totaal|van je plan staat er nog niet/.test(x.textContent));
      const kaart = [...el.querySelectorAll('.card')].find((c) => /Te verdelen/.test(c.textContent));
      const res = [...el.querySelectorAll('.card')].find((c) => /eservering/.test(c.textContent));
      return { inKaart: !!(alinea && kaart && kaart.contains(alinea)),
        naVrij: !!(alinea && document.querySelector('#planVrij') &&
          (document.querySelector('#planVrij').compareDocumentPosition(alinea) & Node.DOCUMENT_POSITION_FOLLOWING) > 0),
        voorRes: !!(alinea && res && (alinea.compareDocumentPosition(res) & Node.DOCUMENT_POSITION_FOLLOWING) > 0) };
    });
    expect(r.inKaart).toBe(true);      // binnen de kaart van de waterval
    expect(r.naVrij).toBe(true);       // onder de sluitpost
    expect(r.voorRes).toBe(true);      // en nog steeds vóór de reserveringen, maar niet meer ertegenaan
  });

  test('er staat geen tijdas langs de kolom', async ({ page }) => {
    await boot(page, drie);
    const t = await page.locator('#s-vooruit').innerText();
    // een maandschaal zou een reeks maandlabels naast elkaar zijn; die is er niet
    expect(await page.evaluate(() => document.querySelectorAll('#s-vooruit .tijdas, #s-vooruit [data-as]').length)).toBe(0);
    expect(t).not.toMatch(/(\d+ mnd\s+){3,}/);
  });

  for (const breed of [360, 390]) {
    test(`geen horizontale overflow op ${breed}px`, async ({ page }) => {
      await boot(page, drie, breed);
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});
