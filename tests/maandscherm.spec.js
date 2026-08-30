// v130: één scherm dat je één keer per maand opent, met de vijf getallen die samen zeggen of je
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

test.describe('b · de vijf regels', () => {
  test('alle vijf staan er, in de vaste volgorde', async ({ page }) => {
    await boot(page);
    expect((await R(page)).map((r) => r.key)).toEqual(['dekking', 'buffer', 'aansluiting', 'doel', 'patroon']);
  });

  test('de bronnen komen uit de bestaande functies', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const rr = maandRegels();
      const D = dekking(12), bm = bufferMaanden(), V = spaarVrij();
      return { dekGraad: D.graad, regelDek: rr.find((r) => r.key === 'dekking').waarde,
        bm: Math.round(bm * 10) / 10, regelBuf: rr.find((r) => r.key === 'buffer').waarde, vrij: V.vrij };
    });
    expect(uit.regelDek).toBe(uit.dekGraad + '%');
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

  test('aansluiting: let op bij een verschil, ok bij nul', async ({ page }) => {
    await boot(page);
    const meet = async () => (await R(page)).find((r) => r.key === 'aansluiting').status;
    expect(await meet()).toBe('let op');                                            // 20000 spaar, 3000 nf, 1000 doel
    await page.evaluate(() => { SET.nfDoelVast = 19000; SET.goals[0].gespaard = 1000; save(); });
    expect(await meet()).toBe('ok');
  });

  test('aankoopdoel: tekort bij een gat, ok zonder, onbekend zonder streefdatum', async ({ page }) => {
    await boot(page);
    expect((await R(page)).find((r) => r.key === 'doel').status).toBe('ok');
    await page.evaluate(() => { SET.goals[0].streefdatum = SET.goals[0].streefdatum; SET.goals[0].doel = 40000; save(); });
    expect((await R(page)).find((r) => r.key === 'doel').status).toBe('tekort');
    await page.evaluate(() => { delete SET.goals[0].streefdatum; save(); });
    expect((await R(page)).some((r) => r.key === 'doel')).toBe(false);               // geen streefdatum: geen regel
  });

  test('patroon: let op bij een signaal, ok zonder', async ({ page }) => {
    await boot(page);
    expect((await R(page)).find((r) => r.key === 'patroon').status).toBe('ok');
    await boot(page, seedM({}, { uitschieter: true }));
    const p = (await R(page)).find((r) => r.key === 'patroon');
    expect(p.status).toBe('let op');
    expect(p.eenheid).toMatch(/boven je normaal/);
  });

  test('alleen uitgavenpatronen tellen, geen incasso of saldo-nudge', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    const k = await page.evaluate(() => (maandPatroon() || {}).key || '');
    expect(k).toMatch(/^(budget-|discr-|tempo)/);
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

  test('c: alleen let op', async ({ page }) => {
    await boot(page);
    const o = await O(page);
    expect(o.zin).toBe('Er is niets dat vastloopt. 1 regel vraagt aandacht.');
  });

  test('d: alles goed, punt, geen felicitatie', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.nfDoelVast = 19000; save(); });                  // aansluiting sluit aan
    const o = await O(page);
    expect(o.zin).toBe('Alle vijf de regels staan goed.');
    expect(o.zin).not.toMatch(/[!—]/);
    expect(o.zin).not.toMatch(/mooi|knap|goed bezig|gefeliciteerd/i);
  });

  test('e: te veel onbekend', async ({ page }) => {
    // geen spaarsaldo -> buffer en aansluiting vallen weg; geen potsaldo -> dekking onbekend;
    // een streefdatum in de lopende maand -> doelTempo geeft null, dus doel onbekend
    await boot(page, seedM({ manualBal: { [MAIN]: 1500 },
      goals: [{ id: 'g1', naam: 'Vakantie', doel: 2000, gespaard: 0, allocMode: 'fixed', perMaand: 100, streefdatum: CUR }] }));
    const r = await R(page);
    const onb = r.filter((x) => x.status === 'onbekend').length;
    expect(onb).toBeGreaterThan(r.length / 2);
    const o = await O(page);
    expect(o.zin).toBe('Er ontbreekt te veel om een oordeel te geven.');
    expect(o.sub).toMatch(/^Onbekend: /);
  });

  test('de subregel zegt wat er wel goed staat', async ({ page }) => {
    await boot(page);
    const o = await O(page);
    expect(o.sub).toMatch(/in orde\.$/);
    expect(o.sub).toMatch(/dekking reserveringen|buffer in maanden|vakantie|patroon/i);
  });
});

test.describe('e · indeling', () => {
  test('twee kaarten, gesorteerd op ernst en daarna op vaste volgorde', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }));
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    expect(t).toMatch(/vraagt een beslissing/i);      // .hlabel rendert uppercase
    expect(t).toMatch(/staat goed/i);
    const volgorde = await page.evaluate(() => {
      const R2 = maandRegels().filter((r) => r.status === 'tekort' || r.status === 'let op')
        .sort((a, b) => MAAND_ERNST[a.status] - MAAND_ERNST[b.status] || MAAND_VOLGORDE.indexOf(a.key) - MAAND_VOLGORDE.indexOf(b.key));
      return R2.map((r) => r.status + ':' + r.key);
    });
    const eersteLetop = volgorde.findIndex((x) => x.startsWith('let op'));
    const laatsteTekort = volgorde.map((x) => x.startsWith('tekort')).lastIndexOf(true);
    if (eersteLetop >= 0 && laatsteTekort >= 0) expect(laatsteTekort).toBeLessThan(eersteLetop);
  });

  test('een lege kaart wordt weggelaten', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.nfDoelVast = 19000; save(); go('maand'); });
    const t = await page.locator('#s-maand').innerText();
    expect(t).not.toMatch(/vraagt een beslissing/i);   // alles ok, dus die kaart valt weg
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

  test('één constante zet ze allebei uit', async ({ page }) => {
    await boot(page, seedM({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 10000, gespaard: 0, allocMode: 'fixed', perMaand: 100, streefdatum: over(20) }] }, { uitschieter: true }));
    expect(await VB(page)).not.toBe('');
    const uit = await page.evaluate(() => ({
      vlag: typeof MAAND_VERBANDEN,
      aan: MAAND_VERBANDEN === true,
      guard: /^[^\n]*\n[^\n]*MAAND_VERBANDEN/.test(String(maandVerband)),
    }));
    expect(uit).toEqual({ vlag: 'boolean', aan: true, guard: true });   // één vlag, meteen bovenaan
  });

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
    expect(d).toBe(new Date().toISOString().slice(0, 10));
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    expect(t).toMatch(/Gelezen op \d{1,2} \w+ \d{4}\./);
    expect(t).not.toMatch(/streak|op rij|dagen achter|\d+x gelezen/i);
  });

  test('het scherm werkt met drie van de vijf bronnen', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [], goals: [] }));
    const r = await R(page);
    expect(r.map((x) => x.key)).toEqual(['buffer', 'aansluiting', 'patroon']);
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
    expect(r.length).toBe(4);
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
