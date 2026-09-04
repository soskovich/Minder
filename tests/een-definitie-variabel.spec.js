// v169: "wat blijft er over deze maand" werd op vier plekken anders berekend. Home rekende het
// variabele deel met potjeRest (je plan), Inzichten met varDue (een extrapolatie van je tempo), en
// coachStatus had er een derde formule voor. Bij een normaal tempo stond er €150 tegen €931, dus
// Home zei "+€1.450 veilig te besteden" terwijl Inzichten "-€931" toonde.
// varPlanRemaining() is nu de enige bron. varDue blijft bestaan als prognose, alleen in de spiegel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3];

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    const nu = (m === CUR);
    add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -1000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    const b = nu ? (o.boodschappen != null ? o.boodschappen : 400) : 500;
    if (b) add(m, '05', -b, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    const e = nu ? (o.uiteten != null ? o.uiteten : 150) : 200;
    if (e) add(m, '11', -e, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    if (o.zonderPotje && nu) add(m, '13', -220, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 2500 }, budgets: { huur: 1000, boodschappen: 500, uiteten: 200 } }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof safeToSpend === 'function');
}

// de vijf situaties uit de controlelijst
const SITUATIES = [
  ['halverwege, normaal tempo', {}],
  ['begin van de maand', { boodschappen: 0, uiteten: 0 }],
  ['een overschreden potje', { boodschappen: 900 }],
  ['een categorie zonder potje', { zonderPotje: true }],
  ['tempo ver boven het plan', { boodschappen: 480, uiteten: 195 }],
];

test.describe('a · elke plek leest dezelfde bron', () => {
  for (const [naam, opt] of SITUATIES) {
    test(`${naam}: drie plekken en het scherm, één getal`, async ({ page }) => {
      await boot(page, seed(opt));
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const de = daysElapsed(m), left = Math.max(de.dim - de.elapsed, 0);
        const varRest = (function () { try { return varPlanRemaining(m); } catch (_) { return null; } })();
        return {
          bron: varRest,
          safe: Math.round(safeToSpend().reserved),
          // wat Inzichten er letterlijk van maakt: het bedrag uit de regel onder de tegel
          scherm: (function(){ const d=document.createElement('div'); d.innerHTML=nogDezeMaandBody();
            const m2=d.innerText.replace(/\s+/g,' ').match(/plus €([\d.]+) variabel/);
            return m2 ? +m2[1].replace(/\./g,'') : 0; })(),
          // dezelfde som, met de hand: potjeRest per niet-recurring potje
          hand: (function () {
            const sp = catSpendMap(m), B = SET.budgets || {}, rc = recurringCats();
            let v = 0;
            for (const k in B) { const b = +B[k] || 0; if (b <= 0 || rc.has(k)) continue;
              v += potjeRest(b, sp[k] || 0, de.dim, left); }
            return Math.round(v);
          })(),
        };
      });
      expect(r.safe).toBe(r.bron);
      expect(r.hand).toBe(r.bron);
      expect(r.scherm).toBe(r.bron);       // en dat is ook het bedrag dat Inzichten toont
    });
  }
});

test.describe('b · Home en Inzichten spreken elkaar niet tegen', () => {
  for (const [naam, opt] of SITUATIES) {
    test(`${naam}: de twee schermen sluiten op elkaar aan`, async ({ page }) => {
      await boot(page, seed(opt));
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const S = safeToSpend(), L = monthLiquidity();
        const varPlan = varPlanRemaining(m);
        return { home: Math.round(S.safe),
          inzichten: Math.round(L.incDue) - Math.round(L.fixDue) - varPlan,
          spendSaldo: Math.round(S.spendSaldo), saveReserved: Math.round(S.saveReserved) };
      });
      /* De twee getallen beantwoorden een andere vraag - Home telt je saldo mee en reserveert je
         spaardoel, Inzichten kijkt alleen naar de stromen van deze maand - maar ze zijn per
         constructie herleidbaar tot elkaar. Loopt dit uiteen, dan is er een tweede definitie. */
      expect(r.home).toBe(r.inzichten + r.spendSaldo - r.saveReserved);
    });
  }
});

test.describe('c · het tempo is prognose, geen grondslag', () => {
  test('varDue voedt de spiegel en verder niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      varDue: Math.round(monthLiquidity().varDue),
      plan: varPlanRemaining(curMonth || months()[months().length - 1]),
      forecast: Math.round(safeToSpend().varForecast),
      sts: safeToSpend.toString(),
      ndm: nogDezeMaandBody.toString(),
      coach: coachStatus.toString(),
    }));
    expect(r.forecast).toBe(r.varDue);              // varForecast is de prognose, ongewijzigd
    expect(r.varDue).not.toBe(r.plan);              // en die wijkt in deze fixture echt af
    /* Geen van de drie plekken rekent nog met het tempo. Commentaar telt niet als gebruik: beide
       functies leggen in een comment uit waar varDue stond, en dat is precies de bedoeling. */
    const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');
    for (const [naam, src] of [['nogDezeMaandBody', r.ndm], ['coachStatus', r.coach]]) {
      expect(kaal(src), naam).not.toMatch(/varDue/);
    }
    /* safeToSpend noemt varDue nog precies één keer, en alleen om hem als varForecast door te
       geven aan de spiegel. Hij komt niet voor in de som van safe. */
    expect((kaal(r.sts).match(/varDue/g) || []).length).toBe(1);
    expect(r.sts).toContain('varForecast:Math.round(L.varDue');
    expect(r.sts).toContain('varPlanRemaining');
    expect(r.ndm).toContain('varPlanRemaining');
    expect(r.coach).toContain('varPlanRemaining');
  });

  test('er is precies één potjeRest-lus over', async ({ page }) => {
    await boot(page);
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    const script = bron.slice(bron.indexOf('<script>'), bron.lastIndexOf('</script>'));
    const lussen = (script.match(/potjeRest\s*\(/g) || []).length;
    // één definitie, één aanroep in varPlanRemaining, plus de aanroepen in openReservedPotjes
    expect(lussen).toBeGreaterThan(0);
    const inSafe = await page.evaluate(() => safeToSpend.toString());
    expect(inSafe).not.toContain('potjeRest');     // safeToSpend rekent niet zelf meer
  });
});

test.describe('d · Nog te betalen mengt geen twee soorten zekerheid', () => {
  test('de tegel toont de waarneming, het plan staat eronder', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const d = document.createElement('div'); d.innerHTML = nogDezeMaandBody();
      return { txt: d.innerText.replace(/\s+/g, ' '), html: d.innerHTML,
        fix: Math.round(monthLiquidity().fixDue), plan: varPlanRemaining(m) };
    });
    expect(r.txt).toContain('Nog te betalen · vast');
    expect(r.txt).not.toMatch(/\(tempo\)/);
    if (r.plan > 0) {
      expect(r.txt).toContain(`plus €${r.plan.toLocaleString('nl-NL')} variabel uit je potjes`);
      // en dat bedrag is nergens opgeteld bij de waargenomen vaste lasten
      if (r.fix > 0) expect(r.txt).not.toContain(`€${(r.fix + r.plan).toLocaleString('nl-NL')}`);
    }
  });

  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { nogDezeMaandBody(); safeToSpend(); varPlanRemaining(curMonth); });
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});
