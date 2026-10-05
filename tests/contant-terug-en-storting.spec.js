// v342: een lening die contant terugkomt, en contant geld dat je weer stort.
//
// AANLEIDING (v341, nagelezen): "Nog open" lager zetten liet de vordering dalen zonder dat het geld ergens
// bij kwam, dus je netto vermogen daalde terwijl je niets kwijt was. En een storting van contant geld ging
// niet van je contante stand af: isOpnameTx() kent alleen afschrijvingen. Bij de volgende telling werd het
// verschil dan geboekt als "Contant besteed", een uitgave die je niet deed.
//
// HET GEVAL VAN DE GEBRUIKER: Ma €400 contant terug. Netto vermogen gelijk, contant +€400. Daarna €400
// gestort: contant terug op de oude stand, geen inkomen, en bij de volgende telling geen "Contant besteed".
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum } = require('./vaste-dag');

const now = vasteDatum();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (m, day, amount, naam, desc) =>
    tx.push({ id: 'x' + tx.length, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M1, CUR]) {
    add(m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  add(M1, '12', -400, 'Ma', 'SEPA OVERBOEKING MA LENING');
  add(M1, '14', -300, 'Pam', 'SEPA OVERBOEKING PAM LENING');
  for (const e of (o.extra || [])) add(e.m || CUR, e.day, e.amount, e.naam, e.desc);
  const set = Object.assign({
    limit: 70, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 0 },
    budgets: { huur: 1200 }, savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true },
  }, o.set || {});
  /* De telling ligt op dag 01 van deze maand, zodat elke boeking van vandaag erna valt. */
  if (o.telling !== false) set.contant = { stand: 50, datum: CUR + '-01' };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, o) {
  await pinDag(page);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof loanContantOntvangen === 'function' && typeof contantVerwacht === 'function');
  /* De leningen via de echte route: de boeking op Uitgeleend zetten met markLoan(). */
  await page.evaluate(() => {
    for (const w of ['MA LENING', 'PAM LENING']) { const t = TX.find((x) => x.desc.includes(w)); markLoan(t.id, 'uit', 'lening'); }
    window.lening = (naam) => loans().find((l) => l.naam.toUpperCase().startsWith(naam));
    window.boekVandaag = (bedrag, naam, desc) => {
      const t = { date: vandaagYMD(), amount: bedrag, acc: OWN[0], name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); TX.sort((a, b) => a.date.localeCompare(b.date));
      applyOwnAccounts(); buildAccMeta(); save(); return t.id;
    };
    window.contantBesteed = () => TX.filter((t) => t.name === 'Contant besteed').map((t) => t.amount);
  });
}
// de sheet via de echte route: lening openen, de knop, het gevolg, bevestigen
async function contantTerug(page, naam, bedrag) {
  const id = await page.evaluate((n) => lening(n).id, naam);
  await page.evaluate((i) => openLoan(i), id);
  await page.click('[data-contantterug]');
  if (bedrag != null) { await page.fill('#lcBedrag', String(bedrag)); }
  const gevolg = await page.locator('[data-contantgevolg]').innerText();
  await page.click('[data-contantbevestig]');
  return gevolg;
}
const tel = (page, bedrag) => page.evaluate((b) => { contantTellen(); document.querySelector('#contInput').value = String(b); contantOpslaan(); }, bedrag);

test.describe('het geval: Ma €400 contant terug, daarna gestort', () => {
  test('contant terug: netto vermogen gelijk, contant +€400, vordering op nul', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ nw: netWorth().netto, c: contantVerwacht(), vord: netWorth().vord, open: lening('MA').open }));
    expect(voor.c).toBe(50);
    expect(voor.open).toBe(400);
    const gevolg = await contantTerug(page, 'MA');
    expect(gevolg).toContain('€400 → €0');
    expect(gevolg).toContain('€50 → €450');
    expect(gevolg).toMatch(/Netto vermogen: blijft/);
    const na = await page.evaluate(() => ({ nw: netWorth().netto, c: contantVerwacht(), vord: netWorth().vord, open: lening('MA').open, ins: SET.contantIn }));
    expect(na.nw).toBe(voor.nw);
    expect(na.c).toBe(450);
    expect(na.vord).toBe(voor.vord - 400);
    expect(na.open).toBe(0);
    expect(na.ins).toHaveLength(1);
    expect(na.ins[0]).toMatchObject({ bedrag: 400, naam: 'Ma' });
    expect(na.ins[0].loanId).toBe(await page.evaluate(() => lening('MA').id));
    expect(na.ins[0].datum).toBe(await page.evaluate(() => vandaagYMD()));
  });

  test('daarna €400 gestort: contant terug op de oude stand, geen inkomen, en de telling boekt niets', async ({ page }) => {
    await boot(page);
    await contantTerug(page, 'MA');
    const inkVoor = await page.evaluate(() => maandInkomen(thisYM()).alles);
    const nwVoor = await page.evaluate(() => netWorth().netto);
    /* de storting komt op je rekening, dus het banksaldo stijgt mee */
    const id = await page.evaluate(() => { SET.manualBal[OWN.find((a) => a.includes('MAIN'))] += 400;
      return boekVandaag(400, 'Geldmaat', 'GELDMAAT STORTING ZWANEBLOEM 9'); });
    const r = await page.evaluate((i) => { const t = TX.find((x) => x.id === i);
      return { s: contantStorting(t), cat: catOf(t), c: contantVerwacht(), ink: maandInkomen(thisYM()).alles, nw: netWorth().netto }; }, id);
    expect(r.s).toEqual({ bron: 'omschrijving' });
    expect(r.cat).toBe('intern');
    expect(r.c).toBe(50);
    expect(r.ink).toBe(inkVoor);
    expect(r.nw).toBe(nwVoor);
    await tel(page, 50);
    expect(await page.evaluate(() => contantBesteed())).toEqual([]);
  });

  test('zonder de herkenning boekte de telling de storting als "Contant besteed"', async ({ page }) => {
    /* De tegenproef: met een nee op de storting staat de stand 400 te hoog, en dan boekt de telling 400. */
    await boot(page);
    await contantTerug(page, 'MA');
    await page.evaluate(() => { const i = boekVandaag(400, 'Geldmaat', 'GELDMAAT STORTING ZWANEBLOEM 9'); contantStortNee(i); });
    expect(await page.evaluate(() => contantVerwacht())).toBe(450);
    await tel(page, 50);
    expect(await page.evaluate(() => contantBesteed())).toEqual([-400]);
  });
});

test.describe('contant terugontvangen: de rest van het gedrag', () => {
  // v343: dit was "meer dan er open staat telt niet", en dat liet de rest vallen terwijl het geld er was.
  // Wat er nu over meer dan open staat te zeggen is staat in lening-overschot.spec.js.
  test('een deel: Pam €100 van €300, en meer dan er open staat vraagt wat de rest is', async ({ page }) => {
    await boot(page);
    await contantTerug(page, 'PAM', 100);
    expect(await page.evaluate(() => [lening('PAM').open, contantVerwacht()])).toEqual([200, 150]);
    const gevolg = await (async () => {
      await page.evaluate(() => openLoan(lening('PAM').id));
      await page.click('[data-contantterug]');
      await page.fill('#lcBedrag', '900');
      return page.locator('[data-contantgevolg]').innerText();
    })();
    expect(gevolg).toContain('€200 → €0');
    expect(gevolg).not.toContain('maar €200 open');
    expect(gevolg).toContain('Contant: €150 → €1.050');
    expect(await page.locator('[data-overschot]').innerText()).toContain('€700 meer dan er open stond');
  });

  test('het gevolg schrijft niets: openen en annuleren laat alles staan', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => JSON.stringify([SET.contantIn || null, lening('MA').open, SET.contant]));
    await page.evaluate(() => openLoan(lening('MA').id));
    await page.click('[data-contantterug]');
    await page.fill('#lcBedrag', '250');
    await page.evaluate(() => closeSheet());
    expect(await page.evaluate(() => JSON.stringify([SET.contantIn || null, lening('MA').open, SET.contant]))).toBe(voor);
  });

  test('nog nooit geteld: eerst tellen, met het bedrag ingevuld, en geen dubbeltelling', async ({ page }) => {
    await boot(page, { telling: false });
    const nwVoor = await page.evaluate(() => netWorth().netto);
    await page.evaluate(() => openLoan(lening('MA').id));
    await page.click('[data-contantterug]');
    expect(await page.inputValue('#lcGeteld')).toBe('400');
    expect(await page.locator('[data-contantgevolg]').innerText()).toContain('nog niet geteld → €400');
    await page.click('[data-contantbevestig]');
    const r = await page.evaluate(() => ({ c: contantVerwacht(), nw: netWorth().netto, T: SET.contant, i: SET.contantIn[0] }));
    expect(r.c).toBe(400);                      // de telling bevat de ontvangst; hij telt niet nog eens
    expect(r.T.op).toBeGreaterThan(r.i.op);
    expect(r.nw).toBe(nwVoor);
    expect(await page.evaluate(() => contantBesteed())).toEqual([]);
  });

  test('nog nooit geteld en meer in je zak: het netto vermogen stijgt met dat overige geld, en de sheet zegt dat', async ({ page }) => {
    await boot(page, { telling: false });
    const nwVoor = await page.evaluate(() => netWorth().netto);
    await page.evaluate(() => openLoan(lening('MA').id));
    await page.click('[data-contantterug]');
    await page.fill('#lcGeteld', '460');
    expect(await page.locator('[data-contantgevolg]').innerText()).toContain('je overige contante geld telt voortaan mee');
    await page.click('[data-contantbevestig]');
    expect(await page.evaluate(() => netWorth().netto)).toBe(nwVoor + 60);
  });

  test('een ontvangst op de dag van je telling telt, als hij na die telling kwam', async ({ page }) => {
    await boot(page);
    await tel(page, 50);                         // vandaag geteld
    await contantTerug(page, 'MA');
    expect(await page.evaluate(() => contantVerwacht())).toBe(450);
    await tel(page, 450);                        // daarna weer geteld: de ontvangst zit nu in de telling
    expect(await page.evaluate(() => [contantVerwacht(), contantInSinds().length])).toEqual([450, 0]);
    expect(await page.evaluate(() => contantBesteed())).toEqual([]);
  });

  test('terugdraaien zet vordering en contant terug, en kan niet meer na een latere telling', async ({ page }) => {
    await boot(page);
    const nw0 = await page.evaluate(() => netWorth().netto);
    await contantTerug(page, 'MA');
    await page.evaluate(() => openLoan(lening('MA').id));
    expect(await page.locator('[data-contantinlijst]').innerText()).toContain('€400 contant terug');
    await page.locator('[data-contantinlijst] >> text=Terugdraaien').click();
    expect(await page.evaluate(() => [lening('MA').open, contantVerwacht(), (SET.contantIn || []).length, netWorth().netto])).toEqual([400, 50, 0, nw0]);
    await contantTerug(page, 'MA');
    await tel(page, 450);
    await page.evaluate(() => loanContantTerug(SET.contantIn[0].id));
    expect(await page.evaluate(() => [lening('MA').open, (SET.contantIn || []).length])).toEqual([0, 1]);
  });

  test('een contante ontvangst zet de contant-melding aan, net als een opname', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => contantVraagt())).toBe('');
    await contantTerug(page, 'MA');
    const r = await page.evaluate(() => ({ v: contantVraagt(), k: contantKaart() }));
    expect(r.v).toBe('gepind');
    expect(r.k).toContain('kreeg je €400 contant terug van Ma');
    expect(r.k).toContain('€450 contant');
  });

  test('geleend geld heeft de knop niet, en een volledig terugbetaalde lening ook niet', async ({ page }) => {
    await boot(page);
    await contantTerug(page, 'MA');
    await page.evaluate(() => openLoan(lening('MA').id));
    expect(await page.locator('[data-contantterug]').count()).toBe(0);
    await page.evaluate(() => { const t = boekVandaag(-200, 'Broer', 'SEPA OVERBOEKING BROER'); markLoan(t, 'in', 'lening'); });
    await page.evaluate(() => openLoan(loans().find((l) => l.richting === 'in').id));
    expect(await page.locator('[data-contantterug]').count()).toBe(0);
  });
});

test.describe('een storting van contant geld', () => {
  test('herkend op de omschrijving: Geldmaat en het losse woord storting, geen terugstorting', async ({ page }) => {
    await boot(page, { extra: [
      { day: '02', amount: 100, naam: 'Geldmaat', desc: 'GELDMAAT ZWANEBLOEM 9' },
      { day: '02', amount: 80, naam: 'ABN', desc: 'STORTING CONTANT GELD' },
      { day: '02', amount: 30, naam: 'Webwinkel', desc: 'TERUGSTORTING WEBWINKEL XYZ' },   // intern (onbekende bijschrijving), dus alleen het woord beslist
      { day: '02', amount: 60, naam: 'Onbekend', desc: 'SEPA OVERBOEKING VRIEND' },
    ] });
    const r = await page.evaluate(() => TX.filter((t) => t.amount > 0 && t.amount < 1000).map((t) => [t.desc, !!contantStorting(t)]));
    expect(r).toEqual(expect.arrayContaining([
      ['GELDMAAT ZWANEBLOEM 9', true], ['STORTING CONTANT GELD', true],
      ['TERUGSTORTING WEBWINKEL XYZ', false], ['SEPA OVERBOEKING VRIEND', false]]));
    expect(await page.evaluate(() => contantVerwacht())).toBe(50 - 180);
  });

  test('een storting van een eigen rekening is een overboeking', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const t = { date: vandaagYMD(), amount: 70, acc: OWN[0], name: 'Spaar', desc: 'STORTING VAN SPAARREKENING',
      typ: '', ref: '', src: 'csv', accName: '', refNums: [OWN[0]] }; categorize(t); TX.push(t); applyOwnAccounts(); save(); return !!contantStorting(t); });
    expect(r).toBe(false);
  });

  test('niet herkend: de keuze in de sheet, eerst het gevolg, dan geen inkomen en de stand omlaag', async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => boekVandaag(200, 'Werkgever', 'SALARIS VOORSCHOT'));
    const inkVoor = await page.evaluate(() => maandInkomen(thisYM()).alles);
    expect(await page.evaluate((i) => contantStorting(TX.find((t) => t.id === i)), id)).toBeNull();
    await page.evaluate((i) => openSheet(i), id);
    await page.click('[data-stortrij]');
    const g = await page.locator('[data-stortgevolg]').innerText();
    expect(g).toContain('€50 → €-150'.replace('€-', '-€'));
    expect(g).toContain('Telt nu als inkomen');
    expect(await page.evaluate(() => contantVerwacht())).toBe(50);          // het gevolg schrijft niets
    await page.click('[data-stortalleen]');
    const r = await page.evaluate((i) => { const t = TX.find((x) => x.id === i); return { s: contantStorting(t), c: contantVerwacht(), ink: maandInkomen(thisYM()).alles }; }, id);
    expect(r.s).toEqual({ bron: 'keuze' });
    expect(r.c).toBe(-150);
    expect(r.ink).toBe(inkVoor - 200);
    expect(await page.locator('[data-stortrij]').innerText()).toContain('jouw keuze bij deze boeking');
    await page.locator('[data-stortrij] >> text=Terugdraaien').click();
    expect(await page.evaluate((i) => [contantStorting(TX.find((t) => t.id === i)), contantVerwacht(), maandInkomen(thisYM()).alles], id)).toEqual([null, 50, inkVoor]);
  });

  test('een regel onthoudt het, en de sheet noemt wat hij nog meer raakt', async ({ page }) => {
    await boot(page, { extra: [{ m: M1, day: '20', amount: 90, naam: 'Kas', desc: 'KASSTORT HEMA 0012' }] });
    const id = await page.evaluate(() => boekVandaag(120, 'Kas', 'KASSTORT ZUID 0099'));
    await page.evaluate((i) => openContantStortVraag(i), id);
    // invoermeting: zonder regel staat de oude boeking op een uitgavencategorie, dus de regel moet hem omzetten
    expect(await page.evaluate(() => catOf(TX.find((t) => t.amount === 90)))).toBe('shopping');
    const knop = page.locator('[data-stortkenmerk="KASSTORT"]');
    expect(await knop.innerText()).toContain('maakt ook 1 andere bijschrijving tot storting');
    await knop.click();
    const r = await page.evaluate(() => TX.filter((t) => t.name === 'Kas').map((t) => [t.amount, contantStorting(t) && contantStorting(t).bron, catOf(t)]));
    expect(r).toEqual(expect.arrayContaining([[120, 'keuze', 'intern'], [90, 'regel', 'intern']]));
    // de oude ligt voor de telling en telt niet; de nieuwe wel
    expect(await page.evaluate(() => contantVerwacht())).toBe(50 - 120);
    await page.evaluate(() => contantStortRegelWeg(SET.contantStortRegels[0].id));
    expect(await page.evaluate(() => TX.filter((t) => t.name === 'Kas' && t.amount === 90).map((t) => [!!contantStorting(t), catOf(t)]))).toEqual([[false, 'shopping']]);
  });

  test('"geen storting" bij een herkende boeking: hij telt niet meer mee', async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => boekVandaag(100, 'Geldmaat', 'GELDMAAT STORTING'));
    expect(await page.evaluate(() => contantVerwacht())).toBe(-50);
    await page.evaluate((i) => openSheet(i), id);
    await page.locator('[data-stortrij] >> text=Geen storting').click();
    expect(await page.evaluate(() => contantVerwacht())).toBe(50);
    expect(await page.locator('[data-stortrij]').innerText()).toContain('je koos: geen storting');
  });

  test('een afschrijving krijgt de rij niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSheet(TX.find((t) => t.desc.includes('HUURBETALING')).id));
    expect(await page.locator('[data-stortrij]').count()).toBe(0);
  });
});

test.describe('blok 17 en de opslag', () => {
  test('blok 17 toont per bank hoe stortingen eruitzien, en waarom de app ze wel of niet herkent', async ({ page }) => {
    await boot(page, { extra: [
      { day: '02', amount: 100, naam: 'Geldmaat', desc: 'GELDMAAT STORTING ZWANEBLOEM' },
      { day: '02', amount: 40, naam: 'Kassa', desc: 'CASH DEPOSIT KASSA' },
      { day: '02', amount: -60, naam: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM' },
    ] });
    const blok = await page.evaluate(() => diagContantStorting().join('\n'));
    expect(blok).toMatch(/bank \S+.*: 2 bijschrijving/);
    expect(blok).toContain('+100 STORTING (omschrijving) | GELDMAAT STORTING ZWANEBLOEM');
    expect(blok).toContain('+40 geen storting: omschrijving herkent niet | CASH DEPOSIT KASSA');
    expect(blok).toContain('de nieuwste opname');
    expect(await page.evaluate(() => DIAG_BLOKKEN.some((b) => b.lees === diagContantStorting))).toBe(true);
  });

  test('blok 17 schrijft niets', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window._schrijf = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (...a) => { window._schrijf++; return o(...a); }; });
    await page.evaluate(() => diagContantStorting());
    expect(await page.evaluate(() => window._schrijf)).toBe(0);
  });

  test('contantStort reist mee met een samenvoeging', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => VLAG_MAPS.includes('contantStort'))).toBe(true);
  });
});

test.describe('layout op 360 en 390px', () => {
  for (const w of [360, 390]) {
    test(`de twee sheets en de rij lopen niet over op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page);
      const meet = () => page.evaluate(() => { const el = document.querySelector('#sheet');
        const r = el.getBoundingClientRect(); let over = 0;
        el.querySelectorAll('*').forEach((x) => { const b = x.getBoundingClientRect(); if (b.width && b.right > r.right + 0.5) over++; });
        return { over, scroll: el.scrollWidth - el.clientWidth, h: Math.round(el.scrollHeight) }; });
      await page.evaluate(() => openLoan(lening('MA').id));
      await page.click('[data-contantterug]');
      const a = await meet();
      const id = await page.evaluate(() => boekVandaag(200, 'Werkgever', 'SALARIS VOORSCHOT'));
      await page.evaluate((i) => openContantStortVraag(i), id);
      const b = await meet();
      await page.evaluate((i) => openSheet(i), id);
      const rij = await page.locator('[data-stortrij]').evaluate((e) => Math.round(e.getBoundingClientRect().height));
      console.log(`v342 ${w}px: contant-sheet ${a.h}px, storting-sheet ${b.h}px, rij ${rij}px`);
      for (const m of [a, b]) { expect(m.over).toBe(0); expect(m.scroll).toBeLessThanOrEqual(0); }
      expect(rij).toBeLessThan(80);
    });
  }
});
