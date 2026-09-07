// v202: vijf losse punten die onderweg zijn genoteerd. Ze horen niet bij elkaar.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';

// oplopende uitgaven over acht maanden: dat levert het structurele signaal 'overstreak' op,
// zonder dat er ook maar iets is ingesteld. Precies de stand waarin de terugval vroeger vuurde.
function seed(set = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: ACC, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (let i = 7; i >= 0; i--) {
    const m = M(i);
    add('i' + i, m, '25', 3000, 'Werkgever');
    add('h' + i, m, '02', -1200, 'Huur Woningstichting');
    add('a' + i, m, '06', -600 - i * 20, 'Albert Heijn');
    add('r' + i, m, '11', -300, 'Restaurant De Kroeg');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [ACC]: 4000 },
    }, set)),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof maandOordeel === 'function');
}

const maand = (page) => page.evaluate(() => { renderMaand(); return $('#s-maand').innerText.replace(/\s+/g, ' '); });

test.describe('a · de terugval op Maand vuurt alleen bij werkelijke leegte', () => {
  test('alleen structurele signalen, uit echte data: geen claim van leegte', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      regels: maandRegels().map((x) => x.key), str: maandStructureel().map((x) => x.key),
    }));
    // niets ingesteld, dus geen enkele gewone regel; wel een signaal uit je patroon
    expect(r.regels).toEqual([]);
    expect(r.str.length).toBeGreaterThan(0);

    const t = await maand(page);
    expect(t).not.toContain('Er is nog te weinig ingesteld');
    expect(t).toMatch(/beslissing vraagt|aandacht/);          // het oordeel telt wat er staat
    expect(t).toMatch(/Je geeft al maanden te veel uit/);     // en het signaal staat er zelf ook
  });

  test('noch regels noch signalen: dan zegt het scherm dat wel', async ({ page }) => {
    // coachOff haalt de structurele signalen weg, en er is niets ingesteld: dan is er werkelijk niets
    await boot(page, seed({ coachOff: true }));
    const r = await page.evaluate(() => ({ regels: maandRegels().length, str: maandStructureel().length }));
    expect(r.regels).toBe(0);
    expect(r.str).toBe(0);
    expect(await maand(page)).toContain('Er is nog te weinig ingesteld');
  });

  test('de guard leest allebei de bronnen, en leest ze vóór hij beslist', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderMaand.toString());
    expect(src).toContain('!R.length && !STR.length');
    // maandStructureel() moet vóór de guard staan, anders is STR er nog niet
    expect(src.indexOf('maandStructureel()')).toBeLessThan(src.indexOf('!R.length && !STR.length'));
  });
});

test.describe('b · een opsomming van onbekende regels plakt niet met een komma', () => {
  const rij = (naam, status) => ({ key: naam, naam, status, waarde: '', eenheid: '', gevolg: '' });

  test('twee ontbrekende regels krijgen "en", niet een komma', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mk = (n) => ({ key: n, naam: n, status: 'onbekend', waarde: '', eenheid: '', gevolg: '' });
      return maandOordeel([mk('Buffer in maanden'), mk('Aankoopdoel')]);
    });
    expect(r.sub).toBe('Onbekend: buffer in maanden en aankoopdoel.');
  });

  test('drie ontbrekende regels: komma’s tussendoor, "en" voor het laatste', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mk = (n) => ({ key: n, naam: n, status: 'onbekend', waarde: '', eenheid: '', gevolg: '' });
      return maandOordeel([mk('Buffer'), mk('Doel'), mk('Dekking')]);
    });
    expect(r.zin).toBe('Er ontbreekt te veel om een oordeel te geven.');
    expect(r.sub).toBe('Onbekend: buffer, doel en dekking.');
  });

  test('één ontbrekende regel houdt zijn enkelvoud', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => maandOordeel([
      { key: 'b', naam: 'Buffer', status: 'onbekend', waarde: '', eenheid: '', gevolg: '' }]));
    expect(r.sub).toBe('Onbekend: buffer.');
  });

  test('beide takken lopen via opsomming(), geen eigen join meer', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => maandOordeel.toString());
    expect(src).not.toMatch(/onb\.map\([^)]*\)\.join/);
    expect((src.match(/opsomming\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

test.describe('c · de coachschakelaar zegt wat hij doet', () => {
  /* SET.coachOff wordt op precies een functionele plek gelezen: de guard in scoreNotifs(). Hij zet
     vijf signalen uit en verder niets; het gesprek blijft in beide standen bereikbaar. De tekst is
     daarom aangepast aan het gedrag, niet andersom (v181). */
  const paneel = (page) => page.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = setCoach();
    return d.innerText.replace(/\s+/g, ' ');
  });

  test('de schakelaar heet naar de signalen en noemt waar ze staan', async ({ page }) => {
    await boot(page);
    const t = await paneel(page);
    expect(t).toContain('Signalen uit je patronen');
    expect(t).toMatch(/in je meldingen en op Maand/);
    expect(t).toMatch(/gesprek blijft bereikbaar vanaf Maand, Inzichten en Plan/);
    // de twee onware beweringen zijn weg
    expect(t).not.toMatch(/Actieplan/);
    expect(t).not.toMatch(/Coach-tips op je Home/);
  });

  test('de sectieregel spreekt over signalen, niet over de coach als geheel', async ({ page }) => {
    for (const off of [false, true]) {
      await boot(page, seed({ coachOff: off }));
      const r = await page.evaluate(() => { renderSet(); return $('#s-set').innerText.replace(/\s+/g, ' '); });
      expect(r).toContain('Signalen uit je patronen staan ' + (off ? 'uit' : 'aan'));
      expect(r).not.toMatch(/Je coach staat (aan|uit)/);
    }
  });

  test('uit betekent: de signalen weg, het gesprek blijft', async ({ page }) => {
    await boot(page);
    const aan = await page.evaluate(() => ({
      notif: scoreNotifs().map((n) => n.key), str: maandStructureel().map((n) => n.key),
    }));
    await boot(page, seed({ coachOff: true }));
    const uit = await page.evaluate(() => ({
      notif: scoreNotifs().map((n) => n.key), str: maandStructureel().map((n) => n.key),
    }));
    // de coachsignalen vallen weg, de rest niet
    expect(aan.str.length).toBeGreaterThan(0);
    expect(uit.str).toEqual([]);
    expect(uit.notif.length).toBeLessThan(aan.notif.length);
    for (const k of uit.notif) expect(aan.notif).toContain(k);

    // en het gesprek start nog steeds: dat is precies wat het label nu niet meer belooft
    const g = await page.evaluate(async () => {
      coStart('algemeen', curMonth);
      await new Promise((r) => setTimeout(r, 900));
      return { live: !!window._coLive, tekst: ($('#sheet').innerText || '').trim().length };
    });
    expect(g.live).toBe(true);
    expect(g.tekst).toBeGreaterThan(0);
  });
});

test.describe('d · onregelmatig inkomen heeft een invoerkanaal', () => {
  const POST = { id: 'ir1', naam: 'Vakantiegeld', ym: '2027-05', amount: 2400 };

  test('zonder posten staat er een lege staat, geen nul', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => irrRijen());
    expect(h).toMatch(/Nog geen posten/);
    expect(h).not.toMatch(/0,00/);
  });

  test('een post staat in het paneel met omschrijving, maand en bedrag', async ({ page }) => {
    await boot(page, seed({ irregularIncome: [POST] }));
    const t = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = setIncome();
      return d.innerText.replace(/\s+/g, ' ');
    });
    expect(t).toContain('Vakantiegeld');
    expect(t).toContain('mei 2027');
    expect(t).toMatch(/2\.400/);
    expect(t).toContain('Post toevoegen');
  });

  test('opslaan schrijft de vorm die financeModel() leest', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      openIrregular('');
      document.getElementById('irNaam').value = 'Dertiende maand';
      document.getElementById('irMaand').value = '2027-12';
      document.getElementById('irBedrag').value = '1800';
      saveIrregular('');
    });
    const r = await page.evaluate(() => ({
      lijst: SET.irregularIncome, geldig: irrGeldig().length,
      // financeModel() filtert op x.ym && +x.amount en telt per maand op
      assum: financeModel().assumptions.irregularIncome,
    }));
    expect(r.lijst.length).toBe(1);
    expect(r.lijst[0].ym).toBe('2027-12');
    expect(r.lijst[0].amount).toBe(1800);
    expect(r.lijst[0].naam).toBe('Dertiende maand');
    expect(r.geldig).toBe(1);
    expect(r.assum.length).toBe(1);
  });

  test('een onvolledige post wordt niet opgeslagen', async ({ page }) => {
    await boot(page);
    for (const v of [['', '2027-05', '100'], ['X', '', '100'], ['X', '2027-05', '']]) {
      await page.evaluate((w) => {
        openIrregular('');
        document.getElementById('irNaam').value = w[0];
        document.getElementById('irMaand').value = w[1];
        document.getElementById('irBedrag').value = w[2];
        saveIrregular('');
      }, v);
      expect(await page.evaluate(() => irrLijst().length)).toBe(0);
    }
  });

  test('bewerken en verwijderen lopen via dezelfde sheet', async ({ page }) => {
    await boot(page, seed({ irregularIncome: [POST] }));
    await page.evaluate(() => {
      openIrregular('ir1');
      document.getElementById('irBedrag').value = '2600';
      saveIrregular('ir1');
    });
    expect(await page.evaluate(() => SET.irregularIncome[0].amount)).toBe(2600);
    expect(await page.evaluate(() => SET.irregularIncome.length)).toBe(1);   // bewerkt, niet toegevoegd
    await page.evaluate(() => deleteIrregular('ir1'));
    expect(await page.evaluate(() => irrLijst().length)).toBe(0);
  });

  test('de post landt in de maand die je koos, en nergens anders', async ({ page }) => {
    /* financeModel() modelleert jan t/m dec van het LOPENDE jaar, en alleen een maand na de
       huidige is een projectie: een verstreken maand leest zijn inkomen uit totals(). De post moet
       dus in een resterende maand van dit jaar vallen. */
    const idx = now.getMonth() + 1;
    test.skip(idx > 11, 'in december is er geen projectiemaand meer dit jaar');
    const doelYm = ym(new Date(now.getFullYear(), idx, 1));
    await boot(page, seed({ irregularIncome: [{ id: 'i', naam: 'Vakantiegeld', ym: doelYm, amount: 2400 }] }));
    const r = await page.evaluate((k) => {
      const F = financeModel();
      const proj = (F.months || []).filter((x) => x.kind === 'projection');
      const hier = proj.filter((x) => x.ym === k).map((x) => x.income);
      const rest = proj.filter((x) => x.ym !== k).map((x) => x.income);
      return { hier, rest, basis: F.assumptions.baseIncome };
    }, doelYm);
    expect(r.hier.length).toBe(1);
    expect(r.hier[0]).toBe(r.basis + 2400);
    // elke andere projectiemaand houdt het gewone maandinkomen
    for (const v of r.rest) expect(v).toBe(r.basis);
  });
});

test.describe('e · de spaarrente heeft een invoerveld', () => {
  test('het veld staat bij Budget & doelen, met wat het doet', async ({ page }) => {
    await boot(page, seed({ budgetAdv: true }));
    const t = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = setBudget();
      return d.innerText.replace(/\s+/g, ' ');
    });
    expect(t).toContain('Rente op je spaargeld');
    expect(t).toMatch(/schuld duur genoeg is om voor te gaan op sparen/);
    expect(t).toMatch(/rekent hij met 0%/);
  });

  test('leeg blijft leeg: er wordt geen rente verzonnen', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => SET.spaarRente == null || SET.spaarRente === '')).toBe(true);
  });

  test('het invoerveld schrijft SET.spaarRente en klemt op nul', async ({ page }) => {
    await boot(page, seed({ budgetAdv: true }));
    const h = await page.evaluate(() => setBudget());
    expect(h).toMatch(/SET\.spaarRente=this\.value===''\?'':Math\.max\(0,\+this\.value\|\|0\)/);
    // en het veld wordt teruggelezen, dus wat je invulde staat er weer
    const val = await page.evaluate(() => {
      SET.spaarRente = 3.5; save();
      const d = document.createElement('div'); d.innerHTML = setBudget();
      const i = [...d.querySelectorAll('input')].find((x) => /spaarRente/.test(x.getAttribute('oninput') || ''));
      return i ? i.value : null;
    });
    expect(val).toBe('3.5');
  });

  test('een schuld net boven en net onder de drempel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const D = [{ id: 'd1', naam: 'Creditcard', rest: 4000, start: 5000, per: 100 }];
      const meet = (rente, spaar) => {
        SET.debts = D.map((d) => Object.assign({}, d, { rente }));
        SET.spaarRente = spaar; save();
        return !!coachDureSchuld();
      };
      return {
        drempel: MECHANISM_SPEC.mentalAccounting.condities.minRenteVerschil,
        zonderRente: { boven: meet(6, ''), onder: meet(4, '') },
        metDrie: { boven: meet(8.5, 3), onder: meet(7.5, 3) },
      };
    });
    expect(r.drempel).toBe(0.05);
    // zonder invoer telt het potje als nulrente, dus de volle schuldrente is het verschil
    expect(r.zonderRente.boven).toBe(true);
    expect(r.zonderRente.onder).toBe(false);
    // met 3% schuift de grens mee omhoog: het is weer een echt verschil
    expect(r.metDrie.boven).toBe(true);
    expect(r.metDrie.onder).toBe(false);
  });

  test('dezelfde schuld kan omslaan door alleen de rente in te vullen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      SET.debts = [{ id: 'd1', naam: 'Creditcard', rest: 4000, start: 5000, rente: 7, per: 100 }];
      SET.spaarRente = ''; save();
      const zonder = !!coachDureSchuld();
      SET.spaarRente = 3; save();
      return { zonder, met: !!coachDureSchuld() };
    });
    expect(r.zonder).toBe(true);   // 7pp verschil
    expect(r.met).toBe(false);     // nog 4pp, onder de drempel van 5
  });
});

test.describe('f · layout', () => {
  for (const w of [360, 390]) {
    test(`de nieuwe velden passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page, seed({ budgetAdv: true,
        irregularIncome: [{ id: 'ir1', naam: 'Vakantiegeld van mijn werkgever', ym: '2027-05', amount: 2400 }] }));
      await page.evaluate(() => { go('set'); openInkomenSheet(); });
      const a = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return { over: s.scrollWidth - s.clientWidth, tekst: s.innerText.includes('Vakantiegeld') };
      });
      expect(a.over).toBeLessThanOrEqual(1);
      expect(a.tekst).toBe(true);

      await page.evaluate(() => { openIrregular('ir1'); });
      const b = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return s.scrollWidth - s.clientWidth;
      });
      expect(b).toBeLessThanOrEqual(1);

      await page.evaluate(() => { openBudgetEditor(); });
      const c = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return { over: s.scrollWidth - s.clientWidth, rente: s.innerText.includes('Rente op je spaargeld') };
      });
      expect(c.over).toBeLessThanOrEqual(1);
      expect(c.rente).toBe(true);
    });
  }
});
