const { test } = require('@playwright/test');
const F = require('../budget-fixture.js');

test('diag', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await F.open(page);
  const d = await page.evaluate(() => ({
    tx: TX.map(t => t.id + '|' + t.date + '|' + t.amount + '|' + catOf(t) + '|' + (isIncasso(t) ? 'inc' : '') + (isPeriodicTransfer(t) ? 'per' : '')),
    sched: recurringSchedule().map(s => ({ key: s.key, cat: s.cat, type: s.type, inc: s.incasso, per: s.periodic, n: s.count, amt: s.amount })),
    recurCats: [...recurringCats()],
    months: months(),
    budgets: SET.budgets, next: SET.budgetsNext, bm: SET.budgetMonth,
    eff: effectiveBudgets(months()[months().length - 1]),
    L: (() => { const L = monthLiquidity(); return { fixDue: L.fixDue, varDue: L.varDue, varPlan: L.varPlan, incDue: L.incDue, sum: L.sum, projected: L.projected }; })(),
    S: safeToSpend(),
  }));
  console.log(JSON.stringify(d, null, 1));
  const kpi = await page.evaluate(() => { try { return renderLiquidityKPI().slice(0, 200); } catch (e) { return 'ERR ' + e.message; } });
  console.log('KPI:', kpi);
  await page.evaluate(() => go('set'));
  console.log('--- SET ---\n' + (await page.locator('#s-set').innerText()).slice(0, 1500));
  const sheet = await page.evaluate(() => { try { openSafeToSpend(); return document.getElementById('sheet').innerText.slice(0, 800); } catch (e) { return 'ERR ' + e.message; } });
  console.log('--- SHEET ---\n' + sheet);
});
