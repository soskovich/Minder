// v169: "wat blijft er over deze maand" werd op vier plekken anders berekend. Home rekende het
// variabele deel met potjeRest (je plan), Inzichten met varDue (een extrapolatie van je tempo), en
// coachStatus had er een derde formule voor. Bij een normaal tempo stond er €150 tegen €931, dus
// Home zei "+€1.450 veilig te besteden" terwijl Inzichten "-€931" toonde.
// varPlanRemaining() is nu de enige bron. varDue blijft bestaan als prognose, alleen in de spiegel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
/* v308: DE DAG STAAT VAST. Sectie c eist dat de prognose en het plan uiteenlopen, en op de laatste
   dag van de maand zijn ze allebei nul: `potjeRest()` klemt sinds v308 op de resterende dagen, dus
   dan valt er niets te verschillen. Dezelfde as en dezelfde pin als de zes potjes-tests van v306.
   Sectie a en b worden er ook van: met een vaste dag staat vast welke van de vijf standen de regel
   onder de tegel laat zien. */
const { pinDag } = require('./vaste-dag');

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
  await pinDag(page);                      // v308: voor de goto, anders leest de boot de echte klok
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

/* v250: het grote getal op de potjesregel is de aftrekking (varBudget min gebruikt) geworden; de
   reservering uit varPlanRemaining() staat als eigen regel eronder, en alleen wanneer die twee
   uiteenlopen. Wat deze spec vasthoudt is de BRON en niet de plek, dus lees de reservering waar hij
   staat: uit de regel eronder zodra die er is, en anders uit het grote getal - want zonder gat zijn
   het per definitie dezelfde twee getallen.
   v251: die regel wordt hier op zijn ELEMENT gezocht (.nog-noot) en niet op zijn zin. De eerste
   versie matchte "heb je nog EUR X nodig", en toen de zin korter moest om op 360px op één regel te
   passen viel deze spec om op de formulering terwijl de eigenschap ongemoeid was. */
/* v308: DE TERUGVAL OP HET GROTE GETAL IS VERVALLEN, en dat is niet een zwakkere maar een scherpere
   vorm. Die terugval leunde op "zonder gat zijn het per definitie dezelfde twee getallen", en dat
   gold zolang een potje MET ruimte zijn hele onbestede deel in de tempo-som droeg. Sinds de klem op
   de resterende dagen ligt de tempo-som eronder zodra een potje achterloopt, dus dan STAAT hij niet
   op het scherm en is er niets om aan te binden. De helper geeft daarom null als de regel er niet
   is, en de test bindt de tweezijdige eis: de regel staat er precies dan als er een gat is, en als
   hij er staat draagt hij varPlanRemaining(). */
/* v309: DE REGEL IS HET ACHTERVOEGSEL VAN HET HOOFDGETAL OP DE STAND-KAART GEWORDEN, en hij draagt
   nu EEN bedrag in plaats van twee: het GAT en niet ook de tempo-som. GEMETEN waarom: met beide
   bedragen breekt de kop op 360px naar 46px in plaats van 32px, en dat al bij de kleinste getallen.
   Er gaat niets verloren, want de kop toont het restant en de tempo-som is dat restant PLUS het
   gat; die aansluiting is wat de tests hieronder vasthouden. */
const schermNoot = ({ noot }) => {
  const m = String(noot || '').replace(/\s+/g, ' ').match(/\u20ac([\d.]+)/);
  return m ? +m[1].replace(/\./g, '') : null;
};
// de kop van de stand-kaart: het grote getal en het achtervoegsel, in de pagina zelf
const KOP = `(() => { go('ins'); const k=document.getElementById('insStand');
  const r=k?[...k.querySelectorAll('div.row')].find(x=>/nog in je potjes|te veel uitgegeven/.test(x.textContent)):null;
  const sp=r?[...r.querySelectorAll('span')]:[];
  const vol=sp.length>1?sp[1].innerText.replace(/\\s+/g,' ').trim():'';
  const achter=vol.includes(' \u00b7 ')?vol.slice(vol.indexOf(' \u00b7 ')+3):'';
  const eur=t=>{ const m=String(t).match(/\u20ac([\\d.]+)/); return m?+m[1].replace(/\\./g,''):null; };
  return { val: sp.length?eur(sp[0].innerText):null, label: vol.split(' \u00b7 ')[0],
    noot: /tekort/.test(achter)?achter:'', achter, alles: k?k.innerText:'' }; })()`;

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
          gat: varRest - (varPotjeStand(m).budget - varPotjeStand(m).gebruikt),
          safe: Math.round(safeToSpend().reserved),
          reserve: varPotjesReserve(m),
          inPotjes: varPotjeStand(m).budget - varPotjeStand(m).gebruikt,
          /* wat Inzichten er letterlijk van maakt. v204: het variabele deel stond als voetregel
             onder de tegels en werd een tegel. v250: en stond sindsdien in de regel eronder zodra
             hij van de aftrekking afweek. v309: het is het achtervoegsel van het hoofdgetal op de
             stand-kaart, met het GAT erin. */
          scherm: (function(){ go('ins'); const k=document.getElementById('insStand');
            const rr=k?[...k.querySelectorAll('div.row')].find(x=>/nog in je potjes|te veel uitgegeven/.test(x.textContent)):null;
            const sp=rr?[...rr.querySelectorAll('span')]:[];
            const vol=sp.length>1?sp[1].innerText.replace(/\s+/g,' ').trim():'';
            const achter=vol.includes(' \u00b7 ')?vol.slice(vol.indexOf(' \u00b7 ')+3):'';
            return { noot: /tekort/.test(achter)?achter:'', alles: k?k.innerText:'' }; })(),
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
      /* BEDOELING BIJGESTELD (v254): safeToSpend().reserved las varPlanRemaining() en leest sinds
         die ronde varPotjesReserve(), want veilig te besteden vraagt wat er nog IN je potjes zit en
         niet wat je bij je tempo nog uitgeeft. Die twee lopen alleen uiteen bij een leeg potje, en
         dan precies het bedrag dat zo'n potje aan dagtempo reserveerde. Wat deze test vasthoudt
         blijft: elke plek rekent met dezelfde potjes en dezelfde boekingen, zonder tweede som. */
      expect(r.safe).toBe(r.reserve);
      expect(r.hand).toBe(r.bron);
      const op = schermNoot(r.scherm);
      /* v309: de eis is tweezijdig en heeft er een voorwaarde bij. Het achtervoegsel draagt de
         krapte precies dan als er een gat is EN het restant boven nul staat: bij een negatief
         restant is het gat per constructie positief (het is de tempo-som PLUS de overschrijding)
         en zou het een groter getal over dezelfde overschrijding zetten. Een signaal dat in een
         hele tak altijd vuurt is geen signaal (meetles p). */
      expect(op != null, 'de krapte staat er precies dan als er een gat is en het restant positief')
        .toBe(r.gat > 0 && r.inPotjes > 0);
      /* v309: het achtervoegsel draagt het GAT, en de tempo-som volgt uit het restant erboven.
         Die aansluiting is strenger dan de oude vorm, want ze bindt twee getallen aan elkaar in
         plaats van een getal aan een bron. */
      if (op != null) { expect(op).toBe(r.gat); expect(r.inPotjes + op).toBe(r.bron); }
    });
  }
  /* ZONDER DEZE TEST KAN DE VERGELIJKING HIERBOVEN LEEGLOPEN: staat de regel in geen van de vijf
     standen, dan is de tweezijdige eis overal met een null vervuld en is 'dat is ook het bedrag dat
     Inzichten toont' nooit getoetst. Deze stand is de overschreden variant uit de lijst hierboven,
     nu met de eis dat hij de regel WERKELIJK draagt. */
  test('minstens een van de standen laat de regel zien, en dan met varPlanRemaining erin', async ({ page }) => {
    /* EEN POTJE EROVERHEEN EN HET TOTAAL NOG POSITIEF: boodschappen 600 van 500 en uiteten 0 van
       200 geeft een restant van 100 en een tempo-som erboven. `boodschappen: 900` stond hier en
       geeft een NEGATIEF restant, en dan draagt het achtervoegsel per constructie niets (zie de
       voorwaarde hierboven), dus die stand kon deze test niet meer dragen. */
    await boot(page, seed({ boodschappen: 600, uiteten: 0 }));
    const k = await page.evaluate(KOP);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const VP = varPotjeStand(m);
      return { bron: varPlanRemaining(m), gat: varPlanRemaining(m) - (VP.budget - VP.gebruikt),
        inPotjes: VP.budget - VP.gebruikt };
    });
    expect(r.gat).toBeGreaterThan(0);
    expect(r.inPotjes).toBeGreaterThan(0);      // de invoer: anders draagt de kop niets
    expect(schermNoot(k)).toBe(r.gat);
    expect(k.val + r.gat).toBe(r.bron);      // en de tempo-som volgt uit het restant erboven
  });
});

/* v192: hier stond de identiteit safe === eigenKracht + spendSaldo - saveReserved, die Home aan
   het chipgetal op Inzichten bond. Dat getal is vervallen: het telde een waarneming op bij een
   planrest en werd daardoor beter naarmate je meer uitgaf. De brug via dat getal was het middel;
   wat bewaakt moest worden is dat het variabele deel op beide schermen uit varPlanRemaining()
   komt. Dat is wat hieronder staat.

   Deze vorm is bewust zwakker, en het is goed dat dat opvalt. De oude test bond het hele bedrag
   van Home aan een bedrag dat op Inzichten te lezen was, dus een tweede definitie ergens in
   safeToSpend() liet hem vallen. Deze bindt alleen nog de gedeelde term. Een afwijking in het
   saldo-deel of in de spaarreservering valt hier dus niet meer uit; die worden elders gedekt
   (blok a hierboven en de opbouw-sheet). Er is geen sterkere vorm meer beschikbaar zonder een
   getal terug te zetten dat de twee optelt, en juist dat getal was de fout. */
test.describe('b · het variabele deel komt op beide schermen uit dezelfde bron', () => {
  for (const [naam, opt] of SITUATIES) {
    test(`${naam}: Home en Inzichten lezen één varPlanRemaining`, async ({ page }) => {
      await boot(page, seed(opt));
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const d = document.createElement('div'); d.innerHTML = nogDezeMaandBody();
        const t = d.innerText.replace(/\s+/g, ' ');
        return { bron: varPlanRemaining(m), home: Math.round(safeToSpend().reserved),
          reserve: varPotjesReserve(m), gat: varPlanRemaining(m) - (varPotjeStand(m).budget - varPotjeStand(m).gebruikt),
          inzichten: { noot: (d.querySelector('.nog-noot') || {}).innerText || '', alles: d.innerText },
          tekst: t,
          srcSafe: safeToSpend.toString(), srcBody: nogDezeMaandPosten.toString() };
      });
      expect(r.home).toBe(r.reserve);   // v254: Home leest de reservering, Inzichten de tempo-som
      const op = schermNoot(r.inzichten);
      if (op != null) expect(op).toBe(r.bron);     // v308: zie de helper; geen regel, geen bedrag
      expect(r.srcSafe).toContain('varPlanRemaining(');
      expect(r.srcBody).toContain('varPlanRemaining(');
      // en er staat geen getal meer dat die planrest bij een waarneming optelt
      expect(r.tekst).not.toMatch(/eigen kracht/i);
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
      ndm: nogDezeMaandPosten.toString(),
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
      const VP = varPotjeStand(m);
      return { txt: d.innerText.replace(/\s+/g, ' '), html: d.innerHTML,
        fix: Math.round(monthLiquidity().fixDue), plan: varPlanRemaining(m),
        inPotjes: VP.budget - VP.gebruikt };
    });
    expect(r.txt).toContain('Nog te betalen · vast');
    expect(r.txt).not.toMatch(/\(tempo\)/);
    /* v308: hier stond r.plan, en het grote getal op die tegel is sinds v250 de AFTREKKING
       (varBudget min gebruikt) en niet de tempo-som. Die twee waren op deze fixture hetzelfde
       getal zolang een potje met ruimte zijn hele onbestede deel in de tempo-som droeg; met de klem
       op de resterende dagen lopen ze uiteen (gemeten 147 tegen 150). Wat deze test vasthoudt is
       dat de waarneming boven staat en het plan eronder, en het bedrag van die tegel is de
       aftrekking. */
    expect(r.inPotjes).toBeGreaterThan(0);
    /* v309: de post is naar het hoofdgetal van de stand-kaart verhuisd, dus de waarneming staat nu
       BOVEN het plan in plaats van eronder. Wat vastligt is hetzelfde: het bedrag van die plek is de
       aftrekking (varBudget min gebruikt) en niet de tempo-som, en het is nergens bij de
       waargenomen vaste lasten opgeteld. */
    const kop = await page.evaluate(KOP);
    expect(kop.val).toBe(r.inPotjes);
    expect(kop.label).toBe('nog in je potjes');
    expect(r.txt.replace(/\s+/g, ' ').toLowerCase()).not.toContain('nog uit je potjes');
    // en dat bedrag is nergens opgeteld bij de waargenomen vaste lasten
    if (r.fix > 0) expect(r.txt).not.toContain(`€${(r.fix + r.inPotjes).toLocaleString('nl-NL')}`);
  });

  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { nogDezeMaandBody(); safeToSpend(); varPlanRemaining(curMonth); });
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});
