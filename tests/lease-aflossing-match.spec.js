// v88: schuld<->aflossing-koppeling. Het gemelde geval: een financial-lease-schuld "auto lease"
// (€537) werd op bedrag gematcht aan een terugkerende INTERNE overboeking van ~€537 i.p.v. aan de
// echte Hiltermann-termijn (€537,33), waardoor Vermogen amber "loopt als interne overboeking" toonde.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

const PER = 537, TERMIJN = 537.33, INTERN = 537;

// lease = echte uitgave (vervoer), intern = eigen overboeking van toevallig hetzelfde bedrag
function seedLease({ lease = true, intern = true, duo = false, tweede = false } = {}) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const add = (id, m, day, amount, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  // de interne overboeking staat vóór de lease in de lijst: de oude selectie liep de groepen in
  // vindvolgorde af en hield bij een gelijke stand de eerste vast — precies waar het misging
  for (const m of [M2, M1, CUR]) if (intern) add('int-' + m, m, '26', -INTERN, 'Privérekening', 'PERIODIEKE OVERBOEKING NAAR PRIVEREKENING');
  for (const m of [M2, M1, CUR]) {
    if (lease) add('lease-' + m, m, '10', -TERMIJN, 'Hiltermann Lease Groep', 'SEPA INCASSO HILTERMANN LEASECONTRACT 4471');
    if (duo) add('duo-' + m, m, '27', -145, 'DUO Groningen', 'SEPA INCASSO DUO GRONINGEN STUDIESCHULD');
    if (tweede) add('tw-' + m, m, '18', -520, 'Kredietbank Zuid', 'SEPA INCASSO KREDIETBANK ZUID TERMIJN');
  }
  p.minder_tx = JSON.stringify(tx);
  return p;
}
const DEBT_LEASE = { id: 'dl', naam: 'auto lease', type: 'financiallease', rest: 9000, start: 18000, perMaand: PER, rente: 6, autoBezit: true, dagwaarde: 16000 };

async function boot(page, payload, debts = [DEBT_LEASE]) {
  await open(page, payload || seedLease());
  await page.evaluate((ds) => { SET.debts = ds; SET.openSchuld = true; save(); render(); go('vermogen'); }, debts);
  await page.waitForTimeout(80);
}
const status = (page, id) => page.evaluate((i) => debtInExpenses((SET.debts || []).find((d) => d.id === i)), id);

test.describe('a · het gemelde geval', () => {
  test('de lease koppelt aan de echte termijn, niet aan de interne overboeking', async ({ page }) => {
    await boot(page);
    // eerst vastleggen dat de situatie écht dubbelzinnig is: beide groepen vallen binnen de tolerantie
    const ambigu = await page.evaluate((per) => {
      const tol = Math.max(per * 0.12, 15), win = new Set(months().slice(-6)), g = {};
      for (const t of TX) { if (t.pending || !(t.amount < 0) || !win.has(t.date.slice(0, 7))) continue; const k = recurKey(t); if (!k) continue; (g[k] = g[k] || []).push(Math.abs(t.amount)); }
      const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
      return Object.keys(g).filter((k) => g[k].length >= 2 && Math.abs(med(g[k]) - per) <= tol).length;
    }, PER);
    expect(ambigu).toBeGreaterThanOrEqual(2);                       // twee kandidaten op bedrag alleen

    // en dat de óude selectie (alleen naam+bedrag, eerst gevonden wint) hier de interne groep pakte
    const oud = await page.evaluate((id) => {
      const d = (SET.debts || []).find((x) => x.id === id), per = +d.perMaand, tol = Math.max(per * 0.12, 15);
      const win = new Set(months().slice(-6)), groups = {};
      for (const t of TX) {
        if (t.pending || !(t.amount < 0) || !win.has(t.date.slice(0, 7))) continue;
        const k = recurKey(t); if (!k) continue;
        const g = (groups[k] = groups[k] || { amts: [], yms: new Set(), expense: 0, intern: 0, other: 0 });
        g.amts.push(Math.abs(t.amount)); g.yms.add(t.date.slice(0, 7));
        if (isExpenseTx(t)) g.expense++; else if (catOf(t) === 'intern') g.intern++; else g.other++;
      }
      const dn = recurKey({ name: d.naam }), med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
      let best = null;
      for (const k in groups) {
        const g = groups[k]; if (g.yms.size < 2) continue;
        const m = med(g.amts), amt = Math.abs(m - per) <= tol, nm = !!(dn && k && (k.indexOf(dn) >= 0 || dn.indexOf(k) >= 0));
        if (!amt && !nm) continue;
        const cls = (g.expense >= g.intern && g.expense >= g.other) ? 'expense' : (g.intern >= g.other ? 'intern' : 'other');
        const score = (nm ? 2 : 0) + (amt ? 1 : 0);
        if (!best || score > best.score) best = { cls, score };
      }
      return best ? (best.cls === 'expense' ? 'in-uitgaven' : (best.cls === 'intern' ? 'intern' : 'buiten-uitgaven')) : 'niet-gevonden';
    }, 'dl');
    expect(oud).toBe('intern');                                     // precies de gemelde amber-regel

    const det = await status(page, 'dl');
    expect(det.status).toBe('in-uitgaven');                          // groen, zoals DUO
    expect(det.bedrag).toBe(537);                                    // de echte termijn (537,33 -> afgerond)

    const scherm = await page.locator('#s-vermogen').innerText();
    // v100: deze regel heette "aflossing herkend in je uitgaven" en las alsof de schuldstand was
    // bijgewerkt. Ze gaat over de MAANDBETALING in je uitgaven; de stand blijft handmatig.
    // Zie tests/restschuld-bijwerken.spec.js.
    expect(scherm).toContain('maandbetaling');
    expect(scherm).not.toContain('loopt als interne overboeking');
  });

  test('zonder de lease-uitgave blijft de interne overboeking de eerlijke uitkomst (v41)', async ({ page }) => {
    await boot(page, seedLease({ lease: false, intern: true }));
    const det = await status(page, 'dl');
    expect(det.status).toBe('intern');
    expect(await page.locator('#s-vermogen').innerText()).toContain('loopt als interne overboeking');
  });

  test('helemaal geen passende groep: niet-gevonden', async ({ page }) => {
    await boot(page, seedLease({ lease: false, intern: false }));
    expect((await status(page, 'dl')).status).toBe('niet-gevonden');
  });

  test('geen maandbedrag: geen oordeel', async ({ page }) => {
    await boot(page, seedLease(), [Object.assign({}, DEBT_LEASE, { perMaand: 0 })]);
    expect((await status(page, 'dl')).status).toBe('geen');
  });
});

test.describe('b · de rest blijft werken', () => {
  test('DUO koppelt gewoon aan zijn incasso', async ({ page }) => {
    await boot(page, seedLease({ duo: true }), [
      DEBT_LEASE,
      { id: 'dd', naam: 'DUO', type: 'studie', rest: 12000, perMaand: 145, rente: 2.6 },
    ]);
    const duo = await status(page, 'dd');
    expect(duo.status).toBe('in-uitgaven');
    expect(duo.bedrag).toBe(145);
    expect(duo.conf).toBe('hoog');                                   // naam én bedrag
    expect((await status(page, 'dl')).status).toBe('in-uitgaven');    // en de lease nog steeds ook
  });

  test('een naam-match blijft leidend, ook zonder lease-vlag', async ({ page }) => {
    await boot(page, seedLease({ lease: false, intern: false, duo: true }), [
      { id: 'dd', naam: 'DUO Groningen', type: 'studie', rest: 12000, perMaand: 900, rente: 2.6 },   // bedrag klopt niet
    ]);
    const duo = await status(page, 'dd');
    expect(duo.status).toBe('in-uitgaven');
    expect(duo.conf).toBe('mogelijk');                                // alleen naam
    expect(duo.bedrag).toBe(145);
  });

  test('geen kruismatch tussen twee schulden van vergelijkbaar bedrag', async ({ page }) => {
    await boot(page, seedLease({ tweede: true }), [
      DEBT_LEASE,
      { id: 'dk', naam: 'Kredietbank Zuid', type: 'lening', rest: 4000, perMaand: 520, rente: 8 },
    ]);
    const lease = await status(page, 'dl'), krediet = await status(page, 'dk');
    expect(lease.bedrag).toBe(537);                                   // ieder zijn eigen groep
    expect(krediet.bedrag).toBe(520);
    expect(lease.status).toBe('in-uitgaven');
    expect(krediet.status).toBe('in-uitgaven');
  });

  test('een niet-lease-schuld krijgt geen lease-voorkeur, maar wel de uitgave-voorkeur', async ({ page }) => {
    // zelfde data, maar de schuld is een gewone lening: de expense-groep (b) moet nog steeds winnen
    await boot(page, seedLease(), [Object.assign({}, DEBT_LEASE, { type: 'lening', naam: 'autolening' })]);
    expect((await status(page, 'dl')).status).toBe('in-uitgaven');
  });
});
