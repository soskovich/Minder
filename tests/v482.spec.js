/* v482: POTJES PER SALARISPERIODE MET RITME, CONTANT OP ÉÉN MANIER, EN DE SPAARGELDKEUZE DIE ECHT TELT.
   De pot-daling van uitDagDelen volgt het ritme uit het venster (vaak/soms/zelden). Nog verwacht = verwachting voor de
   periode × aandeel − wat er deze periode al van die rekening in dat potje ging (min 0). Voor de dagen NA de lopende maand
   het typische niveau (de mediaan van de afgeronde maanden), niet de verwachting van deze maand. Zelden telt niet in de
   daling (wel als "kan komen"-regel). Een uitgave uit een reservering telt niet ook als potje. Contant: de krap-berekening
   en het voorstel lezen dezelfde regel (potje Contant − portemonnee, min 0). De spaargeldkeuze komt uit Kiezen (grens), niet
   uit SET.salGeenSpaar. GECONSTRUEERD op v432-stand (16 okt 2026), met een Akkoord in september zodat de krap-pop-up vuurt. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF } = S;
const AKK = { salVerdeling: { op: '2026-09-24', ym: '2026-09', salYM: '2026-09', rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3166, plan: 280, salaris: 5216, salAcc: MAIN, start: '2026-09-24', eind: '2026-10-25', dagen: 32 } };

/* voegt op LEEF gecontroleerde potjes toe bovenop de boodschappen/uiteten/overig die v432-stand al draagt:
   - zorg (soms, gebruikelijke dag 22, deze periode VOL besteed → nog verwacht 0)        → test a
   - belasting (soms, dag 8, typisch €28 in jul/aug/sep, een UITSCHIETER €146 in oktober)  → test d
     plus een CJIB-boete uit een reservering op 10 sep (telt niet als potje)              → test e */
async function boot(page, extra) {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { set: AKK });
  await page.evaluate(({ LEEF, extra }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v482' + acc.slice(-4) + d + n + Math.abs(a), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    for (const m of ['2026-07', '2026-08', '2026-09']) {
      add(LEEF, m + '-22', -40, 'Tandarts', 'BEA, BETAALPAS TANDARTS', 'zorg');          // zorg: soms, dag 22
      add(LEEF, m + '-08', -28, 'Gemeente', 'BEA, BETAALPAS GEMEENTE', 'belasting');     // belasting: soms, dag 8, typisch 28
    }
    add(LEEF, '2026-10-03', -600, 'Tandarts', 'BEA, BETAALPAS TANDARTS', 'zorg');         // zorg deze periode VOL besteed
    add(LEEF, '2026-10-08', -146, 'Gemeente', 'BEA, BETAALPAS GEMEENTE', 'belasting');    // uitschieter oktober
    add(LEEF, '2026-08-14', -90, 'Zwemles', 'BEA, BETAALPAS ZWEMLES', 'sport');           // sport: één venstermaand (aug) → zelden, gem €90
    add(LEEF, '2026-10-05', -30, 'Zwemles', 'BEA, BETAALPAS ZWEMLES', 'sport');           // een voorkomen deze maand, zodat sport een variabel potje is (in maandVooruit)
    /* een boete die uit de reservering "Boetes" is betaald: hij telt als reserveringsbetaling, niet als potje (punt 4) */
    const boete = add(LEEF, '2026-09-10', -65, 'CJIB', 'SEPA INCASSO CJIB BOETES', 'belasting');
    SET.uitReservering = Object.assign({}, SET.uitReservering, { [boete.id]: 65 });
    SET.budgets = Object.assign({}, SET.budgets, { zorg: 60, belasting: 40, sport: 50 });
    Object.assign(SET, extra || {});
    save(); try { buildAccMeta(); } catch (_) {}
  }, { LEEF, extra });
}
const leef = (page, acc) => page.evaluate(acc => { const P = rekVoorstel(); const r = (P.rekAlle || []).find(x => x.acc === acc); if (!r) return null;
  const pd = {}; for (const p of r.potDelen || []) pd[p.k] = { ritme: p.ritme, ud: p.ud, n: p.n, maand: Math.round(p.maand), typisch: Math.round(p.typisch), al: p.alPeriode, nog: Math.round(p.nogVerwacht) };
  return { pd, zelden: (r.potZelden || []).map(z => z.k), potS: Math.round(r.potS), kasS: Math.round(r.kasS) }; }, acc);

test('a. een potje dat deze periode al vol besteed is: nog verwacht € 0 (per rekening)', async ({ page }) => {
  await boot(page);
  const d = await leef(page, LEEF);
  expect(d.pd.zorg).toBeTruthy();
  expect(d.pd.zorg.ritme).toBe('soms');
  expect(d.pd.zorg.maand).toBeGreaterThan(0);                     // de lopende maand verwacht wel iets
  expect(d.pd.zorg.al).toBeGreaterThan(0);                        // deze periode is er al van deze rekening uit dit potje gegaan
  expect(d.pd.zorg.nog).toBe(0);                                   // al besteed ≥ de periodeverwachting (sabotage: nogVerwacht = periodExp zonder alPeriode → > 0)
});

test('b. een "soms"-potje waarvan de gebruikelijke dag voorbij is, staat niet meer in de daling; een toekomstige dag wel', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(acc => {
    const P = rekVoorstel(), rr = P.rekAlle.find(x => x.acc === acc), SP = salPeriode(), vandaag = vandaagYMD();
    let walked = 0; for (let d = rekDag(vandaag, 1); d <= SP.cur.eind; d = rekDag(d, 1)) walked += rr.uitDagDelen(d).pot;
    /* reconstructie: vaak gelijk verdeeld (nog), soms alleen als de gebruikelijke dag NOG in de periode valt (> vandaag) */
    const dd = s => +String(s).slice(8, 10), dimNa = (() => { let n = 0; for (let d = rekDag(vandaag, 1); d <= SP.cur.eind; d = rekDag(d, 1)) if (d.slice(0, 7) === thisYM()) n++; return n; })();
    let recon = 0; const soms = {};
    for (const p of rr.potDelen) { if (p.ritme === 'zelden') continue;
      if (p.ritme === 'vaak') recon += p.nogVerwacht;
      else { const toekomst = p.ud != null && [...Array(32).keys()].some(i => { const d = rekDag(vandaag, i + 1); return d <= SP.cur.eind && d.slice(0, 7) === thisYM() && dd(d) === p.ud; }); soms[p.k] = toekomst; if (toekomst) recon += p.nogVerwacht; } }
    return { walked: Math.round(walked), recon: Math.round(recon), uiteten: soms.uiteten, overig: soms.overig };
  }, LEEF);
  expect(r.uiteten).toBe(false);          // uiteten: gebruikelijke dag (12) ligt vóór vandaag (16) → niet geplaatst
  expect(r.overig).toBe(true);            // overig: gebruikelijke dag (21) ligt ná vandaag → wel geplaatst
  expect(r.walked).toBe(r.recon);         // de daling plaatst soms alleen op een toekomstige gebruikelijke dag (sabotage: dd>=ud → walked > recon)
});

test('c. een "zelden"-potje telt niet in de daling en staat als "kan komen" apart', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(acc => {
    const P = rekVoorstel(), rr = P.rekAlle.find(x => x.acc === acc), SP = salPeriode(), vandaag = vandaagYMD();
    const z = (rr.potDelen || []).find(p => p.k === 'sport');
    /* de pot-daling over de hele periode mag sport niet dragen: vergelijk met de som van de niet-zelden potjes */
    let daling = 0; for (let d = rekDag(vandaag, 1); d <= SP.cur.eind; d = rekDag(d, 1)) daling += rr.uitDagDelen(d).pot;
    const nietZelden = (rr.potDelen || []).filter(p => p.ritme !== 'zelden');
    const dag = s => +String(s).slice(8, 10), dimNa = (() => { let n = 0; for (let d = rekDag(vandaag, 1); d <= SP.cur.eind; d = rekDag(d, 1)) if (d.slice(0, 7) === thisYM()) n++; return n; })();
    let recon = 0; for (const p of nietZelden) { if (p.ritme === 'vaak') recon += p.nogVerwacht;
      else { const toekomst = p.ud != null && [...Array(32).keys()].some(i => { const d = rekDag(vandaag, i + 1); return d <= SP.cur.eind && d.slice(0, 7) === thisYM() && dag(d) === p.ud; }); if (toekomst) recon += p.nogVerwacht; } }
    return z ? { ritme: z.ritme, gem: Math.round(z.gem), inZelden: (rr.potZelden || []).some(x => x.k === 'sport'), daling: Math.round(daling), recon: Math.round(recon) } : null;
  }, LEEF);
  expect(r).toBeTruthy();                 // sport kwam in één venstermaand voor
  expect(r.ritme).toBe('zelden');         // 1 van 3 venstermaanden → zelden (sabotage: ritmeVan zonder de zelden-tak → soms)
  expect(r.gem).toBeGreaterThan(0);       // gemiddeld bedrag per voorkomen (€90)
  expect(r.inZelden).toBe(true);          // staat in de "kan komen"-lijst, niet in de daling
  expect(r.daling).toBe(r.recon);         // de daling draagt alleen de niet-zelden potjes (sabotage: sport telt in de daling → daling > recon)
});

test('d. een uitschieter in de lopende maand werkt niet door in de volgende maand (typisch niveau)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(acc => {
    const P = rekVoorstel(), rr = P.rekAlle.find(x => x.acc === acc), b = (rr.potDelen || []).find(p => p.k === 'belasting');
    /* belasting staat op dag 8; de bump op 8 november isoleert de soms-plaatsing van november (typisch), los van de vaak-spreiding */
    const nov8 = rr.uitDagDelen('2026-11-08').pot, nov7 = rr.uitDagDelen('2026-11-07').pot;
    return { maand: Math.round(b.maand), typisch: Math.round(b.typisch), ud: b.ud, bump: Math.round(nov8 - nov7) };
  }, LEEF);
  expect(r.ud).toBe(8);
  expect(r.maand).toBeGreaterThan(120);   // de lopende maand verwacht ~€146 (de uitschieter)
  expect(r.typisch).toBeLessThan(60);     // het typische niveau is ~€28
  expect(r.bump).toBe(r.typisch);         // november gebruikt het typische niveau (sabotage: somsPost = nogVerwacht/maand → bump ~146)
});

test('e. een uitgave uit een reservering telt niet ook als potje-voorkomen', async ({ page }) => {
  await boot(page);
  const d = await leef(page, LEEF);
  expect(d.pd.belasting).toBeTruthy();
  expect(d.pd.belasting.n).toBe(3);       // drie echte belasting-boekingen (jul/aug/sep); de CJIB-boete uit de reservering telt niet (sabotage: v>0.005-guard weg → 4)
});

test('f. contant: de krap-berekening en het voorstel lezen dezelfde regel (potje − portemonnee)', async ({ page }) => {
  const CC = '__cc__';
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { set: AKK });
  const r = await page.evaluate(acc => {
    const CONT = CONTANT_CAT;
    SET.budgets = Object.assign({}, SET.budgets, { [CONT]: 300 });
    /* een opname deze maand op deze rekening, zodat "contant na je salaris" (kasNaSal) niet geldt en de kas-daling de
       gewone regel volgt (kasRestNu), niet 0 */
    const opn = { id: 'v482opn' + acc.slice(-4), date: '2026-10-05', amount: -50, acc, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT 05.10.26/12:00', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(opn); TX.push(opn);
    /* de portemonnee-stand van moment 2 (het begin van de lopende periode, SP.cur.start zolang we midden in de periode zitten),
       zo hoog dat potje Contant − portemonnee ≈ 0 */
    const SP = salPeriode();
    SET.kasMoment = Object.assign({}, SET.kasMoment, { [SP.cur.start]: { keuze: 'stand', stand: 400, op: '2026-10-01' } });
    save(); try { buildAccMeta(); } catch (_) {}
    const P = rekVoorstel(), rr = P.rekAlle.find(x => x.acc === acc), vandaag = vandaagYMD();
    let walked = 0; for (let d = rekDag(vandaag, 1); d <= SP.cur.eind; d = rekDag(d, 1)) walked += rr.uitDagDelen(d).kas;
    return { kasP: Math.round(P.kasP), kasBud: Math.round(P.kasBud), kasStand: Math.round(P.kasStand || 0), voorstel: Math.round(rr.kasS), krap: Math.round(walked), kasMaand: Math.round(rr.kasMaand) };
  }, LEEF);
  expect(r.kasStand).toBeGreaterThan(0);       // er is een portemonnee-stand
  expect(r.kasP).toBeLessThan(r.kasBud);       // potje Contant − portemonnee ligt onder het hele budget
  expect(r.krap).toBe(r.voorstel);             // krap (daling) == voorstel: dezelfde regel (sabotage: kasRestNu = kM → krap == kasMaand-aandeel, groter)
});

test('g. "Niets meer uit je spaargeld" komt uit de keuze grens in Kiezen, niet uit een instelling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { set: Object.assign({ manualBal: { [MAIN]: 5000, [LEEF]: 1 } }, AKK) });
  /* de pop-up stelt eerst wél spaargeld voor (geen keuze gemaakt) */
  await page.evaluate(() => { go('maand'); renderMaand(); try { closeSheet(); } catch (_) {} openKrapPopup(); });
  await expect(page.locator(`#salTekort [data-saltekortrij="${LEEF}"]`)).toContainText('spaargeld');
  /* de keuze maken via Kiezen: bevestig het patroon en kies 'grens' via de echte knoppen (de test zet geen instelling zelf) */
  const gekozen = await page.evaluate(() => {
    try { closeSheet(); } catch (_) {}
    const p = gripPatronen().find(x => x.id === 'spaargeld'); if (!p) return 'geen patroon';
    /* het patroon bevestigen via de echte vraag "Wat past het best?": de gebruiker kiest een oorzaak in zijn gedrag
       (salaris-effect) en klikt Bevestigen (oorzaakBevestig). Dat zet het oordeel op klopt en vult gedragBev. */
    const sym = (gripCyc().sym || []).find(x => x.pid === 'spaargeld'); if (!sym) return 'geen symptoom';
    window._oorzaakKeuze = window._oorzaakKeuze || {}; window._oorzaakKeuze[sym.id] = 'salaris';
    oorzaakBevestig(sym.id);
    if (!gripPatroonBevestigd('spaargeld')) return 'niet bevestigd';
    openGripKeuze('spaargeld');
    return document.querySelector('#sheet [data-gripoptie="grens"]') ? 'ok' : 'geen grens-optie';
  });
  expect(gekozen).toBe('ok');
  await page.locator('#sheet [data-gripoptie="grens"]').click();
  const latOk = page.locator('#sheet [data-latok]'); if (await latOk.count()) await latOk.click();
  await page.locator('#sheet [data-keuzebevestig]').click();
  /* nu leest salGeenSpaarGekozen de keuze; de pop-up noemt geen spaargeld meer */
  expect(await page.evaluate(() => salGeenSpaarGekozen())).toBe(true);
  await page.evaluate(() => { try { closeSheet(); } catch (_) {} openKrapPopup(); });
  await expect(page.locator(`#salTekort [data-saltekortrij="${LEEF}"]`)).not.toContainText('spaargeld');
});
