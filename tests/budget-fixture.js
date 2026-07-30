// Gedeelde fixture voor de in-browser budget-/liquiditeitschecks (v53/v54/v55).
// Bewust kalender-onafhankelijk: elk bedrag hieronder is gelijk op elke dag van de maand.
// Alleen varDue (tempo x resterende dagen) beweegt mee met de datum.
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';   // eindigt op 4323 -> telt als spaarrekening

// ---- verwachte waarden, met de hand doorgerekend uit de fixture ----
const INKOMEN = 3000;
const LIMIET = 2100;                              // 70% van 3000
const POTJES = 900 + 20 + 25 + 800 + 400 + 255;   // 2400, boven de limiet
const POTJES_NEXT = POTJES + 50;                  // 2450, de 'volgende maand'-laag
const SPEND_CUR = 20 + 25 + 300 + 100;            // 445
const FIXDUE = 900;                               // huur: incasso, deze maand nog niet afgeschreven
const VARPLAN = 0 + 500 + 300 + 255;              // 1055 = onbestede NIET-recurring potjes
const SALDO = 4000 + 2500;
const SPAAR_SALDO = 2500;
const SAVE_REMAINING = 300 - 200;                 // maandbedrag min wat deze maand al gespaard is
const SAFE = (SALDO - SPAAR_SALDO) - FIXDUE - VARPLAN - SAVE_REMAINING;   // 1945

// giftCharged=false laat de periodieke overboeking deze maand openstaan,
// zodat hij in fixDue moet landen (v55: incasso EN standing order).
function seed({ giftCharged = true } = {}) {
  const tx = [];
  const add = (id, m, day, amount, name, desc, acc, accName) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name, desc, typ: '', ref: '', src: 'csv', accName, refNums: [] });

  for (const m of [M2, M1, CUR]) {
    add('inc-' + m, m, '05', 3000, 'Werkgever', 'SALARIS LOON', MAIN, 'Main');
    add('fit-' + m, m, '04', -25, 'Basic-Fit', 'ECOM BASIC FIT BETAALPAS', MAIN, 'Main');   // FIXED_CATS-categorie, maar per kaart
    if (m !== CUR || giftCharged) add('gift-' + m, m, '03', -20, 'Greenpeace', 'PERIODIEKE OVERBOEKING MAANDELIJKSE GIFT', MAIN, 'Main');
  }
  // Huur alleen in de twee afgeronde maanden: staat deze maand dus nog open (fixDue).
  for (const m of [M2, M1]) add('huur-' + m, m, '20', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING', MAIN, 'Main');
  // Variabele historie (kaart), voor de prognose-basis.
  for (const m of [M2, M1]) {
    add('ah-' + m, m, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', MAIN, 'Main');
    add('eet-' + m, m, '12', -150, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT', MAIN, 'Main');
  }
  // Lopende maand.
  add('ah-cur', CUR, '02', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', MAIN, 'Main');
  add('eet-cur', CUR, '02', -100, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT', MAIN, 'Main');
  add('spaaruit-cur', CUR, '02', -200, 'Spaarpot', 'NAAR SPAREN', MAIN, 'Main');
  add('spaarin-cur', CUR, '02', 200, 'Spaarpot', 'NAAR SPAREN', SAV, 'Instant Savings');

  // Geen categorie-overrides: categorize() herschrijft t.id bij elke boot (index.html:798),
  // dus een OVR op onze eigen id zou stil vervallen. De omschrijvingen zijn zo gekozen dat de
  // ECHTE keyword-regels de bedoelde categorie geven; de eerste test bewaakt dat expliciet.
  const set = {
    limit: 70, limitMode: 'pct', hideInternal: true, mode: 'begeleid', insPeriod: 'month',
    autoIncome: false, income: INKOMEN,
    savingMode: 'amount', savingAmount: 300,
    savingsEnds: ['4323'],
    manualBal: { [MAIN]: 4000, [SAV]: 2500 },
    buffer: 0,
    // De potjes-grid (#potGridTotal) zit in Instellingen achter de knop "Geavanceerd"; zonder deze vlag
    // rendert dat blok niet en zoekt de spec naar iets wat legitiem is ingeklapt.
    budgetAdv: true,
    budgets: { huur: 900, goededoel: 20, sport: 25, boodschappen: 800, uiteten: 400, shopping: 255 },
    budgetsNext: { boodschappen: 850 },
    budgetMonth: CUR,   // voorkomt dat rolloverBudgets de 'volgende maand'-laag meteen invouwt
  };

  return {
    minder_tx: JSON.stringify(tx),
    minder_ovr: JSON.stringify({}),
    minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]),
    minder_accmeta: JSON.stringify({}),
    minder_plan: JSON.stringify({}),
  };
}

// Boot de echte app met de fixture in localStorage.
async function open(page, payload = seed()) {
  await page.route('**/sw.js', (r) => r.abort());   // geen controllerchange-reload tijdens de test
  await page.addInitScript((data) => { for (const k in data) localStorage.setItem(k, data[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0 && typeof totals === 'function');
}

module.exports = { seed, open, CUR, M1, M2, MAIN, SAV,
  INKOMEN, LIMIET, POTJES, POTJES_NEXT, SPEND_CUR, FIXDUE, VARPLAN, SALDO, SPAAR_SALDO, SAVE_REMAINING, SAFE };
