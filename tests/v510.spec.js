/* v510: onderhoudsronde voor de generale repetitie van 24 nov. Op periode-stand (salaris EUR 5.216 op de 24e van MAIN). GECONSTRUEERD,
   naar de vorm van het toestel; de echte bedragen staan alleen daar.
   a. inleg: Saxo EUR 100 en Peaks Kayani EUR 100 gemeten in oktober, Peaks pensioen EUR 200 gepland; sheet en tegel lezen dezelfde som.
   b. ingevuld EUR 50 tegen gemeten EUR 100 is een vraag; de eerste afschrijving van een geplande inleg ook. Niets verandert voor Ja.
   c. elke "gedekt t/m" draagt een jaartal; de laagste stand is het minimum van de reeks van dekking().
   d. op 24 nov tonen de afsluitkaart van november (1–23) en Inzichten november dezelfde vijf getallen, over 1 t/m 23 nov.
   e. de voorbeeldweergave stort wat het voorstel opzij zet, niet de verdeling.
   f. per potje in "Tot je volgende salaris" een bedrag; de rijen tellen op tot de regel "Potjes via deze rekening".
*/
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const { MAIN, LEEF, SPAAR } = S;

/* drie beleggingen; Saxo en Kayani met een gekoppelde inleg van EUR 100 in oktober (de laatste volle maand op 26 nov) */
async function beleggingen(page, per) {
  await page.evaluate(({ MAIN, per }) => {
    SET.assets = [
      { id: 'a_saxo', naam: 'Saxo', waarde: 1000, grow: true, per: per.saxo, voorwaarden: false },
      { id: 'a_kayani', naam: 'Peaks Kayani', waarde: 800, grow: true, per: per.kayani, voorwaarden: false },
      { id: 'a_pensioen', naam: 'Peaks pensioen', waarde: 0, grow: true, per: per.pensioen, voorwaarden: false },
    ];
    SET.bezitKoppel = {};
    for (const [id, naam, d] of [['a_saxo', 'Saxo Bank', '2026-10-05'], ['a_kayani', 'Stichting Peaks Kayani', '2026-10-06']]) {
      const t = { id: 'v510' + id, date: d, amount: -100, acc: MAIN, name: naam, desc: 'SEPA Incasso ' + naam, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'sparen'; SET.bezitKoppel[t.id] = id; }
    TX.sort((x, y) => x.date.localeCompare(y.date));
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._rekV = null;
  }, { MAIN, per });
}

test('v510 a: lopend gemeten EUR 200, pensioen EUR 200 gepland; tegel en sheet dezelfde som', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await beleggingen(page, { saxo: 100, kayani: 100, pensioen: 200 });
  const r = await page.evaluate(() => {
    const M = gripMeterBeleggen();
    const div = document.createElement('div'); div.innerHTML = gripMeters();
    const tegel = div.querySelector('[data-meterinlegtegel]');
    openGripMeter('beleggen');
    const rows = [...document.querySelectorAll('#gripMeterSheet [data-meterinleg]')].map(e => ({ soort: e.getAttribute('data-soort'), cent: +e.getAttribute('data-cent'), t: e.innerText.replace(/\s+/g, ' ') }));
    const som = document.querySelector('#gripMeterSheet [data-meterinlegsom]');
    return { lijst: M.inlegLijst.map(i => [i.naam, i.soort, i.cent]), tegelCent: tegel && +tegel.getAttribute('data-meterinlegtegel'), tegelGepland: tegel && +tegel.getAttribute('data-meterinleggepland'),
      tegelTekst: tegel && tegel.innerText.replace(/\s+/g, ' '), rows, somCent: som && +som.getAttribute('data-meterinlegsom'), somTekst: som && som.innerText };
  });
  expect(r.lijst).toEqual([['Saxo', 'lopend', 10000], ['Peaks Kayani', 'lopend', 10000], ['Peaks pensioen', 'gepland', 20000]]);
  expect(r.somCent).toBe(20000);                       // lopende inleg samen: alleen lopend
  expect(r.tegelCent).toBe(r.somCent);                 // tegel = sheet, in centen
  expect(r.tegelGepland).toBe(20000);
  expect(r.tegelTekst).toBe('€200/mnd + €200 gepland');
  expect(r.rows.find(x => x.soort === 'gepland').t).toContain('€200 gepland · nog niet gestart');
  expect(r.rows.filter(x => x.soort === 'lopend').every(x => /€100 · gemeten in okt/.test(x.t))).toBe(true);
});

test('v510 b: ingevuld EUR 50 tegen gemeten EUR 100 is een vraag, niets verandert voor Ja', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await beleggingen(page, { saxo: 50, kayani: 50, pensioen: 200 });
  const r = await page.evaluate(() => {
    const Q = gegevensVragen().filter(q => q.soort === 'inlegafwijk');
    const voor = SET.assets.map(a => a.per);
    openGegevensVragen('alle');
    const rij = document.querySelector('[data-gegevensvraag="inlegafwijk"][data-asset="a_saxo"]');
    const knoppen = rij ? [...rij.querySelectorAll('button')].map(b => b.className) : [];
    return { n: Q.length, voor, tekst: rij && rij.innerText.replace(/\s+/g, ' '), knoppen };
  });
  expect(r.n).toBe(2);
  expect(r.voor).toEqual([50, 50, 200]);               // nog niets veranderd
  expect(r.tekst).toContain('Saxo: je vulde €50 in, in oktober ging er €100 heen. Aanpassen naar €100?');
  expect(r.knoppen).toEqual(['btn sec', 'btn sec']);    // niets voorgeselecteerd
  await page.click('[data-gegevensvraag="inlegafwijk"][data-asset="a_saxo"] [data-inlegafwijk="ja"]');
  const na = await page.evaluate(() => ({ per: SET.assets.map(a => a.per), n: gegevensVragen().filter(q => q.soort === 'inlegafwijk').length }));
  expect(na.per).toEqual([100, 50, 200]);
  expect(na.n).toBe(1);
  await page.evaluate(() => inlegAfwijkZet('a_kayani', gegevensVragen().find(q => q.soort === 'inlegafwijk').qkey.slice('inlegafwijk|'.length), false));
  const nee = await page.evaluate(() => ({ per: SET.assets.map(a => a.per), n: gegevensVragen().filter(q => q.soort === 'inlegafwijk').length }));
  expect(nee.per).toEqual([100, 50, 200]);             // Nee laat het staan en vraagt het niet opnieuw
  expect(nee.n).toBe(0);
});

test('v510 b2: de eerste afschrijving van een geplande inleg is een vraag; pas na Ja is hij lopend', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await beleggingen(page, { saxo: 100, kayani: 100, pensioen: 200 });
  const r = await page.evaluate(({ MAIN }) => {
    const t = { id: 'v510pens', date: '2026-11-03', amount: -200, acc: MAIN, name: 'Stichting Peaks Pensioen', desc: 'SEPA Incasso Peaks pensioen', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'sparen'; save(); try { runMemoVergeten(); } catch (_) {}
    const q = gegevensVragen().find(x => x.soort === 'inlegstart');
    const voor = inlegStand(SET.assets[2]).soort;
    if (q) inlegStartZet('a_pensioen', q.t.id, true);
    return { q: q && [q.asset.id, q.t.id], tid: t.id, voor, na: inlegStand(SET.assets[2]), koppel: SET.bezitKoppel[t.id] };
  }, { MAIN });
  expect(r.q).toEqual(['a_pensioen', r.tid]);
  expect(r.voor).toBe('gepland');
  expect(r.na.soort).toBe('lopend');
  expect(r.na.cent).toBe(20000);
  expect(r.koppel).toBe('a_pensioen');
});

test('v510 c: "gedekt t/m" draagt een jaartal; de laagste stand is het minimum van de reeks van dekking()', async ({ page }) => {
  await S.boot(page, '2026-11-02');
  const r = await page.evaluate(({ SPAAR }) => {
    SET.resAcc = SPAAR; SET.manualBal = Object.assign({}, SET.manualBal, { [SPAAR]: 1000 });
    SET.reserveringen = [{ id: 'dela', naam: 'Dela', bedrag: 160, vervalmaand: '2026-12', intervalM: 3, cat: '' },
      { id: 'laser', naam: 'Laserbehandeling', bedrag: 159, vervalmaand: '2027-04', intervalM: 6, cat: '' }];
    SET.salVerdeling = Object.assign({}, SET.salVerdeling || {}, { reserveringen: 14 });
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    const D = dekking(12), R = maandRegels().find(x => x.key === 'dekking');
    const min = D.reeks.reduce((m, x) => Math.min(m, x.stand), Infinity);
    return { stand: D.werkelijkeStand, gat: D.gat, gedektTot: D.gedektTot, tegelMaat: R && R.tegelMaat, gevolg: R && R.gevolg, tekst: dekkingTekst(D), min, laagste: D.laagste, lab: resMaandLabel(D.laagste.maand) };
  }, { SPAAR });
  expect(r.stand).toBe(1000);
  expect(r.gat).toBeNull();
  expect(r.tegelMaat).toMatch(/^gedekt t\/m [a-z]{3} \d{4}$/);        // het jaartal staat erbij
  expect(r.tegelMaat).toBe('gedekt t/m okt 2027');
  expect(r.tekst).toContain('Je bent gedekt tot en met oktober 2027.');
  expect(r.laagste.stand).toBe(r.min);
  expect(r.min).toBe(196);                                            // 1.000 + 11 × 14 − 4 × 160 − 2 × 159
  expect(r.lab).toBe('oktober 2027');
  expect(r.tekst).toContain('Laagste stand €196 in oktober 2027, met je inleg van €14 per maand meegerekend.');
});

test('v510 d: op 24 nov tonen de afsluitkaart van november (1–23) en Inzichten november dezelfde vijf getallen', async ({ page }) => {
  /* wat Inzichten op 23 nov als lopende maand toonde (de kop, uitgegevenStand van november t/m die dag) */
  await S.boot(page, '2026-11-23');
  const op23 = await page.evaluate(({ LEEF }) => {
    /* de fixture boekt tot gisteren; de boodschappen van 23 nov (die de stand van 24 nov wel draagt) staan er na een sync aan het eind van de dag */
    const t = { id: 'v510d23', date: '2026-11-23', amount: -40, acc: LEEF, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; save(); try { runMemoVergeten(); } catch (_) {}
    curMonth = null; window._insPer = null; go('ins'); renderIns();
    const k = document.querySelector('[data-insuitgegeven]'); if (!k) return null;
    return { vast: +k.getAttribute('data-vast'), potjes: +k.getAttribute('data-potjes'), zonder: +k.getAttribute('data-zonder'), totaal: +k.getAttribute('data-insuitgegeven') }; }, { LEEF });
  await S.boot(page, '2026-11-24');
  const r = await page.evaluate(({ LEEF }) => {
    /* een uitgave op 24 nov in een potje: de kalendermaand telt hem, het venster 1–23 nov niet */
    const t = { id: 'v510d24', date: '2026-11-24', amount: -55, acc: LEEF, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; save(); try { runMemoVergeten(); } catch (_) {}
    const M = afsluitMaand();
    renderAfsluitSheet(M); showSheetBg();
    const blok = document.querySelector('#afsluitSheet [data-afuitgegeven]');
    const af = {}, afE = {}; for (const e of document.querySelectorAll('#afsluitSheet [data-afuit]')) { af[e.getAttribute('data-afuit')] = +e.getAttribute('data-cent'); afE[e.getAttribute('data-afuit')] = +[...e.querySelectorAll('b')].pop().innerText.replace(/[^\d-]/g, ''); }
    closeSheet();
    /* de Inzichten-kaart voor een maand (insMaandKaart met die maand, dezelfde die de kiezer toont) */
    const div = document.createElement('div'); div.innerHTML = insMaandKaart({ key: 'maand', maanden: ['2026-11'], n: 1, label: 'november', lopend: false }, 'alle');
    const k = div.querySelector('#insMaand');
    const ins = { vast: +k.getAttribute('data-vast'), potjes: +k.getAttribute('data-potjes'), zonder: +k.getAttribute('data-zonder'), contant: +k.getAttribute('data-contant'), totaal: +k.getAttribute('data-totaal') };
    const kal = uitgegevenStand({ m: '2026-11' });
    return { M, start: blok && blok.getAttribute('data-start'), eind: blok && blok.getAttribute('data-eind'), af, afE, ins, kalPotjes: Math.round(kal.cent.potjes * 100), insAf: k.getAttribute('data-insaf') };
  }, { LEEF });
  expect(r.M).toBe('2026-11');
  expect(r.start).toBe('2026-11-01');
  expect(r.eind).toBe('2026-11-23');
  expect(r.insAf).toBe('2026-11');
  for (const k of ['vast', 'potjes', 'zonder', 'contant', 'totaal']) expect(r.af[k === 'contant' ? 'kas' : k]).toBe(r.ins[k]);   // de rij heet kas: de sleutel contant staat niet bij naam in de code (geennorm-hardcode)
  expect(r.kalPotjes - r.af.potjes).toBe(5500);                    // de invoer: de 24e telt in de kalendermaand en niet in het venster
  expect(op23).not.toBeNull();
  for (const k of ['vast', 'potjes', 'zonder', 'totaal']) expect(r.afE[k]).toBe(op23[k]);   // en wat Inzichten op 23 nov toonde
});

test('v510 e: de voorbeeldweergave stort wat het voorstel opzij zet, niet de verdeling', async ({ page }) => {
  await S.boot(page, '2026-10-31');
  const r = await page.evaluate(() => {
    /* de verdeling is bevroren op EUR 1.700 (een afspraak van eerder); het voorstel van Kiezen rekent opnieuw: salaris − bedragen − reserveringen */
    SET.salVerdeling = Object.assign({}, SET.salVerdeling, { opzij: 1700 }); save();
    voorbeeldStart('2026-11-26');
    voorbeeldSalarisWeg(); window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    const VV = salVoorstelVerdeling(rekVoorstel());
    voorbeeldSalarisZet(true);
    const vd = TX.filter(t => String(t.id).startsWith('vb:vd:in'));
    const gestort = vd.filter(t => t.vbVerdeling === 'opzij').reduce((a, t) => a + Math.round(t.amount * 100), 0);
    const sal = TX.filter(t => String(t.id).startsWith('vb:sal:')).reduce((a, t) => a + Math.round(t.amount * 100), 0);
    return { voorstel: VV ? Math.round(VV.opzij) * 100 : null, verdeling: Math.round(+SET.salVerdeling.opzij) * 100, gestort, inSom: vd.reduce((a, t) => a + Math.round(t.amount * 100), 0), sal };
  });
  expect(r.voorstel).not.toBeNull();
  expect(r.voorstel).not.toBe(r.verdeling);           // de invoer: voorstel en verdeling lopen uiteen
  expect(r.gestort).toBe(r.voorstel);
  expect(r.inSom).toBeLessThanOrEqual(r.sal);           // de simulatie verdeelt nooit meer dan het salaris
});

test('v510 f: per potje een bedrag in de uitklap, en de rijen tellen op tot "Potjes via deze rekening"', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  const r = await page.evaluate(({ LEEF }) => {
    openTotSalaris(LEEF); window._totsalPot = true; renderTotSalaris();
    const regel = document.querySelector('#totSalaris [data-totpot]');
    const rijen = [...document.querySelectorAll('#totSalaris [data-totpotrij]')];
    const euros = s => (s.match(/€\s?[\d.]+/g) || []).length;
    return { n: rijen.length, perRij: rijen.map(e => euros(e.innerText)), somCent: rijen.reduce((a, e) => a + +e.getAttribute('data-totpotperiode'), 0),
      somEuro: rijen.reduce((a, e) => a + +e.getAttribute('data-totpotbedrag'), 0), regelCent: +regel.getAttribute('data-totpotcent'),
      regelEuro: totSalarisData(LEEF).pot, tekst: rijen.map(e => e.innerText).join(' | ') };
  }, { LEEF });
  expect(r.n).toBeGreaterThan(0);
  expect(r.perRij.every(n => n === 1)).toBe(true);    // een bedrag per potje
  expect(r.tekst).not.toMatch(/typisch/);
  expect(Math.abs(r.somCent - r.regelCent)).toBeLessThanOrEqual(r.n);   // centen per rij afgerond
  expect(r.somEuro).toBe(r.regelEuro);
});
