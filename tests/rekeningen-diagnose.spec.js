/* v270: blok 8 van DIAG_BLOKKEN, de rekeningen en de bankverbindingen.
 *
 * DE AANLEIDING: een N26-Space met boekingen stond niet in de saldolijst. GEMETEN dat zo'n rekening
 * WEL in OWN zit en WEL meetelt, maar door zichtbareRek() (v146) uit de getoonde lijst valt zodra de
 * bank er geen saldo bij levert. Dat gat is nergens in één beeld te zien.
 *
 * WAT DIT BLOK TOEVOEGT boven de overlap-sheet van v149/v152: de identification_hash. GEMETEN op de
 * vier standen van de accId-resolutie in psd2IngestSession(): een Space MET hash die een IBAN krijgt
 * houdt zijn id, een Space ZONDER hash krijgt een nieuwe id uit de IBAN-cijfers, en dan verandert
 * elke transactie-id op die rekening en vallen alle vlaggen die aan t.id hangen weg.
 *
 * DE FIXTURE is geconstrueerd en niet de toestand van het toestel (v251/v256): hij draagt vijf
 * rekeningen in precies de standen die de resolutie onderscheidt, waaronder een Space met boekingen
 * en zonder saldo, en een gekoppelde rekening van vóór v151 zonder hash.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ABN = '100110012555096222';
const N26M = '1234567890';
const SPACE = 'psd2h_ab12cd34ef56';   // Space met boekingen, MET hash, ZONDER saldo
const OUDSTIJL = 'psd2_oudstij';      // gekoppeld, geen boekingen, GEEN hash (van vóór v151)
/* v281: GEEN hash, maar de id IS de ibanNum-uitkomst van zijn eigen IBAN. Dat is het geval waarop de
   herkoppeling van 28 sep 2026 werkelijk draaide: vier N26-rekeningen zonder opgeslagen hash hielden hun
   id, want de resolutie leest `bekend || ibanNum(iban) || psd2h_<hash> || psd2_<uid>` en de IBAN komt
   vóór de hash. Zonder deze rij toetst de spec alleen de tak die zegt dat de id verandert, en juist die
   tak was onwaar voor een rekening als deze. */
const IBANID = '370400449876543210';

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (d, a, n, desc, ac, src) => tx.push({ id: 'x' + tx.length, date: d, amount: a, acc: ac,
    name: n, desc: desc || n, typ: '', ref: '', src: src || 'psd2', accName: '', refNums: [] });
  for (let i = 3; i >= 0; i--) {
    const m = M(i);
    add(m + '-25', 5216, 'Loonstrook', 'SALARIS MAANDELIJKS', ABN, 'mt940');
    add(m + '-06', -220, 'Albert Heijn', 'BEA, Albert Heijn', ABN, 'mt940');
    add(m + '-10', -80, 'Etos', 'BEA, Etos', N26M);
    add(m + '-12', -45, 'Boekhandel', 'BEA, Boekhandel', SPACE);
    add(m + '-14', -30, 'Kruidvat', 'BEA, Kruidvat', IBANID);
  }
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: true,
      /* IBANID krijgt een saldo, zodat de nieuwe rij de som en de missing-telling van de bestaande
         tests niet verschuift: die gaan over een rekening ZONDER saldo (de Space) en niet over de
         hash-resolutie. Een fixture-rij die een andere eigenschap meeverschuift maakt de meting van
         die eigenschap onleesbaar. */
      manualBal: Object.assign({ [ABN]: 4200, [N26M]: 300, [IBANID]: 0 }, opt.bal || {}),
      budgets: { boodschappen: 700 },
      toonLegeRek: !!opt.toonLege,
      psd2Accounts: {
        [N26M]: { uid: 'uid-main', iban: 'DE89370400441234567890', hash: 'h-main', label: 'Main ··7890', bank: 'N26', exp: '2027-03-01' },
        [SPACE]: { uid: 'uid-space', iban: '', hash: 'ab12cd34ef56', label: 'Zakgeld', bank: 'N26', exp: '2027-03-01' },
        [OUDSTIJL]: { uid: 'uid-oud', iban: '', label: 'Buffer rust', bank: 'N26', exp: '2026-11-01' },
        [IBANID]: { uid: 'uid-iban', iban: 'DE89370400449876543210', label: 'Spaarpot ··3210', bank: 'N26', exp: '2027-03-01' },
      },
      psd2LastSync: Date.now() - 3 * 86400000, psd2Url: 'https://x.workers.dev', psd2Token: 't' }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  // de boot roept psd2Refresh() aan zodra er gekoppelde rekeningen zijn; de backend bestaat hier niet
  await page.route('**x.workers.dev/**', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagRekeningen === 'function');
  await helper(page);
}
// in page.evaluate bestaat REGELS niet; daarom een helper die in de pagina wordt gezet
async function helper(page){ await page.evaluate(()=>{ window.REGELS_=()=>diagRekeningen().join(String.fromCharCode(10)); }); }

test.describe('0 - de fixture draagt de standen die hij belooft', () => {
  test('een Space met boekingen en zonder saldo, en een gekoppelde zonder hash', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      spaceInOWN: OWN.indexOf('psd2h_ab12cd34ef56') >= 0,
      spaceTx: TX.filter((t) => t.acc === 'psd2h_ab12cd34ef56').length,
      spaceSaldo: accBalance('psd2h_ab12cd34ef56'),
      oudInOWN: OWN.indexOf('psd2_oudstij') >= 0,
      oudHash: (SET.psd2Accounts['psd2_oudstij'] || {}).hash === undefined,
      consents: [...new Set(Object.values(SET.psd2Accounts).map((v) => v.exp))].sort() }));
    expect(r.spaceInOWN).toBe(true);
    expect(r.spaceTx).toBe(4);
    expect(r.spaceSaldo).toBe(null);
    expect(r.oudInOWN).toBe(false);
    expect(r.oudHash).toBe(true);
    expect(r.consents).toEqual(['2026-11-01', '2027-03-01']);
  });
});

test.describe('a - een rekening met boekingen maar zonder saldo valt uit de lijst en niet uit de som', () => {
  test('de drie sommen zeggen niet hetzelfde, en het blok zegt per rekening welke', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const t = REGELS_();
      return { tekst: t,
        inOWN: OWN.indexOf('psd2h_ab12cd34ef56') >= 0,
        zichtbaar: zichtbareRek().indexOf('psd2h_ab12cd34ef56') >= 0,
        ownN: OWN.length,
        zonderSaldo: OWN.filter((x) => accBalance(x) == null),
        tb: (function () { const b = totalBalance(); return { sum: Math.round(b.sum), known: b.known, missing: b.missing }; })() }; });
    expect(r.inOWN).toBe(true);
    expect(r.zichtbaar).toBe(false);
    /* v281: de fixture kreeg er een rekening bij voor de hash-resolutie, en die draagt een saldo van 0.
       De eigenschap die hier telt is dat de Space als `missing` uit de SOM valt terwijl hij in OWN zit,
       en die staat los van hoeveel rekeningen er verder zijn. Vandaar de identiteit in plaats van drie
       absolute getallen: de som is die van de rekeningen MET een saldo, en de Space zit er niet in. */
    expect(r.tb.missing).toBeGreaterThan(0);
    expect(r.tb.sum).toBe(4500);
    expect(r.tb.known + r.tb.missing).toBe(r.ownN);
    expect(r.zonderSaldo).toContain('psd2h_ab12cd34ef56');
    /* PER REGEL EN NIET OP DE HELE TEKST: mijn eerste vorm toetste of de zin ergens voorkwam, en
       die staat twee keer (bij totalBalance en bij safeToSpend). Een sabotage op de eerste bleef
       daardoor groen op de tweede. Nu leest de test de regels van DEZE rekening apart. */
    const alle = r.tekst.split(String.fromCharCode(10));
    const i = alle.indexOf('  psd2h_ab12cd34ef56');
    expect(i, 'kopregel van de Space niet gevonden').toBeGreaterThan(-1);
    const blok = [];
    for (let k = i + 1; k < alle.length && /^ {4}\S/.test(alle[k]); k++) blok.push(alle[k]);
    expect(blok.length).toBeGreaterThan(8);
    const regel = (kop) => (blok.find((x) => x.includes(kop)) || '').trim();
    expect(regel('in OWN:')).toBe('in OWN:             ja');
    expect(regel('in totalBalance():')).toBe('in totalBalance():  telt als missing, NIET in de som');
    expect(regel('in safeToSpend():')).toBe('in safeToSpend():   telt als missing, NIET in de som');
    expect(regel('in de lijst:')).toBe('in de lijst:        NEE, verborgen door zichtbareRek()');
    expect(regel('saldo:')).toContain('ONBEKEND');
  });

  test('met SET.toonLegeRek aan staat hij wel in de lijst, en geen enkel cijfer beweegt', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => ({ zicht: zichtbareRek().length, lijst: zichtbareRek().slice(),
      sum: Math.round(totalBalance().sum), safe: Math.round(safeToSpend().safe || 0) }));
    await boot(page, { toonLege: true });
    const aan = await page.evaluate((v) => ({ zicht: zichtbareRek().length,
      erbij: zichtbareRek().filter((x) => v.indexOf(x) < 0),
      zonderSaldo: OWN.filter((x) => accBalance(x) == null),
      sum: Math.round(totalBalance().sum),
      safe: Math.round(safeToSpend().safe || 0), tekst: REGELS_() }), uit.lijst);
    /* v281: bind op het VERSCHIL en op WELKE rekening erbij komt, niet op twee absolute tellingen. Die
       twee schuiven mee met elke rij die de fixture erbij krijgt, terwijl de eigenschap is dat de
       schakelaar precies de rekeningen zonder saldo toevoegt en geen enkel cijfer beweegt. */
    expect(aan.zicht - uit.zicht).toBe(aan.zonderSaldo.length);
    expect(aan.erbij).toContain('psd2h_ab12cd34ef56');
    expect(aan.sum).toBe(uit.sum);      // de schakelaar is weergave, geen berekening (v146)
    expect(aan.safe).toBe(uit.safe);
    expect(aan.tekst).toContain('in de lijst:        ja');
  });

  test('een gekoppelde rekening zonder boekingen valt buiten OWN en staat er als zodanig', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ tekst: REGELS_(), leeg: rekZonderBoekingen() }));
    expect(r.leeg).toEqual(['psd2_oudstij']);
    expect(r.tekst).toContain('NEE (gekoppeld, geen boekingen)');
    expect(r.tekst).toContain('gekoppeld zonder boekingen: psd2_oudstij');
  });
});

test.describe('b - de hash is het beslissende veld en staat erbij', () => {
  /* HERSCHREVEN BIJ v281, naar een STERKERE eis. De oude vorm pinde één string: 'GEEN - bij een
     herkoppeling krijgt deze rekening een NIEUWE id'. Die bewering is GEMETEN ONJUIST voor een rekening
     waarvan de id uit de IBAN komt, en de herkoppeling van 28 sep 2026 heeft dat aangetoond: vier
     rekeningen zonder opgeslagen hash hielden hun id. De eis is nu dat het blok de twee gevallen SCHEIDT,
     en dat is meer dan de oude assertie deed: die kon niet zien dat er twee gevallen waren. */
  test('het blok noemt de hash per rekening en scheidt de twee gevallen zonder hash', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => REGELS_());
    /* PER REKENING EN NIET OVER DE HELE TEKST. Mijn eerste vorm toetste of beide zinnen ergens voorkwamen,
       en toen bleef de sabotage die de twee takken VERWISSELT groen: beide stonden er nog, alleen bij de
       verkeerde rekening. Dat is de meetles dat een sabotage de uitvoer kan veranderen zonder dat iemand
       op de juiste plek kijkt. */
    const bij = (acc, kop) => { const alle = r.split(String.fromCharCode(10));
      const i = alle.indexOf('  ' + acc);
      if (i < 0) return '(kopregel niet gevonden)';
      for (let k = i + 1; k < alle.length && /^ {4}\S/.test(alle[k]); k++) if (alle[k].includes(kop)) return alle[k].trim();
      return '(regel niet gevonden)'; };
    expect(bij('psd2h_ab12cd34ef56', 'identification_hash:')).toBe('identification_hash: ab12cd34ef56');
    expect(bij('370400449876543210', 'identification_hash:'))
      .toBe('identification_hash: GEEN - maar de id komt uit de IBAN, dus een herkoppeling houdt hem');
    expect(bij('psd2_oudstij', 'identification_hash:'))
      .toBe('identification_hash: GEEN en geen IBAN-match, dus een herkoppeling geeft deze rekening een NIEUWE id');
    expect(r).toContain('gekoppeld ZONDER identification_hash:');
    expect(r).toMatch(/de hash is de DERDE optie in de resolutie/);
    // en de oude, onware bewering staat er nergens meer
    expect(r).not.toMatch(/die krijgen bij een herkoppeling een nieuwe id/);
  });

  /* DE TWEE TAKKEN MOETEN OP DE ECHTE RESOLUTIE STAAN en niet op een eigen vergelijking in het blok:
     `ibanNum()` is wat psd2IngestSession() gebruikt, dus die beslist. */
  test('welke tak er staat volgt uit ibanNum(), niet uit een eigen regel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const ps = SET.psd2Accounts || {};
      const uit = {};
      for (const k in ps) uit[k] = { hash: !!ps[k].hash, ibanNum: ibanNum(ps[k].iban || ''), match: ibanNum(ps[k].iban || '') === k };
      return uit;
    });
    expect(r['370400449876543210']).toEqual({ hash: false, ibanNum: '370400449876543210', match: true });
    expect(r['psd2_oudstij'].match).toBe(false);
    expect(r['psd2_oudstij'].hash).toBe(false);
  });

  test('de accId-resolutie: met hash houdt hij zijn id, zonder hash krijgt hij een nieuwe', async ({ page }) => {
    await boot(page);
    // de regels komen uit psd2IngestSession(); hier nagerekend op de vier standen
    const r = await page.evaluate(() => {
      const resolve = (meta, a) => { const hash = a.hash || ''; let bekend = '';
        if (hash) for (const k in meta) { if (meta[k] && meta[k].hash === hash) { bekend = k; break; } }
        return bekend || ibanNum(a.iban || '') || (hash ? 'psd2h_' + String(hash).slice(0, 16) : 'psd2_' + String(a.uid).slice(0, 8)); };
      const metHash = { 'psd2h_ab12cd34ef56': { uid: 'oud', iban: '', hash: 'ab12cd34ef56' } };
      const zonderHash = { 'psd2_oudstij': { uid: 'oud', iban: '' } };
      const IBAN = 'DE89370400449876543210';
      return {
        A: resolve(metHash, { uid: 'nieuw', iban: IBAN, hash: 'ab12cd34ef56' }),
        B: resolve(zonderHash, { uid: 'nieuw', iban: IBAN, hash: 'ab12cd34ef56' }),
        C: resolve(metHash, { uid: 'heel-andere-uid', iban: '', hash: 'ab12cd34ef56' }),
        D: resolve(zonderHash, { uid: 'heel-andere-uid', iban: '' }),
        bron: (String(psd2IngestSession).match(/const accId\s*=[^;]+;/) || [''])[0] }; });
    expect(r.A).toBe('psd2h_ab12cd34ef56');            // hash bekend: id blijft
    expect(r.B).toBe('370400449876543210');            // geen hash: nieuwe id uit de IBAN
    expect(r.C).toBe('psd2h_ab12cd34ef56');            // nieuwe uid, hash bekend: id blijft (v151)
    expect(r.D).toBe('psd2_heel-and');                 // geen hash, geen IBAN: nieuwe id per sessie
    expect(r.bron).toContain('bekend || ibanNum(iban)');
  });
});

test.describe('c - wat een nieuwe rekening-id met de vlaggen doet', () => {
  test('alles wat aan t.id hangt gaat weg, wat aan recurKey of aan een post hangt blijft', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.acc === 'psd2h_ab12cd34ef56');
      const mk = (o) => { const c = Object.assign({}, t, o); delete c.id; categorize(c); return c.id; };
      OVR[t.id] = 'vices'; SET.onregelmatig = { [t.id]: 45 }; SET.uitReservering = { [t.id]: 45 };
      SET.fixOvr = { [t.id]: 'fixed' }; SET.fixDueExcl = { [recurKey(t)]: { sinds: '2026-01-01' } };
      SET.resBetaald = { rA: { op: '2026-09-01', maand: '2026-09' } };
      const nieuw = mk({ acc: '370400449876543210' });
      return { zelfde: mk({}) === t.id, nieuweId: nieuw !== t.id,
        naamAlleen: mk({ name: 'Andere naam' }) === t.id,
        accNameAlleen: mk({ accName: 'Nieuwe Space-naam' }) === t.id,
        descAnders: mk({ desc: t.desc + ' EXTRA' }) === t.id,
        OVR: OVR[nieuw] === undefined ? 'weg' : 'blijft',
        onregelmatig: SET.onregelmatig[nieuw] === undefined ? 'weg' : 'blijft',
        uitReservering: SET.uitReservering[nieuw] === undefined ? 'weg' : 'blijft',
        fixOvr: SET.fixOvr[nieuw] === undefined ? 'weg' : 'blijft',
        fixDueExcl: SET.fixDueExcl[recurKey(Object.assign({}, t, { acc: '370400449876543210' }))] ? 'blijft' : 'weg',
        resBetaald: SET.resBetaald.rA ? 'blijft' : 'weg' }; });
    expect(r.zelfde).toBe(true);
    expect(r.nieuweId).toBe(true);
    expect(r.naamAlleen).toBe(true);        // de naam zit niet in de id, de desc wel
    expect(r.accNameAlleen).toBe(true);     // accName is een CSV-veld en zit niet in de id
    expect(r.descAnders).toBe(false);
    expect(r.OVR).toBe('weg');
    expect(r.onregelmatig).toBe('weg');
    expect(r.uitReservering).toBe('weg');
    expect(r.fixOvr).toBe('weg');
    expect(r.fixDueExcl).toBe('blijft');
    expect(r.resBetaald).toBe('blijft');
  });

  test('commitTx filtert dezelfde rekening op id weg en een nieuwe id juist niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const kop = (acc) => TX.filter((t) => t.acc === 'psd2h_ab12cd34ef56')
        .map((t) => { const c = Object.assign({}, t, acc ? { acc } : {}); delete c.id; categorize(c); return c; });
      const n0 = TX.length; const a1 = commitTx(kop(null), null); const n1 = TX.length;
      const a2 = commitTx(kop('370400449876543210'), null); const n2 = TX.length;
      return { a1, a2, n0, n1, n2, overlap: rekeningOverlap().map((o) => o.gedeeld) }; });
    expect(r.a1).toBe(0);           // zelfde id: niets toegevoegd, geen dubbele boekingen
    expect(r.n1).toBe(r.n0);
    expect(r.a2).toBe(4);           // andere rekening-id: vier keer hetzelfde erbij
    expect(r.n2).toBe(r.n0 + 4);
    expect(r.overlap).toEqual([4]); // en rekeningOverlap() ziet dat
  });
});

test.describe('d - wat de app over de verbindingen weet, en niet weet', () => {
  test('de groepering is afgeleid uit bank en consent, en het blok zegt dat', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => REGELS_());
    expect(r).toContain('PER VERBINDING (afgeleid uit bank + consent-vervaldatum; nergens opgeslagen)');
    expect(r).toContain('N26 | consent tot 2027-03-01');
    expect(r).toContain('N26 | consent tot 2026-11-01');
    expect(r).toContain('aantal afgeleide verbindingen:     2');
    expect(r).toContain('laatste import per rekening:       bestaat niet, er is geen veld');
    expect(r).toContain('bewaarde foutstatus:               bestaat niet, er is geen veld');
  });

  test('er is geen per-rekening tijdstip en geen foutveld in SET', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const v = Object.values(SET.psd2Accounts || {});
      return { lastSync: v.every((x) => x.lastSync === undefined),
        error: v.every((x) => x.error === undefined),
        globaal: typeof SET.psd2LastSync,
        velden: [...new Set(v.flatMap((x) => Object.keys(x)))].sort() }; });
    expect(r.lastSync).toBe(true);
    expect(r.error).toBe(true);
    expect(r.globaal).toBe('number');
    expect(r.velden).toEqual(['bank', 'exp', 'hash', 'iban', 'label', 'uid']);
  });

  test('psd2Disconnect() wist alle verbindingen tegelijk, niet een enkele', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function psd2Disconnect(');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('}', src.indexOf('render()', i)));
    expect(body).toContain('SET.psd2Accounts={}');
    expect(body).not.toMatch(/delete SET\.psd2Accounts\[/);
  });
});

test.describe('e - het blok leest alleen', () => {
  test('geen save(), niets naar SET of localStorage, geen netwerk', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const setVoor = localStorage.getItem('minder_set');
      const txVoor = localStorage.getItem('minder_tx');
      let writes = 0; const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) { writes++; return echt(k, v); };
      let fetches = 0; const of_ = window.fetch; window.fetch = function () { fetches++; return of_.apply(this, arguments); };
      const setKeysVoor = Object.keys(SET).length;
      const uit = diagRekeningen();
      localStorage.setItem = echt; window.fetch = of_;
      return { writes, fetches, regels: uit.length,
        setGelijk: localStorage.getItem('minder_set') === setVoor,
        txGelijk: localStorage.getItem('minder_tx') === txVoor,
        setKeys: Object.keys(SET).length === setKeysVoor }; });
    expect(r.writes).toBe(0);
    expect(r.fetches).toBe(0);
    expect(r.setGelijk).toBe(true);
    expect(r.txGelijk).toBe(true);
    expect(r.setKeys).toBe(true);
    expect(r.regels).toBeGreaterThan(20);
  });

  test('het blok staat als entry in DIAG_BLOKKEN en het scherm kent hem niet bij naam', async ({ page }) => {
    await boot(page);
    /* v271: dit bond op DIAG_BLOKKEN.length en op de LAATSTE entry, en viel dus om zodra er een blok
       bij kwam. Dat is niet de eigenschap: de eigenschap is dat dit blok EEN entry is en dat
       diagTekst() geen blok bij naam kent (v244). Een blok erbij is een entry erbij, en daar hoort
       geen test op te vallen. */
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some(b => b.lees === diagRekeningen),
      titel: (DIAG_BLOKKEN.find(b => b.lees === diagRekeningen) || {}).titel,
      inTekst: !/diagRekeningen/.test(String(diagTekst)) }));
    expect(r.erin).toBe(true);
    expect(r.titel).toBe('de rekeningen en de bankverbindingen');
    expect(r.inTekst).toBe(true);   // diagTekst() kent geen blok bij naam (v244)
  });
});

test.describe('f - de pending-tak van psd2IngestSession is dood', () => {
  /* GEVONDEN tijdens dit onderzoek, en het is de v215-meetles in app-code: een regel die door een
     // -comment is opgeslokt. `const dp=await psd2Api(...)` staat achter "// v197: pending telt altijd
     mee" op dezelfde regel, dus dp is nooit gedeclareerd, dp.transactions gooit, en de catch eromheen
     slikt het. Bij een eerste koppeling komen er dus geen pending-boekingen binnen. psd2Refresh()
     heeft dezelfde aanroep wel intact, dus de eerstvolgende verversing haalt ze alsnog.
     DEZE TEST PINT BEWUST DE KAPOTTE STAND. v270 repareert hem niet (de opdracht was onderzoek plus
     een diagnoseblok), en zonder test zou de vondst alleen in de changelog staan. Repareer je de
     regel, dan valt deze test met opzet: werk hem dan bij in plaats van hem te omzeilen. */
  test('de fetch staat in het comment, en in psd2Refresh() staat hij er wel', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function psd2IngestSession(');
    const body = src.slice(i, src.indexOf('\nfunction mapPsd2Tx(', i));
    const regel = (body.match(/\/\/ v197: pending telt altijd mee[^\n]*/) || [''])[0];
    expect(regel).toContain('const dp=await psd2Api');   // de fetch staat achter //
    expect(regel).toContain('transaction_status=PDNG');
    const ri = src.indexOf('async function psd2Refresh(');
    const rbody = src.slice(ri, src.indexOf('\nfunction psd2GeenBackend(', ri));
    const rregel = (rbody.match(/[^\n]*transaction_status=PDNG[^\n]*/) || [''])[0];
    expect(rregel).toContain('const dp=await psd2Api');
    expect(rregel.split('//')[0]).toContain('const dp=await psd2Api');   // hier staat hij NIET in een comment
  });
});
