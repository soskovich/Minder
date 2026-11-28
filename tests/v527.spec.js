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
test('v527c punt 1: een maandpost op de 24e, betaald in de periode, met een gemeten afstand van 28 dagen, krijgt geen termijn op de 22e', async ({ page }) => {
  /* toetst: Spotify Family (27 jul, 24 aug, 21 sep, 19 okt, 24 nov: een keer per kalendermaand, mediane afstand 28) heet in het schema
     4-wekelijks, maar is een maandpost: zijn volgende termijn is 24 dec, buiten de periode 24 nov - 23 dec, dus hij staat niet in vastNog.
     De invoer wordt eerst gemeten (cadans 4w, afstand 28), anders toetst de test niets. */
  await S.boot(page, { spot: true });
  const r = await page.evaluate(() => { const V = maandVooruit(); const s = recurringSchedule().find((x) => x.key === 'SPOTIFY FAMILY');
    const it = rekVoorstel().vastAlle.find((x) => x.key === 'SPOTIFY FAMILY');
    return { cadans: s && s.cadans, afstand: s && s.afstand, maand: vastMaandSchema(it).cadans, lijst: V.vastNogLijst.map((x) => x.naam + ' ' + x.datum),
      volgende: periodeTermijnen(vastMaandSchema(it), '2026-11-24', '2026-11-24', '2027-01-31') }; });
  expect(r.cadans).toBe('4w');
  expect(r.afstand).toBe(28);
  expect(r.maand).toBe('maand');
  expect(r.lijst.some((x) => /spotify family/i.test(x))).toBe(false);
  expect(r.volgende).toEqual(['2026-12-24', '2027-01-24']);
});

test('v527c punt 1: een echte 4-wekelijkse post (twee keer in een kalendermaand) blijft 4-wekelijks', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => { for (const d of ['2026-08-03', '2026-08-31', '2026-09-28', '2026-10-26']) { const t = { id: 'v527c4w' + d, date: d, amount: -20, acc: TX[0].acc, name: 'Opslag Vier', desc: 'SEPA Incasso Opslag Vier ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'huur'; }
    save(); telbaarVergeten(); window._rekV = null; const it = rekVoorstel().vastAlle.find((x) => x.key === 'OPSLAG VIER'); return it ? [it.s.cadans, vastMaandSchema(it).cadans] : null; });
  expect(r).toEqual(['4w', '4w']);
});

test('v527b punt 1 b: een post per week die in de periode betaald is, krijgt wel zijn volgende termijnen', async ({ page }) => {
  /* toetst: de glazenwasser (EUR 15 elke woensdag, laatst 25 nov) staat op 2, 9, 16 en 23 dec in vastNog; de week is korter dan wat er
     van de periode resteert sinds die betaling. */
  await S.boot(page, { week: true });
  const r = await page.evaluate(() => maandVooruit().vastNogLijst.filter((x) => /Glazenwasser/.test(x.naam)).map((x) => x.datum + ' ' + x.bedrag));
  expect(r).toEqual(['2026-12-02 15', '2026-12-09 15', '2026-12-16 15', '2026-12-23 15']);
});

test('v527c punt 2: een verwachte post betaald met wisselende bedragen ("Regeling") gaat uit het patroon; losse boekingen van dezelfde partij met een andere omschrijving blijven erin', async ({ page }) => {
  /* toetst: de reeks van "Boetes cjib" is CJIB Regeling (4 betaaldagen), niet CJIB Verkeersboetes (2 betaaldagen); de aftrek bevat alleen
     Regeling-boekingen en minstens een; zonder de aftrek ligt het patroon precies dat bedrag hoger; een potje zonder vaste post houdt zijn
     patroon; en de Verkeersboetes staan in het patroon van Belasting & boetes. */
  await S.boot(page, { cjib: true });
  const r = await page.evaluate(() => { const V = maandVooruit(), O = periodeVooruitKern(periodeVan(vandaagYMD()), { zonderAftrek: true });
    const b = V.potjes.find((x) => x.k === 'belasting'), bo = O.potjes.find((x) => x.k === 'belasting'), ue = V.potjes.find((x) => x.k === 'uiteten'), ueo = O.potjes.find((x) => x.k === 'uiteten');
    const P = periodeVan(vandaagYMD()), H = periodeHistorie(P), vk = H.flatMap((u) => eenheidTx(u)).filter((t) => /Verkeersboetes/.test(t.name) && piekInScope(t)).length;
    return { reeks: vvReeksKey(vvLijst()[0]), cjib: V.vastNogLijst.filter((x) => /cjib/i.test(x.naam)).map((x) => [x.bedrag, x.achter]), tx: [...new Set(V.patroonAftrekTx.map((x) => x.naam))], n: V.patroonAftrekTx.length,
      aftrek: V.patroonAftrek.belasting, eind: b.eindR, eindO: bo.eindR, nog: V.nogVerwacht, nogO: O.nogVerwacht, ue: [ue.eindR, ueo.eindR], vk }; });
  expect(r.reeks).toBe('CJIB REGELING');
  expect(r.cjib).toEqual([[50, true]]);
  expect(r.tx).toEqual(['CJIB Regeling']);
  expect(r.n).toBeGreaterThan(0);
  expect(r.aftrek).toBeGreaterThan(0);
  expect(r.vk).toBeGreaterThan(0);   // de Verkeersboetes vallen in de historie en tellen in het patroon
  expect(r.eindO - r.eind).toBeCloseTo(r.aftrek, 6);
  expect(r.nogO - r.nog).toBeCloseTo(r.aftrek, 6);
  expect(r.ue[0]).toBe(r.ue[1]);
  /* zonder de regeling zijn er alleen losse boetes (twee betaaldagen): geen reeks, dus geen aftrek, en de post blijft nog niet gezien */
  await S.boot(page, { cjib: true, cjibZonderRegeling: true });
  const z = await page.evaluate(() => { const V = maandVooruit(); return { reeks: vvReeksKey(vvLijst()[0]), aftrek: V.patroonAftrekTx.length, cjib: V.vastNogLijst.filter((x) => /cjib/i.test(x.naam)).map((x) => x.achter) }; });
  expect(z.reeks).toBe('');
  expect(z.aftrek).toBe(0);
  expect(z.cjib).toEqual([true]);
});

test('v527c punt 2: "nog niet gezien" en de patroon-aftrek lezen dezelfde lijst', async ({ page }) => {
  /* toetst: (a) zonder betaling in november is de termijn van 26 nov nog niet gezien, en de boekingen die vvBetaald als betaling van de post
     zou zien zijn precies de boekingen waaruit de aftrek bestaat (allebei postBetaling); (b) met een Regeling-betaling op 26 nov is de termijn
     gezien (niet meer in vastNog) zonder dat je hem koppelde; (c) een losse Verkeersboete in november maakt hem niet gezien. */
  await S.boot(page, { cjib: true });
  const a = await page.evaluate(() => { const V = maandVooruit(), x = vvLijst()[0], it = { key: 'vverw|' + x.id, reeks: vvReeksKey(x) };
    const P = periodeVan(vandaagYMD()), H = periodeHistorie(P), Hids = new Set(H.flatMap((u) => eenheidTx(u)).filter(piekInScope).map((t) => t.id));
    return { gezien: vvBetaald(x, '2026-11-26'), achter: V.vastNogLijst.filter((y) => /cjib/i.test(y.naam)).map((y) => y.achter),
      lijst: telbareTx().filter((t) => postBetaling(t, it) && Hids.has(t.id)).map((t) => t.id).sort(), aftrek: V.patroonAftrekTx.map((y) => y.id).sort() }; });
  expect(a.gezien).toBe(false);
  expect(a.achter).toEqual([true]);
  expect(a.aftrek.length).toBeGreaterThan(0);
  expect(a.aftrek).toEqual(a.lijst);
  await S.boot(page, { cjib: true, cjibNov: true });
  const b = await page.evaluate(() => { const V = maandVooruit(), x = vvLijst()[0]; return { koppel: !!x.koppel, gezien: vvBetaald(x, '2026-11-26'), cjib: V.vastNogLijst.filter((y) => /cjib/i.test(y.naam)).length }; });
  expect(b.koppel).toBe(false);
  expect(b.gezien).toBe(true);
  expect(b.cjib).toBe(0);
  await S.boot(page, { cjib: true });
  const c = await page.evaluate(() => { const t = { id: 'v527cvk1126', date: '2026-11-25', amount: -50, acc: TX[0].acc, name: 'CJIB Verkeersboetes', desc: 'CJIB Verkeersboetes november', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'belasting';
    save(); telbaarVergeten(); window._rekV = null; try { runMemoVergeten(); } catch (_) {} const x = vvLijst()[0]; return { gezien: vvBetaald(x, '2026-11-26'), cjib: maandVooruit().vastNogLijst.filter((y) => /cjib/i.test(y.naam)).length }; });
  expect(c.gezien).toBe(false);
  expect(c.cjib).toBe(1);
});

test('v527c punt 2: een vaste last met dezelfde tegenpartij maar een andere reeks (servicekosten naast de hoofdpost) koppelt niet', async ({ page }) => {
  /* toetst: Derdengelden Peaks met een inleg van EUR 100 op de 28e en servicekosten van EUR 2,99 op de 3e (dezelfde naam, dus dezelfde
     recurKey; postReeksen splitst ze op bedragband). postBetaling op de sleutel van de partij (de hoofdreeks) herkent de inleg en niet de
     servicekosten; de servicekostenreeks herkent alleen zichzelf. De invoer wordt eerst gemeten: twee reeksen. */
  await S.boot(page);
  const r = await page.evaluate(() => { const acc = TX[0].acc, mk = (d, a) => { const t = { id: 'v527cpk' + d + a, date: d, amount: a, acc, name: 'Derdengelden Peaks', desc: 'SEPA Incasso Derdengelden Peaks ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'sparen_kosten' in CATS ? 'sparen_kosten' : 'abonnement'; return t; };
    const I = [], K = []; for (const m of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) { I.push(mk(m + '-28', -100)); K.push(mk(m + '-03', -2.99)); }
    save(); telbaarVergeten(); const R = postReeksen('DERDENGELDEN PEAKS'); const x = { key: 'DERDENGELDEN PEAKS' }, y = { key: R[1] ? R[1].key : '' };
    return { n: R.length, hoofdInleg: I.every((t) => postBetaling(t, x)), hoofdKosten: K.some((t) => postBetaling(t, x)), kostenKosten: K.every((t) => postBetaling(t, y)), kostenInleg: I.some((t) => postBetaling(t, y)) }; });
  expect(r.n).toBe(2);
  expect(r.hoofdInleg).toBe(true);
  expect(r.hoofdKosten).toBe(false);
  expect(r.kostenKosten).toBe(true);
  expect(r.kostenInleg).toBe(false);
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
