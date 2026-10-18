/* v440: planCapacity leest sinds v440 de GEKOZEN OPZIJ (SET.salVerdeling) en niet meer de spaarinleg (monthlySavingTarget).
   De plan- en projectie-fixtures zetten hun capaciteit via savingMode 'amount' + savingAmount; vertaal dat naar een gekozen
   opzij van datzelfde bedrag, zodat planCapacity() die capaciteit houdt (zoals de oude terugval op de spaarinleg deed).
   Alleen injecteren als de set nog GEEN salVerdeling heeft: een spec die de terugval (advies/comfortTot) of een eigen opzij
   test zet salVerdeling zelf (ook op null) en wordt met rust gelaten. Eén bron voor elke fixture (budget-fixture open() en de
   losse stand-fixtures), zodat ze niet uiteenlopen. */
function withOpzij(payload) {
  try {
    const s = JSON.parse(payload.minder_set || '{}');
    /* alleen een gekozen opzij injecteren bij een ECHTE capaciteit (savingAmount > 0); een spaarinleg van 0 betekent geen
       capaciteit en laat planCapacity bewust terugvallen op het advies, zoals v440 bedoelt. */
    if (s.savingMode === 'amount' && +s.savingAmount > 0 && !('salVerdeling' in s)) {
      const own = JSON.parse(payload.minder_own || '[]');
      const main = own[0] || Object.keys(s.manualBal || {})[0] || 'NL01MAIN0000001111';
      s.salVerdeling = { rek: { [main]: 1 }, opzij: Math.round(+s.savingAmount || 0) };
      return Object.assign({}, payload, { minder_set: JSON.stringify(s) });
    }
  } catch (_) {}
  return payload;
}
module.exports = { withOpzij };
