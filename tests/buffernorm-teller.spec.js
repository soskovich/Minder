/* v302: DE TELLER EN DE NOEMER VAN bufferMaanden(), PER ONDERDEEL. Alleen een uitlezing (v244).
 *
 * DE AANLEIDING: de bufferregel op Grip stond op een ander aantal maanden dan het saldo van de
 * spaarrekening gedeeld door het bedrag uit de noodfonds-sheet. De deling staat op EEN regel, maar
 * geen van beide kanten was per onderdeel te lezen, dus het verschil was niet te plaatsen. Blok 3
 * print spaarSaldo() als GEHEEL en de noemer staat alleen in de sheet.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o):
 * DE TELLER:
 *  - SP1 telt mee via de STANDAARD op de laatste cijfers van de id;
 *  - SP2 draagt diezelfde standaard-cijfers en een eigen keuze die NEE zegt, dus hij telt NIET mee.
 *    Zonder dit geval is isSavingsAcc() niet te onderscheiden van een eigen cijfertest in het blok;
 *  - SP3 draagt die cijfers NIET en een eigen keuze die JA zegt, dus hij telt WEL mee. Dat is
 *    hetzelfde onderscheid, de andere kant op;
 *  - SP3 draagt ook een HANDMATIG saldo dat afwijkt van dat van de bank. accBalance() leest
 *    SET.manualBal eerst, dus zonder dit geval is de rij niet van ACCMETA[a].balance te scheiden;
 *  - RES is de reserveringenrekening EN telt via de standaard mee als spaargeld. Dat is precies het
 *    geval dat de vraag oproept, want dat geld is geen buffer (v128);
 *  - BET telt niet mee en draagt een GROOT saldo. Zonder de kant die wegvalt is een verschil met je
 *    eigen getal niet te plaatsen, en een sabotage die alleen over de meegetelde rekeningen loopt
 *    blijft dan groen;
 *  - de saldi dragen CENTEN, zodat de som van de afgeronde rijen een euro naast Math.round(som)
 *    uitkomt. Zonder centen is die keuze inert (v271);
 *  - SET.extraSavings staat boven nul, want hij is een eigen term in spaarSaldo().
 * DE NOEMER:
 *  - huur is een 'vast'-post met vier gelijke maanden, dus de MEDIAAN;
 *  - belasting valt in EEN van de vier maanden, dus de mediaan is nul en het GEMIDDELDE niet. Dat is
 *    het enige geval waarop die twee basissen uiteenlopen (NF_PERIODIEK);
 *  - boodschappen is 'var' en draagt zijn percentage;
 *  - vervoer draagt een HANDMATIG crisisbedrag, dus auto en meetelt lopen uiteen. Zonder dat verschil
 *    is een som over de auto-kolom niet van een som over de crisis-kolom te onderscheiden;
 *  - uiteten is 'comfort' met vier VERSCHILLENDE maanden, dus mediaan en hoogste maand verschillen;
 *  - overig draagt uitgaven en staat op 'exclude'.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sectieVan } = require('./bron-sectie');

/* SAV_DEFAULT_ENDS is ['4323','1123']; de ids hieronder zijn daarop gekozen. */
const SP1 = 'NL11BANK0000004323';   // standaard JA
const SP2 = 'NL11BANK0000001123';   // standaard JA, eigen keuze NEE
const SP3 = 'NL11BANK0000009911';   // standaard NEE, eigen keuze JA
const RES = 'NL11BANK0000031123';   // standaard JA, en tevens SET.resAcc
const BET = 'NL11BANK0000004840';   // betaalrekening, telt niet mee
const MAANDEN = ['2026-01', '2026-02', '2026-03', '2026-04'];

/* eigen regels winnen van de ingebouwde categorisatie, dus de categorie van elke boeking staat vast
   zonder dat de fixture op een RULES-trefwoord hoeft te leunen. */
const REGELS = [
  { kw: 'ZKAT HUUR', cat: 'huur' }, { kw: 'ZKAT BELASTING', cat: 'belasting' },
  { kw: 'ZKAT BOOD', cat: 'boodschappen' }, { kw: 'ZKAT VERVOER', cat: 'vervoer' },
  { kw: 'ZKAT UITETEN', cat: 'uiteten' }, { kw: 'ZKAT OVERIG', cat: 'overig' },
  { kw: 'ZKAT MUT', cat: 'intern' },
];

function seed(opt) {
  const o = opt || {};
  const tx = []; let i = 0;
  const add = (m, dag, bedrag, kw) => {
    tx.push({ id: 'x' + (i++), date: m + '-' + dag, amount: -bedrag, acc: BET, src: 'mt940',
      name: kw, desc: kw + ' PURMEREND', typ: '', ref: '', accName: '', refNums: [] });
  };
  const uiteten = { '2026-01': 100, '2026-02': 120, '2026-03': 140, '2026-04': 160 };
  for (const m of MAANDEN) {
    add(m, '02', 750, 'ZKAT HUUR');
    add(m, '05', 500, 'ZKAT BOOD');
    add(m, '09', 400, 'ZKAT VERVOER');
    add(m, '12', uiteten[m], 'ZKAT UITETEN');
    add(m, '15', 90, 'ZKAT OVERIG');
  }
  add('2026-02', '20', 1200, 'ZKAT BELASTING');   // een van de vier maanden: mediaan 0, gemiddelde 300
  /* applyOwnAccounts() leidt OWN uit TX af en overschrijft minder_own, dus een rekening bestaat pas
     zodra er een boeking op staat. Deze vier zijn 'intern' via een eigen regel, dus ze raken geen
     enkele categoriesom. */
  for (const a of [SP1, SP2, SP3, RES]) {
    tx.push({ id: 'm' + (i++), date: '2026-04-28', amount: 1, acc: a, src: 'mt940',
      name: 'ZKAT MUT', desc: 'ZKAT MUT BIJSCHRIJVING', typ: '', ref: '', accName: '', refNums: [] });
  }

  const accmeta = {
    [SP1]: { balance: 3480.6, date: '2026-09-29' },
    [SP2]: { balance: 5000, date: '2026-09-29' },
    [SP3]: { balance: 999, date: '2026-09-29' },
    [BET]: { balance: 1500, date: '2026-09-29' },
  };
  if (!o.resZonderSaldo) accmeta[RES] = { balance: 1000, date: '2026-09-29' };

  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({
      limit: 70, autoIncome: false, income: 3000, rules: REGELS,
      savingsAcc: { [SP2]: false, [SP3]: true },
      manualBal: { [SP3]: 200.6 }, manualBalDatum: { [SP3]: '2026-09-19' },
      extraSavings: 300, resAcc: RES,
      /* zonder deze twee draait migrateNfToegewezen() bij de boot en zet de toewijzing GELIJK aan het
         spaarsaldo (v172), en dan is het verschil per constructie nul en toetst sectie 4 niets. */
      nfToegewezen: 2000, nfToegewezenMigrated: true,
      goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 10000, gespaard: 3500, streefdatum: '2027-07' }],
      nfAmount: { vervoer: 100 }, nfMaanden: 4,
      budgets: { boodschappen: 600, huur: 800, vervoer: 500, uiteten: 200, overig: 200 },
    }),
    minder_own: JSON.stringify([SP1, SP2, SP3, RES, BET]),
    minder_accmeta: JSON.stringify(accmeta), minder_plan: '{}',
  };
}

async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagBuffernorm === 'function');
  await page.evaluate(() => { window.REGELS_ = () => diagBuffernorm().join(String.fromCharCode(10)); });
}
const regels = (page) => page.evaluate(() => REGELS_());
/* de rij van EEN rekening, want vijf rijen met dezelfde kolommen zijn anders niet te scheiden
   (meetles h/j: een assertie over de hele tekst ziet een verwisseling niet). */
const rijVan = (t, acc) => {
  const r = t.split('\n').filter((x) => x.includes(acc));
  expect(r.length, 'rekening ' + acc + ' staat precies een keer in de teller').toBe(1);
  return r[0];
};
const sectie = (t, van, tot) => {
  const i = t.indexOf(van); expect(i, van).toBeGreaterThan(-1);
  const j = tot ? t.indexOf(tot, i) : -1;
  return t.slice(i, j > -1 ? j : undefined);
};

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('het venster is vier afgeronde maanden, met de medianen die de comment noemt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const M = noodfondsModel();
      const per = (c) => M.win.map((m) => Math.round(catSpendMap(m)[c] || 0));
      return { win: M.win, n: M.n, winLopend: M.winLopend,
        huur: per('huur'), belasting: per('belasting'), bood: per('boodschappen'), verv: per('vervoer'),
        uit: per('uiteten'), ov: per('overig') };
    });
    expect(r.win, 'de vier maanden van de fixture, en de lopende maand telt niet mee').toEqual(MAANDEN);
    expect(r.n).toBe(4);
    expect(r.winLopend, 'er zijn afgeronde maanden, dus geen terugval').toBe(false);
    expect(r.huur, 'huur is vier gelijke maanden').toEqual([750, 750, 750, 750]);
    expect(r.belasting, 'belasting valt in een van de vier: mediaan 0, gemiddelde 300')
      .toEqual([0, 1200, 0, 0]);
    expect(r.bood).toEqual([500, 500, 500, 500]);
    expect(r.verv).toEqual([400, 400, 400, 400]);
    expect(r.uit, 'uiteten loopt op, dus mediaan en hoogste maand verschillen').toEqual([100, 120, 140, 160]);
    expect(r.ov, 'overig draagt uitgaven en staat op exclude').toEqual([90, 90, 90, 90]);
  });

  test('de eigen keuze spreekt de standaard op twee rekeningen tegen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([sp1, sp2, sp3, res, bet]) => {
      const cijfers = (a) => SAV_DEFAULT_ENDS.some((e) => a.endsWith(e));
      const rij = (a) => ({ telt: isSavingsAcc(a), cijfers: cijfers(a),
        eigen: Object.prototype.hasOwnProperty.call(SET.savingsAcc || {}, a) });
      return { sp1: rij(sp1), sp2: rij(sp2), sp3: rij(sp3), res: rij(res), bet: rij(bet),
        sav: n26SavingsAccounts().slice().sort() };
    }, [SP1, SP2, SP3, RES, BET]);
    expect(r.sp1, 'SP1: standaard JA, geen eigen keuze').toEqual({ telt: true, cijfers: true, eigen: false });
    expect(r.sp2, 'SP2: standaard JA, eigen keuze NEE, dus telt niet mee')
      .toEqual({ telt: false, cijfers: true, eigen: true });
    expect(r.sp3, 'SP3: standaard NEE, eigen keuze JA, dus telt wel mee')
      .toEqual({ telt: true, cijfers: false, eigen: true });
    expect(r.res.telt, 'de reserveringenrekening telt hier via de standaard mee als spaargeld').toBe(true);
    expect(r.bet.telt).toBe(false);
    expect(r.sav, 'drie rekeningen tellen mee').toEqual([SP1, RES, SP3].slice().sort());
  });

  test('de saldi dragen centen, dus per rij afronden geeft een andere som', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const bal = n26SavingsAccounts().map((a) => accBalance(a)).filter((b) => b != null);
      return { somAfgerond: Math.round(bal.reduce((x, b) => x + b, 0)),
        rijenAfgerond: bal.reduce((x, b) => x + Math.round(b), 0) };
    });
    expect(r.somAfgerond, 'zoals de app hem maakt').toBe(4681);
    expect(r.rijenAfgerond, 'en per rij afronden geeft een euro meer, dus de keuze is niet inert').toBe(4682);
  });
});

test.describe('1 - de teller per onderdeel', () => {
  test('de meegetelde rekeningen staan met saldo, saldodatum en leeftijd', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('TELT MEE ALS SPAARGELD: 3 van 5 rekeningen');
    const r1 = rijVan(t, SP1);
    expect(r1).toContain('3480.60');
    expect(r1).toContain('2026-09-29');
    expect(r1).toContain('bank');
  });

  test('een handmatig saldo wint van dat van de bank, en de rij zegt dat', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const r3 = rijVan(t, SP3);
    expect(r3, 'accBalance() leest SET.manualBal eerst').toContain('200.60');
    expect(r3, 'en niet het saldo van de bank').not.toContain('999');
    expect(r3).toContain('handmatig');
    expect(r3, 'met de datum van de handmatige invoer').toContain('2026-09-19');
  });

  test('de niet-meegetelde rekeningen staan er ook, met hun saldo', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const buiten = sectie(t, 'TELT NIET MEE', 'som van de meegetelde saldi');
    expect(buiten, 'SP2 valt weg op een eigen keuze en draagt 5000').toContain(SP2);
    expect(buiten).toContain('5000.00');
    expect(buiten, 'de betaalrekening valt weg op de standaard').toContain(BET);
    expect(buiten, 'en de meegetelde rekeningen staan hier niet').not.toContain(SP1);
  });

  test('de reserveringenrekening wordt aangewezen', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(rijVan(t, RES)).toContain('<-- SET.resAcc');
  });

  test('de aansluiting op spaarSaldo().cur, met extraSavings als eigen term', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('som van de meegetelde saldi: 4681.20   over 3 rekening(en) met een bekend saldo');
    expect(t).toContain('SET.extraSavings: 300');
    expect(t).toContain('spaarSaldo(): cur=4981  missing=false  bron=spaarrekening');
    expect(t).toContain('Math.round(som van de saldi) + extraSavings = 4681 + 300 = 4981');
    expect(t).toContain('sluit aan op spaarSaldo().cur: JA');
    expect(t).toContain('meegeteld zonder bekend saldo: 0');
    expect(t).toContain('noodfondsModel().spaar (de teller van de deling): 4981');
  });
});

test.describe('2 - een meegetelde rekening zonder saldo zet de hele teller op null', () => {
  test('dan geeft bufferMaanden() null en staat de rij niet op Grip', async ({ page }) => {
    await boot(page, { resZonderSaldo: true });
    const t = await regels(page);
    const echt = await page.evaluate(() => ({ bm: bufferMaanden(), spaar: noodfondsModel().spaar,
      missing: spaarSaldo().missing, cur: spaarSaldo().cur }));
    expect(echt.missing, 'een meegetelde rekening zonder bekend saldo').toBe(true);
    expect(echt.cur, 'de som van de bekende kant loopt wel door').toBe(3981);
    expect(echt.spaar, 'maar noodfondsModel() geeft null').toBe(null);
    expect(echt.bm, 'en dan is er geen deling').toBe(null);
    expect(t).toContain('meegeteld zonder bekend saldo: 1');
    expect(t).toContain('bufferMaanden(): null, dus de rij staat NIET op Grip');
    expect(rijVan(t, RES)).toContain('ONBEKEND');
  });
});

test.describe('3 - de noemer per post', () => {
  test('elke post staat met zijn basis, de schatting en wat er meetelt', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const n = sectie(t, '2. DE NOEMER', '3. DE DELING');
    expect(n).toContain('venster: 2026-01 t/m 2026-04   4 maand(en)   de lopende maand telt niet mee');
    expect(n).toMatch(/vast\s+Huur\s+mediaan\s+750\s+750\s+de schatting/);
    expect(n).toMatch(/var\s+Boodschappen\s+mediaan x 80%\s+400\s+400\s+de schatting/);
  });

  test('een periodieke post neemt het gemiddelde en niet de mediaan', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const n = sectie(t, '2. DE NOEMER', '3. DE DELING');
    expect(n, 'de mediaan is hier nul, dus het gemiddelde is het enige dat deze post kan dragen')
      .toMatch(/vast\s+Belasting & boetes\s+gemiddeld\s+300\s+300\s+de schatting/);
  });

  test('een handmatig bedrag wint van de schatting, en de som telt dat', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const n = sectie(t, '2. DE NOEMER', '3. DE DELING');
    expect(n, 'auto 260 uit 400 maal 65 procent, en 100 is wat meetelt')
      .toMatch(/var\s+Vervoer & auto\s+mediaan x 65%\s+260\s+100\s+HANDMATIG door jou/);
    expect(n).toContain('som van de rijen');
    expect(n).toMatch(/som van de rijen\s+1550/);
    expect(n, 'en dat is essCrisis, niet de som van de auto-kolom (die is 1710)')
      .toContain('essCrisis: 1550   sluit aan op de som van de rijen: JA');
  });

  test('wat buiten de noemer valt staat erbij, met de klasse erboven', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const n = sectie(t, '2. DE NOEMER', '3. DE DELING');
    expect(n, 'mediaan 130 en hoogste maand 160, dus de twee kolommen zeggen niet hetzelfde')
      .toMatch(/comfort\s+Uit eten & café\s+mediaan\s+130\s+hoogste maand\s+160/);
    expect(n).toContain('samen (comfortTot): 130 per maand');
    expect(n).toContain('exclude: persoonlijk, overig');
    expect(n).toContain('niet in de indeling, dus ook exclude: onvoorzien, contant');
    expect(n, 'zonder de crisis-kortingen ligt het hoger')
      .toContain('essNormaal (zonder de crisis-kortingen): 1950   doel: 6200 (4 mnd)');
  });
});

test.describe('4 - de deling en het venster van de afronding', () => {
  test('het blok noemt de deling, het getoonde cijfer en het venster van de teller', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const echt = await page.evaluate(() => bufferMaanden());
    expect(echt, '4981 / 1550').toBeCloseTo(3.2135, 3);
    expect(t).toContain('bufferMaanden(): 3.2135');
    expect(t).toContain('Grip toont er 3,2 van');
    expect(t, 'de grenzen komen uit de afronding zelf: 1550 maal 3,15 en 3,25')
      .toContain('MOET DE TELLER TUSSEN 4883 EN 5037 LIGGEN, bij noemer 1550');
    expect(t).toContain('teller nu: 4981   noemer nu: 1550   4981 / 1550 = 3.2135');
    expect(t).toContain('kritiek onder 3 maanden, en je eigen richt staat op 4');
  });

  test('de toewijzingen op Plan staan naast de teller, want daar gaat de volgende ronde over', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    const s = sectie(t, '4. WAT DE VOLGENDE RONDE NODIG HEEFT');
    expect(s, 'het noodfonds draagt SET.nfToegewezen').toContain('toegewezen     2000   van     6200   (SET.nfToegewezen)');
    expect(s, 'en een doel draagt zijn eigen gespaard').toContain('Kosten Koper');
    expect(s, 'samen is er meer toegewezen dan er op de rekening staat, en dat is de controle die de'
      + ' volgende ronde bouwt').toContain('som van de toewijzingen: 5500   tegen de teller van sectie 1: 4981   verschil: -519');
    expect(s, 'een aflos-item hoort er niet bij').toContain('Aflos-items staan er niet bij');
  });
});

test.describe('5 - de bron: geen tweede uitdrukking, en het blok schrijft niets', () => {
  const bron = () => sectieVan(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'),
    'function diagBuffernorm(){');

  test('de selectie, het saldo en de som komen uit de app en worden niet opnieuw uitgedrukt', async () => {
    const s = bron();
    for (const fn of ['isSavingsAcc(', 'accBalance(', 'accBalanceDatum(', 'spaarSaldo(',
      'noodfondsModel(', 'bufferMaanden(', 'planMap(']) {
      expect(s, 'het blok leest ' + fn).toContain(fn);
    }
    expect(s, 'geen eigen cijfertest naast isSavingsAcc(): dan lopen de twee bij de eerste wijziging uiteen')
      .not.toContain('endsWith');
    expect(s, 'en geen eigen saldo-lezer naast accBalance(), die SET.manualBal eerst leest')
      .not.toMatch(/ACCMETA\[[^\]]*\]\s*\.\s*balance/);
    expect(s, 'de noemer komt uit crisisRows en wordt niet per categorie nagerekend').toContain('crisisRows');
    expect(s).not.toContain('nfMedian(');
  });

  test('het blok schrijft niets (v244)', async () => {
    const s = bron();
    for (const w of ['save(', 'localStorage', 'psd2Api(', 'commitTx(']) {
      expect(s, 'een diagnoseblok leest alleen: ' + w).not.toContain(w);
    }
  });

  test('het register draagt het blok, gebonden op de lees-functie en niet op een positie', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some((b) => b.lees === diagBuffernorm),
      titel: (DIAG_BLOKKEN.find((b) => b.lees === diagBuffernorm) || {}).titel,
    }));
    expect(r.erin, 'een blok erbij is een entry erbij (v244); dit bindt niet op length').toBe(true);
    expect(r.titel).toContain('bufferMaanden()');
  });
});
