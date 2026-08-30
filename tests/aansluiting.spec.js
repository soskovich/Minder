// v125: buffer en aankoopdoel op één fysieke spaarrekening maken de verdeling in Minder een
// subadministratie op een echt banksaldo. aansluiting() toetst of die twee gelijk zijn: nul betekent
// dat het klopt, alles anders dat er iets verplaatst is zonder toewijzing. Er wordt niets
// automatisch verrekend. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';

// één spaarrekening met 8000 (5000 buffer + 3000 aankoopdoel) naast een betaalrekening
function seedAans(set = {}, opt = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 's1', date: `${CUR}-02`, amount: 100, acc: SAV, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] },
  ];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, setOpen: 'income', vooruitDoelOpen: true,
      manualBal: opt.geenSaldo ? { [MAIN]: 1000 } : { [MAIN]: 1000, [SAV]: 8000 },
      nfDoelVast: 6000,
      goals: [{ id: 'g1', naam: 'Aankoop', doel: 4000, gespaard: 3000, allocMode: 'fixed', perMaand: 100 }],
      planOrder: ['noodfonds', 'g1'],
      aansluitAcc: opt.geenScope ? {} : { [SAV]: true },
      bufferToegewezen: opt.geenBuffer ? undefined : 5000,
    }, set)),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedAans());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof aansluiting === 'function');
}

const A = (page) => page.evaluate(() => aansluiting());

test.describe('a · de rekenregel', () => {
  test('sluit aan als de toewijzingen het saldo dekken', async ({ page }) => {
    await boot(page);
    const a = await A(page);
    expect(a.saldo).toBe(8000);
    expect(a.toegewezen).toBe(8000);            // 5000 buffer + 3000 doel
    expect(a.verschil).toBe(0);
    expect(a.volledig).toBe(true);
  });

  test('positief verschil: geld op de rekening dat nergens bij hoort', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    const a = await A(page);
    expect(a.verschil).toBe(340);
  });

  test('negatief verschil: de administratie claimt meer dan er staat', async ({ page }) => {
    await boot(page, seedAans({ bufferToegewezen: 5180 }));
    const a = await A(page);
    expect(a.verschil).toBe(-180);
  });

  test('alleen rekeningen in scope tellen mee', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate((acc) => {
      const voor = aansluiting().saldo;
      toggleAansluitAcc(acc);                   // betaalrekening erbij
      const na = aansluiting().saldo;
      return { voor, na };
    }, MAIN);
    expect(uit.voor).toBe(8000);
    expect(uit.na).toBe(9000);                  // nu telt de betaalrekening mee
  });

  test('null zonder enige rekening in scope', async ({ page }) => {
    await boot(page, seedAans({}, { geenScope: true }));
    expect(await A(page)).toBeNull();
  });

  test('onbekend saldo: niet volledig, en niets ingevuld', async ({ page }) => {
    await boot(page, seedAans({}, { geenSaldo: true }));
    const a = await A(page);
    expect(a.volledig).toBe(false);
    expect(a.zonder).toEqual([SAV]);
    expect(a.regels.find((r) => r.id === SAV).bedrag).toBeNull();   // geen schatting
  });

  test('geen doelen: het hele saldo staat als niet-toegewezen', async ({ page }) => {
    await boot(page, seedAans({ goals: [], bufferToegewezen: undefined }));
    const a = await A(page);
    expect(a.toegewezen).toBe(0);
    expect(a.verschil).toBe(8000);
  });

  test('negatief saldo wordt niet afgekapt', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: -200 } }));
    const a = await A(page);
    expect(a.saldo).toBe(-200);
    expect(a.verschil).toBe(-8200);
  });
});

test.describe('b · wat wel en niet meetelt', () => {
  test('een bereikt of gepauzeerd doel telt mee zolang er geld in zit', async ({ page }) => {
    await boot(page, seedAans({
      goals: [{ id: 'g1', naam: 'Klaar', doel: 3000, gespaard: 3000, allocMode: 'fixed', perMaand: 100 }],
      planPaused: { g1: true },
    }));
    const p = await page.evaluate(() => allocatePlan().find((x) => x.id === 'g1').status);
    expect(p).toBe('gepauzeerd');
    expect((await A(page)).toegewezen).toBe(8000);   // 5000 + 3000, ondanks de pauze
  });

  test('een aflos-item telt niet mee', async ({ page }) => {
    await boot(page, seedAans({
      debts: [{ id: 'd1', naam: 'Lening', rest: 2000, start: 5000, perMaand: 100, rente: 4 }],
      planOrder: ['noodfonds', 'g1', 'af:d1'],
    }));
    const heeft = await page.evaluate(() => allocatePlan().some((x) => x.type === 'aflossen' && x.gespaard > 0));
    expect(heeft).toBe(true);                        // het aflos-item claimt wel 'gespaard'
    expect((await A(page)).toegewezen).toBe(8000);   // maar telt niet mee in de aansluiting
  });
});

test.describe('c · de buffer als eigen bron', () => {
  test('zonder eigen bedrag blijft de oude afleiding staan', async ({ page }) => {
    await boot(page, seedAans({}, { geenBuffer: true }));
    const uit = await page.evaluate(() => ({
      buffer: bufferToegewezen(),
      nf: allocatePlan().find((x) => x.id === 'noodfonds').gespaard,
      spaar: Math.round(spaarSaldo().cur),
    }));
    expect(uit.buffer).toBeNull();
    expect(uit.nf).toBe(6000);                       // min(spaarsaldo 8000, doel 6000), zoals voorheen
  });

  test('met een eigen bedrag volgt het plan dat bedrag', async ({ page }) => {
    await boot(page);
    const nf = await page.evaluate(() => allocatePlan().find((x) => x.id === 'noodfonds'));
    expect(nf.gespaard).toBe(5000);                  // jouw 5000, niet de afgeleide 6000
    expect(nf.status).not.toBe('bereikt');           // en dus terecht nog niet vol
  });

  test('het plan klemt op het doel, de aansluiting rekent onbeknot', async ({ page }) => {
    await boot(page, seedAans({ bufferToegewezen: 7000, manualBal: { [MAIN]: 1000, [SAV]: 10000 } }));
    const nf = await page.evaluate(() => allocatePlan().find((x) => x.id === 'noodfonds').gespaard);
    expect(nf).toBe(6000);                           // v99: het plan-item klemt op het doel
    expect((await A(page)).toegewezen).toBe(10000);  // 7000 + 3000, anders verdwijnt geld boven je doel
  });
});

test.describe('d · handmatig oplossen, nooit vanzelf', () => {
  test('een positief verschil toewijzen aan een doel', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    await page.evaluate(() => { openAansluiting(); aansluitToe('g1'); });
    const uit = await page.evaluate(() => ({ g: SET.goals[0].gespaard, v: aansluiting().verschil }));
    expect(uit.g).toBe(3340);
    expect(uit.v).toBe(0);
  });

  test('toewijzen aan een doel gaat niet voorbij wat dat doel nog nodig heeft', async ({ page }) => {
    // doel 4000, gespaard 3000 -> rest 1000, maar het verschil is 2000
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 10000 } }));
    await page.evaluate(() => { openAansluiting(); aansluitToe('g1'); });
    const uit = await page.evaluate(() => ({ g: SET.goals[0].gespaard, v: aansluiting().verschil }));
    expect(uit.g).toBe(4000);                        // geklemd op de resterende behoefte (v99)
    expect(uit.v).toBe(1000);                        // de rest blijft zichtbaar staan
  });

  test('een positief verschil aan de buffer toewijzen', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    await page.evaluate(() => { openAansluiting(); aansluitToe('noodfonds'); });
    const uit = await page.evaluate(() => ({ b: bufferToegewezen(), v: aansluiting().verschil }));
    expect(uit.b).toBe(5340);
    expect(uit.v).toBe(0);
  });

  test('een deel toewijzen kan ook', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    await page.evaluate(() => { openAansluiting(); document.getElementById('aanslInp').value = '100'; aansluitToe('noodfonds'); });
    const uit = await page.evaluate(() => ({ b: bufferToegewezen(), v: aansluiting().verschil }));
    expect(uit.b).toBe(5100);
    expect(uit.v).toBe(240);
  });

  test('een negatief verschil corrigeren op een doel', async ({ page }) => {
    await boot(page, seedAans({ bufferToegewezen: 5180 }));
    await page.evaluate(() => { openAansluiting(); aansluitAf('g1'); });
    const uit = await page.evaluate(() => ({ g: SET.goals[0].gespaard, v: aansluiting().verschil }));
    expect(uit.g).toBe(2820);
    expect(uit.v).toBe(0);
  });

  test('corrigeren neemt nooit meer weg dan er in die pot zit', async ({ page }) => {
    await boot(page, seedAans({ goals: [{ id: 'g1', naam: 'Klein', doel: 4000, gespaard: 100, allocMode: 'fixed', perMaand: 50 }], bufferToegewezen: 9000 }));
    expect((await A(page)).verschil).toBe(-1100);
    await page.evaluate(() => { openAansluiting(); aansluitAf('g1'); });
    const uit = await page.evaluate(() => ({ g: SET.goals[0].gespaard, v: aansluiting().verschil }));
    expect(uit.g).toBe(0);
    expect(uit.v).toBe(-1000);                       // de rest blijft staan, niets stil verrekend
  });

  test('een sluitende aansluiting biedt geen knoppen aan', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openAansluiting());
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Je toewijzingen sluiten aan op je saldo.');
    expect(t).not.toContain('Toewijzen aan');
    expect(t).not.toContain('Terugnemen van');
  });

  test('renderen alleen verandert niets', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    const voor = await page.evaluate(() => JSON.stringify({ g: SET.goals, b: SET.bufferToegewezen }));
    await page.evaluate(() => { render(); openAansluiting(); renderAansluitSheet(); go('vooruit'); });
    expect(await page.evaluate(() => JSON.stringify({ g: SET.goals, b: SET.bufferToegewezen }))).toBe(voor);
    expect((await A(page)).verschil).toBe(340);
  });
});

test.describe('e · de weergave', () => {
  test('de regel staat boven het plan en opent de sheet', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    await page.evaluate(() => go('vooruit'));
    await page.waitForSelector('.aansluit');
    expect(await page.locator('.aansluit').innerText()).toContain('€340 meer op je rekening');
    await page.locator('.aansluit').click();
    await page.waitForSelector('#aanslHead');
  });

  test('de sheet toont beide kanten en het verschil', async ({ page }) => {
    await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
    await page.evaluate(() => openAansluiting());
    const t = await page.locator('#sheet').innerText();
    expect(t).toMatch(/toegewezen/i);
    expect(t).toContain('Noodfonds');
    expect(t).toContain('Aankoop');
    expect(t).toContain('Verschil');
    expect(t).toContain('€340');
    expect(t).not.toMatch(/[!—]/);
  });

  test('bij een onbekend saldo wijst de sheet naar de invoer', async ({ page }) => {
    await boot(page, seedAans({}, { geenSaldo: true }));
    await page.evaluate(() => openAansluiting());
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('niet te maken');
    expect(t).toContain('saldo invullen');
    expect(t).not.toMatch(/meer op je rekening|claimen samen/);
  });

  test('zonder scope legt de sheet uit wat je moet aanzetten', async ({ page }) => {
    await boot(page, seedAans({}, { geenScope: true }));
    await page.evaluate(() => openAansluiting());
    expect(await page.locator('#sheet').innerText()).toContain('nog geen rekening in de aansluiting');
    await page.evaluate(() => go('vooruit'));
    expect(await page.locator('#s-vooruit').innerText()).not.toContain('sluiten aan');
  });

  test('de schakelaar staat bij Inkomen & rekeningen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); openSet('income'); });
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('telt mee in de aansluiting');
    expect(t).toContain('Toegewezen aan je noodfonds');
  });

  for (const w of [360, 390]) {
    test(`de sheet past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page, seedAans({ manualBal: { [MAIN]: 1000, [SAV]: 8340 } }));
      await page.evaluate(() => openAansluiting());
      const over = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        return { sheet: el.scrollWidth - el.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('f · geld van de ene pot naar de andere', () => {
  test('verschuiven binnen de administratie laat het verschil op nul', async ({ page }) => {
    await boot(page);
    expect((await A(page)).verschil).toBe(0);
    // 500 van de buffer naar het doel: som blijft gelijk, dus de aansluiting blijft kloppen
    await page.evaluate(() => { SET.bufferToegewezen = 4500; SET.goals[0].gespaard = 3500; save(); });
    const a = await A(page);
    expect(a.toegewezen).toBe(8000);
    expect(a.verschil).toBe(0);
  });

  test('geld van de rekening halen zonder toewijzing valt op', async ({ page }) => {
    await boot(page);
    await page.evaluate((acc) => { setBal(acc, 7700); }, SAV);
    const a = await A(page);
    expect(a.saldo).toBe(7700);
    expect(a.verschil).toBe(-300);                   // de administratie claimt nu meer dan er staat
  });
});
