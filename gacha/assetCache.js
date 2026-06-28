const DB_NAME = 'GameAssetsDB';
const STORE_NAME = 'game_resources';
const DB_VERSION = 1;

const assetCache = {
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async get(url) {
        // Пропускаем пустые строки или уже готовые blob-ссылки
        if (!url || typeof url !== 'string' || url.startsWith('blob:') || url.startsWith('data:')) {
            return url;
        }

        const db = await this.init();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(url);

            request.onsuccess = async () => {
                if (request.result) {
                    resolve(URL.createObjectURL(request.result));
                } else {
                    try {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        const blob = await response.blob();

                        const writeTransaction = db.transaction(STORE_NAME, 'readwrite');
                        writeTransaction.objectStore(STORE_NAME).put(blob, url);

                        resolve(URL.createObjectURL(blob));
                    } catch (err) {
                        console.error(`Ошибка загрузки ресурса [${url}]:`, err);
                        resolve(url); // Фолбэк на сеть при ошибке
                    }
                }
            };
            request.onerror = () => resolve(url);
        });
    }
};
