/* v311: DE POTJES VERDWIJNEN NIET VAN DE PAGINA OP EEN DAG ZONDER BOEKINGEN VAN DEZE MAAND.
 *
 * DE OUDE VORM zette `onbekend` als hoofdgetal, en dan was het grootste getal van het scherm een
 * WOORD en stond je potjesbedrag nergens meer. Wat er nu staat is dat bedrag, met `uitgegeven: nog
 * onbekend` eronder.
 * HET IS EEN BUDGET EN GEEN RESTANT, en het verschil zit in het WOORD: met nul boekingen is het
 * restant rekenkundig gelijk aan het budget, dus "nog in je potjes" zou hetzelfde cijfer tonen en
 * tegelijk beweren dat er gemeten is wat je gebruikte (v59/v73/v173). Die gelijkheid staat als
 * assertie vast, want zonder haar is "het is het budget" niet van "het is het restant" te scheiden.
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111', PSD = 'psd2acc0001';
const now = vasteDatum();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));

/* DE FIXTURE DRAAGT GEEN ENKELE BOEKING IN DE LOPENDE MAAND, want dat is het geval. De laatste
   boeking ligt in M1, dus `laatsteImport().datum < CUR+'-01'` en de lege tak vuurt. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1]) {
    add('i' + m, m, '05', 3000, 'Werkgever', 'SALARIS LOON');
    add('b' + m, m, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('e' + m, m, '12', -150, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    add('h' + m, m, '20', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  const set = Object.assign({
    limit: 70, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2500 },
    budgets: { boodschappen: 500, uiteten: 150, overig: 120, huur: 900 },
    bufferNorm: 3,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o, w) {
  await pinDag(page);
  if (w) await page.setViewportSize({ width: w, height: 800 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insBudgetBlok === 'function' && TX.length > 0);
}
const koppel = (exp) => ({ set: { psd2Accounts: { [PSD]: { uid: 'u1', iban: 'NL99PSD20000000001',
  hash: '', label: 'Main', bank: 'N26', exp: exp || '2099-01-01' } } } });
const kaart = (page) => page.evaluate(() => { go('ins'); renderIns(); return $('#insStand').innerText.replace(/\s+/g, ' '); });

test.describe('a - de invoer draagt het geval', () => {
  test('geen enkele boeking in de lopende maand, en de lege tak vuurt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      inCur: TX.filter((t) => t.date.slice(0, 7) === thisYM()).length,
      laatste: laatsteImport().datum, cur: thisYM(), lopend: isLopendeMaand(thisYM()),
      varBud: varBudget(), budget: Math.round(totals(thisYM()).budget),
    }));
    expect(r.inCur, 'de fixture mag geen boeking in deze maand dragen, anders toetst dit niets').toBe(0);
    expect(r.laatste < r.cur + '-01').toBe(true);
    expect(r.lopend).toBe(true);
    /* TWEE VERSCHILLENDE NOEMERS, en dat is de reden dat het getal uit `varBudget()` komt: de
       huur-potje van 900 is terugkerend en hoort niet bij "je potjes" (v309). Zonder dat verschil
       is "het leest varBudget()" niet van "het leest totals().budget" te onderscheiden. */
    expect(r.varBud).toBe(770);
    expect(r.budget).toBe(1670);
  });
});

test.describe('b - het potjesbedrag staat er, als budget en niet als restant', () => {
  test('het hoofdgetal is het potjesbedrag met uitgegeven nog onbekend', async ({ page }) => {
    await boot(page);
    const txt = await kaart(page);
    expect(txt).toContain('770');
    expect(txt).toContain('in je potjes deze maand');
    expect(txt).toContain('uitgegeven: nog onbekend');
    /* HET WOORD VAN DE GEMETEN STAND MAG ER NIET STAAN: "nog in je potjes" is het restant van v309
       en zou beweren dat er gemeten is. */
    expect(txt).not.toContain('nog in je potjes');
    expect(txt).not.toMatch(/\d+%/);                    // geen percentage zonder meting
  });

  test('het getal is gelijk aan het restant, en juist daarom is het woord de hele regel',
    async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      bud: varBudget(), gebruikt: varPotjeStand(thisYM()).gebruikt,
    }));
    /* ZONDER DEZE GELIJKHEID IS DE KEUZE ONZICHTBAAR: met nul boekingen is budget min gebruikt
       precies het budget, dus een restant-label zou hetzelfde cijfer tonen. Wat de twee scheidt is
       alleen het woord, en daarom staat dat woord als eigen assertie hierboven. */
    expect(r.gebruikt).toBe(0);
    expect(r.bud - r.gebruikt).toBe(r.bud);
  });

  test('de reden blijft staan en claimt niets over je uitgaven', async ({ page }) => {
    await boot(page);
    const txt = await kaart(page);
    expect(txt).toContain('Nul uitgaven en geen data zijn niet hetzelfde');
    expect(txt).toMatch(/Je laatste boeking is van/);
  });

  test('zonder variabele potjes blijft de oude vorm staan', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 900 } } });     // huur is terugkerend, dus varBudget is nul
    const r = await page.evaluate(() => ({ varBud: varBudget(), txt: $('#insStand') ? (go('ins'), renderIns(), $('#insStand').innerText.replace(/\s+/g, ' ')) : '' }));
    expect(r.varBud, 'zonder variabel potje is er niets te noemen').toBe(0);
    expect(r.txt).toContain('onbekend');
    expect(r.txt).not.toContain('in je potjes deze maand');
  });
});

test.describe('b2 - de lopende-maand-eis is een guard die het scherm niet kan bereiken', () => {
  test('een andere maand krijgt het potjesbedrag van nu niet', async ({ page }) => {
    await boot(page);
    /* DEZE EIS IS VANUIT HET SCHERM PER CONSTRUCTIE ONBEREIKBAAR, en dat is gemeten en geen
       vermoeden: `months()` is elke maand uit `TX` PLUS de lopende, en deze tak vuurt alleen als de
       laatste boeking VOOR de maand ligt. Een maand in de kiezer die na je laatste boeking ligt kan
       dus alleen de lopende zijn. De sabotage die de eis weghaalt blijft daarom groen op elk
       scherm-pad (meetles p).
       HIJ BLIJFT STAAN OM DE REDEN VAN `v284`: `varBudget()` leest `SET.budgets`, en dat is de map
       van de LOPENDE maand. Zou een volgende ronde `insBudgetBlok()` met een andere maand aanroepen,
       dan stond er een bedrag van nu onder het label "deze maand". Wat deze test vasthoudt is die
       EIGENSCHAP, langs het pad dat de functie wel heeft: haar eigen maandargument. */
    const r = await page.evaluate(() => {
      const ver = '2099-01';
      return { lopend: insBudgetBlok(thisYM()), ander: insBudgetBlok(ver),
        budgetVer: Math.round(totals(ver).budget), varBud: varBudget() };
    });
    expect(r.budgetVer, 'de tak moet ook voor die maand bereikbaar zijn, anders toetst dit niets')
      .toBeGreaterThan(0);
    expect(r.varBud).toBeGreaterThan(0);
    expect(r.lopend, 'de lopende maand draagt het potjesbedrag').toContain('in je potjes deze maand');
    expect(r.ander, 'een andere maand draagt het niet').not.toContain('in je potjes deze maand');
    expect(r.ander).toContain('onbekend');
  });
});

test.describe('c - de handeling volgt de gebruiker', () => {
  test('met een werkende bankkoppeling: Vernieuwen', async ({ page }) => {
    await boot(page, koppel());
    const r = await page.evaluate(() => { go('ins'); renderIns();
      return { txt: $('#insStand').innerText, html: $('#insStand').innerHTML, cta: importCta() }; });
    expect(r.cta.lab).toBe('Vernieuwen');
    expect(r.cta.act).toContain('psd2Refresh');
    expect(r.txt).toContain('Vernieuwen');
    expect(r.txt).not.toContain('Bestand toevoegen');
  });

  test('zonder koppeling: Bestand toevoegen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { go('ins'); renderIns();
      return { txt: $('#insStand').innerText, cta: importCta() }; });
    expect(r.cta.lab).toBe('Bestand toevoegen');
    expect(r.cta.act).toContain("getElementById('file')");
    expect(r.txt).toContain('Bestand toevoegen');
    expect(r.txt).not.toContain('Vernieuwen');
  });

  test('een verlopen koppeling krijgt opnieuw verbinden en niet vernieuwen', async ({ page }) => {
    await boot(page, koppel('2020-01-01'));
    /* v280: "vernieuwen is precies wat net niets opleverde", dus een koppeling die geen gegevens
       ophaalt krijgt de inlog-route. Die tak komt uit die staande regel en niet uit deze ronde. */
    const r = await page.evaluate(() => ({ cta: importCta(), stand: bankStand() }));
    expect(r.stand.verlopen, 'de fixture moet werkelijk verlopen zijn, anders toetst dit niets').toBe(true);
    expect(r.cta.lab).toBe('Opnieuw verbinden');
    expect(r.cta.act).toContain('psd2Connect');
  });

  test('de herinnering op Home leest dezelfde zin als de knop', async ({ page }) => {
    await boot(page, koppel());
    const r = await page.evaluate(() => {
      /* `renderReminder()` zei onvoorwaardelijk "Importeer je nieuwste bankbestand", en naast een
         knop "Vernieuwen" zijn dat twee handelingen in een regel. */
      const C = importCta();
      SET.lastImport = '2000-01-01';
      return { zin: C.zin, lab: C.lab, rem: renderReminder() };
    });
    expect(r.zin).toContain('Vernieuw je bankkoppeling');
    expect(r.rem).toContain(r.lab);
    expect(r.rem).toContain('Vernieuw je bankkoppeling');
    expect(r.rem).not.toContain('Importeer je nieuwste bankbestand');
  });

  test('de zin komt uit importCta en staat niet tweede keer in renderReminder', async ({ page }) => {
    await boot(page);
    const bron = await kaalUit(page, 'renderReminder');
    expect(bron).toContain('importCta()');
    expect(bron, 'de zin hoort uit de bron te komen').not.toContain('Importeer je nieuwste bankbestand');
  });
});

test.describe('d - de hoogte', () => {
  for (const w of [360, 390]) {
    test(w + 'px · de lege kaart blijft onder de eis van v241', async ({ page }) => {
      await boot(page, koppel(), w);
      const r = await page.evaluate(() => { go('ins'); renderIns();
        const el = $('#insStand'); const b = el.getBoundingClientRect();
        return { h: Math.round(b.height), onder: Math.round(b.bottom) }; });
      /* v241 houdt deze kaart onder de 200px. GEMETEN, identiek op 360 EN 390px: de lege vorm met
         het potjesbedrag is 175px, de oude `onbekend`-vorm 152px en een GEVULDE kaart 106px. De
         nieuwe regel kost dus 23px, en wat de lege vorm zo hoog maakt is niet het getal maar de zin
         met de reden eronder, die over drie regels loopt. Er is daarmee 25px over voor wat er later
         bij komt, en dat is minder dan bij een gevulde kaart; wie hier een regel bij zet, meet. */
      expect(r.h, 'hoogte van de lege stand-kaart op ' + w + 'px: ' + r.h + 'px').toBeLessThan(200);
      expect(r.h, 'en hij moet werkelijk inhoud dragen').toBeGreaterThan(150);
    });
  }
});
