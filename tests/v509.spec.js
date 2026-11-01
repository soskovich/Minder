/* v509: ONDERHOUDSRONDE — periode-rest en kleine fouten. Op periode-stand (v504-stand: salaris EUR 5.216 op de 24e, verdeling
 * 150/1600/1700, opzij 1766, contant 400; periode 24 nov – 23 dec). GECONSTRUEERD, niet gemeten: de bedragen van het toestel staan
 * alleen daar. Verwachte waarden worden in de pagina uit de app zelf gerekend (geen hardcoding).
 *  a. de aankoopcheck/opbouw rekenen in de periode: de dag-noemer is de periode-dagen (tot 23 dec), en "nog in je potjes" is de periode.
 *  b. de sheet "Nog in potjes" leest hetzelfde periode-venster als de kop; de rijen tellen op tot het kopgetal, in centen.
 *  c. een lek van 25 nov telt op 1 dec nog mee (zelfde periode).
 *  d. een verwachte vaste last (DUO) krijgt geen reserveringsvoorstel "komt terug · reservering?".
 *  e. de verwachte salarisdatum is de 24e (in het weekend de maandag erna), en het Kiezen-moment = de periodestart.
 *  f. rente, kastelling-naam, de "saldo na"-kolom, en alle lopende inleg (klein).
 */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const { MAIN, SPAAR, LEEF, BET } = S;

/* item 1: de aankoopcheck en de opbouw-sheet rekenen in de periode (saldo-basis, periode-venster). */
test('v509 a: de dag-noemer en "nog in je potjes" lezen de periode, niet de kalendermaand', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(() => {
    const W = huidigVenster();
    const E = daysElapsed(thisYM());
    const calDagen = Math.max(E.dim - E.elapsed, 1);
    const V = maandVooruit();
    const periodeNog = (V.potjes || []).reduce((a, x) => a + Math.max(Math.round(x.bud) - Math.round(x.uit), 0), 0);
    const calReserve = varPotjesReserve(thisYM(), monthLiquidity());
    return { periode: W.periode, over: W.over, eind: W.eind, calDagen,
      dagbedragNoemer: vrijPerDag().dagenResterend, reserved: safeToSpend().reserved, periodeNog, calReserve };
  });
  expect(r.periode).toBe(true);
  expect(r.eind).toBe('2026-12-23');                 // de periode loopt tot 23 dec
  expect(r.dagbedragNoemer).toBe(r.over);            // het dagbedrag deelt door de periode-dagen (tot 23 dec)
  expect(r.dagbedragNoemer).not.toBe(r.calDagen);    // en niet door de kalendermaand (op 26 nov: 4)
  expect(r.reserved).toBe(r.periodeNog);             // "nog in je potjes" = de periode, gelijk aan Grip/de sheet
  expect(r.periodeNog).not.toBe(r.calReserve);       // het periode-venster verschilt van de kalendermaand (anders meet de test niets)
});

/* item 2: de sheet "Nog in potjes" leest het periode-venster van de kop; de rijen tellen op tot het kopgetal. */
for (const dag of ['2026-11-26', '2026-12-01']) {
  test(`v509 b: "Nog in potjes" is de periode en de rijen tellen op tot de kop (${dag})`, async ({ page }) => {
    await S.boot(page, dag);
    const r = await page.evaluate(() => {
      const V = maandVooruit();
      const periodeNog = (V.potjes || []).reduce((a, x) => a + Math.max(Math.round(x.bud) - Math.round(x.uit), 0), 0);
      openInsTegel('potjes');
      const sheet = document.getElementById('insTegelSheet');
      const kop = +sheet.dataset.inswaarde;
      const rijen = [...sheet.querySelectorAll('[data-insrij]')].map(e => +e.dataset.insrij);
      const som = rijen.reduce((a, v) => a + v, 0);
      return { periodeLabel: sheet.dataset.insperiode || '', kop, som, periodeNog, calNogPot: insMaandStand().nogPot };
    });
    expect(r.periodeLabel).not.toBe('');     // de sheet toont de periode, niet "november"
    expect(r.som).toBe(r.kop);               // de rijen tellen op tot de kop (in centen: euro0 van hele euro's)
    expect(r.kop).toBe(r.periodeNog);        // de kop is het periode-"nog in potjes"
    expect(r.periodeNog).not.toBe(r.calNogPot);  // periode ≠ kalendermaand (anders meet de test niets)
  });
}

/* item 3: coachLeak leest in de era de lopende periode, niet de kalendermaand. */
test('v509 c: een lek van 25 nov telt op 1 dec nog mee (zelfde periode)', async ({ page }) => {
  await S.boot(page, '2026-12-01');
  const r = await page.evaluate(({ LEEF }) => {
    const t = { id: 'v509lek', date: '2026-11-25', amount: -200, acc: LEEF, name: 'Tandarts Kliniek', desc: 'iDEAL Tandarts Kliniek 2026-11-25', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'zorg'; save(); try { runMemoVergeten(); } catch (_) {}   // zorg heeft geen potje in deze stand
    const L = coachLeak();                 // geen argument → de era-periode
    return { lek: !!L, amount: L ? L.amount : 0, cat: L ? L.cat : '', maand: thisYM() };
  }, { LEEF });
  expect(r.maand).toBe('2026-12');          // de kalendermaand is december
  expect(r.lek).toBe(true);                 // toch vindt coachLeak het lek van 25 nov (zelfde periode)
  expect(r.amount).toBeGreaterThanOrEqual(200);
  expect(r.cat).toBe('zorg');
});

/* item 4: een (verwachte) vaste last krijgt geen reserveringsvoorstel. */
test('v509 d: een verwachte vaste last (DUO) krijgt geen "komt terug · reservering?"-voorstel', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(({ MAIN }) => {
    const duo = { id: 'v509duo', date: '2026-06-25', amount: -400, acc: MAIN, name: 'Duo Hoofdrekening', desc: 'SEPA Incasso DUO Hoofdrekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    const gift = { id: 'v509gift', date: '2026-10-05', amount: -120, acc: MAIN, name: 'Cadeauwinkel Bloom', desc: 'BEA Cadeauwinkel Bloom', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(duo); categorize(gift); TX.push(duo, gift);
    // beide zijn een benoemde uitgave die terugkomt, zonder reservering
    SET.kennis = SET.kennis || {};
    SET.kennis['benoem|duo'] = { soort: 'benoem', aard: 'terug', partij: 'Duo Hoofdrekening', label: 'Studieschuld', tx: { [duo.id]: { label: 'Studieschuld', aard: 'terug' } } };
    SET.kennis['benoem|gift'] = { soort: 'benoem', aard: 'terug', partij: 'Cadeauwinkel Bloom', label: 'Cadeau', tx: { [gift.id]: { label: 'Cadeau', aard: 'terug' } } };
    // DUO is naar vaste lasten verplaatst: een verwachte vaste last met de recurKey gekoppeld
    SET.vastVerwacht = [{ id: 'vvduo', naam: 'Studieschuld', bedrag: 400, ritme: 12, eerste: '2026-06-25', cat: 'overig', acc: MAIN, koppel: { key: recurKey(duo), datum: '2026-06-25', bedrag: 400 } }];
    save(); try { runMemoVergeten(); } catch (_) {}
    const v = benoemTerugVoorstellen();
    return { partijen: v.map(x => x.partij), duo: v.some(x => /duo/i.test(x.partij)), gift: v.some(x => /cadeau/i.test(x.partij)) };
  }, { MAIN });
  expect(r.gift).toBe(true);    // het mechanisme werkt: een gewone terugkerende uitgave krijgt wel een voorstel
  expect(r.duo).toBe(false);    // maar DUO niet, want het is al een (verwachte) vaste last
});

/* item 5: één salarisdatum. */
test('v509 e: de verwachte salarisdatum is de 24e (weekend → maandag), en het Kiezen-moment = de periodestart', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(() => {
    const vd = ym => salarisVerwacht(ym).datum;
    return { okt: vd('2026-10'), nov: vd('2026-11'), dec: vd('2026-12'),
      moment: gripMomentDatum().d, periodestart: periodeVan(vandaagYMD()).start };
  });
  expect(r.okt).toBe('2026-10-26');   // 24 okt (za) → ma 26 okt
  expect(r.nov).toBe('2026-11-24');   // di, geen verschuiving
  expect(r.dec).toBe('2026-12-24');   // do, geen verschuiving
  expect(r.moment).toBe(r.periodestart);
  expect(r.moment).toBe('2026-11-24');   // en dat is de periodestart, niet de vorige werkelijke salarisdag
});

/* item 6 (klein): rente. */
test('v509 f1: een bijschrijving met rente wordt categorie Rente (inkomen) met een leesbare naam; een eigen keuze wint', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(({ MAIN }) => {
    const t = { id: 'v509rente', date: '2026-11-01', amount: 0.92, acc: MAIN, name: 'Transactie', desc: 'RENTEVERGOEDING OVER TEGOED', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); applyOwnAccounts();
    const auto = catOf(t), naam = txNaam(t), type = (CATS.rente || {}).type;
    OVR[t.id] = 'inkomen'; applyOwnAccounts();
    const metKeuze = catOf(t);
    return { auto, naam, type, metKeuze };
  }, { MAIN });
  expect(r.type).toBe('income');
  expect(r.auto).toBe('rente');
  expect(r.naam).not.toBe('Transactie');   // een leesbare naam
  expect(r.metKeuze).toBe('inkomen');       // een eigen keuze van de gebruiker wint
});

/* item 6 (klein): de kastelling-boeking heet naar wat de telling zegt. */
test('v509 f2: een kastelling heet "nog in je zak" bij plus en "uitgegeven" bij min, niet "Contant besteed"', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(({ LEEF }) => {
    const opn = { id: 'v509opn', date: '2026-11-20', amount: -200, acc: LEEF, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM 2026-11-20', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(opn); TX.push(opn); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    contantTellen(); const el = document.querySelector('#contInput'); el.value = '200'; contantOpslaan();   // je hebt de hele opname nog: plus
    const b = TX.find(t => String(t.bankRef || '').indexOf('contant|') === 0);
    return b ? { name: b.name, amount: b.amount } : { name: '(geen boeking)', amount: 0 };
  }, { LEEF });
  expect(r.name).not.toBe('Contant besteed');
  expect(r.name).toBe(r.amount > 0 ? 'Kastelling · nog in je zak' : 'Kastelling · uitgegeven');
});

/* item 6 (klein): de "saldo na"-kolom in "Tot je volgende salaris" draagt een leesbaar label. */
test('v509 f3: "Tot je volgende salaris" labelt de saldo-na-kolom met "incl. potjes tot die dag"', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(() => {
    let acc = null; for (const a of rekBetaal()) { const D = totSalarisData(a); if (D && D.vastRij && D.vastRij.length) { acc = a; break; } }
    if (!acc) return { acc: null, txt: '', kol: false };
    openTotSalaris(acc);
    const txt = document.getElementById('totSalaris').innerText;
    return { acc, txt, kol: !!document.querySelector('[data-totvastkol]') };
  });
  expect(r.acc).not.toBe(null);
  expect(r.kol).toBe(true);
  expect(r.txt).toContain('incl. potjes tot die dag');
});

/* item 6 (klein): de beleggen-sheet toont alle lopende inleg, niet alleen de eerste. */
test('v509 f4: de beleggen-sheet toont alle lopende inleg (Saxo + Peaks Kayani + Peaks pensioen), niet alleen de eerste', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(() => {
    SET.assets = [
      { id: 'a_saxo', naam: 'Saxo', waarde: 1000, grow: true, per: 100 },
      { id: 'a_kayani', naam: 'Peaks Kayani', waarde: 800, grow: true, per: 100 },
      { id: 'a_pensioen', naam: 'Peaks pensioen', waarde: 5000, grow: true, per: 200 },
    ];
    save(); try { runMemoVergeten(); } catch (_) {}
    const M = gripMeterBeleggen();
    openGripMeter('beleggen');
    const rows = [...document.querySelectorAll('#gripMeterSheet [data-meterinleg]')];
    const som = document.querySelector('#gripMeterSheet [data-meterinlegsom]');
    return { lijstN: (M.inlegLijst || []).length, rows: rows.length, tekst: rows.map(e => e.innerText).join(' | '), heeftSom: !!som };
  });
  expect(r.lijstN).toBe(3);
  expect(r.rows).toBe(3);                 // alle drie de inleg-rijen, niet alleen de eerste
  expect(r.tekst).toMatch(/Saxo/);
  expect(r.tekst).toMatch(/Peaks pensioen/);
  expect(r.heeftSom).toBe(true);
});
