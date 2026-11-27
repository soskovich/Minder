/* onderhoud3: Plan zonder dubbele getallen, ingangen die ontbraken, en drie kleine vragen.
   Punt 1: het bedrag per laag staat één keer op Plan (in "Per laag · stand"); de legenda draagt procenten (grootste rest, samen 100);
           de doelenlijst staat in de sheet van Doelen, het noodfonds in die van Beschermen.
   Punt 2: "Opnames in <maand> ›" is een vaste ingang (Beschermen-sheet en doel-sheet), en de sheet toont de lopende EN de vorige
           salarisperiode (zonder salarisperiode de lopende en de vorige maand).
   Punt 3: de verschuivingen van de vorige periode staan in het lagen-logboek, met dezelfde keuze.
   Punt 4: "Al verdeeld?" met Ja / Deels / Nee; "Vervangt dit een gestopte post?" met een voorstel dat niet is aangevinkt; één
           storting geeft één vraag (de vragen van v524 onderdeel 8 wachten op de eenmalig-vraag).
   Punt 5: "Is dit de post …?" bij het vinkje "uit een reservering" (binnen EUR 1, dezelfde maand of eerder), niets voorgekozen.
   Punt 6: het reserveringen-sheet noemt één bedrag per salarisperiode (dat van de verdeling) en telt de inleg pas als dekking als
           hij gestort is of zijn moment nog komt. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');
const O = require('./opschonen-stand');
const S501 = require('./v501-stand');

const RESV = 'NL00RESV0000000001';
/* de stand van keuze C (v524-keuzeC.spec.js), via de app-acties */
async function keuzeC(page) {
  await T.boot(page, 'nu');
  await page.evaluate(([SAV, RESV]) => {
    const push = (o) => { TX.push(o); categorize(o); return o.id; };
    const mk = (id, date, amount, acc, name, desc) => ({ id, date, amount, acc, name, desc: desc || name, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    window.__vs = push(mk('vs_out', '2026-10-06', -1000, SAV, 'Naar reserveringen', 'Overboeking naar reserveringen')); push(mk('vs_in', '2026-10-07', 1000, RESV, 'Van noodfonds', 'Overboeking van noodfonds'));
    window.__o500 = push(mk('o_500', '2026-10-08', -500, SAV, 'Leefgeld', 'Overboeking naar betaalrekening'));
    SET.resAcc = RESV; SET.manualBal[SAV] = 6326;
    SET.goals.find((g) => g.id === 'iw').doel = 3000; SET.goals.find((g) => g.id === 'iw').gespaard = 3000; SET.goals.find((g) => g.id === 'kk').gespaard = 0;
    SET.nfToegewezen = 3326; delete SET.opnameBron; delete SET.verschuiving;
    OWN = [...new Set(TX.map((t) => t.acc).filter(Boolean))];
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    setVerschuivingKeuze(window.__vs, 'nee'); setOpnameBron(window.__o500, 'noodfonds');
    closeSheet(); render(); go('vooruit');
  }, [T.SAV, RESV]);
}
const euro = (page, v) => page.evaluate((x) => euro0(x), v);

test.describe('punt 1 · Plan: elk getal één keer', () => {
  test('a. geen bedrag van een laag staat twee keer op Plan (blok 2 is stroom en telt niet mee)', async ({ page }) => {
    await keuzeC(page);
    const r = await page.evaluate(() => {
      const L = lagenData(), root = document.getElementById('s-vooruit').cloneNode(true);
      const b2 = root.querySelector('#planGestort'); if (b2) b2.remove();
      const kp = root.querySelector('[data-lagenkoptekst]'); if (kp) kp.remove();   // het totaal kan gelijk zijn aan een laag (een laag van 100%)
      const tekst = root.innerText || root.textContent;
      const out = {};
      for (const k of ['beschermen', 'reserveren', 'doelen', 'groeien']) { const v = Math.round(L[k] || 0); if (!(v > 0)) continue; const e = euro0(v);
        out[k] = { e, n: tekst.split(e).length - 1 }; }
      return { out, lijst: !!document.querySelector('#s-vooruit #planLijst, #s-vooruit #planTijdlijnInline'), kop: L.kop };
    });
    expect(Object.keys(r.out).length, 'invoer: minstens twee lagen met geld').toBeGreaterThanOrEqual(2);
    for (const k in r.out) expect(r.out[k].n, `${k} ${r.out[k].e}`).toBe(1);
    expect(r.lijst, 'de doelenlijst staat niet meer op Plan').toBe(false);
  });

  test('b. de legenda: naam, kleur en procent, samen 100 (grootste rest), een laag van EUR 0 is 0%', async ({ page }) => {
    await keuzeC(page);
    const r = await page.evaluate(() => {
      const leg = [...document.querySelectorAll('#planLagenHero [data-laaglegenda]')].map((e) => ({ k: e.dataset.laaglegenda, p: +e.dataset.laagpct, t: e.textContent }));
      const st = (b, r, d, g) => lagenPct({ beschermen: b, reserveren: r, doelen: d, groeien: g });
      return { leg, s1: st(3326, 0, 3000, 4150), s2: st(1, 1, 1, 0), s3: st(100, 200, 300, 400), s4: st(0, 0, 0, 0) };
    });
    expect(r.leg.length).toBe(4);
    expect(r.leg.reduce((a, x) => a + x.p, 0)).toBe(100);
    for (const x of r.leg) { expect(x.t).toMatch(/\d+%$/); expect(x.t).not.toMatch(/€/); }
    expect(r.s1).toEqual({ beschermen: 32, reserveren: 0, doelen: 29, groeien: 39 });   // de stand van de gebruiker na keuze C
    expect(r.s2).toEqual({ beschermen: 34, reserveren: 33, doelen: 33, groeien: 0 });  // een afrondingsrest: gewoon afronden geeft 99
    expect(r.s3).toEqual({ beschermen: 10, reserveren: 20, doelen: 30, groeien: 40 });
    expect(r.s4).toEqual({ beschermen: 0, reserveren: 0, doelen: 0, groeien: 0 });
    for (const s of [r.s1, r.s2, r.s3]) expect(Object.values(s).reduce((a, x) => a + x, 0)).toBe(100);
  });

  test('c. Doelen opent een sheet met de lijst, de knoppen, Lijst/Tijdlijn en + Doel toevoegen; een doel opent het doel-sheet', async ({ page }) => {
    await keuzeC(page);
    await page.locator('#planLagenKaart [data-laag="doelen"]').click();
    const sh = page.locator('#laagDoelen');
    await expect(sh).toBeVisible();
    expect(await sh.locator('#planLijst .plan-item[data-id]').count()).toBe(3);   // de volgorde: noodfonds, dan de doelen
    expect(await sh.locator('[data-doelacties="noodfonds"]').count(), 'de knoppen van het noodfonds staan bij Beschermen').toBe(0);
    expect(await sh.locator('[data-doelacties] [data-doelaanpassen]').count()).toBe(2);
    expect(await sh.locator('[data-doelacties] [data-doelpauze]').count()).toBe(2);
    expect(await sh.locator('[data-doelacties] [data-doelbestedenlink]').count()).toBe(2);
    expect(await sh.locator('[data-planweergave]').count()).toBe(2);
    expect(await sh.locator('.cp-add').count()).toBe(1);
    await sh.locator('[data-planweergave="tijdlijn"]').click();
    await expect(page.locator('#laagDoelen #planTijdlijnInline')).toBeVisible();
    await page.locator('#laagDoelen [data-planweergave="lijst"]').click();
    await page.locator('#laagDoelen .plan-item[data-id="iw"]').click();
    await expect(page.locator('#planDoelSheet')).toHaveAttribute('data-doel', 'iw');
  });

  test('d. Beschermen opent een sheet met het noodfonds, norm en opbouwpad, verplaatsen en de ingangen', async ({ page }) => {
    await keuzeC(page);
    await page.locator('#planLagenKaart [data-laag="beschermen"]').click();
    const sh = page.locator('#laagBeschermen');
    await expect(sh).toBeVisible();
    expect(await sh.locator('.plan-item[data-id="noodfonds"]').count()).toBe(1);
    expect(await sh.locator('[data-beschermennorm]').count()).toBe(1);
    /* verplaatsen staat een keer in de sheet: op de rij van het noodfonds (geen tweede link eronder) */
    expect(await sh.locator('[data-verplaats="noodfonds"]').count()).toBe(1);
    expect((await sh.innerText()).split('⇄ verplaats').length - 1).toBe(1);
    expect(await sh.locator('[data-opnameingang]').count()).toBe(1);
    expect(await sh.locator('[data-verschuivingingang]').count()).toBe(1);
  });
});

test.describe('punt 2 · Waar kwam het vandaan? is altijd te bereiken', () => {
  test('a. de ingang staat er zodra er een opname was, ook zonder iets terug te zetten (Beschermen-sheet en doel-sheet)', async ({ page }) => {
    await keuzeC(page);
    const r = await page.evaluate(() => { const P = allocatePlan(), SE = planStandEind(P), x = SE.per.iw || {};
      openPlanDoel('iw'); const d = !!document.querySelector('#planDoelSheet [data-opnameingang]');
      return { tb: (x.tb || 0) + (x.nogLater || 0), doel: d }; });
    expect(r.tb, 'invoer: bij Inrichting staat niets terug te zetten').toBe(0);
    expect(r.doel).toBe(true);
    await page.locator('#planDoelSheet [data-opnameingang] [data-waarvandaan]').click();
    await expect(page.locator('#opnameBron')).toBeVisible();
    expect(+(await page.locator('#opnameBron').getAttribute('data-opnamen'))).toBeGreaterThanOrEqual(1);
  });

  test('b. op 2 december staan de opnames van november nog in de sheet (de vorige periode)', async ({ page }) => {
    await O.boot(page, { dag: '2026-12-02' });
    const r = await page.evaluate((SAV) => {
      const t = { id: 'o_nov', date: '2026-11-12', amount: -1000, acc: SAV, name: 'Leefgeld', desc: 'Overboeking naar betaalrekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); save(); try { runMemoVergeten(); } catch (_) {}
      openOpnameBron(); const ids = [...document.querySelectorAll('#opnameBron [data-opnamerij]')].map((e) => e.dataset.opnamerij);
      return { ids, id: t.id, ym: thisYM(), ingang: /november/.test(opnameIngang()) };
    }, O.SAV);
    expect(r.ym).toBe('2026-12');
    expect(r.ids).toContain(r.id);
    expect(r.ingang).toBe(true);
  });
});

test.describe('punt 3 · Verschuivingen van de vorige periode', () => {
  test('een verschuiving van vóór de lopende periode staat erin, met dezelfde keuze', async ({ page }) => {
    await O.boot(page, { dag: '2026-12-02' });
    const r = await page.evaluate(([SAV, RESV]) => {
      const mk = (id, date, amount, acc, name) => { const t = { id, date, amount, acc, name, desc: name, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t.id; };
      const vid = mk('v_uit', '2026-11-12', -1000, SAV, 'Naar reserveringen'); mk('v_in', '2026-11-13', 1000, RESV, 'Van noodfonds'); window.__vid = vid;
      SET.resAcc = RESV; OWN = [...new Set(TX.map((t) => t.acc).filter(Boolean))]; save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
      const isV = isVerschuiving(TX.find((t) => t.id === vid));
      openLagenLog(); const rij = document.querySelector(`#lagenLog [data-verschlaag="${vid}"]`);
      return { vid, isV, rij: !!rij, vorige: +document.getElementById('lagenLog').dataset.verschnvorige, knoppen: rij ? rij.querySelectorAll('[data-verschkeuze]').length : 0 };
    }, [O.SAV, RESV]);
    expect(r.isV, 'invoer: het is een verschuiving').toBe(true);
    expect(r.rij).toBe(true); expect(r.vorige).toBe(1); expect(r.knoppen).toBe(3);
    await page.locator(`#lagenLog [data-verschlaag="${r.vid}"] [data-verschkeuze="3"]`).click();
    expect(await page.evaluate((id) => (SET.verschuiving[id] || {}).keuze, r.vid)).toBe('3');
  });
});

test.describe('punt 4 · Kiezen meet eerst', () => {
  async function deels(page) {
    await S501.boot(page, { eenmalig: true });
    return page.evaluate(() => {
      const B0 = onregBinnen()[0], d = eenmaligAlVerdeeld({ datum: B0.datum, eenmalig: B0.bedrag }).boven - 1884;   // zo dat er EUR 1.884 boven de afspraak ging
      for (const t of TX) if (String(t.date).slice(0, 10) === '2026-11-25' && Math.abs(t.amount) === 5300) t.amount = t.amount < 0 ? -(5300 - d) : 5300 - d;
      save(); try { runMemoVergeten(); } catch (_) {}
      const B = onregBinnen()[0]; const EV = eenmaligAlVerdeeld({ datum: B.datum, eenmalig: B.bedrag });
      return { id: B.id, een: EV.een, boven: EV.boven, dekt: EV.dekt };
    });
  }
  test('a. Deels: de sheet vraagt "al verdeeld?" met drie keuzes, niets voorgekozen; Deels laat alleen de rest te verdelen', async ({ page }) => {
    const B = await deels(page);
    expect(B.dekt).toBe('deel'); expect(B.een).toBe(2190); expect(B.boven).toBe(1884);
    await page.evaluate((id) => openEenmaligVerdeeld(id), B.id);
    await expect(page.locator('#eenmaligVerdeeld [data-eenmaligvraag]')).toBeVisible();
    expect(await page.locator('#eenmaligVerdeeld [data-eenmaligklopt], #eenmaligVerdeeld [data-eenmaligdeel], #eenmaligVerdeeld [data-eenmaligniet]').count()).toBe(3);
    expect(await page.locator('#eenmaligVerdeeld [data-eenmaligdeel]').innerText()).toContain('Deels, verdeel de rest €306');
    expect(await page.locator('#eenmaligVerdeeld .btn:not(.sec)').count(), 'niets voorgeselecteerd').toBe(0);
    await page.locator('#eenmaligVerdeeld [data-eenmaligdeel]').click();
    const na = await page.evaluate((id) => { closeSheet(); const B = onregBinnen().find((x) => x.id === id); const k = gripCyclus().kies.find((x) => String(x.id) === 'inkomen:eenmalig:' + id);
      return { A: SET.eenmaligVerdeeld[id], bedrag: B ? B.bedrag : null, naam: k ? k.naam : null }; }, B.id);
    expect(na.A.deel).toBe(true); expect(na.A.gespaard).toBe(1884); expect(na.A.rest).toBe(306);
    expect(na.bedrag).toBe(306); expect(na.naam).toBe('Eenmalig €306 verdelen');
  });

  test('b. één storting, één vraag: zolang "al verdeeld?" open staat vragen de lagen-vragen niets; na "Ja" geen "nog over te maken"', async ({ page }) => {
    await S501.boot(page, { eenmalig: true });
    const r = await page.evaluate(() => {
      const G = lagenGestort(); const id = G && G.stort && G.stort.id; const open1 = lagenStortVraagOpen(G);
      const vol1 = lagenVolVraag(), over1 = lagenOverVraag();
      SET.eenmaligVerdeeld = { [id]: { klopt: true, op: vandaagYMD() } }; save();
      const open2 = lagenStortVraagOpen(lagenGestort()), over2 = lagenOverVraag();
      return { id, zelfde: onregBinnen().length === 0, open1, vol1, over1, open2, over2, kies: gripCyclus().kies.filter((x) => /^lagen:/.test(x.id)).map((x) => x.id) };
    });
    expect(r.id, 'invoer: de salarisstorting van deze periode').toBeTruthy();
    expect(r.open1).toBe(true); expect(r.vol1).toBe(null); expect(r.over1).toBe(null);
    expect(r.open2).toBe(false); expect(r.over2).toBe(null);
    expect(r.kies).not.toContain('lagen:over');
  });

  test('c. "Vervangt dit een gestopte post?": de gestopte post in dezelfde categorie is het voorstel, niet aangevinkt', async ({ page }) => {
    await S501.boot(page, { vast: true });
    const r = await page.evaluate(() => { const G = vastGestegenData(); const sp = G.posten.find((p) => /sportcity/i.test(p.naam)); const V = vastVervangVoorstel(sp);
      const GP = vastGestoptePosten(sp.key), anders = GP.filter((x) => x.cat !== sp.cat).length;
      const k = gripCyclus().kies.find((x) => x.id === 'vastpost:' + sp.key); return { key: sp.key, cat: sp.cat, V: V ? V.naam : null, Vcat: V ? V.cat : null, n: GP.length, anders, kies: k ? k.naam : null }; });
    expect(r.n, 'invoer: gestopte posten om uit te kiezen').toBeGreaterThanOrEqual(2);
    expect(r.Vcat).toBe(r.cat);
    expect(r.kies).toBe(`SportCity: nieuw +€80/mnd · vervangt dit ${r.V}?`);
    await page.evaluate((k) => openVastPostKeuze(k), r.key);
    await expect(page.locator('#vastPostKeuze [data-vpkvraag]')).toBeVisible();
    await page.locator('#vastPostKeuze [data-vpkoptie="vervangt"]').click();
    const v = page.locator('#vastPostKeuze [data-vpkvoorstel]');
    await expect(v).toHaveCount(1);
    expect(await v.getAttribute('class')).not.toMatch(/\bon\b/);
    expect(await page.evaluate(() => window._vpk.van)).toBe(null);
    expect(await page.locator('#vastPostKeuze [data-vpkbevestig]').isDisabled()).toBe(true);
  });
});

test.describe('punt 5 · Is dit de post …?', () => {
  test('a. binnen EUR 1 van een open post in dezelfde maand: de vraag bij het vinkje; Ja zet de post op betaald en koppelt hem', async ({ page }) => {
    await O.boot(page, { dag: '2026-11-26' });
    const id = await page.evaluate((MAIN) => {
      SET.reserveringen = [{ id: 'adv', naam: 'Advocaat', bedrag: 1815, vervalmaand: '2026-11', intervalM: 0 }];
      const t = { id: 'tx_adv', date: '2026-11-20', amount: -1814.6, acc: MAIN, name: 'Advocatenkantoor', desc: 'Advocatenkantoor declaratie', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'overig'; save(); try { runMemoVergeten(); } catch (_) {}
      openSheet(t.id); return t.id; }, O.MAIN);
    expect(await page.locator('#sheet [data-respostvraag]').count(), 'zonder vinkje geen vraag').toBe(0);
    await page.locator('#sheet #uitres').check();
    const q = page.locator('#sheet [data-respostvraag]');
    await expect(q).toHaveAttribute('data-respostvraag', 'adv');
    expect(await q.innerText()).toContain('Is dit de post Advocaat (€1.815, november)?');
    expect(await q.locator('.btn:not(.sec)').count(), 'niets voorgekozen').toBe(0);
    expect(await page.evaluate(() => !!(SET.resBetaald || {}).adv)).toBe(false);
    const voor = await page.evaluate(() => verplichtingen(12).some((x) => x.id === 'adv'));
    await q.locator('[data-respostja]').click();
    const na = await page.evaluate((id) => ({ B: SET.resBetaald.adv, inV: verplichtingen(12).some((x) => x.id === 'adv'), gek: !!document.querySelector('#sheet [data-respostgekoppeld="adv"]') }), id);
    expect(voor).toBe(true);
    expect(na.B.tx).toBe(id); expect(na.B.maand).toBe('2026-11'); expect(na.inV).toBe(false); expect(na.gek).toBe(true);
  });
  test('b. meer dan EUR 1 verschil, of een post in een latere maand: geen voorstel', async ({ page }) => {
    await O.boot(page, { dag: '2026-11-26' });
    const r = await page.evaluate((MAIN) => {
      SET.reserveringen = [{ id: 'adv', naam: 'Advocaat', bedrag: 1815, vervalmaand: '2026-11', intervalM: 0 }, { id: 'tand', naam: 'Tandarts', bedrag: 300, vervalmaand: '2027-03', intervalM: 12 }];
      const mk = (id, a) => { const t = { id, date: '2026-11-20', amount: -a, acc: MAIN, name: 'X ' + id, desc: 'X ' + id, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
      const a = mk('t1', 1816.2), b = mk('t2', 300), c = mk('t3', 1815.9); save();
      return { a: (resPostKandidaat(a) || {}).id || null, b: (resPostKandidaat(b) || {}).id || null, c: (resPostKandidaat(c) || {}).id || null };
    }, O.MAIN);
    expect(r.a).toBe(null); expect(r.b, 'Tandarts valt in maart 2027').toBe(null); expect(r.c).toBe('adv');
  });
});

test.describe('punt 6 · Reserveringen-sheet: één bedrag per salarisperiode', () => {
  test('het sheet noemt het bedrag van de verdeling, en telt de inleg alleen als gestort of nog te komen', async ({ page }) => {
    await S501.boot(page, { res: true });
    const r = await page.evaluate(() => {
      const P = rekVoorstel(), RP = resSheetPeriode(); openReserveringen();
      const kop = document.querySelector('[data-resperiodekop]'), tekst = document.getElementById('sheet').innerText;
      return { ok: P.ok && P.resOk, verdeling: Math.round(P.reserveringen), oud: Math.round(resInlegPerMaand().bedrag), kop: kop ? +kop.dataset.resperiodekop : null,
        kopBedrag: euro0(RP.per), gedekt: kop ? kop.dataset.resgedekt : null, RP: { gestort: RP.gestort, komt: RP.komt, telt: RP.telt, per: RP.per }, perMaand: /per maand/.test(tekst), tekst };
    });
    expect(r.ok, 'invoer: de verdeling rekent reserveringen').toBe(true);
    expect(r.kop).toBe(r.verdeling);
    expect(r.RP.telt).toBe((r.RP.gestort >= r.RP.per - 0.5 || r.RP.komt) ? r.RP.per : 0);
    expect(r.gedekt).toBe(r.RP.telt > 0 ? '1' : '0');
    expect(r.perMaand, 'geen bedrag per maand naast het bedrag per periode').toBe(false);
    expect(r.tekst.split(r.kopBedrag).length - 1, 'het bedrag per periode staat een keer in het sheet').toBe(1);
    expect(r.tekst).not.toContain('je verdeling noemt geen bedrag');
    if (r.oud && r.oud !== r.verdeling) expect(r.tekst).not.toContain(`inleg van €${r.oud} `);
  });
  /* het geval dat de telling onderscheidt: de verdeling noemt EUR 262 per periode, er is EUR 20 gestort en het moment (salaris 1 okt plus
     OVERBOEK_LAAT_DAGEN werkdagen) is op 31 okt voorbij. Dan telt de inleg niet, en zonder dit geval is "telt alleen als gestort of nog te
     komen" niet te onderscheiden van "telt altijd" (de fixture hierboven is gedekt). */
  test('niet gestort en het moment voorbij: de inleg telt niet, en het sheet zegt dat zonder bedrag per maand', async ({ page }) => {
    const MAIN = 'NL01MAIN0000001111', RES = 'NL01RESV0000002222';
    const tx = [{ id: 'i1', date: '2026-10-01', amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
      { id: 'r1', date: '2026-10-01', amount: 20, acc: RES, name: 'Eigen rekening', desc: 'RESERVERINGEN', typ: '', ref: '', src: 'csv', accName: 'Res', refNums: [] }];
    const d = { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}',
      minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: false, income: 3000, savingMode: 'amount', savingAmount: 300,
        manualBal: { [MAIN]: 2000, [RES]: 37 }, resAcc: RES, reserveringen: [{ id: 'b', naam: 'Boete', bedrag: 299, vervalmaand: '2026-11', intervalM: 0, cat: '' }] }) };
    await page.route('**/sw.js', (r) => r.abort());
    await page.addInitScript((x) => { for (const k in x) localStorage.setItem(k, x[k]); }, d);
    await page.goto('/index.html');
    const r = await page.evaluate(() => { const RP = resSheetPeriode(); openReserveringen(); const kop = document.querySelector('[data-resperiodekop]');
      return { RP: { per: RP.per, gestort: RP.gestort, komt: RP.komt, telt: RP.telt }, gedekt: kop.dataset.resgedekt, zin: document.querySelector('[data-resdekzin]').innerText, t: document.getElementById('sheet').innerText }; });
    expect(r.RP.per, 'invoer: de verdeling noemt een bedrag').toBe(262);
    expect(r.RP.gestort).toBe(20); expect(r.RP.komt, 'invoer: het moment is voorbij').toBe(false);
    expect(r.RP.telt).toBe(0); expect(r.gedekt).toBe('0');
    expect(r.zin).toContain('nog niet gestort'); expect(r.t).not.toMatch(/per maand/);
    expect(r.t.split('€262 per salarisperiode').length - 1).toBe(1);
  });
});
