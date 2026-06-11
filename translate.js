const fs = require('fs');
const path = require('path');

// 1. Объект переводов (добавьте сюда строки с {{плейсхолдерами}})
const en = {
    "header": {
        "links": {
            "home": "Home",
            "games": "Games",
            "sport": "Sportsbook",
            "profile": "Profile"
        },
        "buttons": {
            "sign_in": "Sign In",
            "sign_up": "Sign Up",
        },
        "balance": {
            "wallet": "Wallet",
            "header": "Bonus",
        },
    },

    "auth": {
        "windows": {
            "acc_sign_in": "Account Sign In",
            "username": "Username",
            "password": "Password",
            "sign_in": "Sign In (demo)",
            "ref_code": "Referral Code (Optional)",
            "create": "Create Account (demo)",
        },
        "messages": {
            "username_invalid": "Please enter a valid username",
            "username_required": "Username field is required",
            "login_fail":  "Authentication failed",
            "signup_fail":  "Username field is required",
            "signup_suc": "Account successfully created! Please sign in using your username.",

        },
    },

    "player": {
        "info": {
            "player_dashboard": "Player Dashboard",
            "profile": "Profile",
            "cashier": "Cashier",
            "history": "History",
            "level": "LEVEL",
            "badges_trofies": "Unlocked Badges & Trophies",
            "upd_pass": "Update Password",
            "upd_sec": "Update Security",

            "short_password": "Password must be at least 6 characters long.",
            "pass_changed": "Security configuration password updated successfully.",
            "pass_err": "'Failed to update credentials.'"
        },
        "achievements": {
            "first_step": "First Step",
            "completed": "Completed",
            "iron_turnover": "Iron Turnover",
            "multiplier_catcher": "Multiplier Catcher",
            "highroller_strike": "Highroller Strike",
        },
        "balance": {
            "username": "Account Username",
            "balance": "Available Balance",
            "bonus": "Available Bonus",
        },
        "guild": {
            "guild_syndicate": "Guild Syndicate",
            "guild": "Guild",
            "level": "Lvl ",
            "objective": "Active Syndicate Objective",
            "pool_reward": "Pool Reward",
            "split": "🪙 (Split equally)",
            "not_member": "You are not a member of any tactical gaming syndicate. Join an existing guild or establish your own corporation.",
            "create": "Create Clan",
            "or": "— OR —",
            "join": "Join Selected Guild Syndicate",
            "no_active": "No active clans",

            "create_name_invalid": "Please input your new guild name.",
            "create_success": "successfully incorporated!",
            "create_fail": 'successfully incorporated!',

            "join_select_invalid": "Select an active guild node to perform join synchronization.",
            "join_success": "Guild data synchronized. Welcome to the syndicate!"
        },
        "affiliate": {
            "program": "Affiliate Program",
            "text": "Earn 10% RevShare rewards instantly from all invited players' activities!",
            "copy_link": "Copy Referral Link",
            "copied": "Referral affiliate link copied to clipboard successfully!",
        },
        "promo": {
            "settings": "Settings & Vouchers",
            "text": "Promo Code Voucher",
            "code": "Activate Code",
            "invalid": "Please input an active promotional code",
            "success": "Promo activation approved! Loaded",
            "fail": "Invalid or expired promo code."
        },
        "payments": {
            "deposit_text": "Secure Instant Deposit",
            "deposit_amount": "Amount to Deposit",
            "deposit_method": "Select Payment Method",
            "deposit_proceed": "Proceed to Payment",
            "deposit_invalid_amount": "Please enter a valid deposit amount.",
            "deposit_redirecting": "Redirecting secure frame node to official merchant billing gateway...",
            "deposit_reject": "Payment service provider is offline. Try again later.",

            "withdraw_text": "📤 Fast Funds Withdrawal",
            "withdraw_amount": "Amount to Withdraw",
            "withdraw_method": "Payout Method",
            "withdraw_adress": "Your Wallet Address / Card Number / PIX Key",
            "withdraw_proceed": "Request Cashout",
            "withdraw_invalid": "Please enter amount and your payout wallet/card details.",

        },
        "history": {
            "activity": "Recent Platform Activity",
            "bets": "Bets",
            "balance": "Balance / Bonus",
            "close": "Close Secure Session",
        },
    },

    "footer": {
        "links": {
            "api": "API\n                Reference",
            "seamless": "Seamless Protocol",
            "rules": "Licensing Rules",
            "powered": "Powered by MTWTech Studio.",
        }
    },


    "home": {
        "slider": {
            "key_88": "Welcome Package +200%",
            "key_89": "Activate your secret promo voucher in your personal profile dashboard and multiply your coins\n                            instantly!",
            "key_90": "Claim Now",
            "key_91": "Live Aviator Tournament",
            "key_92": "Fly high, match maximum win multiplier coordinates, secure top place points and win your\n                            fraction of the 5,000 🪙 prize pool!",
            "key_93": "Launch Crash",
            "key_94": "In-Play Sportsbook Engine",
            "key_95": "Combine your favorite outcomes from soccer, basketball, and tennis into elite combo slips\n                            with boosted total odds multipliers.",
            "key_96": "Open Arena",
            "key_97": "Video Slots",
            "key_98": "Crash Flight",
            "key_99": "Live Sports",
            "key_100": "Featured Lobby Hits",
            "key_101": "Crash Aviator",
            "key_103": "Slots Video 5x3",
            "key_105": "Sports Betting Arena",
        }
    },
};

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Сглаживание объекта переводов
function flattenTranslations(obj, prefix = '') {
    let flatten = {};
    for (let key in obj) {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            Object.assign(flatten, flattenTranslations(obj[key], currentPath));
        } else {
            flatten[obj[key]] = currentPath;
        }
    }
    return flatten;
}

const dictionary = flattenTranslations(en);
const sortedPhrases = Object.keys(dictionary).sort((a, b) => b.length - a.length);

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanges = false;
    const ext = path.extname(filePath);

    sortedPhrases.forEach(phrase => {
        const keyPath = dictionary[phrase];
        const escapedPhrase = escapeRegExp(phrase);

        // ==========================================
        // ИСПРАВЛЕННАЯ ЛОГИКА ДЛЯ JS (Защита функций и ID)
        // ==========================================
        if (ext === '.js') {
            // 1. Динамические строки с переменными {{плейсхолдер}}
            if (phrase.includes('{{') && phrase.includes('}}')) {
                let regexStr = escapedPhrase.replace(/\\\{\\\{(.*?)\\\}\\\}/g, '\\$\\{([^}]+)\\}');
                const dynamicRegex = new RegExp(regexStr, 'g');

                if (dynamicRegex.test(content)) {
                    const variables = [...phrase.matchAll(/{{(.*?)}}/g)].map(m => m.trim());
                    content = content.replace(dynamicRegex, (match, ...args) => {
                        let paramsObj = {};
                        variables.forEach((varName, index) => {
                            paramsObj[varName] = args[index].trim();
                        });
                        const paramsStr = Object.entries(paramsObj).map(([k, v]) => `${k}: ${v}`).join(', ');
                        return `t('${keyPath}', { ${paramsStr} })`;
                    });
                    hasChanges = true;
                }
            }
            // 2. Статичные строки: заменяем только если это текст (есть пробелы, эмодзи или точное совпадение)
            else {
                // Ищем строку в кавычках, где перед/после искомого слова идет не-буквенный символ (пробел, эмодзи, знак препинания)
                // Это защитит от замены одиночных id типа 'profile' в getElementById
                const jsStaticRegex = new RegExp(`(["'\`])([^"'\`]*?\\b|[^"'\`]*?)${escapedPhrase}(\\b[^"'\`]*?|[^"'\`]*?)\\1`, 'g');

                content = content.replace(jsStaticRegex, (match, quote, before, after) => {
                    // Защита: если это чистый системный идентификатор (нет пробелов и эмодзи вокруг), не трогаем его
                    if (!before.trim() && !after.trim() && !/^[a-zA-Z0-9_-]+$/.test(phrase)) {
                        return match;
                    }

                    // Если вокруг слова есть текст или эмодзи (например, "👤 Profile")
                    if (before || after) {
                        hasChanges = true;
                        // Превращаем в бэктики с интерполяцией функции t()
                        return `\`${before}\${t('${keyPath}')}${after}\``;
                    }

                    // Если это было отдельно стоящее текстовое слово в кавычках
                    hasChanges = true;
                    return `t('${keyPath}')`;
                });
            }
        }

        // ==========================================
        // ИСПРАВЛЕННАЯ ЛОГИКА ДЛЯ HTML
        // ==========================================
        if (ext === '.html') {
            // Ищет текст строго между тегами > и <, чтобы не задеть названия классов или id тегов
            const htmlTagRegex = new RegExp(`(>)([^<]*?)${escapedPhrase}([^<]*?)(<)`, 'g');
            if (htmlTagRegex.test(content)) {
                content = content.replace(htmlTagRegex, `$1$2{{t('${keyPath}')}}$3$4`);
                hasChanges = true;
            }

            // Замена только в пользовательских атрибутах интерфейса (placeholder, alt, value)
            const htmlAttrRegex = new RegExp(`(placeholder|alt|value)=(["'])(.*?)${escapedPhrase}(.*?)\\2`, 'g');
            if (htmlAttrRegex.test(content)) {
                content = content.replace(htmlAttrRegex, `$1=$2$3{{t('${keyPath}')}}$4$2`);
                hasChanges = true;
            }
        }
    });

    if (hasChanges) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[ОБНОВЛЕН] Файл: ${filePath}`);
    } else {
        console.log(`[ИЗМЕНЕНИЙ НЕТ] Файл: ${filePath}`);
    }
}


// 4. Запуск прохода по нужным файлам (укажите пути к вашим файлам)
const filesToProcess = [
    // './platform.html',
    './view/scripts/platform.js'
];

filesToProcess.forEach(file => {
    if (fs.existsSync(file)) {
        processFile(file);
    } else {
        console.log(`Файл не найден: ${file}`);
    }
});

console.log('Замена завершена!');
