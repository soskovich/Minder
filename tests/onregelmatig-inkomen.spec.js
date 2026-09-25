// v259: onregelmatig inkomen telt in je saldo en niet in je maandbeeld.
//
// AANLEIDING, gemeten bij v258. Eenmalig €5.000 bruto, netto €2.550. baseIncome() blijft stabiel
// op 5.216 (onderste-helft-mediaan), maar totals().income stijgt naar 7.766 en daarmee verschuift
// alles wat er een verhouding mee rekent: vaste-lastendruk 30,5 -> 20,5 procent, variabele
// 20,1 -> 13,5, spaarquote 17,3 -> 11,6. Er veranderde niets aan het gedrag; alleen de noemer
// groeide. Die knik blijft twaalf maanden in de KPI-lijn staan en zes in de meermaandsgrafiek,
// want hij is een eigenschap van die maand geworden.
//
// GEEN DREMPEL. De bestaande detectie (MEEVALLER_FACTOR, grens gemeten 5.998) vuurde op dezelfde
// €2.550 wél als de werkgever hem in de salarisregel boekte (7.766 in één boeking) en niet als hij
// los kwam. Een meting die van de boekhouding van je werkgever afhangt is geen meting.
//
// DE VLAG DRAAGT EEN BEDRAG EN GEEN JA/NEE, en dat volgt uit diezelfde meting: bij een
// gecombineerde boeking van 7.766 zou een ja/nee-vlag ook je 5.216 salaris uit de noemer halen.
//
// VIER ONAFHANKELIJKE INKOMENSSOMMATIES waren er: totals(), monthAgg(), incomeThisMonth in
// monthLiquidity() en recurringSchedule(). Alle vier telden zelf de income-boekingen op. Ze lezen
// nu maandInkomen(m); las de vlag alleen in totals(), dan zeggen monthAgg() en forecastModel()
// iets anders over dezelfde maand (v104). baseIncome() houdt bewust zijn eigen lus, zie onderaan.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const NORM = 5216, EXTRA = 2550;   // de norm van het toestel, en 5.000 bruto op het bijzonder tarief
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const maand = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';

/* Het saldo draagt de uitkering in ELK geval, ook zonder vlag: zo komt elk verschil dat een test
   meet uit de noemer en niet uit het geld. */
function seed(o) {
  o = o || {};
  const tx = []; let n = 0;
  const add = (m, day, amount, naam, desc, acc) => tx.push({ id: 'x' + (++n), date: m + '-' + day,
    amount, acc: acc || MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (let k = 11; k >= 0; k--) {
    const m = maand(k);
    if (!(k === 0 && o.geenSalaris)) add(m, '25', NORM + (o.samen && k === 0 ? EXTRA : 0), 'SKF', 'SALARIS LOON');
    add(m, '02', -1450, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '04', -140, 'Zilveren Kruis', 'SEPA INCASSO ZORGVERZEKERING');
    add(m, '06', -620, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '12', -240, 'Restaurant', 'BEA, BETAALPAS EETCAFE');
    add(m, '15', -190, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
    if (k > 0) { add(m, '26', -900, 'Spaarpot', 'NAAR SPAREN'); add(m, '26', 900, 'Spaarpot', 'NAAR SPAREN', SPAAR); }
  }
  if (!o.samen) add(maand(0), '20', EXTRA, 'SKF', 'SALARIS LOON EENMALIGE UITKERING');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: true,
      manualBal: { [MAIN]: 3200 + EXTRA, [SPAAR]: 9000 },
      budgets: { huur: 1450, boodschappen: 700, uiteten: 250, vervoer: 220 },
      savingMode: 'amount', savingAmount: 900, savingsAcc: { [SPAAR]: true } }),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandInkomen === 'function');
}
// vlaggen via de echte route: de transactiesheet openen en de schakelaar aanzetten
/* De uitkeringsboeking, en bij een gecombineerde boeking de salarisregel waar hij in zit. Eerst
   stond hier "de grootste bijschrijving", en dat is in het losse geval juist het SALARIS: de test
   vlagde dan 5.216 in plaats van 2.550 en safe sprong 2.666. Een helper die het verkeerde anker
   pakt maakt een test rood op iets dat niet stuk is. */
const vlagAan = (page, bedrag) => page.evaluate((b) => {
  const inMaand = TX.filter((x) => x.date.slice(0, 7) === thisYM() && x.amount > 0);
  const t = inMaand.find((x) => /EENMALIGE/.test(x.desc)) || inMaand.sort((p, q) => q.amount - p.amount)[0];
  openSheet(t.id);
  document.getElementById('onreg').click();
  if (b != null) zetOnregelmatig(t.id, b);
  closeSheet();
  return t.id;
}, bedrag);

const cijfers = (page) => page.evaluate(() => {
  const v = (f) => { try { const r = f(); return r === undefined ? null : r; } catch (e) { return 'FOUT: ' + e.message; } };
  const cur = months()[months().length - 1];
  const t = totals(cur);
  const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
  const K = insKpis(cur);
  return {
    income: Math.round(t.income), incomeAlles: Math.round(t.incomeAlles),
    onregelmatig: t.onregelmatig, detected: Math.round(t.detectedIncome), limit: Math.round(t.limit),
    monthAgg: v(() => Math.round(monthAgg(cur).income)),
    saldo: v(() => Math.round(totalBalance().sum)), safe: v(() => Math.round(safeToSpend().safe)),
    baseIncome: v(() => baseIncome()),
    vari: r1(K.vari.raw), vast: r1(K.vast.raw), budget: r1(K.budget.raw),
    reeksVast: v(() => insKpiSeries(12).vast.map((x) => x == null ? '-' : Math.round(x)).join(',')),
    grafiek: v(() => months().filter((x) => x < thisYM()).slice(-6).map((m) => Math.round(totals(m).income)).join(',')),
    kpiBasis: v(() => Math.round(kpiBasis('vari', t))),
    kpiXB: v(() => Math.round(kpiXB('vast', cur).B)),
    fAggLaatste: v(() => { const a = forecastModel().agg; return Math.round(a[a.length - 1].income); }),
    fInc: v(() => Math.round(forecastModel().fInc)),
    spaarDekkingOver: v(() => { const D = spaarDekking(cur); return D ? D.over : null; }),
    finModel: v(() => { const M = financeModel(); const r = M.months.find((x) => x.ym === cur); return r && r.income; }),
    vermogenLijn: v(() => { let a = 0; return months().slice(-12).map((mm) => { const tt = totals(mm); a += (tt.incomeAlles || 0) - (tt.spend || 0); return Math.round(a); }).pop(); }),
    opbouw: v(() => { const h = onregelmatigOpbouwRegel(); return h ? h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; }),
  };
});

test.describe('a · de vlag doet wat hij belooft', () => {
  test('gevlagd: telt in je saldo en in veilig te besteden, valt uit de noemer', async ({ page }) => {
    await boot(page, {});
    const voor = await cijfers(page);
    await vlagAan(page);
    const na = await cijfers(page);
    // het geld beweegt niet
    expect(na.saldo).toBe(voor.saldo);
    expect(na.safe).toBe(voor.safe);
    expect(na.incomeAlles).toBe(voor.incomeAlles);
    // de noemer wel
    expect(voor.income).toBe(NORM + EXTRA);
    expect(na.income).toBe(NORM);
    expect(na.onregelmatig).toBe(EXTRA);
    // en de drie percentages staan weer op hun normale waarde
    expect(na.vari).toBeCloseTo(20.1, 1);
    expect(na.vast).toBeCloseTo(30.5, 1);
    expect(na.budget).toBeCloseTo(voor.budget, 1);   // potjes zijn de noemer, dus onveranderd
  });

  test('ongevlagd: precies de vervorming die v258 mat', async ({ page }) => {
    await boot(page, {});
    const r = await cijfers(page);
    expect(r.income).toBe(NORM + EXTRA);
    expect(r.limit).toBe(5436);
    expect(r.vari).toBeCloseTo(13.5, 1);
    expect(r.vast).toBeCloseTo(20.5, 1);
  });

  test('baseIncome is in beide gevallen gelijk', async ({ page }) => {
    await boot(page, {});
    const voor = await cijfers(page);
    await vlagAan(page);
    const na = await cijfers(page);
    expect(voor.baseIncome).toBe(NORM);
    expect(na.baseIncome).toBe(NORM);
  });
});

test.describe('b · geen knik meer in de lijnen', () => {
  test('de twaalfmaandslijn en de meermaandsgrafiek dragen geen knik', async ({ page }) => {
    await boot(page, {});
    const voor = await cijfers(page);
    expect(voor.reeksVast.split(',').pop()).toBe('20');        // de knik
    await vlagAan(page);
    const na = await cijfers(page);
    const reeks = na.reeksVast.split(',');
    expect(new Set(reeks).size).toBe(1);                        // elke maand gelijk
    expect(reeks.pop()).toBe('30');
    // de meermaandsgrafiek leest afgeronde maanden; die staan hier allemaal op de norm
    expect(new Set(na.grafiek.split(',')).size).toBe(1);
  });
});

test.describe('c · elke lezer doet wat er gemeld is', () => {
  test('de noemer-lezers volgen de vlag, de geld-lezers niet', async ({ page }) => {
    await boot(page, {});
    const voor = await cijfers(page);
    await vlagAan(page);
    const na = await cijfers(page);
    // noemer: deze zakken naar de norm
    for (const k of ['income', 'monthAgg', 'kpiBasis', 'kpiXB', 'fAggLaatste']) {
      expect(na[k], `${k} hoort de norm te lezen`).toBe(NORM);
      expect(voor[k], `${k} hoort zonder vlag alles te lezen`).toBe(NORM + EXTRA);
    }
    expect(na.limit).toBe(3651);
    // geld: deze veranderen niet
    for (const k of ['saldo', 'safe', 'incomeAlles', 'detected', 'vermogenLijn', 'finModel', 'spaarDekkingOver']) {
      expect(na[k], `${k} telt geld en hoort niet te bewegen`).toBe(voor[k]);
    }
    // baseIncome en forecastModel().fInc lazen de uitschieter al niet
    expect(na.fInc).toBe(voor.fInc);
  });
});

test.describe('d · de zichtbaarheidsregel', () => {
  test('staat er alleen als er gevlagd inkomen is', async ({ page }) => {
    await boot(page, {});
    expect(await page.evaluate(() => onregelmatigOpbouwRegel())).toBe('');
    await vlagAan(page);
    const r = await cijfers(page);
    expect(r.opbouw).toMatch(/Waarvan onregelmatig/);
    expect(r.opbouw).toMatch(/telt in je saldo, niet in je maandbeeld/);
    expect(r.opbouw).toMatch(/€\s?2\.550/);
  });

  test('hij staat in de opbouw van veilig te besteden, en kost 59px', async ({ page }) => {
    for (const w of [360, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, {});
      await vlagAan(page);
      const h = await page.evaluate(() => {
        openSafeToSpend();
        const rijen = [...document.querySelectorAll('#sheet .row')];
        const r = rijen.find((x) => /Waarvan onregelmatig/.test(x.innerText));
        return r ? Math.round(r.getBoundingClientRect().height) : null;
      });
      expect(h, `op ${w}px`).toBe(59);   // gemeten, dezelfde hoogte als de andere rijen in deze sheet
    }
  });
});

test.describe('d2 · de schakelaar staat waar hij hoort', () => {
  test('alleen bij een bijschrijving in een inkomenscategorie', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const inc = TX.find((x) => /EENMALIGE/.test(x.desc));
      const uitg = TX.find((x) => x.amount < 0);
      openSheet(inc.id); const a = document.querySelector('#sheet').innerText;
      openSheet(uitg.id); const b = document.querySelector('#sheet').innerText;
      closeSheet();
      return { bijInkomen: /onregelmatig inkomen/i.test(a), bijUitgave: /onregelmatig/i.test(b) };
    });
    expect(r.bijInkomen).toBe(true);
    expect(r.bijUitgave).toBe(false);
  });

  test('het bedrag wordt geklemd op de boeking en nul haalt de vlag weg', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const t = TX.find((x) => /EENMALIGE/.test(x.desc));
      zetOnregelmatig(t.id, 99999);
      const teveel = onregelmatigBedrag(TX.find((x) => x.id === t.id));
      zetOnregelmatig(t.id, 1200);
      const deel = onregelmatigBedrag(TX.find((x) => x.id === t.id));
      const inkomenBijDeel = Math.round(totals(thisYM()).income);
      zetOnregelmatig(t.id, 0);
      return { teveel, deel, inkomenBijDeel, naNul: onregelmatigBedrag(TX.find((x) => x.id === t.id)),
        gezet: !!(SET.onregelmatig || {})[t.id] };
    });
    expect(r.teveel).toBe(EXTRA);              // meer onregelmatig dan er binnenkwam bestaat niet
    expect(r.deel).toBe(1200);
    expect(r.inkomenBijDeel).toBe(NORM + EXTRA - 1200);
    expect(r.naNul).toBe(0);
    expect(r.gezet).toBe(false);               // nul laat geen lege sleutel achter
  });
});

test.describe('e · de gecombineerde boeking', () => {
  test('een vlag met bedrag haalt alleen dat deel uit de noemer', async ({ page }) => {
    await boot(page, { samen: true });
    const voor = await cijfers(page);
    expect(voor.income).toBe(NORM + EXTRA);   // één boeking van 7.766
    await vlagAan(page, EXTRA);
    const na = await cijfers(page);
    expect(na.income).toBe(NORM);
    expect(na.onregelmatig).toBe(EXTRA);
    expect(na.incomeAlles).toBe(NORM + EXTRA);
  });

  test('de verdeelsheet verdeelt alleen het gevlagde deel, niet de boeking', async ({ page }) => {
    await boot(page, { samen: true });
    await vlagAan(page, EXTRA);
    const r = await page.evaluate(() => ({
      bedrag: meevallerBedrag(),
      boeking: Math.round(TX.filter((x) => x.date.slice(0, 7) === thisYM() && x.amount > 0).sort((p, q) => q.amount - p.amount)[0].amount),
      vrijOverGevlagd: Math.round(meevallerBedrag() * meevallerVrijPct() / 100),
      vrijOverBoeking: Math.round(7766 * meevallerVrijPct() / 100),
    }));
    expect(r.boeking).toBe(NORM + EXTRA);
    expect(r.bedrag).toBe(EXTRA);                 // en niet 7.766
    expect(r.vrijOverGevlagd).toBe(255);          // 10% van 2.550
    expect(r.vrijOverBoeking).toBe(777);          // wat het vóór deze ronde was, waarvan 522 salaris
  });

  test('zonder vlag verdeelt hij niets, want er is geen drempel meer', async ({ page }) => {
    await boot(page, { samen: true });
    expect(await page.evaluate(() => meevallerBedrag())).toBe(0);
    expect(await page.evaluate(() => scoreNotifs().some((o) => /^meeval-/.test(o.key)))).toBe(false);
  });
});

test.describe('f · de regel Nog te ontvangen', () => {
  test('zonder vlag trekt de uitkering van je verwachte salaris af', async ({ page }) => {
    await boot(page, { geenSalaris: true });
    const r = await page.evaluate(() => ({
      incDue: Math.round(monthLiquidity().incDue),
      regel: (nogDezeMaandPosten().find((x) => /ontvangen/i.test(x.lab)) || {}).val,
    }));
    expect(r.incDue).toBe(NORM - EXTRA);   // 2.666: de gemelde fout
    expect(r.regel).toMatch(/2\.666/);
  });

  test('met vlag klopt hij weer, als gevolg van de vlag en niet als aparte reparatie', async ({ page }) => {
    await boot(page, { geenSalaris: true });
    await vlagAan(page);
    const r = await page.evaluate(() => ({
      incDue: Math.round(monthLiquidity().incDue),
      regel: (nogDezeMaandPosten().find((x) => /ontvangen/i.test(x.lab)) || {}).val,
      projected: Math.round(monthLiquidity().projected),
    }));
    expect(r.incDue).toBe(NORM);
    expect(r.regel).toMatch(/5\.216/);
  });
});

test.describe('g · de vlag overleeft een herimport', () => {
  test('dezelfde id, niets toegevoegd, vlag blijft staan', async ({ page }) => {
    await boot(page, {});
    const id = await vlagAan(page);
    const r = await page.evaluate((vid) => {
      const t = TX.find((x) => x.id === vid);
      const kopie = { date: t.date, amount: t.amount, acc: t.acc, name: t.name, desc: t.desc,
        typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(kopie);
      const nVoor = TX.length;
      const toegevoegd = commitTx([kopie], null);
      return { zelfdeId: kopie.id === vid, toegevoegd, nVoor, nNa: TX.length,
        bedragNa: onregelmatigBedrag(TX.find((x) => x.id === vid)),
        inkomenNa: Math.round(totals(thisYM()).income) };
    }, id);
    expect(r.zelfdeId).toBe(true);
    expect(r.toegevoegd).toBe(0);
    expect(r.nNa).toBe(r.nVoor);
    expect(r.bedragNa).toBe(EXTRA);
    expect(r.inkomenNa).toBe(NORM);
  });
});

test.describe('h · de bron kan niet uit elkaar lopen', () => {
  /* Bronzoekende test, dezelfde vorm als geennorm-hardcode.spec.js: er waren vier eigen
     inkomenssommaties en de winst van deze ronde is dat het er één is. Komt er een vijfde lus bij
     die zelf over income-boekingen telt, dan valt deze test. baseIncome() is de bewuste
     uitzondering: die is gemeten robuust (onderste-helft-mediaan) en blijft op verzoek ongemoeid. */
  const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const CODE = BRON.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n').map((ln) => {
      const m = /(^|[\s;})])\/\/(?!\/)/.exec(ln);
      if (!m) return ln;
      const voor = ln.slice(0, m.index + m[1].length);
      if (/http/.test(ln.slice(Math.max(0, m.index - 8), m.index))) return ln;
      const even = (x, c) => (x.split(c).length - 1) % 2 === 0;
      if (!even(voor, "'") || !even(voor, '"') || !even(voor, '`')) return ln;
      return voor;
    }).join('\n');

  test('de drie lezers halen hun maandinkomen uit maandInkomen()', () => {
    const HEADERS = [...CODE.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ i: m.index, naam: m[1] }));
    const body = (naam) => {
      const h = HEADERS.find((x) => x.naam === naam);
      expect(h, `${naam}() niet gevonden`).toBeTruthy();
      const volgende = HEADERS.find((x) => x.i > h.i);
      return CODE.slice(h.i, volgende ? volgende.i : CODE.length);
    };
    for (const naam of ['totals', 'monthAgg', 'monthLiquidity']) {
      expect(body(naam), `${naam}() hoort maandInkomen() te lezen`).toMatch(/maandInkomen\s*\(/);
    }
  });

  test('niemand telt nog inline income-boekingen op', () => {
    /* De vorm die vier keer bestond is één regel met de income-toets EN de optelling erin:
         if(meta.type==='income') income+=Math.max(t.amount,0);
       maandInkomen() zet die twee bewust op aparte regels, dus hij valt hier niet onder.
       baseIncome() houdt op verzoek zijn eigen lus: die is gemeten robuust (v258). */
    const HEADERS = [...CODE.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ i: m.index, naam: m[1] }));
    const fnVan = (i) => { let h = null; for (const x of HEADERS) { if (x.i <= i) h = x; else break; } return h ? h.naam : null; };
    const TOEGESTAAN = new Set(['baseIncome']);
    const fout = [];
    let pos = 0;
    for (const ln of CODE.split('\n')) {
      if (/type\s*===\s*'income'/.test(ln) && /\+=/.test(ln)) {
        const fn = fnVan(pos);
        if (!TOEGESTAAN.has(fn)) fout.push(`${fn}(): ${ln.trim().slice(0, 100)}`);
      }
      pos += ln.length + 1;
    }
    expect(fout, `deze regels tellen zelf income-boekingen op in plaats van maandInkomen() te lezen:\n${fout.join('\n')}`).toEqual([]);
  });

  test('de toegestane functies bestaan ook echt', () => {
    for (const naam of ['maandInkomen', 'baseIncome', 'onregelmatigBedrag']) {
      expect(new RegExp(`function\\s+${naam}\\s*\\(`).test(CODE), `${naam}() bestaat niet`).toBe(true);
    }
  });
});
