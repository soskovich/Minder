/* v500: ÉÉN SALARISVOORSTEL, GEEN OORDEEL ZONDER DEKKING, ÉÉN OPZIJ PER MAAND, EN DE DAGWISSEL.
   a. Op 26 nov geven Zien (de kaart "Je salarisverdeling"), de Terugblik ("Heeft je salarisverdeling gewerkt?") en de sheet hetzelfde
      voorstel per rekening tot op de euro, uit salVoorstelNu(); de Terugblik rekent geen eigen voorstel (sabotage: eigen berekening).
   b. De uitleg per rekening is een rekensom: nodig − saldo nu = erbij (of over), met "nodig" in de tekst (sabotage: zonder "nodig").
   c. Met gegevens t/m 24 okt en een periode tot 23 nov: "nog niet te beoordelen", geen "te ruim", het voorstel is je afspraak; met
      gegevens die de periode dekken een oordeel (sabotage: oordeel ongeacht dekking).
   d. Oktober: dezelfde opzij (netto, met gestort en eruit) in Afsluiten, Verhouding en Terugblik; de rest telt andere inkomsten en is
      niet negatief door de bonus (sabotage: rest zonder andere inkomsten).
   e. Een open app op 23 nov 23:59 die op 24 nov 00:01 zichtbaar wordt toont de nieuwe periode (sabotage: geen handler).
   f. In het voorbeeld verandert de dag niet door die handler (sabotage: handler ook in het voorbeeld).
   Fixture v500-stand.js (geconstrueerd, niet gemeten; de toestelgetallen staan alleen op het toestel). */
const { test, expect } = require('@playwright/test');
const S = require('./v500-stand');
const V489 = require('./v489-stand');
const { pinDatum } = require('./vaste-dag');
const num = s => { const m = String(s || '').replace(/\./g, '').match(/-?\d+/); return m ? +m[0] : NaN; };

test.describe('v500', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('a. Zien, Terugblik en de sheet geven hetzelfde voorstel per rekening, uit salVoorstelNu()', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => {
      const N = salVoorstelNu();
      renderMaand(); gripKiesTab('zien');
      const zien = Object.fromEntries([...document.querySelectorAll('#salVoorstelKaart [data-salvrij]')].map(e => [e.dataset.salvrij, +e.dataset.bedrag]));
      const zienOpzij = +document.getElementById('salVoorstelKaart').dataset.salvkaartopzij;   // v501 (punt 1): het ene opzij-getal van de kaart
      gripKiesTab('terugblik');
      const m2 = Object.fromEntries([...document.querySelectorAll('[data-m2rek]')].map(e => [e.dataset.m2rek, +e.querySelector('[data-m2voorstel]').dataset.m2voorstel]));
      const m2Opzij = +document.querySelector('[data-m2volgopzij]').dataset.m2volgopzij;
      const m2Tekst = document.querySelector('[data-salmoment2]').innerText;
      openSalVerdeling('salverdeling');
      const sheet = Object.fromEntries([...document.querySelectorAll('[data-salvrek]')].map(e => [e.dataset.salvrek, (e.querySelector('[data-salvbedrag]') || e).innerText]));
      const sheetOpzij = (document.querySelector('[data-salvopzij]') || {}).innerText; closeSheet();
      return { N: Object.fromEntries(N.rek.map(x => [x.acc, x.voorstel])), Nopzij: N.opzij, bron: N.rek.map(x => x.bron), zien, zienOpzij, m2, m2Opzij, m2Tekst, sheet, sheetOpzij };
    });
    const accs = Object.keys(r.N); expect(accs.length).toBe(2);
    expect(r.bron).toEqual(['voorstel', 'voorstel']);   // invoer: de periode is gedekt, dus het voorstel is het voorstel en niet de afspraak
    for (const a of accs) {
      expect(r.zien[a], 'Zien ' + a).toBe(r.N[a]);
      expect(r.m2[a], 'Terugblik ' + a).toBe(r.N[a]);
      expect(num(r.sheet[a]), 'sheet ' + a).toBe(r.N[a]);
    }
    expect(r.m2Opzij).toBe(r.Nopzij); expect(num(r.sheetOpzij)).toBe(r.Nopzij);
    expect(r.zienOpzij).toBe(r.Nopzij);   // v501: altijd, ook onder SALV_AFWIJK (de €14 van 26 nov bleef hierdoor onzichtbaar)
    expect(r.m2Tekst).toContain('hetzelfde als "Je salarisverdeling" op Zien');
    /* het voorstel wijkt af van de afspraak (1.200 / 850), anders is "hetzelfde voorstel" niet van "allebei de afspraak" te onderscheiden */
    expect(Object.values(r.N).some(v => v !== 1200 && v !== 850)).toBe(true);
  });

  test('b. de uitleg per rekening telt op: nodig − saldo nu = erbij', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => {
      renderMaand(); gripKiesTab('zien');
      const lees = e => ({ acc: e.dataset.rekuitleg, nodig: +e.dataset.nodig, saldo: +e.dataset.saldo, erbij: +e.dataset.erbij, afspraak: +e.dataset.afspraak, tekst: e.innerText });
      const zien = [...document.querySelectorAll('#salVoorstelKaart [data-rekuitleg]')].map(lees);
      gripKiesTab('terugblik');
      const m2 = [...document.querySelectorAll('[data-salmoment2] [data-rekuitleg]')].map(lees);
      return { zien, m2 };
    });
    expect(r.zien.length).toBeGreaterThan(0); expect(r.m2.length).toBe(r.zien.length);
    for (const L of [r.zien, r.m2]) for (const u of L) {
      expect(u.nodig - u.saldo, u.acc).toBe(u.erbij);
      expect(u.tekst).toMatch(/nodig tot \d+ \w+ €/);
      expect(u.tekst).toContain('− saldo nu');
      expect(u.tekst).toMatch(u.erbij >= 0 ? /= €[\d.]+ erbij/ : /= €[\d.]+ over/);
      expect(u.tekst).toContain('je afspraak €');
      expect(u.tekst).toContain('vaste lasten €'); expect(u.tekst).toContain('potjes €'); expect(u.tekst).toContain('buffer €');
    }
    /* Zien en Terugblik lezen dezelfde rekensom */
    expect(r.m2.map(u => [u.acc, u.nodig, u.saldo, u.erbij])).toEqual(r.zien.map(u => [u.acc, u.nodig, u.saldo, u.erbij]));
  });

  test('c. zonder dekking "nog niet te beoordelen" en het voorstel blijft je afspraak; met dekking een oordeel', async ({ page }) => {
    await S.boot(page, { gedekt: false });
    const lees = () => page.evaluate(() => {
      renderMaand(); gripKiesTab('zien');
      const dek = [...document.querySelectorAll('[data-salvdekking]')].map(e => ({ acc: e.dataset.salvdekking, tot: e.dataset.gedekttot, t: e.innerText }));
      const zien = Object.fromEntries([...document.querySelectorAll('#salVoorstelKaart [data-salvrij]')].map(e => [e.dataset.salvrij, +e.dataset.bedrag]));
      const imp = (document.querySelector('[data-salvoorstelimport]') || {}).innerText || null;
      gripKiesTab('terugblik');
      const m2 = [...document.querySelectorAll('[data-m2rek]')].map(e => ({ acc: e.dataset.m2rek, oordeel: e.dataset.m2oordeel, gedekt: e.dataset.m2gedekt, voorstel: +e.querySelector('[data-m2voorstel]').dataset.m2voorstel, bron: e.querySelector('[data-m2voorstel]').dataset.m2bron, t: e.innerText }));
      const tekst = document.querySelector('[data-salmoment2]').innerText;
      renderIns(); const noot = (document.querySelector('[data-saldoeindnoot]') || {}).innerText || null;
      const N = salVoorstelNu(); const afspraak = SET.salVerdeling.rek;
      return { dek, zien, imp, m2, tekst, noot, afspraak, laatste: laatsteImport().datum, PV: [N.PV.start, N.PV.eind] };
    });
    let r = await lees();
    expect(r.PV).toEqual(['2026-10-24', '2026-11-23']);
    expect(r.laatste < '2026-11-23').toBe(true);   // invoer: de gegevens dekken de periode niet
    expect(r.m2.length).toBe(2);
    for (const x of r.m2) {
      expect(x.oordeel).toBe('nog niet te beoordelen'); expect(x.gedekt).toBe('0'); expect(x.bron).toBe('afspraak');
      expect(x.voorstel).toBe(Math.round(r.afspraak[x.acc]));
      expect(x.t).toMatch(/gegevens t\/m \d+ okt/); expect(x.t).toContain('je afspraak');
    }
    expect(r.tekst).not.toContain('te ruim'); expect(r.tekst).not.toContain('te krap'); expect(r.tekst).not.toMatch(/\bpaste\b/);
    expect(r.dek.length).toBe(2);
    for (const d of r.dek) { expect(d.t).toContain('nog niet te beoordelen'); expect(d.t).toMatch(/gegevens t\/m \d+ okt/); expect(d.t).toContain('blijft'); expect(d.tot < '2026-11-23').toBe(true); }
    for (const a of Object.keys(r.afspraak)) expect(r.zien[a]).toBe(Math.round(r.afspraak[a]));
    expect(r.imp).toContain('uitgaven daarna ontbreken');
    expect(r.noot).toMatch(/vanaf je saldi van \d+ okt · uitgaven daarna ontbreken/);
    /* met gegevens die de periode dekken: een oordeel, een voorstel dat niet de afspraak is, geen noot */
    await S.boot(page);
    r = await lees();
    expect(r.laatste >= '2026-11-23').toBe(true);
    for (const x of r.m2) { expect(['paste', 'te ruim', 'te krap']).toContain(x.oordeel); expect(x.gedekt).toBe('1'); expect(x.bron).toBe('voorstel'); }
    expect(r.dek.length).toBe(0); expect(r.imp).toBeNull(); expect(r.noot).toBeNull();
  });

  test('d. oktober: dezelfde opzij in Afsluiten, Verhouding en Terugblik, en de rest telt de andere inkomsten', async ({ page }) => {
    await S.boot(page, { gedekt: false });
    const r = await page.evaluate(() => {
      renderMaand(); gripKiesTab('terugblik');
      const af = document.getElementById('gripTerugAfgesloten');
      const deel = k => { const e = af.querySelector(`[data-saldeel="${k}"]`); return e ? +e.dataset.salbedrag : null; };
      const sal = num => num; const kop = af.innerText;
      const salaris = +(kop.match(/€([\d.]+) salaris/) || [])[1].replace(/\./g, '');
      const opzijSub = (af.querySelector('[data-salopzijdelen]') || {}).innerText;
      const vh = document.querySelector('[data-verhoudingmaand="2026-10"] [data-verhoudingopzij]');
      const vhAndere = document.querySelector('[data-verhoudingmaand="2026-10"] [data-verhoudingandere]');
      const vhRest = document.querySelector('[data-verhoudingmaand="2026-10"] [data-verhoudingrest]');
      const sp = [...document.querySelectorAll('[data-terugrij="spaardoel"]')].find(e => /oktober/i.test(e.innerText));
      const spNetto = sp ? +sp.querySelector('[data-spaarnetto]').dataset.spaarnetto : null;
      const D = salarisData(2), rr = D.R.find(x => x.ym === '2026-10'), SB = salarisBalk(D, rr);
      const O = opzijEenheid(maandEenheid('2026-10'));
      return { af: kop, salaris, vast: deel('vast'), potjes: deel('potjes'), buiten: deel('buiten'), opzij: deel('opzij'), andere: deel('andere'), rest: deel('rest'), opzijSub,
        vh: vh ? +vh.dataset.verhoudingopzij : null, vhTitle: vh ? vh.getAttribute('title') : null, vhAndere: vhAndere ? vhAndere.innerText : null, vhRest: vhRest ? +vhRest.dataset.verhoudingrest : null,
        spTekst: sp ? sp.innerText : null, spNetto, O, SBrest: Math.round(SB.rest), savedNet: Math.round(savedNet('2026-10')) };
    });
    expect(r.af).toMatch(/^oktober/i);
    /* invoer: de bonus is er, en zonder hem zou de rest negatief zijn */
    expect(r.andere).toBe(2190);
    const zonder = r.salaris - r.vast - r.potjes - r.buiten - r.opzij;
    expect(zonder).toBeLessThan(0);
    expect(r.rest).toBe(r.salaris + r.andere - r.vast - r.potjes - r.buiten - r.opzij);
    expect(r.rest).toBeGreaterThan(0);
    /* een opzij, drie lezers: netto naar je spaarrekening (gestort − eruit) */
    expect(r.O.netto).toBe(r.O.erin - r.O.uit); expect(r.O.uit).toBeGreaterThan(0);
    expect(r.opzij).toBe(r.O.netto); expect(r.vh).toBe(r.O.netto); expect(r.spNetto).toBe(r.O.netto); expect(r.savedNet).toBe(r.O.netto);
    expect(r.opzijSub).toBe(`gestort €${r.O.erin.toLocaleString('nl-NL')} · eruit €${r.O.uit.toLocaleString('nl-NL')}`);
    expect(r.spTekst).toContain(`gestort €${r.O.erin.toLocaleString('nl-NL')} · eruit €${r.O.uit.toLocaleString('nl-NL')} · netto €${r.O.netto.toLocaleString('nl-NL')}`);
    expect(r.vhTitle || '').toContain(`${r.O.erin.toLocaleString('nl-NL')}`);
    expect(r.vhAndere).toContain('2.190');
    if (r.vhRest != null) expect(r.vhRest).toBe(r.rest);
    expect(r.af).toContain('rest = salaris + andere inkomsten');
  });

  test('e. een open app ziet de dagwissel: 23 nov 23:59 → 24 nov 00:01 toont de nieuwe periode', async ({ page }) => {
    await V489.boot(page, { dag: '2026-11-23', novSalaris: false });
    const laat = new Date(2026, 10, 23, 23, 59, 0); await page.clock.setFixedTime(laat);
    const voor = await page.evaluate(() => { go('ins'); render(); const m = document.getElementById('insMaand'); return { dag: window._renderDag, n: window._dagwisselN || 0, soort: m.dataset.insmaand, label: m.dataset.insperiode || m.innerText.slice(0, 60), vandaag: vandaagYMD() }; });
    expect(voor.dag).toBe('2026-11-23'); expect(voor.vandaag).toBe('2026-11-23'); expect(voor.n).toBe(0);
    /* dezelfde dag opnieuw zichtbaar: niets */
    const zelfde = await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); return { n: window._dagwisselN || 0, dag: window._renderDag }; });
    expect(zelfde.n).toBe(0); expect(zelfde.dag).toBe('2026-11-23');
    const nacht = new Date(2026, 10, 24, 0, 1, 0); await page.clock.setFixedTime(nacht);
    const na = await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); const m = document.getElementById('insMaand'); return { dag: window._renderDag, n: window._dagwisselN || 0, soort: m.dataset.insmaand, label: m.dataset.insperiode || '', vandaag: vandaagYMD(), zichtbaar: document.visibilityState }; });
    expect(na.zichtbaar).toBe('visible');
    expect(na.n).toBe(1); expect(na.dag).toBe('2026-11-24'); expect(na.vandaag).toBe('2026-11-24');
    expect(na.soort).toBe('periode'); expect(na.label).toContain('24 nov'); expect(na.label).not.toBe(voor.label);
    /* pageshow doet hetzelfde op de volgende wissel */
    await page.clock.setFixedTime(new Date(2026, 10, 25, 0, 1, 0));
    const ps = await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); return { n: window._dagwisselN, dag: window._renderDag }; });
    expect(ps.n).toBe(2); expect(ps.dag).toBe('2026-11-25');
  });

  test('f. in het voorbeeld verandert de dag niet door de handler', async ({ page }) => {
    await V489.boot(page, { dag: '2026-10-28' });
    const r0 = await page.evaluate(() => { voorbeeldStart('2026-11-26'); return { dag: window._renderDag, vd: window._voorbeeldDag, vandaag: vandaagYMD(), n: window._dagwisselN || 0, echt: ymdVan(new Date()) }; });
    expect(r0.vandaag).toBe('2026-11-26'); expect(r0.dag).toBe('2026-11-26'); expect(r0.echt).toBe('2026-10-28');
    await pinDatum(page, '2026-10-29');   // de wandklok gaat een dag verder
    const r = await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); const uit = dagwisselCheck(); return { uit, dag: window._renderDag, vd: window._voorbeeldDag, vandaag: vandaagYMD(), n: window._dagwisselN || 0, echt: ymdVan(new Date()), voorbeeld: !!window._voorbeeld }; });
    expect(r.echt).toBe('2026-10-29'); expect(r.voorbeeld).toBe(true);
    expect(r.uit).toBe(false); expect(r.n).toBe(0); expect(r.vd).toBe('2026-11-26'); expect(r.vandaag).toBe('2026-11-26'); expect(r.dag).toBe('2026-11-26');
    /* na voorbeeldStop pakt de handler de echte dag weer op */
    const s = await page.evaluate(() => { voorbeeldStop(); const voor = window._renderDag; return { voor, vandaag: vandaagYMD() }; });
    expect(s.vandaag).toBe('2026-10-29'); expect(s.voor).toBe('2026-10-29');
  });
});
