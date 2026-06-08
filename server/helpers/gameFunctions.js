const state = require('../state');
const seamless = require('../services/seamlessService');

async function makeCasinoBet(partnerId, username, sessionId, amount, game) {
    const roundId = `c_bet_${Date.now()}_${game}`;
    const debit = await seamless.debit(username, partnerId, sessionId, amount, game + "_round", roundId);

    if(debit.error) return debit;

    return debit;
}

module.exports = {
    makeCasinoBet
};