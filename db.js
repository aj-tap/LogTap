const DB_NAME = 'LogTapDataDB';
const STORE_NAME = 'logDataStore';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(`IndexedDB error: ${event.target.error?.message || event.target.error}`);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
    return dbPromise;
}

async function saveData(key, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(data, key);

            request.onsuccess = () => {
                resolve();
            };
            request.onerror = (event) => {
                console.error("Error saving data to IndexedDB:", event.target.error);
                reject(`Failed to save data: ${event.target.error?.message || event.target.error}`);
            };
             transaction.onerror = (event) => {
                 console.error("Transaction error saving data:", event.target.error);
                 reject(`Transaction failed: ${event.target.error?.message || event.target.error}`);
             };
        } catch (e) {
             console.error("Error initiating save transaction:", e);
             reject(`Failed to initiate save: ${e.message}`);
        }
    });
}

async function getData(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
         try {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            request.onerror = (event) => {
                console.error("Error getting data from IndexedDB:", event.target.error);
                reject(`Failed to get data: ${event.target.error?.message || event.target.error}`);
            };
             transaction.onerror = (event) => {
                 console.error("Transaction error getting data:", event.target.error);
                 reject(`Transaction failed: ${event.target.error?.message || event.target.error}`);
             };
        } catch (e) {
             console.error("Error initiating get transaction:", e);
             reject(`Failed to initiate get: ${e.message}`);
        }
    });
}

async function deleteData(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };
            request.onerror = (event) => {
                console.error("Error deleting data from IndexedDB:", event.target.error);
                reject(`Failed to delete data: ${event.target.error?.message || event.target.error}`);
            };
             transaction.onerror = (event) => {
                 console.error("Transaction error deleting data:", event.target.error);
                 reject(`Transaction failed: ${event.target.error?.message || event.target.error}`);
             };
        } catch (e) {
             console.error("Error initiating delete transaction:", e);
             reject(`Failed to initiate delete: ${e.message}`);
        }
    });
}

export { saveData, getData, deleteData, openDB };

