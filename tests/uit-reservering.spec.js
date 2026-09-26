/* v269: de vlag "dit kwam uit een reservering", en catSpendMap() als norm-bron.
 *
 * DE KERN IS catSpendMap() EN NIET DE VLAG. Alle potjes, alle signalen, de hele coachlaag en blok 6
 * en 7 van DIAG_BLOKKEN lezen die ene functie. Las de vlag alleen totals(), dan zou spendNorm dalen
 * terwijl het signaal blijft vuren, en dat is de tweede waarheid van v104.
 *
 * DE FIXTURE, en wat eraan van de gebruiker is en wat niet (v251/v256):
 *  - €313 + €150 = €463 zijn de twee boetes zoals gemeld, op de categorie belasting, met de twee
 *    reserveringenposten erbij en de eigen overboeking van €463 van de reserveringsrekening.
 *  - HET POTJE belasting VAN €100 EN DE OVERIGE POTJES ZIJN GECONSTRUEERD: die standen ken ik niet.
 *    Het potje bepaalt hoe hard het signaal vuurt, niet of het vuurt.
 * De fixture wordt hieronder zelf getoetst (v261): het inkomen moet gedetecteerd zijn, huur en
 * zorgverzekering herkend als incasso, en de boetes op belasting.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const DEZE = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';
const RES = '100110012555096333';
const BOETE_A = 313, BOETE_B = 150, SAMEN = 463;

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (d, a, n, desc, ac) => tx.push({ id: 'x' + tx.length, date: d, amount: a, acc: ac || ACC,
    name: n, desc: desc || n, typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
  for (let i = 5; i >= 0; i--) {
    const m = M(i);
    add(m + '-25', 5216, 'Loonstrook', 'SALARIS MAANDELIJKS');
    add(m + '-01', -1450, 'Woningstichting', 'SEPA INCASSO HUUR WONINGSTICHTING');
    add(m + '-04', -140, 'Zorgverzekeraar', 'SEPA INCASSO ZORGVERZEKERING');
    add(m + '-06', -220, 'Albert Heijn'); add(m + '-14', -190, 'Albert Heijn'); add(m + '-21', -160, 'Albert Heijn');
    add(m + '-09', -85, 'Shell'); add(m + '-17', -60, 'Cafe De Kroon');
  }
  add(DEZE + '-24', -BOETE_A, 'CJIB', 'CJIB BOETE');
  add(DEZE + '-24', -BOETE_B, 'CJIB', 'CJIB BOETE');
  add(DEZE + '-25', -SAMEN, 'Priverekening', 'OVERBOEKING NAAR PRIVEREKENING', RES);
  add(DEZE + '-25', SAMEN, 'Priverekening', 'OVERBOEKING VAN PRIVEREKENING');
  if (opt.geenNorm) { add(DEZE + '-20', -497, 'Loodgieter', 'SPOEDREPARATIE'); add(DEZE + '-19', -120, 'Kasgeld', 'KASGELD'); }
  add(M(5) + '-04', -12, 'Bankkosten', 'BANKKOSTEN', RES);
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: true,
      manualBal: { [ACC]: 4200, [RES]: 1537 }, savingsAcc: { [RES]: false },
      budgets: { boodschappen: 700, huur: 1450, vervoer: 120, uiteten: 150, belasting: 100 },
      savingMode: 'amount', savingAmount: 500, goals: [], resAcc: RES,
      reserveringen: [
        { id: 'rA', naam: 'Boete A', bedrag: BOETE_A, vervalmaand: DEZE, intervalM: 0, cat: 'belasting' },
        { id: 'rB', naam: 'Boete B', bedrag: BOETE_B, vervalmaand: DEZE, intervalM: 0, cat: 'belasting' }],
      uitReservering: opt.uitReservering || undefined }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof uitReserveringBedrag === 'function' && typeof catSpendMap === 'function');
}
// de twee boetes vlaggen, elk voor het hele bedrag
const VLAG_BEIDE = () => `(() => { const m=thisYM();
  const b=txOfMonth(m).filter(t=>t.name==='CJIB');
  for(const t of b) zetUitReservering(t.id, -t.amount, false);
  return b.length; })()`;
// alle lezers uit punt 1 van het onderzoek, in één greep
const LEES = () => {
  const m = thisYM(); const t = totals(m);
  return {
    spend: Math.round(t.spend), spendNorm: Math.round(t.spendNorm),
    buitenNorm: Math.round(t.buitenNorm), uitReservering: Math.round(t.uitReservering),
    uitResCat: Object.fromEntries(Object.entries(t.uitResCat || {}).map(([k, v]) => [k, Math.round(v)])),
    budget: Math.round(t.budget), income: Math.round(t.income),
    netSpend: Math.round(netSpend(txOfMonth(m))),
    catBelasting: Math.round(catSpendMap(m).belasting || 0),
    gebruikt: varPotjeStand(m).gebruikt, deel: varPotjeStand(m).deel, over: varPotjeStand(m).over,
    reserve: varPotjesReserve(m), planRest: varPlanRemaining(m),
    potOver: Math.round(safeToSpend().potOver || 0), reserved: Math.round(safeToSpend().reserved),
    saldo: Math.round(totalBalance().sum),
    signalen: valtOpSignals(m).map((s) => s.potjeId + ' +' + Math.round(s.over)),
    overCat: (function () { const b = budgetOverCat(m); return b ? b.k + ' +' + Math.round(b.over) : null; })(),
    vari: Math.round(splitFixedVar(m).vari), fixed: Math.round(splitFixedVar(m).fixed),
    aggSpend: Math.round(monthAgg(m).spend),
    effBelasting: Math.round(effectiveBudgets(m).out.belasting || 0),
    posten: nogDezeMaandPosten().map((p) => String(p.lab).replace(/<[^>]*>/g, '') + ' ' + p.val),
  };
};

test.describe('0 - de fixture draagt het geval dat hij belooft', () => {
  test('inkomen gedetecteerd, vaste lasten herkend, boetes op belasting', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      return { income: Math.round(totals(m).income), basis: totals(m).incomeBasis,
        recur: [...recurringKeys()].sort(),
        boetes: txOfMonth(m).filter((t) => t.name === 'CJIB').map((t) => catOf(t) + ':' + -t.amount),
        eigen: catOf(txOfMonth(m).find((t) => t.name === 'Priverekening')) }; });
    expect(r.income).toBe(5216);
    expect(r.basis).toBe('gedetecteerd');
    expect(r.recur).toEqual(['WONINGSTICHTING', 'ZORGVERZEKERAAR']);
    expect(r.boetes).toEqual(['belasting:313', 'belasting:150']);
    expect(r.eigen).toBe('intern');
  });
});

test.describe('a - zonder vlag: de huidige situatie, ongewijzigd', () => {
  test('het geld staat in spendNorm, het signaal vuurt, de post slaat om', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.spend).toBe(2768);
    expect(r.spendNorm).toBe(2768);
    expect(r.uitReservering).toBe(0);
    expect(r.uitResCat).toEqual({});
    expect(r.catBelasting).toBe(SAMEN);
    expect(r.gebruikt).toBe(1178);
    expect(r.deel).toBe(110);
    expect(r.over).toBe(true);
    expect(r.signalen).toEqual(['belasting +363']);
    expect(r.overCat).toBe('belasting +363');
    expect(r.posten.some((p) => /Te veel uitgegeven/.test(p))).toBe(true);
  });
});

test.describe('b - mijn geval: twee boetes samen 463 gevlagd', () => {
  test('ze blijven in het maandtotaal en in het saldo, en vallen uit spendNorm', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(LEES);
    const n = await page.evaluate(VLAG_BEIDE());
    const na = await page.evaluate(LEES);
    expect(n).toBe(2);
    // het geld: onveranderd
    expect(na.spend).toBe(voor.spend);
    expect(na.spend).toBe(2768);
    expect(na.netSpend).toBe(voor.netSpend);
    expect(na.saldo).toBe(voor.saldo);
    // de norm: 463 lager
    expect(voor.spendNorm - na.spendNorm).toBe(SAMEN);
    expect(na.spendNorm).toBe(2305);
    expect(na.uitReservering).toBe(SAMEN);
    expect(na.uitResCat).toEqual({ belasting: SAMEN });
    // buitenNorm blijft nul: belasting is geen geenNorm-categorie
    expect(na.buitenNorm).toBe(0);
    // de identiteit
    expect(na.spendNorm).toBe(na.spend - na.buitenNorm - na.uitReservering);
  });

  test('mijn potje belasting leest weer normaal en het signaal is weg', async ({ page }) => {
    await boot(page);
    await page.evaluate(VLAG_BEIDE());
    const r = await page.evaluate(LEES);
    expect(r.catBelasting).toBe(0);
    expect(r.gebruikt).toBe(715);
    expect(r.deel).toBe(67);
    expect(r.over).toBe(false);
    expect(r.signalen).toEqual([]);
    expect(r.overCat).toBe(null);
    expect(r.reserve).toBe(355);
    expect(r.planRest).toBe(355);
    expect(r.potOver).toBe(0);
    expect(r.reserved).toBe(355);
    expect(r.posten.some((p) => /Nog uit je potjes/.test(p))).toBe(true);
    expect(r.posten.some((p) => /Te veel uitgegeven/.test(p))).toBe(false);
  });

  test('elke lezer uit het onderzoek doet wat er gemeld is', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(LEES);
    await page.evaluate(VLAG_BEIDE());
    const na = await page.evaluate(LEES);
    // norm-lezers: 463 eruit
    expect([voor.spendNorm, na.spendNorm]).toEqual([2768, 2305]);
    expect([voor.vari, na.vari]).toEqual([1178, 715]);
    expect([voor.aggSpend, na.aggSpend]).toEqual([2768, 2305]);
    // geld-lezers en wat niet hoort te bewegen
    expect([voor.spend, na.spend]).toEqual([2768, 2768]);
    expect([voor.fixed, na.fixed]).toEqual([1590, 1590]);
    expect([voor.budget, na.budget]).toEqual([2520, 2520]);
    expect([voor.income, na.income]).toEqual([5216, 5216]);
    expect([voor.effBelasting, na.effBelasting]).toEqual([100, 100]);
  });
});

test.describe('c - gedeeltelijke dekking', () => {
  test('300 van 463 gevlagd: de rest telt gewoon en het signaal vuurt op 63', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const a = txOfMonth(m).find((t) => t.name === 'CJIB' && -t.amount === 313);
      zetUitReservering(a.id, 300, false);
      const b = txOfMonth(m).find((t) => t.name === 'CJIB' && -t.amount === 150);
      return { vlagA: uitReserveringBedrag(a), vlagB: uitReserveringBedrag(b),
        catBelasting: Math.round(catSpendMap(m).belasting || 0),
        spend: Math.round(totals(m).spend), spendNorm: Math.round(totals(m).spendNorm),
        uitRes: Math.round(totals(m).uitReservering),
        signalen: valtOpSignals(m).map((s) => s.potjeId + ' +' + Math.round(s.over)) }; });
    expect(r.vlagA).toBe(300);
    expect(r.vlagB).toBe(0);
    expect(r.catBelasting).toBe(163);
    expect(r.spend).toBe(2768);
    expect(r.spendNorm).toBe(2468);
    expect(r.uitRes).toBe(300);
    expect(r.signalen).toEqual(['belasting +63']);
  });

  test('meer vlaggen dan de boeking groot is bestaat niet, en nul haalt de vlag weg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const a = txOfMonth(m).find((t) => t.name === 'CJIB' && -t.amount === 313);
      zetUitReservering(a.id, 9999, false); const klem = uitReserveringBedrag(a);
      zetUitReservering(a.id, 0, false);
      return { klem, na: uitReserveringBedrag(a), sleutel: Object.keys(SET.uitReservering || {}) }; });
    expect(r.klem).toBe(313);
    expect(r.na).toBe(0);
    expect(r.sleutel).toEqual([]);
  });

  /* DE KLEM STAAT TWEE KEER, en dat is bewust, net als bij onregelmatigBedrag() (v259). De test
     hierboven raakt alleen de klem in zetUitReservering(); die op de leeskant was niet te raken via
     de setter, en een sabotage die hem weghaalde liet alle 22 tests groen. Hij heeft wel een pad:
     SET komt bij een import terug via Object.assign over d.set, dus een backup met een te hoge
     waarde landt ongeklemd in SET.uitReservering. Deze test schrijft daarom rechtstreeks. */
  test('een te hoge waarde uit een import wordt bij het LEZEN geklemd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const a = txOfMonth(m).find((t) => t.name === 'CJIB' && -t.amount === 313);
      SET.uitReservering = { [a.id]: 9999 };   // zoals een import hem zou terugzetten
      return { bedrag: uitReserveringBedrag(a), ruw: SET.uitReservering[a.id],
        catBelasting: Math.round(catSpendMap(m).belasting || 0),
        spendNorm: Math.round(totals(m).spendNorm), uitRes: Math.round(totals(m).uitReservering) }; });
    expect(r.ruw).toBe(9999);
    expect(r.bedrag).toBe(313);
    expect(r.catBelasting).toBe(150);
    expect(r.uitRes).toBe(313);
    expect(r.spendNorm).toBe(2768 - 313);
  });

  test('een geenNorm-categorie kan de vlag niet dragen, want die valt al buiten de norm', async ({ page }) => {
    await boot(page, { geenNorm: true });
    const r = await page.evaluate(() => { const m = thisYM();
      const t = txOfMonth(m).find((x) => x.name === 'Loodgieter');
      OVR[t.id] = 'onvoorzien'; save(); render();
      zetUitReservering(t.id, 497, false);
      return { cat: catOf(t), bedrag: uitReserveringBedrag(t), rij: uitReserveringBlok(t),
        buitenNorm: Math.round(totals(m).buitenNorm), uitRes: Math.round(totals(m).uitReservering) }; });
    expect(r.cat).toBe('onvoorzien');
    expect(r.bedrag).toBe(0);
    expect(r.rij).toBe('');
    expect(r.buitenNorm).toBe(497);
    expect(r.uitRes).toBe(0);
  });
});

test.describe('d - de zichtbaarheidsregel', () => {
  test('hij staat er alleen als er gevlagde boekingen zijn, per categorie', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => { const m = thisYM();
      return uitReserveringRegels(totals(m), m); });
    expect(voor).toBe('');
    const na = await page.evaluate(() => { const m = thisYM();
      const b = txOfMonth(m).filter((t) => t.name === 'CJIB');
      for (const t of b) zetUitReservering(t.id, -t.amount, false);
      go('ins');
      const kaart = [...document.querySelectorAll('.card')]
        .filter((x) => x.offsetParent !== null && x.getBoundingClientRect().height > 40)[0];
      return { html: uitReserveringRegels(totals(m), m),
        tekst: kaart.innerText.replace(/\n/g, ' | '),
        som: Math.round(Object.values(totals(m).uitResCat).reduce((a, b2) => a + b2, 0)),
        totaal: Math.round(totals(m).uitReservering) }; });
    expect(na.html).toContain('uit een reservering');
    expect(na.html).toContain('belasting');
    expect(na.tekst).toContain('+ €463 belasting & boetes, uit een reservering ›');
    // per constructie: de regels tellen op tot het totaal
    expect(na.som).toBe(na.totaal);
    expect(na.som).toBe(SAMEN);
  });

  test('de categorie-sheet zegt welk deel uit een reservering kwam, naast het volle bedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const b = txOfMonth(m).filter((t) => t.name === 'CJIB');
      for (const t of b) zetUitReservering(t.id, -t.amount, false);
      openCategory('belasting', m);
      return document.getElementById('sheet').innerText.replace(/\n/g, ' | '); });
    // het bedrag boven blijft het geld, want het is de som van de rijen eronder
    expect(r).toContain('€463');
    expect(r).toContain('Waarvan €463 uit een reservering betaald, dus buiten je potjes.');
  });
});

/* GEMETEN EN NIET GESCHAT. Mijn eerste poging kloonde de kaart en plakte er een regel in; die gaf
   +19px op 360 en +4px op 390 voor hetzelfde element, dus die methode meet een marge mee. Deze test
   meet de LEVENDE kaart en haalt daarna alleen de reserveringsregels uit de dom, zodat het verschil
   de regel zelf is en niets anders.
   TWEE GEVALLEN, want er bewegen twee dingen. In het gemelde geval verdwijnt budgetOverZin() omdat
   spendNorm onder je budget zakt, en dat is het hele punt van de ronde. Het WORST CASE voor de
   hoogte is dus een gedeeltelijke vlag: dan blijft die zin staan en komt de regel er bovenop. */
test.describe('e - de hoogte van de stand-kaart, gemeten', () => {
  const opzet = async (page, w) => {
    await page.setViewportSize({ width: w, height: 844 });
    await boot(page, { geenNorm: true });
    await page.evaluate(() => { const m = thisYM();
      OVR[txOfMonth(m).find((t) => t.name === 'Loodgieter').id] = 'onvoorzien';
      OVR[txOfMonth(m).find((t) => t.name === 'Kasgeld').id] = 'contant';
      save(); render(); });
  };
  const meet = `(() => { const m=thisYM();
    const kaart=()=>{ go('ins'); return [...document.querySelectorAll('.card')]
      .filter(x=>x.offsetParent!==null && x.getBoundingClientRect().height>40)[0]; };
    const h=e=>Math.round(e.getBoundingClientRect().height);
    const k=kaart(); const hoogte=h(k);
    const overZin=/over je potjes/.test(k.innerText);
    const tekst=k.innerText.split(String.fromCharCode(10)).join(' | ');
    const rijen=[...k.querySelectorAll('div')].filter(x=>/uit een reservering/.test(x.textContent) && x.children.length===0);
    const n=rijen.length; rijen.forEach(x=>x.remove());
    const zonderRegel=h(k);
    return {hoogte, zonderRegel, regelKost:hoogte-zonderRegel, nRijen:n, overZin,
      tekst,
      gn: Object.keys(CATS).filter(c=>CATS[c].geenNorm && -(totals(m).byCat[c]||0)>0).length,
      spendNorm: Math.round(totals(m).spendNorm), budget: Math.round(totals(m).budget)}; })()`;

  for (const w of [360, 390]) {
    test(`het gemelde geval op ${w}px: beide boetes gevlagd`, async ({ page }) => {
      await opzet(page, w);
      const voor = await page.evaluate(meet);
      await page.evaluate(VLAG_BEIDE());
      const na = await page.evaluate(meet);
      expect(voor.gn).toBe(2);
      expect(voor.nRijen).toBe(0);
      expect(voor.hoogte).toBe(190);
      expect(na.nRijen).toBe(1);
      expect(voor.overZin).toBe(true);
      expect(na.overZin).toBe(false);         // spendNorm zakt onder je budget, dus die zin valt weg
      console.log(`### gemeld geval @${w}px: ${voor.hoogte}px -> ${na.hoogte}px, regelKost ${na.regelKost}px`);
      console.log(`###   voor: ${voor.tekst}`);
      console.log(`###   na:   ${na.tekst}`);
      /* GEMETEN, en de twee breedtes lopen hier uiteen doordat de kop en de budgetzin op 360px
         anders afbreken dan op 390px. Niet verder uitgesplitst: wat de eis van v241 toetst is de
         hoogte van de kaart, en die is op beide breedtes onder de 200px. */
      expect(na.regelKost).toBe(23);        // 18px tekst plus de 5px marge erboven
      expect(na.hoogte).toBe(w === 360 ? 190 : 175);
      expect(na.hoogte).toBeLessThan(200);
    });

    test(`het worst case op ${w}px: gedeeltelijk gevlagd, dus budgetOverZin blijft`, async ({ page }) => {
      await opzet(page, w);
      const na = await page.evaluate(() => { const m = thisYM();
        const b = txOfMonth(m).find((t) => t.name === 'CJIB' && -t.amount === 150);
        zetUitReservering(b.id, 150, false); return 1; });
      const r = await page.evaluate(meet);
      expect(r.gn).toBe(2);
      expect(r.nRijen).toBe(1);
      expect(r.overZin).toBe(true);
      expect(r.spendNorm).toBeGreaterThan(r.budget);
      console.log(`### worst case @${w}px: ${r.hoogte}px (2 geenNorm-regels + de reserveringsregel + budgetOverZin), spendNorm ${r.spendNorm} tegen budget ${r.budget}`);
      expect(r.regelKost).toBe(23);
      /* BEVINDING, en de eis van v241 is NIET opgeschoven: deze combinatie gaat over de 200px.
         Twee geenNorm-categorieen met uitgaven, een gevlagde boeking, en nog boven je budget.
         Dat is precies wat v258 voorspelde voor een derde regel in dit blok; de vorm van het blok
         is dan een eigen ronde. */
      expect(r.hoogte).toBe(213);
      expect(r.hoogte).toBeGreaterThan(200);
    });
  }
});

test.describe('f - de aansluiting in blok 7 blijft kloppen', () => {
  test('weekBedragen() telt de norm, dus blokken plus restdagen blijft gelijk aan catSpendMap', async ({ page }) => {
    await boot(page);
    const lees = () => { const m = thisYM(); const scope = weekScope();
      const bed = weekBedragen(); const rest = weekRestdagen();
      const blok = Object.keys(bed).filter((k) => k.slice(0, 7) === m).reduce((a, k) => a + bed[k], 0);
      const sp = catSpendMap(m);
      return { inScope: scope.indexOf('belasting') >= 0,
        blok: Math.round(blok), rest: Math.round(rest[m] || 0),
        maand: Math.round(scope.reduce((a, k) => a + (sp[k] || 0), 0)) };
    };
    const voor = await page.evaluate(lees);
    await page.evaluate(VLAG_BEIDE());
    const na = await page.evaluate(lees);
    expect(voor.inScope).toBe(true);
    // voor: de boetes zitten in de blokken en in het maandcijfer
    expect(voor.blok + voor.rest).toBe(voor.maand);
    // na: allebei 463 lager, dus de aansluiting blijft
    expect(na.blok + na.rest).toBe(na.maand);
    expect(voor.maand - na.maand).toBe(SAMEN);
    console.log(`### blok 7 aansluiting: voor blokken+restdagen ${voor.blok}+${voor.rest}=${voor.blok + voor.rest} tegen maand ${voor.maand}; na ${na.blok}+${na.rest}=${na.blok + na.rest} tegen maand ${na.maand}`);
  });
});

test.describe('g - de vlag overleeft een herimport', () => {
  test('dezelfde id, niets toegevoegd, vlag en bedrag blijven staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const t = txOfMonth(m).find((x) => x.name === 'CJIB' && -x.amount === 313);
      zetUitReservering(t.id, 313, false); const vid = t.id;
      const kopie = { date: t.date, amount: t.amount, acc: t.acc, name: t.name, desc: t.desc,
        typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(kopie);
      const nVoor = TX.length;
      const toegevoegd = commitTx([kopie], null);
      return { zelfdeId: kopie.id === vid, toegevoegd, nVoor, nNa: TX.length,
        bedragNa: uitReserveringBedrag(TX.find((x) => x.id === vid)),
        normNa: Math.round(totals(thisYM()).spendNorm) }; });
    expect(r.zelfdeId).toBe(true);
    expect(r.toegevoegd).toBe(0);
    expect(r.nNa).toBe(r.nVoor);
    expect(r.bedragNa).toBe(313);
    expect(r.normNa).toBe(2768 - 313);
  });
});

test.describe('h - de twee vlaggen spreken elkaar niet tegen', () => {
  test('dekking(12) is identiek met en zonder de vlag op de boeking', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const voor = JSON.stringify(dekking(12));
      const b = txOfMonth(m).filter((t) => t.name === 'CJIB');
      for (const t of b) zetUitReservering(t.id, -t.amount, false);
      return { voor, na: JSON.stringify(dekking(12)),
        vlaggen: Object.keys(SET.uitReservering || {}).length }; });
    expect(r.vlaggen).toBe(2);
    expect(r.na).toBe(r.voor);
  });

  test('betaald op de post laat de boeking ongemoeid, en omgekeerd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const t = txOfMonth(m).find((x) => x.name === 'CJIB' && -x.amount === 313);
      const normVoor = Math.round(totals(m).spendNorm);
      resBetaaldZet('rA');
      const normNaBetaald = Math.round(totals(m).spendNorm);
      const dekVoorVlag = JSON.stringify(dekking(12));
      zetUitReservering(t.id, 313, false);
      return { normVoor, normNaBetaald, normNaVlag: Math.round(totals(m).spendNorm),
        dekGelijk: JSON.stringify(dekking(12)) === dekVoorVlag,
        betaald: !!(SET.resBetaald || {}).rA }; });
    expect(r.betaald).toBe(true);
    // afvinken raakt de uitgavenkant niet
    expect(r.normNaBetaald).toBe(r.normVoor);
    // vlaggen raakt de dekkingskant niet
    expect(r.dekGelijk).toBe(true);
    expect(r.normNaVlag).toBe(r.normVoor - 313);
  });

  test('de picker wijst niets aan uit zichzelf, ook niet bij precies een kandidaat', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      resBetaaldZet('rA');
      const tekst = document.getElementById('sheet').innerText.replace(/\n/g, ' | ');
      return { tekst, vlaggen: Object.keys(SET.uitReservering || {}).length,
        kandidaten: resBoekingKandidaten(resLijst().find((v) => v.id === 'rA')).length,
        norm: Math.round(totals(thisYM()).spendNorm) }; });
    expect(r.tekst).toContain('Welke boeking was dit?');
    expect(r.tekst).toContain('Geen boeking aanwijzen');
    expect(r.kandidaten).toBeGreaterThan(1);
    expect(r.vlaggen).toBe(0);
    expect(r.norm).toBe(2768);
  });

  test('een boeking aanwijzen in de picker zet de vlag op het hele bedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const t = txOfMonth(m).find((x) => x.name === 'CJIB' && -x.amount === 313);
      resBetaaldZet('rA');
      resBoekingKies('rA', t.id);
      return { bedrag: uitReserveringBedrag(TX.find((x) => x.id === t.id)),
        norm: Math.round(totals(m).spendNorm),
        sheet: document.getElementById('sheet').innerText.replace(/\n/g, ' | ') }; });
    expect(r.bedrag).toBe(313);
    expect(r.norm).toBe(2768 - 313);
    // na het kiezen sta je in de editor van de post, met de terugdraaier van v268
    expect(r.sheet).toContain('Betaald op');
    expect(r.sheet).toContain('ongedaan maken');
  });
});

test.describe('i - een bron kan niet uit elkaar lopen', () => {
  test('elke norm-sommatie leest uitReserveringBedrag(), netSpend() bewust niet', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const sc = src.slice(src.indexOf('<script'), src.lastIndexOf('</script>'));
    const fn = (naam) => { const i = sc.indexOf('\nfunction ' + naam + '(');
      expect(i, 'functie ' + naam + ' niet gevonden').toBeGreaterThan(-1);
      let d = 0;
      for (let k = sc.indexOf('{', i); k < sc.length; k++) {
        if (sc[k] === '{') d++; else if (sc[k] === '}') { d--; if (!d) return sc.slice(i, k + 1); } }
      return sc.slice(i); };
    // de norm-kant: wie hier de vlag niet leest, laat een tweede waarheid ontstaan
    for (const naam of ['catSpendMap', 'totals', 'splitFixedVar', 'baselineSpend', 'weekBedragen', 'weekRestdagen'])
      expect(fn(naam), naam + ' leest de vlag niet').toContain('uitReservering');
    // de geld-kant: netSpend blijft het geld, anders is er geen bron voor het maandtotaal meer
    expect(fn('netSpend')).not.toContain('uitReservering');
    // de vlag hangt aan t.id in een eigen map en niet in OVR (v259)
    expect(fn('zetUitReservering')).toContain('SET.uitReservering');
    expect(fn('zetUitReservering')).not.toContain('OVR');
    // precies één schrijver van de map
    expect((sc.match(/SET\.uitReservering\[[^\]]+\]\s*=/g) || []).length).toBe(1);
  });

  test('de geld-lezers tellen hun eigen lijst op en komen niet langs catSpendMap', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const m = thisYM();
      const b = txOfMonth(m).filter((t) => t.name === 'CJIB');
      for (const t of b) zetUitReservering(t.id, -t.amount, false);
      openCategory('belasting', m);
      const sheet = document.getElementById('sheet').innerText;
      const rijen = [...document.querySelectorAll('#sheet .tx .amt')].map((x) => x.innerText);
      return { sheet: sheet.replace(/\n/g, ' | '), rijen,
        cat: Math.round(catSpendMap(m).belasting || 0) }; });
    // het potje leest 0, de sheet leest 463, en de rijen eronder tellen op tot 463
    expect(r.cat).toBe(0);
    expect(r.rijen).toHaveLength(2);
    expect(r.sheet).toContain('€463');
  });
});
