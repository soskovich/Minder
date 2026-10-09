/* v320: 'Vraagt een beslissing' als LIJSTREGEL, met de volle tekst een tik dieper.
 *
 * v340: DE LIJSTREGEL IS EEN TEGEL. Grip is een dashboard; een regel met status tekort is een rode
 * tegel (`[data-tegel]`, `data-kleur="rood"`), een structureel signaal een regel onder 'Let op'
 * (`[data-letop="str"]`), en de oorzaak en het bedrag staan in de sheet erachter
 * (`renderMaandBeslisSheet`, `[data-sheetbedrag]`). Deze spec leest die plekken via
 * `tests/beslis-sheet.js`.
 *
 * DE FIXTURE DRAAGT DE STAND VAN HET TOESTEL, en niet een paar getallen dat op dezelfde uitkomst
 * uitkomt (v251/v256): pot EUR 37 tegen een eenmalige boete van EUR 299 in DEZE maand (v323) geeft
 * EUR 262 tekort, en Kosten Koper van EUR 15.000 in de zevende maand op 90 procent van een inleg van
 * EUR 2.200 geeft EUR 1.980 tegen EUR 2.143 nodig, dus EUR 163 per maand tekort. Elk blok MEET die
 * invoer voordat het de uitkomst toetst: zonder die meting is 'de regel leest het tekort' niet van
 * 'de fixture heeft geen tekort' te onderscheiden (meetles a en o).
 *
 * DE FIXTURE PINT ZIJN DAG, want de dekking en het doel hangen beide aan de kalender (v299/v306/v310)
 * en de datums in `TX` komen uit `vasteDatum()`, zodat de dag aan beide kanten dezelfde is.
 *
 * DE GETALLEN VAN DE DRIE ANDERE SOORTEN LOPEN UITEEN waar dat de assertie draagt: bij de buffer is
 * de oorzaak de NORM (3) en het bedrag het gat naar het RICHTBEDRAG (EUR 7.500), en met samenvallende
 * getallen is 'hij leest de norm' niet van 'hij leest het doel' te onderscheiden.
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');
const { kaalBron, kaalUit } = require('./bron-kaal');
const { beslisRegels } = require('./beslis-sheet');
const fs = require('fs');
const path = require('path');

const MAIN = 'NL01MAIN0000001111';
const SAV  = 'NL01SAVE0000004323';
const RES  = 'NL01RESV0000007788';
const NU   = vasteDatum(DAGEN_OVER);
const ym   = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS   = [4, 3, 2, 1, 0].map((k) => ym(new Date(NU.getFullYear(), NU.getMonth() - k, 1)));
const THIS = MS[MS.length - 1];
const PLUS = (n) => ym(new Date(NU.getFullYear(), NU.getMonth() + n, 1));

// de getallen van de fixture, zodat een assertie ze bij naam noemt en niet herberekent
const POT = 37, POST = 299, POSTNAAM = 'Verkeersboete', DEK_TEKORT = POST - POT;   // 262
const KK = 15000, INR = 3000, INLEG = 2200, DOEL_TEKORT = 163;
const NORM = 3, RICHT = 4, NF_TOEGEWEZEN = 1500, NF_DOEL = 9000, BUF_GAT = NF_DOEL - NF_TOEGEWEZEN;   // 7500


function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    add(m, '03', 4000, 'Werkgever', 'SALARIS LOON');
    add(m, '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -(o.boodschappen || 300), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    // de spaarinleg loopt elke maand, behalve waar een blok een stilstaande buffer nodig heeft
    if (o.sparen !== false) add(m, '06', 600, 'Spaarpot', 'NAAR SPAREN', SAV);
    else if (m === MS[0]) add(m, '06', 600, 'Spaarpot', 'NAAR SPAREN', SAV);
    add(m, '06', 40, 'Reservering', 'NAAR RESERVERING', RES);
  });
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4000, limit: 70,
    bufferNorm: NORM, nfMaanden: NORM, nfToegewezen: 4000, nfDoelVast: 4000, nfToegewezenMigrated: 1,
    savingsEnds: ['4323'], resAcc: RES,
    manualBal: { [MAIN]: 3000, [SAV]: 30000, [RES]: POT },
    budgets: { huur: 900, boodschappen: 400 }, budgetMonth: THIS,
    savingMode: 'amount', savingAmount: INLEG,
    /* v323: de boete valt in de LOPENDE maand en niet in de maand erna. Sinds v323 is een post die
       later valt aandacht en geen beslissing, en dat is ook wat de stand van het toestel nu laat zien;
       deze spec gaat over de VORM van een beslissing en heeft daarvoor twee regels in die kaart nodig.
       Het tekort blijft EUR 262, want een eenmalige post draagt zijn hele bedrag in de eis (v317). */
    reserveringen: [{ id: 'r1', naam: POSTNAAM, bedrag: POST, vervalmaand: PLUS(0), intervalM: 0, cat: 'belasting' }],
    goals: [
      { id: 'g1', naam: 'Kosten Koper', doel: KK, gespaard: 0, streefdatum: PLUS(6), allocMode: 'pct', pct: 90 },   // v370: zeven inleggen, deze maand meegeteld
      { id: 'g2', naam: 'Inrichting', doel: INR, gespaard: 0, streefdatum: PLUS(18), allocMode: 'pct', pct: 10 },
    ],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, o = {}) {
  if (o.w) await page.setViewportSize({ width: o.w, height: o.w === 360 ? 640 : 844 });
  await pinDag(page, o.dagen);
  await page.addInitScript((s) => { for (const k in s) localStorage.setItem(k, s[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.renderMaand === 'function');
  await page.evaluate(() => go('maand'));
}

const BRON = () => kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));

// v340: per regel die een beslissing vraagt (status tekort), met oorzaak en bedrag uit de sheet
const regels = async (page) => (await beslisRegels(page)).filter((r) => r.status === 'tekort');

const sheetVan = (page, key) => page.evaluate((k) => {
  openMaandBeslis(k);
  const sh = document.querySelector('#sheet');
  const b = sh.querySelector('[data-sheetbedrag]');
  const uit = { bedrag: b ? b.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : [],
    knop: (sh.querySelector('[data-beslisknop]') || { innerText: '' }).innerText,
    html: sh.innerHTML, tekst: sh.innerText.replace(/\n/g, ' | ') };
  closeSheet(); return uit;
}, key);

test.describe('a - de invoer: de fixture draagt de twee regels van de stand', () => {
  test('dekking komt EUR 262 tekort op een boete van EUR 299, en het doel EUR 163 per maand', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => {
      const R = maandRegels();
      const D = dekking(12);
      const dek = R.find((r) => r.key === 'dekking'), doel = R.find((r) => r.key === 'doel');
      return { dekStatus: dek.status, dekTekort: dek.tekortPerMaand, stand: D.werkelijkeStand,
        post: (D.regels.find((x) => x.soort === 'post') || {}),
        doelStatus: doel.status, doelTekort: doel.tekortPerMaand, doelTelaat: !!doel.telaat,
        bufStatus: (R.find((r) => r.key === 'buffer') || {}).status, nStr: maandStructureel().length };
    });
    expect(d.stand).toBe(POT);
    expect(d.post.bedrag).toBe(POST);
    expect(d.post.naam).toBe(POSTNAAM);
    expect(d.dekStatus).toBe('tekort');
    expect(d.dekTekort).toBe(DEK_TEKORT);
    expect(d.doelStatus).toBe('tekort');
    expect(d.doelTekort).toBe(DOEL_TEKORT);
    expect(d.doelTelaat, 'de normale tak en niet de telaat-tak').toBe(false);
    // en de derde regel staat goed, zodat blok f de ok-eis kan toetsen
    expect(d.bufStatus).toBe('ok');
    expect(d.nStr, 'geen structureel signaal, die hebben hun eigen blok').toBe(0);
  });
});

test.describe('b - de regel: stip, naam, oorzaak, het tekort, een chevron', () => {
  test('twee lijstregels, elk met de oorzaak uit een bestaand veld en het tekort rechts', async ({ page }) => {
    await boot(page, { w: 360 });
    const r = await regels(page);
    expect(r.map((x) => x.key)).toEqual(['dekking', 'doel']);
    // de oorzaak noemt de post BIJ NAAM, met bedrag en maand, en het jaartal blijft staan
    expect(r[0].tekst).toContain(`${POSTNAAM} van €${POST} in ${NU.getMonth() === 11 ? 'januari' : ''}`.replace(/ in $/, ' in '));
    expect(r[0].tekst).toMatch(new RegExp(`${POSTNAAM} van €${POST} in \\w+ \\d{4}`));
    expect(r[0].bedrag, 'rechts het gat, als STAND en dus zonder "per maand"').toEqual([`€${DEK_TEKORT}`, 'tekort']);
    // en bij het doel de streefdatum als oorzaak en het maandbedrag rechts
    expect(r[1].tekst).toMatch(/streefdatum \w+ \d{4}/);
    expect(r[1].bedrag).toEqual([`€${DOEL_TEKORT}`, 'per maand tekort']);
    // v340: de rode stip is een rode tegel: een tekort dat een beslissing vraagt is echte aandacht
    expect(r.map((x) => x.kleur)).toEqual(['rood', 'rood']);
    const rand = await page.evaluate(() => {
      const d = document.querySelector('#s-maand [data-tegel="dekking"]'); return getComputedStyle(d).borderLeftColor; });
    const rood = await page.evaluate(() => { const e = document.createElement('div');
      e.style.color = 'var(--red)'; document.body.appendChild(e); const c = getComputedStyle(e).color;
      e.remove(); return c; });
    expect(rand).toBe(rood);
    // en de hele tegel is de knop
    const act = await page.evaluate(() => document.querySelector('#s-maand [data-tegel="dekking"]').getAttribute('onclick'));
    expect(act).toBe("openMaandBeslis('dekking')");
  });

  test('de buffer: de oorzaak leest de norm, het bedrag het gat naar je richtbedrag', async ({ page }) => {
    await boot(page, { sparen: false, w: 360,
      set: { nfToegewezen: NF_TOEGEWEZEN, nfDoelVast: NF_DOEL, nfMaanden: RICHT, reserveringen: [], goals: [] } });
    const invoer = await page.evaluate(() => { const r = maandRegels().find((x) => x.key === 'buffer');
      return { status: r.status, norm: r.norm, maanden: r.maanden, teller: bufferTeller(),
        richt: nfMaanden(), doel: Math.round(noodfondsModel().doel), gat: maandTekort(r) }; });
    expect(invoer.status).toBe('tekort');
    expect(invoer.teller).toBe(NF_TOEGEWEZEN);
    expect(invoer.doel).toBe(NF_DOEL);
    expect(invoer.gat).toEqual({ bedrag: BUF_GAT, soort: 'totaal' });
    // de twee grenzen lopen uiteen, en dat is precies wat de twee kanten van de regel laten zien
    expect(invoer.norm).toBe(NORM);
    expect(invoer.richt, 'norm en richt lopen uiteen, anders meet de assertie niets').toBe(RICHT);
    expect(Math.round(invoer.maanden * 10) / 10).toBeLessThan(NORM);
    const r = await regels(page);
    expect(r.map((x) => x.key)).toEqual(['buffer']);
    expect(r[0].tekst).toMatch(new RegExp(`nu \\d+,\\d maanden, je norm is ${NORM}`));
    expect(r[0].bedrag).toEqual([`€${BUF_GAT.toLocaleString('nl-NL')}`, 'tot je richtbedrag']);
  });
});

test.describe('c - een bron: de regel en de sheet lezen dezelfde velden', () => {
  /* v340: 'het bedrag op de regel is het bedrag in de sheet' is vervallen, want de regel is een tegel
     en draagt dat bedrag niet meer: het staat alleen nog in de sheet, en een tweede plek om tegen te
     leggen is er niet. */

  test('beide lezers noemen maandBeslisDeel, en de regel rekent het bedrag niet zelf', async ({ page }) => {
    await boot(page);
    // v340: de tweede lezer is de Let op-regel van een structureel signaal (hij leest de oorzaak)
    const rij = await kaalUit(page, 'gripLetOpItems');
    const sheet = await kaalUit(page, 'renderMaandBeslisSheet');
    const deel = await kaalUit(page, 'maandBeslisDeel');
    expect(rij).toContain('maandBeslisDeel(');
    expect(sheet).toContain('maandBeslisDeel(');
    // het bedrag komt uit de bron die v224 daarvoor heeft aangewezen, en alleen daar
    expect(deel).toContain('maandTekort(');
    expect(rij).not.toContain('maandTekort(');
    expect(sheet).not.toContain('maandTekort(');
    // en de eenheid staat op een plek
    expect(deel).toContain('BESLIS_EENHEID');
    const src = BRON();
    expect(src.match(/BESLIS_EENHEID/g).length, 'de tabel en zijn ene lezer').toBe(2);
  });

  test('de oorzaak komt van de rij en wordt in de regel niet afgeleid', async ({ page }) => {
    await boot(page);
    const deel = await kaalUit(page, 'maandBeslisDeel');
    const rij = (await kaalUit(page, 'gripLetOpItems')) + (await kaalUit(page, 'gripTegels'));
    expect(deel).toContain('r.oorzaak');
    // geen tweede afleiding van de post, de streefdatum of de norm in de weergave
    for (const naam of ['resMaandLabel(', 'doelDatumLabel(', 'bufferNorm(']) {
      expect(deel).not.toContain(naam);
      expect(rij).not.toContain(naam);
    }
  });
});

test.describe('d - de sheet draagt de tekst die uit de kaart verdween', () => {
  test('de gevolgzin, de suggestie en de handeling als knop', async ({ page }) => {
    await boot(page);
    const w = await page.evaluate(() => { const r = maandRegels().find((x) => x.key === 'dekking');
      return { gevolg: r.gevolg, sug: maandSuggestie(r, thisYM()), ing: maandIngangTekst(r) }; });
    expect(w.gevolg.length).toBeGreaterThan(40);
    expect(w.sug.length).toBeGreaterThan(20);
    const sh = await sheetVan(page, 'dekking');
    expect(sh.tekst).toContain(w.gevolg);
    expect(sh.tekst).toContain(w.sug);
    expect(sh.knop).toBe(w.ing);
    expect(sh.knop).toContain(`€${DEK_TEKORT}`);
    // en de knop opent het gesprek op precies deze regel
    expect(sh.html).toContain("coStart('maand'");
    expect(sh.html).toContain("'dekking')");
    // het scherm draagt die tekst niet: hij staat in de sheet en is niet gekopieerd
    const kaart = await page.evaluate(() => document.querySelector('#s-maand').innerText);
    expect(kaart).not.toContain(w.gevolg);
    expect(kaart).not.toContain(w.sug);
    expect(kaart).not.toContain(w.ing);
  });

  test('de vraag staat op een plek en heeft twee vormen', async ({ page }) => {
    await boot(page);
    const inline = await kaalUit(page, 'maandIngang');
    const knop = await kaalUit(page, 'maandIngangKnop');
    const tekst = await kaalUit(page, 'maandIngangTekst');
    expect(inline).toContain('maandIngangTekst(');
    expect(knop).toContain('maandIngangTekst(');
    // de formulering staat alleen in de tekst-functie
    for (const vorm of [inline, knop]) {
      expect(vorm).not.toContain('Wil je kijken');
      expect(vorm).not.toContain('afspraak over maken');
    }
    expect(tekst).toContain('Wil je kijken waar die');
  });

  test('de route naar de editor verhuist mee en verdwijnt niet', async ({ page }) => {
    await boot(page);
    const sh = await sheetVan(page, 'dekking');
    expect(sh.html).toContain('openReserveringen()');
    expect(sh.tekst).toContain('Dekking reserveringen aanpassen');
  });
});

test.describe('e - geen bedrag waar er geen bedrag is', () => {
  test("een doel dat te laat is zegt de uitkomst met zijn voorwaarde, en geen bedrag", async ({ page }) => {
    await boot(page, { sparen: false, w: 360, set: { nfToegewezen: 500, nfDoelVast: 40000, reserveringen: [],
      goals: [{ id: 'g1', naam: 'Kosten Koper', doel: KK, gespaard: 0, streefdatum: PLUS(4), allocMode: 'auto' }] } });
    const invoer = await page.evaluate(() => { const r = maandRegels().find((x) => x.key === 'doel');
      return { status: r.status, telaat: !!r.telaat, tekort: r.tekortPerMaand, gat: maandTekort(r),
        start: (r.oorzaak || '') }; });
    expect(invoer.status).toBe('tekort');
    expect(invoer.telaat, 'de telaat-tak, en dus per v243 geen bedrag per maand').toBe(true);
    expect(invoer.tekort).toBe(0);
    expect(invoer.gat).toBe(null);
    const r = await regels(page);
    expect(r.map((x) => x.key)).toContain('doel');
    const doel = r.find((x) => x.key === 'doel');
    expect(doel.bedrag).toEqual(['niet te halen', 'zolang je buffer voorgaat']);
    expect(doel.tekst).toMatch(/buffer pas vol rond \w+ \d{4}/);
    // en de sheet zegt hetzelfde, uit dezelfde bron
    const sh = await sheetVan(page, 'doel');
    expect(sh.bedrag).toEqual(doel.bedrag);
    expect(sh.knop).toBe('Wil je kijken wat je met deze datum wilt?');
  });

  test('een structureel signaal draagt rechts niets, en de oorzaak komt uit l1', async ({ page }) => {
    await boot(page, { boodschappen: 1500, w: 360,
      set: { budgets: { huur: 900, boodschappen: 200 }, limit: 20, reserveringen: [], goals: [] } });
    const invoer = await page.evaluate(() => { const s = maandStructureel();
      return s.map((r) => ({ key: r.key, status: r.status, naam: r.naam, oorzaak: r.oorzaak,
        l1: r.sig.l1, l2: r.sig.l2, gat: maandTekort(r) })); });
    const sig = invoer.find((x) => x.status === 'tekort');
    expect(sig, 'de fixture draagt een structureel signaal met status tekort').toBeTruthy();
    expect(sig.gat, 'maandTekort geeft bij een structurele rij bij ontwerp null').toBe(null);
    expect(sig.oorzaak).toBe(sig.l1);
    expect(sig.oorzaak, 'en dat is een ANDERE string dan de naam').not.toBe(sig.naam);
    const r = await regels(page);
    expect(r.map((x) => x.key)).toContain(sig.key);
    const rij = r.find((x) => x.key === sig.key);
    expect(rij.kleur, 'een structureel signaal heeft geen tegel maar een Let op-regel').toBe(null);
    expect(rij.bedrag, 'rechts staat niets en alleen de chevron').toEqual([]);
    expect(rij.tekst).toContain(sig.oorzaak);
    // en de Let op-regel op Grip noemt diezelfde oorzaak
    const letop = await page.evaluate(() => [...document.querySelectorAll('#s-maand [data-letop="str"]')].map((x) => x.innerText).join('\n'));
    expect(letop).toContain(sig.oorzaak);
    // de sheet draagt l2, de zin die in de kaart nooit heeft gestaan
    const sh = await sheetVan(page, sig.key);
    expect(sh.tekst).toContain(sig.l2);
    expect(sh.bedrag).toEqual([]);
    expect(sh.knop).toBe('Wil je hier een afspraak over maken?');
    // geen 'aanpassen' bij een signaal zonder editor
    expect(sh.tekst).toContain('Bekijken');
    expect(sh.tekst).not.toContain('aanpassen');
  });
});

test.describe('f - de zin over niets te beslissen zegt wat de poort toetst', () => {
  test('met twee beslissingen staat hij er niet', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => {
      const R = maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel()));
      return { tekort: R.filter((r) => r.status === 'tekort').length,
        ok: R.filter((r) => r.status === 'ok').length,
        ingang: maandCoachIngang(R), scherm: document.querySelector('#s-maand').innerText }; });
    expect(d.tekort, 'de invoer: er staan beslissingen').toBe(2);
    expect(d.ok, 'en er is ook een ok-rij, de oude poort').toBeGreaterThan(0);
    expect(d.ingang).toBe('');
    expect(d.scherm).not.toContain('niets te beslissen');
  });

  test('zonder beslissing en zonder aandacht staat hij er wel', async ({ page }) => {
    await boot(page, { set: { reserveringen: [], goals: [] } });
    const d = await page.evaluate(() => {
      const R = maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel()));
      return { tekort: R.filter((r) => r.status === 'tekort').length,
        letop: R.filter((r) => r.status === 'let op').length,
        ok: R.filter((r) => r.status === 'ok').length,
        scherm: document.querySelector('#s-maand').innerText,
        pop: (openAfsluiting(valtOpYmPlus(thisYM(), -1)), document.querySelector('#sheet').innerText) }; });
    expect(d.tekort).toBe(0);
    expect(d.letop).toBe(0);
    expect(d.ok).toBeGreaterThan(0);
    // v349: hij staat in de pop-up van de maandafsluiting en niet meer op Grip.
    expect(d.pop).toContain('niets te beslissen');
    expect(d.scherm).not.toContain('niets te beslissen');
  });

  test('een regel die aandacht vraagt houdt hem ook weg', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => maandCoachIngang([
      { key: 'buffer', status: 'ok' }, { key: 'doel', status: 'let op' }]));
    expect(d).toBe('');
    // en met alleen ok staat hij er
    const e = await page.evaluate(() => maandCoachIngang([{ key: 'buffer', status: 'ok' }]));
    expect(e).toContain('niets te beslissen');
  });

  test('de ok-eis blijft ernaast staan: alleen onbekend geeft geen ingang', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => maandCoachIngang([{ key: 'dekking', status: 'onbekend' }]));
    expect(d).toBe('');
  });
});

/* v340: blok g (de hoogte van de kaart 'Vraagt een beslissing' en de lijstregels van 49px boven de
   vouw) is vervallen, want die kaart bestaat niet meer: de beslissingen zijn tegels. */
