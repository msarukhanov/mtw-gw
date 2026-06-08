
// НАДЕЖНЫЙ B2B СИДДЕР ДЛЯ FINANCE REPORTS
// async function seedFinancialData() {
//     try {
//         // Даем базе данных NeDB 1 секунду на полную загрузку файла accounting.db с диска
//         await new Promise(resolve => setTimeout(resolve, 1000));
//
//         const check = await accountingDb.find({partnerId: "demo_skin_default"});
//         console.log(`📊 [Accounting Sync] Found ${check.length} existing financial logs in database.`);
//
//         // Если в отчётах пусто — закидываем надежные демо-данные поштучно
//         if (check.length === 0) {
//             // Вставь этот массив внутрь функции seedFinancialData() в state.js вместо старого demoTx
//             // Замени массив demoTx внутри функции seedFinancialData() в state.js
//             const demoTx = [
//                 // 💵 1. Реальные депозиты на платформу (Внешний шлюз Visa/Crypto)
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "DEPOSIT",
//                     amount: 20000,
//                     game: "💳 Crypto Deposit Gate (USDT)",
//                     timestamp: Date.now() - 900000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "DEPOSIT",
//                     amount: 50000,
//                     game: "💳 Fiat Card Gateway (VISA)",
//                     timestamp: Date.now() - 850000
//                 },
//
//                 // Игровой оборот (Bets / Wins)
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "DEBIT",
//                     amount: 1500,
//                     game: "Slots5x3",
//                     timestamp: Date.now() - 500000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "CREDIT",
//                     amount: 2400,
//                     game: "Slots5x3",
//                     timestamp: Date.now() - 480000
//                 },
//
//                 // Бонусное пополнение (Промокод)
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "BONUS_CASH",
//                     amount: 500,
//                     game: "🎁 Promo: WELCOME_BONUS",
//                     timestamp: Date.now() - 470000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "DEBIT",
//                     amount: 5000,
//                     game: "Crash",
//                     timestamp: Date.now() - 400000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "CREDIT",
//                     amount: 18500,
//                     game: "Crash",
//                     timestamp: Date.now() - 340000
//                 },
//
//                 // Начисление кэшбэка
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "BONUS_CASH",
//                     amount: 1200,
//                     game: "💰 Weekly Cashback Drops",
//                     timestamp: Date.now() - 300000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Lucky_Striker",
//                     type: "DEBIT",
//                     amount: 4000,
//                     game: "Sportsbook",
//                     timestamp: Date.now() - 250000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Blogger_John",
//                     type: "AFFILIATE",
//                     amount: 400,
//                     game: "RevShare",
//                     timestamp: Date.now() - 240000
//                 },
//
//                 // 📤 2. Вывод средств игроком (Withdraw)
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "WITHDRAW",
//                     amount: 15000,
//                     game: "📤 Crypto Payout (BTC)",
//                     timestamp: Date.now() - 200000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Alex_777",
//                     type: "DEBIT",
//                     amount: 500,
//                     game: "Mines",
//                     timestamp: Date.now() - 150000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Alex_777",
//                     type: "CREDIT",
//                     amount: 1250,
//                     game: "Mines",
//                     timestamp: Date.now() - 140000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "DEBIT",
//                     amount: 1500,
//                     game: "Slots5x3",
//                     timestamp: Date.now() - 500000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "CREDIT",
//                     amount: 2400,
//                     game: "Slots5x3",
//                     timestamp: Date.now() - 480000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "DEBIT",
//                     amount: 5000,
//                     game: "Crash",
//                     timestamp: Date.now() - 400000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "DEBIT",
//                     amount: 10000,
//                     game: "Crash",
//                     timestamp: Date.now() - 350000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "CREDIT",
//                     amount: 18500,
//                     game: "Crash",
//                     timestamp: Date.now() - 340000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Lucky_Striker",
//                     type: "DEBIT",
//                     amount: 4000,
//                     game: "Sportsbook",
//                     timestamp: Date.now() - 250000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Lucky_Striker",
//                     type: "CREDIT",
//                     amount: 0,
//                     game: "Sportsbook",
//                     timestamp: Date.now() - 240000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Blogger_John",
//                     type: "AFFILIATE",
//                     amount: 400,
//                     game: "RevShare",
//                     timestamp: Date.now() - 240000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Alex_777",
//                     type: "DEBIT",
//                     amount: 500,
//                     game: "Mines",
//                     timestamp: Date.now() - 150000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Alex_777",
//                     type: "CREDIT",
//                     amount: 1250,
//                     game: "Mines",
//                     timestamp: Date.now() - 140000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "HighRoller",
//                     type: "DEBIT",
//                     amount: 20000,
//                     game: "Dice",
//                     timestamp: Date.now() - 80000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "HighRoller",
//                     type: "DEBIT",
//                     amount: 7000,
//                     game: "Hi-Lo",
//                     timestamp: Date.now() - 50000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "DEBIT",
//                     amount: 1500,
//                     game: "Slots5x3",
//                     timestamp: Date.now() - 500000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "CREDIT",
//                     amount: 2400,
//                     game: "Slots5x3",
//                     timestamp: Date.now() - 480000
//                 },
//
//                 // Пополнение счета через промокод (Пойдет в кассовую вкладку Transactions)
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Player_VIP",
//                     type: "BONUS_CASH",
//                     amount: 500,
//                     game: "🎁 Promo: WELCOME_BONUS",
//                     timestamp: Date.now() - 470000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "DEBIT",
//                     amount: 5000,
//                     game: "Crash",
//                     timestamp: Date.now() - 400000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "CREDIT",
//                     amount: 18500,
//                     game: "Crash",
//                     timestamp: Date.now() - 340000
//                 },
//
//                 // Начисление еженедельного кэшбэка (Пойдет в кассовую вкладку Transactions)
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "CryptoWhale",
//                     type: "BONUS_CASH",
//                     amount: 1200,
//                     game: "💰 Weekly Cashback Drops",
//                     timestamp: Date.now() - 300000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Lucky_Striker",
//                     type: "DEBIT",
//                     amount: 4000,
//                     game: "Sportsbook",
//                     timestamp: Date.now() - 250000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Blogger_John",
//                     type: "AFFILIATE",
//                     amount: 400,
//                     game: "RevShare",
//                     timestamp: Date.now() - 240000
//                 },
//
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Alex_777",
//                     type: "DEBIT",
//                     amount: 500,
//                     game: "Mines",
//                     timestamp: Date.now() - 150000
//                 },
//                 {
//                     partnerId: "demo_skin_default",
//                     username: "Alex_777",
//                     type: "CREDIT",
//                     amount: 1250,
//                     game: "Mines",
//                     timestamp: Date.now() - 140000
//                 }
//             ];
//
//
//             // Записываем каждый документ по очереди через цикл, чтобы NeDB железно зафиксировала их
//             for (const tx of demoTx) {
//                 await accountingDb.insert(tx);
//             }
//             console.log("🔥 [Accounting Seed] REAL TIME GGR DEMO VOLUME SEEDED SUCCESSFULLY!");
//         }
//     } catch (err) {
//         console.error("❌ [Accounting Seed Error]:", err.message);
//     }
// }
//
// seedFinancialData();