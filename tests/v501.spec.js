/* v501: ONDERHOUDSRONDE · de foutenlijst van 26 nov en het restje van v500.
   a. Op 26 nov is de opzij van het voorstel op Zien (de kaart "Je salarisverdeling") en in de Terugblik gelijk, in euro's, gelezen uit de
      GETOONDE tekst (sabotage: een tweede berekening in de Terugblik).
   b. De opzij op de verdelingkaart draagt het venster "24 okt – 23 nov" (sabotage: venster weg).
   c. Een eenmalig deel dat al naar opzij ging geeft "lijkt al verdeeld · klopt / niet" en geen "verdelen"; pas na "klopt" verdwijnt de
      keuze (sabotage: niet meten).
   d. Health Club → SportCity telt alleen het verschil (+€40), niet "nieuw +€80" (sabotage: vol bedrag als nieuw).
   e. Stilstaand geld met noodfonds, doelen en reserveringen die het saldo dekken: geen signaal; met saldo erboven wel, met de som
      (sabotage: bruto spaarsaldo).
   f. Een bezitting met "voorwaarden gelden niet" geeft geen "Beleggen vóór fundament"; zonder keuze een vraag en geen signaal; met ja
      het signaal (sabotage: keuze negeren).
   g. Era: "gesteld deze periode", "n van de laatste 3 (mnd, mnd, mnd) boven budget", één reeksformaat voor potje en beleggen,
      "herhaalt zich · Ne keer", en één titel in Wacht op oorzaak (sabotage per label).
   h. Na "gezien" is de verdelingkaart één regel, en pas twee salarissen op rij met > €100 afwijking zetten een keuze in Kiezen
      (sabotage: de knop doet niets).
   Fixture v501-stand.js (geconstrueerd, niet gemeten; de toestelgetallen staan alleen op het toestel). */
const { test, expect } = require('@playwright/test');
const S = require('./v501-stand');
const { kaalUit } = require('./bron-kaal');
const K = require('./grip-kring-stand');
const num = s => { const m = String(s || '').replace(/\./g, '').match(/-?\d+/); return m ? +m[0] : NaN; };

test.describe('v501', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('a. de opzij van het voorstel: Zien en de Terugblik tonen hetzelfde bedrag, in de getoonde tekst', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => {
      const N = salVoorstelNu(); renderMaand(); gripKiesTab('zien');
      const k = document.getElementById('salVoorstelKaart');
      const zienTxt = (k.querySelector('[data-salvopzijtekst]') || {}).innerText || '', zienAttr = +k.dataset.salvkaartopzij, verdeling = +k.dataset.salvverdeling;
      const vs = k.querySelector('[data-salvopzijverschil]'); const vsTxt = vs ? vs.innerText : '', vsAttr = vs ? +vs.dataset.salvopzijverschil : null;
      gripKiesTab('terugblik');
      const m2 = document.querySelector('[data-m2volgopzij]'); const m2Txt = m2.innerText, m2Attr = +m2.dataset.m2volgopzij;
      const VS = salOpzijVerschil(N);
      return { N: N.opzij, res: N.P.reserveringen, zienTxt, zienAttr, verdeling, vsTxt, vsAttr, m2Txt, m2Attr, delen: VS.delen, delenSom: VS.totaal };
    });
    expect(r.zienAttr).toBe(r.N); expect(r.m2Attr).toBe(r.N);
    const zien = num(r.zienTxt.replace(/^.*opzij/, '')), m2 = num(r.m2Txt.replace(/^.*opzij/, ''));
    expect(zien, 'Zien toont het ene getal').toBe(r.N); expect(m2, 'de Terugblik toont hetzelfde getal').toBe(zien);
    /* het verschil met je verdeling staat eronder, bij naam, OOK als het onder SALV_AFWIJK ligt (de €14 van 26 nov) */
    expect(r.verdeling).toBe(3000); expect(r.N, 'invoer: het voorstel wijkt af van de afspraak').not.toBe(3000);
    expect(r.vsAttr).toBe(r.N - 3000); expect(r.vsTxt).toMatch(/volgens je verdeling €3\.000 · [+−]€\d/);
    expect(r.delen.length).toBeGreaterThan(0); expect(r.delenSom).toBe(r.N - 3000);   // de delen tellen op tot het verschil
  });

  test('a2. de reden van 26 nov: reserveringen die aan de komende periode worden toegerekend staan in het voorstel, niet in de afspraak', async ({ page }) => {
    await S.boot(page, { res: true });
    const r = await page.evaluate(() => { const N = salVoorstelNu(); renderMaand(); gripKiesTab('zien'); const k = document.getElementById('salVoorstelKaart');
      return { res: N.P.reserveringen, N: N.opzij, afsprRes: Math.round(SET.salVerdeling.reserveringen || 0), vs: (k.querySelector('[data-salvopzijverschil]') || {}).innerText || '', m2: (document.querySelector('[data-m2volgopzij]') || { dataset: {} }).dataset.m2volgopzij }; });
    expect(r.res, 'invoer: de komende periode rekent reserveringen toe').toBeGreaterThan(0); expect(r.afsprRes).toBe(0);
    expect(r.vs).toMatch(new RegExp('reserveringen €' + r.res.toLocaleString('nl-NL').replace('.', '\\.') + ' in deze periode'));
    /* en juist hier scheiden salaris − som en het voorstel: de Terugblik toont het voorstel (sabotage a leest salaris − som) */
    const m2 = await page.evaluate(() => { gripKiesTab('terugblik'); const e = document.querySelector('[data-m2volgopzij]'); return { attr: +e.dataset.m2volgopzij, t: e.innerText }; });
    expect(m2.attr).toBe(r.N); expect(num(m2.t.replace(/^.*opzij/, ''))).toBe(r.N);
  });

  test('b. de opzij op de verdelingkaart draagt zijn venster, en het spaardoel zijn eenheid', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { renderMaand(); gripKiesTab('terugblik'); const e = document.querySelector('[data-m2opzij]');
      return { t: e.innerText, venster: e.dataset.m2opzijvenster, start: salMoment2().PV.start, eind: salMoment2().PV.eind, spaardoel: (document.querySelector('[data-spaarnetto]') || { closest: () => null }).closest('[data-terugitem], .row, div') ? document.querySelector('#gripInhoud').innerText : '' }; });
    expect(r.venster).toBe(`${r.start}|${r.eind}`);
    expect(r.t).toMatch(/^Opzij 24 okt – 23 nov: gestort €[\d.]+ · eruit €[\d.]+ · netto €/);
    expect(r.spaardoel).toMatch(/Spaardoel .*(nov 1–23|24 nov|kalendermaand|okt)/);   // het spaardoel noemt zijn eenheid (periode-label of "(kalendermaand)")
  });

  test('c. een eenmalig deel dat al naar opzij ging: "lijkt al verdeeld · klopt / niet", en pas na klopt is de keuze weg', async ({ page }) => {
    await S.boot(page, { eenmalig: true });
    const r = await page.evaluate(() => {
      const L = salSplitStortingen(45).filter(x => x.eenmalig >= SALSPLIT_MELD_MIN && String(x.datum).slice(0, 7) === thisYM());
      const EV = L.length ? eenmaligAlVerdeeld(L[0]) : null; const C = gripCyclus();
      const k = C.kies.find(x => String(x.id).startsWith('inkomen:eenmalig:'));
      return { n: L.length, een: L.length ? L[0].eenmalig : null, EV, kies: k ? { naam: k.naam, reden: k.reden, act: k.act } : null };
    });
    expect(r.n, 'invoer: een storting met een eenmalig deel in deze maand').toBe(1); expect(r.een).toBe(2190);
    expect(r.EV.naar).toBeGreaterThanOrEqual(r.EV.afspraak + 2190); expect(r.EV.dekt).toBe('heel');
    expect(r.kies.naam).toBe('Eenmalig €2.190 lijkt al verdeeld');
    expect(r.kies.reden).toMatch(/€[\d.]+ naar je spaarrekening sinds 24 nov \(je afspraak €3\.000\) · klopt \/ niet/);
    expect(r.kies.act).toMatch(/^openEenmaligVerdeeld\(/); expect(r.kies.naam).not.toMatch(/verdelen$/);
    /* de sheet: niets voorgekozen; "klopt" haalt de keuze weg, en dat is de enige schrijver */
    await page.evaluate((a) => { eval(a); }, r.kies.act);
    await expect(page.locator('#eenmaligVerdeeld')).toHaveAttribute('data-dekt', 'heel');
    expect(await page.locator('#eenmaligVerdeeld [data-eenmaligklopt], #eenmaligVerdeeld [data-eenmaligniet]').count()).toBe(2);
    expect(await page.locator('#eenmaligVerdeeld .btn:not(.sec)').count(), 'niets voorgeselecteerd').toBe(0);
    expect(await page.evaluate(() => !!(SET.eenmaligVerdeeld && Object.keys(SET.eenmaligVerdeeld).length))).toBe(false);
    await page.locator('#eenmaligVerdeeld [data-eenmaligklopt]').click();
    const na = await page.evaluate(() => ({ weg: !gripCyclus().kies.some(x => String(x.id).startsWith('inkomen:eenmalig:')), opgeslagen: Object.values(SET.eenmaligVerdeeld || {}).map(x => x.klopt) }));
    expect(na.weg).toBe(true); expect(na.opgeslagen).toEqual([true]);
  });

  test('d. Health Club → SportCity: alleen het verschil telt', async ({ page }) => {
    await S.boot(page, { vast: true });
    const voor = await page.evaluate(() => { const G = vastGestegenData(); const sp = G.posten.find(p => /sportcity/i.test(p.naam)), hc = vastGestoptePosten(sp && sp.key).find(p => /sportschool oost/i.test(p.naam));
      const k = gripCyclus().kies.find(x => x.id === 'vastpost:' + (sp || {}).key); return { sp: sp && { status: sp.status, verschil: sp.verschil, mN: sp.mN }, hc: hc && { status: hc.status, maand: hc.maand }, kies: k ? k.naam : null, key: sp && sp.key, hcKey: hc && hc.key }; });
    expect(voor.sp).toEqual({ status: 'nieuw', verschil: 80, mN: 80 });
    /* de oude post is al maanden stil en staat daarom niet meer in vastGestegenData (v413: oud), wel in de gestopte posten */
    expect(voor.hc).toEqual({ status: 'verlopen', maand: 40 });
    expect(voor.kies).toMatch(/^Sportcity: nieuw \+€80 · accepteren of nakijken$/i);
    /* de sheet: de optie "vervangt een gestopte post" met Health Club als chip; niets voorgekozen; Vastleggen pas na de keuze */
    await page.evaluate((k) => openVastPostKeuze(k), voor.key);
    await expect(page.locator('#vastPostKeuze [data-vpkoptie="vervangt"]')).toBeVisible();
    expect(await page.locator('#vastPostKeuze [data-vpkbevestig]').isDisabled()).toBe(true);
    await page.locator('#vastPostKeuze [data-vpkoptie="vervangt"]').click();
    expect(await page.locator('#vastPostKeuze [data-vpkbevestig]').isDisabled()).toBe(true);
    await expect(page.locator(`#vastPostKeuze [data-vpkvankeuze="${voor.hcKey}"]`)).toHaveText('Sportschool Oost · €40/mnd');
    expect(await page.locator('#vastPostKeuze [data-vpkvankeuze].on').count(), 'niets voorgekozen').toBe(0);
    await page.locator(`#vastPostKeuze [data-vpkvankeuze="${voor.hcKey}"]`).click();
    await expect(page.locator('#vastPostKeuze [data-vpkverschil]')).toHaveAttribute('data-vpkverschil', '40');
    await expect(page.locator('#vastPostKeuze [data-vpkgevolg]')).toContainText(/Sportschool Oost → SportCity · verschil \+€40\/mnd/i);
    await page.locator('#vastPostKeuze [data-vpkbevestig]').click();
    const na = await page.evaluate(() => { const G = vastGestegenData(); const sp = G.posten.find(p => /sportcity/i.test(p.naam)), hc = G.posten.find(p => /sportschool oost/i.test(p.naam) && p.status === 'gestopt');
      const k = gripCyclus().kies.find(x => x.id === 'vastpost:' + sp.key); return { sp: { status: sp.status, naam: sp.naam, verschil: sp.verschil, mV: sp.mV, mN: sp.mN }, hcApart: !!hc, kies: k ? k.naam : null, vv: SET.vastVervangt, stijging: G.stijging, totVoor: G.totVoor, totNa: G.totNa }; });
    expect(na.sp).toEqual({ status: 'vervangt', naam: expect.stringMatching(/^Sportschool Oost → SportCity$/i), verschil: 40, mV: 40, mN: 80 });
    expect(na.hcApart, 'de oude post staat niet meer apart als gestopt').toBe(false);
    expect(na.kies).toMatch(/^Sportschool Oost → SportCity · verschil \+€40\/mnd · accepteren of nakijken$/i);
    expect(Object.values(na.vv)[0].van).toBe(voor.hcKey);
    expect(na.totNa - na.totVoor).toBe(na.stijging);   // de sommen blijven sluiten: de oude post telt via mV van de vervangt-rij
  });

  test('e. stilstaand geld is netto: spaarsaldo − noodfonds − doelen − reserveringen', async ({ page }) => {
    await S.boot(page, { debt: true });
    const r = await page.evaluate(() => ({ D: stilstaandDelen(), sig: mentalAccountingSignal(), schuld: duursteSchuld() && duursteSchuld().rente }));
    expect(r.schuld, 'invoer: een schuld met rente boven de drempel').toBe(10.5);
    expect(r.D.saldo).toBe(4000); expect(r.D.nf).toBe(4000); expect(r.D.stil).toBeLessThanOrEqual(0);
    expect(r.sig, 'alles heeft een bestemming: geen signaal').toBe(null);
    /* met €2.000 boven de bestemmingen vuurt hij wel, en noemt de som */
    await S.boot(page, { debt: true, spaarSaldo: 6000 });
    const r2 = await page.evaluate(() => { const ma = mentalAccountingSignal(); const n = scoreNotifs({ negeerSnooze: true }).find(x => String(x.key).startsWith('rente-')); return { stil: stilstaandDelen().stil, surplus: ma && ma.surplus, l1: n && n.l1, l2: n && n.l2 }; });
    expect(r2.stil).toBe(2000); expect(r2.surplus).toBe(2000);
    expect(r2.l1).toMatch(/^€2\.000 staat stil terwijl Auto Lease 10\.5% rente kost\./);
    expect(r2.l2).toMatch(/^spaarsaldo €6\.000 − noodfonds €4\.000 − doelen €0 − reserveringen €0 · /);
  });

  test('f. de voorwaarden voor beleggen zijn een keuze per bezitting: nee geeft geen signaal, geen keuze een vraag, ja het signaal', async ({ page }) => {
    const meet = () => page.evaluate(() => ({ mist: belegVoorwaardenNietGehaald().length, inleg: bezitInleg('saxo', thisYM()), pat: gripPatronen().some(p => p.id === 'beleggen'), bv: belegVragen().map(v => v.asset.id), vraag: gegevensVragen().filter(q => q.soort === 'belegvw').map(q => q.asset.id), opzij: vermogensInleg(thisYM()).delen.find(d => d.key === 'bel').bedrag }));
    await S.boot(page, { saxo: false, set4: { bufferNorm: 12 } });   // buffernorm 12: de buffer (ruim 10 maanden) haalt hem niet, dus er is een meetbaar niet-gehaalde voorwaarde
    const nee = await meet();
    expect(nee.mist, 'invoer: minstens een voorwaarde is niet gehaald').toBeGreaterThan(0); expect(nee.inleg).toBe(100);
    expect(nee.pat).toBe(false); expect(nee.bv).toEqual([]); expect(nee.vraag).toEqual([]);
    expect(nee.opzij).toBe(100);   // de inleg telt als opzij (vermogensinleg), ook zonder voorwaarden
    await S.boot(page, { saxo: null, set4: { bufferNorm: 12 } });
    const geen = await meet();
    expect(geen.pat).toBe(false); expect(geen.bv).toEqual([]); expect(geen.vraag).toEqual(['saxo']);
    await page.evaluate(() => openGegevensVragen('alle'));
    await expect(page.locator('#sheet [data-gegevensvraag="belegvw"]')).toContainText('Gelden de voorwaarden voor beleggen voor Saxo Belegging?');
    expect(await page.locator('#sheet [data-gegevensvraag="belegvw"] .btn.sec').count()).toBe(2);
    await S.boot(page, { saxo: true, set4: { bufferNorm: 12 } });
    const ja = await meet();
    expect(ja.pat).toBe(true); expect(ja.bv).toEqual(['saxo']); expect(ja.vraag).toEqual([]);
  });

  test('g. de labels in de era: deze periode, n van de laatste 3 bij naam, één reeksformaat, Ne keer, één titel', async ({ page }) => {
    await S.boot(page, { saxo: true, set4: { bufferNorm: 12 } });
    const r = await page.evaluate(() => {
      renderMaand(); gripKiesTab('begrijpen');
      const kop = document.querySelector('[data-vragenmaand]').innerText;
      const PB = potBovenLijst(); const L = gripLetOpItems(maandStructureel(), [], []).filter(x => x.soort === 'boven');
      const V = maandVooruit(); const sym = gripCyclus().sym;
      const pot = sym.find(s => s.k && !s.p) || sym.find(s => s.k), bel = sym.find(s => s.p && s.p.soort === 'beleggen');
      const M = s => s ? gripSymMaanden(s, V) : null;
      return { era: eraActief(), kop, boven: L.map(x => x.naam), pb: PB.map(x => ({ n: x.n, labels: x.labels || null, ms: x.ms })), potM: M(pot), belM: M(bel), potT: pot ? gripSymMaandTekst(pot, V) : null, belT: bel ? gripSymMaandTekst(bel, V) : null };
    });
    expect(r.era, 'invoer: het huidige venster is een salarisperiode').toBe(true);
    expect(r.kop).toMatch(/\d van \d gesteld deze periode$/);
    expect(r.pb.length, 'invoer: een potje dat vaker boven budget eindigde').toBeGreaterThan(0);
    for (const n of r.boven) { expect(n).toMatch(/ · \d van de laatste \d \([^)]+\) boven budget$/); expect(n).not.toMatch(/periodes|mnd/); }
    expect(r.belM, 'invoer: het beleggen-symptoom draagt een reeks').not.toBe(null); expect(r.potM).not.toBe(null);
    expect(r.belM.labels).toEqual(r.potM.labels);   // één reeksformaat: dezelfde eenheden met dezelfde labels, voor potje en beleggen
    expect(r.belT.includes(' | ')).toBe(r.potT.includes(' | '));
    expect(r.belT).toMatch(/nov 1–23 €/);
    const bron = await kaalUit(page, 'gripPatroonInfo', 'insPatronen');
    expect(bron).toContain('e keer'); expect(bron).not.toMatch(/e maand`/);
  });

  test('g2. Wacht op oorzaak: één titel (het symptoom), de keuze als onderregel zonder de naam ervoor', async ({ page }) => {
    /* de stand van grip-kring (v391): een keuze bij de betaalrekening wacht op een oorzaak */
    await K.boot(page, { opnames: [['2026-10-06', 300], ['2026-10-09', 400]] }); await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); });
    const W = await page.evaluate(() => { const C = gripCyclus(); return [...document.querySelectorAll('#gripWachtOorzaak [data-wachtoorzaak]')].map(e => { const w = C.kies.find(x => x.wacht && x.sym === e.dataset.wachtoorzaak), sy = C.sym.find(x => x.id === e.dataset.wachtoorzaak); return { titel: e.querySelector('[data-wachttitel]').innerText, tekst: e.innerText, naam: w ? w.naam : null, sym: e.dataset.wachtoorzaak, symNaam: sy ? sy.naam : null }; }); });
    expect(W.length, 'invoer: een keuze wacht op een oorzaak').toBeGreaterThan(0);
    for (const w of W) {
      expect(w.tekst.split('\n').map(l => l.trim()).filter(l => l && l !== '?')[0]).toBe(w.titel);   // de titel is de eerste regel (na het nummerbolletje "?")
      expect(w.tekst.indexOf(w.titel)).toBe(w.tekst.lastIndexOf(w.titel));              // en staat er een keer
      expect(w.tekst).toMatch(/oorzaak nog niet bepaald/);
      expect(w.titel, 'de titel is het symptoom, niet de keuze').toBe(w.symNaam);
      if (w.naam) expect(w.tekst).not.toContain(w.naam.includes(': ') ? w.naam : '\u0000');   // de keuzenaam met "<symptoom>: " ervoor staat er niet nog eens
    }
  });

  test('h. na "gezien" is de verdelingkaart één regel, en pas twee salarissen op rij met > €100 afwijking geven een keuze', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { go('maand'); gripKiesTab('terugblik'); });
    await expect(page.locator('[data-salmoment2] [data-m2gezienknop]')).toBeVisible();
    const voor = await page.evaluate(() => { const k = document.querySelector('[data-salmoment2]'); return { gezien: k.hasAttribute('data-m2gezien'), rek: k.querySelectorAll('[data-m2rek]').length, h: k.getBoundingClientRect().height, knop: !!k.querySelector('[data-m2gezienknop]') }; });
    expect(voor.gezien).toBe(false); expect(voor.rek).toBe(2); expect(voor.knop).toBe(true);
    await page.locator('[data-salmoment2] [data-m2gezienknop]').click();
    const na = await page.evaluate(() => { const k = document.querySelector('[data-salmoment2]'); return { gezien: k.hasAttribute('data-m2gezien'), rek: k.querySelectorAll('[data-m2rek]').length, h: k.getBoundingClientRect().height, t: k.innerText, G: SET.salM2Gezien }; });
    expect(na.gezien).toBe(true); expect(na.rek).toBe(0); expect(na.h).toBeLessThan(voor.h / 3);
    expect(na.t).toMatch(/^Heeft je salarisverdeling gewerkt\?\s*gezien 26 nov ›/i);   // de kop staat in kapitalen (CSS)
    expect(Object.keys(na.G)).toEqual(['2026-10']); expect(Object.keys(na.G['2026-10'].afw).length).toBe(2);
    /* een tik klapt hem open, in het geheugen */
    await page.locator('[data-salmoment2]').click();
    expect(await page.evaluate(() => document.querySelectorAll('[data-salmoment2] [data-m2rek]').length)).toBe(2);
    /* Kiezen: twee geziene periodes op rij met meer dan €100 afwijking; niet bij één, niet met een gat */
    const kies = await page.evaluate((MAIN) => { const t = G => { SET.salM2Gezien = G; save(); return gripCyclus().kies.some(x => x.id === 'salm2:herzien'); };
      const g = (afw) => ({ op: '2026-11-26', afw: { [MAIN]: afw } });
      return { een: t({ '2026-10': g(300) }), rij: t({ '2026-09': g(-150), '2026-10': g(300) }), klein: t({ '2026-09': g(50), '2026-10': g(300) }), gat: t({ '2026-08': g(300), '2026-10': g(300) }) }; }, S.MAIN);
    expect(kies).toEqual({ een: false, rij: true, klein: false, gat: false });
  });
});
