// v126: de aansluiting tussen je spaarsaldo en je doelen hing volledig aan de aanwezigheid van een
// noodfonds-item. spaarVrijLine en spaarOverLine werden binnen de plan-rij gerenderd en begonnen
// met `if(!p||p.type!=='noodfonds') return ''`, en spaarVrij() bailde op `!(doel>0)`. Zonder
// noodfondsitem, of zodra het gepauzeerd, bereikt of uit het plan was, verdween de controle
// geruisloos - precies wanneer je buffer op peil is en alles naar je doelen gaat. Nu op planniveau.
// Onderweg gecorrigeerd: spaarOver() rekende bij doel 0 met nf = saved, waardoor over gelijk werd
// aan toegewezen en dus altijd positief. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';

// spaarsaldo 8000 (via de gemarkeerde spaarrekening), doelen en noodfonds instelbaar
function seedSp(set = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 's1', date: `${CUR}-02`, amount: 100, acc: SAV, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] },
  ];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, vooruitDoelOpen: true,
      manualBal: { [MAIN]: 1000, [SAV]: 8000 },
      goals: [{ id: 'g1', naam: 'Aankoop', doel: 9000, gespaard: 3000, allocMode: 'fixed', perMaand: 100 }],
    }, set)),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedSp());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof spaarVrijLine === 'function');
}

const meting = (page) => page.evaluate(() => ({ vrij: spaarVrij(), over: spaarOver() }));
const regels = (page) => page.evaluate(() => {
  const P = allocatePlan();
  const kaal = (h) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { vrij: kaal(spaarVrijLine(P)), over: kaal(spaarOverLine(P)) };
});

test.describe('a · de guards zijn weg', () => {
  test('de regels nemen alleen nog het plan aan, geen item', async ({ page }) => {
    await boot(page);
    const arity = await page.evaluate(() => [spaarVrijLine.length, spaarOverLine.length]);
    expect(arity).toEqual([1, 1]);
  });

  test('zonder noodfonds-doel rekent spaarVrij gewoon door', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));   // ongeldig -> geen vast doel
    const m = await meting(page);
    expect(m.vrij.doel).toBe(0);
    expect(m.vrij.vrij).toBe(5000);                 // 8000 saldo - 3000 toegewezen
  });

  test('en spaarOver meldt dan geen tekort dat er niet is', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));
    const m = await meting(page);
    expect(m.over.nf).toBe(0);                      // v126: was `saved`, dus over === toegewezen
    expect(m.over.over).toBe(0);
  });

  test('met een noodfonds-doel blijft het gedrag exact gelijk', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 6000 }));
    const m = await meting(page);
    expect(m.vrij.doel).toBe(6000);
    expect(m.vrij.vrij).toBe(0);                    // 8000 - 6000 - 3000 < 0, geklemd
    expect(m.over.nf).toBe(6000);                   // min(saved, doel), ongewijzigd
    expect(m.over.over).toBe(1000);                 // 6000 + 3000 - 8000
  });
});

test.describe('b · de regels staan op planniveau', () => {
  test('zonder noodfondsitem in het plan blijft de melding staan', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));
    await page.evaluate(() => go('vooruit'));
    await page.waitForSelector('.plan-item');
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('€5.000 van je spaargeld hoort nog bij geen enkel doel.');
    // en hij hangt niet meer binnen een plan-rij
    const binnenRij = await page.evaluate(() => !!document.querySelector('.plan-item .spaar-vrij'));
    expect(binnenRij).toBe(false);
    expect(await page.evaluate(() => !!document.querySelector('.spaar-vrij'))).toBe(true);
  });

  test('een gepauzeerd noodfonds laat de melding staan', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 6000, goals: [{ id: 'g1', naam: 'Aankoop', doel: 9000, gespaard: 3000, allocMode: 'fixed', perMaand: 100 }], planPaused: { noodfonds: true } }));
    const st = await page.evaluate(() => allocatePlan().find((x) => x.id === 'noodfonds').status);
    expect(st).toBe('gepauzeerd');
    await page.evaluate(() => go('vooruit'));
    await page.waitForSelector('.plan-item');
    expect(await page.locator('#s-vooruit').innerText()).toMatch(/zit nu bij twee doelen tegelijk/);
  });

  test('een bereikt noodfonds ook', async ({ page }) => {
    // doel 2000, saldo 8000 -> noodfonds bereikt, en 3000 vrij naast het doel van 3000
    await boot(page, seedSp({ nfDoelVast: 2000 }));
    const st = await page.evaluate(() => allocatePlan().find((x) => x.id === 'noodfonds').status);
    expect(st).toBe('bereikt');
    await page.evaluate(() => go('vooruit'));
    await page.waitForSelector('.plan-item');
    expect(await page.locator('#s-vooruit').innerText()).toContain('staat boven je noodfonds-doel');
  });

  test('de regel staat boven de rijen, naast de andere plan-brede regels', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));
    await page.evaluate(() => go('vooruit'));
    await page.waitForSelector('.spaar-vrij');
    const volgorde = await page.evaluate(() => {
      const box = document.querySelector('#s-vooruit');
      const v = box.querySelector('.spaar-vrij'), r = box.querySelector('.plan-item');
      return v.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING ? 'regel eerst' : 'rij eerst';
    });
    expect(volgorde).toBe('regel eerst');
  });
});

test.describe('c · de teksten', () => {
  test('vrij, zonder noodfonds', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));
    expect((await regels(page)).vrij).toContain('€5.000 van je spaargeld hoort nog bij geen enkel doel.');
  });

  test('vrij, zonder noodfonds, in rustig', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1, mode: 'rustig' }));
    expect((await regels(page)).vrij).toContain('€5.000 hoort nog bij geen enkel doel.');
  });

  test('vrij, met noodfonds: ongewijzigd', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 2000 }));
    expect((await regels(page)).vrij).toContain('staat boven je noodfonds-doel');
  });

  test('over, zonder noodfonds', async ({ page }) => {
    // saldo 8000, doel claimt 9000 -> 1000 te veel, zonder noodfonds
    await boot(page, seedSp({ nfDoelVast: -1, goals: [{ id: 'g1', naam: 'Aankoop', doel: 12000, gespaard: 9000, allocMode: 'fixed', perMaand: 100 }] }));
    const m = await meting(page);
    expect(m.over.over).toBe(1000);
    const t = (await regels(page)).over;
    expect(t).toContain('Je doelen claimen samen €9.000, terwijl er €8.000 op je spaarrekening staat.');
    expect(t).not.toContain('noodfonds');
  });

  test('over, zonder noodfonds, in rustig', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1, mode: 'rustig', goals: [{ id: 'g1', naam: 'Aankoop', doel: 12000, gespaard: 9000, allocMode: 'fixed', perMaand: 100 }] }));
    expect((await regels(page)).over).toContain('Je doelen claimen €1.000 meer dan er staat.');
  });

  test('geen uitroeptekens of em-dashes', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));
    const r = await regels(page);
    expect(r.vrij + r.over).not.toMatch(/[!—]/);
  });
});

test.describe('d · randgevallen', () => {
  test('vrij en over zijn nooit tegelijk positief', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const combis = [[-1, 3000], [2000, 3000], [6000, 3000], [-1, 9000], [12000, 1000]];
      return combis.map(([d, g]) => {
        SET.nfDoelVast = d; SET.goals[0].gespaard = g; SET.goals[0].doel = Math.max(g, 12000); save();
        const V = spaarVrij(), O = spaarOver();
        return [V.vrij > 0, O.over > 0];
      });
    });
    for (const [v, o] of uit) expect(v && o).toBe(false);
  });

  test('geen enkel doel: het hele saldo is vrij, zonder toewijs-link', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1, goals: [] }));
    const m = await meting(page);
    expect(m.vrij.vrij).toBe(8000);
    expect(await page.evaluate(() => spaarVrijDoel(allocatePlan()))).toBeNull();
    const h = await page.evaluate(() => spaarVrijLine(allocatePlan()));
    expect(h).toContain('hoort nog bij geen enkel doel');
    expect(h).not.toContain('spaarVrijToe');           // geen toewijs-link
    expect(h).toContain('openGoal');                   // wel de uitnodiging een doel te maken
  });

  test('onbekend saldo: beide regels zwijgen', async ({ page }) => {
    await boot(page, seedSp({ manualBal: { [MAIN]: 1000 } }));
    const m = await meting(page);
    expect(m.vrij.vrij).toBe(0);
    expect(m.over.over).toBe(0);
    const r = await regels(page);
    expect(r.vrij).toBe('');
    expect(r.over).toBe('');
  });
});

test.describe('e · oplossen blijft zoals het was', () => {
  test('spaarVrijToe werkt ook zonder noodfonds', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: -1 }));
    await page.evaluate(() => spaarVrijToe('g1'));
    const uit = await page.evaluate(() => ({ g: SET.goals[0].gespaard, v: spaarVrij().vrij }));
    expect(uit.g).toBe(8000);                          // 3000 + de 5000 die vrij stond
    expect(uit.v).toBe(0);
  });

  test('spaarOverAf haalt het teveel van onderaf weg', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 6000 }));
    expect((await meting(page)).over.over).toBe(1000);
    await page.evaluate(() => spaarOverAf());
    const uit = await page.evaluate(() => ({ g: SET.goals[0].gespaard, o: spaarOver().over }));
    expect(uit.g).toBe(2000);
    expect(uit.o).toBe(0);
  });
});
