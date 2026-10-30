/* v499: salarisperiode, deel 1d · de rekenmotor en de historie per periode, en de voorbeeldweergave die echt tekent.
   In de era (vanaf 24 nov 2026) rekent maandVooruit() per periode (periodeVooruitKern): budget uit periodeBudget, uitgaven en
   vaste lasten over het venster van de periode, en de historie uit de laatste drie afgeronde EENHEDEN (een volle maand, de korte
   november 1–23, een periode), omgerekend naar de dagen van de periode. Elke reeks (Begrijpen, Terugblik, "x van 3 boven budget",
   de verhouding met je salaris, de knoppen van het potjes-scherm) loopt per maand tot en met november (1–23) en daarna per periode,
   met een zichtbare scheiding. Opzij heeft een bron: de verdeling van de periode (SET.salVerdeling.opzij); het voorstel noemt zijn
   afwijking met een reden. Fixture v499-stand: 26 nov 2026, salaris van 24 nov nog niet binnen, boekingen in nov 1–23 en in de
   lopende periode; voor de periode-rij een tweede stand op 26 dec. */
const { test, expect } = require('@playwright/test');
const S = require('./v499-stand');
const V489 = require('./v489-stand');

const kaal = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const DEC = { dag: '2026-12-26', novSalaris: true, extra: [
  { date: '2026-12-02', amount: -120, name: 'Albert Heijn', cat: 'boodschappen' }, { date: '2026-12-12', amount: -70, name: 'Albert Heijn', cat: 'boodschappen' },
  { date: '2026-12-05', amount: -40, name: 'Cafe de Kroeg', cat: 'uiteten' }, { date: '2026-12-24', amount: -55, name: 'Albert Heijn', cat: 'boodschappen' } ] };

// a. 26 nov: de bridge rekent per periode, met de terugval naar dagen uit sep, okt en nov (1–23); nooit "€0 uitgegeven · nog niet te rekenen".
test('v499 a: de bridge per periode met de terugval naar dagen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    const V = maandVooruit(); renderMaand(); gripKiesTab('begrijpen');
    const t = document.getElementById('gripInhoud').innerText;
    const bb = document.querySelector('[data-brugbasis]');
    return { periode: !!V.periode, onbekend: !!V.onbekend, terugval: !!(V.basis && V.basis.terugval), eenheden: V.basis ? V.basis.eenheden : null, tekst: V.basis ? V.basis.tekst : null,
      budget: V.budget, projectie: V.projectie, uit: Math.round(V.uitTotNu), brugBasis: bb ? bb.getAttribute('data-brugterugval') : null,
      nietRekenen: /nog niet te rekenen|€0 uitgegeven/.test(t), basisInTekst: /gebaseerd op sep–okt–nov \(1–23\)/.test(t), perPeriode: /per periode/.test(t) };
  });
  expect(r.periode).toBe(true);
  expect(r.onbekend).toBe(false);
  expect(r.terugval).toBe(true);
  expect(r.eenheden).toEqual(['sep', 'okt', 'nov 1–23']);
  expect(r.tekst).toBe('gebaseerd op sep–okt–nov (1–23)');
  expect(r.budget).toBeGreaterThan(0);
  expect(r.projectie).toBeGreaterThan(r.uit);     // er is historie, dus de verwachting ligt boven wat er al uit is
  expect(r.brugBasis).toBe('1');
  expect(r.nietRekenen).toBe(false);
  expect(r.basisInTekst).toBe(true);
  expect(r.perPeriode).toBe(true);
});

// b. De reeksen lopen per maand tot nov (1–23) en daarna per periode, met een scheiding; "x van 3 periodes".
test('v499 b: reeksen per maand tot nov 1–23, daarna per periode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, DEC);
  const r = await page.evaluate(() => {
    const PM = potMaanden('boodschappen', thisYM());
    renderMaand();
    const zien = document.getElementById('gripInhoud').innerText;
    const B = potBovenLijst(thisYM(), true);
    return { eenheden: !!PM.eenheden, labels: PM.labels, tekst: potReeksTekst(PM), scheiding: document.querySelectorAll('[data-reeksscheiding]').length >= 0,
      bovenWoord: B.length ? eenheidWoord(B[0]) : null, zienMnd: /van 3 mnd boven/.test(zien), zienPer: /van 3 periodes boven/.test(zien) || !B.length };
  });
  expect(r.eenheden).toBe(true);
  expect(r.labels).toEqual(['okt', 'nov 1–23', '24 nov–23 dec']);
  expect(r.tekst).toMatch(/^okt €\d+ · nov 1–23 €\d+ \| 24 nov–23 dec €\d+$/);   // de scheiding tussen maanden en periodes
  expect(r.bovenWoord === null || r.bovenWoord === 'periodes').toBe(true);
  expect(r.zienMnd).toBe(false);
});

// c. Terugblik: het spaardoel per periode, met één meetlat: opzij volgens je verdeling.
test('v499 c: het spaardoel per periode tegen de verdeling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, DEC);
  const r = await page.evaluate(() => {
    renderMaand(); gripKiesTab('terugblik');
    const t = document.getElementById('gripInhoud').innerText;
    const el = document.querySelector('[data-terugmaand][data-terugeenheid]');
    return { t: t.slice(0, 1500), eenheid: el ? el.getAttribute('data-terugeenheid') : null, doel: SET.salVerdeling.opzij };
  });
  expect(r.eenheid).toBe('24 nov – 23 dec');
  expect(r.t).toMatch(/Spaardoel 24 nov – 23 dec/);
  expect(r.t).toMatch(/netto €500 van €3\.000 volgens je verdeling/);   // doel = opzij volgens je verdeling, niet de Plan-snapshot
  expect(r.t).toMatch(/Plan €2\.200\/mnd/);                           // het Plan-doel staat ernaast en is geen meetlat
  expect(r.t).not.toMatch(/Spaardoel (november|december)\b(?! \(1)/);
});

// d. Verhouding met je salaris: november heet "november (1–23)" zonder "Geen salaris herkend", daarna een rij per periode.
test('v499 d: de verhouding per eenheid, nov (1–23) en een rij per periode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, DEC);
  const r = await page.evaluate(() => {
    renderMaand(); gripKiesTab('terugblik');
    const nov = document.querySelector('[data-verhoudingmaand="2026-11"][data-kortemaand]');
    const per = document.querySelector('[data-verhoudingperiode="2026-11-24"]');
    const okt = document.querySelector('[data-verhoudingmaand="2026-10"]');
    const af = document.getElementById('gripTerugAfgesloten');
    return { nov: nov ? nov.innerText.replace(/\s+/g, ' ') : null, per: per ? per.innerText.replace(/\s+/g, ' ') : null, okt: okt ? okt.innerText.replace(/\s+/g, ' ') : null,
      afg: af ? af.innerText.replace(/\s+/g, ' ') : null, geenHerkend: /Geen salaris herkend/.test(document.getElementById('gripInhoud').innerText) };
  });
  expect(r.nov).toMatch(/^nov \(1–23\)/);
  expect(r.nov).toMatch(/salaris van 24 okt valt in de vorige periode/);
  expect(r.per).toMatch(/€5\.216/);                                  // het salaris van 24 nov valt in de periode
  expect(r.okt).toMatch(/^okt\s*€5\.216/);
  expect(r.afg).toMatch(/24 nov – 23 dec/);
  expect(r.afg).toMatch(/€5\.216 salaris/);
  expect(r.geenHerkend).toBe(false);
});

// e. De knoppen van het potjes-scherm zijn in de era eenheden. ("Komende 3 maanden" bestaat niet meer in de code sinds v365; zie A.)
test('v499 e: de potjesknoppen zijn periodes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, DEC);
  const r = await page.evaluate(() => {
    const K = insPotjeKnoppen().map(x => x.label);
    openInsPotje('boodschappen', 'P:2026-11-24');
    const sh = document.getElementById('insPotjeSheet');
    const out = { K, sheetEenheid: sh ? sh.getAttribute('data-inspotjeeenheid') : null, uit: sh ? +sh.getAttribute('data-uit') : null, knoppen: [...document.querySelectorAll('[data-inspotjemaand]')].map(e => e.getAttribute('data-inspotjemaand')), komende: /Komende 3 maanden/.test(document.body.innerText) };
    closeSheet(); return out;
  });
  expect(r.K.slice(0, 4)).toEqual(['24 dec – 24 jan', '24 nov–23 dec', 'nov 1–23', 'okt']);   // 24 jan 2027 is een zondag, dus de storting valt op maandag 25 jan en de periode eindigt op 24 jan
  expect(r.sheetEenheid).toBe('24 nov – 23 dec');
  expect(r.uit).toBe(62 + 120 + 70);                                  // boodschappen in het venster 24 nov t/m 23 dec
  expect(r.knoppen).toContain('P:2026-11-24');
  expect(r.knoppen).toContain('K:2026-11');
  expect(r.komende).toBe(false);
});

// f. "Verwacht saldo eind periode" op Inzichten en in de bridge is één getal, in centen, uit periodeVerloop.
test('v499 f: verwacht saldo eind periode, een bron', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    renderIns(); const ins = document.querySelector('[data-inssaldoeind]');
    renderMaand(); gripKiesTab('begrijpen'); const br = document.querySelector('[data-brugsaldoeind]');
    const PV = periodeVerloop(periodeStandNu()); const V = maandVooruit();
    return { ins: ins ? +ins.getAttribute('data-inssaldoeind') : null, brug: br ? +br.getAttribute('data-brugsaldoeind') : null, pv: PV.eind, bron: PV.bron, nog: V.nogVerwacht };
  });
  expect(r.ins).not.toBeNull(); expect(r.brug).not.toBeNull();
  expect(Math.round(r.ins * 100)).toBe(Math.round(r.brug * 100));
  expect(Math.round(r.ins * 100)).toBe(Math.round(r.pv * 100));
  expect(r.bron).toBe('vooruitblik');                                 // het saldo eind leest de vooruitblik van de motor, geen eigen tempo
});

// g. De echte route: Inzichten eerst op vandaag getekend, daarna voorbeeldStart zonder handmatige render.
test('v499 g: voorbeeldStart tekent Inzichten zelf opnieuw', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await V489.boot(page, { dag: '2026-10-28' });
  const r = await page.evaluate(() => {
    go('ins'); renderIns();
    const voor = document.getElementById('s-ins').innerText;
    voorbeeldStart('2026-11-26');
    const na = document.getElementById('s-ins').innerText, kop = document.querySelector('[data-insmaand]'), balk = document.querySelector('[data-voorbeeldsalaris]');
    const out = { voorOkt: /oktober/i.test(voor), naPeriode: kop ? kop.getAttribute('data-insmaand') : null, naLabel: kop ? kop.getAttribute('data-insperiode') : null, naOkt: /oktober|30 okt|\d+–31 okt/i.test(na), schakelaar: balk ? balk.innerText : null };
    voorbeeldStop(); out.terug = /oktober/i.test(document.getElementById('s-ins').innerText);
    return out;
  });
  expect(r.voorOkt).toBe(true);
  expect(r.naPeriode).toBe('periode');
  expect(r.naLabel).toBe('24 nov – 23 dec');
  expect(r.naOkt).toBe(false);
  expect(r.schakelaar).toMatch(/salaris erbij: uit ›/);
  expect(r.terug).toBe(true);
});

// h. Kiezen in de era: vorige periode, deze periode, november (1–23).
test('v499 h: Kiezen noemt periodes en november (1–23)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    renderMaand(); gripKiesTab('kiezen');
    const t = document.getElementById('gripInhoud').innerText, mee = document.querySelector('[data-meegemeten]');
    const w = document.querySelector('[data-watoverregel]');
    return { t, mee: mee ? mee.getAttribute('data-meeeenheid') : null, wat: w ? w.innerText : null };
  });
  expect(r.t).toMatch(/Mee uit vorige periode/);
  expect(r.t).toMatch(/Al gekozen deze periode/);
  expect(r.t).not.toMatch(/Mee uit vorige maand|Al gekozen deze maand/);
  expect(r.mee).toBe('november (1–23)');
  if (r.wat != null) expect(r.wat).toMatch(/over vorige periode \(/);
});

// i. Zien: één opzij-bedrag uit de verdeling van de periode; het voorstel gaat over 24 nov en noemt zijn afwijking met een reden.
test('v499 i: een opzij-bedrag, het voorstel over 24 nov met zijn afwijking', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    /* de afspraak hoort bij de VORIGE periode (24 okt – 23 nov), zodat de kaart "Je salarisverdeling" over het salaris van 24 nov gaat */
    SET.salVerdeling.salYM = '2026-10'; SET.salVerdeling.start = '2026-10-24'; SET.salVerdeling.eind = '2026-11-23'; save(); window._rekV = null;
    renderMaand();
    const k = document.getElementById('salVoorstelKaart'), P = rekVoorstel(), O = opzijPeriode();
    const t = k ? k.innerText : '';
    return { aanwezig: !!k, start: k ? k.getAttribute('data-salvoorstel') : null, bron: k ? k.getAttribute('data-salvopzijbron') : null, opzij: k ? +k.getAttribute('data-salvkaartopzij') : null,
      laat: k ? k.hasAttribute('data-salvlaat') : null, t, afw: k ? (k.querySelector('[data-salvopzijverschil]') || {}).innerText || null : null, verdeling: k ? +k.getAttribute('data-salvverdeling') : null, N: salVoorstelNu().opzij,
      voorstelOpzij: P.opzij, doel: O.doel, opzijTelling: (t.match(/opzij/g) || []).length, uitleg: k ? [...k.querySelectorAll('[data-rekuitleg]')].map(e => e.innerText) : [] };
  });
  expect(r.aanwezig).toBe(true);
  expect(r.start).toBe('2026-11-24');                                 // 26 nov: het salaris van 24 nov, niet 24 dec
  expect(r.laat).toBe(true);
  /* v501 (punt 1): het ene opzij-getal van de kaart is het voorstel (salVoorstelNu, hetzelfde als de Terugblik en de sheet); je verdeling
     (3.000, dezelfde bron als de Doelen-meter) staat als data-salvverdeling en, zodra het voorstel afwijkt, in de regel eronder met het verschil */
  expect(r.bron).toBe('voorstel');
  expect(r.opzij).toBe(r.N);
  expect(r.verdeling).toBe(3000);
  expect(r.doel).toBe(3000);                                          // dezelfde bron als Zien en de Doelen-meter
  expect(r.t).toMatch(new RegExp('· opzij €' + r.N.toLocaleString('nl-NL').replace('.', '\\.')));
  expect(r.opzijTelling).toBe(1);                                     // het getal een keer; de verdeling staat eronder zonder het woord opzij
  if (r.N !== 3000) { expect(r.afw).toMatch(/volgens je verdeling €3\.000/); }
  if (Math.abs(r.voorstelOpzij - 3000) > 25) { expect(r.uitleg.length).toBeGreaterThan(0); for (const u of r.uitleg) expect(u).toMatch(/nodig tot .* − saldo nu €.* = €.* (erbij|over) · je afspraak €/); }   // v500 (punt 1): de uitleg is een rekensom per rekening
});
