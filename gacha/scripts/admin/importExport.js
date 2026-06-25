function downloadConfigJson() {
    try {
        // Экспортируем полный чистый слепок базы со всеми новыми ветками
        const jsonString = JSON.stringify(gamesConfigDB, null, 4);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "gamesConfigDB.json";

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert("Failed to export configuration data framework.");
    }
}

function triggerImportClick() {
    document.getElementById("import-file-input").click();
}

function handleConfigImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedJson = JSON.parse(e.target.result);

            if (!parsedJson || typeof parsedJson !== 'object') {
                throw new Error("Invalid structure format.");
            }
            if (!parsedJson.game_combat_stars) {
                throw new Error("Missing critical root criteria 'game_combat_stars'.");
            }

            const rootNode = parsedJson.game_combat_stars;

            // ПОЛИФИЛЫ: Защита от падения, если клиент загружает свой старый JSON без новых систем
            if (!rootNode.gacha) rootNode.gacha = { rules: {}, diamond_limits: {}, banners: [], pools: {} };
            if (!rootNode.pve_campaign) rootNode.pve_campaign = { base_idle_rate: { gold: 0, exp: 0 }, stages: {} };
            if (!rootNode.pve_towers) rootNode.pve_towers = {};
            if (!rootNode.pve_bosses) rootNode.pve_bosses = {};
            if (!rootNode.pvp_arena) rootNode.pvp_arena = { rules: {}, matchmaking_settings: {}, tiers: {}, season_buffs: {}, shop: { slots: [] } };
            if (!rootNode.social) rootNode.social = { friend_system: {}, guild_system: { level_caps: {}, donation_modes: {}, shop: { slots: [] } } };
            if (!rootNode.quests) rootNode.quests = { daily: { milestones: [], task_pool: {} }, weekly: { milestones: [], task_pool: {} } };
            if (!rootNode.battle_passes) rootNode.battle_passes = {};
            if (!rootNode.bounty_board) rootNode.bounty_board = { max_daily_dispatched_missions: 8, refresh_cost: {}, mission_generation_rates: {}, mission_pool: {} };

            // НОВОЕ: Полифил для временных акций и триггерных офферов
            if (!rootNode.limited_offers) rootNode.limited_offers = { settings: { max_simultaneous_triggered_offers: 2, global_discount_badge_color: "#ffeb3b" }, offers_pool: {} };

            gamesConfigDB = parsedJson;

            // Перепривязываем глобальный указатель контекста админки
            window.target = gamesConfigDB.game_combat_stars;

            // ТОТАЛЬНЫЙ СБРОС ВСЕХ ВНУТРЕННИХ СОСТОЯНИЙ И АККОРДЕОНОВ (Защита от утечек и RangeError)
            state.server = null;
            state.resource = null;
            state.ui = null;
            state.hero = null;
            state.item = null;
            state.dialog = null;

            stateMechKey = null;
            currentUiScreenIdx = null;
            currentUiWidgetIdx = null;
            stateLocKey = null;

            stateItemKey = null;
            stateShopKey = null;
            currentShopSlotIdx = null;
            currentPoolItemIdx = null;
            currentGachaBannerIdx = null;
            stateGachaKey = null;
            stateCampaignStageKey = null;
            currentEnemyIdx = null;
            currentRewardItemIdx = null;
            stateTowerKey = null;
            stateFloorKey = null;
            currentTowerEnemyIdx = null;
            currentTowerRewardItemIdx = null;
            stateBossKey = null;
            currentBossTierIdx = null;
            stateArenaTierKey = null;
            currentArenaSlotIdx = null;
            currentGuildDonationKey = null;
            currentGuildSlotIdx = null;
            currentQuestTaskKey = null;
            stateBpKey = null;
            currentBpLevelIdx = null;
            currentBountyMissionKey = null;

            // НОВОЕ: Сброс стейта акций
            stateOfferKey = null;
            currentOfferRewardIdx = null;

            // Полная принудительная перезагрузка визуальных деревьев интерфейса
            initFormValues();
            renderServers();
            switchMechTab(currentMechSection);
            switchUiOrientation(currentUiOrientation);
            switchLocCategory(currentLocCategory);
            renderProfileEditor();
            renderHeroes();
            renderItems();
            renderDialogs();

            // Запуск мягкого обновления сайдбаров для MMO-модулей и маркетинга
            if (typeof renderShopsList === 'function') renderShopsList();
            if (typeof renderGachaList === 'function') renderGachaList();
            if (typeof renderCampaignList === 'function') renderCampaignList();
            if (typeof renderTowersList === 'function') renderTowersList();
            if (typeof renderBossesList === 'function') renderBossesList();
            if (typeof renderArenaSidebarList === 'function') renderArenaSidebarList();
            if (typeof renderSocialSidebarList === 'function') renderSocialSidebarList();
            if (typeof renderQuestsSidebarList === 'function') renderQuestsSidebarList();
            if (typeof renderBattlePassesList === 'function') renderBattlePassesList();
            if (typeof renderBountyBoardSidebar === 'function') renderBountyBoardSidebar();
            if (typeof renderOffersList === 'function') renderOffersList();

            event.target.value = "";
            alert("Configuration blueprint successfully imported and hot-swapped!");

        } catch (error) {
            alert("Configuration Import Failed: " + error.message);
            event.target.value = "";
        }
    };
    reader.readAsText(file);
}

function initFormValues() {
    const orientationInput = document.getElementById('gen-orientation');
    const langInput = document.getElementById('gen-default-lang');

    if (orientationInput) orientationInput.value = target.orientation || 'landscape';
    if (langInput) langInput.value = target.default_lang || 'en';
}