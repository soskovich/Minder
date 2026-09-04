// v162: meldingen worden gesorteerd op houdbaarheid, niet op of ze om actie vragen. De vraag is
// wat er gebeurt als je iets een week negeert. Vier horizonnen, aan de bron gezet, en elk signaal
// verschijnt op precies één plek.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MS = [5, 4, 3, 2, 1].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

// maanden waarin structureel meer werd uitgegeven dan er binnenkwam: voedt overstreak en inflatie
function seed(o = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '',
      src: 'csv', accName: '', refNums: [] });
  MS.concat([CUR]).forEach((m, i) => {
    add('i' + m, MAIN, m, '25', 3000 + i * 60, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -(900 + i * 90), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('e' + m, MAIN, m, '11', -(400 + i * 60), 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    add('s' + m, SPAAR, m, '26', 40, 'Spaarpot', 'NAAR SPAREN');
  });
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 1500, [SPAAR]: 400 },
    budgets: { boodschappen: 500, huur: 900 },
    savingMode: 'amount', savingAmount: 300, savingsAcc: { [SPAAR]: true },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof scoreNotifs === 'function' && typeof maandStructureel === 'function');
}
const alle = (page) => page.evaluate(() => scoreNotifs().map((n) => ({ key: n.key, h: n.h, t: n.t })));
const lijst = (page) => page.evaluate(() => notifList().map((n) => ({ key: n.key, h: n.h })));
const structureel = (page) => page.evaluate(() => maandStructureel().map((r) => ({ key: r.key, status: r.status })));

test.describe('a · de classificatie zit aan de bron', () => {
  test('elk signaal draagt een horizon uit de vier', async ({ page }) => {
    await boot(page);
    const a = await alle(page);
    expect(a.length).toBeGreaterThan(0);
    for (const n of a) expect(['direct', 'correctie', 'structureel', 'geen']).toContain(n.h);
  });

  test('de horizon wordt nergens opnieuw afgeleid', async ({ page }) => {
    await boot(page);
    // notifList en maandStructureel lezen n.h, ze classificeren niet zelf
    const nl = await page.evaluate(() => notifList.toString());
    const ms = await page.evaluate(() => maandStructureel.toString());
    expect(nl).toContain('.h');
    expect(ms).toContain("n.h==='structureel'");
    for (const src of [nl, ms]) {
      expect(src).not.toMatch(/overstreak|inflatie|meevaller|lowbal/);   // geen tweede indeling
    }
  });
});

test.describe('b · elk signaal op precies één plek', () => {
  test('de lijst toont alleen direct en correctie', async ({ page }) => {
    await boot(page);
    const l = await lijst(page);
    for (const n of l) expect(['direct', 'correctie']).toContain(n.h);
  });

  test('structureel staat op het maandscherm en niet in de lijst', async ({ page }) => {
    await boot(page);
    const str = await structureel(page);
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    const l = await lijst(page);
    for (const r of str) expect(l.some((n) => n.key === r.key)).toBe(false);
  });

  test('geen enkel signaal staat op beide plekken', async ({ page }) => {
    await boot(page);
    const l = await lijst(page), str = await structureel(page);
    const overlap = l.filter((n) => str.some((r) => r.key === n.key));
    expect(overlap).toEqual([]);
  });

  test('constateringen verschijnen nergens als melding', async ({ page }) => {
    await boot(page);
    const a = await alle(page), l = await lijst(page);
    const geen = a.filter((n) => n.h === 'geen');
    for (const n of geen) expect(l.some((x) => x.key === n.key)).toBe(false);
  });
});

test.describe('c · structureel op het maandscherm', () => {
  test('het krijgt de status uit de drempelconstante en telt mee voor het oordeel', async ({ page }) => {
    await boot(page);
    const str = await structureel(page);
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    expect(await page.evaluate(() => MAAND_DREMPEL.structureelStatus)).toBe('tekort');
    for (const r of str) expect(r.status).toBe('tekort');
    const r = await page.evaluate(() => {
      const R = maandRegels(), S = maandStructureel();
      return { zonder: maandOordeel(R).zin, met: maandOordeel(R.concat(S)).zin };
    });
    expect(r.met).not.toBe(r.zonder);            // het telt mee in de beslisboom
  });

  test('het loopt mee als gewone regel, niet als tweede blok', async ({ page }) => {
    await boot(page);
    const str = await structureel(page);
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    await page.evaluate(() => { delete SET.maandGelezen; renderMaand(); });
    const kaarten = await page.evaluate(() => [...document.querySelectorAll('#s-maand .card .hlabel')].map((e) => e.textContent));
    expect(kaarten.filter((k) => /vraagt een beslissing/i.test(k)).length).toBe(1);
    expect(kaarten.some((k) => /signaal|patroon|melding/i.test(k))).toBe(false);
  });

  /* v175: dit legde vast dat de coach-ingang R kreeg en dus de structurele signalen miste. Daardoor
     wees de ingang onderaan naar een andere regel dan de oordeelzin bovenaan noemde. Beide lezen nu
     RO, en coMaandRegel() kent de structurele sleutels, zodat het gesprek niet meteen sluit. */
  test('de coach-ingang en het oordeel lezen dezelfde lijst', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderMaand.toString());
    expect(src).toContain('maandCoachIngang(RO)');
    expect(src).toContain('maandVerband(RO)');
    expect(src).toContain('maandOordeel(RO)');
  });
});

test.describe('d · ritme in plaats van snooze', () => {
  test('een lopende snooze verbergt een structureel signaal niet op het maandscherm', async ({ page }) => {
    await boot(page);
    const str = await structureel(page);
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    const grp = str[0].key.split('-')[0];
    await page.evaluate((g) => { SET.notifSnooze = { [g]: Date.now() + 7 * 86400000 }; save(); }, grp);
    const na = await structureel(page);
    expect(na.some((r) => r.key === str[0].key)).toBe(true);       // nog steeds zichtbaar
    const l = await lijst(page);
    expect(l.some((n) => n.key === str[0].key)).toBe(false);       // en niet in de lijst
  });

  test('Niet meer tonen blijft wel gelden, ook op het maandscherm', async ({ page }) => {
    await boot(page);
    const str = await structureel(page);
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    const grp = str[0].key.split('-')[0];
    await page.evaluate((g) => { SET.notifMuted = { [g]: true }; save(); }, grp);
    expect((await structureel(page)).some((r) => r.key === str[0].key)).toBe(false);
  });

  /* v168: hier stond dat een structureel signaal verdween zodra je het maandscherm had gelezen.
     Dat maakte het scherm onbetrouwbaar: go('maand') zette die vlag zelf, dus de tweede keer
     openen gaf binnen dezelfde dag een ander oordeel. De gelezen-vlag stuurt geen inhoud meer aan;
     een signaal verdwijnt alleen als de situatie is opgelost of als je het wegzet. */
  test('het lezen van het maandscherm verandert niets aan wat er staat', async ({ page }) => {
    await boot(page);
    const str = await structureel(page);
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    await page.evaluate(() => { SET.maandGelezen = new Date().toISOString().slice(0, 10); save(); });
    expect(await structureel(page)).toEqual(str);
    expect(await page.evaluate(() => maandStructureel.toString())).not.toContain('SET.maandGelezen');
  });

  test('twee keer openen op dezelfde dag geeft hetzelfde oordeel', async ({ page }) => {
    await boot(page);
    const lees = async () => {
      await page.evaluate(() => go('maand'));
      await page.waitForTimeout(110);
      return page.evaluate(() => $('#s-maand').innerText.replace(/Gelezen op [^.]*\./, '').replace(/\s+/g, ' ').trim());
    };
    const een = await lees();
    await page.evaluate(() => go('ins'));
    const twee = await lees();
    expect(twee).toBe(een);
  });
});

test.describe('e · de lege lijst', () => {
  test('een rustige regel, zonder uitleg of verwijzing', async ({ page }) => {
    // ruim saldo, want lowbal en accshort zijn kritiek en negeren demping met opzet
    await boot(page, seed({ set: { manualBal: { [MAIN]: 50000, [SPAAR]: 20000 } } }));
    await page.evaluate(() => {
      const m = {}; for (const n of scoreNotifs()) m[String(n.key).split('-')[0]] = true;
      SET.notifMuted = m; save();
    });
    expect(await page.evaluate(() => notifList().map((n) => n.key))).toEqual([]);
    await page.evaluate(() => openNotifs());
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Niets wat deze week aandacht vraagt');
    expect(t).not.toMatch(/maandscherm/i);
  });
});
