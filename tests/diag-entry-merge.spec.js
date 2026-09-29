/* v298: `psd2DiagZet()` mergt per veld in plaats van de hele entry te vervangen.
 *
 * HET GEVAL, gemeten op het toestel op 29 sep 2026. De twee sync-routes schrijven niet dezelfde velden:
 * `psd2Refresh()` draagt sinds v296 ook de pending-aanroep (`pendN`, `pendMap`, `pendFout`, `pendGeland`)
 * en `psd2IngestSession()` draagt die vier niet. Met `D[accId]=Object.assign({op}, rec)` VERVING een
 * herkoppeling dus de hele entry en wiste hij de pending-meting die een vernieuwing net had vastgelegd,
 * zonder dat er iets faalde. Blok 13 zei bij vijf rekeningen "gaf niet vastgelegd" terwijl `syncs` op 3
 * stond; een gewone vernieuwing erna zette alle zes de rijen op `gaf 0`.
 *
 * WAT MERGEN KOST, EN WAAROM DE HELFT VAN DEZE SPEC DAAROVER GAAT: een veld dat blijft staan is niet meer
 * per definitie van de LAATSTE sync. Zonder een stempel per veld zou de reparatie precies het verkeerde
 * etiket terugbrengen dat hij wegneemt, een stap verderop: niet een ontbrekende meting die als nul leest
 * (v296), maar een oude meting die als de laatste leest. Daarom draagt de entry `_op` (het moment van de
 * laatste schrijver) en `_veldOp` (het moment per veld), en zeggen blok 8 en blok 13 het als die twee
 * uiteenlopen.
 *
 * HET STEMPEL IS EEN MOMENT EN GEEN DAG, en dat is geen smaak: op het toestel liepen er vier syncs op één
 * dag, dus `op` (een kalenderdag, v199) kan de twee schrijvers van die dag per constructie niet scheiden.
 *
 * DE SPEC LOOPT DOOR DE ECHTE ROUTES (meetles c en g): `psd2Refresh()` en `psd2IngestSession()` zelf, met
 * `psd2Api` vervangen. Een test die `psd2DiagZet()` rechtstreeks aanroept toetst de helper en niet de
 * bewering, en de bewering gaat over wat een HERKOPPELING met een eerdere vernieuwing doet.
 *
 * SECTIE 0 MEET EERST DAT DE TWEE ROUTES WERKELIJK VERSCHILLENDE VELDEN SCHRIJVEN. Doen ze dat niet, dan
 * kan de merge per constructie niets bewaren en toetst elke test hieronder niets (meetles b en o).
 *
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const { sectieVan } = require('./bron-sectie');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const VANDAAG = ymd(now);
const ACC1 = '888100200';
const ACC2 = '888100300';

function seed() {
  const tx = [
    { id: 'a1', date: VANDAAG, amount: 2500, acc: ACC1, src: 'psd2', name: 'Loon',
      desc: 'SALARIS MAANDELIJKS', typ: '', ref: '', accName: '', refNums: [] },
    { id: 'a2', date: VANDAAG, amount: -12.5, acc: ACC2, src: 'psd2', name: 'Bakker',
      desc: 'Bakker Brood PMNT', typ: '', ref: '', accName: '', refNums: [] },
  ];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 2500,
      manualBal: { [ACC1]: 1000, [ACC2]: 200 }, budgets: { boodschappen: 300 },
      psd2Url: 'https://x.test', psd2Token: 't',
      /* De hash is wat een herkoppeling op DEZELFDE rekening-id laat landen (v281): `bekend` wint van
         de IBAN en van de uid. Zonder hem zou de koppel-route een nieuwe id maken en zou deze spec een
         ander geval toetsen dan hij beschrijft. */
      psd2Accounts: { [ACC1]: { uid: 'u1', label: 'Main', hash: 'h1' },
                      [ACC2]: { uid: 'u2', label: 'Zakgeld', hash: 'h2' } },
      valutaTally: { [ACC1]: { gezien: 10 }, [ACC2]: { gezien: 5 } } }),
    minder_own: JSON.stringify([ACC1, ACC2]),
    minder_accmeta: JSON.stringify({ [ACC1]: { balance: 1000, date: VANDAAG },
                                     [ACC2]: { balance: 200, date: VANDAAG } }),
    minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof psd2DiagZet === 'function' && typeof psd2Refresh === 'function'
    && typeof psd2IngestSession === 'function' && typeof psd2DiagHerkomst === 'function'
    && typeof diagPendBots === 'function' && typeof diagRekeningen === 'function');
}

/* De stub geeft beide routes hetzelfde: een gelukte transactie-aanroep, een saldo, en een lege
   pending-lijst. Wat de twee onderscheidt is dus NIET de respons maar welke velden de route wegschrijft,
   en dat is precies de eigenschap die deze spec toetst. */
const STUB = `
  psd2Api = async (pad) => {
    if(/transaction_status=PDNG/.test(pad)) return { transactions:[
      { transaction_amount:{amount:'9.99'}, credit_debit_indicator:'DBIT', booking_date:'%D%',
        creditor:{name:'Pending Winkel'}, remittance_information:'Test',
        bank_transaction_code:{description:'PMNT'} } ] };
    if(/\\/balances/.test(pad)) return { balances:[{ balance_amount:{amount:'1000.00'},
      balance_type:'ITBD' }] };
    return { transactions:[] };
  };`;

const lees = `JSON.parse(JSON.stringify({ diag:SET.psd2Diag||{}, bots:SET.pendBots||{} }))`;

const draai = (page, wat) => page.evaluate(new Function('return (async()=>{'
  + (STUB + wat + '\n  return ' + lees + ';').split('%D%').join(VANDAAG)
      .split('%A1%').join(ACC1).split('%A2%').join(ACC2) + '})()'));

/* Een herkoppeling van ALLEEN de eerste rekening. De tweede blijft van de vernieuwing, en dat verschil
   is de discriminator: zonder een rekening die NIET is herkoppeld toetst een uitlezing die overal
   hetzelfde merkteken zet net zoveel als een uitlezing die het nergens zet (meetles h). */
const HERKOPPEL = `
  await psd2IngestSession({ accounts:[{ uid:'u1b', identification_hash:'h1', name:'Main' }],
    aspsp:{ name:'N26' }, access:{ valid_until:'2026-12-28' } });`;

const blok13 = (page) => page.evaluate(() => diagPendBots().join(String.fromCharCode(10)));
const blok8 = (page) => page.evaluate(() => Promise.resolve(diagRekeningen())
  .then((r) => r.join(String.fromCharCode(10))));
const rijVan = (tekst, acc) => tekst.split('\n').filter((l) => l.indexOf(acc) > -1).join('\n');

test.describe('0 - de invoer, zonder welke geen enkele test hieronder iets toetst', () => {
  /* DE TWEE ROUTES MOETEN VERSCHILLENDE VELDEN SCHRIJVEN. Schrijven ze hetzelfde, dan bewaart de merge
     per constructie niets en blijft elke sabotage hieronder groen. */
  test('de vernieuw-route legt de pending-aanroep vast en de koppel-route niet', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const ref = sectieVan(src, 'async function psd2Refresh(silent){');
    const ing = sectieVan(src, 'async function psd2IngestSession(s){');
    expect(ref).toContain('pendN');
    expect(ref).toContain('psd2DiagZet(');
    expect(ing).toContain('psd2DiagZet(');
    expect(ing, 'de koppel-route draagt de pending-velden niet, en dat is de v270-stand').not.toContain('pendN,');
  });

  test('de herkoppeling landt op dezelfde rekening-id, anders gaat dit over een andere rekening', async ({ page }) => {
    await boot(page);
    const r = await draai(page, '\n  await psd2Refresh(true);' + HERKOPPEL);
    expect(Object.keys(r.diag).sort()).toEqual([ACC1, ACC2].sort());
    expect(r.bots[ACC1].syncs, 'twee syncs op dezelfde rekening').toBe(2);
    expect(r.bots[ACC2].syncs, 'die is maar een keer gesynchroniseerd').toBe(1);
  });
});

test.describe('1 - de merge zelf', () => {
  /* DE TEST VAN DE OPDRACHT: koppel-route na vernieuw-route laat de pending-kolommen staan. */
  test('een herkoppeling na een vernieuwing wist de pending-meting niet', async ({ page }) => {
    await boot(page);
    const r = await draai(page, '\n  await psd2Refresh(true);' + HERKOPPEL);
    expect(r.diag[ACC1].pendN, 'de vernieuwing mat er een en de herkoppeling meet hem niet').toBe(1);
    expect(r.diag[ACC1].pendMap).toBe(1);
    expect(r.diag[ACC1].pendGeland).toBe(true);
  });

  /* EN HIJ NEGEERT DE TWEEDE SCHRIJVER NIET: wat de route WEL meet wordt bijgewerkt. Zonder deze test
     zou "alles laten staan" ook groen zijn, en dat is geen merge maar een slot. */
  test('wat de herkoppeling wel meet komt er wel in', async ({ page }) => {
    await boot(page);
    const r = await draai(page, `
  await psd2Refresh(true);
  const na1 = SET.psd2Diag['%A1%'].balTypes;
  psd2Api = async (pad) => {
    if(/transaction_status=PDNG/.test(pad)) return { transactions:[] };
    if(/\\/balances/.test(pad)) return { balances:[{ balance_amount:{amount:'77.00'}, balance_type:'XPCD' }] };
    return { transactions:[] };
  };` + HERKOPPEL + `
  SET._na1 = na1;`);
    expect(r.diag[ACC1].balUit, 'de saldo-velden komen van de herkoppeling').toBe(77);
    expect(r.diag[ACC1].balTypes).toBe('XPCD');
    expect(r.diag[ACC1].pendN, 'en de pending-velden staan er nog').toBe(1);
  });

  test('de entry draagt een stempel per veld en een moment voor de laatste schrijver', async ({ page }) => {
    await boot(page);
    const r = await draai(page, '\n  await psd2Refresh(true);' + HERKOPPEL);
    const d = r.diag[ACC1];
    expect(typeof d._op).toBe('number');
    expect(typeof d._veldOp).toBe('object');
    expect(d._veldOp.txN, 'de transactie-velden zijn van de laatste schrijver').toBe(d._op);
    expect(d._veldOp.pendN, 'de pending-velden niet').toBeLessThan(d._op);
  });

  test('psd2DiagVers scheidt vers, ouder en niet vast te stellen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(new Function('return (async()=>{' + STUB.split('%D%').join(VANDAAG) + `
  await psd2Refresh(true);` + HERKOPPEL + `
  const d = SET.psd2Diag['${ACC1}'];
  return { vers: psd2DiagVers(d,'txN'), ouder: psd2DiagVers(d,'pendN'),
    geenVeld: psd2DiagVers(d,'bestaatNiet'),
    geenEntry: psd2DiagVers(null,'txN'),
    oudeVorm: psd2DiagVers({ op:'2026-01-01', txN:3 },'txN') };
})()`));
    expect(r.vers).toBe(true);
    expect(r.ouder).toBe(false);
    expect(r.geenVeld, 'een veld zonder stempel is niet vast te stellen').toBe(null);
    expect(r.geenEntry).toBe(null);
    expect(r.oudeVorm, 'een entry van voor v298 draagt geen stempel').toBe(null);
  });
});

test.describe('2 - de herkomst per groep', () => {
  test('na een vernieuwing is elke groep vers, na een herkoppeling is pending ouder', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(new Function('return (async()=>{' + STUB.split('%D%').join(VANDAAG) + `
  await psd2Refresh(true);
  const na1 = ['transactie','saldo','pending'].map(g=>psd2DiagHerkomst(SET.psd2Diag['${ACC1}'],g).stand);` + HERKOPPEL + `
  const d1 = SET.psd2Diag['${ACC1}'], d2 = SET.psd2Diag['${ACC2}'];
  return { na1,
    na2: ['transactie','saldo','pending'].map(g=>psd2DiagHerkomst(d1,g).stand),
    pendOp: psd2DiagHerkomst(d1,'pending').op,
    ander: ['transactie','saldo','pending'].map(g=>psd2DiagHerkomst(d2,g).stand) };
})()`));
    expect(r.na1).toEqual(['vers', 'vers', 'vers']);
    expect(r.na2).toEqual(['vers', 'vers', 'ouder']);
    expect(r.pendOp, 'met de dag waarop dat veld is geschreven').toBe(VANDAAG);
    expect(r.ander, 'de rekening die niet is herkoppeld blijft overal vers').toEqual(['vers', 'vers', 'vers']);
  });

  /* ONBEKEND WINT VAN OUDER EN VAN VERS. Een entry van voor deze versie draagt geen stempel, en daar mag
     geen conclusie over de herkomst op staan (v59/v73/v173). Dit geval staat vandaag op elk toestel dat
     bijwerkt, dus het is geen randgeval maar de overgangsstand. */
  test('een entry zonder stempel leest als niet vast te stellen, niet als oud en niet als vers', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const d = { op: '2026-01-01', txN: 5, txPag: 1, txFout: '', pendN: 0, pendMap: 0, pendFout: '', pendGeland: true };
      return { t: psd2DiagHerkomst(d, 'transactie').stand, p: psd2DiagHerkomst(d, 'pending').stand,
        s: psd2DiagHerkomst(d, 'saldo').stand };
    });
    expect(r.t).toBe('onbekend');
    expect(r.p).toBe('onbekend');
    expect(r.s, 'die groep heeft daar geen enkel veld, dus er valt niets te beoordelen').toBe('leeg');
  });
});

test.describe('3 - de uitlezing zegt van welke sync een veld komt', () => {
  test('blok 13 markeert de pending-kolommen van de herkoppelde rekening, en die van de andere niet', async ({ page }) => {
    await boot(page);
    await draai(page, '\n  await psd2Refresh(true);' + HERKOPPEL);
    const t = await blok13(page);
    expect(rijVan(t, ACC1)).toContain('uit een EERDERE sync');
    expect(rijVan(t, ACC2), 'die is van de laatste sync en krijgt dus geen merkteken').not.toContain('EERDERE');
  });

  test('blok 13 zegt niet meer "niet vastgelegd" na een herkoppeling', async ({ page }) => {
    await boot(page);
    await draai(page, '\n  await psd2Refresh(true);' + HERKOPPEL);
    const t = await blok13(page);
    expect(rijVan(t, ACC1)).toContain('gaf     1');
    expect(rijVan(t, ACC1), 'dat was precies de meting die verdween').not.toContain('niet vastgelegd   gelezen');
  });

  test('blok 8 noemt welke groep uit een eerdere sync komt', async ({ page }) => {
    await boot(page);
    await draai(page, '\n  await psd2Refresh(true);' + HERKOPPEL);
    const t = await blok8(page);
    const rij = t.split('\n');
    const i = rij.findIndex((l) => l.indexOf(ACC1) > -1);
    const j = rij.findIndex((l, k) => k > i && l.indexOf(ACC2) > -1);
    const stuk = rij.slice(i, j < 0 ? undefined : j).join('\n');
    expect(stuk).toContain('UIT EEN EERDERE SYNC: pending');
    expect(stuk).toContain(VANDAAG);
  });

  test('blok 8 zwijgt erover als alles van dezelfde sync komt', async ({ page }) => {
    await boot(page);
    await draai(page, '\n  await psd2Refresh(true);');
    const t = await blok8(page);
    expect(t, 'een regel die altijd staat zegt niets').not.toContain('UIT EEN EERDERE SYNC');
  });
});

test.describe('4 - wat de merge voor psd2Falend() betekent', () => {
  /* HET PAD WORDT GEMAAKT, want vanuit de gewone stand kan deze regel niet vuren: beide sync-routes
     schrijven `balGeland`. Dat is de keuze van v284 over een guard die niet bereikbaar is; wat de test
     vasthoudt is de EIGENSCHAP, namelijk dat de functie niets beweert over een sync die het veld niet
     heeft gemeten. */
  test('een route die het saldo niet meet laat een oude mislukking staan, en die telt niet meer mee', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      psd2DiagZet(a, { txN: 1, txPag: 1, txFout: '', balUit: null, balGeland: false, balFout: 'stuk' });
      const voor = psd2Falend().map((f) => f.acc);
      psd2DiagZet(a, { pendN: 0, pendMap: 0, pendFout: '', pendGeland: true });
      return { voor, na: psd2Falend().map((f) => f.acc),
        staatErNog: SET.psd2Diag[a].balGeland === false,
        vers: psd2DiagVers(SET.psd2Diag[a], 'balGeland') };
    }, ACC1);
    expect(r.voor, 'de mislukking wordt wel gemeld zolang hij van de laatste sync is').toContain(ACC1);
    expect(r.staatErNog, 'het veld blijft staan, want dat is wat mergen doet').toBe(true);
    expect(r.vers).toBe(false);
    expect(r.na, 'maar de bewering gaat over de LAATSTE sync, en die mat het saldo niet').not.toContain(ACC1);
  });

  /* NIET VAST TE STELLEN TELT ALS VERS, want dat is wat het veld voor v298 betekende. Een mislukking
     wegfilteren op twijfel zou een stilstaand saldo verbergen, en te hoog is de gevaarlijke kant (v168). */
  test('een entry van voor v298 met een mislukking wordt gewoon gemeld', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      SET.psd2Diag = { [a]: { op: '2026-01-01', balGeland: false, balFout: 'stuk' } };
      return psd2Falend().map((f) => f.acc);
    }, ACC1);
    expect(r).toContain(ACC1);
  });
});

test.describe('5 - de bron', () => {
  test('psd2Diag heeft nog steeds een schrijver, en de groepen staan op een plek', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect((src.match(/SET\.psd2Diag\s*=/g) || []).length, 'alleen de helper zet hem').toBe(1);
    expect((src.match(/PSD2DIAG_GROEPEN\s*=/g) || []).length, 'een definitie').toBe(1);
    const zet = sectieVan(src, 'function psd2DiagZet(accId, rec){');
    expect(zet, 'de entry wordt gemergd en niet vervangen').toContain('Object.assign({}, oud');
    expect(zet).toContain('_veldOp');
  });

  test('de herkomst wordt op een plek afgeleid en door de twee blokken gelezen', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect((src.match(/function psd2DiagHerkomst\(/g) || []).length).toBe(1);
    expect(sectieVan(src, 'function diagRekeningen(){')).toContain('psd2DiagHerkomst(');
    expect(sectieVan(src, 'function diagPendBots(){')).toContain('psd2DiagHerkomst(');
  });
});
