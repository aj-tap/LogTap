import { SuperDB } from './index.js';
import { getData } from './db.js';

let isCancelled = false;
let superdbWorkerInstance = null;

async function initializeSuperDB(wasmPath) {
    if (superdbWorkerInstance) return true;
    if (typeof SuperDB === 'undefined') {
         postMessage({ type: 'init_error', message: 'SuperDB class not found in worker after import.' });
         return false;
    }
    try {
        superdbWorkerInstance = await SuperDB.instantiate(wasmPath);
        postMessage({ type: 'init_done' });
        return true;
    } catch (error) {
        console.error("Worker: Failed to instantiate SuperDB Wasm:", error);
        postMessage({ type: 'init_error', message: `Worker failed to load Wasm: ${error.message}` });
        return false;
    }
}

async function runScan(dataPayload) {
    const { rules, inputFormat, data, dataLocation } = dataPayload;
    let inputData = data;

    if (!superdbWorkerInstance) {
        postMessage({ type: 'error', ruleName: 'Setup', message: 'SuperDB not initialized in worker.' });
        postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
        return;
    }
    if (!rules || rules.length === 0) {
         postMessage({ type: 'error', ruleName: 'Setup', message: 'No rules provided to worker.' });
         postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
        return;
    }

    if (dataLocation && dataLocation.type === 'indexeddb' && dataLocation.key) {
        try {
            postMessage({ type: 'progress_detail', message: 'Loading data from DB...' });
            inputData = await getData(dataLocation.key);
            if (typeof inputData === 'undefined') {
                 postMessage({ type: 'error', ruleName: 'Setup', message: 'Data not found in IndexedDB for key: ' + dataLocation.key });
                 postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
                 return;
            }
            postMessage({ type: 'progress_detail', message: 'Data loaded. Starting scan...' });
        } catch (dbError) {
            console.error("Worker: Failed to load data from IndexedDB:", dbError);
            postMessage({ type: 'error', ruleName: 'Setup', message: `Failed to load data from DB: ${dbError.message}` });
            postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
            return;
        }
    } else if (!inputData) {
         postMessage({ type: 'error', ruleName: 'Setup', message: 'No input data available for scan.' });
         postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
         return;
    }

    isCancelled = false;
    let hitsFound = 0;
    let errorsOccurred = false;
    let rulesProcessed = 0;
    const totalRules = rules.length;

    postMessage({ type: 'progress', processed: 0, total: totalRules });

    for (const rule of rules) {
        if (isCancelled) {
            console.log("Worker: Scan cancelled.");
            postMessage({ type: 'cancelled' });
            break;
        }

        rulesProcessed++;
        postMessage({ type: 'progress', processed: rulesProcessed, total: totalRules });

        try {
            const result = await superdbWorkerInstance.run({
                query: rule.query,
                input: inputData,
                inputFormat: inputFormat,
                outputFormat: 'line'
            });

            if (result && result.trim() !== "") {
                hitsFound++;
                postMessage({
                    type: 'hit',
                    ruleName: rule.name,
                    query: rule.query,
                    result: result.trim()
                });
            }
        } catch (error) {
            errorsOccurred = true;
            console.error(`Worker: Scanner rule "${rule.name}" error:`, error);
            postMessage({
                type: 'error',
                ruleName: rule.name,
                message: error.message || String(error)
            });
        }
    }

    if (!isCancelled) {
        postMessage({ type: 'complete', hitsFound: hitsFound, errorsOccurred: errorsOccurred });
    }
}

self.addEventListener('unhandledrejection', event => {
    console.error("Worker: Unhandled Rejection:", event.reason);
    postMessage({
        type: 'critical_error',
        message: `Unhandled promise rejection: ${event.reason?.message || event.reason}`
    });
});

self.onmessage = async (event) => {
    try {
        const { type, ...dataPayload } = event.data;

        if (type === 'init') {
            await initializeSuperDB(dataPayload.wasmPath || "superdb.wasm");
        } else if (type === 'start') {
             if (!superdbWorkerInstance) {
                 const initialized = await initializeSuperDB(dataPayload.wasmPath || "superdb.wasm");
                 if (initialized) {
                     await runScan(dataPayload);
                 } else {
                      postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
                 }
             } else {
                  await runScan(dataPayload);
             }
        } else if (type === 'cancel') {
            isCancelled = true;
            console.log("Worker: Received cancel signal.");
        }
    } catch (error) {
        console.error("Worker: Critical Error in onmessage:", error);
        postMessage({
            type: 'critical_error',
            message: `Critical worker error: ${error.message}`,
            stack: error.stack
        });
        postMessage({ type: 'complete', hitsFound: 0, errorsOccurred: true });
    }
};

if (typeof SuperDB === 'undefined') {
     console.warn("Worker: SuperDB class might not be immediately available at top level.");
} else {
    console.log("Worker: SuperDB class found.");
}

