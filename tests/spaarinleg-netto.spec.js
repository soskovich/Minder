/* v262: "Nog te sparen - gehaald - EUR 9.346 opzij" telde alleen wat er op je spaarrekening BIJ
 * kwam. Wat er in dezelfde maand af ging telde niet mee, dus je kon 3.000 storten en 3.000 opnemen
 * en dan stond je doel op gehaald.
 *
 * DE KERN IS NIET HET ETIKET. Dat getal gaat via saveReserved rechtstreeks in `safe`, dus geld
 * verplaatsen tussen je eigen rekeningen verhoogde je veilig te besteden. GEMETEN vooraf op
 * kloppende saldi: 3.000 erop geeft safe 6.136, 3.000 erop en 1.500 terug geeft 7.636, en niets
 * bewegen geeft 6.136. Met de netto-bron zijn die drie alle drie 6.136. Dat is de eigenschap die
 * deze spec vasthoudt, niet het getal.
 *
 * EEN BRON: savedNet(). Er waren er drie - savedThisMonth() met een klem en zonder terugval,
 * savedNet() met allebei, en een eigen lus in safeToSpend() die alleen bijschrijvingen telde.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const CUR = ym(now);
const ACC = '100110012555096222';
const SPA = 'psd2_spaar01';
const DOEL = 3000;            // het maandbedrag van het toestel

function seed(extra, opt) {
  opt = opt || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, omschrijving, cat) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: omschrijving || naam,
              typ: '', ref: '', src: 'psd2', accName: '', refNums: [], ruleCat: cat, autoCat: cat });
  for (let i = 9; i >= 0; i--) {
    const m = M(i);
    add('i' + i, ACC, m, '25', 5216, 'Werkgever');
    add('h' + i, ACC, m, '02', -1450, 'Huur', 'SEPA INCASSO HUUR');
    add('a' + i, ACC, m, '06', -420, 'Albert Heijn');
    if (i > 0) add('s' + i, SPA, m, '04', DOEL, 'Naar spaarrekening');
  }
  (extra || []).forEach((e, k) => add('x' + k, e.acc, CUR, e.day, e.bedrag, e.naam, e.desc, e.cat));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, mode: 'begeleid', autoIncome: false, income: 5216,
      manualBal: opt.bal || { [ACC]: 4200, [SPA]: 9000 },
      savingsAcc: opt.geenSpaarrek ? {} : { [SPA]: true },
      savingsAccMigrated: 1, budgets: { boodschappen: 700 },
      savingMode: 'amount', savingAmount: DOEL, goals: [],
    }, opt.set || {})),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

const naarSpaar = (bedrag, dag) => ({ acc: SPA, day: dag || '04', bedrag, naam: 'Naar spaarrekening' });
const uitSpaar = (bedrag, dag) => ({ acc: SPA, day: dag || '12', bedrag: -bedrag, naam: 'Terug naar betaalrekening' });

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof safeToSpend === 'function');
}

const spaarRij = (page) => page.evaluate(() => {
  go('ins');
  const rij = document.querySelector('#insNogLijst');
  const rijen = rij ? [...rij.querySelectorAll('.ins-nog-rij')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()) : [];
  return rijen.find((r) => /Nog te sparen/.test(r)) || '(geen)';
});
const cijfers = (page) => page.evaluate(() => {
  const S = safeToSpend();
  return { opzij: S.savedThisMonth, nog: S.saveReserved, safe: S.safe, doel: S.saveTarget,
           netto: savedNet(thisYM()), klem: savedThisMonth(thisYM()) };
});

test.describe('a - een bron, en die is netto', () => {
  /* Dezelfde vorm als de tripdraad van v259: de bron lezen, niet de uitkomst. Er mag nog maar een
     plek zijn die bedragen op je spaarrekening optelt. savedTx() filtert op dezelfde set en telt
     niet op, dus die valt hier buiten. */
  test('geen enkele regel draagt de spaarrekening-toets en een optelling, behalve savedNet()', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const regels = src.split('\n');
    const dubbel = [];
    regels.forEach((r, i) => {
      const kaal = r.replace(/^\s*\*.*$/, '').replace(/^\s*\/\/.*$/, '');
      if (/sav\.has\(t\.acc\)/.test(kaal) && /\+=/.test(kaal)) dubbel.push((i + 1) + ': ' + r.trim());
    });
    expect(dubbel.length, 'optellingen over je spaarrekening:\n' + dubbel.join('\n')).toBe(1);
    expect(dubbel[0]).toMatch(/net\+=t\.amount/);
  });

  test('safeToSpend() en savedThisMonth() noemen savedNet() en tellen zelf niet', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const body = (naam) => {
      const i = src.indexOf('function ' + naam + '(');
      expect(i, naam + ' bestaat niet meer').toBeGreaterThan(0);
      return src.slice(i, src.indexOf('\nfunction ', i + 1));
    };
    for (const naam of ['safeToSpend', 'savedThisMonth']) {
      expect(body(naam), naam + ' leest savedNet() niet').toMatch(/savedNet\(/);
      expect(body(naam), naam + ' telt zelf nog over je spaarrekening').not.toMatch(/sav\.has\(t\.acc\)[^\n]*\+=/);
    }
  });
});

test.describe('b - de vijf gevallen', () => {
  test('3.000 erop en 2.000 eraf: de regel zegt 1.000 opzij en niet gehaald', async ({ page }) => {
    await boot(page, seed([naarSpaar(3000), uitSpaar(2000)]));
    const c = await cijfers(page);
    expect(c.opzij).toBe(1000);
    expect(c.nog).toBe(2000);
    const rij = await spaarRij(page);
    expect(rij).toContain('van €3.000');
    expect(rij).toContain('€1.000 opzij');
    expect(rij).not.toContain('gehaald');
  });

  test('alleen stortingen: ongewijzigd, gehaald met het hele bedrag', async ({ page }) => {
    await boot(page, seed([naarSpaar(3000)]));
    const c = await cijfers(page);
    expect(c.opzij).toBe(3000);
    expect(c.nog).toBe(0);
    expect(await spaarRij(page)).toContain('gehaald · €3.000 opzij');
  });

  test('netto onder nul: eruit gehaald, geen gehaald en geen opzij', async ({ page }) => {
    await boot(page, seed([naarSpaar(1000), uitSpaar(2500)]));
    const c = await cijfers(page);
    expect(c.opzij).toBe(-1500);
    expect(c.nog).toBe(4500);          // je maandbedrag plus wat je eruit haalde
    const rij = await spaarRij(page);
    expect(rij).toContain('van €3.000');
    expect(rij).toContain('€1.500 eruit gehaald');
    expect(rij).not.toContain('gehaald ·');
    expect(rij).not.toContain('opzij');
  });

  test('netto precies nul met bewegingen: alleen het maandbedrag, zoals een maand zonder beweging', async ({ page }) => {
    await boot(page, seed([naarSpaar(2000), uitSpaar(2000)]));
    const c = await cijfers(page);
    expect(c.opzij).toBe(0);
    expect(c.nog).toBe(3000);
    const rij = await spaarRij(page);
    expect(rij).toContain('van €3.000');
    expect(rij).not.toContain('opzij');
    expect(rij).not.toContain('eruit gehaald');
    // en dat is letterlijk dezelfde regel als een maand waarin je niets deed
    await boot(page, seed([]));
    expect(await spaarRij(page)).toBe(rij);
  });

  test('een interne overboeking naar je eigen betaalrekening telt als opname', async ({ page }) => {
    await boot(page, seed([naarSpaar(3000),
      { acc: SPA, day: '12', bedrag: -800, naam: 'ABN PRIVEREKENING', desc: 'PRIVEREKENING OVERBOEKING' },
      { acc: ACC, day: '12', bedrag: 800, naam: 'ABN PRIVEREKENING', desc: 'PRIVEREKENING OVERBOEKING' }]));
    const c = await cijfers(page);
    // de rekening-tak leest elk bedrag op die rekening en kijkt niet naar de categorie
    expect(c.opzij).toBe(2200);
    expect(c.nog).toBe(800);
  });
});

/* DE KERN VAN DEZE RONDE. Niet dat 'gehaald' onterecht was, maar dat geld verplaatsen tussen je
   eigen rekeningen je veilig te besteden verhoogde. De saldi lopen hier met de boekingen mee, want
   anders meet je twee dingen tegelijk. */
test.describe('c - safe verandert niet van geld heen en weer schuiven', () => {
  const G = [
    ['3.000 erop', [naarSpaar(3000)], { [ACC]: 1200, [SPA]: 12000 }],
    ['3.000 erop en 1.500 terug', [naarSpaar(3000), uitSpaar(1500)], { [ACC]: 2700, [SPA]: 10500 }],
    ['niets bewogen', [], { [ACC]: 4200, [SPA]: 9000 }],
    ['1.500 eruit en niets erop', [uitSpaar(1500)], { [ACC]: 5700, [SPA]: 7500 }],
  ];
  test('vier standen van dezelfde euros geven dezelfde safe', async ({ page }) => {
    const uit = [];
    for (const [naam, extra, bal] of G) {
      await boot(page, seed(extra, { bal }));
      const c = await cijfers(page);
      uit.push({ naam, safe: c.safe, opzij: c.opzij, nog: c.nog });
    }
    const safes = [...new Set(uit.map((u) => u.safe))];
    expect(safes, JSON.stringify(uit)).toHaveLength(1);
    // en het is geen toeval van een lege som: de vier standen meten wel degelijk verschillend
    expect([...new Set(uit.map((u) => u.opzij))].length).toBeGreaterThan(2);
    // elke euro die je uit je spaarrekening haalt komt er via 'nog te sparen' weer af
    for (const u of uit) expect(u.nog).toBe(Math.max(DOEL - u.opzij, 0));
  });
});

test.describe('d - de lezers van savedThisMonth', () => {
  test('Home noemt in de opbouw wat je eruit haalde, met dezelfde woorden als Inzichten', async ({ page }) => {
    await boot(page, seed([naarSpaar(1000), uitSpaar(2500)]));
    const txt = await page.evaluate(() => { openSafeToSpend(); return document.body.innerText.replace(/\s+/g, ' '); });
    expect(txt).toContain('Nog te sparen deze maand');
    expect(txt).toContain('€1.500 die je eruit haalde');
    expect(txt).not.toContain('€1.500 deze maand al gespaard');
  });

  test('Home bij een gewone deelbetaling blijft zeggen wat je al spaarde', async ({ page }) => {
    await boot(page, seed([naarSpaar(3000), uitSpaar(2000)]));
    const txt = await page.evaluate(() => { openSafeToSpend(); return document.body.innerText.replace(/\s+/g, ' '); });
    expect(txt).toContain('min €1.000 deze maand al gespaard');
  });

  test('Plan leest hetzelfde netto getal en zwijgt zodra er niets opzij ging', async ({ page }) => {
    await boot(page, seed([naarSpaar(3000), uitSpaar(2000)]));
    expect(await page.evaluate(() => planMaandTekst().replace(/<[^>]+>/g, ''))).toContain('€1.000');
    await boot(page, seed([naarSpaar(1000), uitSpaar(2500)]));
    expect(await page.evaluate(() => planMaandTekst())).toBe('');
  });

  test('het label belooft netto, want anders zegt het iets wat de code niet doet', async ({ page }) => {
    await boot(page, seed([]));
    expect(await page.evaluate(() => JARGON.nogtesparen)).toMatch(/netto/);
  });
});

test.describe('e - de terugval, en wat daar verandert', () => {
  /* Zonder aangemerkte spaarrekening viel savedThisMonth() terug op nul en savedNet() op de
     categorie 'sparen'. Die nul is onwaar voor wie wel spaart, en hij was de basis van een
     afspraak. GEMETEN voor deze ronde: 0 tegen 3.000 op dezelfde boekingen. */
  const zonderRek = [{ acc: ACC, day: '04', bedrag: -3000, naam: 'Naar spaarrekening', desc: 'SPAARREKENING', cat: 'sparen' }];

  test('savedThisMonth() volgt nu de terugval in plaats van nul te geven', async ({ page }) => {
    await boot(page, seed(zonderRek, { geenSpaarrek: true }));
    const c = await cijfers(page);
    expect(c.klem).toBe(3000);
    expect(c.netto).toBe(3000);
  });

  test('de basis van een inleg-afspraak is daarmee je werkelijke inleg', async ({ page }) => {
    await boot(page, seed(zonderRek, { geenSpaarrek: true, set: { nfToegewezen: 0, noodfondsMaanden: 6 } }));
    /* De regel komt hier als los object binnen en niet uit maandRegels(): maandRegelOpties() leest
       van R alleen key, structureel en tekortPerMaand, en welke regels deze fixture oplevert is een
       andere vraag dan wat de optie als basis meegeeft. */
    const basis = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const o = maandRegelOpties({ key: 'buffer', tekortPerMaand: 500 }, m)
        .find((x) => x.extra && x.extra.meet === 'spaar');
      return o ? o.extra.basis : null;
    });
    expect(basis).toBe(3000);
  });

  test('afspraakUitkomst leest dezelfde klem, dus nooit een negatieve basis', async ({ page }) => {
    await boot(page, seed([uitSpaar(2500)]));
    const r = await page.evaluate(() => {
      const vorige = (function () { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getTime(); })();
      const u = afspraakUitkomst({ ts: vorige, vorm: 'inleg', meet: 'spaar', basis: 0, text: 'x' });
      return { klem: savedThisMonth(thisYM()), netto: savedNet(thisYM()), nu: u.nu, status: u.status };
    });
    expect(r.netto).toBe(-2500);
    expect(r.klem).toBe(0);
    // nu is {maand, bedrag}; het bedrag komt uit savedThisMonth() en is dus nooit negatief
    expect(r.nu && r.nu.bedrag).toBe(0);
  });
});

test.describe('f - layout', () => {
  for (const w of [360, 390]) {
    test(`de regel met 'eruit gehaald' past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 820 });
      await boot(page, seed([naarSpaar(1000), uitSpaar(2500)]));
      await page.evaluate(() => go('ins'));
      const r = await page.evaluate(() => {
        const rij = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
          .find((x) => /Nog te sparen/.test(x.textContent));
        return { over: document.body.scrollWidth - document.body.clientWidth,
                 hoogte: Math.round(rij.getBoundingClientRect().height) };
      });
      expect(r.over).toBeLessThanOrEqual(1);
      expect(r.hoogte).toBeLessThanOrEqual(80);
    });
  }
});
