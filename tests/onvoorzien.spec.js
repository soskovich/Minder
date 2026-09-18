// v234: een categorie Onvoorzien, zonder potje, buiten alles wat tegen een norm of tegen je historie
// meet. Een wegsleep van €500 is geen keuze en geen patroon: in het vervoerpotje leest hij als
// overbesteding, en in het maandbudget net zo. Hij blijft een uitgave (netSpend, maandtotaal), maar
// budgetnaleving leest spendNorm en zegt erbij wat er buiten de potjes viel, zodat het getal niet stil
// lager is. Buiten insSignals, noPotLeak (anders wordt hij het grootste lek van de maand) en het
// big-signaal. safeToSpend is saldo-gedreven en telt hem niet dubbel; baselineSpend neemt de mediaan
// van de onderste helft en vangt een uitschieter al af.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

const MAIN = 'NL01MAIN0000001111';
// dezelfde maand, met of zonder de wegsleep, gecategoriseerd via een override op de boeking
function metWegsleep(o) {
  o = o || {};
  const p = seed({ maanden: 8 });
  const tx = JSON.parse(p.minder_tx);
  const m = o.maand || CUR;
  // in de lopende maand op vandaag, zodat het big-signaal (venster van enkele dagen) hem kan zien
  const dag = m === CUR ? String(new Date().getDate()).padStart(2, '0') : '09';
  tx.push({ id: 'sleep', date: m + '-' + dag, amount: -500, acc: MAIN, name: 'Sleepbedrijf Amsterdam', desc: 'BEA, BETAALPAS SLEEPBEDRIJF AMSTERDAM', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  p.minder_tx = JSON.stringify(tx);
  if (o.cat) { const ovr = JSON.parse(p.minder_ovr); ovr.sleep = o.cat; p.minder_ovr = JSON.stringify(ovr); }
  return p;
}
async function boot(page, p) {
  await open(page, p || seed({ maanden: 8 }));
  // een override op id werkt pas als categorize() de id niet herschrijft; zet hem daarom via de app zelf
}
async function zetCat(page, cat) {
  await page.evaluate((c) => { const t = TX.find((x) => /SLEEPBEDRIJF/.test(x.desc)); setCat(t.id, c); }, cat);
}
const meet = (page, m) => page.evaluate((mm) => {
  const t = totals(mm);
  const sp = catSpendMap(mm);
  const mv = monthVsPrevInner(mm); const ex = new Set([...mv.drivers, ...budgetFlaggedCats(mm)]);
  const d = document.createElement('div'); d.innerHTML = insBudgetBlok(mm);
  return { spend: Math.round(t.spend), spendNorm: Math.round(t.spendNorm), buiten: Math.round(t.buitenNorm), budget: Math.round(t.budget),
    onv: Math.round(sp.onvoorzien || 0), netSpend: Math.round(netSpend(txOfMonth(mm))),
    varRest: varPlanRemaining(mm), potjes: Object.keys(SET.budgets || {}),
    signalen: insSignals(mm, ex).map((s) => s.kpiLabel), over: budgetOverCat(mm), lek: noPotLeak(mm),
    big: scoreNotifs({ negeerSnooze: true }).filter((n) => n.key.indexOf('big-') === 0).map((n) => n.l1),
    blok: d.innerText.replace(/\s+/g, ' '), split: splitFixedVar(mm), safe: Math.round(safeToSpend().safe), baseline: baselineSpend() };
}, m);

test.describe('a - de categorie bestaat, zonder potje', () => {
  test('type expense met geenNorm, en te kiezen in de transactie', async ({ page }) => {
    await boot(page);
    const c = await page.evaluate(() => ({ cat: CATS.onvoorzien, gn: geenNorm('onvoorzien'), andere: geenNorm('vervoer') }));
    expect(c.cat.type).toBe('expense');
    expect(c.cat.geenNorm).toBe(true);
    expect(c.gn).toBe(true);
    expect(c.andere).toBe(false);
    await page.evaluate(() => { openSheet(TX.find((x) => x.amount < 0).id); });
    expect(await page.locator('#sheet .catgrid').innerText()).toContain('Onvoorzien');
  });

  test('geen potje aan te maken, geen voorstel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('set'); openBudgetEditor();
      const grid = document.querySelector('#sheet').innerText;
      const sel = [...document.querySelectorAll('#sheet option')].map((o) => o.value);
      return { grid, sel };
    });
    expect(r.grid).not.toContain('Onvoorzien');
    expect(r.sel).not.toContain('onvoorzien');
    const src = await page.evaluate(() => suggestBudgets.toString());
    expect(src).toContain('geenNorm(k)');
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    await page.evaluate(() => { window.confirm = () => true; suggestBudgets(); });
    expect(await page.evaluate(() => (SET.budgetsNext || {}).onvoorzien || (SET.budgets || {}).onvoorzien || null)).toBeNull();
  });

  test('geen keyword: een sleepbedrijf landt niet vanzelf in Onvoorzien', async ({ page }) => {
    await boot(page, metWegsleep());
    expect(await page.evaluate(() => catOf(TX.find((x) => /SLEEPBEDRIJF/.test(x.desc))))).not.toBe('onvoorzien');
  });
});

test.describe('b - dezelfde maand met en zonder de wegsleep', () => {
  test('het geld is weg: netSpend en het maandtotaal tellen hem, de budgetnaleving niet', async ({ page }) => {
    await boot(page);
    const zonder = await meet(page, CUR);
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    const met = await meet(page, CUR);
    expect(met.onv).toBe(500);
    expect(met.spend - zonder.spend).toBe(500);            // maandtotaal
    expect(met.netSpend - zonder.netSpend).toBe(500);      // netSpend
    expect(met.spendNorm).toBe(zonder.spendNorm);          // wat tegen je budget staat
    expect(met.buiten).toBe(500);
    expect(zonder.buiten).toBe(0);
    expect(met.spendNorm + met.buiten).toBe(met.spend);    // één lijst, één filter: de delen tellen op tot het geheel
  });

  test('potjes en potjeRest onaangeraakt, en veilig-te-besteden verandert alleen door het saldo', async ({ page }) => {
    await boot(page);
    const zonder = await meet(page, CUR);
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    const met = await meet(page, CUR);
    expect(met.varRest).toBe(zonder.varRest);              // geen potje, dus geen rest
    expect(met.potjes).toEqual(zonder.potjes);
    // de fixture kent een handmatig saldo dat niet met de boeking meebeweegt, dus safe is gelijk:
    // het bewijs dat de €500 niet als variabel plan of tempo van veilig-te-besteden af gaat
    expect(met.safe).toBe(zonder.safe);
    expect(met.split.vari - zonder.split.vari).toBe(500);  // wel variabel in de splitsing (v55): niet vast, want geen herhaling
  });

  test('budgetnaleving op Inzichten: hetzelfde percentage, met de som erbij', async ({ page }) => {
    await boot(page);
    const zonder = await meet(page, CUR);
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    const met = await meet(page, CUR);
    const pct = (b) => (b.match(/(\d+)%/) || [])[1];
    expect(pct(met.blok)).toBe(pct(zonder.blok));
    expect(met.blok).toContain('+ €500 onvoorzien, buiten je potjes');
    expect(zonder.blok).not.toContain('onvoorzien');
    expect(met.blok).toContain(`€${met.spendNorm.toLocaleString('nl-NL')} uitgegeven`);
    expect(await page.evaluate(() => insBudgetBlok(thisYM()))).toContain("openCategory('onvoorzien')");
  });

  test('in het vervoerpotje was het wél overbesteding', async ({ page }) => {
    await boot(page, metWegsleep());
    await zetCat(page, 'vervoer');
    await page.evaluate(() => { SET.budgets.vervoer = 150; save(); });
    const met = await meet(page, CUR);
    expect(met.over && met.over.k).toBe('vervoer');
    expect(met.spendNorm - met.buiten).toBe(met.spend);   // en dan telt hij gewoon mee tegen het budget
    expect(met.buiten).toBe(0);
  });
});

test.describe('c - buiten de signalen die tegen een norm of je historie meten', () => {
  test('geen budgetsignaal, geen lek, geen grote-uitgave-melding, geen boven-je-normaal', async ({ page }) => {
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    const met = await meet(page, CUR);
    expect(met.over).toBeNull();
    const discr = await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).filter((n) => n.key.indexOf('discr-') === 0).map((n) => n.key));
    expect(discr).not.toContain('discr-onvoorzien');
    expect(met.lek === null || !/sleep/i.test(JSON.stringify(met.lek))).toBe(true);
    expect(met.big.join(' ')).not.toMatch(/Sleepbedrijf/i);
    // en dezelfde boeking elders is wél een lek (Overig: geen potje) en wél een grote uitgave (Uit eten:
    // 2,5 keer de mediaan van die categorie): de vlag doet het werk, niet het bedrag
    await boot(page, metWegsleep());
    await zetCat(page, 'overig');
    expect(JSON.stringify((await meet(page, CUR)).lek)).toMatch(/sleep/i);
    // zonder potje op uit eten, want anders neemt het budgetsignaal het ene loss-frame van de dag
    // (MECHANISM_SPEC.lossAversion.maxFramesPerDag) en is de afwezigheid van big niets bewijzend
    /* Het big-signaal is in een gevulde maand niet los te zien: het is een loss-frame met een lage
       score, en MECHANISM_SPEC.lossAversion laat er één per dag door (budget, discr of tempo winnen).
       De uitsluiting wordt daarom aan de conditie zelf gemeten, en niet met een gepatchte engine. */
    const src = await page.evaluate(() => scoreNotifs.toString());
    const recent = src.slice(src.indexOf('const recent=TX.filter('), src.indexOf('let big=null'));
    expect(recent).toContain('!geenNorm(catOf(x))');
  });

  test('geen aandeel- of trendsignaal op de afgeronde maand', async ({ page }) => {
    await boot(page, metWegsleep({ maand: M1 }));
    await zetCat(page, 'onvoorzien');
    const r = await page.evaluate((m) => {
      const alle = insSignals(m, new Set());
      const mv = monthVsPrevInner(m);
      return { labels: alle.map((s) => s.kpiLabel), driver: [...mv.drivers] };
    }, M1);
    expect(r.labels).not.toContain('Onvoorzien');
    // de maandvergelijking mag hem wel noemen: het geld is echt weg
    expect(r.driver).toContain('onvoorzien');
  });

  test('overstreak leest wat tegen je budget staat', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => scoreNotifs.toString());
    expect(src).toContain('over:t.spendNorm>t.budget');
  });
});

test.describe('e - geen tweede restbak: het onderscheid met Overig staat er', () => {
  test('de transactiesheet noemt de gekozen categorie, met uitleg via jrg, en de tegel kiest nog gewoon', async ({ page }) => {
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    const r = await page.evaluate(() => {
      const t = TX.find((x) => /SLEEPBEDRIJF/.test(x.desc)); openSheet(t.id);
      const sheet = document.querySelector('#sheet');
      return { kop: sheet.innerText.replace(/\s+/g, ' '), jrg: !!sheet.querySelector('.jrg[onclick*="onvoorzien"]'),
        tegelJrg: sheet.querySelectorAll('.catgrid .jrg').length, uitleg: JARGON.onvoorzien };
    });
    expect(r.kop).toContain('Onvoorzien');
    expect(r.jrg).toBe(true);
    expect(r.tegelJrg).toBe(0);   // de tegel zelf blijft één tik: kiezen
    expect(r.uitleg).toBe('Een kost die je niet kon voorzien, zoals een wegsleep of een kapotte wasmachine. Geen potje, telt niet mee tegen je budget. Weet je niet waar een boeking hoort, dan is dat Overig.');
    expect(r.uitleg).not.toMatch(/buffer/);   // waar het geld vandaan kwam is geen kenmerk van de categorie
  });

  test('de drill-down zegt wat de categorie is, zonder teller en zonder oordeel', async ({ page }) => {
    await boot(page, metWegsleep());
    await zetCat(page, 'onvoorzien');
    const t = await page.evaluate(() => { openCategory('onvoorzien'); return document.querySelector('#sheet').innerText.replace(/\s+/g, ' '); });
    expect(t).toContain('Kosten die je niet kon voorzien. Meer dan een paar per jaar betekent dat ze een potje horen te hebben.');
    expect(t).not.toMatch(/te veel|te vaak|streak|score/i);
    const overig = await page.evaluate(() => { openCategory('boodschappen'); return document.querySelector('#sheet').innerText; });
    expect(overig).not.toContain('Kosten die je niet kon voorzien');
  });
});

test.describe('d - de referentie beweegt niet', () => {
  test('baselineSpend met een dure maand in de historie', async ({ page }) => {
    await boot(page);
    const zonder = await meet(page, CUR);
    await boot(page, metWegsleep({ maand: M1 }));
    await zetCat(page, 'onvoorzien');
    const met = await meet(page, CUR);
    expect(met.baseline).toBe(zonder.baseline);   // mediaan van de onderste helft: de dure maand valt erbuiten
  });
});
