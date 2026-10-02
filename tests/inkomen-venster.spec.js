/* v321: HET INKOMENSVENSTER VAN baseIncome() IS DRIE AFGERONDE MAANDEN, EN DE LOPENDE MAAND MAG DE
   NORM NIET OMLAAG HALEN.
   De aanleiding is gemeten: de onderste-helft-mediaan is voor elk venster van 3 tot en met 6
   maanden precies de TWEEDE LAAGSTE maand, dus een nieuw en hoger loon zit per constructie in de
   bovenste helft. Op de reeks van het toestel (loon vanaf sep 2026) las de app daardoor vijf
   maanden lang een inkomen van voor de baan.
   DE FIXTURE IS DIE REEKS: apr t/m sep 2026 op 2900, 3464, 4100, 3800, 5000 en 5216, met 5216
   vanaf november. De verwachting staat in de opdracht: 5000 in oktober en 5216 in december.
   DE DIP- EN PIEKGEVALLEN ZIJN GECONSTRUEERD en niet van het toestel (v274): ze toetsen de
   eigenschap die het korte venster moest houden, namelijk dat een losse uitschieter de norm niet
   verzet. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalBron, kaalUit } = require('./bron-kaal');

const ACC = '100110012555096222';
const SPA = 'psd2_spaar01';
const RES = 'psd2_res01';

// de reeks van het toestel; 2025-04 t/m 2026-03 is historie zodat months() een echte as heeft
const OUD = {
  '2025-04': 3100, '2025-05': 2600, '2025-06': 4400, '2025-07': 3300, '2025-08': 2100,
  '2025-09': 3900, '2025-10': 4800, '2025-11': 3000, '2025-12': 6200, '2026-01': 2800,
  '2026-02': 3600, '2026-03': 4500,
  '2026-04': 2900, '2026-05': 3464, '2026-06': 4100, '2026-07': 3800, '2026-08': 5000,
};
const LOON = 5216;
const NIEUW = ['2026-09', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

function seed(opt = {}) {
  const tx = [];
  let n = 0;
  const add = (acc, m, day, amount, naam, desc) =>
    tx.push({ id: 't' + (n++), date: `${m}-${day}`, amount, acc, name: naam, desc: desc || naam,
              typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
  const maanden = Object.assign({}, OUD);
  for (const m of NIEUW) maanden[m] = LOON;
  if (opt.inkomen) Object.assign(maanden, opt.inkomen);
  for (const m in maanden) {
    if (maanden[m] > 0) add(ACC, m, '25', maanden[m], 'Werkgever', 'SALARIS WERKGEVER');
    add(ACC, m, '06', -420, 'Albert Heijn');
    add(ACC, m, '04', -1200, 'Huur Woningstichting', 'SEPA INCASSO HUUR WONINGSTICHTING');
  }
  /* de spaar- en reserveringsrekening dragen elk een boeking, want OWN komt uit TX (v122): zonder
     boeking valt hun saldo buiten totalBalance() en is de stand niet die van het toestel. */
  add(SPA, '2026-09', '10', 500, 'Naar spaarrekening', 'NAAR SPAREN');
  add(RES, '2026-09', '11', 100, 'Naar reserveringen', 'EIGEN REKENING');
  /* de lopende maand (oktober 2026) draagt de huur NIET, want die is deze maand nog niet
     afgeschreven en moet dus in fixDue staan. Mijn eerste vorm boekte hem wel, en dan zet
     monthLiquidity() hem in `seen` en voorspelt hij hem niet meer: gemeten fixDue 0, en dan is de
     stand niet krap en toetst de helft van dit bestand niets (v256). Blok a meet dat nu. */
  add(ACC, '2026-10', '01', -30, 'Albert Heijn');
  if (opt.oktInkomen) add(ACC, '2026-10', '01', opt.oktInkomen, 'Werkgever', 'SALARIS WERKGEVER');
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: true, income: 0,
      /* GECONSTRUEERD en niet van het toestel (v256): de stand is zo gekozen dat veilig te
         besteden NEGATIEF is, want dat is de tak die deze ronde raakt. De verhoudingen volgen de
         gemelde stand (het grootste deel staat op de spaarrekening, de potjes en de spaarinleg
         zijn de twee claims die je kunt verzetten). */
      manualBal: { [ACC]: 300, [SPA]: 4000, [RES]: 600 },
      savingsAcc: { [SPA]: true }, resAcc: RES,
      budgets: opt.geenPotjes ? {} : { boodschappen: 700, uiteten: 300, vervoer: 730 },
      savingMode: 'amount', savingAmount: opt.spaarBedrag == null ? 2600 : opt.spaarBedrag,
      goals: [], bufferNorm: 3,
    }, opt.set || {})),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, opt = {}, dag = '2026-10-02') {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await pinDatum(page, dag);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof baseIncome === 'function');
}

/* ---------- a. invoermeting: draagt de fixture werkelijk de baanwissel ---------- */
test('a. de fixture draagt de reeks van de opdracht en een baanwissel', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    nu: nowYMstr(),
    apr_sep: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
      .map((m) => maandInkomen(m).alles),
    nMaanden: months().length,
    fixDue: monthLiquidity().fixDue,
    safe: safeToSpend().safe,
    pot: totalBudget(),
  }));
  expect(r.nu).toBe('2026-10');
  expect(r.apr_sep).toEqual([2900, 3464, 4100, 3800, 5000, 5216]);
  // zonder genoeg historie zou het venster op de terugval vallen en toetst niets hieronder iets
  expect(r.nMaanden).toBeGreaterThan(12);
  // en de stand is werkelijk krap, met een herkende vaste last die nog moet komen
  expect(r.fixDue).toBeGreaterThan(0);
  expect(r.safe).toBeLessThan(0);
  expect(r.pot).toBeGreaterThan(0);
});

/* ---------- b. het venster is drie afgeronde maanden ---------- */
test('b. INKOMEN_VENSTER is 3 en inkomenVenster() geeft de laatste drie AFGERONDE maanden', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ v: INKOMEN_VENSTER, w: inkomenVenster(), nu: nowYMstr() }));
  expect(r.v).toBe(3);
  expect(r.w).toEqual(['2026-07', '2026-08', '2026-09']);
  expect(r.w).not.toContain(r.nu);            // de lopende maand vervuilt de schatting
});

test('b. baseIncome() is 5000 in oktober en 5216 in december', async ({ page }) => {
  await boot(page, {}, '2026-10-02');
  expect(await page.evaluate(() => baseIncome())).toBe(5000);
  await boot(page, {}, '2026-12-10');
  expect(await page.evaluate(() => baseIncome())).toBe(5216);
});

test('b. hij loopt in drie maanden bij in plaats van in vijf', async ({ page }) => {
  const uit = [];
  for (const d of ['2026-10-02', '2026-11-10', '2026-12-10', '2027-01-10']) {
    await boot(page, {}, d);
    uit.push(await page.evaluate(() => ({ nu: nowYMstr(), w: inkomenVenster(), b: baseIncome() })));
  }
  expect(uit.map((x) => x.b)).toEqual([5000, 5000, 5216, 5216]);
  // het venster schuift werkelijk mee; zonder deze eis meet de reeks hierboven de kalender niet
  expect(uit.map((x) => x.w[2])).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  /* de maand waarin het loon begon zit in elk van die vensters, en toch leest oktober 5000: dat is
     de eigenschap die het korte venster NIET weghaalt (de onderste helft blijft de onderste helft) */
  expect(uit[0].w).toContain('2026-09');
});

/* ---------- c. een losse uitschieter verzet de norm niet ---------- */
test('c. een dip is immuun en een piek geeft geen stijging', async ({ page }) => {
  // vlak loon in het hele venster
  const vlak = { '2026-07': LOON, '2026-08': LOON, '2026-09': LOON };
  await boot(page, { inkomen: vlak });
  expect(await page.evaluate(() => baseIncome())).toBe(LOON);

  // EEN dip in het venster: onveranderd
  await boot(page, { inkomen: Object.assign({}, vlak, { '2026-08': 2600 }) });
  expect(await page.evaluate(() => baseIncome())).toBe(LOON);

  // de dip als NIEUWSTE maand: ook onveranderd, dus het is geen kwestie van positie
  await boot(page, { inkomen: Object.assign({}, vlak, { '2026-09': 2600 }) });
  expect(await page.evaluate(() => baseIncome())).toBe(LOON);

  // een piek (vakantiegeld) tilt hem niet
  await boot(page, { inkomen: Object.assign({}, vlak, { '2026-08': LOON + 2500 }) });
  expect(await page.evaluate(() => baseIncome())).toBe(LOON);

  // de piek als NIEUWSTE maand: ook niet. Dit is het geval dat een gewogen gemiddelde WEL zou
  // optillen (gemeten 5216 -> 5930), en dat is de gevaarlijke kant (v168).
  await boot(page, { inkomen: Object.assign({}, vlak, { '2026-09': LOON + 2500 }) });
  expect(await page.evaluate(() => baseIncome())).toBe(LOON);

  // TWEE dips bijten wel, en dat is de prijs van het korte venster, uitgeschreven in plaats van
  // verzwegen: bij zes maanden bijten twee dips ook (nagerekend), dus dit is geen nieuwe zwakte.
  await boot(page, { inkomen: Object.assign({}, vlak, { '2026-08': 2600, '2026-09': 2600 }) });
  expect(await page.evaluate(() => baseIncome())).toBe(2600);
});

/* ---------- d. het venster staat op een plek ---------- */
test('d. baseIncome() leest inkomenVenster() en drukt de snede niet zelf uit', async ({ page }) => {
  await boot(page);
  const bi = await kaalUit(page, 'baseIncome');
  expect(bi).toContain('inkomenVenster()');
  expect(bi).not.toContain('slice(-INKOMEN_VENSTER)');   // die snede staat in inkomenVenster()
  expect(bi).not.toContain('nowYMstr()');
  const src = kaalBron(require('fs').readFileSync('index.html', 'utf8'));
  /* de snede staat twee keer en beide keren in inkomenVenster(): de gewone en de terugval voor een
     gebruiker zonder afgeronde maand. Geen enkele andere functie snijdt hem. */
  expect((src.match(/slice\(-INKOMEN_VENSTER\)/g) || []).length).toBe(2);
  const iv = await kaalUit(page, 'inkomenVenster');
  expect((iv.match(/slice\(-INKOMEN_VENSTER\)/g) || []).length).toBe(2);
});

/* ---------- e. de lopende maand mag de norm niet omlaag halen ---------- */
test('e. een halve maand is geen maand: totals().income zakt niet', async ({ page }) => {
  await boot(page, { oktInkomen: 0 });
  const zonder = await page.evaluate(() => {
    const t = totals(thisYM()); return { inc: t.income, basis: t.incomeBasis, alles: t.incomeAlles, limit: t.limit };
  });
  expect(zonder.inc).toBe(5000);
  expect(zonder.basis).toBe('basisnorm');

  await boot(page, { oktInkomen: 1752 });
  const met = await page.evaluate(() => {
    const t = totals(thisYM()); return { inc: t.income, basis: t.incomeBasis, alles: t.incomeAlles, limit: t.limit, det: t.detectedIncome };
  });
  // zonder de klem stond hier 1752: een gedeeltelijke betaling maakte je maand armer dan geen betaling
  expect(met.det).toBe(1752);
  expect(met.inc).toBe(5000);
  expect(met.basis).toBe('halvemaand');
  expect(met.limit).toBe(zonder.limit);        // de inkomen-limiet beweegt niet mee
  // incomeAlles is het GELD en gaat NIET mee in de klem (v259)
  expect(met.alles).toBe(1752);
});

test('e. meer binnen dan je norm blijft staan, en een afgeronde maand blijft de meting', async ({ page }) => {
  await boot(page, { oktInkomen: 7000 });
  const r = await page.evaluate(() => {
    const t = totals(thisYM()); const sep = totals('2026-09');
    return { inc: t.income, basis: t.incomeBasis, sep: sep.income, sepBasis: sep.incomeBasis };
  });
  expect(r.inc).toBe(7000);                    // alleen OMLAAG wordt geklemd
  expect(r.basis).toBe('gedetecteerd');
  // september is af, en 5216 is daar de meting en niet de norm van 5000
  expect(r.sep).toBe(5216);
  expect(r.sepBasis).toBe('gedetecteerd');

  /* DE SABOTAGE DIE DE KLEM OOK OP AFGERONDE MAANDEN ZET BLEEF HIEROP GROEN, en dat lag aan de
     maand: september ligt met 5216 BOVEN de norm van 5000, dus de klem (die alleen omhoog zet) kan
     daar per constructie niet vuren (meetles a). Het geval dat de twee vormen onderscheidt is een
     afgeronde maand ONDER de norm, en juli is dat met 3800: die blijft de meting en wordt niet naar
     5000 opgetrokken. */
  const jul = await page.evaluate(() => {
    const t = totals('2026-07'); return { inc: t.income, basis: t.incomeBasis, norm: baseIncome() };
  });
  expect(jul.norm).toBe(5000);
  expect(jul.inc).toBe(3800);
  expect(jul.basis).toBe('gedetecteerd');
});

test('e. de nieuwe basis heeft een herkomst-label', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => KPI_INCBRON.halvemaand)).toBeTruthy();
  expect(await page.evaluate(() => KPI_INCBRON.halvemaand)).not.toBe('halvemaand');
});

/* ---------- f. de sub onder "Nog te ontvangen" noemt zijn noemer ---------- */
const nogPost = (page) => page.evaluate(() => {
  const p = (nogDezeMaandPosten() || []).find((x) => /Nog te ontvangen/.test(x.lab || ''));
  const L = monthLiquidity();
  return p ? { val: p.val, sub: p.sub, incDue: L.incDue, norm: L.incNorm, binnen: L.incBinnen } : null;
});

test('f. zonder inkomen deze maand noemt de sub het maandbedrag', async ({ page }) => {
  await boot(page, { oktInkomen: 0 });
  const r = await nogPost(page);
  expect(r).not.toBeNull();
  expect(r.binnen).toBe(0);
  expect(r.incDue).toBe(5000);
  expect(r.sub).toBe('van €5.000 per maand');
  // het grote getal is dan het hele maandbedrag, en de sub zegt dat ook
  expect(r.val).toContain('5.000');
});

test('f. met inkomen deze maand zegt de sub dat het een restant is', async ({ page }) => {
  await boot(page, { oktInkomen: 1752 });
  const r = await nogPost(page);
  expect(r.binnen).toBe(1752);
  expect(r.incDue).toBe(3248);
  expect(r.sub).toBe('€1.752 al binnen van €5.000');
  /* DE TWEE VORMEN ZIJN ONDERSCHEIDBAAR, en dat is de hele melding: zonder de sub leest
     "Nog te ontvangen" in beide standen als hetzelfde soort getal. */
  expect(r.sub).not.toBe('van €5.000 per maand');
});

test('f. de post rekent niets na en leest monthLiquidity()', async ({ page }) => {
  await boot(page, { oktInkomen: 1752 });
  const fn = await kaalUit(page, 'nogDezeMaandPosten');
  expect(fn).toContain('L.incBinnen');
  expect(fn).toContain('L.incNorm');
  expect(fn).not.toContain('baseIncome(');
  // en de twee kanten komen uit de aftrekking die incDue maakte
  const ok = await page.evaluate(() => { const L = monthLiquidity(); return L.incNorm - L.incBinnen === L.incDue; });
  expect(ok).toBe(true);
});

/* ---------- g. de zin onder een negatief herogetal ---------- */
const homeRegel = (page) => page.evaluate(() => {
  go('dash');
  const d = document.querySelector('.homehero [data-krap]');
  const hero = document.querySelector('.homehero');
  const S = safeToSpend();
  return {
    safe: S.safe,
    html: d ? d.innerHTML : '',
    tekst: d ? d.innerText.replace(/\s+/g, ' ').trim() : '',
    acts: d ? [...d.querySelectorAll('[onclick]')].map((e) => e.getAttribute('onclick')) : [],
    heroTekst: hero ? hero.innerText.replace(/\s+/g, ' ').trim() : '',
    claims: safeClaims(S).map((c) => c.key + ':' + c.bedrag),
  };
});

test('g. de zin noemt het tekort en de twee grootste claims met hun route', async ({ page }) => {
  await boot(page);
  const r = await homeRegel(page);
  expect(r.safe).toBeLessThan(0);
  expect(r.tekst).toContain('Je plan vraagt');
  expect(r.tekst).toContain('meer dan er deze maand is');
  // het bedrag is het tekort zelf en wordt niet opnieuw gerekend
  expect(r.tekst).toContain(String(-r.safe).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  /* DE TWEE GROOTSTE CLAIMS, EN DE VOLGORDE WORDT HIER ZELF UITGEREKEND. Mijn eerste vorm nam de
     eerste twee uit safeClaims() en legde die naast de tekst; die functie staat zelf onder test, dus
     de sabotage die de sortering weghaalt bleef groen (meetles a: de code onder test aan beide kanten
     van de vergelijking). De verwachting komt nu uit de RUWE termen van safeToSpend(), en WELKE
     termen een claim zijn staat hier als eigen lijst en niet als een leesbeurt op de vlag in de
     bron: anders schuift de sabotage die er een post bij laat die lijst mee. */
  const MAAND_CLAIMS = ['fixDueRecurring', 'fixDueBudgetExtra', 'reserved', 'saveReserved'];
  const ruw = await page.evaluate((keys) => {
    const S = safeToSpend();
    return keys.map((k) => ({ key: k, label: safeClaim(k).label, bedrag: Math.round(S[k] || 0) }))
      .filter((c) => c.bedrag > 0);
  }, MAAND_CLAIMS);
  const opBedrag = ruw.slice().sort((a, b) => b.bedrag - a.bedrag);
  // de fixture moet werkelijk een ANDERE volgorde op bedrag hebben dan de vaste volgorde van de
  // sheet, anders is "hij sorteert" niet van "hij sorteert niet" te onderscheiden
  expect(opBedrag.map((c) => c.key)).not.toEqual(ruw.map((c) => c.key));
  expect(r.claims).toEqual(opBedrag.map((c) => c.key + ':' + c.bedrag));

  expect(r.acts.length).toBe(2);
  for (const a of r.acts) expect(a).toBeTruthy();
  for (const c of opBedrag.slice(0, 2)) expect(r.tekst).toContain(c.label);
  // de derde claim staat er NIET: die staat een tik verder in de sheet
  if (opBedrag[2]) expect(r.tekst).not.toContain(opBedrag[2].label);
});

test('g. wat al opzij staat is geen claim op deze maand', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const S = safeToSpend();
    return { savedBal: S.savedBal, resBal: S.resBal, claims: safeClaims(S).map((c) => c.key),
             labels: [safeClaim('savedBal').label, safeClaim('resBal').label] };
  });
  /* DE INVOER DRAAGT HET GEVAL: er staat werkelijk EUR 4.000 op de spaarrekening, en dat is het
     GROOTSTE bedrag van alle zes de termen, dus zonder deze regel zou het de eerste claim zijn. */
  expect(r.savedBal).toBe(4000);
  expect(r.resBal).toBeGreaterThan(0);
  expect(r.claims).not.toContain('savedBal');
  expect(r.claims).not.toContain('resBal');

  // en de twee labels staan dus ook niet in de regel, met geen van hun routes erachter
  const h = await homeRegel(page);
  for (const l of r.labels) expect(h.tekst).not.toContain(l);
  expect(h.html).not.toContain('openSavingsPots()');
  expect(h.html).not.toContain('openReserveringen()');

  // de opbouw-sheet toont ze onveranderd WEL: daar gaat het over je hele saldo
  const sheet = await page.evaluate(() => { openSafeToSpend(); return document.querySelector('#sheet').innerText; });
  for (const l of r.labels) expect(sheet).toContain(l);
});

test('g. de dagentelling onder het maandgetal is weg', async ({ page }) => {
  await boot(page);
  const r = await homeRegel(page);
  expect(r.heroTekst).not.toContain('Je ruimte voor deze maand is op');
  expect(r.heroTekst).not.toMatch(/\d+ dagen te gaan/);
  // en bij een POSITIEVE ruimte staat het dagbedrag er onveranderd wel
  await boot(page, { spaarBedrag: 0, geenPotjes: true });
  const p = await page.evaluate(() => { go('dash'); return { safe: safeToSpend().safe, t: document.querySelector('.homehero').innerText }; });
  expect(p.safe).toBeGreaterThan(0);
  expect(p.t).toMatch(/per dag/);
});

test('g. label en route van een claim staan op een plek, met twee lezers', async ({ page }) => {
  await boot(page);
  const sheet = await kaalUit(page, 'openSafeToSpend');
  const regel = await kaalUit(page, 'safeKrapRegel');
  // de sheet drukt de namen en de routes niet meer zelf uit
  for (const lab of ['Al op je spaarrekening', 'Gereserveerd in je potjes', 'Nog te sparen deze maand',
                     'Vaste lasten die nog komen', 'In je reserveringspot']) {
    expect(sheet).not.toContain(lab);
  }
  expect(sheet).toContain("safeClaim('reserved')");
  expect(regel).toContain('safeClaims(');
  // en de sheet toont ze nog steeds
  const t = await page.evaluate(() => { openSafeToSpend(); return document.querySelector('#sheet').innerText; });
  expect(t).toContain('Gereserveerd in je potjes');
  expect(t).toContain('Nog te sparen deze maand');
});

/* ---------- h. "Maak potje" alleen zonder potjes ---------- */
test('h. "Maak potje" staat er niet als je al potjes hebt', async ({ page }) => {
  await boot(page);
  const met = await page.evaluate(() => { go('dash'); return { pot: totalBudget(), safe: safeToSpend().safe, t: document.querySelector('.homehero').innerText }; });
  expect(met.pot).toBeGreaterThan(0);
  expect(met.safe).toBeLessThan(0);
  expect(met.t).not.toContain('Maak potje');

  /* zonder enig potje blijft hij staan: dan is het wel de volgende stap. HET SPAARBEDRAG GAAT HIER
     OMHOOG, en dat is geen truc maar een gevolg: de potjes waren zelf 1.700 van de claims, dus
     zonder potjes is de stand niet meer krap en zou deze helft de regel in een POSITIEVE maand
     toetsen. Iets anders moet die claim dragen. */
  await boot(page, { geenPotjes: true, spaarBedrag: 4300 });
  const zonder = await page.evaluate(() => { go('dash'); return { pot: totalBudget(), safe: safeToSpend().safe, t: document.querySelector('.homehero').innerText }; });
  expect(zonder.pot).toBe(0);
  expect(zonder.safe).toBeLessThan(0);
  expect(zonder.t).toContain('Maak potje');

  /* EEN TERUGKEREND POTJE IS OOK EEN POTJE, en dat is het geval dat `totalBudget()` van
     `varBudget()` onderscheidt: varBudget() laat de terugkerende categorieen eruit, dus met alleen
     een huur-potje is die som nul terwijl je wel degelijk al een potje hebt gemaakt. Zonder dit
     geval is de keuze voor totalBudget() niet te meten (meetles a). */
  await boot(page, { geenPotjes: true, spaarBedrag: 4300, set: { budgets: { huur: 1200 } } });
  const alleenVast = await page.evaluate(() => {
    go('dash');
    return { pot: totalBudget(), varB: varBudget(), safe: safeToSpend().safe,
             t: document.querySelector('.homehero').innerText };
  });
  expect(alleenVast.pot).toBeGreaterThan(0);
  expect(alleenVast.varB).toBe(0);
  expect(alleenVast.safe).toBeLessThan(0);
  expect(alleenVast.t).not.toContain('Maak potje');
});

/* ---------- i. blok 3 drukt het inkomen altijd af ---------- */
test('i. blok 3 noemt baseIncome(), het venster en incDue, ook bij een vast spaarbedrag', async ({ page }) => {
  await boot(page, { oktInkomen: 1752 });
  const r = await page.evaluate(async () => {
    const b = DIAG_BLOKKEN[2];
    const uit = await Promise.resolve(b.lees());
    return { titel: b.titel, t: (Array.isArray(uit) ? uit : [uit]).join('\n'), mode: SET.savingMode };
  });
  expect(r.mode).toBe('amount');                       // de tak die baseIncome() NIET afdrukte
  expect(r.t).toContain('INKOMEN_VENSTER: 3');
  expect(r.t).toContain('2026-07');
  expect(r.t).toContain('2026-09');
  expect(r.t).toMatch(/baseIncome\(\): 5000/);
  expect(r.t).toMatch(/incDue.*3248/);
  expect(r.t).toContain('dit is de gekozen maand');     // de mediaan KIEST een maand
  expect(r.t).toContain('halvemaand');
  // en de termen van safeToSpend(), met de aansluiting
  expect(r.t).toContain('VEILIG TE BESTEDEN, PER TERM');
  for (const k of ['savedBal', 'resBal', 'fixDueRecurring', 'reserved', 'saveReserved']) expect(r.t).toContain(k);
  expect(r.t).toContain('sluit aan: JA');
  expect(r.t).toContain('"Maak potje" staat er: false');
});

test('i. het blok schrijft niets', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const voor = JSON.stringify(localStorage);
    let schrijvers = 0;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (...a) { schrijvers++; return orig(...a); };
    await Promise.resolve(DIAG_BLOKKEN[2].lees());
    localStorage.setItem = orig;
    return { gelijk: voor === JSON.stringify(localStorage), schrijvers };
  });
  expect(r.schrijvers).toBe(0);
  expect(r.gelijk).toBe(true);
});

/* ---------- j. de prijs in pixels ---------- */
for (const [w, h] of [[360, 640], [390, 844]]) {
  test(`j. de hero past op ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    const r = await page.evaluate(() => {
      go('dash');
      const hero = document.querySelector('.homehero');
      const krap = document.querySelector('.homehero [data-krap]');
      if (!krap) return { geenKrap: true };
      const nav = document.querySelector('.nav');
      return { hero: Math.round(hero.getBoundingClientRect().height),
               krap: Math.round(krap.getBoundingClientRect().height),
               bodem: Math.round(krap.getBoundingClientRect().bottom + window.scrollY),
               vouw: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0) };
    });
    expect(r.geenKrap).toBeUndefined();    // de invoer draagt de krappe stand werkelijk
    console.log(`PX ${w}x${h} hero=${r.hero} krapregel=${r.krap} bodem=${r.bodem} vouw=${r.vouw}`);
    expect(r.bodem).toBeLessThan(r.vouw);
  });
}
