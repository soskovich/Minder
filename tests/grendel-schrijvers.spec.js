// v245: de grendel op elke route, en de pijltjes die zeggen wat ze doen.
//
// AANLEIDING, en de meting die hem tegensprak. Gemeld: het pijltje omlaag bij het noodfonds
// verschoof het doel van plek 1 naar plek 2 terwijl de grendel dicht was. Het diagnosescherm van
// v244, gedraaid op het toestel zelf, liet zien dat dat op v244 niet kan: `Noodfonds omlaag:
// GEBLOKKEERD`. Wat de uitlezing wél liet zien is dat datzelfde pijltje als een gewone actieve
// knop rendeerde. De reparatie zit dus niet in de grendel maar in wat de knop belooft.
//
// DRIE ROUTES, ÉÉN REGEL. planMove() had de check, planPromoteDebt() en setNfAlloc() niet.
// De twee bronzoekende tests onderaan zijn het echte slot: ze lezen index.html en eisen dat
// ELKE schrijver van SET.randorde en elke schrijver van een vast maandbedrag door de bijbehorende
// grens gaat. Komt er een vierde schrijver bij, dan faalt de suite bij het bouwen. Dat is bewust
// gekozen boven een correctie bij het lezen: die zou het volgende lek stil genezen.
//
// DE FIXTURE IS DIE VAN HET TOESTEL. Tot nu toe stond de buffer in deze specs op 9.000 van 40.000,
// dus 31.000 te gaan en elf maanden. De gemelde toestand was 1.100 van 5.301: 4.201 te gaan bij
// een inleg van 3.000, dus twee maanden. Het diagnosescherm liet zien dat fixture en werkelijkheid
// andere paden kunnen nemen, dus staat die toestand hier als eigen geval, naast een buffer die
// binnen één maand vol is.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 40000,
    nfToegewezen: o.nfToe != null ? o.nfToe : 9000,
    nfToegewezenMigrated: true,
    goals: o.goals || [],
    debts: o.debts || [],
    planAlloc: o.planAlloc || { noodfonds: { allocMode: 'auto' } },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
// de toestand van het toestel: 1.100 van 5.301, inleg 3.000, dus 4.201 te gaan en twee maanden
const TOESTEL = { nfDoel: 5301, nfToe: 1100 };
// bijna vol: wat er nog te gaan is past binnen één maand inleg
const BIJNA = { nfDoel: 5301, nfToe: 5200 };
const VOL = { nfDoel: 5301, nfToe: 5301 };
const DRIE = [
  { id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, allocMode: 'auto', streefdatum: '2028-06' },
  { id: 'g2', naam: 'Inrichting woning', doel: 3000, gespaard: 0, allocMode: 'auto', streefdatum: '2029-01' },
];
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planMoveMag === 'function');
  await page.evaluate(() => go('vooruit'));
}
const orde = (page) => page.evaluate(() => planItems().map((x) => x.id));

/* De pijltjes van één rij, gelezen uit de DOM zoals ze op het scherm staan: is het een knop of een
   uitgegrijsde span. Het anker is de rij-positie in de lijst, niet een tekst. */
async function pijlen(page, index) {
  return page.evaluate((i) => {
    const rijen = [...document.querySelectorAll('#s-vooruit .plan-mv')];
    const per = [];
    for (let k = 0; k < rijen.length; k += 2) per.push([rijen[k], rijen[k + 1]]);
    const r = per[i];
    if (!r) return null;
    const lees = (el) => (!el ? null : { tag: el.tagName.toLowerCase(), off: el.classList.contains('off') });
    return { op: lees(r[0]), neer: lees(r[1]) };
  }, index);
}

test.describe('a · de pijltjes zeggen wat ze doen', () => {
  test('dichte grendel op de toestand van het toestel: beide pijltjes bij het noodfonds staan uit',
    async ({ page }) => {
      await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
      // eerst vaststellen dat dit werkelijk de gemelde toestand is
      expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 4201, maanden: 2 });
      const nf = await pijlen(page, 0);
      expect(nf.op).toEqual({ tag: 'span', off: true });     // geen buur boven
      expect(nf.neer).toEqual({ tag: 'span', off: true });   // langs de buffer heen mag niet
    });

  test('en het doel er direct onder heeft zijn pijltje omhoog uit, dat omlaag aan', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    const g1 = await pijlen(page, 1);
    expect(g1.op).toEqual({ tag: 'span', off: true });
    expect(g1.neer).toEqual({ tag: 'button', off: false });
  });

  test('een buffer die bijna vol is gedraagt zich net zo: bijna vol is niet vol', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, BIJNA));
    expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 101, maanden: 1 });
    expect((await pijlen(page, 0)).neer).toEqual({ tag: 'span', off: true });
    expect((await pijlen(page, 1)).op).toEqual({ tag: 'span', off: true });
  });

  test('zodra de buffer vol is gaan ze vanzelf aan, zonder knop en zonder vlag', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL));
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    expect((await pijlen(page, 0)).neer).toEqual({ tag: 'button', off: false });
    expect((await pijlen(page, 1)).op).toEqual({ tag: 'button', off: false });
  });

  test('de rand van de lijst blijft uit staan, ook met een open grendel', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL));
    expect((await pijlen(page, 0)).op).toEqual({ tag: 'span', off: true });
    expect((await pijlen(page, 2)).neer).toEqual({ tag: 'span', off: true });
  });

  test('onderling schuiven onder de buffer mag en werkt, ook bij een dichte grendel', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    const knop = page.locator('#s-vooruit .plan-mv').nth(3);   // rij 1 (g1), pijltje omlaag
    await knop.click();
    expect(await orde(page)).toEqual(['noodfonds', 'g2', 'g1']);
  });

  test('de knop die er staat doet ook echt iets: het pijltje van het noodfonds is er geen',
    async ({ page }) => {
      // het bewijs dat de uitgegrijsde vorm geen knop is: er hangt geen onclick aan
      await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
      const heeftHandler = await page.evaluate(() =>
        [...document.querySelectorAll('#s-vooruit .plan-mv')].slice(0, 2).some((el) => el.hasAttribute('onclick')));
      expect(heeftHandler).toBe(false);
    });

  test('planMoveMag is de enige poort: de rij en planMove() beslissen niet apart', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    // elke rij: wat de DOM toont moet gelijk zijn aan wat planMoveMag zegt
    const paren = await page.evaluate(() => planItems().map((it, i) => ({
      i, id: it.id, op: planMoveMag(it.id, -1), neer: planMoveMag(it.id, 1) })));
    for (const p of paren) {
      const d = await pijlen(page, p.i);
      expect(d.op.tag === 'button', `rij ${p.i} omhoog`).toBe(p.op);
      expect(d.neer.tag === 'button', `rij ${p.i} omlaag`).toBe(p.neer);
    }
  });
});

test.describe('b · planPromoteDebt', () => {
  const MET_SCHULD = { debts: [{ id: 'd1', naam: 'Lening', start: 8000, rest: 6000, perMaand: 200, rente: 6 }] };

  test('met een dichte grendel zet hij het aflossen niet bovenaan', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL, MET_SCHULD));
    const voor = await orde(page);
    await page.evaluate(() => planPromoteDebt('d1'));
    expect(await orde(page)).toEqual(voor);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).planOrder))
      .toEqual(['noodfonds', 'g1', 'g2']);
  });

  test('en hij zegt hetzelfde als planMove(), want het is dezelfde regel', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL, MET_SCHULD));
    await page.evaluate(() => planPromoteDebt('d1'));
    const a = await page.locator('#toast').textContent();
    await page.evaluate(() => planMove('noodfonds', 1));
    const b = await page.locator('#toast').textContent();
    expect(a.trim()).toBe(b.trim());
    expect(a).toContain('buffer gaat eerst');
  });

  test('met een volle buffer doet hij gewoon zijn werk', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL, MET_SCHULD));
    await page.evaluate(() => planPromoteDebt('d1'));
    expect((await orde(page))[0]).toBe('af:d1');
  });
});

test.describe('c · setNfAlloc', () => {
  test('met een dichte grendel verandert een maandbedrag op het noodfonds niets', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, TOESTEL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 250 } } }));
    await page.evaluate(() => setNfAlloc('perMaand', '9000'));
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(250);
  });

  test('met een open grendel geldt de harde grens van v242', async ({ page }) => {
    // gemeten vóór deze ronde: 99.000 per maand bij een capaciteit van 3.000 ging er zo in
    await boot(page, Object.assign({ goals: DRIE }, VOL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 0 } } }));
    expect(await page.evaluate(() => planCapacity())).toBe(3000);
    await page.evaluate(() => { window._nfSheet = true; setNfAlloc('perMaand', '99000'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(0);
    expect(await page.evaluate(() => planVastSom(null))).toBeLessThanOrEqual(3000);
  });

  test('een bedrag binnen de grens gaat er gewoon in', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 0 } } }));
    await page.evaluate(() => { window._nfSheet = true; setNfAlloc('perMaand', '1200'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(1200);
  });

  test('zijn eigen bedrag telt niet tegen zichzelf: opnieuw opslaan mag', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 3000 } } }));
    await page.evaluate(() => { window._nfSheet = true; setNfAlloc('perMaand', '3000'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(3000);
  });
});

/* ===== de twee bronzoekende tests =====
 * Niet "werkt route X", maar "bestaat er een route die de regel omzeilt". Een test op de drie
 * routes die we kennen gaat groen bij een vierde die we niet kennen, en dat is precies hoe
 * planPromoteDebt() jarenlang ongezien bleef terwijl plan-prioriteit.spec.js groen stond.
 */
const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
/* Comments eruit, maar niet de // in een URL of in een string; blokcomments worden vervangen door
   spaties zodat de regelnummers in een foutmelding blijven kloppen. Overgenomen uit
   lokale-kalenderdag.spec.js, dezelfde valkuil (een te agressieve strip maakt schrijvers onzichtbaar). */
function strip(t) {
  t = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return t.split('\n').map((ln) => {
    const m = /(^|[\s;})])\/\/(?!\/)/.exec(ln);
    if (!m) return ln;
    const voor = ln.slice(0, m.index + m[1].length);
    if (/http/.test(ln.slice(Math.max(0, m.index - 8), m.index))) return ln;
    const even = (x, c) => (x.split(c).length - 1) % 2 === 0;
    if (!even(voor, "'") || !even(voor, '"') || !even(voor, '`')) return ln;
    return voor;
  }).join('\n');
}
const CODE = strip(BRON);

/* De functie waarin een positie in de bron valt, plus zijn body. De koppen worden één keer
   verzameld en op positie gezocht, niet door vóór de treffer opnieuw te matchen: dat laatste laat
   de kop van de functie waar je ín zit buiten beeld zodra de treffer vóór het haakje ligt, en dan
   krijgt `function setPlanAlloc(` de naam van de functie erbóven. Die fout maakte deze test eerst
   rood op iets wat niet stuk was. Code buiten elke functie krijgt de naam van de laatste kop
   ervoor; hier schrijft niets op dat niveau, en een schrijver die daar zou bijkomen valt alsnog op
   omdat zijn body de grens dan niet noemt. */
const HEADERS = [...CODE.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ i: m.index, naam: m[1] }));
function functieRond(index) {
  let h = null;
  for (const x of HEADERS) { if (x.i <= index) h = x; else break; }
  if (!h) return null;
  const volgende = HEADERS.find((x) => x.i > h.i);
  return { naam: h.naam, body: CODE.slice(h.i, volgende ? volgende.i : CODE.length) };
}
function schrijvers(re) {
  const uit = [];
  let m;
  const r = new RegExp(re.source, 'g');
  while ((m = r.exec(CODE)) !== null) {
    const f = functieRond(m.index);
    const nr = CODE.slice(0, m.index).split('\n').length;
    uit.push({ regel: nr, tekst: CODE.split('\n')[nr - 1].trim(), fn: f && f.naam, body: f && f.body });
  }
  return uit;
}

test.describe('d · de bron: elke schrijver gaat door de grens', () => {
  test('bij een dichte grendel staat het noodfonds op plek 1, en geen schrijver van SET.planOrder omzeilt dat',
    () => {
      const w = schrijvers(/SET\.planOrder\s*=/);
      expect(w.length, 'geen enkele schrijver gevonden: de zoekvorm klopt niet meer').toBeGreaterThan(0);
      const ongedekt = w.filter((x) => {
        // planForget() haalt alleen een id wég. planItems() zet het noodfonds vooraan terug zodra
        // hij niet in de lijst staat (de unshift-tak), dus deze schrijver kan de invariant niet breken.
        if (x.fn === 'planForget') return false;
        return !/planGrendel\(\)|planMoveMag\(/.test(x.body || '');
      });
      expect(ongedekt.map((x) => `${x.fn} (regel ${x.regel}): ${x.tekst}`)).toEqual([]);
    });

  test('de unshift-tak in planItems() is er nog: daar leunt de uitzondering voor planForget op', () => {
    const f = functieRond(CODE.indexOf('\nfunction planItems('));
    expect(f.naam).toBe('planItems');
    expect(f.body).toMatch(/seen\.has\(PLAN_NF\)[\s\S]*unshift/);
  });

  /* Een vast maandbedrag belandt op precies twee plekken: in SET.planAlloc[id].perMaand, en dat
     gaat altijd door setPlanAlloc(), en in een doel via saveGoal(). De test zoekt dus op de
     opslagroute en niet op de vorm van het bedrag: een nieuwe schrijver mag zijn variabele noemen
     zoals hij wil, maar hij komt er niet langs setPlanAlloc() vandaan. Een aanroeper die alleen
     een modus zet noemt perMaand niet en heeft de grens niet nodig; zodra hij er wél een bedrag
     bij zet valt hij hier om. */
  test('elke schrijver van een vast maandbedrag gaat door planVastRuimte()', () => {
    const w = schrijvers(/setPlanAlloc\(/);
    expect(w.length, 'geen enkele schrijver gevonden: de zoekvorm klopt niet meer').toBeGreaterThan(0);
    const ongedekt = w.filter((x) => {
      if (x.fn === 'setPlanAlloc') return false;               // de opslagfunctie zelf, geen route
      if (!/perMaand/.test(x.body || '')) return false;        // zet alleen een modus, geen bedrag
      return !/planVastRuimte\(/.test(x.body || '');
    });
    expect(ongedekt.map((x) => `${x.fn} (regel ${x.regel}): ${x.tekst}`)).toEqual([]);
  });

  test('en saveGoal(), de andere opslagroute, gaat er ook doorheen', () => {
    const f = functieRond(CODE.indexOf('\nfunction saveGoal('));
    expect(f.naam).toBe('saveGoal');
    expect(f.body).toMatch(/planVastRuimte\(/);
  });

  test('de drie routes die we kennen staan er alle drie bij', () => {
    const w = schrijvers(/setPlanAlloc\(/).map((x) => x.fn);
    expect(w).toContain('setPlanAllocVeld');
    expect(w).toContain('setNfAlloc');
    expect(schrijvers(/SET\.planOrder\s*=/).map((x) => x.fn)).toContain('planPromoteDebt');
  });
});
