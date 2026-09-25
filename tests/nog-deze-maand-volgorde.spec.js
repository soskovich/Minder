// v253: de volgorde van de vier posten onder "Wat er nog komt".
//
// DE WEG VAN JE GELD DOOR DE MAAND: wat binnenkomt, wat je opzij zet, wat vastligt, en wat er voor
// je potjes overblijft. Tot v252 stond de volgorde op de scheiding van v204 (waarneming boven, plan
// onder), met de twee bronsoorten om en om.
//
// WAT DEZE VOLGORDE NIET IS, en wat deze spec daarom ook vasthoudt: er staat geen totaal en geen
// restregel. De vier van elkaar aftrekken geeft een getal dat er uitziet als "wat ik overhoud" en
// dat niet is, want het begint bij wat er NOG binnenkomt en niet bij wat er al staat. Gemeten op
// dezelfde maand, alleen het salaris al binnen in plaats van nog komend: de aftrekking springt van
// +2.025 naar -975 terwijl safeToSpend() op 3.720 blijft en de prognose op 3.929. Dat is dezelfde
// fout die v192 wegnam toen "Deze maand op eigen kracht" verdween.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';
const SPA = 'psd2_spaar01';

function seed(set = {}, opt = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, omschrijving) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: omschrijving || naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (let i = 9; i >= 0; i--) {
    const m = M(i);
    add('i' + i, ACC, m, '25', 3200, 'Werkgever');
    /* v260: deze drie droegen alleen een naam, en isIncasso() leest de OMSCHRIJVING. Gemeten:
       recurringSchedule() gaf nul vaste posten terug en fixDue stond op nul, dus de post
       "Nog te betalen - vast" toonde hier altijd 0 met de sub "niets herkend" - precies de
       onwaarheid die v260 repareert. De comment hieronder beweerde al tien versies lang dat er
       "ook echt nog iets te betalen is" en dat was nooit waar. Met SEPA INCASSO in de omschrijving
       doet de fixture wat hij zegt. */
    add('h' + i, ACC, m, '02', -1200, 'Huur Woningstichting', 'SEPA INCASSO HUUR WONINGSTICHTING');
    add('n' + i, ACC, m, '03', -12, 'Netflix', 'SEPA INCASSO NETFLIX');
    // een vaste last laat in de maand, zodat er ook echt nog iets te betalen is
    if (!opt.allesBetaald) add('z' + i, ACC, m, '28', -95, 'Zilveren Kruis', 'SEPA INCASSO ZILVEREN KRUIS');
    if (!(i === 0 && opt.beginMaand)) {
      add('a' + i, ACC, m, '06', -420, 'Albert Heijn');
      add('r' + i, ACC, m, '11', -240, 'Restaurant De Kroeg');
    }
    add('s' + i, SPA, m, '04', 300, 'Naar spaarrekening');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3200,
      manualBal: { [ACC]: 4200, [SPA]: 9000 }, savingsAcc: { [SPA]: true },
      budgets: opt.geenPotjes ? {} : { boodschappen: 700, uiteten: 300, abonnementen: 40 },
      savingMode: opt.geenSpaardoel ? 'amount' : 'amount',
      savingAmount: opt.geenSpaardoel ? 0 : 750,
      goals: [{ id: 'g1', naam: 'Auto', doel: 8000, gespaard: 1200, per: 200 },
              { id: 'g2', naam: 'Reis', doel: 3000, gespaard: 100, per: 0 },
              { id: 'g3', naam: 'Keuken', doel: 12000, gespaard: 0, per: 0 }],
      planPaused: { g3: true }, vooruitDoelOpen: true,
    }, set)),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof nogDezeMaandBody === 'function');
}

const blok = (page) => page.evaluate(() => {
  go('ins');
  const rij = document.querySelector('#insNogLijst');
  if (!rij) return null;
  return {
    // v241: op Inzichten is dit een lijst en geen raster. Wat de test vasthoudt is dezelfde
    // eigenschap als in v204 (waarneming boven, plan onder), alleen zijn de rijen nu de posten
    // zelf. 'rechts' is de rechterkant van het bedrag: die moet voor alle posten gelijk zijn,
    // anders zijn ze niet met elkaar te vergelijken.
    tegels: [...rij.querySelectorAll('.ins-nog-rij')].map((t) => ({
      label: (t.querySelector('.ins-nog-lab') || {}).innerText || '',
      waarde: (t.querySelector('.ins-nog-val') || {}).innerText || '',
      sub: (t.querySelector('.ins-nog-sub') || {}).innerText || '',
      rechts: Math.round(t.querySelector('.ins-nog-val').getBoundingClientRect().right),
      top: Math.round(t.getBoundingClientRect().top),
      tik: !!t.getAttribute('onclick'),
    })),
    naDeRij: rij.nextElementSibling ? rij.nextElementSibling.innerText.replace(/\s+/g, ' ') : '',
  };
});


const VOLGORDE = ['Nog te ontvangen', 'Nog te sparen', 'Nog te betalen \u00b7 vast', 'Nog uit je potjes'];
const labels = (page) => page.evaluate(() => [...document.querySelectorAll('#insNogLijst .ins-nog-lab')]
  .map((x) => x.innerText.replace(/\s+/g, ' ').trim()));

test.describe('a \u00b7 de vier posten staan in de weg van je geld', () => {
  test('alle vier aanwezig: precies deze volgorde', async ({ page }) => {
    await boot(page);
    expect(await labels(page)).toEqual(VOLGORDE);
  });

  /* Een ontbrekende post mag de rest niet omgooien. De volgorde is een eigenschap van de reeks en
     niet van het aantal, dus elk deelgeval moet een deelrij van VOLGORDE zijn in dezelfde richting. */
  for (const [naam, opt] of [
    ['zonder potjes', { geenPotjes: true }],
    ['zonder spaardoel', { geenSpaardoel: true }],
    ['zonder spaardoel en zonder potjes', { geenSpaardoel: true, geenPotjes: true }],
    ['met alles betaald', { allesBetaald: true }],
    ['aan het begin van de maand', { beginMaand: true }],
  ]) {
    test(`${naam}: de overgebleven posten houden dezelfde volgorde`, async ({ page }) => {
      await boot(page, seed({}, opt));
      const L = await labels(page);
      expect(L.length).toBeGreaterThan(0);
      for (const l of L) expect(VOLGORDE).toContain(l);
      const plek = L.map((l) => VOLGORDE.indexOf(l));
      for (let i = 1; i < plek.length; i++) expect(plek[i]).toBeGreaterThan(plek[i - 1]);
    });
  }
});

test.describe('b \u00b7 de tekortregel blijft bij de potjes', () => {
  test('de noot hangt onder Nog uit je potjes en nergens anders', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const rijen = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')];
      return rijen.map((x) => ({
        lab: (x.querySelector('.ins-nog-lab') || {}).innerText || '',
        noot: (x.querySelector('.ins-nog-noot') || {}).innerText || null }));
    });
    const metNoot = r.filter((x) => x.noot);
    // de fixture heeft geen overschrijding, dus de noot hoeft er niet te staan; staat hij er wel,
    // dan hoort hij bij de potjes-post en bij geen andere
    for (const x of metNoot) expect(x.lab).toMatch(/uit je potjes|te veel uitgegeven/i);
    // en de bron laat geen tweede drager toe: alleen de potjes-post krijgt een noot mee
    const src = await page.evaluate(() => nogDezeMaandPosten.toString());
    expect((src.match(/noot:/g) || []).length).toBe(1);
  });

  test('met een overschreden potje staat de noot er, en onder de potjes-post', async ({ page }) => {
    await boot(page, seed({ budgets: { boodschappen: 40, uiteten: 100, huur: 900 } }));
    const r = await page.evaluate(() => {
      const rij = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
        .find((x) => /uit je potjes|te veel uitgegeven/i.test(x.innerText));
      const n = rij && rij.querySelector('.ins-nog-noot');
      const andere = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
        .filter((x) => !/uit je potjes|te veel uitgegeven/i.test(x.innerText))
        .some((x) => x.querySelector('.ins-nog-noot'));
      return { er: !!n, tekst: n ? n.innerText.replace(/\s+/g, ' ') : '', andere };
    });
    expect(r.er).toBe(true);
    expect(r.tekst).toMatch(/tekort/);
    expect(r.andere).toBe(false);
  });
});

test.describe('c \u00b7 er staat geen totaal en geen restregel', () => {
  test('geen enkele regel telt de vier bij elkaar op of trekt ze af', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const L = monthLiquidity(), S = safeToSpend(), VP = varPotjeStand(m);
      const inc = Math.round(L.incDue), fix = Math.round(L.fixDue);
      const spaar = Math.max(Math.round(S.saveReserved), 0);
      const inPotjes = VP.budget - VP.gebruikt, rest = varPlanRemaining(m);
      const eur = (t) => Math.abs(Math.round(parseFloat(String(t).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0));
      return { getoond: [...document.querySelectorAll('#insNogLijst .ins-nog-val')].map((x) => eur(x.innerText)),
        aftrekPot: inc - spaar - fix - inPotjes, aftrekRest: inc - spaar - fix - rest,
        som: inc + spaar + fix + inPotjes,
        bronnen: [inc, spaar, fix, Math.abs(inPotjes)],
        naDeRij: (document.querySelector('#insNogLijst').nextElementSibling || {}).innerText || '' };
    });
    for (const v of [r.aftrekPot, r.aftrekRest, r.som]) {
      if (r.bronnen.includes(Math.abs(v))) continue;      // toevallig gelijk aan een bron telt niet
      expect(r.getoond, JSON.stringify(r)).not.toContain(Math.abs(v));
    }
    expect(r.naDeRij).not.toMatch(/totaal|blijft over|houd je over|eigen kracht/i);
  });

  /* De identiteit die laat zien waarom dat getal niet deugt: de aftrekking is exact
     safeToSpend().safe min je huidige vrij besteedbare saldo, dus hij laat weg wat er al staat. */
  test('de aftrekking is safe min spendSaldo, en dus niet wat je overhoudt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const L = monthLiquidity(), S = safeToSpend(), VP = varPotjeStand(m);
      const inc = Math.round(L.incDue), fix = Math.round(L.fixDue);
      const spaar = Math.max(Math.round(S.saveReserved), 0);
      const rest = varPlanRemaining(m), inPotjes = VP.budget - VP.gebruikt;
      return { aftrekRest: inc - spaar - fix - rest, aftrekPot: inc - spaar - fix - inPotjes,
        identiteit: S.safe - S.spendSaldo, gat: rest - inPotjes,
        spendSaldo: S.spendSaldo, projected: Math.round(L.projected) };
    });
    expect(r.aftrekRest).toBe(r.identiteit);
    expect(r.aftrekPot).toBe(r.identiteit + r.gat);
    // en je huidige saldo zit er niet in, dus de aftrekking is niet de prognose
    expect(r.spendSaldo).toBeGreaterThan(0);
    expect(r.aftrekRest).not.toBe(r.projected);
  });
});

/* v260: de comment bij deze fixture ("een vaste last laat in de maand, zodat er ook echt nog iets
   te betalen is") is zelf een bewering, en die stond tien versies lang groen terwijl hij onwaar
   was: de boekingen droegen alleen een naam en isIncasso() leest de omschrijving, dus
   recurringSchedule() gaf nul vaste posten. Deze test toetst de FIXTURE en niet de app.
   HIJ HANGT NIET AAN DE DAG VAN DE MAAND: "laat in de maand" is na de 28e niet meer waar, dus wat
   vastligt is dat de posten HERKEND worden, aan welke kant van vandaag ze ook vallen. */
test.describe('d \u00b7 de fixture draagt wat zijn comment belooft', () => {
  test('recurringSchedule() herkent de maandlasten van deze fixture', async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => {
      const herkend = recurringSchedule()
        .filter((s) => s.type === 'fixed' && s.intervalM === 1 && (s.incasso || s.periodic));
      const L = monthLiquidity();
      return { herkend: herkend.length, fixDue: Math.round(L.fixDue), betaald: L.fixDueBetaald };
    });
    expect(f.herkend).toBeGreaterThan(0);
    expect(f.fixDue > 0 || f.betaald > 0).toBe(true);
  });
});
