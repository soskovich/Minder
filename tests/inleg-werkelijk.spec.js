/* v319: DE SPAARINLEG OP PLAN TEGENOVER WAT ER WERKELIJK GESPAARD IS.
   GEMETEN AANLEIDING (stap 0 van deze ronde, op een fixture met de vorm van het toestel): de cap op
   Plan is een INSTELLING en leest geen enkele boeking, dus bij een werkelijke inleg van 2.200, 900
   en 0 was de hele waterval-kaart KARAKTER VOOR KARAKTER gelijk - zelfde cap, zelfde alloc, zelfde
   eta, en geen woord op het scherm dat het verschil noemde.
   DRIE DINGEN IN DEZE RONDE, en de vierde (de datums laten meebewegen) uitdrukkelijk NIET:
   a) blok 5 zegt WELKE tak van monthlySavingTarget() het getal maakte, en wat savedNet() ernaast telt;
   b) planInlegRegel() zet de meting onder de instelling, uit savedNet() - dezelfde bron als de post
      "Nog te sparen" op Inzichten, die hem via safeToSpend().savedThisMonth leest;
   c) "Verdeel volgens je plan" verdeelt het vrije spaargeld met planVerdeelMaand(), dezelfde functie
      als allocatePlan() en planVooruit(), met het vrije bedrag als cap. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const KK = 'gKK', IW = 'gIW';
const DAG = '2026-10-15';

/* De stand van het toestel: inleg-INSTELLING 2.200 (amount), twee doelen op 90/10, buffer vol op
   4.000, een aangewezen spaarrekening met vier volle maanden erachter. `okt` is wat er deze maand
   werkelijk naar die rekening ging; `saldo` loopt daarmee mee, want anders meet de spaarVrij-helft
   iets anders dan de savedNet-helft. */
function seed(o) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    add(m, '03', 4200, 'Werkgever', 'SALARIS LOON');
    add(m, '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '06', 2200, 'Spaarpot', 'NAAR SPAREN', SAV);
    /* comfort-uitgaven, alleen nodig voor de terugval-stand: zonder een mediaan in een
       comfort-categorie is noodfondsModel().comfortTot nul, en dan is planCapacity() nul en valt de
       regel al op zijn eigen cap-poort weg in plaats van op de terugval (meetles a). */
    if (o.comfort) add(m, '12', -o.comfort, 'Restaurant', 'BEA RESTAURANT');
  }
  add('2026-10', '03', 4200, 'Werkgever', 'SALARIS LOON');
  add('2026-10', '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  if (o.okt) add('2026-10', '06', o.okt, 'Spaarpot', 'NAAR SPAREN', SAV);
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4200, limit: 70, bufferNorm: 2, nfMaanden: 3,
    savingsEnds: ['4323'], manualBal: { [MAIN]: 3000, [SAV]: o.saldo },
    budgets: { huur: 900 }, budgetsNext: {}, budgetMonth: '2026-10',
    savingMode: 'amount', savingAmount: 2200,
    nfDoelVast: 4000, nfToegewezen: o.nf == null ? 4000 : o.nf, nfToegewezenMigrated: 1,
    planOrder: ['noodfonds', KK, IW],
    goals: [
      { id: KK, naam: 'Kosten Koper', doel: 15000, gespaard: o.kk || 0, streefdatum: '2027-05', allocMode: 'pct', pct: 90 },
      { id: IW, naam: 'Inrichting woning', doel: 3000, gespaard: o.iw || 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDatum(page, o.dag || DAG);
  if (o.breedte) await page.setViewportSize({ width: o.breedte, height: o.hoogte || 844 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof spaarVerdeelVoorstel === 'function');
  await page.evaluate(() => go('vooruit'));
}
/* de drie standen uit de meting van stap 0: de inleg gehaald, de helft, en niets */
const STANDEN = [
  ['gehaald', { okt: 2200, saldo: 13000 }, 2200],
  ['de helft', { okt: 900, saldo: 11700 }, 900],
  ['niets', { okt: 0, saldo: 10800 }, 0],
];

/* ===== a) DE INVOER: DE DRIE STANDEN VERSCHILLEN ECHT ===== */
test.describe('a · de invoer', () => {
  /* Zonder deze meting is "de regel leest savedNet()" niet te onderscheiden van "de regel leest de
     instelling": die staat in alle drie op 2.200 (meetles a). */
  test('savedNet verschilt per stand en de instelling niet', async ({ page }) => {
    const uit = {};
    for (const [nm, o] of STANDEN) {
      await boot(page, o);
      uit[nm] = await page.evaluate(() => ({ net: savedNet(thisYM()), cap: planCapacity(),
        tgt: monthlySavingTarget(), terugval: planCapTerugval() }));
    }
    for (const [nm, , verwacht] of STANDEN) {
      expect(uit[nm].net, nm + ' savedNet').toBe(verwacht);
      expect(uit[nm].cap, nm + ' planCapacity').toBe(2200);
      expect(uit[nm].tgt, nm + ' monthlySavingTarget').toBe(2200);
      expect(uit[nm].terugval, nm + ' terugval').toBe(false);
    }
  });
});

/* ===== b) DE REGEL ONDER DE INLEG ===== */
test.describe('b · de werkelijke inleg naast de ingestelde', () => {
  for (const [nm, o, verwacht] of STANDEN) {
    test(`${nm}: de regel noemt ${verwacht} en leest savedNet`, async ({ page }) => {
      await boot(page, o);
      const r = await page.evaluate(() => {
        const e = document.querySelector('#planInleg');
        return e ? { tekst: e.innerText.replace(/\s+/g, ' ').trim(),
          inleg: +e.dataset.inleg, cap: +e.dataset.cap,
          kleur: getComputedStyle(e).color,
          mut: getComputedStyle(document.documentElement).getPropertyValue('--mut').trim() } : null;
      });
      expect(r, 'de regel staat er').toBeTruthy();
      /* HET GETAL KOMT UIT DE MEETBRON EN NIET UIT DE INSTELLING: het attribuut draagt savedNet(). */
      expect(r.inleg, nm).toBe(verwacht);
      expect(r.cap, nm).toBe(2200);
      expect(r.tekst, nm).toBe(verwacht >= 2200
        ? 'deze maand €2.200 opzij'
        : `deze maand €${verwacht === 900 ? '900' : '0'} van €2.200 opzij`);
    });
  }

  /* HIJ ZEGT HET ALS FEIT: geen amber en geen rood, ook niet als er niets opzij ging (v78/v93). */
  test('een lagere inleg is geen alarm: dezelfde kleur als een gehaalde', async ({ page }) => {
    const kleur = {};
    for (const [nm, o] of STANDEN) {
      await boot(page, o);
      kleur[nm] = await page.evaluate(() => {
        const e = document.querySelector('#planInleg');
        const c = getComputedStyle(e).color;
        const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim();
        const rood = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
        const t = document.createElement('div'); t.style.color = 'var(--mut)';
        document.body.appendChild(t); const mut = getComputedStyle(t).color; t.remove();
        return { c, amber, rood, mut };
      });
    }
    expect(new Set(Object.values(kleur).map((x) => x.c)).size, 'één kleur in alle drie').toBe(1);
    expect(kleur.niets.c).toBe(kleur.niets.mut);
    expect(kleur.niets.c).not.toBe(kleur.niets.amber);
    expect(kleur.niets.c).not.toBe(kleur.niets.rood);
  });

  /* EEN NEGATIEF NETTO HEEFT ZIJN EIGEN VORM (v262): wat je eruit haalde, zonder minteken en zonder
     alarm. Zonder dit geval is "drie vormen" niet van "twee vormen" te onderscheiden. */
  /* v365: met een bak om naar terug te zetten is "eruit gehaald" een keuze geworden (terugzetKaart); de losse
     regel staat er alleen nog zonder bak. */
  test('meer eruit dan erin: de kaart zegt wat je eruit haalde, en de losse regel staat er niet', async ({ page }) => {
    await boot(page, { okt: -500, saldo: 8100 });
    const r = await page.evaluate(() => ({ regel: !!document.querySelector('#planInleg'), net: savedNet(thisYM()),
      k: (document.querySelector('#terugzetKaart') || {}).dataset, t: (document.querySelector('#terugzetKaart') || {}).innerText || '' }));
    expect(r.net).toBe(-500);
    expect(r.regel).toBe(false);
    expect(+r.k.terugzet).toBe(500);
    expect(r.t).toContain('€500 eruit gehaald in oktober');
  });

  /* ONBEKEND BLIJFT ONBEKEND (v59/v73/v173): zonder aangewezen spaarrekening EN zonder boeking op de
     categorie sparen geeft savedNet() null, en dan staat er niets in plaats van een nul.
     DAT IS EEN BEWUST VERSCHIL MET INZICHTEN, en dat staat hier als assertie naast elkaar:
     safeToSpend() leest diezelfde null als nul, want dat getal gaat in `safe` en nul is daar de
     voorzichtige kant (v168). Zonder die tweede helft leest deze test als een tegenspraak. */
  test('onbekende inleg: Plan zwijgt, en safeToSpend() leest hem als nul', async ({ page }) => {
    await boot(page, { okt: 0, saldo: 10800,
      set: { savingsEnds: [], savingsAcc: { [SAV]: false }, savingsAccMigrated: 1 } });
    const r = await page.evaluate(() => ({
      net: savedNet(thisYM()), rek: n26SavingsAccounts().length,
      regel: document.querySelector('#planInleg'),
      safeSaved: safeToSpend().savedThisMonth,
    }));
    expect(r.rek, 'geen rekening telt mee').toBe(0);
    expect(r.net, 'en geen boeking op de categorie sparen').toBe(null);
    expect(r.regel, 'dus Plan zegt niets').toBe(null);
    expect(r.safeSaved, 'terwijl safeToSpend() er nul van maakt').toBe(0);
  });

  /* EN NIETS OP DE TERUGVAL: dan is de cap comfortTot en geen spaarinleg, en savedNet() ernaast
     zetten zou twee verschillende grootheden vergelijken. */
  test('op de terugval staat de regel er niet', async ({ page }) => {
    await boot(page, { okt: 900, saldo: 11700, comfort: 300, set: { savingAmount: 0 } });
    const r = await page.evaluate(() => ({ terugval: planCapTerugval(), cap: planCapacity(),
      tgt: monthlySavingTarget(), net: savedNet(thisYM()),
      regel: document.querySelector('#planInleg'),
      kop: [...document.querySelectorAll('#s-vooruit .card')]
        .find((c) => c.querySelector('.inleg-balk')).innerText.split('\n')[0] }));
    expect(r.tgt, 'de invoer: geen spaarinleg ingesteld').toBe(0);
    expect(r.net, 'maar er ging wel geld opzij, dus het zwijgen komt niet van een onbekende meting').toBe(900);
    expect(r.terugval, 'de invoer: de cap komt uit comfortTot').toBe(true);
    expect(r.cap).toBeGreaterThan(0);
    expect(r.kop).toMatch(/comfortabele ruimte/);
    expect(r.regel).toBe(null);
  });

  /* ÉÉN BRON, EN DAT STAAT OP DE BRON VAST: de regel leest savedNet() en rekent geen eigen som over
     de boekingen (v104). Zonder deze assertie kan een volgende ronde er een tweede telling van maken
     die bij de eerste wijziging van savedNet() uiteenloopt. */
  test('planInlegRegel leest savedNet en telt niet zelf', async ({ page }) => {
    await boot(page, { okt: 900, saldo: 11700 });
    const src = await kaalUit(page, 'planInlegRegel');
    expect(src).toMatch(/savedNet\(/);
    expect(src).toMatch(/planCapacity\(/);
    expect(src, 'geen eigen lus over de boekingen').not.toMatch(/txOfMonth\(|\.filter\(|reduce\(/);
  });
});

/* ===== c) VERDEEL VOLGENS JE PLAN ===== */
test.describe('c · het vrije spaargeld verdelen', () => {
  /* DE STAND VAN HET TOESTEL, en de datums die de meting van stap 0 na de bestaande knop gaf.
     DE TWEE ROUTES GEVEN HIER DEZELFDE DATUMS EN ANDERE BEDRAGEN, en dat staat er allebei: zonder de
     bedragen is "hij verdeelt volgens je plan" niet van "hij zet alles op het bovenste doel" te
     onderscheiden (meetles a). Dat de datums samenvallen is een eigenschap van DEZE stand en geen
     eigenschap van de twee routes. */
  test('op de gemeten stand: 8.100 / 900, en vol in feb 2027 en mrt 2027', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    const V = await page.evaluate(() => spaarVerdeelVoorstel());
    expect(V.vrij).toBe(9000);
    expect(V.som).toBe(9000);
    expect(V.rest).toBe(0);
    expect(V.regels.map((r) => [r.naam, r.bij, r.datum])).toEqual([
      ['Kosten Koper', 8100, 'feb 2027'],
      ['Inrichting woning', 900, 'mrt 2027'],
    ]);
    // en de datums die er NU staan, zodat het gevolg leesbaar is
    expect(V.regels.map((r) => r.etaVoor)).toEqual([8, 9]);
    expect(V.regels.map((r) => r.eta)).toEqual([4, 5]);
  });

  test('na het bevestigen staat het op de doelen en zijn de vaten het eens', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    await page.evaluate(() => { openSpaarVerdeel(); spaarVerdeelDoen(); });
    const na = await page.evaluate(() => ({
      goals: (SET.goals || []).map((g) => [g.naam, g.gespaard]),
      nf: SET.nfToegewezen, vrij: spaarVrij().vrij,
      eta: allocatePlan().filter((p) => p.type === 'goal').map((p) => p.eta),
      vol: [...document.querySelectorAll('#s-vooruit [data-vol]')]
        .map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
    }));
    expect(na.goals).toEqual([['Kosten Koper', 8100], ['Inrichting woning', 900]]);
    expect(na.nf, 'de buffer stond al vol en krijgt niets').toBe(4000);
    expect(na.vrij, 'er blijft niets vrij').toBe(0);
    expect(na.eta).toEqual([4, 5]);
    /* DE VATEN LEZEN DEZELFDE PROJECTIE als het voorstel, en dat is de aansluiting: het sheet beloofde
       feb en mrt 2027 en dat is wat er na de tik op het scherm staat. */
    expect(na.vol).toEqual(['vol feb 2027', 'vol mrt 2027']);
  });

  /* DE TWEE KNOPPEN GEVEN EEN ANDERE VERDELING, en dat is het verschil waarvoor de tweede bestaat.
     GEMETEN tegen elkaar op dezelfde stand: de bestaande knop zet alles op het bovenste doel. */
  test('de bestaande knop zet alles op het bovenste doel, deze verdeelt', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    await page.evaluate(() => spaarVrijToe(spaarVrijDoel().id));
    const oud = await page.evaluate(() => (SET.goals || []).map((g) => [g.naam, g.gespaard]));
    expect(oud).toEqual([['Kosten Koper', 9000], ['Inrichting woning', 0]]);
  });

  /* DE GRENDEL GELDT OOK HIER: een buffer die niet vol is pakt het vrije geld eerst, precies zoals
     een maandinleg (v242). Zonder dit geval is "hij leent planVerdeelMaand()" niet te onderscheiden
     van "hij verdeelt naar de percentages". */
  test('een buffer die niet vol is pakt het vrije geld eerst', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000, nf: 1000 });
    const V = await page.evaluate(() => spaarVerdeelVoorstel());
    expect(V.vrij, 'saldo 13.000 min 1.000 toegewezen').toBe(12000);
    expect(V.regels[0].naam).toBe('Noodfonds');
    expect(V.regels[0].bij, 'eerst de 3.000 die de buffer nog nodig heeft').toBe(3000);
    const rest = V.regels.slice(1).reduce((a, r) => a + r.bij, 0);
    expect(rest, 'en de rest gaat door naar de doelen').toBe(9000);
    /* EN DE SCHRIJVER TELT OP BIJ WAT ER STOND en vervangt het niet: zonder deze assertie leest een
       schrijver die `SET.nfToegewezen = bij` doet er hetzelfde uit zolang de buffer op nul staat. */
    await page.evaluate(() => { openSpaarVerdeel(); spaarVerdeelDoen(); });
    const na = await page.evaluate(() => ({ nf: SET.nfToegewezen,
      goals: (SET.goals || []).map((g) => g.gespaard), vrij: spaarVrij().vrij }));
    expect(na.nf, '1.000 dat er stond plus de 3.000 uit het voorstel').toBe(4000);
    expect(na.goals.reduce((x, y) => x + y, 0)).toBe(9000);
    expect(na.vrij).toBe(0);
  });

  /* ER BLIJFT OVER WAT NIEMAND NODIG HEEFT, en het voorstel zegt dat in plaats van het weg te laten. */
  test('meer vrij dan het plan nodig heeft: de rest blijft staan', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 30000 });
    const V = await page.evaluate(() => spaarVerdeelVoorstel());
    expect(V.vrij).toBe(26000);
    expect(V.som, 'samen hebben de doelen nog 18.000 nodig').toBe(18000);
    expect(V.rest).toBe(8000);
    expect(V.regels.every((r) => r.eta === 0), 'allebei daarmee vol').toBe(true);
    const sheet = await page.evaluate(() => { openSpaarVerdeel();
      return document.querySelector('#sheet').innerText.replace(/\s+/g, ' '); });
    expect(sheet).toMatch(/€8\.000 blijft staan/);
    expect(sheet).toMatch(/daarmee vol/);
  });

  /* DE KNOP STAAT ER ALLEEN ALS HIJ IETS ANDERS DOET. Met één bestemming die iets kan opnemen geeft
     de waterval hetzelfde als spaarVrijToe(), en een tweede knop met dezelfde uitkomst is een keuze
     zonder verschil. Beide kanten gemeten, want zonder de eerste helft toetst dit niets. */
  test('met twee bestemmingen staat hij er, met één niet', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    expect(await page.evaluate(() => spaarVerdeelMag())).toBe(true);
    expect(await page.evaluate(() =>
      !!document.querySelector('#s-vooruit .spaar-vrij [onclick*="openSpaarVerdeel"]'))).toBe(true);
    // Inrichting woning vol: dan blijft er één bestemming over die nog iets kan opnemen
    await boot(page, { okt: 2200, saldo: 13000, iw: 3000 });
    const r = await page.evaluate(() => ({
      mag: spaarVerdeelMag(),
      regels: (spaarVerdeelVoorstel() || { regels: [] }).regels.length,
      knop: !!document.querySelector('#s-vooruit .spaar-vrij [onclick*="openSpaarVerdeel"]'),
    }));
    expect(r.regels, 'de invoer: nog maar één bestemming neemt iets op').toBe(1);
    expect(r.mag).toBe(false);
    expect(r.knop).toBe(false);
  });

  /* EEN AFLOS-ITEM DOET NIET MEE (v100), en dat is hier geen derde afbakening maar dezelfde die
     spaarOverItems() en spaarVrijDoel() al maken: zijn voortgang volgt uit de restschuld. Zonder een
     aflos-item in de fixture is die filter inert (meetles p). */
  test('een aflos-item krijgt niets, ook niet als het bovenaan staat', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000, set: {
      debts: [{ id: 'd1', naam: 'Lening', rest: 5000, start: 8000, rente: 6, perMaand: 200 }],
      planOrder: ['af:d1', 'noodfonds', KK, IW] } });
    const r = await page.evaluate(() => ({
      plan: allocatePlan().map((p) => p.id),
      regels: spaarVerdeelVoorstel().regels.map((x) => x.id) }));
    expect(r.plan, 'de invoer: het aflos-item staat bovenaan in het plan').toContain('af:d1');
    expect(r.plan[0]).toBe('af:d1');
    expect(r.regels, 'en komt niet in het voorstel voor').toEqual([KK, IW]);
  });

  /* HET VOORSTEL SCHRIJFT NIETS. Zonder deze assertie kan het openen van de sheet ongemerkt een
     toewijzing vastleggen, en dat is precies wat MECHANISM_SPEC.defaultEffect verbiedt. */
  test('kijken verandert niets: pas de knop schrijft', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    const voor = await page.evaluate(() => { let n = 0;
      const o = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (...a) => { n++; return o(...a); };
      spaarVerdeelVoorstel(); openSpaarVerdeel();
      const uit = { n, set: JSON.stringify(SET) };
      localStorage.setItem = o; return uit; });
    expect(voor.n, 'geen enkele schrijver bij het openen').toBe(0);
    const na = await page.evaluate(() => { spaarVerdeelDoen(); return JSON.stringify(SET); });
    expect(na, 'en de bevestiging verandert hem wel').not.toBe(voor.set);
  });

  /* DE SHEET LEEST HET VOORSTEL OPNIEUW BIJ HET BEVESTIGEN en onthoudt het bedrag niet: tussen het
     openen en de tik kan er een saldo of een import bij komen, en dan is het bewaarde bedrag niet
     meer het bedrag dat je zag (v104, nu over de tijd). */
  test('tussen openen en bevestigen verandert het saldo: de tik volgt het nieuwe bedrag', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    await page.evaluate(() => openSpaarVerdeel());
    const na = await page.evaluate(() => {
      SET.manualBal[Object.keys(SET.manualBal).find((k) => k.indexOf('SAVE') > 0)] = 8000;
      save();
      spaarVerdeelDoen();
      return (SET.goals || []).map((g) => g.gespaard);
    });
    expect(na, 'saldo 8.000 min 4.000 buffer = 4.000 vrij, in 90/10').toEqual([3600, 400]);
  });

  /* ÉÉN VERDELING, GEEN TWEEDE: het voorstel leent planVerdeelMaand() en de projectie planVooruit(),
     allebei dezelfde functies die allocatePlan() leest (v104). */
  test('het voorstel leent de verdeling en de projectie, en rekent ze niet na', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    const src = await kaalUit(page, 'spaarVerdeelVoorstel');
    expect(src).toMatch(/planVerdeelMaand\(/);
    expect(src).toMatch(/planVooruit\(/);
    expect(src).toMatch(/planGrendelVan\(/);
    expect(src, 'geen eigen maandlus').not.toMatch(/for\s*\(\s*let\s+m\s*=/);
    expect(src, 'geen tweede eta-formule').not.toMatch(/Math\.ceil\(/);
  });
});

/* ===== d) HET DIAGNOSESCHERM ===== */
test.describe('d · blok 5 zegt waar het getal vandaan komt', () => {
  const blok = (page) => page.evaluate(() => {
    const b = DIAG_BLOKKEN.find((x) => x.lees === diagGrendel);
    return b ? String(b.lees()) : '';
  });
  test('de tak van monthlySavingTarget staat erbij, met zijn invoer', async ({ page }) => {
    await boot(page, { okt: 900, saldo: 11700 });
    const t = await blok(page);
    expect(t).toMatch(/SET\.savingMode: amount/);
    expect(t).toMatch(/SET\.savingAmount: 2200/);
    expect(t).toMatch(/een INSTELLING, geen meting/);
    expect(t).toMatch(/SET\.autoIncome: uit/);
    expect(t).toMatch(/planCapTerugval\(\): false/);
  });
  /* DE ANDERE TWEE TAKKEN STAAN ER OOK, want anders zegt het blok alleen iets over de stand waarin
     hij is geschreven. Allebei met hun eigen invoer. */
  test('de percent-tak en de auto-tak noemen hun eigen invoer', async ({ page }) => {
    await boot(page, { okt: 900, saldo: 11700, set: { savingMode: 'percent', savingPercent: 25 } });
    expect(await blok(page)).toMatch(/percent -> SET\.savingPercent: 25%\s+van SET\.income: 4200/);
    await boot(page, { okt: 900, saldo: 11700, set: { savingMode: 'auto', autoIncome: true } });
    const t = await blok(page);
    expect(t).toMatch(/SET\.savingMode: auto/);
    expect(t).toMatch(/auto\s+-> baseIncome\(\): \d+ min monthBudget\(\): \d+/);
    expect(t).toMatch(/SET\.autoIncome: aan/);
  });
  test('savedNet staat per maand en per rekening, met het verschil', async ({ page }) => {
    await boot(page, { okt: 900, saldo: 11700 });
    const t = await blok(page);
    expect(t).toMatch(/WAT ER WERKELIJK OPZIJ GING, uit savedNet\(\)/);
    expect(t).toMatch(/tak: de rekening-tak, elk bedrag op 1 meegetelde rekening/);
    expect(t).toMatch(/2026-10 \(deze maand\)\s+savedNet\(\): 900\s+planCapacity\(\): 2200\s+verschil: -1300/);
    expect(t).toMatch(/2026-09\s+savedNet\(\): 2200\s+planCapacity\(\): 2200\s+verschil: 0/);
    expect(t, 'en de rekening eronder').toMatch(new RegExp(SAV.slice(0, 21) + '\\s+900\\s+erin'));
    expect(t, 'de regel die het scherm toont').toMatch(/deze maand €900 van €2\.200 opzij/);
  });
  test('de twee knoppen staan er met hun uitkomst naast elkaar', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    const t = await blok(page);
    expect(t).toMatch(/knop 1, spaarVrijToe\(\) -> alles naar het bovenste lopende doel: Kosten Koper/);
    expect(t).toMatch(/knop 2, Verdeel volgens je plan - planVerdeelMaand\(\) met 9000 als cap/);
    expect(t).toMatch(/Kosten Koper\s+\+8100\s+vol in feb 2027\s+\(nu jun 2027\)/);
    expect(t).toMatch(/Inrichting woning\s+\+900\s+vol in mrt 2027/);
    expect(t).toMatch(/verdeeld: 9000\s+blijft vrij: 0/);
  });
  /* DE DIAGNOSE LEEST ALLEEN (v244), en dat is hier geen formaliteit: het blok roept
     spaarVerdeelVoorstel() aan, en dat is de functie waar de nieuwe schrijver op leunt. */
  test('het blok schrijft niets', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000 });
    const n = await page.evaluate(() => { let c = 0;
      const o = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (...a) => { c++; return o(...a); };
      try { DIAG_BLOKKEN.find((x) => x.lees === diagGrendel).lees(); } catch (_) {}
      localStorage.setItem = o; return c; });
    expect(n).toBe(0);
  });
  /* DE PER-REKENING-GROEPERING STAAT OP ÉÉN PLEK, met blok 5 en blok 14 als lezers (v104). */
  test('savedPerRek is de ene groepering, met twee lezers', async ({ page }) => {
    await boot(page, { okt: 900, saldo: 11700 });
    const src = await kaalUit(page, 'diagGrendel', 'diagBuffernorm');
    const n = (src.match(/savedPerRek\(/g) || []).length;
    expect(n, 'beide blokken lezen hem').toBe(2);
    expect(src, 'en geen van beide groepeert zelf').not.toMatch(/perRek\[a\]=\(perRek\[a\]/);
    const bron = await kaalUit(page, 'savedPerRek');
    expect(bron).toMatch(/savedTx\(/);
  });
});

/* ===== e) WAT DEZE RONDE KOST ===== */
test.describe('e · de prijs in pixels', () => {
  /* GEMETEN APART, want de twee toevoegingen kosten niet hetzelfde en niet op beide breedtes evenveel.
     DE REGEL IS 18px TEKST PLUS 2px MARGE, EN 5px DAARVAN KOMT TERUG: de balk had 9px marge om hem
     van de KOP te scheiden, en met een regel ertussen doet die regel dat al. NETTO 15px, op beide
     breedtes, en de waterval-kaart gaat van 509 naar 524px.
     DIE 5px IS NIET COSMETISCH MAAR DE REDEN DAT DE WATERVAL BOVEN DE VOUW BLIJFT: met de volle 20px
     eindigde hij op 569px bij een vouw van 567 op 360x640, en met 15px op 564. Dat staat als eigen
     assertie in plan-terugval-lijn.spec.js, waar de vouw-eis van v318 woont.
     TWEE ANDERE PLEKKEN ZIJN GEMETEN EN VERWORPEN, en dat hoort hier omdat de opdracht "naast de
     €2.200 per maand" zei: als achtervoegsel ACHTER het bedrag in dezelfde rij breekt die rij over
     twee regels (20 -> 41px) en kost het dus exact dezelfde 20px, en als tweede regel in de
     linkerkolom wordt de rij 102px en de kaart 590. Het is dus geen keuze tussen 20px en nul.
     DE TWEEDE KNOP kost 18px op 360px (de twee knoppen breken daar over twee regels) en NUL op
     390px (ze passen naast elkaar). */
  for (const [w, h] of [[360, 640], [390, 844]]) {
    test(`${w}px: de regel kost 15px netto, de knop ${w === 360 ? 18 : 0}px`, async ({ page }) => {
      await boot(page, { okt: 900, saldo: 11700, breedte: w, hoogte: h });
      const meet = () => page.evaluate(() => {
        const z = document.querySelector('#s-vooruit');
        const H = (e) => (e ? Math.round(e.getBoundingClientRect().height) : 0);
        const kaart = [...z.querySelectorAll('.card')].find((c) => c.querySelector('.inleg-balk'));
        return { vrij: H(z.querySelector('.spaar-vrij')), inleg: H(document.querySelector('#planInleg')),
          balkMt: getComputedStyle(z.querySelector('.inleg-balk')).marginTop,
          kaart: H(kaart), zone: H(z),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      const vol = await meet();
      await page.evaluate(() => { window._mag = spaarVerdeelMag; window._inleg = planInlegRegel;
        window.spaarVerdeelMag = () => false; window.planInlegRegel = () => '';
        render(); go('vooruit'); });
      const zonder = await meet();
      await page.evaluate(() => { window.spaarVerdeelMag = window._mag; render(); go('vooruit'); });
      const metKnop = await meet();
      expect(vol.inleg, 'de regel is één regel tekst').toBe(18);
      expect(vol.balkMt, 'met de regel ertussen houdt de balk 4px').toBe('4px');
      expect(zonder.balkMt, 'en zonder regel zijn eigen 9px tot de kop').toBe('9px');
      expect(vol.kaart - zonder.kaart, 'netto: 18 plus 2 marge min de 5 van de balk').toBe(15);
      // v365: de tekst staat onder de vaten (punt 13), en dat maakt de kaart hoger: 684px op 360 en 666 op 390 (gemeten)
      expect(zonder.kaart, 'zonder de regel').toBe(w === 360 ? 684 : 666);
      expect(metKnop.vrij - zonder.vrij, 'de tweede knop').toBe(w === 360 ? 18 : 0);
      expect(vol.zone - zonder.zone).toBe(w === 360 ? 33 : 15);
      expect(vol.overflow, 'niets steekt buiten de breedte').toBeLessThanOrEqual(1);
    });
  }
  test('de sheet past op 360px', async ({ page }) => {
    await boot(page, { okt: 2200, saldo: 13000, breedte: 360, hoogte: 640 });
    const h = await page.evaluate(() => { openSpaarVerdeel();
      return Math.round(document.querySelector('#sheet').getBoundingClientRect().height); });
    expect(h).toBe(403);
    expect(h).toBeLessThan(640);
  });
});
