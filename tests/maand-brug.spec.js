/* v335: de bridge onder de staven op Inzichten ("Over de maanden heen", variant C). Een tik op een
   afgesloten maand toont van het budget (of de maand ervoor) naar wat je uitgaf, stap voor stap.
   Het geval van de gebruiker: september 2026, budget EUR 3.421, Uit eten +194, Vices +103,
   Boodschappen +84, uitgegeven EUR 3.095. De drie potjes eronder (shopping -400, vervoer -207,
   sport -100) zijn gekozen zodat de vierde losse stap een potje eronder is en er een rest
   overblijft om uit te splitsen; de huur (een potje dat precies op zijn bedrag uitkwam) draagt
   geen stap. De klok staat op 4 oktober 2026, zodat september afgesloten is. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111';
const MAANDEN = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const SEP = { uiteten: 494, vices: 303, boodschappen: 784, shopping: 100, vervoer: 193, sport: 50, huur: 1171 };
const SEP_POT = { uiteten: 300, vices: 200, boodschappen: 700, shopping: 500, vervoer: 400, sport: 150, huur: 1171 };
const AUG = { uiteten: 280, vices: 150, boodschappen: 690, shopping: 260, vervoer: 340, sport: 90, huur: 1171 };
const OUD = { uiteten: 250, vices: 120, boodschappen: 650, shopping: 200, vervoer: 300, sport: 80, huur: 1171 };

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, date, amount, name, desc) =>
    tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MAANDEN.concat(['2026-10'])) {
    add('inc' + m, m + '-25', 4000, 'Werkgever', 'SALARIS LOON');
    if (m === '2026-10') continue;
    const P = m === '2026-09' ? (o.sep || SEP) : (m === '2026-08' ? AUG : OUD);
    let d = 3;
    for (const k in P) {
      if (k === 'huur') { add('huur' + m, m + '-01', -P[k], 'Woningcorporatie', 'SEPA INCASSO HUURBETALING'); continue; }
      add(k + m, m + '-' + String(d++).padStart(2, '0'), -P[k], 'Winkel ' + k + ' ' + m, 'BEA, BETAALPAS WINKEL ' + k.toUpperCase() + ' ' + m);
    }
  }
  const hist = o.hist || { '2026-08': Object.assign({}, SEP_POT), '2026-09': Object.assign({}, SEP_POT) };
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4000, budgetMonth: '2026-10', openSpendChart: true,
    manualBal: { [MAIN]: 3000 }, budgets: Object.assign({}, SEP_POT, o.huidig || {}), budgetHist: hist,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o, breed) {
  if (breed) await page.setViewportSize({ width: breed, height: 800 });
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-04');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandBrug === 'function' && typeof TX !== 'undefined');
  // categorize() herschrijft t.id bij de boot, dus de categorie gaat er via de naam op
  await page.evaluate(() => {
    for (const t of TX) {
      const m = /^Winkel (\w+) /.exec(t.name || '');
      if (m) OVR[t.id] = m[1];
      if (t.name === 'Woningcorporatie') OVR[t.id] = 'huur';
    }
    save(); window._brugMaand = null; go('ins'); renderIns();
  });
  await page.waitForSelector('#insSpendChart');
}
const tik = (page, m) => page.locator(`#insSpendChart rect[onclick*="${m}"]`).click();
const stappen = (page) => page.$$eval('[data-brugstap]', (els) => els.map((e) => ({ soort: e.dataset.brugstap, w: +e.dataset.brugwaarde, label: e.innerText.replace(/\s+/g, ' ').trim() })));

test.describe('a - het september-geval', () => {
  test('de invoer draagt het geval: budget 3.421 bewaard, staaf 3.095', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ som: maandPotjesSom(SET.budgetHist['2026-09']), spend: totals('2026-09').spendNorm,
      rc: [...recurringCats()] }));
    expect(r.som).toBe(3421);
    expect(r.spend).toBe(3095);
  });

  test('de stappen tellen op van 3.421 naar 3.095, met de drie potjes erboven voorop', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s[0]).toMatchObject({ soort: 'begin', w: 3421 });
    expect(s[s.length - 1]).toMatchObject({ soort: 'eind', w: 3095 });
    const los = s.filter((x) => x.soort === 'potje');
    expect(los.map((x) => x.w)).toEqual([-400, -207, 194, 103]);       // gesorteerd op grootte van de bijdrage, hooguit vier
    expect(los.length).toBeLessThanOrEqual(4);
    const rest = s.find((x) => x.soort === 'rest');
    expect(rest.w).toBe(84 - 100);
    const tussen = s.slice(1, -1).reduce((a, x) => a + x.w, 0);
    expect(3421 + tussen).toBe(3095);
  });

  test('de bridge eindigt op hetzelfde bedrag als de staaf', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    const lees = await page.locator('#spendRead').innerText();
    expect(lees).toContain('€3.095');
    expect(lees).toContain('€3.421');                                  // de budgetlijn leest de bewaarde potjes
    const s = await stappen(page);
    expect(s[s.length - 1].label).toContain('€3.095');
  });

  test('de zin noemt het verschil en wie het droeg, zonder oordeel', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    const z = await page.locator('[data-brugzin]').innerText();
    expect(z).toContain('€326 onder je budget.');
    expect(z).toContain('Drie potjes gingen er samen €381 boven; de andere bleven €707 onder.');
    expect(z).not.toMatch(/goed|knap|helaas|!/i);
  });

  test('de gekozen staaf draagt het accent, de andere niet', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#insSpendChart rect.cbar[fill="var(--teal)"]').count()).toBe(0);
    await tik(page, '2026-09');
    expect(await page.locator('#insSpendChart rect.cbar[fill="var(--teal)"]').count()).toBe(1);
  });

  test('boven het budget in de kleur voor boven, onder gedempt', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    const k = await page.$$eval('[data-brugstap]', (els) => els.map((e) => ({ w: +e.dataset.brugwaarde, s: e.dataset.brugstap, bg: e.querySelector('i').style.background })));
    for (const x of k.filter((x) => x.s !== 'begin' && x.s !== 'eind')) expect(x.bg).toBe(x.w > 0 ? 'var(--red)' : 'var(--mut2)');
  });

  test('een tweede tik op dezelfde maand sluit de bridge', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    expect(await page.locator('#insBrug').count()).toBe(1);
    await tik(page, '2026-09');
    expect(await page.locator('#insBrug').count()).toBe(0);
  });
});

test.describe('b - de rest splitst uit en telt op tot zijn stap', () => {
  test('een tik toont de andere potjes, en hun som is de stap', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    expect(await page.locator('[data-brugrestlijst]').count()).toBe(0);
    await page.locator('[data-brugrest]').click();
    const rijen = await page.$$eval('[data-brugrestlijst] .row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    expect(rijen.length).toBe(2);
    expect(rijen.join('|')).toMatch(/Boodschappen \+€84/);
    expect(rijen.join('|')).toMatch(/Sport & gezondheid -€100/);
  });
});

test.describe('c - de schakelaar is een weergave', () => {
  test('bij openen staat hij op tegen budget, en een tik schrijft niets naar SET', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await tik(page, '2026-09');
    expect(await page.locator('[data-brugtegen="budget"].on').count()).toBe(1);
    await page.locator('[data-brugtegen="vorige"]').click();
    expect(await page.locator('[data-brugtegen="vorige"].on').count()).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
    // een andere maand kiezen zet hem terug op tegen budget
    await tik(page, '2026-08');
    expect(await page.locator('[data-brugtegen="budget"].on').count()).toBe(1);
  });

  test('tegen vorige maand: van augustus naar september, de stappen tellen op', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    await page.locator('[data-brugtegen="vorige"]').click();
    const s = await stappen(page);
    const aug = await page.evaluate(() => Math.round(totals('2026-08').spendNorm));
    expect(s[0]).toMatchObject({ soort: 'begin', w: aug });
    expect(s[s.length - 1]).toMatchObject({ soort: 'eind', w: 3095 });
    expect(aug + s.slice(1, -1).reduce((a, x) => a + x.w, 0)).toBe(3095);
    const z = await page.locator('[data-brugzin]').innerText();
    expect(z).toContain(`${'€' + (3095 - aug).toLocaleString('nl-NL')} meer dan augustus.`);
    expect(z).toMatch(/Het grootste verschil zat in Boodschappen|Het grootste verschil zat in Uit eten/);
  });

  test('de eerste maand heeft geen vorige: de knop staat uit', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-03');
    expect(await page.locator('[data-brugtegen="vorige"].off').count()).toBe(1);
    expect(await page.locator('[data-brugtegen="vorige"][onclick]').count()).toBe(0);
  });
});

test.describe('d - een maand van voor v309', () => {
  test('juli rekent tegen de huidige potjes en zegt dat erbij', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-07');
    expect(await page.locator('[data-brughuidig]').innerText()).toContain('Tegen je huidige potjes');
    const s = await stappen(page);
    expect(s[0].w).toBe(3421);                                         // SET.budgets van nu
    expect(s[s.length - 1].w).toBe(Object.values(OUD).reduce((a, b) => a + b, 0));
  });

  test('september met bewaarde bedragen draagt die melding niet', async ({ page }) => {
    await boot(page);
    await tik(page, '2026-09');
    expect(await page.locator('[data-brughuidig]').count()).toBe(0);
  });

  test('de bewaarde bedragen winnen van de huidige potjes, in de bridge en in de staaf', async ({ page }) => {
    await boot(page, { huidig: { shopping: 900 } });                  // nu 400 meer dan in september
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s[0].w).toBe(3421);
    expect(await page.locator('#spendRead').innerText()).toContain('van €3.421');
    // juli heeft geen bewaarde bedragen en volgt dus wel de huidige
    await tik(page, '2026-07');
    expect((await stappen(page))[0].w).toBe(3821);
  });
});

test.describe('d2 - de lopende maand', () => {
  test('heeft geen staaf, en een rechtstreekse aanroep geeft niets', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#insSpendChart rect[onclick*="2026-10"]').count()).toBe(0);
    const r = await page.evaluate(() => ({ b: brugBlok('2026-10'), m: maandBrug('2026-10', 'budget').leeg }));
    expect(r.m).toBe('lopend');
    expect(r.b).toBe('');
  });
});

test.describe('e - afronding: de afgeronde stappen tellen precies op', () => {
  test('met centen eindigt de bridge op het bedrag van de staaf', async ({ page }) => {
    const sep = { uiteten: 494.4, vices: 303.4, boodschappen: 784.4, shopping: 100.4, vervoer: 193.4, sport: 50.4, huur: 1171 };
    await boot(page, { sep });
    const spend = await page.evaluate(() => totals('2026-09').spendNorm);
    expect(Math.round(spend)).toBe(3097);                              // 6 x 0,4 = 2,4: per stap afronden gaf 3095
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s[s.length - 1].w).toBe(3097);
    expect(3421 + s.slice(1, -1).reduce((a, x) => a + x.w, 0)).toBe(3097);
    expect(await page.locator('#spendRead').innerText()).toContain('€3.097');
  });

  test('brugAfronden geeft gehele getallen die precies optellen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => brugAfronden([{ k: 'a', v: 0.4 }, { k: 'b', v: 0.4 }, { k: 'c', v: 0.4 }], 1));
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.values(r).every((v) => Number.isInteger(v))).toBe(true);
  });
});

test.describe('f - vaste lasten en uitgaven zonder potje', () => {
  test('een vaste last boven zijn potje is een eigen stap, en de bridge sluit nog steeds', async ({ page }) => {
    const sep = Object.assign({}, SEP, { huur: 1250 });
    await boot(page, { sep });
    const rc = await page.evaluate(() => recurringCats().has('huur'));
    expect(rc).toBe(true);                                             // invoermeting: de huur IS herkend als terugkerend
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s.find((x) => x.soort === 'vast').w).toBe(79);
    expect(3421 + s.slice(1, -1).reduce((a, x) => a + x.w, 0)).toBe(3095 + 79);
    expect(await page.locator('[data-brugzin]').innerText()).toContain('Je vaste lasten kwamen samen €79 boven hun potjes.');
  });

  test('een uitgave zonder potje is een eigen stap', async ({ page }) => {
    const sep = Object.assign({}, SEP, { vakantie: 60 });
    await boot(page, { sep });
    await page.evaluate(() => { for (const t of TX) if (/Winkel vakantie/.test(t.name)) OVR[t.id] = 'vakantie'; save(); });
    await page.evaluate(() => { window._brugMaand = null; renderIns(); });
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s.find((x) => x.soort === 'zonder').w).toBe(60);
    expect(s[s.length - 1].w).toBe(3155);
    expect(await page.locator('[data-brugzin]').innerText()).toContain('Zonder potje gaf je €60 uit.');
  });
});

test.describe('g - de bron', () => {
  /* Twee gevallen waarin de staaf iets anders telt dan alle uitgaven bij elkaar: onvoorzien
     (geenNorm, v234) en een boeking die uit een reservering is betaald (v269). De bridge moet op de
     staaf uitkomen, dus beide vallen er net zo uit. */
  test('onvoorzien telt niet mee, net als in de staaf', async ({ page }) => {
    await boot(page, { sep: Object.assign({}, SEP, { onvoorzien: 450 }) });
    await page.evaluate(() => { for (const t of TX) if (/Winkel onvoorzien/.test(t.name)) OVR[t.id] = 'onvoorzien'; save(); window._brugMaand = null; renderIns(); });
    expect(await page.evaluate(() => totals('2026-09').buitenNorm)).toBe(450);   // invoermeting
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s[s.length - 1].w).toBe(3095);
    /* het einde alleen is niet genoeg: de afronding verdeelt een verschil over de stappen, dus een
       onvoorzien dat meetelt zou het eind kloppend laten en de stappen vertekenen */
    expect(s.filter((x) => x.soort === 'potje').map((x) => x.w)).toEqual([-400, -207, 194, 103]);
    expect(s.find((x) => x.soort === 'zonder')).toBeUndefined();
    expect(3421 + s.slice(1, -1).reduce((a, x) => a + x.w, 0)).toBe(3095);
  });

  test('een deel uit een reservering telt niet mee, net als in de staaf', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const t = TX.find((x) => /Winkel uiteten 2026-09/.test(x.name)); SET.uitReservering = { [t.id]: 194 }; save(); window._brugMaand = null; renderIns(); });
    expect(await page.evaluate(() => totals('2026-09').spendNorm)).toBe(3095 - 194);   // invoermeting
    await tik(page, '2026-09');
    const s = await stappen(page);
    expect(s[s.length - 1].w).toBe(2901);
    expect(3421 + s.slice(1, -1).reduce((a, x) => a + x.w, 0)).toBe(2901);
    expect(s.find((x) => /Uit eten/.test(x.label))).toBeUndefined();              // precies op zijn potje: geen stap
  });

  test('het einde komt uit totals().spendNorm, niet uit catSpendMap()', async ({ page }) => {
    await boot(page);
    const src = await kaalUit(page, 'maandBrug', 'brugNetto');
    expect(src).toContain('spendNorm');
    expect(src).not.toContain('catSpendMap(');
  });
});

for (const breed of [360, 390]) {
  test.describe(`h - hoogte en overloop op ${breed}px`, () => {
    test('de kaart voor en na de tik, zonder overloop en zonder overlappende labels', async ({ page }) => {
      await boot(page, {}, breed);
      const voor = await page.locator('#insSpendCard').evaluate((e) => e.getBoundingClientRect().height);
      await tik(page, '2026-09');
      const na = await page.locator('#insSpendCard').evaluate((e) => e.getBoundingClientRect().height);
      await page.locator('[data-brugrest]').click();
      const open = await page.locator('#insSpendCard').evaluate((e) => e.getBoundingClientRect().height);
      console.log(`hoogte ${breed}: voor ${voor} na ${na} uitgesplitst ${open}`);
      const m = await page.evaluate(() => {
        const kaart = document.querySelector('#insSpendCard').getBoundingClientRect();
        const vals = [...document.querySelectorAll('[data-brugval]')].map((e) => e.getBoundingClientRect());
        let overlap = 0;
        for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
          const a = vals[i], b = vals[j];
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap++;
        }
        return { overlap, links: Math.min(...vals.map((v) => v.left)) >= kaart.left - 0.5, rechts: Math.max(...vals.map((v) => v.right)) <= kaart.right + 0.5,
          scroll: document.documentElement.scrollWidth <= window.innerWidth };
      });
      expect(m).toEqual({ overlap: 0, links: true, rechts: true, scroll: true });
      expect(na).toBeGreaterThan(voor);
    });

    /* Het zwaarste geval: vier losse potjes, de rest, een vaste last en een uitgave zonder potje,
       dus negen kolommen. De bedragen boven de staven en de namen eronder blijven binnen de kaart
       en lopen niet over elkaar heen (de meetles van v318 over absoluut geplaatste labels). */
    test('negen kolommen: geen overlappende bedragen, geen naam buiten de kaart', async ({ page }) => {
      await boot(page, { sep: Object.assign({}, SEP, { huur: 1250, vakantie: 60 }) }, breed);
      await page.evaluate(() => { for (const t of TX) if (/Winkel vakantie/.test(t.name)) OVR[t.id] = 'vakantie'; save(); window._brugMaand = null; renderIns(); });
      await tik(page, '2026-09');
      expect(await page.locator('[data-brugstap]').count()).toBe(9);
      const m = await page.evaluate(() => {
        const kaart = document.querySelector('#insSpendCard').getBoundingClientRect();
        const vals = [...document.querySelectorAll('[data-brugval]')].map((e) => e.getBoundingClientRect());
        const namen = [...document.querySelectorAll('[data-brugstap] > div:last-child')].map((e) => ({ r: e.getBoundingClientRect(), sw: e.scrollWidth, cw: e.clientWidth }));
        let overlap = 0;
        for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
          const a = vals[i], b = vals[j];
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap++;
        }
        return { overlap, binnen: vals.every((v) => v.left >= kaart.left - 0.5 && v.right <= kaart.right + 0.5),
          namenBinnen: namen.every((n) => n.sw <= n.cw + 1 && n.r.right <= kaart.right + 0.5) };
      });
      expect(m).toEqual({ overlap: 0, binnen: true, namenBinnen: true });
    });
  });
}
