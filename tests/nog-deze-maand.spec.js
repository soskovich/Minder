// v204: het blok "Nog deze maand" op Inzichten deed twee dingen tegelijk. Drie gelijkvormige
// tegels waarvan er een geen waarneming maar een plan was, met de vierde post als voetregel in de
// kleinste tekstgraad terwijl dat aan het begin van de maand de grootste uitgaande post is.
// De scheiding die er werkelijk is: waarneming tegenover plan. In twee kolommen zijn de rijen de
// scheiding. Er telt hier niets op, dus vier tegels suggereren geen waterval.
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
  const add = (id, acc, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (let i = 9; i >= 0; i--) {
    const m = M(i);
    add('i' + i, ACC, m, '25', 3200, 'Werkgever');
    add('h' + i, ACC, m, '02', -1200, 'Huur Woningstichting');
    add('n' + i, ACC, m, '03', -12, 'Netflix');
    // een vaste last laat in de maand, zodat er ook echt nog iets te betalen is
    if (!opt.allesBetaald) add('z' + i, ACC, m, '28', -95, 'Zilveren Kruis');
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

test.describe('a · de rij scheidt waarneming van plan', () => {
  /* BEDOELING OMGEDRAAID (v253): de volgorde stond op de scheiding van v204 (waarneming boven,
     plan onder) en is nu de weg van je geld door de maand: wat binnenkomt, wat je opzij zet, wat
     vastligt, en wat er voor je potjes overblijft. De scheiding van v204 draagt nog wel dat elke
     post zijn eigen vorm houdt en dat elke sub zijn bron noemt; dat staat in de test hieronder.
     WAT DEZE VOLGORDE NIET IS: een waterval. De vier van elkaar aftrekken geeft een getal dat er
     uitziet als "wat ik overhoud" en dat niet is, want het begint bij wat er NOG binnenkomt en
     niet bij wat er al staat. Gemeten op dezelfde maand met het salaris al binnen in plaats van
     nog komend springt die aftrekking van +2.025 naar -975 terwijl safeToSpend() op 3.720 blijft.
     Er staat daarom geen totaal en geen restregel, en die afwezigheid is wat de test in blok b
     vasthoudt. */
  test('vier posten, vier regels, in de weg van je geld door de maand', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    expect(b).not.toBeNull();
    expect(b.tegels.map((t) => t.label)).toEqual([
      'Nog te ontvangen', 'Nog te sparen', 'Nog te betalen · vast', 'Nog uit je potjes']);
    // v241: elke post staat op zijn eigen regel, in de volgorde waarin hij hierboven staat
    for (let i = 1; i < b.tegels.length; i++) expect(b.tegels[i].top).toBeGreaterThan(b.tegels[i - 1].top);
    // en de bedragen staan tegen dezelfde rechterkant, dus je kunt ze met elkaar vergelijken
    expect(new Set(b.tegels.map((t) => t.rechts)).size).toBe(1);
  });

  test('elke sub noemt zijn bron, dus de groepen dragen zichzelf', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    /* v253: op label en niet op plek. De volgorde is deze ronde veranderd en daarmee viel deze
       test om terwijl zijn eigenschap ongemoeid was: elke post noemt zijn eigen bron. */
    const sub = (l) => (b.tegels.find((t) => t.label === l) || {}).sub;
    expect(sub('Nog te betalen · vast')).toMatch(/incasso|niets herkend/i);
    expect(sub('Nog te ontvangen')).toBe('inkomen');
    expect(sub('Nog te sparen')).toMatch(/van €|gehaald/);
    // v208: de potjes-tegel is een voortgang geworden, met dezelfde noemer-vorm als de tegel ernaast
    expect(sub('Nog uit je potjes')).toMatch(/van €.*gebruikt|variabel/);
    // geen groepskoppen: de rij bestaat uit tegels en verder niets
    const koppen = await page.evaluate(() =>
      document.querySelectorAll('#insNogLijst > :not(.ins-nog-rij)').length);
    expect(koppen).toBe(0);
  });

  test('de variabele post is een tegel, geen voetregel meer', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    const pot = b.tegels[3];
    expect(pot.waarde).toMatch(/€/);
    /* v250: hier stond expect(pot.tik).toBe(true). De tik is verhuisd naar de regel onder het
       bedrag, want die noemt het bedrag dat openReservedPotjes() in zijn kop zet; het grote getal
       toont sindsdien de aftrekking en heeft geen tik meer. Waar de ingang hangt en waar hij op
       uitkomt staat in potjesregel-aansluiting.spec.js. Wat deze test vasthoudt is dat de post een
       post in de rij is en geen voetregel eronder, en dat blijft hieronder staan. */
    // de oude regel bestaat niet meer, in geen enkele vorm, in geen van de twee weergaven
    const src = await page.evaluate(() => nogDezeMaandPosten.toString() + nogDezeMaandBody.toString() + insNogLijst.toString());
    expect(src).not.toMatch(/plus \$\{euro0\(varPlan\)\} variabel/);
    /* v241: de lijst lijnt zijn bedragen rechts uit, dus text-align:right is daar juist gewenst.
       Wat deze test bewaakt is de oude voetregel, en die herken je eraan dat hij ná de posten stond
       en het variabele bedrag herhaalde. Dat toetsen we op het scherm in plaats van in de bron. */
    expect(b.naDeRij).not.toMatch(/variabel/i);
    expect(b.naDeRij).not.toContain(pot.waarde);
  });
});

test.describe('b · er telt niets op in dit blok', () => {
  test('geen enkel getal is de som of het verschil van de andere', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('ins');                       // eerst renderen, dan pas de bronnen lezen
      let L = null; try { L = monthLiquidity(); } catch (_) {}
      let vp = 0; try { vp = varPlanRemaining(curMonth); } catch (_) {}
      let S = null; try { S = safeToSpend(); } catch (_) {}
      const eur = (t) => Math.abs(Math.round(parseFloat(String(t).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0));
      // let op: Inzichten draagt verderop nog een .wvo-tiles, dus alleen de eerste
      const rij = document.querySelector('#insNogLijst');
      return { getoond: [...rij.querySelectorAll('.ins-nog-val')].map((x) => eur(x.innerText)),
               fix: Math.round(L.fixDue), inc: Math.round(L.incDue), vp: Math.round(vp),
               inPotjes: (function(){ try{ const V=varPotjeStand(curMonth); return Math.abs(V.budget-V.gebruikt); }catch(_){ return 0; } })(),
               spaar: S ? Math.round(Math.max(S.saveReserved, 0)) : 0 };
    });
    /* BEDOELING BIJGESTELD (v250): "geen enkel getal is een combinatie" gold voor de vier posten
       zoals ze toen waren. Het grote getal op de potjesregel is sindsdien met opzet een verschil,
       varBudget() min varPotjeStand().gebruikt, want het staat op één regel met "van X · Y
       gebruikt" en moest daarop aansluiten. Dat verschil is dus een geldige bron; wat de test
       tegenhoudt blijft wat v192 wegnam: getallen die posten uit verschillende bronnen bij elkaar
       optellen. */
    const bronnen = [r.fix, r.inc, r.spaar, r.vp, r.inPotjes];
    for (const g of r.getoond) expect(bronnen, JSON.stringify(r)).toContain(g);
    // en de combinaties die de weggehaalde chip toonde staan er niet
    for (const combi of [r.inc - r.fix - r.vp, r.fix + r.vp, r.inc - r.fix, r.fix + r.vp + r.spaar]) {
      if (bronnen.includes(Math.abs(combi))) continue;      // toevallig gelijk aan een bron telt niet
      expect(r.getoond).not.toContain(Math.abs(combi));
    }
  });

  test('de bron rekent niets samen', async ({ page }) => {
    await boot(page);
    // commentaar telt niet: de v169-notitie noemt bedragen met een minteken erin
    const src = await page.evaluate(() => nogDezeMaandBody.toString()
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, ''));
    // geen aftrekking of optelling tussen de drie posten (dat was de chip van v192)
    expect(src).not.toMatch(/incDue\s*-\s*/);
    expect(src).not.toMatch(/teOntvangen\s*-\s*teBetalen/);
    expect(src).not.toMatch(/varPlan\s*\+\s*teBetalen/);
    expect(src).not.toMatch(/eigen kracht|vrij n[aá] sparen/i);
  });
});

/* v204 gaf een oneven laatste tegel de volle breedte, want een halve rij leest als een tegel waar
   een tweede bij hoort te staan. In een lijst kan die halve rij niet bestaan: elke post is een
   regel over de volle breedte, hoeveel posten er ook zijn. De regel zelf is niet weg, hij geldt nog
   voor de tegelvorm in nogDezeMaandBody() die de terugval-kaart gebruikt; dat legt de laatste test
   hieronder vast. */
test.describe('c · elk aantal posten leest hetzelfde', () => {
  for (const [naam, opt, aantal, laatste] of [
    // v253: de volgorde is ontvangen, sparen, betalen, potjes; valt er een weg, dan schuift de rest op
    ['zonder potjes: drie regels', { geenPotjes: true }, 3, 'Nog te betalen · vast'],
    ['zonder spaardoel: drie regels', { geenSpaardoel: true }, 3, 'Nog uit je potjes'],
    ['zonder spaardoel en zonder potjes: twee regels', { geenSpaardoel: true, geenPotjes: true }, 2, 'Nog te betalen · vast'],
  ]) {
    test(naam, async ({ page }) => {
      await boot(page, seed({}, opt));
      const b = await blok(page);
      expect(b.tegels.length).toBe(aantal);
      expect(b.tegels[aantal - 1].label).toBe(laatste);
      // elke regel even breed, dus geen halve rij en geen uitzondering voor de laatste
      const breed = await page.evaluate(() => [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
        .map((t) => Math.round(t.getBoundingClientRect().width)));
      expect(new Set(breed).size).toBe(1);
      // de bedragen blijven onderling vergelijkbaar
      expect(new Set(b.tegels.map((t) => t.rechts)).size).toBe(1);
    });
  }

  test('de tegelvorm houdt zijn volle-breedte-regel voor de terugval-kaart', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => nogDezeMaandBody.toString());
    expect(src).toContain('grid-column:1/-1');
    expect(src).toMatch(/posten\.length\s*%\s*2\s*===\s*1/);
  });
});

test.describe('d · de vier situaties uit de controlelijst', () => {
  test('halverwege de maand', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    expect(b.tegels.length).toBe(4);
    // v253: op label, want de vaste post staat niet meer vooraan
    expect(b.tegels.find((t) => t.label === 'Nog te betalen · vast').waarde).toMatch(/€/);
  });

  test('aan het begin van de maand is de potjes-post de grootste', async ({ page }) => {
    await boot(page, seed({}, { beginMaand: true }));
    const b = await blok(page);
    const eur = (s) => Math.abs(parseFloat(String(s).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
    // v253: op label, want de volgorde is veranderd; de eigenschap is dezelfde
    const pot = eur(b.tegels.find((t) => t.label === 'Nog uit je potjes').waarde);
    const spaar = eur(b.tegels.find((t) => t.label === 'Nog te sparen').waarde);
    expect(pot).toBeGreaterThan(spaar);
    // en hij staat in dezelfde vorm als zijn buurman, niet meer in de kleinste graad
    const zelfde = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#insNogLijst .ins-nog-val')];
      return getComputedStyle(t[t.length - 2]).fontSize === getComputedStyle(t[t.length - 1]).fontSize;
    });
    expect(zelfde).toBe(true);
  });

  test('met alles betaald blijft de tegel staan en kleurt hij niet rood', async ({ page }) => {
    await boot(page, seed({}, { allesBetaald: true }));
    const b = await blok(page);
    expect(b.tegels.map((t) => t.label)).toContain('Nog te betalen · vast');
    // v253: de vaste post staat niet meer vooraan, dus zoek hem op zijn label en niet op zijn plek
    const kleur = await page.evaluate(() => {
      const r = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
        .find((x) => /nog te betalen/i.test(x.innerText));
      return r.querySelector('.ins-nog-val').getAttribute('style') || '';
    });
    expect(kleur).toMatch(/--mut/);
  });

  test('zonder potjes verdwijnt de potjes-tegel en niet de rest', async ({ page }) => {
    await boot(page, seed({}, { geenPotjes: true }));
    const b = await blok(page);
    expect(b.tegels.map((t) => t.label)).not.toContain('Nog uit je potjes');
    expect(b.tegels.map((t) => t.label)).toContain('Nog te ontvangen');
  });
});

test.describe('e · de plan-rij houdt drie rollen en herhaalt de uitleg niet', () => {
  /* v225: de uitleg onder de lijst is vervallen. De rij noemt nu zelf op welke bestemming hij
     wacht; dat is een feit over die rij, geen alinea over hoe auto werkt. De eis van v193 blijft:
     geen uitleg in de rij. */
  test('een wachtend doel noemt waarop hij wacht, en verder niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('vooruit');
      const rij = [...document.querySelectorAll('#s-vooruit .plan-item')]
        .find((x) => /Wacht op/.test(x.innerText));
      return { rij: rij ? rij.innerText.replace(/\s+/g, ' ') : '',
               onder: document.querySelectorAll('#planWacht').length };
    });
    expect(r.rij).toMatch(/Wacht op .\S/);           // met een naam erbij
    expect(r.rij).toMatch(/. auto|. vast|%/);        // en de modus
    expect(r.rij).not.toMatch(/gaat eerst naar de doelen erboven/);
    expect(r.rij).not.toMatch(/pakt wat er nog is|pakt nu alles wat er overblijft/);
    expect(r.onder).toBe(0);
  });

  test('een lopend, een wachtend en een gepauzeerd doel dragen elk drie rollen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('vooruit');
      return [...document.querySelectorAll('#s-vooruit .plan-item')].map((x) => ({
        tekst: x.innerText.replace(/\s+/g, ' '),
        balk: x.querySelectorAll('.bar-track').length,
        keuze: x.querySelectorAll('.plan-mv, .plan-act, [onclick]').length,
      }));
    });
    const lopend = r.find((x) => /op dit tempo/.test(x.tekst));
    const wacht = r.find((x) => /Wacht op/.test(x.tekst));
    const pauze = r.find((x) => /Gepauzeerd/.test(x.tekst));
    for (const x of [lopend, wacht, pauze]) {
      expect(x, JSON.stringify(r.map((y) => y.tekst))).toBeTruthy();
      expect(x.tekst).toMatch(/toegewezen \/ €/);   // spiegel
      expect(x.balk).toBe(1);
      expect(x.keuze).toBeGreaterThan(0);           // keuze
    }
    expect(pauze.tekst).toMatch(/Gepauzeerd . krijgt nu niets/);   // gevolg
  });

  test('planModeLabel legt niet meer uit wat auto doet', async ({ page }) => {
    await boot(page);
    // op de uitkomst toetsen en niet op de bron: het commentaar noemt de oude tekst
    expect(await page.evaluate(() => planModeLabel({ mode: 'auto' }))).toBe('auto');
    // de andere twee takken blijven een feit met een bedrag of percentage
    expect(await page.evaluate(() => planModeLabel({ mode: 'fixed', perMaand: 200 }))).toMatch(/vast €/);
  });
});

test.describe('f · layout', () => {
  for (const w of [360, 390]) {
    test(`de lijst past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 820 });
      await boot(page);
      await page.evaluate(() => go('ins'));
      const r = await page.evaluate(() => {
        const rij = document.querySelector('#insNogLijst');
        return { over: document.body.scrollWidth - document.body.clientWidth,
                 rijOver: rij.scrollWidth - rij.clientWidth,
                 rijen: new Set([...rij.querySelectorAll('.ins-nog-rij')]
                   .map((t) => Math.round(t.getBoundingClientRect().top))).size,
                 posten: rij.querySelectorAll('.ins-nog-rij').length };
      });
      expect(r.over).toBeLessThanOrEqual(1);
      expect(r.rijOver).toBeLessThanOrEqual(1);
      expect(r.rijen).toBe(r.posten);   // v241: elke post een eigen regel, dus geen twee naast elkaar
    });
  }
});
