/* v309: het hoofdgetal van de stand-kaart op Inzichten, en de verhuizing van "Nog uit je potjes".
 *
 * WAT DEZE RONDE DOET. Het grootste getal op de kaart was `totals().spendNorm`, dus wat je AL kwijt
 * was, en de post "Nog uit je potjes" stond als vierde regel onder "Nog deze maand". Die post is
 * hierheen VERHUISD en staat daar niet meer: het grote getal met zijn achtervoegsel op een regel,
 * en "EUR X uitgegeven van EUR Y . Z%" gezakt naar een eigen regel boven de balk. De legenda onder
 * de balk is vervallen, want de dagteller staat sinds v241 al in de eyebrow erboven.
 *
 * DE TWEE BRONNEN ZIJN NIET DEZELFDE, en dat is wat deze spec vooral vasthoudt. Het hoofdgetal is
 * `varBudget()` min `varPotjeStand().gebruikt`, dus alleen de VARIABELE potjes; de regel eronder is
 * `totals().spendNorm` tegen `totals().budget`, dus ook de categorieen zonder potje en de
 * terugkerende potjes. GEMETEN op de zware stand van deze fixture: het rekenkundige restant van die
 * regel is -98 en het hoofdgetal 42, een gat van 140. Ze staan daarom onder een EIGEN naam, en geen
 * van beide namen komt twee keer voor (v91/v257).
 *
 * DE FIXTURE, en wat eraan geconstrueerd is (v251/v256): de vorm komt van de fixture van v269 (de
 * twee CJIB-boetes, een geenNorm-uitgave en een kasgeld-opname), want die levert het zwaarste geval
 * voor de hoogte. De potjebedragen zijn GECONSTRUEERD: ze bepalen hoe groot de divergentie is, niet
 * of er een is. De dag staat vast op zeven dagen over (v299), want het achtervoegsel en de
 * tempo-krapte hangen eraan.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pinDag, DAGEN_OVER } = require('./vaste-dag');
const { sectieVan } = require('./bron-sectie.js');
const { kaalBron, kaalUit, KAAL_JS } = require('./bron-kaal');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const DEZE = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';
const RES = '100110012555096333';

/* De uitgaven van de basisfixture in DEZE maand, per categorie met een potje. Ze staan hier als
   constante omdat elke verwachting eronder ze gebruikt, en ze worden ook als INVOER gemeten. */
const SPEND_BOOD = 220 + 190 + 160;     // 570, drie Albert Heijn-boekingen
const SPEND_VERV = 85;                  // Shell
const SPEND_UITE = 60;                  // Cafe De Kroon
const SPEND_BELA = 313 + 150;           // 463, de twee CJIB-boetes

/* RUIM: de standaard. Een restant boven nul en geen tempo-krapte, zodat het achtervoegsel het
   dagbedrag draagt. huur is terugkerend en valt dus buiten varBudget(). */
const RUIM = { boodschappen: 700, huur: 1450, vervoer: 120, uiteten: 150, belasting: 600 };
const RUIM_VAR = 700 + 120 + 150 + 600;             // 1570
/* ZWAAR: het potje belasting op 100, dus de boetes gaan er ruim over. Dit is de stand waarop de
   hoogte en de divergentie worden gemeten. */
const ZWAAR = { boodschappen: 700, huur: 1450, vervoer: 120, uiteten: 150, belasting: 100 };
const ZWAAR_VAR = 700 + 120 + 150 + 100;            // 1070

function seed(opt) {
  opt = opt || {};
  const tx = []; let i = 0;
  const add = (d, a, n, desc, ac) => tx.push({ id: 'x' + (i++), date: d, amount: a, acc: ac || ACC,
    name: n, desc: desc || n, typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
  for (let k = 5; k >= 0; k--) {
    const m = M(k);
    add(m + '-25', 5216, 'Loonstrook', 'SALARIS MAANDELIJKS');
    add(m + '-01', -1450, 'Woningstichting', 'SEPA INCASSO HUUR WONINGSTICHTING');
    add(m + '-04', -140, 'Zorgverzekeraar', 'SEPA INCASSO ZORGVERZEKERING');
    add(m + '-06', -220, 'Albert Heijn'); add(m + '-14', -190, 'Albert Heijn'); add(m + '-21', -160, 'Albert Heijn');
    add(m + '-09', -85, 'Shell'); add(m + '-17', -60, 'Cafe De Kroon');
  }
  add(DEZE + '-13', -313, 'CJIB', 'CJIB BOETE');
  add(DEZE + '-13', -150, 'CJIB', 'CJIB BOETE');
  add(DEZE + '-12', -497, 'Loodgieter', 'SPOEDREPARATIE');
  add(DEZE + '-11', -120, 'Kasgeld', 'KASGELD');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: true,
      manualBal: { [ACC]: 4200, [RES]: 1537 }, savingsAcc: { [RES]: false },
      budgets: opt.budgets || RUIM,
      savingMode: 'amount', savingAmount: 500, goals: [], resAcc: RES }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, opt) {
  opt = opt || {};
  if (opt.zwaar && !opt.budgets) opt = Object.assign({}, opt, { budgets: ZWAAR });
  await page.route('**/sw.js', (r) => r.abort());
  await pinDag(page, opt.dagenOver == null ? DAGEN_OVER : opt.dagenOver);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.setViewportSize({ width: opt.breedte || 390, height: 844 });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof varPotjeStand === 'function' && typeof insBudgetBlok === 'function');
  /* Het zwaarste geval voor de hoogte: twee geenNorm-categorieen met uitgaven (de loodgieter en het
     kasgeld) plus een gedeeltelijk gevlagde boeking, en nog boven je maandbudget. Dat is precies de
     combinatie die v269 op 213px mat. */
  if (opt.zwaar) await page.evaluate(() => { const m = thisYM();
    OVR[txOfMonth(m).find((t) => t.name === 'Loodgieter').id] = 'onvoorzien';
    OVR[txOfMonth(m).find((t) => t.name === 'Kasgeld').id] = 'contant';
    const b = txOfMonth(m).find((t) => t.name === 'CJIB' && -t.amount === 150);
    zetUitReservering(b.id, 150, false); save(); render(); });
}

/* Alles in een greep. De kaart komt uit zijn id en niet uit "de eerste zichtbare .card": dat
   tweede is een gok die met elk blok erboven kan omvallen (v309). */
const KERN = `const m=kijkMaand();
  go('ins');
  const kaart=document.getElementById('insStand');
  const t=totals(m); let VP=null; try{ VP=varPotjeStand(m); }catch(_){}
  const lijst=document.getElementById('insNogLijst');
  const NL=String.fromCharCode(10);
  return {
    maand: m, lopend: isLopendeMaand(m), erKaart: !!kaart,
    kaartHtml: kaart?kaart.innerHTML:'', kaartTekst: kaart?kaart.innerText.split(NL).join(' | '):'',
    hoogte: kaart?Math.round(kaart.getBoundingClientRect().height):0,
    paginaTekst: document.getElementById('s-ins').innerText.split(NL).join(' | '),
    lijstTekst: lijst?lijst.innerText.split(NL).join(' | '):'',
    posten: nogDezeMaandPosten().map(p=>p.lab.replace(/<[^>]*>/g,'')),
    eyebrow: (document.querySelector('.ins-eyebrow')||{innerText:''}).innerText.split(NL).join(' '),
    varBudget: varBudget(), gebruikt: VP?VP.gebruikt:null,
    inPotjes: VP?VP.budget-VP.gebruikt:null,
    tempoSom: VP?VP.rest:null,
    dagen: maandDagenOver(m),
    budget: Math.round(t.budget), spendNorm: Math.round(t.spendNorm),
    kaartRestant: Math.round(t.budget)-Math.round(t.spendNorm) };`;
const LEES = `(() => { ${KERN} })()`;
const LEES_MAAND = (mm) => `(() => { zetKijkMaand('${mm}'); ${KERN} })()`;

test.describe('a - de fixture draagt wat deze spec beweert', () => {
  test('de ruime stand: een restant boven nul en geen tempo-krapte', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.erKaart).toBe(true);
    expect(r.varBudget).toBe(RUIM_VAR);
    expect(r.gebruikt).toBe(SPEND_BOOD + SPEND_VERV + SPEND_UITE + SPEND_BELA);
    expect(r.inPotjes).toBe(RUIM_VAR - r.gebruikt);
    expect(r.inPotjes).toBeGreaterThan(0);
    expect(r.tempoSom - r.inPotjes).toBeLessThanOrEqual(0);
    expect(r.dagen).toBe(DAGEN_OVER);
    console.log(`### ruim: inPotjes ${r.inPotjes}, tempo-som ${r.tempoSom}, dagen ${r.dagen}`);
  });

  test('de zware stand: een restant boven nul MET tempo-krapte, en het zwaarste geval voor de hoogte', async ({ page }) => {
    await boot(page, { zwaar: true });
    const r = await page.evaluate(LEES);
    const inv = await page.evaluate(() => { const m = thisYM(); const t = totals(m);
      return { gn: Object.keys(CATS).filter((c) => CATS[c].geenNorm && -(t.byCat[c] || 0) > 0).length,
        res: Object.keys(t.uitResCat || {}).filter((k) => (t.uitResCat[k] || 0) > 0).length,
        over: Math.round(t.spendNorm) > Math.round(t.budget) }; });
    expect(r.varBudget).toBe(ZWAAR_VAR);
    expect(r.inPotjes).toBeGreaterThan(0);
    expect(r.tempoSom - r.inPotjes).toBeGreaterThan(0);
    expect(inv.gn).toBe(2);           // twee geenNorm-categorieen met uitgaven
    expect(inv.res).toBe(1);          // een gevlagde categorie
    expect(inv.over).toBe(true);      // en nog boven je maandbudget, dus budgetOverZin staat er
    console.log(`### zwaar: inPotjes ${r.inPotjes}, tempo-som ${r.tempoSom}, gat ${r.tempoSom - r.inPotjes}`);
  });
});

test.describe('b - verhuizen en niet kopieren', () => {
  test('het potjesgetal staat op de kaart en de post is uit "Nog deze maand" verdwenen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.kaartTekst).toMatch(/nog in je potjes/);
    expect(r.kaartTekst).toContain('€' + r.inPotjes);
    /* WELKE POSTEN ER OVERBLIJVEN, gemeten en niet aangenomen: "Nog te ontvangen" is op deze
       fixture LEEG, want het salaris van deze maand staat al in `txOfMonth(m)` (die filtert op de
       maand en niet op vandaag), dus er komt niets meer en de post valt weg (v260). Wat de
       verhuizing moet aantonen is dat de potjes-post eruit is en de andere niet zijn geraakt. */
    expect(r.posten).toEqual(['Nog te sparen', 'Nog te betalen · vast']);
    expect(r.posten).not.toContain('Nog uit je potjes');
    expect(r.lijstTekst).not.toMatch(/uit je potjes/);
    expect(r.lijstTekst).not.toMatch(/Te veel uitgegeven/);
    console.log(`### posten onder Nog deze maand: ${r.posten.join(' ; ')}`);
    console.log(`### kaart: ${r.kaartTekst}`);
  });

  test('de overgebleven posten zijn er nog, en de kop van het blok ook', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.posten.length).toBe(2);
    expect(r.paginaTekst).toMatch(/NOG DEZE MAAND/i);
    expect(r.lijstTekst).toMatch(/Nog te sparen/);
    expect(r.lijstTekst).toMatch(/Nog te betalen/);
  });

  test('het label staat precies een keer op de pagina, en het getal ook', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect((r.paginaTekst.match(/nog in je potjes/gi) || []).length).toBe(1);
    /* Het getal zelf ook maar een keer: zou de post blijven staan, dan stond hetzelfde bedrag op
       twee plekken en kostte het twee keer een verificatie. */
    const n = (r.paginaTekst.match(new RegExp('€' + r.inPotjes + '(?!\\d)', 'g')) || []).length;
    expect(n).toBe(1);
  });
});

test.describe('c - de kop: het getal en zijn bron', () => {
  test('het hoofdgetal is de potjes-bron en niet de som van de kaart', async ({ page }) => {
    await boot(page, { zwaar: true });
    const r = await page.evaluate(LEES);
    /* HET GEVAL DAT DE TWEE BRONNEN ONDERSCHEIDT. Zonder een divergentie tussen de twee frames is
       "het hoofdgetal leest de potjes" niet te onderscheiden van "het hoofdgetal leest de kaart",
       en blijft de sabotage die de bron omzet groen (meetles a/o). */
    expect(r.inPotjes).toBe(ZWAAR_VAR - r.gebruikt);
    expect(r.kaartRestant).not.toBe(r.inPotjes);
    console.log(`### potjes-frame ${r.gebruikt} van ${r.varBudget} -> ${r.inPotjes}`);
    console.log(`### kaart-frame  ${r.spendNorm} van ${r.budget} -> ${r.kaartRestant}`);
    console.log(`### divergentie ${r.kaartRestant - r.inPotjes}`);
    expect(r.inPotjes).toBe(42);
    expect(r.kaartRestant).toBe(-98);
    expect(r.kaartTekst).toContain('€42');
    expect(r.kaartTekst).not.toMatch(/98 nog in je potjes/);
  });

  test('het hoofdgetal zelf heeft geen tik', async ({ page }) => {
    await boot(page);
    const geen = await page.evaluate(() => { const k = document.getElementById('insStand');
      // de flex-rij van de kop zelf, niet het omhulsel van de hele kaart
      const rij = [...k.querySelectorAll('div.row')].find((x) => /nog in je potjes/.test(x.textContent));
      return { onclick: rij.getAttribute('onclick'), kinderen: [...rij.querySelectorAll('[onclick]')].length,
        tekst: rij.innerText }; });
    /* v250/v254: er is geen scherm dat dit getal toont. openPotjesVerdeling() toont alle potjes
       zonder besteding en openReservedPotjes() de reservering, dus elke tik komt op een ander
       bedrag uit dan waarop je tikte. Liever geen tik dan een verkeerde. */
    expect(geen.onclick).toBe(null);
    expect(geen.kinderen).toBe(0);
  });
});

test.describe('d - het achtervoegsel: het dagbedrag, of de krapte als die er is', () => {
  test('zonder krapte draagt het het dagbedrag, gedeeld door maandDagenOver', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    const perDag = Math.round(r.inPotjes / r.dagen);
    expect(r.kaartTekst).toContain(`nog in je potjes · €${perDag} per dag`);
    expect(r.kaartTekst).not.toMatch(/bij je tempo/);
    console.log(`### dagbedrag ${perDag} over ${r.dagen} dagen: ${r.kaartTekst.split(' | ').slice(0, 2).join(' ')}`);
  });

  test('het staat op dezelfde regel als het grote getal', async ({ page }) => {
    await boot(page);
    const zelfde = await page.evaluate(() => { const k = document.getElementById('insStand');
      const label = [...k.querySelectorAll('span')].find((x) => /nog in je potjes/.test(x.textContent));
      const groot = [...k.querySelectorAll('span')].find((x) => /fs-xl/.test(x.getAttribute('style') || ''));
      return Math.round(label.getBoundingClientRect().top) === Math.round(groot.getBoundingClientRect().top)
        || label.parentElement === groot.parentElement; });
    expect(zelfde).toBe(true);
  });

  test('met krapte draagt het de krapte en niet het dagbedrag', async ({ page }) => {
    await boot(page, { zwaar: true });
    const r = await page.evaluate(LEES);
    const gat = r.tempoSom - r.inPotjes;
    expect(gat).toBeGreaterThan(0);
    expect(r.kaartTekst).toContain(`nog in je potjes · bij je tempo €${gat} tekort`);
    expect(r.kaartTekst).not.toMatch(/per dag/);
    /* En nergens meer als eigen regel: niet op de kaart en niet in de lijst. Als eigen regel zou
       hij de kaart 23px hoger maken, en dat is de meting in blok f. */
    expect(r.kaartTekst).not.toMatch(/Bij je tempo nog/);
    expect(r.lijstTekst).not.toMatch(/tempo/);
    console.log(`### krapte: ${r.kaartTekst.split(' | ').slice(0, 2).join(' ')}`);
  });

  test('een restant van nul draagt geen achtervoegsel, en het getal blijft staan', async ({ page }) => {
    await boot(page, { budgets: { boodschappen: SPEND_BOOD, huur: 1450 } });
    const r = await page.evaluate(LEES);
    expect(r.varBudget).toBe(SPEND_BOOD);
    expect(r.gebruikt).toBe(SPEND_BOOD);
    expect(r.inPotjes).toBe(0);
    /* Nul is hier een STAND en geen afwezigheid, precies als in de post die hierheen verhuisde:
       je potjes zijn op. Een dagbedrag van nul zou datzelfde herhalen (v257/v260). */
    expect(r.kaartTekst).toMatch(/€0 \| nog in je potjes/);
    expect(r.kaartTekst).not.toMatch(/per dag/);
    expect(r.kaartTekst).not.toMatch(/bij je tempo/);
    console.log(`### nul: ${r.kaartTekst.split(' | ').slice(0, 2).join(' ')}`);
  });

  test('een negatief restant heet "te veel uitgegeven" en draagt geen achtervoegsel', async ({ page }) => {
    await boot(page, { budgets: { boodschappen: 500, huur: 1450 } });
    const r = await page.evaluate(LEES);
    expect(r.gebruikt).toBe(SPEND_BOOD);
    expect(r.inPotjes).toBe(500 - SPEND_BOOD);
    expect(r.kaartTekst).toMatch(/€70 \| te veel uitgegeven/);
    expect(r.kaartTekst).not.toMatch(/nog in je potjes/);
    expect(r.kaartTekst).not.toMatch(/per dag/);
    /* En ook geen krapte: bij een negatief restant is het gat per constructie positief (de
       tempo-som PLUS de overschrijding) en zou het een groter getal over dezelfde overschrijding
       zetten. Een signaal dat in een hele tak altijd vuurt is geen signaal (meetles p). */
    expect(r.tempoSom - r.inPotjes).toBeGreaterThan(0);
    expect(r.kaartTekst).not.toMatch(/bij je tempo/);
    expect(r.kaartTekst).not.toMatch(/€-/);      // het label zegt de richting al
    console.log(`### negatief: ${r.kaartTekst.split(' | ').slice(0, 2).join(' ')} (gat zou ${r.tempoSom - r.inPotjes} zijn)`);
  });
});

test.describe('e - de regel boven de balk houdt zijn noemer en zijn twee ingangen', () => {
  test('de regel noemt het uitgegeven bedrag, de noemer en het percentage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    const pct = Math.round(r.spendNorm / r.budget * 100);
    expect(r.kaartTekst).toMatch(/€[\d.]+ uitgegeven/);
    expect(r.kaartTekst).toMatch(/van €[\d.]+ maandbudget/);
    expect(r.kaartTekst).toContain(pct + '%');
  });

  test('beide tikken staan er nog: dit is de enige ingang op Inzichten naar die twee sheets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    /* Meetles: een melding kan de enige drager van een ingang zijn. openMonthSpend(m) en
       openPotjesVerdeling(m) zijn van Inzichten uit alleen via deze regel te bereiken; de andere
       aanroepen in de bron zijn voetregels BINNEN een sheet of de 'next'-laag. */
    expect(r.kaartHtml).toContain(`openMonthSpend('${r.maand}')`);
    expect(r.kaartHtml).toContain(`openPotjesVerdeling('${r.maand}')`);
  });
});

test.describe('f - de hoogte, gemeten tegen de stand van v308', () => {
  /* DE EIS IS EEN VERGELIJKING EN GEEN VAST GETAL: de kaart mag niet hoger worden dan hij was.
     GEMETEN op precies dezelfde stand voor deze ronde: 213px op 360 EN 390px, de worst-case van
     v269. Na deze ronde 199px. De legenda van 23px is vervallen en de gezakte regel kost er 23;
     wat overblijft is dat de oude kop met zijn drie flex-delen hoger was dan de nieuwe kleine
     regel. Daarmee haalt de kaart voor het eerst sinds v269 ook de 200px van v241 weer. */
  const VOOR_V309 = 213;
  for (const w of [360, 390]) {
    test(`het zwaarste geval op ${w}px blijft onder de stand van v308`, async ({ page }) => {
      await boot(page, { breedte: w, zwaar: true });
      const r = await page.evaluate(LEES);
      console.log(`### zwaarste geval @${w}px: ${r.hoogte}px (was ${VOOR_V309}px voor v309)`);
      console.log(`###   ${r.kaartTekst}`);
      expect(r.hoogte).toBeLessThanOrEqual(VOOR_V309);
      expect(r.hoogte).toBe(199);
      expect(r.hoogte).toBeLessThan(200);
    });

    test(`de krapte als eigen regel zou hem op ${w}px over die stand tillen`, async ({ page }) => {
      await boot(page, { breedte: w, zwaar: true });
      /* DE METING DIE DE VORM KOOS. Dezelfde zin als losse regel onder budgetOverZin kost 23px
         (18px tekst plus 5px marge, hetzelfde als elke andere regel in dit blok, gemeten bij v269),
         en dan gaat het zwaarste geval van 199 naar 222px: hoger dan de 213px van v308 EN over de
         200px van v241. Daarom zit de krapte in het achtervoegsel van de kop. */
      const kost = await page.evaluate(() => { go('ins'); const k = document.getElementById('insStand');
        const h = () => Math.round(k.getBoundingClientRect().height); const nu = h();
        const d = document.createElement('div'); d.className = 'small';
        d.setAttribute('style', 'color:var(--mut2);margin-top:5px;line-height:1.45');
        d.textContent = 'Bij je tempo nog €216 nodig · €174 tekort';
        const balk = k.querySelector('.bar-track').parentElement;
        balk.parentElement.insertBefore(d, balk.nextSibling);
        return { zonder: nu, met: h() }; });
      console.log(`### @${w}px zonder de losse regel ${kost.zonder}px, met ${kost.met}px, dus ${kost.met - kost.zonder}px`);
      expect(kost.zonder).toBe(199);
      expect(kost.met - kost.zonder).toBe(23);
      expect(kost.met).toBe(222);
      expect(kost.met).toBeGreaterThan(VOOR_V309);
    });
  }
});

test.describe('g2 - de kop past op een regel', () => {
  /* Overgenomen uit `potjes-weekvenster.spec.js`, dat bij v309 is vervallen met de weekregel: die
     spec mat dat de regel op 360 en 390px niet afbreekt. Diezelfde vraag geldt nu voor de kop, en
     zwaarder, want daar staan het grote getal, het label EN het achtervoegsel op een regel. Breekt
     hij af, dan kost dat 23px en gaat de hoogte-eis om (blok f). */
  for (const w of [360, 390]) {
    for (const stand of ['dagbedrag', 'krapte']) {
      test(`de kop met het ${stand} blijft een regel op ${w}px`, async ({ page }) => {
        await boot(page, { breedte: w, zwaar: stand === 'krapte' });
        const r = await page.evaluate(() => { go('ins'); const k = document.getElementById('insStand');
          const rij = [...k.querySelectorAll('div.row')]
            .find((x) => /nog in je potjes|te veel uitgegeven/.test(x.textContent));
          const groot = rij.querySelector('span');
          return { hoogte: Math.round(rij.getBoundingClientRect().height),
            grootHoogte: Math.round(groot.getBoundingClientRect().height),
            tekst: rij.innerText.split(String.fromCharCode(10)).join(' '),
            overloop: document.body.scrollWidth - document.body.clientWidth }; });
        console.log(`### kop @${w}px ${stand}: ${r.hoogte}px voor "${r.tekst}"`);
        // een regel is de hoogte van het grote getal zelf; een tweede regel verdubbelt die
        expect(r.hoogte).toBeLessThanOrEqual(r.grootHoogte + 2);
        expect(r.overloop).toBeLessThanOrEqual(1);
      });
    }
  }

  test('ook bij vijf cijfers in beide bedragen', async ({ page }) => {
    /* Grote bedragen zijn de echte lat: de oude weekregel viel om boven de EUR 9.999. Hier staan er
       TWEE bedragen op een regel, dus die grens hoort gemeten en niet aangenomen. */
    await boot(page, { breedte: 360, budgets: { boodschappen: 40000, huur: 1450 } });
    const r = await page.evaluate(() => { go('ins'); const k = document.getElementById('insStand');
      const rij = [...k.querySelectorAll('div.row')].find((x) => /nog in je potjes/.test(x.textContent));
      const groot = rij.querySelector('span');
      return { hoogte: Math.round(rij.getBoundingClientRect().height),
        grootHoogte: Math.round(groot.getBoundingClientRect().height),
        tekst: rij.innerText.split(String.fromCharCode(10)).join(' ') }; });
    console.log(`### kop @360px met grote bedragen: ${r.hoogte}px voor "${r.tekst}"`);
    expect(r.tekst).toMatch(/€\d{2}\.\d{3}/);
    expect(r.hoogte).toBeLessThanOrEqual(r.grootHoogte + 2);
  });
});

test.describe('g - de legenda is vervallen en de dagteller staat erboven', () => {
  test('de kaart zegt niet meer waar de streep staat', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.kaartTekst).not.toMatch(/de streep staat waar de maand nu is/);
    expect(r.paginaTekst).not.toMatch(/de streep staat waar de maand nu is/);
  });

  test('de streep zelf staat er nog, met zijn eigen uitleg', async ({ page }) => {
    await boot(page);
    const streep = await page.evaluate(() => { const k = document.getElementById('insStand');
      const i = k.querySelector('i[title]'); return i ? i.getAttribute('title') : null; });
    expect(streep).toMatch(/de maand is \d+% voorbij/);
  });

  test('de dagteller staat in de eyebrow boven de kaart, en die is de reden dat de legenda kan vervallen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.eyebrow).toMatch(/dag \d+ van \d+/);
  });
});

test.describe('h - budgetOverZin noemt de noemer waarmee hij rekent', () => {
  test('hij zegt niet meer "over je potjes" naast een hoofdgetal dat wel de potjes leest', async ({ page }) => {
    await boot(page, { zwaar: true });
    const r = await page.evaluate(LEES);
    expect(r.spendNorm).toBeGreaterThan(r.budget);
    /* v91: hetzelfde woord voor twee getallen. Het hoofdgetal leest varBudget() min gebruikt en
       deze zin totals().spendNorm min totals().budget; op deze fixture is dat 42 tegen -98. Met
       "over je potjes" stond er "EUR 42 nog in je potjes" boven "EUR 98 over je potjes". */
    expect(r.kaartTekst).toMatch(/nog in je potjes/);
    expect(r.kaartTekst).toMatch(/over je maandbudget/);
    expect(r.kaartTekst).not.toMatch(/over je potjes/);
    console.log(`### ${r.kaartTekst}`);
  });

  test('het getal van die zin is niet aangeraakt: het blijft het kaart-frame', async ({ page }) => {
    await boot(page, { zwaar: true });
    const r = await page.evaluate(LEES);
    // open punt sinds v250/v251: dit getal is spendNorm min budget en niet het potjes-restant
    expect(r.kaartTekst).toContain('€' + (r.spendNorm - r.budget) + ' over je maandbudget');
  });

  test('de kaartregel houdt zijn eigen spelling en de zin leidt de zijne eruit af', async ({ page }) => {
    /* De kaart noemde zijn noemer altijd 'maandbudget' zonder lidwoord en 'je inkomen-limiet' MET,
       en `zwijgen-bij-onbekend.spec.js` pint die tweede. De zin krijgt 'je ' plus diezelfde naam,
       dus er staat een noun en geen twee spellingen (v91/v104). */
    await boot(page);
    const r = await page.evaluate(LEES);
    expect(r.kaartTekst).toMatch(/van €[\d.]+ maandbudget/);
    expect(r.kaartTekst).not.toMatch(/van €[\d.]+ je maandbudget/);
  });

  test('zonder potjes noemt de kaart de inkomen-limiet met zijn lidwoord', async ({ page }) => {
    await boot(page, { budgets: {} });
    const r = await page.evaluate(LEES);
    /* De invoer eerst, in plaats van de uitkomst wegfilteren (v299/v300): zonder potjes valt
       totals().budget terug op de inkomen-limiet, dus de kaart rendert wel en potTotal is nul. */
    expect(r.varBudget).toBe(0);
    expect(r.budget).toBeGreaterThan(0);
    expect(r.erKaart).toBe(true);
    expect(r.kaartTekst).toMatch(/je inkomen-limiet/);
    expect(r.kaartTekst).not.toMatch(/nog in je potjes/);
    console.log(`### geen potjes: ${r.kaartTekst}`);
  });

  test('het woord komt van de aanroeper en staat maar op een plek', () => {
    const zin = sectieVan(SRC, 'function budgetOverZin(');
    const blok = sectieVan(SRC, 'function insBudgetBlok(m){');
    expect(zin).toContain('const N=noemer||');
    expect(zin).not.toContain('je potjes');
    expect((blok.match(/potTotal>0\?/g) || []).length).toBe(1);
    expect(blok).toContain("const noemerZin = 'je '+noemer.replace(");
    expect(blok).toContain('budgetOverZin(sp,bud,d,over,opDeGrens,noemerZin)');
  });
});

test.describe('i - de nieuwe kop alleen waar hij waar is', () => {
  test('een afgeronde maand houdt het terugkijkende hoofdgetal', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(LEES_MAAND(M(1)));
    expect(r.lopend).toBe(false);
    expect(r.maand).toBe(M(1));
    /* v194: "nog in je potjes" is geen uitspraak over een maand die om is. De kaart houdt dan zijn
       oude kop, en de gezakte regel staat er niet, want die zou datzelfde getal verdubbelen. */
    expect(r.kaartTekst).not.toMatch(/nog in je potjes/);
    expect(r.kaartTekst).not.toMatch(/te veel uitgegeven/);
    expect((r.kaartTekst.match(/uitgegeven/g) || []).length).toBe(1);
    console.log(`### afgeronde maand ${r.maand}: ${r.kaartTekst}`);
  });

  test('zonder variabele potjes houdt de lopende maand hem ook', async ({ page }) => {
    // alleen een terugkerend potje: totals().budget is boven nul, varBudget() is nul
    await boot(page, { budgets: { huur: 1450 } });
    const r = await page.evaluate(LEES);
    expect(r.lopend).toBe(true);
    expect(r.varBudget).toBe(0);
    expect(r.budget).toBe(1450);
    expect(r.kaartTekst).not.toMatch(/nog in je potjes/);
    expect((r.kaartTekst.match(/uitgegeven/g) || []).length).toBe(1);
    console.log(`### geen variabele potjes: ${r.kaartTekst}`);
  });

  test('en dan staat de post ook niet in "Nog deze maand" terug', async ({ page }) => {
    /* De poort van de post was VP.budget>0, dezelfde als die van de kop. Zou de lijst hem bij een
       lege varBudget() teruggeven, dan was de verhuizing voorwaardelijk. */
    await boot(page, { budgets: { huur: 1450 } });
    const r = await page.evaluate(LEES);
    expect(r.posten).not.toContain('Nog uit je potjes');
    expect(r.lijstTekst).not.toMatch(/uit je potjes/);
  });
});

test.describe('j - de bron: een bron per getal en geen extra dure aanroep', () => {
  const blok = sectieVan(SRC, 'function insBudgetBlok(m){');

  test('de kop leest varPotjeStand en de regel eronder totals', () => {
    expect(blok).toContain('varPotjeStand(m)');
    expect(blok).toMatch(/const inPotjes = potjesKop \? VP\.budget-VP\.gebruikt/);
  });

  test('hij roept de tempo-som niet zelf aan, maar leest VP.rest', () => {
    /* v104: VP.rest IS die som, want varPotjeStand() doet die aanroep al. En het is de goedkope
       kant: elke aanroep ervan kost een catSpendMap en een recurringCats. GEMETEN per renderIns()
       op dezelfde fixture: voor v309 17 keer catSpendMap, 89 keer telbareTx en 2 keer de tempo-som;
       na v309 16, 88 en 1. Deze kaart is dus goedkoper dan de post die hij vervangt.
       DE NAAM MET HAAKJE STAAT DAAROM IN GEEN ENKELE COMMENT in dat blok: deze assertie kan een
       comment niet van code onderscheiden (v276). */
    expect(blok).not.toContain('varPlanRemaining' + '(');
    expect(blok).toContain('VP.rest');
  });

  test('en hij roept de twee dure sommen niet zelf aan', () => {
    expect(blok).not.toContain('catSpendMap' + '(');
    expect(blok).not.toContain('telbareTx' + '(');
  });

  test('de dagteller komt uit maandDagenOver en niet uit een eigen deling', () => {
    expect(blok).toContain('maandDagenOver(m)');
    expect(blok).not.toMatch(/d\.dim\s*-\s*d\.elapsed/);
  });

  test('nogDezeMaandPosten draagt de post en zijn twee bronnen niet meer', () => {
    const f = kaalBron(sectieVan(SRC, 'function nogDezeMaandPosten(){'));
    expect(f).not.toContain('varPotjeStand' + '(');
    expect(f).not.toContain('varPlanRemaining' + '(');
    expect(f).not.toContain('Nog uit je potjes');
    expect(f).not.toContain('Bij je tempo');
  });
});
