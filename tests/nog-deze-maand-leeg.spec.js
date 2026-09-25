// v260: een nul die "er is niets meer" betekent verdwijnt, een nul die "het is klaar" betekent blijft.
//
// AANLEIDING, gemeten. Onder de kop stonden vier posten waarvan er twee op nul stonden:
// "Nog te ontvangen €0 · inkomen" en "Nog te sparen €0 · gehaald · €3.000 opzij". Die twee zijn
// niet hetzelfde. De eerste zegt dat er niets meer binnenkomt en voegt niets toe; de tweede is het
// enige moment waarop de app zegt dat je je maandbedrag hebt gehaald.
//
// ELKE POST DRAAGT ZELF OF ZIJN NUL LEEG IS. De regel staat bij de post en niet in het filter,
// want per post is de vraag een andere. Gemeten per post:
//   Nog te ontvangen   nul = er komt niets meer (drie oorzaken, zie hieronder)  -> weg
//   Nog te sparen      nul = gehaald                                            -> blijft
//   Nog te betalen     nul = niets herkend OF alles al afgeschreven             -> zie hieronder
//   Nog uit je potjes  nul = je potjes zijn precies op, een stand                -> blijft
//
// DRIE NULLEN BIJ "NOG TE ONTVANGEN": je salaris is al binnen, er kwam meer binnen dan je norm
// (de klem op nul), of je inkomen is helemaal onbekend. Dat derde is apart gemeten (baseIncome 0,
// incomeBasis 'onbekend') en zei toch "€0 · inkomen": een nul die als meting leest terwijl er niets
// gemeten is, precies wat v59/v73/v173 verbieden.
//
// DE SUB "NIETS HERKEND" WAS ONWAAR, en dat is in deze ronde gerepareerd en niet weggefilterd.
// Gemeten op een fixture met huur €1.450 en zorgverzekering €140 als herkende incasso's, allebei
// deze maand al afgeschreven: fixDue nul en de sub zei "niets herkend", terwijl er twee posten
// herkend waren en betaald. monthLiquidity().fixDueBetaald onderscheidt de twee nullen nu, en
// "alles is al afgeschreven" is een uitkomst die blijft staan, dezelfde vorm als 'gehaald'.
//
// DE VOORPOORT IS VERVALLEN. Die liet het hele blok vallen tenzij fixDue, varPlan, incDue of een
// potje boven nul stond, en kende de twee uitkomsten niet: met alleen een gehaald spaardoel viel
// het blok weg. Elke post draagt nu zelf of hij leeg is, dus die poort was een tweede waarheid.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const NORM = 5216;
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const maand = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';

function seed(o) {
  o = o || {};
  const tx = []; let n = 0;
  const add = (m, day, amount, naam, desc, acc) => tx.push({ id: 'x' + (++n), date: m + '-' + day,
    amount, acc: acc || MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (let k = 5; k >= 0; k--) {
    const m = maand(k);
    if (!(k === 0 && o.geenSalaris) && !o.geenInkomen) add(m, '25', NORM, 'SKF', 'SALARIS LOON');
    if (!o.geenVast) {
      add(m, '02', -1450, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
      add(m, '04', -140, 'Zilveren Kruis', 'SEPA INCASSO ZORGVERZEKERING');
    }
    add(m, '06', -(o.potjesOp && k === 0 ? 950 : 620), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    if (o.overBudget && k === 0) add(m, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '26', -3000, 'Spaarpot', 'NAAR SPAREN'); add(m, '26', 3000, 'Spaarpot', 'NAAR SPAREN', SPAAR);
  }
  const set = { limit: 70, mode: 'begeleid', autoIncome: true, manualBal: { [MAIN]: 3200, [SPAAR]: 40000 },
    budgets: o.geenPotjes ? {} : { boodschappen: 950 },
    savingMode: 'amount', savingAmount: o.geenSpaardoel ? 0 : 3000, savingsAcc: { [SPAAR]: true } };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof nogDezeMaandPosten === 'function');
  await page.evaluate(() => go('ins'));
}
// een post zoek je op zijn LABEL en niet op zijn plek (v253)
const posten = (page) => page.evaluate(() => {
  let P = []; try { P = nogDezeMaandPosten(); } catch (_) { return []; }
  return P.map((p) => ({ lab: String(p.lab).replace(/<[^>]+>/g, '').trim(), val: p.val,
    sub: String(p.sub || '').replace(/<[^>]+>/g, '').trim() }));
});
const vind = (L, naam) => L.find((p) => p.lab.indexOf(naam) === 0) || null;
const scherm = (page) => page.evaluate(() => ({
  /* textContent en niet innerText: .inssec staat op text-transform:uppercase, dus innerText geeft
     "NOG DEZE MAAND" terug. De bestaande specs lezen om dezelfde reden textContent. */
  secties: [...document.querySelectorAll('#s-ins .inssec')].map((x) => x.textContent.trim()),
  lijst: !!document.querySelector('#insNogLijst'),
  rijen: [...document.querySelectorAll('#insNogLijst .ins-nog-rij')].length,
}));

test.describe('a · een lege nul verdwijnt', () => {
  test('Nog te ontvangen op nul staat er niet', async ({ page }) => {
    await boot(page, {});
    expect(await page.evaluate(() => Math.round(monthLiquidity().incDue))).toBe(0);
    expect(vind(await posten(page), 'Nog te ontvangen')).toBeNull();
  });

  test('en hij staat er wel zodra er nog salaris komt', async ({ page }) => {
    await boot(page, { geenSalaris: true });
    const p = vind(await posten(page), 'Nog te ontvangen');
    expect(p).toBeTruthy();
    expect(p.val).toMatch(/5\.216/);
  });

  test('ook bij een volledig onbekend inkomen staat hij er niet', async ({ page }) => {
    // incDue is dan nul om een andere reden, en "€0 · inkomen" zou een meting beweren die er niet is
    await boot(page, { geenInkomen: true });
    const r = await page.evaluate(() => ({ base: baseIncome(), basis: totals(months()[months().length - 1]).incomeBasis }));
    expect(r.base).toBe(0);
    expect(r.basis).toBe('onbekend');
    expect(vind(await posten(page), 'Nog te ontvangen')).toBeNull();
  });

  test('Nog te betalen staat er niet als er echt niets herkend is', async ({ page }) => {
    await boot(page, { geenVast: true });
    expect(await page.evaluate(() => monthLiquidity().fixDueBetaald)).toBe(0);
    expect(vind(await posten(page), 'Nog te betalen')).toBeNull();
  });
});

test.describe('b · een bereikte uitkomst blijft', () => {
  test('Nog te sparen op nul blijft staan, met het vinkje', async ({ page }) => {
    await boot(page, {});
    const p = vind(await posten(page), 'Nog te sparen');
    expect(p).toBeTruthy();
    expect(p.val).toMatch(/0/);
    expect(p.sub).toMatch(/gehaald/);
    expect(p.sub).toMatch(/3\.000 opzij/);
    // het vinkje zit in de HTML van de sub, niet in de tekst
    const heeftVink = await page.evaluate(() => {
      const P = nogDezeMaandPosten().find((x) => String(x.lab).replace(/<[^>]+>/g, '').indexOf('Nog te sparen') === 0);
      return /<svg/i.test(String(P.sub));
    });
    expect(heeftVink).toBe(true);
  });

  test('zonder spaardoel bestaat de post niet, en dat is geen filterbesluit', async ({ page }) => {
    await boot(page, { geenSpaardoel: true });
    expect(await page.evaluate(() => safeToSpend().saveTarget)).toBe(0);
    expect(vind(await posten(page), 'Nog te sparen')).toBeNull();
  });

  test('Nog te betalen op nul blijft als alles al is afgeschreven', async ({ page }) => {
    await boot(page, {});
    expect(await page.evaluate(() => monthLiquidity().fixDueBetaald)).toBe(2);
    const p = vind(await posten(page), 'Nog te betalen');
    expect(p).toBeTruthy();
    expect(p.sub).toBe('alles is al afgeschreven');
    expect(p.sub).not.toMatch(/niets herkend/);   // de gemeten onwaarheid
  });

  test('Nog uit je potjes op precies nul blijft, want dat is een stand', async ({ page }) => {
    await boot(page, { potjesOp: true });
    const p = vind(await posten(page), 'Nog uit je potjes');
    expect(p).toBeTruthy();
    expect(p.val).toMatch(/0/);
    expect(p.sub).toMatch(/100%/);
  });

  test('een negatief bedrag verdwijnt niet, want dat is informatie', async ({ page }) => {
    await boot(page, { overBudget: true });
    const p = vind(await posten(page), 'Te veel uitgegeven');
    expect(p).toBeTruthy();
    expect(p.val).toMatch(/70/);
  });
});

test.describe('c · geen post, geen kop', () => {
  test('alles leeg: geen lijst en geen sectie', async ({ page }) => {
    await boot(page, { geenVast: true, geenPotjes: true, geenSpaardoel: true });
    expect(await posten(page)).toEqual([]);
    const s = await scherm(page);
    expect(s.lijst).toBe(false);
    expect(s.secties).not.toContain('Nog deze maand');
  });

  test('alleen een gehaald spaardoel houdt de sectie overeind', async ({ page }) => {
    // dit viel weg door de oude voorpoort, die de twee uitkomsten niet kende
    await boot(page, { geenVast: true, geenPotjes: true });
    const L = await posten(page);
    expect(L.length).toBe(1);
    expect(L[0].lab).toMatch(/Nog te sparen/);
    const s = await scherm(page);
    expect(s.secties).toContain('Nog deze maand');
    expect(s.rijen).toBe(1);
  });

  test('het aantal rijen op het scherm is het aantal posten', async ({ page }) => {
    await boot(page, {});
    const L = await posten(page);
    const s = await scherm(page);
    expect(s.rijen).toBe(L.length);
    expect(L.length).toBe(3);   // ontvangen weg, sparen + betalen + potjes blijven
  });
});

test.describe('d · de kop', () => {
  test('heet Nog deze maand, dezelfde naam als de tegelvorm', async ({ page }) => {
    await boot(page, {});
    const s = await scherm(page);
    expect(s.secties).toContain('Nog deze maand');
    expect(s.secties).not.toContain('Wat er nog komt');
    // nogDezeMaandCard() draagt dezelfde naam voor dezelfde posten (v91)
    const kaart = await page.evaluate(() => { try { return nogDezeMaandCard(); } catch (_) { return ''; } });
    if (kaart) expect(kaart).toMatch(/Nog deze maand/);
  });
});
