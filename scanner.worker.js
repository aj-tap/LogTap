import { SuperDB } from './index.js';
import { getData, getDataAsStream } from './db.js';

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

    isCancelled = false;
    let totalHitsFound = 0;
    let totalErrorsOccurred = false;
    let rulesProcessed = 0;

    postMessage({ type: 'progress', processed: 0, total: rules.length });

    const isLargeDataFromDB = dataLocation && dataLocation.type === 'indexeddb' && dataLocation.key;
    const CONCURRENCY_LIMIT = isLargeDataFromDB ? 50 : 100; 

    const ruleChunks = [];
    for (let i = 0; i < rules.length; i += CONCURRENCY_LIMIT) {
        ruleChunks.push(rules.slice(i, i + CONCURRENCY_LIMIT));
    }
    
    postMessage({ type: 'progress_detail', message: `Processing in batches of ${CONCURRENCY_LIMIT}...` });

    for (const ruleChunk of ruleChunks) {
        if (isCancelled) break;
        
        try {
            let batchOpts;
            if (isLargeDataFromDB) {
                const sourceStream = await getDataAsStream(dataLocation.key);
                const teedStreams = [];
                let currentStream = sourceStream;

                for (let i = 0; i < ruleChunk.length; i++) {
                    if (i < ruleChunk.length - 1) {
                        const [s1, s2] = currentStream.tee();
                        teedStreams.push(s1);
                        currentStream = s2;
                    } else {
                        teedStreams.push(currentStream);
                    }
                }

                batchOpts = ruleChunk.map((rule, i) => ({
                    program: rule.query,
                    input: teedStreams[i],
                    inputFormat: inputFormat,
                    outputFormat: 'line'
                }));
            } else {
                if (!data) {
                    postMessage({ type: 'error', ruleName: 'Setup', message: 'No input data available for scan.' });
                    continue;
                }
                batchOpts = ruleChunk.map(rule => ({
                    program: rule.query,
                    input: data,
                    inputFormat: inputFormat,
                    outputFormat: 'line'
                }));
            }
            
            const batchResults = await superdbWorkerInstance.zqBatch(batchOpts);
            const hits = [];
            const errors = [];

            batchResults.forEach((batchItem, i) => {
                const rule = ruleChunk[i];
                
                const success = batchItem.success; 
                const dataResult = batchItem.data;
                const dataHasData = batchItem.hasData;
                const errorMsg = batchItem.error;   
                const index = batchItem.index; 
                const query = batchItem.query; 

                console.log(`--- Processing Rule: "${rule.name}" (Index: ${index}) ---`);
                console.log(`  Success: ${success} (type: ${typeof success})`);
                console.log(`  Has Data: ${dataHasData} (type: ${typeof dataHasData})`);
                console.log(`  (Data length: ${dataResult ? dataResult.length : 0})`);
                console.log(`  Error: "${errorMsg}"`);

                if (success && dataResult && dataResult.trim() !== "") {
                    console.log(`  -> Detected HIT for rule "${rule.name}".`);
                    hits.push({ 
                        ruleName: rule.name, 
                        query: query, 
                        result: `${dataResult.trim().substring(0, 100)}.... Use 'Investigate' or 'Pivot' to see fully results.`
                    });
                } else if (!success) {
                    console.log(`  -> Entered FAILURE branch for rule "${rule.name}".`);
                    console.error(`  -> Rule "${rule.name}" FAILED. Error: ${errorMsg || 'Unknown error.'}`); 
                    errors.push({ 
                        ruleName: rule.name, 
                        message: errorMsg || 'Unknown error during query execution.' 
                    });
                } else {
                    console.log(`  -> Rule "${rule.name}" successful but NO DATA (no hit).`);
                }
            });

            if (hits.length > 0 || errors.length > 0) {
                 postMessage({ type: 'scanner_batch_results', hits: hits, errors: errors });
            }
            totalHitsFound += hits.length;
            if (errors.length > 0) totalErrorsOccurred = true;

        } catch (e) {
            totalErrorsOccurred = true;
            ruleChunk.forEach(rule => {
                postMessage({ type: 'scanner_error', error: { ruleName: rule.name, message: `Batch failed: ${e.message || String(e)}` } });
            });
        }

        rulesProcessed += ruleChunk.length;
        postMessage({ type: 'progress', processed: rulesProcessed, total: rules.length });
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    if (!isCancelled) {
        postMessage({ type: 'complete', hitsFound: totalHitsFound, errorsOccurred: totalErrorsOccurred });
    } else {
        postMessage({ type: 'cancelled' });
    }
}

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
    }
};
