/* v337: AFSPRAKEN MET OPVOLGING, EN DE MAANDAFSLUITING OP GRIP.
   De stand van de gebruiker op 4 oktober 2026: het logboek van september is beantwoord, de dekking
   van de reserveringen vraagt EUR 131 per maand tot november (EUR 37 in de pot tegen een boete van
   EUR 299 in november), en Abonnementen stopt vanaf november. De afspraken ontstaan via de echte
   routes: de knop in de dekkingssheet en het stoppen van het potje. */
const { test, expect } = require('@playwright/test');
const { boot, RES } = require('./bezit-koppeling.fixture');

const SEP = '2026-09';
const LOG = {
  '2026-09|boodschappen': { id: '2026-09|boodschappen', maand: SEP, potjeId: 'boodschappen', categorie: 'Boodschappen', potje_bij_detectie: 500, over_bij_detectie: 40, getoond: true, actie: 'geen', over_eind_maand: 84, over_oorspronkelijk: 84, antwoord: { keuze: 'uitzondering', op: '2026-10-02' } },
  '2026-09|uiteten': { id: '2026-09|uiteten', maand: SEP, potjeId: 'uiteten', categorie: 'Uit eten & café', potje_bij_detectie: 150, over_bij_detectie: 40, getoond: true, actie: 'grens_gezet', over_eind_maand: 194, over_oorspronkelijk: 194, antwoord: { keuze: 'uitzondering', op: '2026-10-02' } },
  '2026-09|sport': { id: '2026-09|sport', maand: SEP, potjeId: 'sport', categorie: 'Sport & gezondheid', potje_bij_detectie: 50, over_bij_detectie: 30, getoond: true, actie: 'geen', over_eind_maand: 40, over_oorspronkelijk: 40, antwoord: { keuze: 'past_niet', op: '2026-10-02' } },
};
const NETFLIX = [
  { id: 'n08', date: '2026-08-12', amount: -15.99, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' },
  { id: 'n09', date: '2026-09-12', amount: -15.99, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' },
];
const SET = (extra) => Object.assign({ budgetMonth: '2026-10', budgets: { boodschappen: 500, huur: 900, abonnement: 30 }, valtOpLog: LOG }, extra || {});

async function stand(page, extra) {
  await boot(page, { dag: '2026-10-04', set: SET(extra), extraTx: NETFLIX });
  await page.evaluate(() => go('maand'));
}
/* De twee afspraken via de echte routes. */
async function maakAfspraken(page) {
  await page.evaluate(() => openMaandBeslis('dekking'));
  await page.click('[data-afdekking="nieuw"]');
  await page.evaluate(() => { openPotje('abonnement'); savePotje('abonnement', true); go('maand'); });
}
/* v340: de afsluiting is een pop-up en staat niet meer op Grip. Deze helper opent hem (de sheet die
   ook de pop-up is) en leest daar de teller, de punten en de afspraken. Geen afsluiting nodig: null. */
const kaart = async (page) => {
  const nodig = await page.evaluate(() => afsluitNodig(afsluitMaand()));
  if (!nodig) return null;
  await page.evaluate(() => openAfsluiting(afsluitMaand()));
  const sh = await page.evaluate(() => {
    const k = document.getElementById('afsluitSheet');
    const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
    return {
      tekst: t(k), teller: k.querySelector('[data-afteller]').dataset.afteller, sheetTeller: k.querySelector('[data-afteller]').dataset.afteller,
      punten: [...k.querySelectorAll('[data-afpunt]')].map((e) => ({ punt: e.dataset.afpunt, af: e.dataset.af === '1', tekst: t(e) })),
      /* v365: de afspraken staan niet meer in de afsluiting (die telt alleen afsluittaken). Hun stand is dezelfde
         rij (afspraakRij) voor dezelfde lijst (afsprakenVoor), hier los getekend. */
      inSheet: k.querySelectorAll('[data-afspraak]').length,
      afspraken: (() => { const d = document.createElement('div'); d.innerHTML = afsprakenVoor(afsluitMaand()).map((a) => afspraakRij(a)).join('');
        return [...d.querySelectorAll('[data-afspraak]')].map((e) => ({ status: e.dataset.afstatus, tekst: t(e) || e.textContent.replace(/\s+/g, ' ').trim(), box: e.querySelector('[data-box]').dataset.box })); })(),
      knop: k.querySelector('[data-afsluit]') ? k.querySelector('[data-afsluit]').dataset.afsluit : null,
      grip: !!document.querySelector('#s-maand #afsluitKaart, #s-maand [data-afteller]'),
    };
  });
  await page.evaluate(() => closeSheet());
  return sh;
};
/* Een afgesloten maand staat in het logboek: in de tijdlijn, en een tik opent hem met wat er bij het
   afsluiten werd bewaard. */
const afgesloten = async (page, M) => page.evaluate((m) => {
  go('logboek'); const kol = document.querySelector(`[data-logmaand="${m}"]`);
  openLogMaand(m); const t = document.getElementById('logMaand').innerText.replace(/\s+/g, ' ');
  closeSheet(); return { kol: kol ? kol.innerText.replace(/\s+/g, ' ') : null, tekst: t };
}, M);

test('a. invoer: dekking let op met EUR 131 per maand tot november, en september draagt boekingen', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => { const d = maandRegels().find((x) => x.key === 'dekking'); return { status: d.status, per: d.perMaandTot, sep: txOfMonth('2026-09').length, nu: thisYM() }; });
  expect(r.nu).toBe('2026-10');
  expect(r.status).toBe('let op');
  expect(r.per).toEqual({ bedrag: 131, maand: '2026-11' });
  expect(r.sep).toBeGreaterThan(0);
});

test('b. de stand op 4 oktober: logboek afgevinkt, dekking open, Abonnementen open tot november', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  const k = await kaart(page);
  expect(k).not.toBeNull();
  // v340: op Grip staat geen afsluiting meer; hij is een pop-up
  expect(k.grip).toBe(false);
  expect(k.tekst).toContain('September afsluiten');
  const log = k.punten.find((p) => p.punt === 'logboek');
  expect(log.af).toBe(true);
  expect(log.tekst).toContain('3 van 3');
  expect(k.afspraken.length).toBe(2);
  const dek = k.afspraken.find((a) => a.tekst.includes('reserveringen'));
  expect(dek.tekst).toContain('€131 per maand naar je reserveringen tot november');
  expect(dek.tekst).toContain('storting in oktober nog niet gezien');
  expect(dek.status).toBe('nietgezien');
  expect(dek.box).toBe('half');
  const ab = k.afspraken.find((a) => a.tekst.includes('Abonnementen'));
  expect(ab.tekst).toContain('Abonnementen stopt vanaf november');
  expect(ab.tekst).toContain('gemeten in november');
  expect(ab.status).toBe('loopt');
  expect(k.knop).toBe('open');                               // met open punten alleen via die knop
  // v340: de lopende afspraken staan onder Deze maand op Grip; de pop-up toont ze ook, want hij is een terugblik
  expect(await page.evaluate(() => document.querySelectorAll('#gripDezeMaand [data-afspraak]').length)).toBe(2);
  // v365: de teller telt alleen de vijf afsluittaken, en de afspraken staan niet in de sheet
  expect(k.teller).toBe('4/5');
  expect(k.inSheet).toBe(0);
});

test('c. een storting naar de reserveringsrekening vinkt de afspraak af', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  await page.evaluate((acc) => { TX.push({ id: 'st1', date: '2026-10-04', amount: 131, acc, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); TX.forEach(categorize); save(); go('maand'); }, RES);
  const k = await kaart(page);
  const dek = k.afspraken.find((a) => a.tekst.includes('reserveringen'));
  expect(dek.status).toBe('gezien');
  expect(dek.box).toBe('aan');
  expect(dek.tekst).toContain('storting in oktober gezien');
  expect(dek.tekst).toContain('november volgt');
  // de rest van de stand verandert niet
  expect(k.afspraken.find((a) => a.tekst.includes('Abonnementen')).status).toBe('loopt');
});

test('c2. een deel van het bedrag is deels, nul is nog niet gezien', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  await page.evaluate((acc) => { TX.push({ id: 'st2', date: '2026-10-04', amount: 60, acc, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); TX.forEach(categorize); save(); go('maand'); }, RES);
  const dek = (await kaart(page)).afspraken.find((a) => a.tekst.includes('reserveringen'));
  expect(dek.status).toBe('deels');
  expect(dek.tekst).toContain('€60 van €131 in oktober gezien');
});

test('d. afsluiten met open punten bewaart ze bij september, en de kaart wordt een regel', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  await page.evaluate(() => openAfsluitOpen('2026-09'));
  const open = await page.$$eval('[data-afopen]', (L) => L.map((e) => e.innerText.replace(/\s+/g, ' ')));
  // v365: een afspraak is geen open afsluitpunt
  expect(open.some((t) => t.includes('storting in oktober nog niet gezien'))).toBe(false);
  // openen schrijft niets
  expect(await page.evaluate(() => !!(SET.maandAfsluiting || {})['2026-09'])).toBe(false);
  await page.evaluate(() => maandAfsluiten('2026-09', true));
  const rec = await page.evaluate(() => SET.maandAfsluiting['2026-09']);
  expect(rec.op).toBe('2026-10-04');
  expect(rec.open.map((o) => o.feit)).not.toEqual(expect.arrayContaining(['storting in oktober nog niet gezien']));
  expect(rec.afspraken.length).toBe(2);
  // v340: de maand staat in het logboek, met wat er bij het afsluiten werd bewaard
  const r = await afgesloten(page, '2026-09');
  expect(r.kol).toContain('afgesloten');
  expect(r.tekst).toContain('Afgesloten op 4 oktober');
  expect(r.tekst).toContain('storting in oktober nog niet gezien');
  expect(r.tekst).not.toContain('gewijzigd na afsluiten');
  expect(await kaart(page)).toBeNull();
  // doorlopende afspraken staan onder Deze maand
  expect(await page.evaluate(() => document.querySelectorAll('#gripDezeMaand [data-afspraak]').length)).toBe(2);
});

test('e. zonder open punten kan het gewoon, en niets sluit vanzelf', async ({ page }) => {
  // met een open punt (een stand zonder invuldag) sluit een gewone afsluiting niet
  await stand(page, { reserveringen: [] });
  await page.evaluate(() => { maandAfsluiten('2026-09', false); go('maand'); });
  expect(await page.evaluate(() => !!(SET.maandAfsluiting || {})['2026-09'])).toBe(false);
  expect((await kaart(page)).knop).toBe('open');
  // alles af: geen afspraken, logboek beantwoord, potjes, geen Overig, geen standen
  await stand(page, { assets: [], reserveringen: [] });
  const k = await kaart(page);
  expect(k.punten.every((p) => p.af)).toBe(true);
  expect(k.knop).toBe('klaar');
  expect(k.teller).toBe(`${k.punten.length}/${k.punten.length}`);
  await page.evaluate(() => openAfsluiting('2026-09'));
  await page.click('[data-afsluit="klaar"]');
  const r = await afgesloten(page, '2026-09');
  expect(r.tekst).toContain('Afgesloten op 4 oktober');
  expect(await page.evaluate(() => SET.maandAfsluiting['2026-09'].open.length)).toBe(0);
});

test('f. een late boeking in september zegt "gewijzigd na afsluiten"', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { maandAfsluiten('2026-09', true); go('maand'); });
  expect((await afgesloten(page, '2026-09')).tekst).not.toContain('veranderd');
  await page.evaluate(() => { TX.push({ id: 'laat', date: '2026-09-30', amount: -12, acc: TX[0].acc, name: 'Bakker', desc: 'BEA, BETAALPAS BAKKER', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); TX.forEach(categorize); save(); go('maand'); });
  expect((await afgesloten(page, '2026-09')).tekst).toContain('Na het afsluiten is er iets aan september veranderd');
});

test('g. herzien telt als afgerond: stoppen vinkt af met "gestopt"', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  const id = await page.evaluate(() => afsprakenLijst().find((a) => a.soort === 'storting').id);
  await page.evaluate((i) => { openAfspraak(i); }, id);
  await page.click('text=Afspraak stoppen');
  await page.evaluate(() => go('maand'));
  const dek = (await kaart(page)).afspraken.find((a) => a.tekst.includes('reserveringen'));
  expect(dek.status).toBe('herzien');
  expect(dek.box).toBe('aan');
  expect(dek.tekst).toContain('gestopt op 4 oktober');
  expect((await kaart(page)).teller).toBe('4/5');            // v365: een afspraak telt niet in de afsluiting
});

test('h. aanpassen herziet de oude afspraak en maakt een nieuwe', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  const id = await page.evaluate(() => afsprakenLijst().find((a) => a.soort === 'storting').id);
  await page.evaluate((i) => openAfspraak(i), id);
  await page.fill('#afBedrag', '150');
  await page.click('[data-afaanpas] button');
  const L = await page.evaluate(() => afsprakenLijst().filter((a) => a.soort === 'storting').map((a) => ({ b: a.bedrag, h: a.herzien ? a.herzien.hoe : null })));
  expect(L).toEqual([{ b: 131, h: 'aangepast' }, { b: 150, h: null }]);
});

test('i. de app vinkt niets zelf af: er is geen knop om een afspraak af te vinken', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  const id = await page.evaluate(() => afsprakenLijst()[0].id);
  await page.evaluate((i) => openAfspraak(i), id);
  const t = await page.textContent('#sheet');
  expect(t).not.toMatch(/gedaan|afvinken|gelukt/i);
  expect(t).toContain('Minder vinkt af wat het in je boekingen of instellingen ziet');
});

test('j. Abonnementen: een afschrijving in november houdt hem open, wegblijven vinkt hem af', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  const r = await page.evaluate(() => {
    const a = afsprakenLijst().find((x) => x.soort === 'potje');
    const vandaag = Date; const nov = new vandaag('2026-12-02T10:00:00');
    const oud = window.Date;
    // stand op 2 december zonder afschrijving in november
    window.Date = class extends oud { constructor(...x) { super(...(x.length ? x : [nov.getTime()])); } static now() { return nov.getTime(); } };
    const zonder = afspraakStand(a);
    // midden in november, nog geen afschrijving: de termijn loopt nog, dus nog niet gezien
    const midNov = new oud('2026-11-20T10:00:00').getTime();
    window.Date = class extends oud { constructor(...x) { super(...(x.length ? x : [midNov])); } static now() { return midNov; } };
    const halverwege = afspraakStand(a);
    window.Date = class extends oud { constructor(...x) { super(...(x.length ? x : [nov.getTime()])); } static now() { return nov.getTime(); } };
    TX.push({ id: 'n11', date: '2026-11-12', amount: -15.99, acc: TX[0].acc, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    TX.forEach(categorize); save();
    const met = afspraakStand(a);
    window.Date = oud;
    return { zonder, halverwege, met, cat: catOf(TX.find((t) => t.date === '2026-11-12')) };
  });
  expect(r.cat).toBe('abonnement');
  expect(r.halverwege.status).toBe('loopt');
  expect(r.halverwege.feit).toBe('in november tot nu geen afschrijving');
  expect(r.zonder.status).toBe('gezien');
  expect(r.zonder.feit).toBe('geen afschrijving meer in november');
  expect(r.met.status).toBe('nietgezien');
  expect(r.met.feit).toBe('in november nog €16 afgeschreven');
});

test('k. geen verwijt, geen teller over maanden heen, geen gedachtestreepjes', async ({ page }) => {
  await stand(page);
  await maakAfspraken(page);
  const t = (await kaart(page)).tekst;
  expect(t).not.toMatch(/vergeten|helaas|goed bezig|streak|op rij|!|—|–/i);
});

test('l. de grens maakt een afspraak die aan je uitgaven in die categorie wordt gemeten', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => {
    SET.valtOpLog = SET.valtOpLog || {};
    SET.valtOpLog['2026-10|boodschappen'] = { id: '2026-10|boodschappen', maand: '2026-10', potjeId: 'boodschappen', categorie: 'Boodschappen', potje_bij_detectie: 500, getoond: true };
    valtOpGrensZet('2026-10|boodschappen');
    const a = afsprakenLijst().find((x) => x.soort === 'grens');
    return { a, S: afspraakStand(a) };
  });
  expect(r.a.cat).toBe('boodschappen');
  expect(r.a.van).toBe('2026-10');
  expect(r.S.status).toBe('loopt');
  expect(r.S.feit).toContain('tot nu binnen');
});

test('m. de pauze maakt een afspraak, en inleg na de afspraak houdt hem open', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => {
    belegKies('kayani', 'pauze');
    const a = afsprakenLijst().find((x) => x.soort === 'pauze'); const b = SET.assets.find((x) => x.id === 'kayani');
    return { a, S: afspraakStand(a), per: b.per, pauze: b.pauze };
  });
  expect(r.a.assetId).toBe('kayani');
  expect(r.per).toBe(100);                                     // Minder stopt niets
  expect(r.pauze).toBe(undefined);
  expect(r.a.tot).toBe('2026-11');
  expect(r.S.status).toBe('loopt');
  expect(r.S.feit).toContain('sinds 4 oktober geen inleg gezien');
});

test('n. een potje omhoog maakt geen afspraak, omlaag wel', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => {
    openPotje('boodschappen'); window._potDraft = { type: 'vast', vast: 600 }; savePotje('boodschappen');
    const na1 = afsprakenLijst().length;
    openPotje('boodschappen'); window._potDraft = { type: 'vast', vast: 400 }; savePotje('boodschappen');
    return { na1, na2: afsprakenLijst().length, wat: afsprakenLijst().map((a) => a.wat) };
  });
  expect(r.na1).toBe(0);
  expect(r.na2).toBe(1);
  expect(r.wat[0]).toBe('Potje Boodschappen €400 vanaf november');
});for (const [w, vh] of [[360, 640], [390, 844]]) {
  /* v340: de afsluiting staat niet meer op Grip; de hoogte van Grip staat in grip-dashboard.spec.js. Wat
     hier blijft: de pop-up past zonder overloop, met de drie tegels erin. */
  test(`o. de pop-up past zonder overloop op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: vh });
    await stand(page);
    await maakAfspraken(page);
    await page.evaluate(() => openAfsluiting('2026-09'));
    const sh = await page.evaluate(() => { const k = document.getElementById('sheet'); const r = k.getBoundingClientRect();
      return { over: [...k.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > r.right + 1), tegels: k.querySelectorAll('[data-afsluittegel]').length }; });
    expect(sh.over).toBe(false);
    expect(sh.tegels).toBe(3);
  });
}


test('p. een uitgesloten incasso: verlagen meet of de afschrijving wegblijft, en de vlag lekt niet', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => {
    // GECONSTRUEERD: de vlag die uitgeslotenPotjeVerlaag() na openPotje() zet
    openPotje('abonnement'); window._potIncasso = { key: recurKey(TX.find((t) => t.name === 'Netflix')), naam: 'Netflix', k: 'abonnement' };
    window._potDraft = { type: 'vast', vast: 10 }; savePotje('abonnement');
    const a = afsprakenLijst().find((x) => x.soort === 'incasso');
    // de route geannuleerd (vlag gezet, sheet dicht zonder opslaan), daarna hetzelfde potje gewoon
    // geopend en verlaagd: dat is weer een potje-afspraak, de vlag lekt niet
    openPotje('boodschappen'); window._potIncasso = { key: 'X', naam: 'X', k: 'boodschappen' }; closeSheet();
    openPotje('boodschappen'); window._potDraft = { type: 'vast', vast: 400 }; savePotje('boodschappen');
    return { a, S: afspraakStand(a), soorten: afsprakenLijst().map((x) => x.soort) };
  });
  expect(r.a.wat).toBe('Netflix blijft weg vanaf november');
  expect(r.a.van).toBe('2026-11');
  expect(r.S.status).toBe('loopt');
  expect(r.soorten).toEqual(['incasso', 'potje']);
});

test('q. standen: zonder invuldag of ouder dan 90 dagen open, recent af', async ({ page }) => {
  await stand(page, { reserveringen: [], assets: [{ id: 'h', naam: 'Holding', waarde: 5000, waardeOp: '2026-09-01' }, { id: 'p', naam: 'Peaks (pensioen)', waarde: 3200, waardeOp: '2026-06-20' }] });
  let st = (await kaart(page)).punten.find((p) => p.punt === 'standen');
  expect(st.af).toBe(false);
  expect(st.tekst).toContain('Peaks (pensioen)');
  expect(st.tekst).not.toContain('Holding');
  await page.evaluate(() => { SET.assets[1].waardeOp = '2026-07-10'; save(); go('maand'); });   // 86 dagen
  st = (await kaart(page)).punten.find((p) => p.punt === 'standen');
  expect(st.af).toBe(true);
});

test('r. een boeking op Overig zonder eigen keuze is een open punt, met keuze niet', async ({ page }) => {
  await stand(page, { reserveringen: [], assets: [] });
  const id = await page.evaluate(() => { const t = { id: 'ov', date: '2026-09-20', amount: -25, acc: TX[0].acc, name: 'Xyzzy BV', desc: 'XYZZY BV ONBEKEND', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; TX.push(t); TX.forEach(categorize); save(); go('maand'); return TX.find((x) => x.name === 'Xyzzy BV').id; });
  expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), id)).toBe('overig');
  let c = (await kaart(page)).punten.find((p) => p.punt === 'categorie');
  expect(c.af).toBe(false);
  expect(c.tekst).toContain('1 boeking staat nog op Overig');
  await page.evaluate((i) => { OVR[i] = 'overig'; save(); go('maand'); }, id);
  c = (await kaart(page)).punten.find((p) => p.punt === 'categorie');
  expect(c.af).toBe(true);
});

test('s. een punt in de sheet sluit de sheet en opent zijn ingang', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => openAfsluiting('2026-09'));
  await expect(page.locator('#afsluitSheet')).toBeVisible();
  await page.click('#afsluitSheet [data-afpunt="logboek"]');
  expect(await page.evaluate(() => document.getElementById('sheetBg').classList.contains('show'))).toBe(false);
  await expect(page.locator('#s-logboek')).toBeVisible();
});
