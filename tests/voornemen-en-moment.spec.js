// v195: er bestonden twee complete parallelle voornemenlussen. SET.maandVoornemen (de
// verse-startkaart op Home) en de {type:'afspraak'}-entry in SET.coachLog (het maandgesprek):
// allebei een per maand, allebei optioneel aan een categorie gekoppeld, allebei met een terugblik
// die die categorie vergelijkt, allebei met een gezien-vlag. De coachlus blijft; de kaart is
// opgeheven en het moment dat hij belichaamde leeft voort als timing op Maand.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESE0000009999';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const VORIG = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

function seed(o = {}) {
  const n = o.maanden == null ? 4 : o.maanden;
  const MS = []; for (let k = n - 1; k >= 0; k--) MS.push(ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const tx = []; let i = 0;
  const add = (m, d, a, acc, naam, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc, name: naam, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    add(m, '02', 3000, MAIN, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, MAIN, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '04', -400, MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '05', -10, RES, 'Reserve', 'RESERVERING');
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 6000, [RES]: 250 }, savingMode: 'amount', savingAmount: 300,
    budgets: { huur: 900, boodschappen: 500 },
    resAcc: RES, reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, interval: 12, offset: 6 }],
    goals: [], planOrder: [] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}

/* De dag van de maand is de enige bron van het moment, dus die zetten we hier vast in plaats van
   te wachten tot de kalender meewerkt. Alleen getDate() wordt vervangen; elke andere Date-methode
   blijft de echte, zodat months(), thisYM() en de reeksen onaangeraakt doorlopen. */
async function boot(page, o = {}) {
  await page.route('**/sw.js', (r) => r.abort());
  if (o.dag != null) {
    await page.addInitScript((d) => {
      const echt = Date.prototype.getDate;
      Date.prototype.getDate = function () { const v = echt.call(this);
        return (this.getFullYear() === new Date().getFullYear() && this.getMonth() === new Date().getMonth()) ? d : v; };
    }, o.dag);
  }
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof verseStart === 'function');
}
const maand = async (page) => { await page.evaluate(() => go('maand'));
  await page.waitForSelector('#s-maand .card');
  return page.evaluate(() => $('#s-maand').innerText.replace(/\s+/g, ' ')); };

test.describe('a · de verse-startkaart bestaat niet meer', () => {
  test('de functies zijn weg, en Home rendert zonder', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      weg: ['freshStartCard', 'freshStartSave', 'freshStartDue', 'freshStartDismiss',
        'freshToggleCouple', 'voornemenCarry'].map((n) => typeof window[n]),
      // comments tellen niet als verwijzing (v165), dus die gaan er eerst uit
      dashSrc: renderDash.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''),
    }));
    for (const t of r.weg) expect(t).toBe('undefined');
    expect(r.dashSrc).not.toMatch(/freshStart|voornemen/i);
  });

  test('Home noemt geen voornemen en geen invoerveld', async ({ page }) => {
    await boot(page, { set: { maandVoornemen: { ym: VORIG, text: 'Minder bestellen' } } });
    await page.evaluate(() => go('dash'));
    await page.waitForSelector('#s-dash .homehero');
    const t = await page.evaluate(() => $('#s-dash').innerText.replace(/\s+/g, ' '));
    expect(t).not.toMatch(/voornemen/i);
    expect(t).not.toMatch(/nieuwe maand/i);
    expect(await page.locator('#s-dash #freshVoornemen').count()).toBe(0);
  });
});

test.describe('b · het maandmoment hangt aan de datum, niet aan een vlag', () => {
  for (const dag of [1, 4, 7]) {
    test(`dag ${dag}: de uitnodiging draagt de aanhef`, async ({ page }) => {
      await boot(page, { dag });
      expect(await page.evaluate(() => verseStart())).toBe(true);
      const t = await maand(page);
      expect(t).toMatch(/Nieuwe maand\./);
      expect(t).toMatch(/Zullen we .* doorlopen\?|Wil je toch iets doornemen\?/);
    });
  }

  for (const dag of [8, 20]) {
    test(`dag ${dag}: het moment is voorbij, de uitnodiging blijft`, async ({ page }) => {
      await boot(page, { dag });
      expect(await page.evaluate(() => verseStart())).toBe(false);
      const t = await maand(page);
      expect(t).not.toMatch(/Nieuwe maand\./);
      expect(t).toMatch(/Zullen we .* doorlopen\?|Wil je toch iets doornemen\?/);
    });
  }

  test('drie keer openen op dezelfde dag geeft drie keer hetzelfde', async ({ page }) => {
    await boot(page, { dag: 3 });
    const uit = [];
    for (let k = 0; k < 3; k++) {
      await page.evaluate(() => { go('dash'); go('maand'); });
      uit.push(await page.evaluate(() => $('#s-maand').innerText
        .replace(/Gelezen op[^\n]*/g, '').replace(/\s+/g, ' ')));
    }
    expect(uit[1]).toBe(uit[0]);          // v168: een gezien-vlag bepaalt nooit wat je ziet
    expect(uit[2]).toBe(uit[0]);
  });

  test('er is geen eigen gezien-vlag voor het moment', async ({ page }) => {
    await boot(page, { dag: 3 });
    const r = await page.evaluate(() => {
      const voor = JSON.parse(JSON.stringify(SET));
      go('maand'); go('maand');
      const na = SET;
      const sleutels = [...new Set(Object.keys(voor).concat(Object.keys(na)))]
        .filter((k) => JSON.stringify(voor[k]) !== JSON.stringify(na[k]));
      return { sleutels, src: verseStart.toString(), spec: JSON.stringify(MECHANISM_SPEC.freshStart) };
    });
    // v168: alleen de gelezen-datum mag bewegen, en die stuurt niets van wat je ziet
    expect(r.sleutels.filter((k) => k !== 'maandGelezen')).toEqual([]);
    expect(r.src).not.toMatch(/SET\./);          // geen state in de toets zelf
    expect(r.spec).toMatch(/geenGezienVlag/);
  });

  test('een nieuwe gebruiker zonder historie krijgt het moment ook', async ({ page }) => {
    await boot(page, { dag: 2, maanden: 1 });
    const r = await page.evaluate(() => ({ eerder: months().filter((m) => m < thisYM()).length,
      verse: verseStart(), src: verseStart.toString() }));
    expect(r.eerder).toBe(0);                    // geen enkele afgeronde maand
    expect(r.verse).toBe(true);                  // herzien 63: die eis sluit precies deze uit
    expect(r.src).not.toMatch(/months\(/);
    const t = await maand(page);
    expect(t).toMatch(/Nieuwe maand\./);
  });
});

test.describe('c · een afspraak van vorige maand staat er los van', () => {
  const metAfspraak = (dag) => ({ dag, set: { coachLog: [{ type: 'afspraak', text: 'Minder bestellen',
    cat: 'uiteten', ts: new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime() }] } });

  test('dag 3 met een afspraak van vorige maand: terugblik boven, uitnodiging onder', async ({ page }) => {
    await boot(page, metAfspraak(3));
    const t = await maand(page);
    expect(t).toMatch(/Je afspraak van vorige maand/i);      // de terugblik
    expect(t).toMatch(/Minder bestellen/);
    expect(t).toMatch(/Nieuwe maand\./);                      // en het moment eronder
  });

  test('dag 3 zonder afspraak van vorige maand: alleen de uitnodiging', async ({ page }) => {
    await boot(page, { dag: 3 });
    const t = await maand(page);
    expect(t).not.toMatch(/Je afspraak van vorige maand/i);
    expect(t).toMatch(/Nieuwe maand\./);
  });

  test('staat de afspraak van deze maand er al, dan is er niets meer te framen', async ({ page }) => {
    await boot(page, { dag: 3, set: { coachLog: [{ type: 'afspraak', text: 'Al vastgelegd',
      ts: Date.now() }] } });
    const t = await maand(page);
    expect(t).toMatch(/Je afspraak deze maand/i);
    expect(t).toMatch(/Al vastgelegd/);
    expect(t).not.toMatch(/Nieuwe maand\./);                  // een per maand, zonder tweede vlag
  });
});

test.describe('d · een openstaand voornemen krijgt zijn terugblik precies een keer', () => {
  const metVoornemen = (extra) => ({ dag: 3, set: Object.assign({
    maandVoornemen: { ym: VORIG, text: 'Minder bestellen' } }, extra || {}) });

  test('de terugblik staat op Maand, in de afspraaklus-vorm', async ({ page }) => {
    await boot(page, metVoornemen());
    const t = await maand(page);
    expect(t).toMatch(/Je voornemen van/i);
    expect(t).toMatch(/Je nam je voor: Minder bestellen/);
    expect(t).toMatch(/Gezien/);
    expect(t).not.toMatch(/Neem mee naar/);                   // die knop voedde de opgeheven lus
  });

  test('met een gekoppeld bedrag staat het cijfer erbij, zonder oordeel', async ({ page }) => {
    await boot(page, metVoornemen({ maandVoornemen: { ym: VORIG, text: 'Minder uit eten',
      cat: 'boodschappen', bedrag: 200 } }));
    const t = await maand(page);
    expect(t).toMatch(/Je koppelde dat aan onder €200 bij/);
    expect(t).toMatch(/Het werd €400\./);                     // de fixture boekt 400 per maand
    expect(t).not.toMatch(/gelukt|goed bezig/i);
  });

  test('na Gezien komt hij niet meer terug', async ({ page }) => {
    await boot(page, metVoornemen());
    expect(await maand(page)).toMatch(/Je voornemen van/i);
    await page.locator('#s-maand >> text=Gezien').first().click();
    await page.waitForTimeout(120);
    const na = await page.evaluate(() => $('#s-maand').innerText.replace(/\s+/g, ' '));
    expect(na).not.toMatch(/Je voornemen van/i);
    expect(await page.evaluate(() => SET.voornemenReflectedFor)).toBe(VORIG);
    // en ook niet na opnieuw openen
    await page.evaluate(() => { go('dash'); go('maand'); });
    expect(await page.evaluate(() => $('#s-maand').innerText)).not.toMatch(/Je voornemen van/i);
  });

  test('een al teruggeblikt voornemen staat er nooit', async ({ page }) => {
    await boot(page, metVoornemen({ voornemenReflectedFor: VORIG }));
    expect(await maand(page)).not.toMatch(/Je voornemen van/i);
  });

  test('een voornemen van deze maand is geen terugblik', async ({ page }) => {
    await boot(page, { dag: 3, set: { maandVoornemen: { ym: CUR, text: 'Van nu' } } });
    expect(await maand(page)).not.toMatch(/Je voornemen van/i);
  });

  test('zonder voornemen staat er niets, ook geen lege staat', async ({ page }) => {
    await boot(page, { dag: 3 });
    expect(await page.evaluate(() => freshStartReflection())).toBe('');
  });
});

test.describe('e · een voornemen per maand, en de opslag blijft staan', () => {
  test('maandVoornemen wordt gelezen maar nooit meer geschreven', async ({ page }) => {
    await boot(page, { dag: 3, set: { maandVoornemen: { ym: VORIG, text: 'Blijft staan' } } });
    const bronnen = await page.evaluate(() => Object.getOwnPropertyNames(window)
      .filter((n) => typeof window[n] === 'function' && /SET\.maandVoornemen\s*=/.test(String(window[n]))));
    expect(bronnen).toEqual([]);                              // geen enkele schrijver meer
    // en de rij zelf blijft onaangeroerd na het openen van Maand
    await maand(page);
    expect(await page.evaluate(() => SET.maandVoornemen)).toEqual({ ym: VORIG, text: 'Blijft staan' });
  });

  test('er is niets naar coachLog gemigreerd', async ({ page }) => {
    await boot(page, { dag: 3, set: { maandVoornemen: { ym: VORIG, text: 'Blijft staan' } } });
    await maand(page);
    const log = await page.evaluate(() => SET.coachLog || []);
    expect(log.filter((l) => l && l.text === 'Blijft staan')).toEqual([]);
  });

  test('de coachlus houdt een afspraak per maand', async ({ page }) => {
    await boot(page, { dag: 3, set: { coachLog: [
      { type: 'afspraak', text: 'Tweede', ts: Date.now() },
      { type: 'afspraak', text: 'Eerste', ts: Date.now() - 1000 }] } });
    const r = await page.evaluate(() => ({ nu: coachThisMonthAfspraak(),
      t: (function () { renderMaand(); return $('#s-maand').innerText.replace(/\s+/g, ' '); })() }));
    expect(r.nu.text).toBe('Tweede');                         // de nieuwste, de log staat nieuwste eerst
    expect((r.t.match(/Je afspraak deze maand/g) || []).length).toBe(1);
  });
});

test.describe('f · de spec beschrijft wat er staat', () => {
  test('freshStart gaat over timing op Maand, niet over een kaart met state', async ({ page }) => {
    await boot(page);
    const F = await page.evaluate(() => MECHANISM_SPEC.freshStart);
    expect(JSON.stringify(F)).not.toMatch(/freshStartGezien|maandVoornemen/);
    expect(F.vuurt).toMatch(/VERSE_START_DAGEN/);
    expect(F.vuurt).toMatch(/Maand/);
    expect(F.state.join(' ')).toMatch(/geen eigen state/);
    expect(F.zwijgt.join(' ')).toMatch(/Geen historie-eis/);
  });

  test('de constante is de enige plek waar het venster staat', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ dagen: VERSE_START_DAGEN, src: verseStart.toString() }));
    expect(r.dagen).toBe(7);
    expect(r.src).toContain('VERSE_START_DAGEN');
  });
});
