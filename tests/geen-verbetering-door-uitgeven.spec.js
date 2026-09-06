// v192: het blok "Nog deze maand" droeg een chip "Deze maand op eigen kracht" met
// incDue - fixDue - varPlan. Alle drie zijn "rest van de maand", dus het getal was intern
// consistent en juist daarom fout: elke euro die je uitgaf verlaagde varPlan met een euro, terwijl
// het geld dat wegging nergens meetelde (het saldo stond er expliciet buiten). Het getal steeg dus
// met 1 per uitgegeven euro, en sprong bij het overschrijden van een potje terug omdat potjeRest
// daar op het geplande dagtempo omslaat. Geen enkele bestaande test ving dat.
// Deze spec legt de eigenschap vast die ontbrak: geen getal in dit blok wordt gunstiger doordat je
// meer uitgeeft. De vier stappen zijn die uit de audit: niets extra, +200, +500 en +900 (over het
// potje heen, precies de stand waar potjeRest van tak wisselt).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3];
const STAPPEN = [0, 200, 500, 900];

// Huur en salaris zijn deze maand nog niet geboekt, dus ze staan als fixDue en incDue open.
// Boodschappen loopt wel al: dat is de post waarop we extra uitgeven.
function seed(extra) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    const nu = (m === CUR);
    if (!nu) { add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
      add(m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING'); }
    add(m, '05', -(nu ? 300 : 500), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    if (nu && extra > 0) add(m, '06', -extra, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  });
  // het saldo beweegt mee met de boekingen, zoals bij een bankimport
  const set = { mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    savingMode: 'amount', savingAmount: 300, manualBal: { [MAIN]: 6000 - extra },
    budgets: { huur: 900, boodschappen: 800, uiteten: 300, vices: 100, shopping: 200 } };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, extra) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(extra));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof nogDezeMaandBody === 'function');
}

// Elk bedrag in het blok, aan zijn eigen label gehangen. Geen enkele waarde wordt herrekend:
// we lezen wat er staat.
const meet = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = nogDezeMaandBody();
  const eur = (s) => { const m = String(s).match(/-?€\s?([\d.]+)/); if (!m) return null;
    return (/-€/.test(s) ? -1 : 1) * +m[1].replace(/\./g, ''); };
  const tegels = {};
  for (const t of d.querySelectorAll('.wvo-tile')) {
    const l = t.querySelector('.wvo-tl'), v = t.querySelector('.wvo-tv');
    if (l && v) tegels[l.innerText.trim()] = eur(v.innerText);
  }
  const tekst = d.innerText.replace(/\s+/g, ' ');
  // v204: het variabele deel stond als voetregel onder de tegels ('plus EUR X variabel uit je potjes') en is een vierde tegel geworden, 'Nog uit je potjes'. Het bedrag en de bron zijn ongewijzigd; alleen de vindplaats verschuift.
  const vp = tekst.match(/nog uit je potjes\s*€([\d.]+)/i);
  return { tegels, varPlan: vp ? +vp[1].replace(/\./g, '') : 0, tekst,
    uitgegeven: Math.round(catSpendMap(curMonth || months()[months().length - 1]).boodschappen || 0) };
});

test.describe('a \u00b7 de vier stappen', () => {
  /* Wat er in dit blok staat is per stuk een waarneming of een uitstroom; geen enkel getal is
     besteedbare ruimte. Daarom is de toets niet "elk bedrag daalt" - de planrest mag bij het
     overschrijden van een potje juist stijgen (v111 reserveert dan het dagtempo) - maar: er staat
     geen getal dat door meer uitgeven gunstiger wordt. De oude chip was dat wel, en dat is
     hieronder nog na te rekenen. */
  test('de oude som steeg met elke uitgegeven euro, en staat nergens meer', async ({ page }) => {
    const rijen = [];
    for (const extra of STAPPEN) { await boot(page, extra); rijen.push(await meet(page)); }

    // de opzet doet wat hij belooft: er is werkelijk meer uitgegeven bij elke stap
    for (let i = 1; i < rijen.length; i++) {
      expect(rijen[i].uitgegeven).toBeGreaterThan(rijen[i - 1].uitgegeven);
    }
    // en er staat iets in het blok, anders toetst dit niets
    expect(Object.keys(rijen[0].tegels).length).toBeGreaterThan(0);

    // de fout, nagerekend: binnen het potje steeg incDue - fixDue - varPlan met precies het
    // uitgegeven bedrag, zonder dat er iets ten goede was veranderd
    const oud = (r) => r.tegels['Nog te ontvangen'] - r.tegels['Nog te betalen \u00b7 vast'] - r.varPlan;
    for (let i = 1; i < 3; i++) {
      expect(oud(rijen[i]) - oud(rijen[i - 1]))
        .toBe(rijen[i].uitgegeven - rijen[i - 1].uitgegeven);
    }
    // en op geen enkele stap staat dat bedrag nog in het blok
    for (let i = 0; i < rijen.length; i++) {
      const b = String(oud(rijen[i]));
      const met = b.length > 3 ? b.slice(0, -3) + '.' + b.slice(-3) : b;
      expect(rijen[i].tekst, `stap +${STAPPEN[i]}`).not.toContain('\u20ac' + met);
      expect(rijen[i].tekst).not.toMatch(/eigen kracht/i);
    }
  });

  test('de planrest blijft de planrest, ook boven het potje', async ({ page }) => {
    for (const extra of STAPPEN) {
      await boot(page, extra);
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const d = document.createElement('div'); d.innerHTML = nogDezeMaandBody();
        const v = d.innerText.replace(/\s+/g, ' ').match(/nog uit je potjes\s*\u20ac([\d.]+)/i);
        return { getoond: v ? +v[1].replace(/\./g, '') : 0, bron: varPlanRemaining(m) };
      });
      expect(r.getoond, `bij +${extra}`).toBe(r.bron);
    }
  });

  test('de tegels zijn waarnemingen en bewegen niet mee met een variabele uitgave', async ({ page }) => {
    const rijen = [];
    for (const extra of STAPPEN) { await boot(page, extra); rijen.push(await meet(page)); }
    for (let i = 1; i < rijen.length; i++) {
      expect(rijen[i].tegels['Nog te betalen · vast']).toBe(rijen[0].tegels['Nog te betalen · vast']);
      expect(rijen[i].tegels['Nog te ontvangen']).toBe(rijen[0].tegels['Nog te ontvangen']);
    }
  });

  /* De sprong bij +900 was het tweede symptoom: daar slaat potjeRest om van "bud - uitgegeven"
     naar het geplande dagtempo maal de resterende dagen (v111). Het oude chipgetal sprong daardoor
     omlaag na drie stappen omhoog. De planrest zelf mag daar wél stijgen ten opzichte van de stap
     ervoor - dat is de reservering die v111 bewust invoerde - maar dan hoort er geen getal te staan
     dat die stijging als ruimte presenteert. */
  test('bij een overschreden potje staat er geen getal dat de reservering als ruimte toont',
    async ({ page }) => {
      await boot(page, 900);
      const r = await meet(page);
      expect(r.uitgegeven).toBeGreaterThan(800);         // het potje staat op 800
      expect(r.tekst).not.toMatch(/eigen kracht/i);
      expect(r.tekst).not.toMatch(/vrij n[áa] sparen/i);
    });
});

test.describe('b · het samengestelde getal is weg en komt niet terug', () => {
  test('geen chip die een waarneming bij een planrest optelt', async ({ page }) => {
    await boot(page, 0);
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = nogDezeMaandBody();
      return { chips: d.querySelectorAll('.wvo-chip').length, streep: d.querySelectorAll('.ndm-net').length,
        src: nogDezeMaandBody.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') };
    });
    expect(r.chips).toBe(0);
    expect(r.streep).toBe(0);
    expect(r.src).not.toContain('netto');
    expect(r.src).not.toContain('naSparen');
    expect(r.src).not.toContain('eigenkracht');
  });

  test('het begrip is met zijn enige lezer meegegaan', async ({ page }) => {
    await boot(page, 0);
    expect(await page.evaluate(() => 'eigenkracht' in JARGON)).toBe(false);
  });

  test('de vier feiten die overblijven komen elk uit één bron', async ({ page }) => {
    await boot(page, 0);
    const r = await page.evaluate(() => {
      const L = monthLiquidity(), S = safeToSpend();
      const m = curMonth || months()[months().length - 1];
      const d = document.createElement('div'); d.innerHTML = nogDezeMaandBody();
      const eur = (s) => { const x = String(s).match(/€\s?([\d.]+)/); return x ? +x[1].replace(/\./g, '') : null; };
      const tg = {};
      for (const t of d.querySelectorAll('.wvo-tile')) tg[t.querySelector('.wvo-tl').innerText.trim()] = eur(t.querySelector('.wvo-tv').innerText);
      const vp = d.innerText.replace(/\s+/g, ' ').match(/nog uit je potjes\s*€([\d.]+)/i);
      return { tg, varPlan: vp ? +vp[1].replace(/\./g, '') : 0,
        fixDue: Math.round(L.fixDue), incDue: Math.round(L.incDue),
        saveReserved: Math.max(Math.round(S.saveReserved), 0), bron: varPlanRemaining(m) };
    });
    expect(r.tg['Nog te betalen · vast']).toBe(r.fixDue);
    expect(r.tg['Nog te ontvangen']).toBe(r.incDue);
    expect(r.tg['Nog te sparen']).toBe(r.saveReserved);
    expect(r.varPlan).toBe(r.bron);
  });
});
