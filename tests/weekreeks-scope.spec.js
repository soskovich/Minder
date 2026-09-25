/* v265: de scope van de weekreeks, en de tripdraad onder de huur-uitsluiting.
 *
 * DE AFBAKENING IS "variabele kosten zonder huur", dus huur gaat er bij naam uit. Dat is de vraag
 * zelf en geen reparatie eromheen, anders dan bij geenNorm (v258). GEMETEN op het toestel:
 * recurringCats() ziet daar Bankkosten, Belasting & boetes, Online shopping, Sport & gezondheid,
 * Vervoer & auto en Verzekeringen als terugkerend, maar huur en abonnementen NIET, en zonder deze
 * regel stond huur dus gewoon in de scope. Dat is het open punt van v254, bevestigd op echte
 * gegevens.
 *
 * DE TRIPDRAAD: zodra recurringCats() huur WEL als terugkerend ziet, is WEEK_SCOPE_UIT dood
 * gewicht - dan sluit je hem twee keer uit en merkt niemand het meer. De test hieronder valt daar
 * expliciet op, zodat de uitsluiting opgeruimd wordt in plaats van te blijven staan.
 *
 * NETTO PER BLOK, want bruto tellen gaf op het toestel 1.511 waar de maand 1.459 zei: precies de
 * terugstortingen. Twee waarheden over dezelfde maand, en die horen hier niet.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (datum, amount, naam, desc) =>
    tx.push({ id: 'x' + tx.length, date: datum, amount, acc: ACC, name: naam, desc: desc || naam,
              typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
  for (let i = 5; i >= 0; i--) {
    const m = M(i);
    add(m + '-25', 5216, 'Werkgever');
    add(m + '-03', -60, 'Albert Heijn');
    add(m + '-10', -40, 'Albert Heijn');
  }
  (opt.extra || []).forEach((e) => add(e.datum, -e.bedrag, e.naam, e.desc));
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: false, income: 5216,
      manualBal: { [ACC]: 4200 },
      budgets: Object.assign({ boodschappen: 700, huur: 750, uiteten: 300 }, opt.budgets || {}),
      savingMode: 'amount', savingAmount: 0, goals: [] }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof weekScope === 'function');
}

test.describe('a - huur valt buiten de scope', () => {
  test('een huurpotje staat niet in weekScope(), ook niet als het een gewoon potje is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      scope: weekScope(), uit: WEEK_SCOPE_UIT,
      huurIsTerugkerend: recurringCats().has('huur'),
      huurHeeftPotje: (+(SET.budgets || {}).huur || 0) > 0,
    }));
    // de fixture reproduceert het geval van het toestel: huur heeft een potje en is NIET terugkerend
    expect(r.huurHeeftPotje).toBe(true);
    expect(r.huurIsTerugkerend).toBe(false);
    expect(r.scope).not.toContain('huur');
    expect(r.scope).toContain('boodschappen');
    expect(r.uit).toEqual(['huur']);
  });

  /* DE TRIPDRAAD. Zodra recurringCats() huur wel ziet, doet WEEK_SCOPE_UIT niets meer en hoort hij
     weg. MIJN EERSTE VORM KON NIET VALLEN: die vergeleek weekScope() met en zonder een nagebootste
     recurringCats(), maar de uitsluiting haalt huur er in beide gevallen uit, dus de twee waren
     altijd gelijk. Dat is precies de meetles over een test die zijn invariant niet bewijst.
     Deze vorm rekent de scope ZONDER de uitsluiting na op dezelfde invoer, en eist dat huur daar
     wel in staat. Vangt recurringCats() hem ooit zelf, dan valt deze test met de reden erbij. */
  test('WEEK_SCOPE_UIT doet werk: zonder hem zou huur in de scope staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const B = SET.budgets || {}, rc = recurringCats();
      const zonderUitsluiting = Object.keys(B)
        .filter((k) => (+B[k] || 0) > 0 && !rc.has(k) && !geenNorm(k));
      return { scope: weekScope(), zonderUitsluiting, huurRecurring: rc.has('huur') };
    });
    expect(r.huurRecurring,
      'recurringCats() ziet huur nu wel als terugkerend: WEEK_SCOPE_UIT is dood gewicht en hoort weg').toBe(false);
    expect(r.zonderUitsluiting,
      'zonder WEEK_SCOPE_UIT staat huur al niet in de scope: de uitsluiting doet niets meer').toContain('huur');
    expect(r.scope).not.toContain('huur');
  });

  test('geenNorm blijft er ook uit, en dat is een andere regel dan huur', async ({ page }) => {
    await boot(page, { budgets: { onvoorzien: 100, contant: 100 } });
    const r = await page.evaluate(() => ({ scope: weekScope(), uit: WEEK_SCOPE_UIT }));
    expect(r.scope).not.toContain('onvoorzien');
    expect(r.scope).not.toContain('contant');
    // en ze staan niet in de uitsluitlijst: die is voor de afbakening, geenNorm heeft zijn eigen vlag
    expect(r.uit).not.toContain('onvoorzien');
    expect(r.uit).not.toContain('contant');
  });
});

test.describe('b - netto per blok', () => {
  test('een terugstorting verlaagt het blok waarin hij valt', async ({ page }) => {
    const m = M(1);
    await boot(page, { extra: [{ datum: m + '-04', bedrag: 100, naam: 'Albert Heijn' }] });
    const voor = await page.evaluate((k) => weekBedragen()[k], m + '#1');
    // dezelfde maand, met een terugstorting van 40 in hetzelfde blok
    await page.evaluate((d) => {
      TX.push({ id: 'terug', date: d, amount: 40, acc: '100110012555096222', name: 'Albert Heijn',
                desc: 'Albert Heijn', typ: '', ref: '', src: 'psd2', accName: '', refNums: [],
                ruleCat: 'boodschappen', autoCat: 'boodschappen' });
    }, m + '-05');
    const na = await page.evaluate((k) => weekBedragen()[k], m + '#1');
    expect(Math.round(voor - na)).toBe(40);
  });

  test('de blokken plus de restdagen zijn de maand over dezelfde scope', async ({ page }) => {
    const m = M(1);
    await boot(page, { extra: [
      { datum: m + '-04', bedrag: 100, naam: 'Albert Heijn' },
      { datum: m + '-30', bedrag: 77, naam: 'Albert Heijn' },     // buiten elk blok
    ] });
    const r = await page.evaluate((mm) => {
      const b = weekBedragen(), rest = weekRestdagen(), sp = catSpendMap(mm);
      const blok = Object.keys(b).filter((k) => k.slice(0, 7) === mm).reduce((a, k) => a + b[k], 0);
      const maand = weekScope().reduce((a, k) => a + (sp[k] || 0), 0);
      return { blok: Math.round(blok), rest: Math.round(rest[mm] || 0), maand: Math.round(maand) };
    }, m);
    expect(r.rest).toBe(77);
    expect(r.blok + r.rest).toBe(r.maand);
  });

  test('de restdagen zijn dag 29 tot 31 en zitten in geen enkel blok', async ({ page }) => {
    const m = M(1);
    await boot(page, { extra: [{ datum: m + '-29', bedrag: 50, naam: 'Albert Heijn' }] });
    const r = await page.evaluate((mm) => ({ rest: weekRestdagen()[mm],
      blokken: Object.keys(weekBedragen()).filter((k) => k.slice(0, 7) === mm) }), m);
    expect(r.rest).toBe(50);
    expect(r.blokken.every((k) => +k.split('#')[1] <= 4)).toBe(true);
  });
});

test.describe('c - het diagnoseblok meldt wat er buiten valt', () => {
  test('het noemt het bedrag van de restdagen en niet alleen dat ze bestaan', async ({ page }) => {
    const m = M(1);
    await boot(page, { extra: [{ datum: m + '-30', bedrag: 77, naam: 'Albert Heijn' }] });
    const tekst = (await page.evaluate(() => diagWeekblokken())).join('\n');
    expect(tekst).toContain('wat buiten de blokken valt (dag 29 tot 31, in scope):');
    expect(tekst).toContain(m + '=77');
    expect(tekst).toMatch(/totaal: 77/);
  });

  test('het toont de aansluiting van de lopende maand in plaats van hem aan te nemen', async ({ page }) => {
    await boot(page);
    const tekst = (await page.evaluate(() => diagWeekblokken())).join('\n');
    expect(tekst).toContain('aansluiting op de lopende maand');
    expect(tekst).toContain('catSpendMap over dezelfde scope');
    expect(tekst).toMatch(/sluit aan: JA/);
  });

  test('het toont wat elke positie draagt en wie blok 4 wint', async ({ page }) => {
    await boot(page);
    const tekst = (await page.evaluate(() => diagWeekblokken())).join('\n');
    expect(tekst).toContain('wat elke positie draagt, over alle volle blokken:');
    expect(tekst).toMatch(/#1 \(dag 1-7\)/);
    expect(tekst).toMatch(/#4 \(dag 22-28\)/);
    expect(tekst).toContain('de grootste categorie van blok 4, per maand:');
    expect(tekst).toContain('telling:');
  });

  test('het zegt waar de huur landt, en noemt het potje erbij', async ({ page }) => {
    await boot(page);
    const tekst = (await page.evaluate(() => diagWeekblokken())).join('\n');
    expect(tekst).toContain('waar landt je huur (alleen lezen):');
    expect(tekst).toContain('potje huur: 750');
    expect(tekst).toContain('de laatste boekingen die wel op huur staan:');
  });

  test('kijken verandert niets, ook met de nieuwe bronnen erbij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const echt = Storage.prototype.setItem; const geschreven = [];
      Storage.prototype.setItem = function (k, v) { geschreven.push(k); return echt.call(this, k, v); };
      const voor = JSON.stringify(SET), txVoor = TX.length;
      try { diagWeekblokken(); weekScope(); weekBedragen(); weekRestdagen(); }
      finally { Storage.prototype.setItem = echt; }
      return { geschreven, zelfde: voor === JSON.stringify(SET), txZelfde: txVoor === TX.length };
    });
    expect(r.geschreven).toEqual([]);
    expect(r.zelfde).toBe(true);
    expect(r.txZelfde).toBe(true);
  });
});

test.describe('d - de bron', () => {
  test('de scope staat op een plek, en weekBedragen leest hem', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toMatch(/const WEEK_SCOPE_UIT=\['huur'\];/);
    for (const naam of ['weekBedragen', 'weekRestdagen']) {
      const m = new RegExp('function ' + naam + '\\(\\)\\{([\\s\\S]*?)\\n\\}').exec(src);
      expect(m, naam + ' niet gevonden').toBeTruthy();
      expect(m[1], naam + ' bouwt zijn eigen scope').toMatch(/weekScope\(\)/);
      expect(m[1], naam + ' leest SET.budgets zelf').not.toMatch(/SET\.budgets/);
    }
  });
});
