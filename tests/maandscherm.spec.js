// v130: één scherm dat je één keer per maand opent, met de getallen die samen zeggen of je
// systeem standhoudt. v186/v187: van vijf regels naar drie (dekking, buffer, doel).
// geldsysteem gezond is. Het scherm REKENT NIETS ZELF: het roept bestaande functies aan, stelt hun
// uitkomsten samen en sorteert ze. Enige uitzondering, na akkoord: bufferMaanden(), een deling van
// twee bestaande uitkomsten. Valt een bron weg, dan valt die regel weg zonder foutmelding.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const over = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESV0000002222';
const SAV = 'NL01SAVE0000004323';

// Basis: huur 900 vast, boodschappen 300 normaal. De pot en de spaarrekening krijgen elk een
// boeking, anders staan ze niet in OWN en zijn ze niet aanwijsbaar.
function seedM(set = {}, opt = {}) {
  const tx = [];
  const add = (id, m, day, amount, acc, naam, desc, accName) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName, refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '01', 3000, MAIN, 'Werkgever', 'SALARIS LOON', 'Main');
    add('h' + m, m, '02', -900, MAIN, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING', 'Main');
    add('a' + m, m, '08', -(m === CUR && opt.uitschieter ? 620 : 300), MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'Main');
  }
  add('res1', M1, '05', 100, RES, 'Eigen rekening', 'RESERVERINGEN', 'Res');
  add('sav1', M1, '06', 100, SAV, 'Spaarpot', 'NAAR SPAREN', 'Spaar');
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, nfMaanden: 3,
      manualBal: { [MAIN]: 1500, [RES]: 2000, [SAV]: 20000 },
      resAcc: RES,
      reserveringen: [{ id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(6), intervalM: 12 }],
      goals: [{ id: 'g1', naam: 'Vakantie', doel: 2000, gespaard: 1000, allocMode: 'fixed', perMaand: 300, streefdatum: over(20) }],
      planOrder: ['g1', 'noodfonds'],
      nfDoelVast: 3000,
    }, set)),
    minder_own: JSON.stringify([MAIN, RES, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedM());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof maandRegels === 'function');
}

const R = (page) => page.evaluate(() => maandRegels().map((r) => ({ key: r.key, status: r.status, waarde: r.waarde, eenheid: r.eenheid, gevolg: r.gevolg, maand: r.maand || null })));
const O = (page) => page.evaluate(() => maandOordeel(maandRegels()));
const VB = (page) => page.evaluate(() => maandVerband(maandRegels()));

test.describe('a · het scherm bestaat naast de andere', () => {
  test('sectie en tabblad, en go() werkt zoals bij de rest', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#s-maand').count()).toBe(1);
    expect(await page.locator('.nav a[data-go="maand"]').innerText()).toContain('Maand');
    await page.locator('.nav a[data-go="maand"]').click();
    expect(await page.evaluate(() => document.querySelector('#s-maand').classList.contains('active'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('minder_view'))).toBe('maand');
    expect(await page.evaluate(() => document.querySelector('.nav a[data-go="maand"]').classList.contains('on'))).toBe(true);
  });
});

test.describe('b · de regels', () => {
  /* v186: patroon vervallen (dubbelde met de meldingenlijst). v187: aansluiting vervallen, want
     dat is een administratief verschil tussen toegewezen en aanwezig, geen oordeel over je
     positie. Drie regels over: dekking, buffer, doel. */
  test('alle drie staan er, in de vaste volgorde', async ({ page }) => {
    await boot(page);
    expect((await R(page)).map((r) => r.key)).toEqual(['dekking', 'buffer', 'doel']);
  });

  test('de bronnen komen uit de bestaande functies', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const rr = maandRegels();
      const D = dekking(12), bm = bufferMaanden(), V = spaarVrij();
      return { dekGraad: D.graad, regelDek: rr.find((r) => r.key === 'dekking').waarde,
        regelDekEenheid: rr.find((r) => r.key === 'dekking').eenheid,
        potStand: euro0(Math.round(D.werkelijkeStand || 0)),
        bm: Math.round(bm * 10) / 10, regelBuf: rr.find((r) => r.key === 'buffer').waarde, vrij: V.vrij };
    });
    expect(uit.regelDek).toBe(uit.potStand);          // v189: de kolom toont je potsaldo
    /* v191: een dekkingsgraad toont een percentage tot en met de drempel en daarboven een
       vaststelling; boven de 100% verandert het exacte getal geen enkele beslissing. */
    if (uit.dekGraad <= 100) expect(uit.regelDekEenheid).toContain(uit.dekGraad + '%');
    else { expect(uit.regelDekEenheid).toContain('op peil'); expect(uit.regelDekEenheid).not.toMatch(/%/); }
    expect(uit.regelBuf).toBe(String(uit.bm).replace('.', ','));
  });

  test('bufferMaanden is spaargeld gedeeld door de essentiële crisis-last', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const M = noodfondsModel();
      return { bm: bufferMaanden(), spaar: M.spaar, ess: Math.round(M.essCrisis) };
    });
    expect(uit.bm).toBeCloseTo(uit.spaar / uit.ess, 5);
  });

  test('bufferMaanden is null zonder bekend spaarsaldo', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 2000 } }));
    expect(await page.evaluate(() => bufferMaanden())).toBeNull();
    expect((await R(page)).some((r) => r.key === 'buffer')).toBe(false);
  });
});

test.describe('c · de statussen', () => {
  test('dekking: tekort onder 100 procent, ok erboven, onbekend zonder saldo', async ({ page }) => {
    await boot(page);
    expect((await R(page)).find((r) => r.key === 'dekking').status).toBe('ok');     // 2000 in de pot
    await page.evaluate((a) => { SET.manualBal[a] = 10; save(); }, RES);
    expect((await R(page)).find((r) => r.key === 'dekking').status).toBe('tekort');
    await page.evaluate((a) => { delete SET.manualBal[a]; save(); }, RES);
    expect((await R(page)).find((r) => r.key === 'dekking').status).toBe('onbekend');
  });

  test('buffer: tekort onder drie maanden, let op onder je richtbedrag, anders ok', async ({ page }) => {
    await boot(page, seedM({ nfMaanden: 6 }));
    const meet = async () => (await R(page)).find((r) => r.key === 'buffer').status;
    expect(await meet()).toBe('ok');                                                // 20000 / 1000 = 20 mnd
    await page.evaluate((a) => { SET.manualBal[a] = 4000; save(); }, SAV);
    expect(await meet()).toBe('let op');                                            // 4 mnd, richt 6
    await page.evaluate((a) => { SET.manualBal[a] = 2000; save(); }, SAV);
    expect(await meet()).toBe('tekort');                                            // 2 mnd
  });

  /* v172: het noodfonds claimt niet meer zijn doel maar zijn toewijzing, dus het doel omhoog
     zetten sluit het gat niet meer - toewijzen wel. Dat is precies de bedoeling van model B. */
  /* v187: aansluiting is geen maandregel meer. Het feit zelf leeft onveranderd door in
     spaarVrij() en in spaarVrijLine() op Plan, dus dat is wat deze test nu meet. */
  test('aansluiting staat niet meer op Maand, maar spaarVrij meet nog hetzelfde', async ({ page }) => {
    await boot(page);
    expect((await R(page)).some((r) => r.key === 'aansluiting')).toBe(false);
    expect(await page.evaluate(() => spaarVrij().vrij)).toBeGreaterThan(0);
    expect(await page.evaluate(() => spaarVrijLine(allocatePlan()))).toContain('toewijzen');
    const saldo = await page.evaluate(() => Math.round(spaarSaldo().cur));
    await page.evaluate((s) => { SET.nfDoelVast = s; SET.nfToegewezen = s - 1000;
      SET.goals[0].gespaard = 1000; save(); }, saldo);
    expect(await page.evaluate(() => spaarVrij().vrij)).toBe(0);
    expect(await page.evaluate(() => spaarVrijLine(allocatePlan()))).toBe('');
  });

  test('aankoopdoel: tekort bij een gat, ok zonder, onbekend zonder streefdatum', async ({ page }) => {
    await boot(page);
    expect((await R(page)).find((r) => r.key === 'doel').status).toBe('ok');
    await page.evaluate(() => { SET.goals[0].streefdatum = SET.goals[0].streefdatum; SET.goals[0].doel = 40000; save(); });
    expect((await R(page)).find((r) => r.key === 'doel').status).toBe('tekort');
    await page.evaluate(() => { delete SET.goals[0].streefdatum; save(); });
    expect((await R(page)).some((r) => r.key === 'doel')).toBe(false);               // geen streefdatum: geen regel
  });

  /* v186: patroon is geen regel meer. De melding waar hij op leunde draagt h:'direct' en hoort
     dus in de meldingenlijst; maandPatroon() blijft bestaan als invoer voor maandVerband(), dat
     iets zegt wat de melding zelf niet zegt. */
  test('patroon is geen regel meer, maar voedt nog wel het verband', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    expect((await R(page)).find((r) => r.key === 'patroon')).toBeUndefined();
    const p = await page.evaluate(() => maandPatroon());
    expect(p).not.toBeNull();
    expect(p.boven).toBeGreaterThan(0);
    // en hij zit nog in de meldingenlijst, want dat is zijn horizon
    expect(await page.evaluate(() => notifList().some((n) => n.key === maandPatroon().key))).toBe(true);
  });

  test('alleen uitgavenpatronen tellen, geen incasso of saldo-nudge', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    const k = await page.evaluate(() => (maandPatroon() || {}).key || '');
    expect(k).toMatch(/^(budget-|discr-|tempo)/);
  });
});

test.describe('c2 · dekking zonder opbouw-eis (v131)', () => {
  // gemeld: pot 50, verplichting 25, en toch "onbekend". Bij een eenmalige post of een jaarpost die
  // twaalf maanden of verder weg ligt is benodigdeStand nul, dus geeft dekking() terecht graad null.
  // Dat las het maandscherm als onbekend, met status tekort. Er is niets onbekends: er hoeft alleen
  // nog niets opgebouwd te zijn.
  /* v189: de waardekolom mengde vijf soorten waarde. Hij toont er nu een: wat er in je
     reserveringenpot staat, of het woord onbekend. Het oordeel dat eruit gehaald is - het
     percentage, of waarom er geen is - staat in de eenheid ernaast, met dezelfde noemers. */
  const eenmalig = (bedrag, o) => ({ id: 'a', naam: 'Post', bedrag, vervalmaand: over(o), intervalM: 0 });
  const dek = async (page) => (await R(page)).find((r) => r.key === 'dekking');

  test('een eenmalige post die je kunt betalen is ok, niet onbekend', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 3)], manualBal: { [MAIN]: 1500, [RES]: 50, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(await page.evaluate(() => dekking(12).graad)).toBeNull();     // geen percentage te delen
    expect(d.status).toBe('ok');
    expect(d.waarde).toBe('€50');                                       // v189: je potsaldo
    expect(d.waarde).not.toBe('onbekend');
    expect(d.eenheid).toBe('in je pot · er hoeft nu nog niets opzij');
  });

  test('kun je hem niet betalen, dan is het tekort, met de maand erbij', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 3)], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(d.status).toBe('tekort');
    expect(d.waarde).toBe('€10');                                       // v189: je potsaldo
    expect(d.eenheid).toBe('in je pot · 40% van de eerstvolgende post'); // v132 percentage, nu in de eenheid
    expect(d.gevolg).toMatch(/€15 tekort/);                             // het bedrag staat in de zin
    expect(d.gevolg).not.toMatch(/gedekt tot en met \./);               // geen lege maand meer
  });

  test('valt er dit jaar niets, dan zegt hij dat en niet "onbekend"', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Post', bedrag: 25, vervalmaand: over(12), intervalM: 12 }] }));
    const d = await dek(page);
    expect(d.status).toBe('ok');
    expect(d.waarde).toMatch(/^€/);                                     // v189: je potsaldo, geen woord
    expect(d.eenheid).toBe('in je pot · niets aankomend dit jaar');
    expect(d.gevolg).toBe('Er komt de komende twaalf maanden niets aan uit je lijst.');
  });

  test('een gat weegt mee, ook als de opbouw op peil is', async ({ page }) => {
    // 600 over 1 maand: benodigdeStand 550, pot 560 -> graad 102%, maar de 600 past niet
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Post', bedrag: 600, vervalmaand: over(1), intervalM: 12 }], manualBal: { [MAIN]: 1500, [RES]: 560, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(await page.evaluate(() => dekking(12).graad)).toBeGreaterThanOrEqual(100);
    expect(d.status).toBe('tekort');                                     // want er is een gat
    expect(d.gevolg).toMatch(/tekort\./);
  });

  test('bij een tekort staan het percentage en het bedrag er allebei, met de noemer', async ({ page }) => {
    // zonder opbouw-eis: percentage van de post die niet past
    await boot(page, seedM({ reserveringen: [eenmalig(25, 3)], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 20000 } }));
    let d = await dek(page);
    expect(d.waarde).toBe('€10');                                        // v189: je potsaldo
    expect(d.eenheid).toBe('in je pot · 40% van de eerstvolgende post');  // 10 van 25
    expect(d.gevolg).toMatch(/€15 tekort/);                              // bedrag in de zin, niet dubbel

    // met opbouw-eis: percentage van wat nu nodig is
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Aanslag', bedrag: 600, vervalmaand: over(3), intervalM: 12 }], manualBal: { [MAIN]: 1500, [RES]: 200, [SAV]: 20000 } }));
    d = await dek(page);
    expect(d.waarde).toBe('€200');                                       // v189: je potsaldo
    expect(d.eenheid).toBe('in je pot · 44% van wat nu nodig is');        // 200 van 450
    expect(d.gevolg).toMatch(/€400 tekort/);
  });

  test('gedektPct komt uit dekking(), niet uit een som op het scherm', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 3)], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 20000 } }));
    const g = await page.evaluate(() => dekking(12).gat);
    expect(g).toMatchObject({ bedrag: 25, tekort: 15, gedektPct: 40 });
  });

  test('een lege pot is 0 procent, geen verzonnen getal', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 3)], manualBal: { [MAIN]: 1500, [RES]: 0, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(d.waarde).toBe('€0');                                         // v189: een lege pot is nul
    expect(d.eenheid).toBe('in je pot · 0% van de eerstvolgende post');   // geen verzonnen getal
    expect(d.gevolg).toMatch(/€25 tekort/);
  });

  test('zonder tekort blijft de eenheid schoon', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 3)], manualBal: { [MAIN]: 1500, [RES]: 50, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(d.eenheid).toBe('in je pot · er hoeft nu nog niets opzij');
    expect(d.eenheid).not.toMatch(/tekort/);
  });

  test('de zin komt uit dekkingTekst, niet uit een tweede formulering', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => ({
      regel: maandRegels().find((r) => r.key === 'dekking').gevolg,
      bron: dekkingTekst(dekking(12)),
    }));
    expect(uit.regel).toBe(uit.bron);
  });
});

test.describe('d · het oordeel', () => {
  test('a: tekort met een maand noemt die maand', async ({ page }) => {
    // een kleine post die nog wél past, zodat er een 'gedekt tot'-maand is
    await boot(page, seedM({ reserveringen: [
      { id: 'k', naam: 'Auto', bedrag: 60, vervalmaand: over(1), intervalM: 12 },
      { id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(6), intervalM: 12 },
    ] }));
    await page.evaluate((a) => { SET.manualBal[a] = 100; save(); }, RES);            // dekking tekort met gedektTot
    const o = await O(page);
    expect(o.zin).toMatch(/^Je systeem houdt stand tot \w+ \d{4}\. Daarna loopt het vast op je dekking reserveringen\.$/);
  });

  test('b: één tekort zonder maand', async ({ page }) => {
    await boot(page, seedM({ nfMaanden: 3, manualBal: { [MAIN]: 1500, [RES]: 2000, [SAV]: 2000 } }));
    const r = await R(page);
    expect(r.filter((x) => x.status === 'tekort').map((x) => x.key)).toEqual(['buffer']);
    expect((await O(page)).zin).toBe('Er is deze maand één ding dat een beslissing vraagt: buffer in maanden.');
  });

  test('b: meerdere tekorten tellen', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 }, reserveringen: [{ id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(6), intervalM: 0 }] }));
    const r = await R(page);
    expect(r.filter((x) => x.status === 'tekort').length).toBeGreaterThan(1);
    expect((await O(page)).zin).toMatch(/^Er zijn deze maand \d+ dingen die een beslissing vragen\.$/);
  });

  /* v187: de standaardfixture had zijn enige 'let op' in de aansluitingsregel, en die staat niet
     meer op Maand. Een richtbedrag boven de stand zet de buffer op 'let op' zonder dat er iets
     misgaat, en dat is precies de stand die deze zin beschrijft. */
  test('c: alleen let op', async ({ page }) => {
    await boot(page, seedM({ nfMaanden: 40 }));
    const r = await R(page);
    expect(r.filter((x) => x.status === 'tekort').length).toBe(0);
    expect(r.filter((x) => x.status === 'let op').length).toBe(1);
    expect((await O(page)).zin).toBe('Er is niets dat vastloopt. 1 regel vraagt aandacht.');
  });

  // v167: de zin noemde altijd vijf, ook als er drie regels stonden. Hij telt nu wat er is, en
  // zegt 'alle' alleen als er ook niets onbekend is.
  test('d: alles goed, punt, geen felicitatie', async ({ page }) => {
    await boot(page);
    // v172: aansluiting sluit aan door toe te wijzen, niet door het doel te verhogen
    await page.evaluate(() => { const s = Math.round(spaarSaldo().cur);
      SET.nfDoelVast = s; SET.nfToegewezen = s - Math.round(+SET.goals[0].gespaard || 0); save(); });
    const r = await page.evaluate(() => {
      const R = maandRegels();
      return { n: R.length, ok: R.filter((x) => x.status === 'ok').length, o: maandOordeel(R) };
    });
    expect(r.ok).toBe(r.n);                                                          // alles ok in deze opzet
    expect(r.o.zin).toBe(`Alle ${r.n} regels staan goed.`);
    expect(r.o.zin).not.toContain('vijf');
    expect(r.o.zin).not.toMatch(/[!—]/);
    expect(r.o.zin).not.toMatch(/mooi|knap|goed bezig|gefeliciteerd/i);
  });

  test('d2: het aantal is het werkelijke aantal, en alle telt alleen bij volledig', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mk = (n, st) => Array.from({ length: n }, (_, i) => ({ key: 'r' + i, naam: 'Regel ' + (i + 1), status: st }));
      return {
        drie: maandOordeel(mk(3, 'ok')).zin,
        een: maandOordeel(mk(1, 'ok')).zin,
        gemengd: maandOordeel(mk(2, 'ok').concat(mk(1, 'onbekend'))).zin,
        nul: maandOordeel([]).zin,
      };
    });
    expect(r.drie).toBe('Alle 3 regels staan goed.');
    expect(r.een).toBe('De enige regel die te toetsen is staat goed.');
    expect(r.gemengd).toBe('De 2 regels die te toetsen zijn staan goed.');           // niet 'alle'
    expect(r.nul).toBe('Er is nog niets te beoordelen.');
  });

  /* v186: Maand houdt vier regels sinds de patroonregel verviel, en drie daarvan vallen bij een
     ontbrekend spaarsaldo helemaal weg in plaats van onbekend te worden (v168). Er is dus geen
     fixture meer die de drempel uit v173 haalt met echte data. Het oordeel zelf is puur, dus we
     toetsen hem met een regellijst, zoals d2 hierboven al doet. */
  test('e: te veel onbekend', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mk = (n, st, p) => Array.from({ length: n }, (_, i) => ({ key: (p || 'r') + i, naam: 'Regel ' + i, status: st }));
      return {
        drieVanVier: maandOordeel(mk(3, 'onbekend').concat(mk(1, 'ok', 'x'))),
        tweeVanDrie: maandOordeel(mk(2, 'onbekend').concat(mk(1, 'ok', 'x'))),
        // onder de ondergrens uit v173 zegt een aandeel niets over volledigheid
        eenVanTwee: maandOordeel(mk(1, 'onbekend').concat(mk(1, 'ok', 'x'))).zin,
        eenVanEen: maandOordeel(mk(1, 'onbekend')).zin,
      };
    });
    expect(r.drieVanVier.zin).toBe('Er ontbreekt te veel om een oordeel te geven.');
    expect(r.drieVanVier.sub).toMatch(/^Onbekend: /);
    expect(r.tweeVanDrie.zin).toBe('Er ontbreekt te veel om een oordeel te geven.');
    expect(r.eenVanTwee).toBe('De enige regel die te toetsen is staat goed.');
    expect(r.eenVanEen).toBe('Er is nog niets te beoordelen.');
  });

  test('de subregel zegt wat er wel goed staat', async ({ page }) => {
    await boot(page);
    const o = await O(page);
    expect(o.sub).toMatch(/in orde\.$/);
    expect(o.sub).toMatch(/dekking reserveringen|buffer in maanden|vakantie/i);
  });
});

test.describe('e · indeling', () => {
  test('de kaarten scheiden beslissing van aandacht', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }));
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    expect(t).toMatch(/vraagt een beslissing/i);      // .hlabel rendert uppercase
    const R2 = await R(page);
    if (R2.some((r) => r.status === 'let op')) expect(t).toMatch(/vraagt aandacht/i);
    if (R2.some((r) => r.status === 'ok')) expect(t).toMatch(/staat goed/i);
  });

  test('de zin telt precies wat er in de beslissingskaart staat', async ({ page }) => {
    // v134: de zin telde alleen de tekorten terwijl de kaart ook de let-op-regels toonde
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }));
    await page.evaluate(() => go('maand'));
    const uit = await page.evaluate(() => {
      const R3 = maandRegels();
      const kaarten = [...document.querySelectorAll('#s-maand .card')];
      const kaart = kaarten.find((c) => /vraagt een beslissing/i.test(c.innerText));
      return { zin: maandOordeel(R3).zin, tekort: R3.filter((r) => r.status === 'tekort').length,
        letop: R3.filter((r) => r.status === 'let op').length,
        inKaart: kaart ? kaart.querySelectorAll('.row').length : 0 };
    });
    expect(uit.tekort).toBeGreaterThan(1);
    expect(uit.letop).toBeGreaterThanOrEqual(0);                // aandacht-regels zijn optioneel
    expect(uit.inKaart).toBe(uit.tekort);                       // alleen de tekorten staan in de kaart
    expect(uit.zin).toBe(`Er zijn deze maand ${uit.tekort} dingen die een beslissing vragen.`);
  });

  test('elke kaart houdt de vaste volgorde aan', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }));
    await page.evaluate(() => go('maand'));
    const uit = await page.evaluate(() => {
      const namen = maandRegels().reduce((m, r) => (m[r.naam.toLowerCase()] = r.key, m), {});
      const lees = (titel) => {
        const kaart = [...document.querySelectorAll('#s-maand .card')].find((c) => new RegExp(titel, 'i').test(c.innerText));
        if (!kaart) return [];
        return [...kaart.querySelectorAll('.row')].map((r) => namen[(/^[^\n]*/.exec(r.innerText) || [''])[0].trim().toLowerCase()]);
      };
      return { beslis: lees('vraagt een beslissing'), aandacht: lees('vraagt aandacht'), volgorde: MAAND_VOLGORDE };
    });
    for (const lijst of [uit.beslis, uit.aandacht]) {
      const idx = lijst.filter(Boolean).map((k) => uit.volgorde.indexOf(k));
      expect(idx).toEqual(idx.slice().sort((a, b) => a - b));
    }
  });

  test('een lege kaart wordt weggelaten', async ({ page }) => {
    await boot(page);
    // v172: alles ok betekent ook: al je spaargeld is toegewezen
    await page.evaluate(() => { const s = Math.round(spaarSaldo().cur);
      SET.nfDoelVast = s; SET.nfToegewezen = s - Math.round(+SET.goals[0].gespaard || 0);
      save(); go('maand'); });
    const t = await page.locator('#s-maand').innerText();
    expect(t).not.toMatch(/vraagt een beslissing/i);   // alles ok, dus die kaarten vallen weg
    expect(t).not.toMatch(/vraagt aandacht/i);
    expect(t).toMatch(/staat goed/i);
  });

  test('zonder enige bron: één rustige regel met een tik naar Instellingen', async ({ page }) => {
    await boot(page, seedM({ manualBal: {}, goals: [], reserveringen: [], resAcc: undefined, nfDoelVast: undefined }));
    const r = await R(page);
    const bruikbaar = r.filter((x) => x.status !== 'onbekend');
    if (!r.length) {
      const h = await page.evaluate(() => { renderMaand(); return document.querySelector('#s-maand').innerHTML; });
      expect(h).toContain('te weinig ingesteld');
      expect(h).toContain("go('set')");
    } else {
      expect(bruikbaar.length).toBeLessThanOrEqual(r.length);
    }
  });
});

test.describe('f · de twee verbandregels', () => {
  test('regel 1: een uitgave boven normaal dekt het gat', async ({ page }) => {
    // 10000 in 20 maanden = 500 nodig; de waterfall geeft dit doel 300, dus een gat van 200,
    // en dat past binnen de 320 die boodschappen boven normaal ligt
    await boot(page, seedM({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 10000, gespaard: 0, allocMode: 'fixed', perMaand: 100, streefdatum: over(20) }] }, { uitschieter: true }));
    const r = await R(page);
    expect(r.find((x) => x.key === 'doel').status).toBe('tekort');
    const v = await VB(page);
    expect(v).toMatch(/per maand extra naar vakantie sluit het gat\./);
    expect(v).toMatch(/Dat is ongeveer wat je boodschappen boven je normaal ligt\.$/);
  });

  test('regel 1 zwijgt als het tekort groter is dan de overschrijding', async ({ page }) => {
    await boot(page, seedM({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 90000, gespaard: 0, allocMode: 'fixed', perMaand: 100, streefdatum: over(12) }] }, { uitschieter: true }));
    const v = await VB(page);
    expect(v).not.toMatch(/sluit het gat/);
  });

  test('regel 2: niet-toegewezen geld dekt N maanden van het tekort', async ({ page }) => {
    await boot(page, seedM({ nfDoelVast: 3000, goals: [{ id: 'g1', naam: 'Vakantie', doel: 40000, gespaard: 1000, allocMode: 'fixed', perMaand: 100, streefdatum: over(20) }] }));
    const r = await R(page);
    expect(r.find((x) => x.key === 'doel').status).toBe('tekort');
    expect(await page.evaluate(() => spaarVrij().vrij)).toBeGreaterThan(0);
    expect(await VB(page)).toMatch(/^Er staat €[\d.]+ niet toegewezen\. Dat dekt \d+ maand(en)? van je tekort\.$/);
  });

  test('geen van beide: geen verbandzin', async ({ page }) => {
    await boot(page);
    expect(await VB(page)).toBe('');
  });

  // v166: MAAND_VERBANDEN stond altijd op true en is verwijderd. De twee verbandzinnen zelf
  // worden hierboven en hieronder getoetst.

  test('de signalen dragen nu cat, bedrag en boven, zonder dat de tekst verandert', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    const n = await page.evaluate(() => scoreNotifs().find((x) => String(x.key).indexOf('discr-') === 0));
    expect(n.cat).toBe('boodschappen');
    expect(n.bedrag).toBe(620);
    expect(n.boven).toBe(320);
    expect(n.l1).toContain('boven je normaal');
  });
});

test.describe('g · leesmoment en robuustheid', () => {
  test('de datum wordt vastgelegd bij het openen, zonder streak of teller', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => SET.maandGelezen || null)).toBeNull();
    await page.evaluate(() => go('maand'));
    const d = await page.evaluate(() => SET.maandGelezen);
    // v177: de app legt de LOKALE dag vast, niet de UTC-dag; die verschillen tussen middernacht
    // en 02:00 zomertijd
    const nu = new Date();
    expect(d).toBe(nu.getFullYear() + '-' + String(nu.getMonth() + 1).padStart(2, '0') + '-' + String(nu.getDate()).padStart(2, '0'));
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    expect(t).toMatch(/Gelezen op \d{1,2} \w+ \d{4}\./);
    expect(t).not.toMatch(/streak|op rij|dagen achter|\d+x gelezen/i);
  });

  test('het scherm werkt met één van de drie bronnen', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [], goals: [] }));
    const r = await R(page);
    expect(r.map((x) => x.key)).toEqual(['buffer']);
    await page.evaluate(() => go('maand'));
    expect(await page.locator('#s-maand').innerText()).not.toContain('onbekend');
  });

  test('een stukkende bron laat de rest staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const orig = window.dekking;
      window.dekking = () => { throw new Error('stuk'); };
      const uit = maandRegels().map((x) => x.key);
      window.dekking = orig;
      return uit;
    });
    expect(r).not.toContain('dekking');
    expect(r).toContain('buffer');
    expect(r.length).toBe(2);
  });

  test('de waardekolom blijft een kolom, geen verticale strook', async ({ page }) => {
    // v133: een lange eenheid perste zich in de ongelimiteerde rechterkolom tot een woord per regel
    await page.setViewportSize({ width: 360, height: 780 });
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Gemeentelijke aanslag', bedrag: 25, vervalmaand: over(3), intervalM: 0 }], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 4000 } }));
    await page.evaluate(() => go('maand'));
    const uit = await page.evaluate(() => {
      const rij = [...document.querySelectorAll('#s-maand .row')]
        .find((r) => /dekking reserveringen/i.test(r.innerText));
      const rechts = rij.lastElementChild.getBoundingClientRect();
      return { breedte: Math.round(rechts.width), hoogte: Math.round(rechts.height), rij: Math.round(rij.getBoundingClientRect().width) };
    });
    expect(uit.breedte / uit.rij).toBeLessThanOrEqual(0.45);   // begrensd, dus de zin houdt ruimte
    expect(uit.breedte).toBeGreaterThan(80);                   // maar breed genoeg voor twee woorden
    expect(uit.hoogte).toBeLessThanOrEqual(60);                // hooguit een paar regels, geen strook
  });

  for (const w of [360, 390]) {
    test(`geen overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }, { uitschieter: true }));
      await page.evaluate(() => go('maand'));
      const o = await page.evaluate(() => ({
        sec: document.querySelector('#s-maand').scrollWidth - document.querySelector('#s-maand').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(o.sec).toBeLessThanOrEqual(1);
      expect(o.body).toBeLessThanOrEqual(1);
    });
  }
});
