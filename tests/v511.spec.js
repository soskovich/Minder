/* v511: spoed uit de generale repetitie (Bekijk als 23, 24 en 26 nov, salaris aan, data t/m 4 nov). De rode draad: hetzelfde gegeven
   gaf per bekeken dag een ander getal. Elke test draait daarom op 23, 24 en 26 nov en eist hetzelfde getal.
   Fixture: periode-stand op 4 nov (Salarisrekening MAIN met het salaris van EUR 5.216 op de 24e, Betaalrekening BET met Hiltermann op
   de 12e, Leefgeld LEEF, de woning via Tikkie "na mijn salaris", een potje Contant). GECONSTRUEERD, niet gemeten: de bedragen van het
   toestel staan alleen daar. */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const { MAIN, SPAAR, LEEF, BET } = S;
const DAGEN = ['2026-11-23', '2026-11-24', '2026-11-26'];

const boot = page => S.boot(page, '2026-11-04');
const bekijk = (page, d) => page.evaluate(d => { if (window._voorbeeld) voorbeeldStop(); voorbeeldStart(d); voorbeeldSalarisZet(true); }, d);
const add = (page, rij) => page.evaluate(rij => { for (const [acc, d, a, n, ds, cat] of rij) { const t = { id: 'v511' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; }
  TX.sort((x, y) => x.date.localeCompare(y.date)); save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {} }, rij);

// a. EEN STAND "OVER OP 23 NOV": de stand op een dag hangt niet af van de dag waarop je kijkt.
test('v511 a: "over op 23 nov" is op 23, 24 en 26 nov hetzelfde bedrag', async ({ page }) => {
  await boot(page);
  const uit = [];
  for (const d of DAGEN) { await bekijk(page, d);
    uit.push(await page.evaluate(() => { const W = watOverPeriode(); return { ok: W.ok, eind: W.PV && W.PV.eind, cent: Math.round(W.over * 100), rijen: W.rijen.map(x => x.acc + ':' + x.eind) }; })); }
  expect(uit[0].eind, 'de stand gaat over de dag voor het salaris').toBe('2026-11-23');
  for (const u of uit) { expect(u.cent).toBe(uit[0].cent); expect(u.rijen).toEqual(uit[0].rijen); }
  /* invoer: tussen 4 en 23 nov valt er een vaste termijn (Hiltermann 12 nov), anders kan de stand per constructie niet verschillen */
  const vt = await page.evaluate(() => (voorbeeldVasteTermijnen() || []).some(x => x.data.some(d => d > '2026-11-04' && d <= '2026-11-23')));
  expect(vt).toBe(true);
});

// b. EEN GEKOZEN BEDRAG BLIJFT HET GEKOZEN BEDRAG.
test('v511 b: "Op je salarisdag eerst €X opzij" toont het bedrag van het moment van kiezen', async ({ page }) => {
  await boot(page);
  const gekozen = await page.evaluate(() => { const C = gripCyclus(), s = C.sym.find(x => x.k && x.bron !== 'vast'); if (!s) return null;
    window._oorzaakKeuze = { [s.id]: 'salaris' }; oorzaakBevestig(s.id); oorzaakAfspraakZet(oorzaakSleutel(s), 'salaris');
    window._gripCyc = null; const C2 = gripCyclus(); const g = (C2.gekozenO || []).find(o => /Op je salarisdag eerst/.test(o.naam)); return g ? { naam: g.naam, k: s.k } : null; });
  expect(gekozen, 'invoer: een oorzaak "salaris" met een afspraak').not.toBeNull();
  /* de overschrijding groeit na het kiezen (EUR 200 erbij in hetzelfde potje): het live bedrag verschuift, de keuze niet */
  await add(page, [[LEEF, '2026-11-03', -200, 'Extra Uitgave', 'BEA EXTRA', gekozen.k]]);
  const live = await page.evaluate(() => { window._gripCyc = null; const C = gripCyclus(); const g = (C.gekozenO || []).find(o => /Op je salarisdag eerst/.test(o.naam)); return g ? { naam: g.naam, live: g.naamLive } : null; });
  expect(live.live, 'invoer: het live herberekende bedrag is anders').not.toBe(gekozen.naam);
  expect(live.naam).toBe(gekozen.naam);
  for (const d of DAGEN) { await bekijk(page, d);
    const r = await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); const el = [...document.querySelectorAll('#gripAlGekozen [data-kiesgekozen]')].find(e => /salarisdag/.test(e.innerText)); const n = el && el.querySelector('span[style*="font-weight:700"]'); return n ? n.innerText.trim() : null; });
    expect(r, d).toBe(gekozen.naam); }
});

// c. DE BONUS IS AL VERDEELD: het venster loopt van de binnenkomst tot vandaag, over de overgangsmaand en de nieuwe periode heen.
test('v511 c: bonus EUR 2.190 van 26 okt met ruim opzij erna "lijkt al verdeeld" op 4, 23, 24 en 26 nov', async ({ page }) => {
  await boot(page);
  await add(page, [[MAIN, '2026-10-26', 2190, 'SKF', 'BONUS SKF 2026', 'inkomen'], [MAIN, '2026-10-27', -4000, 'Eigen overboeking', 'OVERBOEKING NAAR SPAARREKENING', 'intern'], [SPAAR, '2026-10-27', 4000, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern']]);
  await page.evaluate(() => { const t = TX.find(x => x.name === 'SKF' && x.amount === 2190); SET.onregelmatig = Object.assign({}, SET.onregelmatig, { [t.id]: 2190 }); save(); runMemoVergeten(); render(); });
  const kaart = () => page.evaluate(() => { const div = document.createElement('div'); div.innerHTML = onregKaart(); const c = div.querySelector('[data-onreg]');
    return c ? { verdeeld: c.hasAttribute('data-onregverdeeld'), velden: c.querySelectorAll('[data-onregveld]').length, tekst: c.innerText.replace(/\s+/g, ' ') } : null; });
  const r4 = await kaart();
  expect(r4.verdeeld, '4 nov').toBe(true); expect(r4.velden).toBe(0); expect(r4.tekst).toContain('lijkt al verdeeld');
  for (const d of DAGEN) { await bekijk(page, d); const r = await kaart();
    expect(r, d).not.toBeNull(); expect(r.verdeeld, d).toBe(true); expect(r.velden, d).toBe(0); }
  /* op 26 nov telt het venster twee salarissen, dus twee keer de afspraak */
  const EV = await page.evaluate(() => { const t = TX.find(x => x.name === 'SKF' && x.amount === 2190); return eenmaligAlVerdeeld({ datum: t.date, eenmalig: 2190 }); });
  expect(EV.perioden).toBe(2); expect(EV.afspraak).toBe(EV.afspraak1 * 2);
});

// d. EEN AFGESLOTEN MAAND HEEFT EEN OORDEEL.
test('v511 d: oktober heeft op 23, 24 en 26 nov hetzelfde oordeel en dezelfde lat', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { SET.gripOpzij = Object.assign({}, SET.gripOpzij, { '2026-10': { opzij: 2554 } }); save(); runMemoVergeten(); });
  const okt = () => page.evaluate(() => { const P0 = eraEenheidNu(); let T;
    if (P0) { const u = periodeHistorie(P0, 12).find(x => x.ym === '2026-10' && x.soort === 'maand'); T = gripTerugblik('2026-10', u); } else T = gripTerugblik('2026-10');
    const x = T.items.find(i => i.id === 'spaardoel'); return { s: x.s, sub: x.sub }; });
  const uit = [];
  for (const d of DAGEN) { await bekijk(page, d); uit.push(await okt()); }
  expect(uit[0].sub, 'de lat van oktober is Plan opzij van oktober').toContain('van €2.554');
  for (const u of uit) expect(u).toEqual(uit[0]);
  /* afgesloten: het oordeel komt uit de afsluiting, ook als je verdeling daarna verandert */
  await page.evaluate(() => { voorbeeldStop(); maandAfsluiten('2026-10', true); SET.gripOpzij['2026-10'] = { opzij: 999 }; SET.salVerdeling.opzij = 100; save(); runMemoVergeten(); });
  for (const d of DAGEN) { await bekijk(page, d); expect(await okt(), d).toEqual(uit[0]); }
});

// e. SALARISDATUM OVERAL DE 24E (24 okt 2026 is een zaterdag, dus de werkelijke storting was 26 okt).
test('v511 e: het moment in Kiezen en "je salaris op" lezen de periodestart, niet de laatste storting', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const t = TX.find(x => x.date === '2026-10-24' && x.amount === 5216); t.date = '2026-10-26'; categorize(t); save(); runMemoVergeten(); });
  const lees = () => page.evaluate(() => { let inc = null; try { inc = maandVerloop().incDag; } catch (_) {} return { moment: gripMomentTekst(), inc, volgende: salVolgendeDatum(rekDag(vandaagYMD(), 1)) }; });
  const r4 = await lees();
  expect(r4.moment).toBe('bij salaris (24 nov)'); expect(r4.inc).toBe('2026-11-24');
  await bekijk(page, '2026-11-23'); const r23 = await lees();
  expect(r23.moment).toBe('bij salaris (24 nov)'); expect(r23.inc).toBe('2026-11-24');
  await bekijk(page, '2026-11-24'); const r24 = await lees();
  expect(r24.moment).toBe('bij salaris (24 nov)');
  expect(r24.volgende, 'de volgende salarisdatum na 24 nov: 24 dec').toBe('2026-12-24');
});

// f. CONTANT: WAAR HET BEDRAG OP STAAT, EN NIETS DUBBEL.
test('v511 f: het gemeten contant is het gemiddelde van aug–okt × 30 / dagen, en een opname telt een keer', async ({ page }) => {
  await boot(page);
  await add(page, [[LEEF, '2026-08-10', -400, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT', null], [LEEF, '2026-09-10', -600, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT', null], [LEEF, '2026-10-10', -760, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT', null]]);
  const r = await page.evaluate(() => { const G = contantGemiddeld30(); const per = ['2026-08', '2026-09', '2026-10'].map(m => contantUitgegevenMaand(m).uitgegeven);
    const div = document.createElement('div'); div.innerHTML = potSoortLijst(); const b = div.querySelector('[data-contantbron]');
    return { G, per, bron: b && b.innerText }; });
  /* invoer: de fixture pint al EUR 100 in aug en sep; met de opnames hierboven is het aug EUR 500 · sep EUR 700 · okt EUR 760 (de meting van het toestel) */
  expect(r.per, 'invoer: wat er contant uitging per maand').toEqual([500, 700, 760]);
  expect(r.G.per30).toBe(Math.round((500 + 700 + 760) / (31 + 30 + 31) * 30));
  expect(r.G.per30).toBe(639);
  expect(r.G.label).toBe('aug–okt');
  expect(r.bron).toContain('gemeten gemiddeld aug–okt €653, omgerekend naar 30 dagen €639');
  /* een opname telt een keer: zonder de opname daalt het totaal uitgegeven van oktober met precies zijn bedrag, in het potje Contant, en de
     andere potjes niet (contant is zelf een potje, v447) */
  const d = await page.evaluate(() => { const met = uitgegevenStand({ m: '2026-10' }); const t = TX.find(x => x.date === '2026-10-10' && x.amount === -760); const i = TX.indexOf(t);
    TX.splice(i, 1); save(); runMemoVergeten(); const zonder = uitgegevenStand({ m: '2026-10' }); TX.splice(i, 0, t); save(); runMemoVergeten();
    return { tot: Math.round((met.totaal - zonder.totaal) * 100), pot: Math.round(((met.cent.potjes - ((met.per || {}).contant || 0)) - (zonder.cent.potjes - ((zonder.per || {}).contant || 0))) * 100), kas: Math.round((((met.per || {}).contant || 0) - ((zonder.per || {}).contant || 0)) * 100) }; });
  expect(d.tot).toBe(76000); expect(d.kas).toBe(76000); expect(d.pot).toBe(0);
});

// g. EEN VERWACHTE VASTE LAST TELT NIET OOK IN EEN POTJE.
test('v511 g: de CJIB-termijn telt in vast, niet in Belasting & boetes, en geeft geen signaal', async ({ page }) => {
  await boot(page);
  await page.evaluate(({ BET }) => { SET.vastVerwacht = [{ id: 'vv1', naam: 'Boetes cjib', bedrag: 50, ritme: 1, eerste: '2026-11-26', cat: 'belasting', acc: BET, schatting: true }];
    SET.budgets = Object.assign({}, SET.budgets, { belasting: 20 }); save(); runMemoVergeten(); }, { BET });
  await bekijk(page, '2026-11-26');
  const r = await page.evaluate(() => { const t = TX.find(x => x.src === 'voorbeeld' && /cjib/i.test(x.name));
    return { t: !!t, fixed: t && isFixed(t), pot: catSpendMap(thisYM()).belasting || 0, sig: valtOpSignals().map(s => s.potjeId), sym: gripCyclus().sym.filter(s => s.k === 'belasting').map(s => s.naam), vraag: gegevensVragen().filter(q => q.soort === 'vastverw').length }; });
  expect(r.t, 'invoer: de termijn van 26 nov staat er').toBe(true);
  expect(r.fixed).toBe(true); expect(r.pot).toBe(0); expect(r.sig).not.toContain('belasting'); expect(r.sym).toEqual([]);
  expect(r.vraag, 'een gesimuleerde termijn is geen vraag').toBe(0);
  /* een echte, gekoppelde afschrijving telt ook als vaste last */
  await page.evaluate(() => voorbeeldStop());
  await add(page, [[BET, '2026-11-03', -50, 'CJIB', 'SEPA CJIB BOETES 123', 'belasting']]);
  const g = await page.evaluate(() => { const t = TX.find(x => x.name === 'CJIB' && x.date === '2026-11-03'); SET.vastVerwacht[0].koppel = { tx: t.id, key: recurKey(t), datum: t.date, bedrag: 50, op: vandaagYMD() }; save(); runMemoVergeten();
    return { fixed: isFixed(t), pot: catSpendMap('2026-11').belasting || 0 }; });
  expect(g.fixed).toBe(true); expect(g.pot).toBe(0);
});

// h. NOVEMBER (1–23): EEN BRON, GEEN BUDGETOORDEEL.
test('v511 h: afsluitkaart en tabel tonen dezelfde getallen voor november (1–23); geen budgettegel', async ({ page }) => {
  await boot(page);
  await add(page, [[LEEF, '2026-11-02', -63, 'Albert Heijn', 'BEA ALBERT HEIJN', 'boodschappen']]);
  for (const d of ['2026-11-24', '2026-11-26']) { await bekijk(page, d);
    const r = await page.evaluate(() => { const H = verhoudingSalarisData(), rij = H.R.find(x => x.U && x.U.korteMaand), A = afsluitUitgegeven('2026-11');
      return { rij: rij && { uit: rij.uit, vast: rij.vast, potjes: rij.potjes }, A: A && { cent: A.cent, r: A.r }, tegels: afsluitTegels('2026-11').map(t => [t.key, t.waarde, t.maat]) }; });
    expect(r.rij, d + ': de rij van november (1–23)').not.toBeNull();
    expect(r.rij.uit).toEqual(r.A.cent);
    expect(r.rij.vast).toBe(r.A.r.vast); expect(r.rij.potjes).toBe(r.A.r.potjes + r.A.r.zonder);
    const tot = r.tegels.find(t => t[0] === 'totaal');
    expect(tot[2]).toBe('overgangsmaand · geen budget'); expect(tot[1]).not.toMatch(/−|-/);
    expect(r.tegels.some(t => /budget/.test(t[2]) && t[2] !== 'overgangsmaand · geen budget'), d).toBe(false); }
  const okt = await page.evaluate(() => afsluitTegels('2026-10').find(t => t.key === 'totaal'));
  expect(okt.waarde, 'onder budget zonder minteken').not.toMatch(/^−/);
});

// i. LEESBAARHEID OP DE SALARISDAG.
test('v511 i: geen interne sleutel als titel, de kasvraag noemt november (1–23), de tabel past met een naam per rij', async ({ page }) => {
  await boot(page);
  const titels = await page.evaluate(() => { const T = [{ soort: 'eenmterug', bedrag: 50, partij: 'Kiosk', datum: '2026-08-16' }, { soort: 'vastverw', bedrag: 50, x: { naam: 'Boetes cjib' }, datum: '2026-11-26' },
    { soort: 'eigenrek', bedrag: 100, datum: '2026-10-01' }, { soort: 'belegvw', asset: { naam: 'Saxo' } }, { soort: 'onbekendesoort', bedrag: 12 }];
    return T.concat(gegevensVragen()).map(q => [q.soort, gegevensVraagKort(q)]); });
  for (const [s, t] of titels) { expect(t, s).not.toBe(s); expect(t.startsWith(s + ' ·'), s + ': ' + t).toBe(false); }
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    await bekijk(page, '2026-11-23');
    const k = await page.evaluate(() => { go('maand'); gripKiesTab('terugblik'); const c = document.getElementById('kasVraag'); if (!c) return null; const b = c.querySelector('[data-kasvraagzet]').getBoundingClientRect(), cr = c.getBoundingClientRect();
      return { label: c.querySelector('[data-kasvraaglabel]').innerText, binnen: b.right <= cr.right + 0.5 }; });
    expect(k, w + ': de kasvraag staat er').not.toBeNull();
    expect(k.label).toBe('einde van november (1–23)'); expect(k.binnen, w).toBe(true);
    for (const d of ['2026-11-24', '2026-11-26']) { await bekijk(page, d);
      const t = await page.evaluate(() => { go('maand'); gripKiesTab('terugblik'); const c = document.getElementById('gripVerhouding'); if (!c) return null; const tb = c.querySelector('table');
        return { breed: tb.getBoundingClientRect().right <= c.getBoundingClientRect().right + 0.5, sw: tb.scrollWidth, cw: tb.clientWidth, namen: [...tb.querySelectorAll('[data-verhoudingnaam]')].map(e => e.innerText.trim()), pagina: document.documentElement.scrollWidth <= window.innerWidth }; });
      expect(t, w + ' ' + d).not.toBeNull();
      expect(t.breed, w + ' ' + d).toBe(true); expect(t.sw).toBeLessThanOrEqual(t.cw + 1); expect(t.pagina).toBe(true);
      expect(t.namen.length).toBeGreaterThan(0); for (const n of t.namen) expect(n.length, w + ' ' + d).toBeGreaterThan(0); }
  }
});
