/* v300: DE KRUISBRON-PAREN WORDEN TWEE KEER GETELD, IN DE IMPORT EN NOG MEETELLEND, MET BEDRAG.
 *
 * DE AANLEIDING: de parenscan van blok 10 loopt over de RUWE `TX`, dus zijn 96 kruisbron-paren op de
 * ABN-rekening zijn het getal van vóór `v284` (de csv-uitsluiting) en `v288` (negen bevestigde paren).
 * Wie een reparatie op dat getal bouwt, bouwt op een telling van voor de rondes die het geval al
 * deels ophaalden. Dat is `v285` op deze sectie: wie de IMPORT telt leest `TX`, wie GELD telt leest de
 * poort.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o):
 *  - EEN PAAR WAARVAN BEIDE KANTEN NOG MEETELLEN, met twee UITGAVE-kanten van hetzelfde bedrag. Zonder
 *    dit geval is "een kant per paar" niet te onderscheiden van "beide kanten", want dan is het bedrag
 *    van het paar gelijk aan de som van zijn kanten;
 *  - EEN PAAR MET EEN BEVESTIGDE DUBBELE KANT (`SET.dubbelPaar`), en
 *  - EEN PAAR MET EEN BEVESTIGDE RESERVERING (`SET.vorautPaar`). Twee verschillende poorten, want een
 *    telling die alleen de eerste leest zegt bij de tweede dat er niets wegviel;
 *  - EEN INTERN PAAR dat WEL meetelt. Die staat in het aantal en draagt NUL in het bedrag, want een
 *    overboeking telt nergens als uitgave. Zonder dit geval is het aantal paren niet te onderscheiden
 *    van het aantal paren dat een bedrag draagt;
 *  - EEN PAAR BINNEN DEZELFDE BRON, dat in geen van de twee tellingen mag staan.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sectieVan } = require('./bron-sectie');

const ABN = '521200806';

/* de dagen liggen in een afgeronde maand, zodat de kalender van vandaag niets verschuift; het venster
   van de parenscan is 6 dagen en elk paar staat 1 dag uit elkaar. */
const D = (dag) => '2026-06-' + String(dag).padStart(2, '0');

function seed() {
  const tx = [];
  const add = (o) => { tx.push(Object.assign({ acc: ABN, typ: '', ref: '', accName: 'ABN', refNums: [] }, o)); return o.id; };

  // 1) beide kanten tellen nog: twee uitgave-kanten van 60 euro, een dag uit elkaar
  add({ id: 'a-mt', date: D(3), amount: -60, name: 'Splif', desc: 'BEA, BETAALPAS SPLIF PURMEREND', src: 'mt940' });
  add({ id: 'a-ps', date: D(4), amount: -60, name: 'Splif', desc: 'Splif Purmerend PMNT', src: 'psd2' });

  // 2) de psd2-kant is door de gebruiker als dubbel bevestigd
  add({ id: 'b-mt', date: D(6), amount: -45, name: 'Vomar', desc: 'BEA, BETAALPAS VOMAR PURMEREND', src: 'mt940' });
  add({ id: 'b-ps', date: D(7), amount: -45, name: 'Vomar', desc: 'Vomar Purmerend PMNT', src: 'psd2' });

  // 3) de psd2-kant is door de gebruiker als reservering bevestigd
  add({ id: 'c-mt', date: D(9), amount: -31, name: 'Tango', desc: 'BEA, BETAALPAS TANGO PURMEREND', src: 'mt940' });
  add({ id: 'c-ps', date: D(10), amount: -31, name: 'Tango', desc: 'Tango Purmerend PMNT', src: 'psd2' });

  // 4) een INTERN paar: telt wel mee, draagt geen uitgave
  add({ id: 'd-mt', date: D(13), amount: -150, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM', src: 'mt940' });
  add({ id: 'd-ps', date: D(14), amount: -150, name: 'Geldmaat', desc: 'Geldmaat GM Zwanebloe PMNT', src: 'psd2' });

  // 5) DEZELFDE bron: hoort in geen van de twee tellingen
  add({ id: 'e-ps1', date: D(17), amount: -22, name: 'Etos', desc: 'Etos Purmerend PMNT', src: 'psd2' });
  add({ id: 'e-ps2', date: D(18), amount: -22, name: 'Etos', desc: 'Etos Purmerend PMNT twee', src: 'psd2' });

  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 3000,
      manualBal: { [ABN]: 2000 }, budgets: { boodschappen: 400, overig: 300, vervoer: 200 } }),
    minder_own: JSON.stringify([ABN]), minder_accmeta: '{}', minder_plan: '{}' };
}

/* De twee bevestigingen worden gezet zoals de app ze zet: een sleutel met de id van de kant die
   wegvalt. `dubbelWeg()` en `vorautWeg()` lopen over die maps, dus de sleutelnaam doet niet mee. */
async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function');
  await page.evaluate(() => {
    const vind = (n) => (TX.find((t) => t.date.endsWith(n) && t.src === 'psd2') || {}).id;
    SET.dubbelPaar = { 'k-dubbel': { weg: vind('-07'), op: '2026-06-20' } };
    SET.vorautPaar = { 'k-voraut': { weg: [vind('-10')], op: '2026-06-20' } };
    window.REGELS_ = () => diagDubbel().join(String.fromCharCode(10));
  });
}
const regels = (page) => page.evaluate(() => REGELS_());

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('vijf paren op een rekening met twee bronnen, en de twee bevestigingen bijten echt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const bronnen = [...new Set(TX.map((t) => t.src))].sort();
      const telt = new Set(telbareTx().map((t) => t.id));
      /* NIET OP DE FIXTURE-ID: `categorize()` doet `t.id=txId(t)` en de boot loopt over alle `TX`, dus
         de ids uit de fixture bestaan hier niet meer (meetles u). Datum plus bedrag is wat overblijft. */
      const wie = (t) => t.date + '|' + t.amount + '|' + t.src;
      return { bronnen, n: TX.length,
        weg: TX.filter((t) => !telt.has(t.id)).map(wie).sort(),
        intern: TX.filter((t) => t.amount === -150).map((t) => CATS[catOf(t)].type),
        uitgave: TX.filter((t) => t.amount === -60).map((t) => CATS[catOf(t)].type) };
    });
    expect(r.bronnen, 'een rekening met twee bronnen, anders is er geen kruisbron-paar').toEqual(['mt940', 'psd2']);
    expect(r.n).toBe(10);
    expect(r.weg, 'precies de twee bevestigde kanten vallen weg')
      .toEqual(['2026-06-07|-45|psd2', '2026-06-10|-31|psd2']);
    expect(r.intern, 'het vierde paar is intern en telt dus nergens als uitgave').toEqual(['internal', 'internal']);
    expect(r.uitgave, 'het eerste paar draagt aan BEIDE kanten een uitgave').toEqual(['expense', 'expense']);
  });
});

test.describe('1 - twee tellingen over dezelfde paren', () => {
  test('de import telt vier kruisbron-paren, de poort laat er twee over', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('met VERSCHILLENDE bron: 4   (in de IMPORT, dus op TX)');
    expect(t).toContain('nog MEETELLEND, beide kanten door telbareTx(): 2 van 4');
    expect(t).toContain('bij de rest valt minstens een kant al weg: 2');
  });

  test('een paar binnen dezelfde bron staat in geen van de twee tellingen', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('met DEZELFDE bron: 1');
  });

  test('de reden staat per poort, en alle drie de poorten staan er ook op nul', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const rij = t.split('\n').find((l) => l.includes('per poort:'));
    expect(rij, 'er is een regel met de poorten').toBeTruthy();
    expect(rij).toContain('bevestigd dubbel 1x');
    expect(rij).toContain('bevestigde reservering 1x');
    /* de csv-poort kan op een paar binnen EEN rekening niet vuren, en juist daarom moet hij er met
       zijn nul staan: een poort die ontbreekt is niet te onderscheiden van een poort waarop niets viel
       (v59/v73/v173). Dat hij niet kan vuren staat als reden in het blok zelf. */
    expect(rij).toContain('csv in het venster van zijn psd2-kant 0x');
    expect(t).toContain('per constructie niet vuren');
  });
});

test.describe('2 - het bedrag is een plafond, en het telt EEN kant per paar', () => {
  test('de import draagt 60 + 45 + 31 euro over drie paren, niet het dubbele', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    /* het interne paar draagt geen uitgave en zit dus in het AANTAL paren maar niet in dit bedrag.
       Zou het bedrag beide kanten tellen, dan stond er 272 in plaats van 136. */
    expect(t).toContain('in de import:   136 euro over 3 paren');
  });

  test('nog meetellend blijft alleen het eerste paar over', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('nog meetellend: 60 euro over 1 paren');
  });

  test('het heet een plafond, en de reden waarom staat erbij', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('PLAFOND van wat er dubbel telt');
    expect(t).toMatch(/plafond en geen schade/);
    expect(t).toContain('dezelfde BETALING zijn staat niet vast');
  });
});

test.describe('3 - per paar staat erbij of hij nog meetelt', () => {
  test('de paren-lijst zegt beide kanten, een kant of geen kant', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const rijen = t.split('\n').filter((l) => / telt (beide kanten|een kant|geen kant)$/.test(l));
    expect(rijen.length, 'elk uitgeschreven paar draagt de markering').toBe(4);
    expect(rijen.filter((l) => l.endsWith('telt beide kanten')).length).toBe(2);
    expect(rijen.filter((l) => l.endsWith('telt een kant')).length).toBe(2);
  });
});

test.describe('4 - de bron: een poort, niet een tweede formulering', () => {
  const sectie = () => sectieVan(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), 'function diagDubbel(){');

  test('de tweede telling leest telbareTx() en de drie poort-predicaten, en drukt geen eigen voorwaarde uit', () => {
    const s = sectie();
    expect(s).toContain('telbareTx()');
    for (const fn of ['dubbelWeg(', 'vorautWeg(', 'csvDubbel(']) expect(s, fn).toContain(fn);
    /* geen eigen venster- of bron-toets naast de poort: die zou bij de eerste wijziging van
       vorautBron() uiteenlopen (v104). De parenscan zelf leest TX, en dat is de IMPORT-vraag. */
    expect(s, 'geen eigen kopie van de csv-venstertoets').not.toMatch(/csvPaar\(\)\.map/);
  });

  test('de parenscan zelf blijft op TX staan, want dat is de import-vraag', () => {
    const s = sectie();
    expect(s).toContain('for(const t of TX){ const k=t.acc');
  });
});
