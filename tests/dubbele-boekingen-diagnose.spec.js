/* v272: blok 10 van DIAG_BLOKKEN, dubbele boekingen en wat `t.date` betekent.
 *
 * DE AANLEIDING kwam uit blok 9: op de duurste dag van twee weken stond een pinopname als VARIABELE
 * UITGAVE, met op dezelfde dag en hetzelfde bedrag een tweede boeking die wel op `intern` landde.
 * Drie van die paren, en geen van de drie ontdubbelingen zag ze.
 *
 * DE SCAN IS NIET OP ÉÉN DAG, en dat is de kern van dit blok. `parseMT940()` leest `:61:` als
 * `(\d{6})(\d{4})?` en gebruikt de EERSTE zes cijfers, de VALUTADATUM; de boekdatum erachter wordt
 * weggegooid. `mapPsd2Tx()` neemt `booking_date` voorop en de N26-CSV de kolom `booking date`. Op één
 * rekening met twee bronnen staan dus twee datumbetekenissen naast elkaar, en een scan op dag 0 mist
 * precies het paar waarvoor hij bestaat. `applyPending()` gebruikt om dezelfde reden al zes dagen.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - één rekening met twee bronnen (mt940 en psd2), want alleen daar kan een dubbele import langs de
 *    soft-dedup van `commitTx()` komen (die eist dat de REKENING verschilt);
 *  - een kruisbron-paar op dezelfde dag met dezelfde eerste acht letters in de naam, dus met een
 *    GELIJKE `_softKey`, en met verschillende `bankRef`, dus met een ANDERE `_dupSig`. Dat is de
 *    combinatie waarin geen enkele ontdubbeling hem pakt;
 *  - een kruisbron-paar dat DRIE dagen uit elkaar ligt, zoals een valutadatum tegen een boekdatum;
 *  - een paar uit DEZELFDE bron op dezelfde dag, dat dus geen kandidaat is maar twee echte boekingen;
 *  - een boeking waarvan de categorie uit `OVR` komt en niet uit de keyword-regels, want dat is de
 *    enige overgebleven verklaring voor een opname op een uitgavencategorie (de parsers zetten de
 *    naam altijd IN de desc, dus `autoCat` is daar per constructie `intern`);
 *  - twee boekingen met een datum en tijd IN de desc, waarvan er één op een andere weekdag valt dan
 *    `t.date`, zodat de weekdagverdeling meetbaar verschuift.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// de maandag van vorige week: altijd voorbij, en zijn weekdag staat vast
const MAANDAG = new Date(now); MAANDAG.setDate(MAANDAG.getDate() - ((now.getDay() + 6) % 7) - 7);
const ZATERDAG = new Date(MAANDAG); ZATERDAG.setDate(ZATERDAG.getDate() - 2);
const WOENSDAG = new Date(MAANDAG); WOENSDAG.setDate(WOENSDAG.getDate() + 2);
const dagPlus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return ymd(x); };
// nl-notatie zoals ABN in de :86:-regel: dd.mm.yy/hh:mm
const descDag = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);

const ABN = '999100200';       // één rekening, twee bronnen
const N26 = 'N26 Fictief';     // csv, voor het zelfde-bron-paar

function seed() {
  const tx = [];
  const add = (o) => tx.push(Object.assign({ acc: ABN, typ: '', ref: '', accName: '', refNums: [] }, o));
  add({ date: ymd(MAANDAG), amount: 4000, name: 'Loonstrook', desc: 'SALARIS MAANDELIJKS', src: 'mt940' });
  // 1) kruisbron-paar op dezelfde dag: gelijke _softKey (GELDMAAT), andere bankRef
  add({ date: dagPlus(MAANDAG, 1), amount: -200, name: 'Geldmaat GM Fictiestraat',
    desc: 'GEA, BETAALPAS GELDMAAT GM FICTIESTRAAT', src: 'mt940', bankRef: 'MT-0001' });
  add({ date: dagPlus(MAANDAG, 1), amount: -200, name: 'Geldmaat Fictiestraat 13',
    desc: 'Geldmaat Fictiestraat 13', src: 'psd2', bankRef: 'PS-0001' });
  // 2) kruisbron-paar drie dagen uit elkaar: valutadatum tegen boekdatum
  add({ date: dagPlus(MAANDAG, 1), amount: -75, name: 'Fictiewinkel', desc: 'BEA, BETAALPAS FICTIEWINKEL', src: 'mt940', bankRef: 'MT-0002' });
  add({ date: dagPlus(MAANDAG, 4), amount: -75, name: 'Fictiewinkel', desc: 'Fictiewinkel betaling', src: 'psd2', bankRef: 'PS-0002' });
  // 3) zelfde bron, zelfde dag, zelfde bedrag: twee echte boekingen
  add({ date: dagPlus(MAANDAG, 2), amount: -12, name: 'Plus de Gors', desc: 'Plus de Gors card', src: 'csv', acc: N26 });
  add({ date: dagPlus(MAANDAG, 2), amount: -12, name: 'Plus de Gors', desc: 'Plus de Gors card', src: 'csv', acc: N26 });
  // 4) de desc draagt een eigen datum: deze valt op zaterdag en is op maandag geboekt
  add({ date: ymd(MAANDAG), amount: -300, name: 'Albert Heijn',
    desc: 'BEA, BETAALPAS ALBERT HEIJN 1234,PAS123 NR:AB1C2D, ' + descDag(ZATERDAG) + '/14:32', src: 'mt940' });
  // en deze staat op dezelfde dag als zijn desc-datum, zodat de vergelijking twee kanten heeft
  add({ date: ymd(WOENSDAG), amount: -50, name: 'Albert Heijn',
    desc: 'BEA, BETAALPAS ALBERT HEIJN 1234,PAS123 NR:XY9Z8W, ' + descDag(WOENSDAG) + '/09:05', src: 'mt940' });
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000, [N26]: 100 }, budgets: { boodschappen: 400, overig: 300 } }),
    minder_own: JSON.stringify([ABN, N26]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, opt) {
  opt = opt || {};
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function');
  if (opt.ovr !== false) {
    /* Zoals de gebruiker een categorie zet: via OVR, zonder save(). Dit is de enige overgebleven
       verklaring voor een opname op een uitgavencategorie, want de parsers zetten de naam altijd in
       de desc en dan is autoCat per constructie intern. */
    await page.evaluate(() => { const t = TX.find(x => x.src === 'psd2' && x.amount === -200); OVR[t.id] = 'overig'; });
  }
  await page.evaluate(() => {
    window.RIJEN_ = () => diagDubbel();
    window.REGELS_ = () => diagDubbel().join(String.fromCharCode(10));
  });
}

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('een rekening met twee bronnen, en de drie paren bestaan echt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const per = {}; for (const t of TX) (per[t.acc] = per[t.acc] || new Set()).add(t.src || 'mt940');
      const p200 = TX.filter(t => t.amount === -200);
      const p75 = TX.filter(t => t.amount === -75);
      const p12 = TX.filter(t => t.amount === -12);
      return {
        bronnenOpABN: [...(per['999100200'] || [])].sort(),
        n200: p200.length, srcs200: p200.map(t => t.src).sort(),
        softGelijk200: new Set(p200.map(_softKey)).size === 1,
        dupAnders200: new Set(p200.map(_dupSig)).size === 2,
        cats200: p200.map(t => catOf(t)).sort(),
        ruleCats200: p200.map(t => t.ruleCat).sort(),
        dagen75: p75.map(t => t.date).sort(), srcs75: p75.map(t => t.src).sort(),
        srcs12: p12.map(t => t.src).sort(), datum12: new Set(p12.map(t => t.date)).size === 1,
      };
    });
    // twee bronnen op één rekening: zonder dat kan de soft-dedup niet omzeild worden
    expect(r.bronnenOpABN).toEqual(['mt940', 'psd2']);
    expect(r.n200).toBe(2);
    expect(r.srcs200).toEqual(['mt940', 'psd2']);
    // de combinatie die geen enkele ontdubbeling pakt
    expect(r.softGelijk200).toBe(true);
    expect(r.dupAnders200).toBe(true);
    // beide kanten zouden op intern landen; alleen OVR maakt er een uitgave van
    expect(r.ruleCats200).toEqual(['intern', 'intern']);
    expect(r.cats200).toEqual(['intern', 'overig']);
    // het tweede paar ligt drie dagen uit elkaar
    expect(r.srcs75).toEqual(['mt940', 'psd2']);
    expect(new Date(r.dagen75[1]) - new Date(r.dagen75[0])).toBe(3 * 86400000);
    // het derde paar komt uit dezelfde bron, op één dag
    expect(r.srcs12).toEqual(['csv', 'csv']);
    expect(r.datum12).toBe(true);
  });

  test('de twee desc-datums worden gelezen, en één valt op een andere weekdag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const a = TX.find(t => t.amount === -300), b = TX.find(t => t.amount === -50);
      const da = _descDatum(a.desc), db = _descDatum(b.desc);
      const wd = (d) => (new Date(d + 'T00:00:00').getDay() + 6) % 7;
      return { da, db, wdA: wd(a.date), wdDescA: wd(da.ymd), gelijkB: db.ymd === b.date,
        inScopeA: !!(CATS[catOf(a)] && CATS[catOf(a)].type === 'expense' && !isFixed(a) && !geenNorm(catOf(a))) };
    });
    expect(r.da).toBeTruthy();
    expect(r.da.tijd).toBe('14:32');
    expect(r.wdA).toBe(0);        // t.date is maandag
    expect(r.wdDescA).toBe(5);    // de desc-datum is zaterdag
    expect(r.gelijkB).toBe(true); // de tweede valt wel samen
    expect(r.inScopeA).toBe(true);
  });
});

test.describe('1 - het blok staat in de lijst en leest alleen', () => {
  test('blok 10 is een entry in DIAG_BLOKKEN', async ({ page }) => {
    await boot(page);
    /* Bind op de lees-functie en niet op de lengte of de laatste plek: dat liet bij v271 een test in
       rekeningen-diagnose omvallen toen er een blok bij kwam. */
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some(b => b.lees === diagDubbel),
      titel: (DIAG_BLOKKEN.find(b => b.lees === diagDubbel) || {}).titel,
      inTekst: !/diagDubbel/.test(String(diagTekst)),
    }));
    expect(r.erin).toBe(true);
    expect(r.titel).toBe('dubbele boekingen en wat t.date betekent');
    expect(r.inTekst).toBe(true);
  });

  test('het hele scherm lezen schrijft niets naar localStorage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const orig = Storage.prototype.setItem; const geschreven = [];
      Storage.prototype.setItem = function (k, v) { geschreven.push(k); return orig.call(this, k, v); };
      try { await diagTekst(); } finally { Storage.prototype.setItem = orig; }
      return geschreven;
    });
    expect(r).toEqual([]);
  });
});

test.describe('2 - de scan kijkt verder dan één dag en scheidt de bronnen', () => {
  test('beide kruisbron-paren worden gevonden, op hun eigen dagafstand', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('met VERSCHILLENDE bron: 2');
    expect(t).toMatch(/per dagafstand: 0 dagen 1, 3 dagen 1/);
  });

  test('een paar uit dezelfde bron is geen kandidaat', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toMatch(/met DEZELFDE bron: 1\b/);
  });

  test('de rekening met twee bronnen wordt benoemd', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('rekeningen met MEER DAN EEN bron: 999100200 (mt940+psd2)');
  });
});

test.describe('3 - per paar staat erbij welke ontdubbeling hem had kunnen zien', () => {
  test('softKey gelijk en dupSig anders: geen enkele pakt hem', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('zelfde _softKey (de soft-dedup had hem kunnen zien zonder de rekening-eis): 1 van 2');
    expect(t).toContain('zelfde _dupSig (de opschoontool ziet hem al):                              0 van 2');
    expect(t).toContain('paren waarvan minstens een kant een bankRef draagt: 2 van 2');
    expect(t).toMatch(/de opschoontool zou NU opruimen: 0 van 2 paren/);
  });

  test('de bankRef staat per boeking in de regel', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('bankRef=MT-0001');
    expect(t).toContain('bankRef=PS-0001');
  });
});

test.describe('4 - waar de categorie vandaan komt staat erbij', () => {
  test('een override wordt als OVR benoemd en niet als keyword-uitkomst', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    /* Dit is de correctie op de eerste verklaring: de desc kan de ontsnapping niet zijn, want de
       parsers zetten de naam altijd in de desc. Wat overblijft is OVR of een eigen regel. */
    expect(t).toMatch(/cat=overig\s+ruleCat=intern autoCat=intern OVR=overig/);
    expect(t).toMatch(/cat=intern\s+\(uit de keyword-regels\)/);
    expect(t).toContain('handmatige categorie-overrides (OVR): 1');
  });

  test('zonder override komen beide kanten uit de keyword-regels', async ({ page }) => {
    await boot(page, { ovr: false });
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).not.toContain('OVR=overig');
    expect(t).toContain('handmatige categorie-overrides (OVR): 0');
  });

  test('de eigen regels worden uitgelezen, want die winnen van RULES', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('eigen regels (SET.rules, die winnen van de ingebouwde RULES): 0');
  });
});

test.describe('5 - boekdatum of transactiedatum', () => {
  test('de desc-datum wordt geteld en naast t.date gelegd', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('boekingen met een datum IN de desc: 2   waarvan met een tijd erbij: 2');
    expect(t).toMatch(/t\.date tegen de datum in de desc:.*t\.date 2 dagen later 1/);
    expect(t).toMatch(/t\.date tegen de datum in de desc:.*gelijk 1/);
  });

  test('de weekdagverdeling verschuift, en het blok zegt van welke dag naar welke', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    /* 300 euro op maandag geboekt en op zaterdag betaald, 50 euro op woensdag voor beide. De piek
       hoort dus van maandag naar zaterdag te schuiven, en dat is het hele punt voor signaal 3. */
    expect(t).toContain('verschuift de piek: JA, van ma op t.date naar za op de desc-datum');
    expect(t).toMatch(/op t\.date:\s+ma 86%/);
    expect(t).toMatch(/op de desc-datum:\s+ma 0%/);
  });

  test('wat t.date per bron is, staat er als nagelezen en niet als meting', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('WAT t.date IS PER BRON (nagelezen in de bron, niet gemeten)');
    expect(t).toContain('mt940: de VALUTADATUM uit :61:');
    expect(t).toContain('psd2:  booking_date || value_date || transaction_date, dus de BOEKDATUM voorop');
  });
});
