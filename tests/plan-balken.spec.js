// v248: het beeld van Plan. Liggende balken van gelijke grootte, met een streepje.
//
// RONDE B GAF ELK DOEL EEN VAT OP HOOGTE VAN ZIJN DOELBEDRAG. De verhouding klopte, maar leverde
// niets op: een leeg vat van ruim 300px zegt alleen dat een doel ver weg is. Elke bestemming heeft
// nu dezelfde liggende balk en de vulling is de voortgang in procenten, zodat de doelen onderling
// vergelijkbaar worden op wat telt.
//
// EEN BALK VAN GELIJKE GROOTTE IS ALLEEN ZIJN PLEK WAARD ALS HIJ IETS DRAAGT WAT DE TEKST NIET
// ZEGT. Dat is het streepje: waar je nu zou moeten staan om je streefdatum te halen. Staat de
// vulling ervoor, dan loop je voor; erachter, dan loop je achter.
//
// HET BEGINMOMENT WORDT BEWAARD EN NIET AFGELEID. Afleiden uit goal.grendel kan niet: dat veld
// bestaat alleen zolang een doel WACHT. Gemeten op het doel van het toestel: €10.000 met
// streefdatum juni 2028 (in de fixtures KK_STREEF, zie de toelichting daar),
// aangemaakt 19 juli 2026 en een grendel die rond november 2026 opengaat: met het id als terugval
// springt het streepje op de openingsdag van €0 naar €1.832, precies op de dag dat je mag
// beginnen. Daarom leggen saveGoal(), resNaarDoel() en grendelStartVastleggen() startDatum en
// startStand vast; het id blijft alleen de terugval voor doelen van vóór v248.
//
// GEEN TIJDAS, en sinds v248 ook geen schaal meer: planVatHoogten(), VAT_MIN, VAT_BUDGET en de
// markering "niet op schaal" zijn vervallen met de vaten waar ze bij hoorden.
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
  await page.waitForFunction(() => typeof doelStreepje === 'function');
  await page.evaluate(() => go('vooruit'));
}
/* De tekst van een bestemming staat boven zijn balk, in .vat-kop; .vat draagt de balk zelf plus
   het streepje. Hoogte en breedte zijn voor elke bestemming gelijk, dus die meten we ook. */
const balken = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .vat')].map((v) => {
  const it = v.closest('.plan-item');
  const r = v.getBoundingClientRect();
  const st = v.querySelector('.doel-streep');
  return { id: it.dataset.id, h: Math.round(r.height), w: Math.round(r.width),
    vulling: [...v.querySelectorAll('.bar-fill')].map((f) => parseFloat(f.style.width)),
    streep: st ? parseFloat(st.dataset.pct) : null,
    sr: st ? st.textContent.replace(/\s+/g, ' ').trim() : null,
    laat: v.dataset.laat === '1',
    dat: (it.querySelector('.vat-dat') || { innerText: '' }).innerText.replace(/\s+/g, ' ').trim() };
}));
// de tak draagt sinds v246b geen tekst: het bedrag staat in de kop één regel erboven
const takken = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .plan-tak')]
  .map((t) => ({ id: t.dataset.tak, w: parseFloat(t.querySelector('i').style.width) })));
/* De echte ids van het toestel. Ze dragen hun aanmaakmoment in base36 ('gmrsd1piu' is 19 juli
   2026), en dat is wat de terugval leest; ID_KK zou naar 1970 decoderen en dus geen streepje geven.
   Een spec die het beginmoment toetst moet daarom met plausibele ids werken. */
/* DE STREEFDATA VAN HET TOESTEL, en waarom ze hier als afstand staan. Kosten Koper loopt tot
   juni 2028 en Inrichting woning tot januari 2029; op de meetdag (september 2026) is dat 21 en 28
   maanden vooruit. Ze staan hieronder als die AFSTAND en niet als die DATUM, want een vaste datum
   kruipt met de kalender naar het heden toe: in juni 2028 zou dit doel op zijn streefdatum staan
   en in juli erna erachter, en dan toetst de spec een ander geval dan hij beschrijft. Wat hij
   vasthoudt is een doel dat bijna twee jaar weg ligt met een tweede er een half jaar achter, en
   dat is precies de verhouding van het toestel. Bedrag, id en naam zijn wel letterlijk het
   toestel: €10.000 en €3.000, met de ids die hun aanmaakmoment dragen. */
const KK_STREEF = overMnd(21);        // juni 2028 op de meetdag
const IW_STREEF = overMnd(28);        // januari 2029 op de meetdag
const KK = (o) => Object.assign({ id: 'gmrsd1piu', naam: 'Kosten Koper', doel: 10000, gespaard: 0, allocMode: 'auto' }, o);
const IW = (o) => Object.assign({ id: 'gmub1fh4u', naam: 'Inrichting woning', doel: 3000, gespaard: 0, allocMode: 'auto' }, o);
const ID_KK = 'gmrsd1piu', ID_IW = 'gmub1fh4u';

test.describe('a · de grendel in beeld', () => {
  const dicht = { goals: [KK({ streefdatum: KK_STREEF }), IW({ streefdatum: IW_STREEF })],
    planOrder: ['noodfonds', ID_KK, ID_IW] };

  test('dichte grendel op de gemeten toestand: één tak, en die gaat naar de buffer', async ({ page }) => {
    await boot(page, dicht);
    expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 4201 });
    const T = await takken(page);
    expect(T.map((x) => x.id)).toEqual(['noodfonds']);      // de andere twee krijgen niets, dus geen tak
    expect(T[0].w).toBeCloseTo(100, 1);                     // de hele inleg, dus de volle breedte
    // en het bedrag staat in de kop erboven, één keer
    expect(await page.locator('#s-vooruit .plan-item[data-id="noodfonds"] .vat-kop').innerText())
      .toContain('€3.000/mnd');
  });

  test('het noodfonds noemt de maand waarin hij vol is, en de twee doelen wachten', async ({ page }) => {
    await boot(page, dicht);
    const V = await balken(page);
    const nf = V.find((x) => x.id === 'noodfonds');
    const dat = await page.evaluate(() => planGrendelDatum());
    expect(nf.dat).toBe(`vol in ${dat}`);
    for (const id of [ID_KK, ID_IW]) {
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
        planOrder: ['noodfonds', ID_KK, ID_IW] }, VOL));
      const v = (await balken(page)).find((x) => x.id === ID_KK);
      expect(v.dat).toMatch(/^vol in \w+ \d{4} · moet in \w+ \d{4}$/);
      expect(v.laat).toBe(false);
    });

  test('twee doelen die het geen van beide halen: achterstand en het bedrag dat het wel haalt',
    async ({ page }) => {
      await boot(page, Object.assign({
        goals: [KK({ streefdatum: overMnd(4), allocMode: 'fixed', perMaand: 1500 }),
                IW({ streefdatum: overMnd(1), allocMode: 'fixed', perMaand: 1500 })],
        planOrder: ['noodfonds', ID_KK, ID_IW] }, VOL));
      const V = await balken(page);
      for (const id of [ID_KK, ID_IW]) {
        const v = V.find((x) => x.id === id);
        expect(v.laat, id).toBe(true);
        expect(v.dat, id).toMatch(/\d+ maand(en)? te laat|nog niet te halen/);
        expect(v.dat, id).toMatch(/€[\d.]+ per maand haalt het wel/);
      }
      // het genoemde bedrag komt uit doelTempo() en wordt niet ter plekke herrekend
      const ben = await page.evaluate((id) => {
        const p = allocatePlan().find((x) => x.id === id);
        return euro0(doelTempo(p, p.alloc).benodigd);
      }, ID_KK);
      expect(V.find((x) => x.id === ID_KK).dat).toContain(ben);
    });

  test('een verdeling die net haalt zegt dat het net op tijd is', async ({ page }) => {
    // doel 3.000 bij 3.000 per maand: over één maand vol, en de streefdatum is over één maand
    await boot(page, Object.assign({
      goals: [IW({ streefdatum: overMnd(1), allocMode: 'auto' })], planOrder: ['noodfonds', ID_IW] }, VOL));
    const v = (await balken(page)).find((x) => x.id === ID_IW);
    expect(v.dat).toContain('net op tijd');
    expect(v.laat).toBe(false);
  });

  test('te laat door de grendel: geen bedrag, wel de openingsmaand en de markering', async ({ page }) => {
    await boot(page, { goals: [KK({ streefdatum: overMnd(1) })], planOrder: ['noodfonds', ID_KK] });
    const v = (await balken(page)).find((x) => x.id === ID_KK);
    expect(await page.evaluate((id) => doelTempo(allocatePlan().find((x) => x.id === id), 0).soort, ID_KK)).toBe('telaat');
    expect(v.dat).toContain('niet te halen');
    expect(v.dat).toMatch(/je buffer is pas rond \w+ \d{4} vol/);
    expect(v.dat).not.toMatch(/per maand/);        // dat bedrag bestaat hier niet (v243)
    expect(v.laat).toBe(true);
  });

  test('onbekend: geen datum, wel de reden, en geen bedrag', async ({ page }) => {
    await boot(page, { set: { nfToegewezenMigrated: false, savingsAcc: {}, savingsEnds: [], extraSavings: 0 },
      goals: [KK({ streefdatum: KK_STREEF })], planOrder: ['noodfonds', ID_KK] });
    const soort = await page.evaluate((id) => {
      const p = allocatePlan().find((x) => x.id === id);
      return doelTempo(p, p.alloc).soort;
    }, ID_KK);
    test.skip(soort !== 'onbekend', 'deze opzet levert geen onbekende openingsmaand');
    const v = (await balken(page)).find((x) => x.id === ID_KK);
    expect(v.dat).toContain('wanneer je buffer vol is is nog niet bekend');
    expect(v.dat).not.toMatch(/per maand/);
    expect(v.laat).toBe(false);
  });

  test('het noodfonds draagt nooit een tweede datum', async ({ page }) => {
    for (const o of [{ goals: [KK({ streefdatum: KK_STREEF })], planOrder: ['noodfonds', ID_KK] },
                     { goals: [], planOrder: ['noodfonds'] }]) {
      await boot(page, o);
      const nf = (await balken(page)).find((x) => x.id === 'noodfonds');
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

/* v248: HIER STOND 'c · de schaal'. Die groep toetste de bodem, het budget, de onderlinge
   verhouding van de vathoogten en de markering "niet op schaal". Alle vier bestaan niet meer:
   elke bestemming heeft dezelfde balk, dus er valt niets te schalen en niets te klemmen. Wat
   ervoor in de plaats komt is wat de balk nu wel moet zeggen. */
test.describe('c · de balken zijn gelijk, de vulling is de voortgang', () => {
  const drie = { goals: [KK({ streefdatum: KK_STREEF }), IW({ streefdatum: IW_STREEF })],
    planOrder: ['noodfonds', ID_KK, ID_IW] };

  test('drie balken van gelijke hoogte en gelijke breedte', async ({ page }) => {
    await boot(page, drie);
    const B = await balken(page);
    expect(B.length).toBe(3);
    expect(new Set(B.map((x) => x.h)).size, 'hoogtes: ' + B.map((x) => x.h).join(',')).toBe(1);
    expect(new Set(B.map((x) => x.w)).size, 'breedtes: ' + B.map((x) => x.w).join(',')).toBe(1);
  });

  test('de vulling is gespaard gedeeld door doel, in procenten', async ({ page }) => {
    await boot(page, Object.assign({
      goals: [KK({ gespaard: 2500, streefdatum: KK_STREEF }), IW({ gespaard: 300, streefdatum: IW_STREEF })],
      planOrder: ['noodfonds', ID_KK, ID_IW] }, VOL));
    const B = await balken(page);
    const P = await page.evaluate(() => Object.fromEntries(allocatePlan().map((p) => [p.id, { g: p.gespaard, d: p.doel }])));
    for (const b of B) {
      const p = P[b.id];
      expect(b.vulling[0], b.id).toBeCloseTo(Math.min(Math.round(p.g / p.d * 100), 100), 1);
    }
  });

  test('nog te gaan is de lege rest van de track en geen eigen laag', async ({ page }) => {
    await boot(page, Object.assign({ goals: [KK({ gespaard: 2500, allocMode: 'fixed', perMaand: 500,
      streefdatum: KK_STREEF })], planOrder: ['noodfonds', ID_KK] }, VOL));
    const b = (await balken(page)).find((x) => x.id === ID_KK);
    expect(b.vulling.length).toBe(2);                    // stand plus wat er deze maand bij komt
    expect(b.vulling[0] + b.vulling[1]).toBeLessThanOrEqual(100.01);
  });
});

test.describe('d · het streepje', () => {
  const na = (n) => { const d = new Date(now.getFullYear(), now.getMonth() + n, now.getDate());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  test('het noodfonds draagt nooit een streepje, want het heeft geen streefdatum', async ({ page }) => {
    await boot(page, { goals: [KK({ streefdatum: KK_STREEF })], planOrder: ['noodfonds', ID_KK] });
    expect((await balken(page)).find((x) => x.id === 'noodfonds').streep).toBe(null);
  });

  test('een doel achter de grendel heeft zijn streepje op nul', async ({ page }) => {
    await boot(page, { goals: [KK({ streefdatum: KK_STREEF })], planOrder: ['noodfonds', ID_KK] });
    expect(await page.evaluate(() => !!planGrendel())).toBe(true);
    const b = (await balken(page)).find((x) => x.id === ID_KK);
    expect(b.streep).toBe(0);
  });

  /* HET GAT DAT DEZE RONDE OPLOST. goal.grendel bestaat alleen zolang een doel wacht, dus met het
     id als beginmoment sprong het streepje op de openingsdag van nul naar een venster dat al
     maanden liep (gemeten: €0 naar €1.832 op een doel van €10.000). Nu legt
     grendelStartVastleggen() het beginmoment eenmalig vast op het moment van opengaan. */
  test('de grendel gaat open en het streepje blijft op nul in plaats van te springen',
    async ({ page }) => {
      await boot(page, { goals: [KK({ streefdatum: KK_STREEF })], planOrder: ['noodfonds', ID_KK] });
      expect((await balken(page)).find((x) => x.id === ID_KK).streep).toBe(0);
      expect(await page.evaluate(() => !!SET.grendelDicht), 'de vlag staat bij een dichte grendel').toBe(true);
      /* De buffer wordt vol. Niet via een reload: addInitScript zet de fixture er dan opnieuw
         overheen en de toewijzing valt terug. We roepen de functie aan op het moment dat hij
         draait, en de boot-aanroep zelf staat hieronder als eigen test. */
      const n = await page.evaluate(() => { SET.nfToegewezen = 99999; save(); return grendelStartVastleggen(); });
      expect(n, 'één doel kreeg zijn beginmoment').toBe(1);
      await page.evaluate(() => { render(); go('vooruit'); });
      expect(await page.evaluate(() => !!planGrendel())).toBe(false);
      expect(await page.evaluate(() => SET.grendelDicht), 'de vlag is gewist').toBe(undefined);
      const g = await page.evaluate((id) => (SET.goals || []).find((x) => x.id === id), ID_KK);
      expect(g.startDatum, 'het beginmoment is vastgelegd').toBe(await page.evaluate(() => vandaagYMD()));
      expect(g.startStand).toBe(0);
      const b = (await balken(page)).find((x) => x.id === ID_KK);
      expect(b.streep, 'geen sprong op de openingsdag').toBeLessThan(1);
      // en zonder dat veld zou het streepje op datzelfde moment wel gesprongen zijn
      const zonder = await page.evaluate((id) => {
        const g2 = (SET.goals || []).find((x) => x.id === id);
        const kaal = Object.assign({}, allocatePlan().find((x) => x.id === id));
        delete kaal.startDatum; delete kaal.startStand; delete kaal.grendel;
        return { metVeld: doelStreepje(allocatePlan().find((x) => x.id === id)).verwacht,
          zonderVeld: doelStreepje(kaal).verwacht, bron: doelStart(kaal).bron, heeft: !!g2.startDatum };
      }, ID_KK);
      expect(zonder.bron).toBe('id');
      expect(zonder.zonderVeld, 'de sprong die het veld voorkomt').toBeGreaterThan(500);
      expect(zonder.metVeld).toBe(0);
    });

  test('een doel dat achterloopt: de vulling staat voor het streepje', async ({ page }) => {
    // halverwege het venster, met niets gespaard
    await boot(page, Object.assign({ goals: [KK({ gespaard: 0, streefdatum: overMnd(12),
      startDatum: na(-12), startStand: 0 })], planOrder: ['noodfonds', ID_KK] }, VOL));
    const b = (await balken(page)).find((x) => x.id === ID_KK);
    expect(b.streep).toBeGreaterThan(40);
    expect(b.streep).toBeLessThan(60);
    expect(b.vulling[0]).toBeLessThan(b.streep);
    expect(b.sr).toMatch(/achter/);
  });

  test('een doel dat voorloopt: de vulling staat voorbij het streepje', async ({ page }) => {
    await boot(page, Object.assign({ goals: [KK({ gespaard: 9000, streefdatum: overMnd(12),
      startDatum: na(-12), startStand: 0 })], planOrder: ['noodfonds', ID_KK] }, VOL));
    const b = (await balken(page)).find((x) => x.id === ID_KK);
    expect(b.vulling[0]).toBeGreaterThan(b.streep);
    expect(b.sr).toMatch(/voor/);
  });

  test('een doel precies op koers: vulling en streepje vallen samen', async ({ page }) => {
    await boot(page, Object.assign({ goals: [KK({ gespaard: 0, streefdatum: overMnd(12),
      startDatum: na(-12), startStand: 0 })], planOrder: ['noodfonds', ID_KK] }, VOL));
    // de stand die de app zelf verwacht, uit dezelfde bron; geen nagerekend getal
    const verwacht = await page.evaluate((id) => doelStreepje(allocatePlan().find((x) => x.id === id)).verwacht, ID_KK);
    await page.evaluate((v) => { SET.goals[0].gespaard = v; save(); render(); go('vooruit'); }, verwacht);
    /* De vulling rendert als heel percentage en het streepje als kommagetal, dus ze kunnen tot een
       half procent schelen zonder dat er iets mis is. Wat hier geldt is dat ze samenvallen binnen
       dat ene procent, en dat de tekst het zegt. */
    const b = (await balken(page)).find((x) => x.id === ID_KK);
    expect(Math.abs(b.vulling[0] - b.streep)).toBeLessThan(1);
    expect(b.sr).toMatch(/op koers/);
  });

  test('de schermlezertekst noemt voor, achter of op koers met het bedrag', async ({ page }) => {
    await boot(page, Object.assign({ goals: [KK({ gespaard: 0, streefdatum: overMnd(12),
      startDatum: na(-12), startStand: 0 })], planOrder: ['noodfonds', ID_KK] }, VOL));
    const r = await page.evaluate((id) => {
      const p = allocatePlan().find((x) => x.id === id);
      const S = doelStreepje(p);
      return { tekst: doelStreepjeTekst(p, S), verschil: S.verschil, euro: euro0(Math.abs(S.verschil)) };
    }, ID_KK);
    expect(r.verschil).toBeLessThan(0);
    expect(r.tekst).toContain(r.euro);
    expect(r.tekst).toMatch(/achter/);
  });

  test('een doel uit een reservering begint op koers en niet voor', async ({ page }) => {
    /* resNaarDoel() legt startStand vast op de stand die de knop meegeeft. Zonder dat veld zou de
       lijn op nul beginnen en las je op dag één "je loopt €800 voor". */
    await boot(page, Object.assign({ goals: [], planOrder: ['noodfonds'] }, VOL));
    const r = await page.evaluate(() => {
      const vandaag = vandaagYMD();
      const g = { id: 'g' + Date.now().toString(36), naam: 'Uit reservering', doel: 2000, gespaard: 800,
        allocMode: 'auto', perMaand: 0, pct: 0, streefdatum: '2029-01',
        startDatum: vandaag, startStand: 800 };
      SET.goals = [g]; SET.planOrder = ['noodfonds', g.id]; save(); render(); go('vooruit');
      const p = allocatePlan().find((x) => x.id === g.id);
      const S = doelStreepje(p);
      return { verwacht: S.verwacht, verschil: S.verschil, tekst: doelStreepjeTekst(p, S) };
    });
    expect(r.verwacht).toBe(800);          // de lijn begint bij de stand die meekwam
    expect(r.verschil).toBe(0);
    expect(r.tekst).toMatch(/op koers/);
  });

  test('een bestaand doel zonder de twee velden valt terug op zijn id', async ({ page }) => {
    await boot(page, Object.assign({ goals: [KK({ gespaard: 0, streefdatum: KK_STREEF })],
      planOrder: ['noodfonds', ID_KK] }, VOL));
    const r = await page.evaluate((id) => {
      const g = (SET.goals || []).find((x) => x.id === id);
      const S = doelStart(g);
      return { velden: !!g.startDatum, bron: S && S.bron, datum: S && S.datum, stand: S && S.stand,
        idDatum: doelIdMoment(id) };
    }, ID_KK);
    expect(r.velden).toBe(false);
    expect(r.bron).toBe('id');
    expect(r.stand).toBe(0);
    expect(r.datum).toBe(r.idDatum);
  });

  test('een id dat geen plausibel moment draagt geeft geen streepje', async ({ page }) => {
    await boot(page, Object.assign({
      goals: [{ id: 'g1', naam: 'Oud doel', doel: 5000, gespaard: 0, allocMode: 'auto', streefdatum: overMnd(21) }],
      planOrder: ['noodfonds', 'g1'] }, VOL));
    expect(await page.evaluate(() => doelIdMoment('g1'))).toBe(null);
    expect((await balken(page)).find((x) => x.id === 'g1').streep).toBe(null);
  });

  /* Het streepje leunt voor bestaande doelen op het id-formaat, en dat is een implementatiedetail
     dat als data wordt gelezen. Verandert een aanmaakroute zijn schema, dan verschuift het
     streepje stil. Deze test leest de bron en valt om bij het bouwen. */
  test('de boot legt het beginmoment vast, anders gebeurt het nooit', () => {
    const fs = require('fs'), path = require('path');
    const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    // de overgang van dicht naar open is een moment, geen toestand: wordt hij bij de boot niet
    // vastgesteld, dan is hij voorbij en valt elk wachtend doel alsnog terug op zijn id
    expect(BRON).toMatch(/try\{grendelStartVastleggen\(\);\}catch/);
  });

  test('beide aanmaakroutes genereren nog een id met een tijdstempel erin', () => {
    const fs = require('fs'), path = require('path');
    const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const treffers = BRON.match(/'g'\s*\+\s*Date\.now\(\)\.toString\(36\)/g) || [];
    expect(treffers.length, 'saveGoal() en resNaarDoel()').toBe(2);
  });
});

test.describe('d · de balk en de takken', () => {
  /* Twee doelen die precies krijgen wat ze nog nodig hebben, zodat er werkelijk iets onverdeeld
     blijft: met een doel van €16.000 erin zou ronde 2 het restant alsnog doorschuiven en is er
     geen vrij segment om te toetsen. */
  const twee = Object.assign({
    goals: [KK({ doel: 1500, streefdatum: overMnd(40), allocMode: 'fixed', perMaand: 1500 }),
            IW({ doel: 1000, streefdatum: overMnd(40), allocMode: 'fixed', perMaand: 1000 })],
    planOrder: ['noodfonds', ID_KK, ID_IW] }, VOL);

  test('de inlegbalk is verdeeld per bestemming en telt op tot honderd procent', async ({ page }) => {
    await boot(page, twee);
    const segs = await page.evaluate(() => [...document.querySelectorAll('.inleg-balk > .bar-fill')]
      .map((x) => ({ id: x.dataset.seg, w: parseFloat(x.style.width) })));
    expect(segs.map((s) => s.id)).toEqual([ID_KK, ID_IW, 'vrij']);
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
      expect(r.takken.map((t) => t.id)).toEqual([ID_KK]);      // de tweede krijgt niets, dus geen tak
      expect(r.takken[0].w).toBeCloseTo(r.alloc[ID_KK] / r.cap * 100, 1);
    });

  /* v246b: de tak droeg een label met het maandbedrag, en sinds de tekst boven het vat staat noemt
     de kop dat bedrag één regel hoger. Twee keer hetzelfde getal is een tweede bron, dus de tak
     draagt alleen nog kleur en dikte. */
  test('het maandbedrag staat één keer, in de kop boven de tak', async ({ page }) => {
    await boot(page, twee);
    const alloc = await page.evaluate(() => Object.fromEntries(allocatePlan().map((p) => [p.id, euro0(p.alloc)])));
    for (const t of await takken(page)) {
      const kop = await page.locator(`#s-vooruit .plan-item[data-id="${t.id}"] .vat-kop`).innerText();
      expect(kop, t.id).toContain(alloc[t.id] + '/mnd');
    }
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('#s-vooruit .plan-tak')].every((t) => !t.innerText.trim()))).toBe(true);
  });
});

test.describe('e · de bediening en de omgeving', () => {
  const drie = { goals: [KK({ streefdatum: KK_STREEF }), IW({ streefdatum: IW_STREEF })],
    planOrder: ['noodfonds', ID_KK, ID_IW] };

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
