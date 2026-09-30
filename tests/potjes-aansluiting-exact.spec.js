/* v271: de aansluiting in blok 6 van het diagnosescherm rekent onafgerond, en is dus EXACT.
 *
 * DE AANLEIDING IS GEMETEN OP HET TOESTEL VAN DE GEBRUIKER: drie van de vijf aansluitingen stonden
 * op NEE en alle drie scheelden precies een euro. Som besteed 1.459 tegen gebruikt 1.460, som
 * restant 791 tegen 790, potjes min besteed 271 tegen 270. Er was niets mis met de app: het blok
 * telde de AFGERONDE bedragen per potje op en legde die som naast een app-getal dat de SOM afrondt.
 * Een blok dat wolf roept is erger dan geen blok, want een volgende ronde zoekt dan een fout die er
 * niet is.
 *
 * GEEN TOLERANTIE. De drie app-functies ronden elk hun eigen som af (`varBudget()`,
 * `varPotjeStand().gebruikt`, `varPlanRemaining()`), en `inPotjes` en `gat` zijn samengesteld uit die
 * AFGERONDE sommen. Het blok doet nu precies dezelfde afrondingen, op dezelfde plek, dus de vijf
 * lijnen zijn exact en niet bij benadering gelijk.
 *
 * DE FIXTURE DRAAGT CENTEN, en dat is de hele voorwaarde om dit te kunnen meten: zonder centen is
 * "som van de afrondingen" gelijk aan "afronding van de som" en toetst de test niets (de meetles van
 * v265/v268/v269). Drie potjes van 200,20 met 100,60, 100,60 en 99,20 besteed. De sommen zijn 600,60
 * en 300,40, dus 601 en 300, terwijl per rij afronden 600 en 301 geeft.
 * DE BEDRAGEN ZIJN OOK ZO GEKOZEN DAT DRIE AFRONDINGEN NIET ÉÉN AFRONDING ZIJN: 601 min 300 is 301,
 * en 600,60 min 300,40 in één keer afgerond is 300. Zonder dat verschil zou een blok dat één keer
 * afrondt er groen doorheen komen, en dat is precies de sabotage die eerst groen bleef.
 * ELK POTJE BLIJFT ONDER ZIJN BUDGET EN LIGT VOOR OP ZIJN TEMPO, dus potjeRest() geeft daar het
 * rekenkundige restant. Geen enkele som ligt in de buurt van een halve euro, dus de test kan niet
 * op een afrondingsgrens gaan wiebelen.
 * v308: DAT "VOOR OP ZIJN TEMPO" IS NIEUW EN DRAGEND. potjeRest() klemt sinds v308 ook de tak met
 * ruimte op het geplande dagtempo maal de resterende dagen, en dan zou een potje dat achterloopt
 * een AFGEROND tempo-bedrag dragen: geen centen in de restant-kolom, en dus geen verschil tussen
 * per rij afronden en de som afronden. Met de bestedingen op 180,60 / 180,60 / 179,20 bindt bij elk
 * potje het restant, en dat is hetzelfde getal bij elke maandlengte.
 * DE DAG STAAT DAARVOOR VAST (vaste-dag.js): op de laatste dag van de maand is het tempo nul en
 * draagt elke rij nul, en dan meet de restant-kolom niets.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const now = new Date();
const CUR = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const { pinDag } = require('./vaste-dag');
const POTJE = 200.20;
const SPEND = { boodschappen: 180.60, uiteten: 180.60, overig: 179.20 };

function seed() {
  const tx = [];
  const add = (id, day, amount, naam, desc) =>
    tx.push({ id, date: CUR + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  add('i1', '05', 6000, 'Werkgever', 'SALARIS LOON');
  add('b1', '06', -SPEND.boodschappen, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('u1', '07', -SPEND.uiteten, 'Restaurant Fictie', 'BEA, BETAALPAS RESTAURANT FICTIE');
  add('o1', '08', -SPEND.overig, 'Etos', 'BEA, BETAALPAS ETOS');
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 6000,
      manualBal: { [MAIN]: 4000 },
      budgets: { boodschappen: POTJE, uiteten: POTJE, overig: POTJE } }),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page) {
  await pinDag(page);                      // v308: voor de goto, anders leest de boot de echte klok
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagPotjes === 'function');
  await page.evaluate(() => { window.REGELS_ = () => diagPotjes().join(String.fromCharCode(10)); });
}

test.describe('0 - de fixture draagt centen, anders meet de test niets', () => {
  test('per rij afronden geeft een ANDER totaal dan de som afronden', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const B = SET.budgets, sp = catSpendMap(curMonth || thisYM());
      const rc = recurringCats();
      const mee = Object.keys(B).filter((k) => (+B[k] || 0) > 0 && !rc.has(k));
      const somBud = mee.reduce((a, k) => a + (+B[k] || 0), 0);
      const somSp = mee.reduce((a, k) => a + (sp[k] || 0), 0);
      return { n: mee.length,
        budPerRij: mee.reduce((a, k) => a + Math.round(+B[k] || 0), 0), budSom: Math.round(somBud),
        spPerRij: mee.reduce((a, k) => a + Math.round(sp[k] || 0), 0), spSom: Math.round(somSp),
        driemaal: Math.round(somBud) - Math.round(somSp), eenmaal: Math.round(somBud - somSp) };
    });
    expect(r.n).toBe(3);
    // zonder dit verschil zou de hele spec groen staan op een eigenschap die hij niet raakt
    expect(r.budPerRij).not.toBe(r.budSom);
    expect(r.spPerRij).not.toBe(r.spSom);
    // en zonder dit verschil zou één afronding over het geheel er ook groen doorheen komen
    expect(r.driemaal).not.toBe(r.eenmaal);
  });
});

test.describe('1 - alle vijf de aansluitingen staan exact op JA', () => {
  test('geen enkele NEE, ook niet met centen in de potjes en in de uitgaven', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    const lijnen = t.split(String.fromCharCode(10)).filter((r) => / = |= gebruikt|= het gat|= nog nodig/.test(r) && /JA|NEE/.test(r));
    expect(lijnen.length).toBe(5);
    for (const r of lijnen) expect(r, r).toContain('JA');
    expect(t).not.toContain('NEE (');
  });

  test('de weergave rondt wel af, en het blok zegt dat erbij', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    expect(t).toContain('de rijen zijn afgerond voor de weergave; de totalen en de aansluiting rekenen onafgerond.');
    // de rij toont hele euro's: 200,20 wordt 200, 180,60 wordt 181 en het restant 19,60 wordt 20
    expect(t).toMatch(/Boodschappen\s+200\s+181\s+20\s/);
  });
});

test.describe('2 - de totalen zijn de afgeronde sommen van de app', () => {
  test('de TOTAAL-rij is precies varBudget, gebruikt en nog nodig', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => window.REGELS_());
    const app = await page.evaluate(() => { const m = curMonth || thisYM();
      return { budget: varBudget(), gebruikt: varPotjeStand(m).gebruikt, rest: varPlanRemaining(m) }; });
    // 3x 200,20 = 600,60 -> 601;  180,60+180,60+179,20 = 540,40 -> 540;  19,60+19,60+21 = 60,20 -> 60
    expect(app).toEqual({ budget: 601, gebruikt: 540, rest: 60 });
    const rij = t.split(String.fromCharCode(10)).find((r) => /^ {2}TOTAAL/.test(r));
    expect(rij).toBeTruthy();
    const n = rij.match(/-?\d+/g).map(Number);
    expect(n.slice(0, 3)).toEqual([app.budget, app.gebruikt, app.rest]);
  });
});
