/* v527: DE MAANDKAART. Inzichten toont wat er is (drie tegels), Grip waar je op het einde van de periode uitkomt (de stand en de
   ondergrens). Op tests/v527-stand.js (GECONSTRUEERD naar de vorm van de melding van 27 nov: salaris op 25 nov, periode vanaf 24 nov).
   Elke test zegt in zijn comment wat hij toetst en toetst die bewering; de getallen van het toestel staan in tests/wip/v527-export.spec.js. */
const { test, expect } = require('./klok');
const S = require('./v527-stand');

const lees = (page) => page.evaluate(() => { window._rekV = null; try { runMemoVergeten(); } catch (_) {}
  const V = maandVooruit(), T = periodeTegelData(), St = periodeStandEind(), MB = gripMeterBudget(), P = periodeVan(vandaagYMD()), Sp = salPeriode();
  return { P: [P.start, P.eind], cur: Sp && Sp.cur ? Sp.cur.start : null, vast: V.vast, lijst: V.vastNogLijst.map((x) => ({ naam: x.naam, datum: x.datum, bedrag: x.bedrag })),
    vp: V.vastePotjes.map((x) => ({ k: x.k, bud: x.bud, uit: x.uit, vast: x.vast, eind: x.eind, geen: x.geen })), projectie: V.projectie, nog: Math.round(V.nogVerwacht),
    MBv: MB.verwacht, T: { potUit: T.potUit, potBud: T.potBud, tempo: T.tempo, tempoUit: T.tempoUit, tempoBud: T.tempoBud, el: T.el, dagen: T.dagen, vastBet: T.vastBet, vastNog: T.vastNog,
      dag: T.dagRij.map((x) => ({ k: x.k, bud: x.bud, uit: x.uit, d: x.d })), keer: T.keerRij.map((x) => x.k) },
    St: { start: St.start, saldo: St.saldo, vast: St.vastR, pot: St.potR, zonder: St.zonderR, nog: St.nogR, eind: St.eind, onder: St.onder, sal: St.sal,
      rijen: St.rijen.map((x) => ({ k: x.k, ruimte: x.ruimte, verwacht: x.verwacht })) } }; });

test('deel 0 a: de vooruitblik kent de vaste lasten die na vandaag en voor het einde van de periode vallen, ook als het salaris een dag na de periodestart binnenkwam', async ({ page }) => {
  /* toetst: met cur.start (25 nov) ongelijk aan de periodestart (24 nov) staan Allianz en Shurgard (2 dec), Hiltermann (12 dec) en SportCity (20 dec)
     in de verwachting, en de som is V.vast. Tot v527 viel elke termijn weg (rekVoorstel().vast is de volgende periode). */
  await S.boot(page);
  const r = await lees(page);
  expect(r.cur).toBe('2026-11-25');
  expect(r.P).toEqual(['2026-11-24', '2026-12-23']);
  const namen = r.lijst.map((x) => x.naam + ' ' + x.datum);
  expect(namen).toEqual(['Allianz 2026-12-02', 'Shurgard 2026-12-02', 'Hiltermann Lease 2026-12-12', 'SportCity 2026-12-20']);
  expect(r.vast).toBe(r.lijst.reduce((a, x) => a + x.bedrag, 0));
  expect(r.vast).toBe(99 + 71 + 537 + 40);
  // de Budget-tegel en de bridge lezen dezelfde verwachting
  expect(r.MBv).toBe(r.projectie);
});

test('deel 0 b: een vaste last waarvan de volgende termijn na het einde van de periode valt, telt niet mee in wat nog komt', async ({ page }) => {
  /* toetst: Spotify (betaald 26 nov, de volgende 26 dec) en DELA (per kwartaal, de volgende 30 dec) staan niet in de lijst; Spotify staat wel bij betaald */
  await S.boot(page);
  const r = await lees(page);
  expect(r.lijst.some((x) => /spotify|dela/i.test(x.naam))).toBe(false);
  const ab = r.vp.find((x) => x.k === 'abonnement');
  expect(ab.uit).toBe(11); expect(ab.vast).toBe(0);
});

test('deel 0 c: een vast potje zonder eigen betaling in de periode telt niet als verwachte uitgave, en een vaste last telt een keer', async ({ page }) => {
  /* toetst: Goede doelen (EUR 136, op vast, geen betaling) heeft eind 0 en zit niet in V.vast; het potje Huur draagt Nathaniel (betaald) en
     Shurgard (nog) een keer, niet zijn hele budget */
  await S.boot(page);
  const r = await lees(page);
  const gd = r.vp.find((x) => x.k === 'goededoel');
  expect(gd).toBeTruthy(); expect(gd.geen).toBe(true); expect(gd.eind).toBe(0); expect(gd.bud).toBe(136);
  const huur = r.vp.find((x) => x.k === 'huur');
  expect(huur.eind).toBe(huur.uit + 71);
  expect(huur.eind).toBeLessThan(huur.bud);
  // de som van de vaste lasten is betaald plus wat nog komt, zonder het budget van Goede doelen
  expect(r.vp.reduce((a, x) => a + x.eind, 0)).toBe(r.vp.reduce((a, x) => a + x.uit, 0) + r.vast);
});

test('B1 a: het tempo op Potjes gaat alleen over de potjes van elke dag en contant; een potje per keer telt mee in het totaal maar niet in het tempo', async ({ page }) => {
  /* toetst: tempo = (som perDag-budget + contant) x dag / dagen; een tankbeurt (Vervoer, per keer) verhoogt het totaal en laat tempoUit staan */
  await S.boot(page);
  const r0 = await lees(page);
  expect(r0.T.keer).toContain('vervoer');
  expect(r0.T.dag.some((x) => x.k === 'vervoer')).toBe(false);
  expect(r0.T.tempo).toBe(Math.round(r0.T.tempoBud * r0.T.el / r0.T.dagen));
  expect(r0.T.tempoBud).toBe(r0.T.dag.reduce((a, x) => a + x.bud, 0));
  await page.evaluate(() => { const t = { id: 'v527tank', date: '2026-11-26', amount: -50, acc: 'NL00BETL0000000003', name: 'Shell', desc: 'BEA, BETAALPAS Shell Tango', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    t.acc = TX.find((x) => x.name === 'Hiltermann Lease').acc; categorize(t); TX.push(t); OVR[t.id] = 'vervoer'; save(); });
  const r1 = await lees(page);
  expect(r1.T.potUit).toBe(r0.T.potUit + 50);
  expect(r1.T.tempoUit).toBe(r0.T.tempoUit);
});

test('B1 b: Inzichten draagt drie tegels en geen verwacht saldo; elk uitgegeven-getal komt uit uitgegevenStand', async ({ page }) => {
  /* toetst: de tegels Potjes, Deze week en Vaste lasten staan er; "Verwacht saldo" en #insSaldoEind niet; het bedrag op Potjes is
     uitgegevenStand() over de periode t/m vandaag (de bron van het uitgegeven-blok); er is een link naar Grip */
  await S.boot(page);
  const r = await page.evaluate(() => { go('ins'); renderIns(); const el = document.getElementById('s-ins'), P = periodeVan(vandaagYMD());
    const U = uitgegevenStand({ start: P.start, eind: vandaagYMD() });
    return { t: el.innerText, saldoEind: !!el.querySelector('#insSaldoEind'), pot: +el.querySelector('[data-instegel="potjes"]').dataset.insuit, U: U.r.potjes,
      vast: !!el.querySelector('[data-instegel="vast"]'), week: !!el.querySelector('#insWeek'), link: !!el.querySelector('[data-insnaargrip]'), ink: !!el.querySelector('#insInkomen'),
      dagteller: (el.querySelector('[data-insdagteller]') || {}).innerText || '' }; });
  expect(r.saldoEind).toBe(false);
  expect(r.t).not.toMatch(/Verwacht saldo/i);
  expect(r.pot).toBe(r.U);
  expect(r.vast && r.week && r.link && r.ink).toBe(true);
  expect(r.dagteller).toMatch(/dag 4 van 30/);
});

test('B1 c: de tegel Vaste lasten en zijn sheet lezen dezelfde lijst als de verwachting', async ({ page }) => {
  /* toetst: "nog EUR X op hun datum" is V.vast, en de rijen van de sheet tellen op tot dat bedrag */
  await S.boot(page);
  const r = await page.evaluate(() => { go('ins'); renderIns(); const tg = document.querySelector('[data-instegel="vast"]'); openInsVast();
    const rows = [...document.querySelectorAll('[data-vastnogrij]')].map((e) => +e.dataset.vastnogrij); closeSheet();
    return { nog: +tg.dataset.insvastnog, rows, V: maandVooruit().vast }; });
  expect(r.nog).toBe(r.V);
  expect(r.rows.reduce((a, x) => a + x, 0)).toBe(r.V);
});

test('B2: de sheet Potjes zet het meest boven tempo bovenaan en draagt de per-keer-potjes zonder tempo', async ({ page }) => {
  /* toetst: de dag-rijen staan op aflopend (uit - tempo); een per-keer-potje heeft geen data-pottempo. Met de dubbele opname ligt Contant
     (EUR 500 uit) boven tempo en Boodschappen eronder, terwijl Contant als laatste wordt toegevoegd: zonder sortering staat de volgorde verkeerd
     (zonder dubbel staan ze toevallig al goed, en dan toetst dit niets). */
  await S.boot(page, { dubbel: true });
  const r = await page.evaluate(() => { openInsPotjesPeriode(); const d = [...document.querySelectorAll('[data-potrij]')].map((e) => +e.dataset.potd);
    const keer = [...document.querySelectorAll('[data-potkeer],[data-potkeernul]')].length, keerTempo = [...document.querySelectorAll('[data-potkeer][data-pottempo]')].length; closeSheet(); return { d, keer, keerTempo }; });
  expect(r.d.length).toBeGreaterThan(1); expect(r.d[0]).toBeGreaterThan(0);
  expect(r.d).toEqual(r.d.slice().sort((a, b) => b - a));
  expect(r.keer).toBeGreaterThan(0); expect(r.keerTempo).toBe(0);
});

test('B3: een dubbel aangeleverde opname: zonder antwoord tellen beide (gelijk aan het uitgegeven-blok), ja markeert de tweede, nee laat beide tellen, terug zet het terug', async ({ page }) => {
  /* toetst: de kandidaat staat een keer in Kiezen; zonder antwoord is de tegel gelijk aan uitgegevenStand; na "Ja, dezelfde" telt EUR 250
     minder en blijft de boeking in TX (gemarkeerd, dubbelWeg); na "Nee" tellen beide; terugdraaien geeft de stand zonder antwoord */
  await S.boot(page, { dubbel: true });
  const stand = () => page.evaluate(() => { window._rekV = null; try { runMemoVergeten(); } catch (_) {} const P = periodeVan(vandaagYMD()), U = uitgegevenStand({ start: P.start, eind: vandaagYMD() }), T = periodeTegelData();
    const K = opnDubbelKandidaten(); return { pot: T.potUit, U: U.r.potjes, n: K.length, keuze: K[0] && K[0].keuze, weg: TX.filter((t) => dubbelWeg(t)).length, tx: K[0] ? TX.filter((t) => t.id === K[0].a.id || t.id === K[0].b.id).length : 0 }; });
  const kies = () => page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); return (document.getElementById('gripOpnDubbel') || {}).innerText || ''; });
  const s0 = await stand();
  expect(s0.n).toBe(1); expect(s0.keuze).toBe(null); expect(s0.pot).toBe(s0.U); expect(s0.weg).toBe(0);
  expect(await kies()).toMatch(/Is dit dezelfde opname/i);
  await page.click('[data-opnja]');
  const s1 = await stand();
  expect(s1.pot).toBe(s0.pot - 250); expect(s1.pot).toBe(s1.U); expect(s1.weg).toBe(1); expect(s1.tx).toBe(2);
  await page.click('[data-opnterug]');
  const s2 = await stand();
  expect(s2.pot).toBe(s0.pot); expect(s2.keuze).toBe(null);
  await kies(); await page.click('[data-opnnee]');
  const s3 = await stand();
  expect(s3.pot).toBe(s0.pot); expect(s3.weg).toBe(0); expect(s3.keuze && s3.keuze.weg).toBe('');
});

test('B4 a: de stand op het einde van de periode is saldo min wat nog komt, en de regels tellen exact op', async ({ page }) => {
  /* toetst: start - vast - potjes - zonder = verwacht; verwacht = saldo - V.nogVerwacht; vast is V.vast; de kaart staat bovenaan Begrijpen */
  await S.boot(page);
  const r = await lees(page);
  expect(r.St.start - r.St.vast - r.St.pot - r.St.zonder).toBe(r.St.eind);
  expect(r.St.eind).toBe(r.St.start - r.nog);
  expect(r.St.vast).toBe(r.vast);
  const g = await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); const el = document.getElementById('gripStand'); return el ? { eind: +el.dataset.gripstand, onder: +el.dataset.gripstandonder, t: el.innerText } : null; });
  expect(g.eind).toBe(r.St.eind);
  expect(g.t).toMatch(/Stand op 23 dec/i); expect(g.t).toMatch(/ondergrens/); expect(g.t).toMatch(/zit hier niet in/);
});

test('B4 b: de ondergrens neemt per potje het hoogste van ruimte en verwachting, ook als het patroon boven de ruimte ligt', async ({ page }) => {
  /* toetst: Uit eten (patroon EUR 200 per maand, potje EUR 55) heeft verwacht boven ruimte; de ondergrens is start - vast - zonder - som
     max(ruimte, verwacht), dus lager dan "elk potje leeg" (som ruimte) en lager dan verwacht */
  await S.boot(page);
  const r = await lees(page);
  const ue = r.St.rijen.find((x) => x.k === 'uiteten');
  expect(ue.verwacht).toBeGreaterThan(ue.ruimte);
  const hoogst = r.St.rijen.reduce((a, x) => a + Math.max(x.ruimte, x.verwacht), 0), leeg = r.St.rijen.reduce((a, x) => a + x.ruimte, 0);
  expect(r.St.onder).toBe(r.St.start - r.St.vast - r.St.zonder - hoogst);
  expect(r.St.onder).toBeLessThan(r.St.start - r.St.vast - r.St.zonder - leeg);
  expect(r.St.onder).toBeLessThanOrEqual(r.St.eind);
  const t = await page.evaluate(() => { openGripPatroon(); const sh = document.getElementById('gripPatroonSheet'); const o = { tv: +sh.dataset.verwachttotaal, eerste: sh.querySelector('[data-patroonrij]').dataset.patroonrij, boven: [...sh.querySelectorAll('[data-patroonboven]')].length }; closeSheet(); return o; });
  expect(t.tv).toBe(r.St.pot);
  expect(t.eerste).toBe('uiteten'); expect(t.boven).toBeGreaterThan(0);
});

test('B4 c: een vroeg salaris van de volgende periode valt buiten de stand', async ({ page }) => {
  /* toetst: op 21 dec staat het salaris van december al op je rekening (v523c); de stand trekt het van het saldo af en zegt dat. Op 27 nov
     is het nog niet binnen en is start het saldo. */
  await S.boot(page);
  const a = await lees(page);
  expect(a.St.sal.binnen).toBe(false); expect(a.St.start).toBe(a.St.saldo);
  await S.boot(page, { dag: '2026-12-21', salDec: '2026-12-21' });
  const b = await lees(page);
  expect(b.P).toEqual(['2026-11-24', '2026-12-23']);
  expect(b.St.sal.binnen).toBe(true); expect(b.St.sal.datum).toBe('2026-12-21');
  expect(b.St.start).toBe(b.St.saldo - 5216);
});

test('B4 d: de kaart en de tabel lopen niet over op 390px en hun kolommen overlappen niet', async ({ page }) => {
  /* toetst: geen horizontale overloop in de stand-kaart en de tabel; in elke tabelrij ligt de naam links van ruimte en ruimte links van verwacht */
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page);
  const r = await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); const k = document.getElementById('gripStand');
    const ov = (el) => [...el.querySelectorAll('*')].filter((x) => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflowX !== 'hidden').length;
    const kaart = { ov: k.scrollWidth - k.clientWidth };
    const rows = [...k.querySelectorAll('[data-standrij]')].map((rw) => { const sp = rw.querySelectorAll(':scope > span, :scope > b'); if (sp.length < 2) return 0; const a = sp[0].getBoundingClientRect(), b = sp[sp.length - 1].getBoundingClientRect(); return Math.max(0, a.right - b.left); });
    openGripPatroon(); const sh = document.getElementById('gripPatroonSheet');
    const tab = [...sh.querySelectorAll('[data-patroonrij],[data-patroontotaal]')].map((rw) => { const n = rw.firstElementChild.getBoundingClientRect(), ru = rw.querySelector('[data-kol="ruimte"]').getBoundingClientRect(), ve = rw.querySelector('[data-kol="verwacht"]').getBoundingClientRect(); return Math.max(0, n.right - ru.left, ru.right - ve.left); });
    const sov = sh.scrollWidth - sh.clientWidth; closeSheet(); return { kaart, rows, tab, sov }; });
  expect(r.kaart.ov).toBeLessThanOrEqual(0);
  expect(Math.max(...r.rows)).toBe(0);
  expect(Math.max(...r.tab)).toBe(0);
  expect(r.sov).toBeLessThanOrEqual(0);
});

/* ===== v527b: geen tweede termijn, geen dubbele telling, een filterregel ===== */
test('v527b punt 1 a: een maandpost die in de periode al betaald is (onder een andere sleutel, dezelfde tegenpartij) krijgt geen tweede termijn', async ({ page }) => {
  /* toetst: Spotify Family loopt op de 22e en is in deze periode op 24 nov betaald als "Spotify Family AB" (recurKey verschilt); de termijn
     van 22 dec staat NIET in vastNog. Zonder de betaalde boeking (zonder spot) zou hij vanaf 22 okt lopen en op 22 nov en 22 dec vallen. */
  await S.boot(page, { spot: true });
  const r = await page.evaluate(() => { const V = maandVooruit();
    return { lijst: V.vastNogLijst.map((x) => x.naam + ' ' + x.datum), keys: TX.filter((t) => /Spotify Family/.test(t.name)).map((t) => recurKey(t)), betaald: eenheidTx({ start: '2026-11-24', eind: vandaagYMD() }).filter((t) => /Spotify Family/.test(t.name)).map((t) => t.date.slice(0, 10)) }; });
  expect(new Set(r.keys).size).toBe(2);   // de invoer: twee sleutels voor dezelfde tegenpartij, zoals het toestel
  expect(r.lijst.some((x) => /spotify/i.test(x))).toBe(false);
  expect(r.betaald).toEqual(['2026-11-24']);   // de betaalde boeking staat in de periode
});

test('v527b punt 1 b: een post per week die in de periode betaald is, krijgt wel zijn volgende termijnen', async ({ page }) => {
  /* toetst: de glazenwasser (EUR 15 elke woensdag, laatst 25 nov) staat op 2, 9, 16 en 23 dec in vastNog; de week is korter dan wat er
     van de periode resteert sinds die betaling. */
  await S.boot(page, { week: true });
  const r = await page.evaluate(() => maandVooruit().vastNogLijst.filter((x) => /Glazenwasser/.test(x.naam)).map((x) => x.datum + ' ' + x.bedrag));
  expect(r).toEqual(['2026-12-02 15', '2026-12-09 15', '2026-12-16 15', '2026-12-23 15']);
});

test('v527b punt 2: een verwachte post in de verwachting telt niet ook in het patroon van zijn potje', async ({ page }) => {
  /* toetst: "Boetes cjib" EUR 50 staat als nog niet gezien in vastNog, en de CJIB-betaling van oktober (EUR 145,98, Belasting & boetes)
     telt niet in het patroon van dat potje: patroonAftrek is 145,98 x de factor / 3 eenheden, en zonder de aftrek (opts.zonderAftrek)
     ligt nogVerwacht precies dat bedrag hoger. Een potje zonder vaste post houdt zijn patroon. */
  await S.boot(page, { cjib: true });
  const r = await page.evaluate(() => { const V = maandVooruit(), O = periodeVooruitKern(periodeVan(vandaagYMD()), { zonderAftrek: true });
    const b = V.potjes.find((x) => x.k === 'belasting'), bo = O.potjes.find((x) => x.k === 'belasting'), ue = V.potjes.find((x) => x.k === 'uiteten'), ueo = O.potjes.find((x) => x.k === 'uiteten');
    return { cjib: V.vastNogLijst.filter((x) => /cjib/i.test(x.naam)).map((x) => [x.bedrag, x.achter]), tx: V.patroonAftrekTx.map((x) => x.naam), aftrek: V.patroonAftrek.belasting,
      nog: V.nogVerwacht, nogO: O.nogVerwacht, eind: b.eindR, eindO: bo.eindR, ue: [ue.eindR, ueo.eindR] }; });
  expect(r.cjib).toEqual([[50, true]]);
  expect(r.tx).toEqual(['CJIB Regeling']);
  expect(r.aftrek).toBeGreaterThan(40);
  expect(r.eindO - r.eind).toBeCloseTo(r.aftrek, 6);
  expect(r.nogO - r.nog).toBeCloseTo(r.aftrek, 6);
  expect(r.ue[0]).toBe(r.ue[1]);
});

test('v527b punt 3: boven de tegels staat een filterregel "Deze periode · <periode> ▾ · dag X van Y", en het filter blijft werken', async ({ page }) => {
  /* toetst: precies een .ins-filt, met de periode, het ▾ en de dagteller in die ene regel; "Deze maand · alle uitgaven" staat er niet;
     een tik opent dezelfde keuzes (openInsFilter) */
  await S.boot(page);
  const r = await page.evaluate(() => { go('ins'); renderIns(); const el = document.getElementById('s-ins'), F = [...el.querySelectorAll('.ins-filt')];
    const t = F[0] ? F[0].innerText.replace(/\s+/g, ' ').trim() : ''; const boven = F[0] ? F[0].getBoundingClientRect().bottom <= el.querySelector('#insMaand').getBoundingClientRect().top : false;
    const h = F[0] ? F[0].getBoundingClientRect().height : 0;
    F[0] && F[0].click(); const sheet = document.getElementById('sheet').innerText; closeSheet();
    return { n: F.length, t, boven, h, alle: /Deze maand · alle uitgaven/i.test(el.innerText), dagteller: el.querySelectorAll('[data-insdagteller]').length, sheet }; });
  expect(r.n).toBe(1);
  expect(r.t).toMatch(/^Deze periode · 24 nov\s?[–-]\s?23 dec ▾ · dag 4 van 30( · ● nog niet bevestigd)?$/);
  expect(r.alle).toBe(false);
  expect(r.dagteller).toBe(1);
  expect(r.boven).toBe(true);
  expect(r.h).toBeLessThan(48);
  expect(r.sheet).toMatch(/Vorige maand|Laatste 3 maanden/);
});
