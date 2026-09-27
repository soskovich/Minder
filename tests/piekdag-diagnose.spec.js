/* v271: blok 9 van DIAG_BLOKKEN, de piekdag per week.
 *
 * WAT DIT BLOK MEET BESTAAT NOG NIET IN DE APP, en dat is de reden dat het er staat. Signaal 3 van
 * insSignals() werkt per MAAND: piekVerdeling(m) telt per weekdag over de hele maand en
 * piekReferentie(m) vergelijkt aandeel tegen aandeel over drie AFGERONDE maanden, met PIEK_MIN_TX
 * en PIEK_FACTOR. Een duurste dag PER WEEK wordt nergens gerekend, en weekBlokken() (v264) heeft een
 * andere indeling (zeven dagen vanaf de 1e) en een andere scope (varBudget zonder geenNorm zonder
 * huur), dus die getallen zijn hier niet bruikbaar.
 *
 * DE FIXTURE IS DUIDELIJK FICTIEF en draagt niet de toestand van het toestel (v251/v256): de meting
 * op de eigen gegevens van de gebruiker is juist wat dit blok moet opleveren, dus die getallen
 * bestaan hier nog niet. De namen zijn verzonnen en als zodanig gekozen.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - acht volle kalenderweken ma-zo, allemaal voorbij, dus het rapport schrijft de laatste zes uit;
 *  - elke week een overboeking van 300 op zaterdag naar een tegenpartij die de intern-detectie NIET
 *    kent, dus hij telt als uitgave op `overig`. Dat is het geval van v267;
 *  - in een van die weken daarnaast een pinopname die WEL op `intern` landt, dus die mag niet
 *    meetellen;
 *  - in een andere week een boeking van 120 die via OVR op een geenNorm-categorie te zetten is, dus
 *    het weektotaal moet daarmee precies 120 dalen.
 *
 * DE TWEE NORMAAL-BEDRAGEN SPREKEN ELKAAR HIER TEGEN, en dat is met opzet gekozen: een post die in
 * ELKE week terugkomt is het aandeel zelf, dus de zaterdag haalt wel 2x het vlakke dagbedrag en
 * nooit 2x het aandeel-dagbedrag. Precies daarom staan beide in de uitvoer.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// de zondag van de vorige kalenderweek: de laatste zondag die helemaal voorbij is
const laatsteZo = new Date(now);
laatsteZo.setDate(laatsteZo.getDate() - ((now.getDay() + 6) % 7) - 1);
const WEKEN = 8;
function maandagVan(k) { const d = new Date(laatsteZo); d.setDate(d.getDate() - 6 - 7 * (WEKEN - 1 - k)); return d; }
function dag(k, off) { const d = maandagVan(k); d.setDate(d.getDate() + off); return ymd(d); }

const ABN = '100110012555096222';
const OVERB = 'OVERBOEKING V JANSEN-OUD';   // fictief, staat NIET in de intern-rij van RULES
const OPNAME_W = 4;                          // de week met de pinopname
const GEENNORM_W = 5;                        // de week met de boeking die op geenNorm te zetten is

// de zondag van de LOPENDE week; op een zondag is dat vandaag
const komendeZo = new Date(laatsteZo); komendeZo.setDate(komendeZo.getDate() + 7);

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (d, a, n, desc) => tx.push({ id: 'x' + tx.length, date: d, amount: a, acc: ABN,
    name: n, desc: desc || n, typ: '', ref: '', src: 'mt940', accName: '', refNums: [] });
  for (let k = 0; k < WEKEN; k++) {
    add(dag(k, 0), -40, 'Albert Heijn', 'BEA, Albert Heijn');
    add(dag(k, 2), -25, 'Etos', 'BEA, Etos');
    add(dag(k, 4), -35, 'Restaurant Fictie', 'BEA, Restaurant Fictie');
    add(dag(k, 5), -300, 'V Jansen-Oud', OVERB);
    if (k === OPNAME_W) add(dag(k, 5), -100, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT');
    if (k === GEENNORM_W) add(dag(k, 1), -120, 'Bouwmarkt Fictie', 'BEA, Bouwmarkt Fictie');
  }
  // een salaris zodat de app een inkomen kent; inkomen valt buiten de scope van dit blok
  const mAnker = maandagVan(WEKEN - 1);
  add(ymd(new Date(mAnker.getFullYear(), mAnker.getMonth(), 25)), 3200, 'Loonstrook', 'SALARIS MAANDELIJKS');
  /* EEN BOEKING OP DE ZONDAG VAN DE LOPENDE WEEK. Zonder die boeking kan de test niet meten of de
     poort op het verleden werkt: de lus stopt dan al omdat de week niet binnen de import valt, en
     dan is de poort per constructie onzichtbaar (de meetles van v265/v269). Zo'n datum bestaat ook
     echt, want een geplande of pending boeking kan op vandaag of later staan. */
  if (opt.toekomst) add(ymd(komendeZo), -55, 'Etos', 'BEA, Etos');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: true, manualBal: { [ABN]: 4200 },
      budgets: { boodschappen: 400, uiteten: 200, overig: 500 } }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagPiekdag === 'function');
  await page.evaluate(() => {
    window.RIJEN_ = () => diagPiekdag();
    window.REGELS_ = () => diagPiekdag().join(String.fromCharCode(10));
    /* Onafhankelijk narekenen: deze lus gebruikt GEEN enkele hulpfunctie van het blok, zodat de
       vergelijking niet de code aan beide kanten heeft staan (de meetles van v265). */
    window.NAREKEN_ = () => {
      const wk = {};
      for (const t of TX) {
        const c = catOf(t);
        if (!(CATS[c] && CATS[c].type === 'expense')) continue;
        if (isFixed(t)) continue;
        if (geenNorm(c)) continue;
        const d = new Date(String(t.date).slice(0, 10) + 'T00:00:00');
        const ma = new Date(d); ma.setDate(ma.getDate() - ((d.getDay() + 6) % 7));
        const k = ma.getFullYear() + '-' + String(ma.getMonth() + 1).padStart(2, '0') + '-' + String(ma.getDate()).padStart(2, '0');
        (wk[k] = wk[k] || [0, 0, 0, 0, 0, 0, 0])[(d.getDay() + 6) % 7] += -t.amount;
      }
      const uit = {};
      for (const k in wk) { const a = wk[k]; let pi = 0; for (let i = 1; i < 7; i++) if (a[i] > a[pi]) pi = i;
        uit[k] = { pi, bedrag: Math.round(a[pi]), tot: Math.round(a.reduce((x, y) => x + y, 0)) }; }
      return uit;
    };
  });
}

const DN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
// de weekregels en de duurste-dagregels van REEKS 1, op hun label en niet op hun plek (v253)
function weekBlokkenUit(rijen) {
  const uit = [];
  for (let i = 0; i < rijen.length; i++) {
    const m = /^ {2}week (\d{4}-\d{2}-\d{2}) t\/m (\d{4}-\d{2}-\d{2})\s+totaal (-?\d+)\s+(\d+) afschrijvingen/.exec(rijen[i]);
    if (!m) continue;
    const d = /^ {4}duurste dag: (\w+) (\d{4}-\d{2}-\d{2})\s+(-?\d+)/.exec(rijen[i + 1] || '');
    uit.push({ ma: m[1], zo: m[2], tot: +m[3], n: +m[4], dagNaam: d && d[1], dagYmd: d && d[2], dagBedrag: d && +d[3],
      vanaf: i });
  }
  return uit;
}

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('acht volle weken, de overboeking in scope, de opname op intern', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((ob) => ({
      overbVast: TX.filter(t => t.desc === ob).some(t => isFixed(t)),
      overbCat: [...new Set(TX.filter(t => t.desc === ob).map(t => catOf(t)))],
      overbAantal: TX.filter(t => t.desc === ob).length,
      opnameCat: [...new Set(TX.filter(t => /GELDMAAT/.test(t.desc)).map(t => catOf(t)))],
      opnameIsOpname: TX.filter(t => /GELDMAAT/.test(t.desc)).every(t => isOpnameTx(t)),
    }), OVERB);
    // de overboeking mag NIET als vaste last gelden, anders valt hij buiten de scope en meet de test niets
    expect(r.overbVast).toBe(false);
    expect(r.overbCat).toEqual(['overig']);
    expect(r.overbAantal).toBe(WEKEN);
    expect(r.opnameCat).toEqual(['intern']);
    expect(r.opnameIsOpname).toBe(true);
  });

  test('het rapport schrijft zes volle weken uit', async ({ page }) => {
    await boot(page);
    const rijen = await page.evaluate(() => window.RIJEN_());
    const W = weekBlokkenUit(rijen);
    expect(W.length).toBe(6);
    expect(rijen.join('\n')).toContain('volle weken in je import: ' + WEKEN);
  });
});

test.describe('1 - het blok staat in de lijst en leest alleen', () => {
  test('blok 9 is een entry in DIAG_BLOKKEN', async ({ page }) => {
    await boot(page);
    /* v272: dit bond op DIAG_BLOKKEN.length en op de LAATSTE entry, precies de fout die bij v271 in
       rekeningen-diagnose.spec.js is gerepareerd, en hij viel dan ook om zodra blok 10 erbij kwam.
       De eigenschap is dat dit blok EEN entry is en dat diagTekst() geen blok bij naam kent (v244);
       een blok erbij is een entry erbij en daar hoort geen test op te vallen. Twee rondes dezelfde
       fout, dus de teller zelf is het anker dat weg moest. */
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some(b => b.lees === diagPiekdag),
      titel: (DIAG_BLOKKEN.find(b => b.lees === diagPiekdag) || {}).titel,
      inTekst: !/diagPiekdag/.test(String(diagTekst)),
    }));
    expect(r.erin).toBe(true);
    expect(r.titel).toBe('de piekdag per week');
    expect(r.inTekst).toBe(true);   // diagTekst() kent geen blok bij naam (v244)
  });

  test('het hele scherm lezen schrijft niets naar localStorage', async ({ page }) => {
    await boot(page);
    /* GEMETEN OP DE SCHRIJVER en niet op de inhoud achteraf: een schrijver die dezelfde waarde
       terugzet is ook een schrijver (v244). */
    const r = await page.evaluate(async () => {
      const orig = Storage.prototype.setItem; const geschreven = [];
      Storage.prototype.setItem = function (k, v) { geschreven.push(k); return orig.call(this, k, v); };
      try { await diagTekst(); } finally { Storage.prototype.setItem = orig; }
      return geschreven;
    });
    expect(r).toEqual([]);
  });
});

test.describe('2 - de weken zijn volle kalenderweken ma-zo in het verleden', () => {
  test('elke week begint op maandag, eindigt op zondag en is voorbij', async ({ page }) => {
    await boot(page);
    const rijen = await page.evaluate(() => window.RIJEN_());
    const W = weekBlokkenUit(rijen);
    const vandaag = ymd(now);
    for (const w of W) {
      const ma = new Date(w.ma + 'T00:00:00'), zo = new Date(w.zo + 'T00:00:00');
      expect(ma.getDay()).toBe(1);
      expect(zo.getDay()).toBe(0);
      expect((zo - ma) / 86400000).toBe(6);
      expect(w.zo < vandaag).toBe(true);
    }
    // aaneengesloten: elke volgende maandag is zeven dagen later
    for (let i = 1; i < W.length; i++) {
      expect((new Date(W[i].ma + 'T00:00:00') - new Date(W[i - 1].ma + 'T00:00:00')) / 86400000).toBe(7);
    }
  });

  test('de lopende week valt erbuiten, ook als er al een boeking in staat', async ({ page }) => {
    await boot(page, { toekomst: true });
    const rijen = await page.evaluate(() => window.RIJEN_());
    const W = weekBlokkenUit(rijen);
    const vandaag = ymd(now);
    const lopendeMa = ymd(new Date(komendeZo.getTime() - 6 * 86400000));
    /* DE POORT IS `zo >= vandaag` EN NIET ALLEEN `zo > laatste boeking`. Een week die vandaag
       eindigt is niet voorbij; zonder deze eis telt op een zondag de nog lopende week mee als volle
       week. Dat is dezelfde voorzichtige kant als v168: liever een week te weinig dan een halve
       week die als hele leest. */
    expect(W.some(w => w.ma === lopendeMa)).toBe(false);
    for (const w of W) expect(w.zo < vandaag).toBe(true);
    expect(W.length).toBe(6);
  });
});

test.describe('3 - de duurste dag is de weekdag met de hoogste netto som', () => {
  test('per week gelijk aan een onafhankelijke hertelling', async ({ page }) => {
    await boot(page);
    const rijen = await page.evaluate(() => window.RIJEN_());
    const na = await page.evaluate(() => window.NAREKEN_());
    const W = weekBlokkenUit(rijen);
    expect(W.length).toBe(6);
    for (const w of W) {
      const v = na[w.ma];
      expect(v, 'week ' + w.ma + ' ontbreekt in de hertelling').toBeTruthy();
      expect(w.dagNaam).toBe(DN[v.pi]);
      expect(w.dagBedrag).toBe(v.bedrag);
      expect(w.tot).toBe(v.tot);
    }
  });

  test('de zaterdag is zes van zes keer de duurste dag', async ({ page }) => {
    await boot(page);
    const t = (await page.evaluate(() => window.REGELS_()));
    expect(t).toContain('telling duurste weekdag over deze 6 weken: zaterdag 6x');
  });

  test('de twee normaal-bedragen staan er beide, en ze spreken elkaar hier tegen', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('normaal vlak (totaal/7)');
    expect(t).toContain('normaal aandeel (v240-vorm)');
    /* Een post die in ELKE week terugkomt is het aandeel zelf: hij haalt wel 2x het vlakke
       dagbedrag en nooit 2x het aandeel-dagbedrag. Precies daarom staan beide maten in de uitvoer;
       de drempel uit de opdracht is anders niet te beoordelen. */
    expect(t).toContain('haalt 2x het vlakke dagbedrag:    6 van 6 weken');
    expect(t).toContain('haalt 2x het aandeel-dagbedrag:   0 van 6 weken');
  });
});

test.describe('4 - wat buiten de scope valt telt niet mee', () => {
  test('een pinopname staat niet onder de boekingen en wel onder niet meegeteld', async ({ page }) => {
    await boot(page);
    const rijen = await page.evaluate(() => window.RIJEN_());
    const W = weekBlokkenUit(rijen);
    const maOpname = ymd(maandagVan(OPNAME_W));
    const w = W.find(x => x.ma === maOpname);
    expect(w, 'de week met de opname valt buiten het rapport').toBeTruthy();
    // de regels van deze ene week, tot de volgende weekkop
    const volgende = W[W.indexOf(w) + 1];
    const blok = rijen.slice(w.vanaf, volgende ? volgende.vanaf : rijen.length).join('\n');
    expect(blok).toContain('Jansen-Oud');
    expect(blok).not.toMatch(/boekingen op die dag:[\s\S]*?Geldmaat[\s\S]*?niet meegeteld/);
    expect(blok).toMatch(/niet meegeteld deze week \(intern, dus ook opnames\):.*Geldmaat 100/);
    // het bedrag van die dag is de 300 zonder de opname erbij
    expect(w.dagBedrag).toBe(300);
    expect(w.tot).toBe(400);
  });

  test('een geenNorm-boeking haalt precies haar bedrag uit het weektotaal', async ({ page }) => {
    await boot(page);
    const maG = ymd(maandagVan(GEENNORM_W));
    const voor = weekBlokkenUit(await page.evaluate(() => window.RIJEN_())).find(x => x.ma === maG);
    expect(voor.tot).toBe(520);
    // zoals de gebruiker de categorie zet: OVR, zonder save()
    await page.evaluate(() => { const t = TX.find(x => /Bouwmarkt/.test(x.name)); OVR[t.id] = 'onvoorzien'; });
    const na = weekBlokkenUit(await page.evaluate(() => window.RIJEN_())).find(x => x.ma === maG);
    expect(na.tot).toBe(400);
    expect(voor.tot - na.tot).toBe(120);
  });
});

test.describe('5 - de tweede reeks streept een kandidaat weg', () => {
  test('de overboeking staat bovenaan de kandidaten', async ({ page }) => {
    await boot(page);
    const rijen = await page.evaluate(() => window.RIJEN_());
    const i = rijen.findIndex(r => r.startsWith('KANDIDATEN'));
    expect(i).toBeGreaterThan(-1);
    expect(rijen[i + 1]).toContain('Jansen-Oud');
    expect(rijen[i + 1]).toContain('6 van 6 weken');
  });

  test('zonder de overboeking verdwijnt de herhaling op zaterdag', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    const i = t.indexOf('zonder V Jansen-Oud:');
    expect(i).toBeGreaterThan(-1);
    // tot de volgende kandidaat, anders leest de assertie de blok eronder mee
    const rest = t.slice(i + 10);
    const eind = rest.indexOf('  zonder ');
    const blok = t.slice(i, eind < 0 ? t.length : i + 10 + eind);
    /* GEMETEN en niet aangenomen: de zaterdag verdwijnt volledig uit de telling, en wat er
       overblijft is de maandag in vijf weken plus de dinsdag in de week met de boeking van 120.
       Dat laatste is het punt van de reeks: zonder die ene tegenpartij is de duurste dag niet
       langer dezelfde dag maar gewoon de dag waarop je toevallig het meeste uitgaf. */
    expect(blok).toContain('telling duurste weekdag: maandag 5x, dinsdag 1x');
    expect(blok).not.toContain('zaterdag');
    expect(blok).toContain('duurste dag verschuift in 6 van 6 weken');
  });
});

test.describe('6 - de weekmeting leent de maandreferentie niet', () => {
  test('de bron rekent zijn eigen referentie per reeks', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => String(diagPiekdag));
    /* Een reeks met een weggestreepte tegenpartij heeft een ANDERE verdeling, dus ook een andere
       referentie. Leende dit blok piekReferentie(), dan legde de tweede reeks nieuwe dagbedragen
       naast een oude noemer en was het verschil niet toe te wijzen. */
    expect(src).not.toContain('piekReferentie(');
    expect(src).not.toContain('piekVuurt(');
    expect(src).toContain('R.ref');
  });
});
