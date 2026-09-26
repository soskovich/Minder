/* v266: de drie metingen die beslissen of het #4-patroon gedrag is of een afschrijving.
 *
 * DE AANLEIDING, gemeten op het toestel bij v265: blok #4 draagt 76 procent van zijn bedrag in
 * een en dezelfde categorie, en in 2025 met aandelen van 86 tot 97 procent. Gesplitst op jaar
 * viel het patroon bovendien grotendeels weg: #4 tegen #1 ging van 5,9x in 2025 naar 1,6x in 2026,
 * en #4 was de duurste week van zijn maand in 8 van de 11 maanden in 2025 tegen 2 van de 9 in 2026.
 *
 * DRIE METINGEN, EEN VRAAG:
 *  a) de drie grootste NAMEN binnen de dominante categorie in blok 4, per maand;
 *  b) van de grootste daarvan het bedrag EN DE DAG - een vaste dag is een afschrijving, een
 *     wisselende dag is gedrag;
 *  c) het maandtotaal van de uitgesloten categorie naast dat van de dominante, over de hele reeks:
 *     zakt de een terwijl de ander begint te lopen, dan is het een verplaatsing.
 * En daarna de positiecijfers opnieuw, alleen over de maanden waarin de uitgesloten categorie
 * werkelijk iets draagt.
 *
 * DE CATEGORIE WORDT AFGELEID EN NIET BIJ NAAM GENOEMD: de grootste van #4 over alle maanden.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ACC = '100110012555096222';

/* Twee jaar met een duidelijk verhaal erin, zodat elke meting iets te zeggen heeft:
   in jaar 1 staat de vaste post van 675 op 'overig' en valt hij elke maand op dag 24;
   in jaar 2 staat diezelfde post op 'huur' en is hij dus uit de scope verdwenen. Dat is precies
   de verplaatsing die meting c moet laten zien. */
function seed() {
  const tx = [];
  const add = (datum, amount, naam, cat) =>
    tx.push({ id: 'x' + tx.length, date: datum, amount, acc: ACC, name: naam, desc: naam,
              typ: '', ref: '', src: 'psd2', accName: '', refNums: [], ruleCat: cat, autoCat: cat });
  for (const [jaar, vasteCat] of [[2025, 'overig'], [2026, 'huur']]) {
    for (let mnd = 1; mnd <= 12; mnd++) {
      const m = jaar + '-' + String(mnd).padStart(2, '0');
      add(m + '-25', 5216, 'Werkgever', 'salaris');
      add(m + '-03', -60, 'Albert Heijn', 'boodschappen');
      add(m + '-10', -40, 'Albert Heijn', 'boodschappen');
      add(m + '-17', -50, 'Albert Heijn', 'boodschappen');
      add(m + '-23', -45, 'Albert Heijn', 'boodschappen');
      add(m + '-24', -675, 'ML Macnack', vasteCat);          // de vaste post, altijd dag 24
      add(m + '-26', -30, 'Kiosk', 'overig');
    }
  }
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: false, income: 5216,
      manualBal: { [ACC]: 4200 },
      budgets: { boodschappen: 700, overig: 500, huur: 750 },
      savingMode: 'amount', savingAmount: 0, goals: [] }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}
/* De boot hernummert de ids en hercategoriseert, dus een categorie uit de seed landt niet: gemeten
   zette categorize() 'ML Macnack' in ALLE maanden op huur, ook in 2025. De categorie wordt daarom
   na de boot als override gezet, net als in de app zelf, en de eerste test houdt vast dat de
   fixture werkelijk draagt wat hij belooft (v260). */
async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof weekScope === 'function');
  await page.evaluate(() => {
    for (const t of TX) if (/Macnack/.test(t.name)) OVR[t.id] = t.date.startsWith('2025') ? 'overig' : 'huur';
    save(); render();
  });
}
const diag = (page) => page.evaluate(() => diagWeekblokken().join('\n'));

test.describe('a - de fixture draagt het geval dat hij beschrijft', () => {
  test('de vaste post staat in 2025 op overig en in 2026 op huur, allebei op dag 24', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mac = TX.filter((t) => /Macnack/.test(t.name));
      return { n: mac.length, cats: [...new Set(mac.map((t) => catOf(t)))].sort(),
        dagen: [...new Set(mac.map((t) => +t.date.slice(8, 10)))],
        cat2025: catOf(mac.find((t) => t.date.startsWith('2025'))),
        cat2026: catOf(mac.find((t) => t.date.startsWith('2026'))),
        scope: weekScope() };
    });
    expect(r.n).toBe(24);
    expect(r.dagen).toEqual([24]);
    expect(r.cat2025).toBe('overig');
    expect(r.cat2026).toBe('huur');
    // en huur valt buiten de scope, dus 2026 draagt hem niet meer in de blokken
    expect(r.scope).toContain('overig');
    expect(r.scope).not.toContain('huur');
  });
});

test.describe('b - de drie metingen', () => {
  test('a: de drie grootste namen per maand, met hun dag', async ({ page }) => {
    await boot(page);
    const t = await diag(page);
    expect(t).toMatch(/de drie grootste namen binnen 'overig' in blok 4, per maand/);
    expect(t).toContain('2025-03: ML Macnack 675 (dag 24)');
    // in 2026 is de post naar huur verhuisd, dus hij staat er niet meer bij
    const r2026 = t.split('\n').find((x) => x.trim().startsWith('2026-03:') && /Macnack|Kiosk|niets/.test(x));
    expect(r2026, 'geen regel voor 2026-03').toBeTruthy();
    expect(r2026).not.toContain('Macnack');
  });

  test('b: de grootste post op een rij, met een telling van de dagen', async ({ page }) => {
    await boot(page);
    const t = await diag(page);
    expect(t).toContain('de grootste post per maand, op een rij:');
    expect(t).toContain('2025-05: ML Macnack 675 dag 24');
    // de decisieve regel: een vaste dag betekent een afschrijving
    const regel = t.split('\n').find((x) => x.includes('verschillende dagen:'));
    expect(regel, 'geen dagentelling').toBeTruthy();
    expect(t).toMatch(/namen: .*ML Macnack 12x/);
  });

  test('c: de tegenproef zonder namen laat de verplaatsing zien', async ({ page }) => {
    await boot(page);
    const t = await diag(page);
    expect(t).toMatch(/maandtotaal 'huur' tegen 'overig', hele maand/);
    const rij = (m) => t.split('\n').find((x) => x.trim().startsWith(m + '   ')) || '';
    // 2025: huur 0, overig 705 (675 + 30 kiosk). 2026: huur 675, overig 30.
    expect(rij('2025-06')).toMatch(/\s0\s+705\s*$/);
    expect(rij('2026-06')).toMatch(/\s675\s+30\s*$/);
  });

  test('de hersplitsing: alleen de maanden waarin huur werkelijk iets draagt', async ({ page }) => {
    await boot(page);
    const t = await diag(page);
    expect(t).toMatch(/gesplitst op of de maand een 'huur'-boeking draagt/);
    const met = t.split('\n').find((x) => x.trim().startsWith('met   :'));
    const zonder = t.split('\n').find((x) => x.trim().startsWith('zonder:'));
    expect(met, 'geen met-regel').toBeTruthy();
    expect(zonder, 'geen zonder-regel').toBeTruthy();
    const lees = (r, nr) => +((new RegExp('#' + nr + '=(-?\\d+)')).exec(r) || [0, 0])[1];
    // zonder huur (2025): de 675 zit in overig en dus in blok 4
    expect(lees(zonder, 4)).toBeGreaterThan(lees(zonder, 1) * 3);
    // met huur (2026): de 675 is uit de scope, dus blok 4 zakt terug naar het niveau van de rest
    expect(lees(met, 4)).toBeLessThan(lees(zonder, 4) / 3);
  });
});

test.describe('c - de bron', () => {
  test('de categorie wordt afgeleid en staat niet als string in de code', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const m = /function diagWeekblokken\(\)\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'diagWeekblokken() niet gevonden').toBeTruthy();
    const body = m[1];
    // de dominante categorie komt uit perPos[4] en niet uit een naam
    expect(body).toMatch(/Object\.entries\(perPos\[4\]\|\|\{\}\)/);
    // en de uitgesloten categorie komt uit de constante
    expect(body).toMatch(/WEEK_SCOPE_UIT\[0\]/);
    for (const naam of ["'overig'", '"overig"', "'huur'", '"huur"']) {
      expect(body, naam + ' staat hardgecodeerd in diagWeekblokken()').not.toContain(naam);
    }
  });

  test('kijken verandert nog steeds niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const echt = Storage.prototype.setItem; const geschreven = [];
      Storage.prototype.setItem = function (k, v) { geschreven.push(k); return echt.call(this, k, v); };
      const voor = JSON.stringify(SET), txVoor = TX.length;
      try { diagWeekblokken(); } finally { Storage.prototype.setItem = echt; }
      return { geschreven, zelfde: voor === JSON.stringify(SET), txZelfde: txVoor === TX.length };
    });
    expect(r.geschreven).toEqual([]);
    expect(r.zelfde).toBe(true);
    expect(r.txZelfde).toBe(true);
  });
});
