const { Telegraf, Markup } = require('telegraf');

// Инициализируем бота, передавая токен из BotFather
const bot = new Telegraf(process.env.TG_BOT_TOKEN || 'your_telegram_bot_token_here');

// Обработка команды /start, когда пользователь впервые заходит в бота
bot.start(async (ctx) => {
    const chatInstance = ctx.chat;
    const tgUsername = chatInstance.username || chatInstance.first_name || 'Cyber Player';

    await ctx.reply(
        `👾 Welcome to MTW iGaming Platform, ${tgUsername}!\n\n` +
        `Experience highload B2B White Label slots and sportsbook ecosystem directly inside Telegram nodes. Mapped seamlessly, lightning fast, secured by PostgreSQL structure.`,
        Markup.inlineKeyboard([
            Markup.button.webApp('🎮 Launch Gaming Arena', 'https://mtwtech.onrender.com/platform')
        ])
    );
});

bot.telegram.setWebhook('https://mtw-gw.onrender.com/api/callback/telegram')
    .then(() => console.log('[Telegram Webhook] Success'))
    .catch(err => console.error('[Telegram Webhook] Error:', err.message));

// Мягкое отключение бота при перезагрузке сервера Node.js
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
