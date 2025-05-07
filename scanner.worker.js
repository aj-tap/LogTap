// scanner.worker.js

// --- Use ES Module import instead of importScripts ---
// index.js should handle importing wasm_exec.js and bridge.js internally if needed
import { SuperDB } from './index.js'; // Assuming SuperDB is exported from index.js

// Flag to control cancellation
let isCancelled = false;
let superdbWorkerInstance = null;

/**
 * Initializes the SuperDB Wasm instance within the worker.
 * @param {string} wasmPath - Path to the superdb.wasm file.
 */
async function initializeSuperDB(wasmPath) {
    if (superdbWorkerInstance) return true; // Already initialized
    if (typeof SuperDB === 'undefined') {
         postMessage({ type: 'init_error', message: 'SuperDB class not found in worker after import.' });
         return false;
    }

    try {
        // Instantiate SuperDB specifically for this worker
        superdbWorkerInstance = await SuperDB.instantiate(wasmPath);
        postMessage({ type: 'init_done' }); // Signal main thread that worker is ready
        return true;
    } catch (error) {
        console.error("Worker: Failed to instantiate SuperDB Wasm:", error);
        postMessage({ type: 'init_error', message: `Worker failed to load Wasm: ${error.message}` });
        return false;
    }
}

/**
 * Runs the scanner rules against the provided data.
 * @param {object} dataPayload - Object containing data, rules, inputFormat.
 */
async function runScan(dataPayload) {
    const { data, rules, inputFormat } = dataPayload;
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

    isCancelled = false; // Reset cancellation flag for this run
    let hitsFound = 0;
    let errorsOccurred = false;
    let rulesProcessed = 0;
    const totalRules = rules.length;

    postMessage({ type: 'progress', processed: 0, total: totalRules }); // Initial progress

    for (const rule of rules) {
        if (isCancelled) {
            console.log("Worker: Scan cancelled.");
            postMessage({ type: 'cancelled' });
            break; // Exit loop if cancelled
        }

        rulesProcessed++;
        postMessage({ type: 'progress', processed: rulesProcessed, total: totalRules });

        try {
            // Run the individual rule query using the worker's SuperDB instance
            const result = await superdbWorkerInstance.run({
                query: rule.query,
                input: data,
                inputFormat: inputFormat,
                outputFormat: 'line' // Keep output simple
            });

            if (result && result.trim() !== "") {
                hitsFound++;
                // Send hit details back to the main thread
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

// Listen for messages from the main thread
self.onmessage = async (event) => {
    const { type, ...dataPayload } = event.data;

    if (type === 'init') {
        await initializeSuperDB(dataPayload.wasmPath || "superdb.wasm");
    } else if (type === 'start') {
        if (!superdbWorkerInstance) {
            const initialized = await initializeSuperDB(dataPayload.wasmPath || "superdb.wasm");
            if (initialized) {
                await runScan(dataPayload);
            }
        } else {
             await runScan(dataPayload);
        }
    } else if (type === 'cancel') {
        // Set the cancellation flag
        isCancelled = true;
        console.log("Worker: Received cancel signal.");
    }
};

if (typeof SuperDB === 'undefined') {
     console.warn("Worker: SuperDB class might not be immediately available at top level.");
} else {
    console.log("Worker: SuperDB class found.");
}
