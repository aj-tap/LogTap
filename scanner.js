import { dom } from './config.js';
import { getActiveTab, getScannerWorker, setScannerWorker } from './state.js';
import { getSuperDB } from './app.js';
import { showAppMessage, hideAppMessage } from './ui.js';
import { loadScannerRulesFromFile } from './utils.js';

export function runScannerHandler() {
    const activeTab = getActiveTab();
    const superdbInstance = getSuperDB();
    if (!activeTab || !superdbInstance) return;
    if (!activeTab.scannerRules || activeTab.scannerRules.length === 0) {
        showAppMessage("No scanner rules loaded.", 'warning');
        return;
    }
    const hasData = activeTab.dataLocation?.type !== 'empty';
    if (!hasData) {
        showAppMessage("No data available to scan.", 'warning');
        return;
    }
    terminateScannerWorker();
    activeTab.scannerHitsHTML = '';
    dom.scannerHitsOutput.innerHTML = '';
    dom.noScannerHitsMessage.classList.remove('d-none');
    dom.scannerHitsOutput.classList.add('d-none');
    dom.scanProgress.classList.remove('d-none');
    dom.scanProgress.textContent = 'Initializing scanner...';
    hideAppMessage();
    dom.runScannerBtn.disabled = true;
    dom.runQueryBtn.disabled = true;
    dom.cancelScanBtn.classList.remove('d-none');
    dom.runScannerBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Starting...';

    const startData = {
        rules: activeTab.scannerRules,
        inputFormat: activeTab.inputFormat,
        wasmPath: "superdb.wasm",
    };
    if (activeTab.dataLocation?.type === 'indexeddb') {
        startData.dataLocation = { type: 'indexeddb', key: activeTab.dataLocation.key };
    } else if (activeTab.dataLocation?.type === 'memory') {
        startData.data = activeTab.originalDataSource;
    }

    try {
        const worker = new Worker('scanner.worker.js', { type: 'module' });
        setScannerWorker(worker);
        worker.onerror = (e) => {
            showAppMessage(`Scanner Worker error: ${e.message}`, 'error', true);
            terminateScannerWorker();
        };
        worker.onmessage = handleWorkerMessage;
        worker.tabId = activeTab.id;
        worker.pendingStartData = startData;
        worker.postMessage({ type: 'init', wasmPath: startData.wasmPath });
    } catch (error) {
        showAppMessage(`Failed to start scanner: ${error.message}`, 'error', true);
        terminateScannerWorker();
    }
}

export function cancelScanHandler() {
    const scannerWorker = getScannerWorker();
    if (scannerWorker) {
        showAppMessage("Cancelling scan...", "warning");
        scannerWorker.postMessage({ type: 'cancel' });
    }
}

export function terminateScannerWorker(tabIdToClose = null) {
    const scannerWorker = getScannerWorker();
    if (scannerWorker && (tabIdToClose === null || scannerWorker.tabId === tabIdToClose)) {
        scannerWorker.terminate();
        setScannerWorker(null);
        const activeTab = getActiveTab();
        const hasData = activeTab?.dataLocation?.type !== 'empty';
        dom.runScannerBtn.disabled = !(activeTab?.scannerRules?.length > 0 && hasData);
        dom.runQueryBtn.disabled = false;
        dom.cancelScanBtn.classList.add('d-none');
        dom.scanProgress.classList.add('d-none');
        dom.runScannerBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Run Scanner';
    }
}

function handleWorkerMessage(event) {
    const { type, ...data } = event.data;
    const scannerWorker = getScannerWorker();
    const activeTab = getActiveTab();
    if (!scannerWorker || !activeTab || activeTab.id !== scannerWorker.tabId) {
        if (type.includes('complete') || type.includes('error') || type === 'cancelled') {
            if (scannerWorker && type !== 'cancelled') terminateScannerWorker();
        }
        return;
    }
    switch (type) {
        case 'init_done':
            if (scannerWorker.pendingStartData) {
                scannerWorker.postMessage({ type: 'start', ...scannerWorker.pendingStartData });
                delete scannerWorker.pendingStartData;
                dom.runScannerBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Scanning...';
            }
            break;
        case 'init_error':
        case 'critical_error':
            showAppMessage(`Scanner Worker Error: ${data.message}`, 'error', true);
            terminateScannerWorker();
            break;
        case 'progress':
            dom.scanProgress.textContent = `Scanning ${data.processed}/${data.total}...`;
            break;
        case 'scanner_batch_results':
            updateScannerUIWithResults(data, activeTab);
            break;
        case 'cancelled':
            showAppMessage('Scan cancelled.', 'warning');
            terminateScannerWorker();
            break;
        case 'complete':
            if (dom.scannerHitsOutput.children.length === 0) dom.noScannerHitsMessage.classList.remove('d-none');
            showAppMessage(`Scanner finished.`, 'success');
            terminateScannerWorker();
            break;
    }
}

function updateScannerUIWithResults(data, tab) {
    dom.scannerResultsPanel.removeAttribute('style');
    (data.hits || []).forEach(hit => {
        if (hit.result && hit.result.trim()) {
            const hitDiv = document.createElement('div');
            hitDiv.className = "mb-3 pb-3 border-bottom";
            hitDiv.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <strong class="text-info d-block mb-1 small" title="Rule: ${hit.ruleName}">"${hit.ruleName}"</strong>
                    <div>
                        <button class="btn btn-outline-primary btn-sm py-0 px-1 investigate-button" data-rule-query="${encodeURIComponent(hit.query)}">Investigate</button>
                    </div>
                </div>                
                <div class="scanner-hit-result"><pre class="small m-0"><code>${hit.result.replace(/</g, "<").replace(/>/g, ">")}</code></pre></div>`;
            dom.scannerHitsOutput.appendChild(hitDiv);
        }
    });
    if (dom.scannerHitsOutput.children.length > 0) {
        dom.noScannerHitsMessage.classList.add('d-none');
        dom.scannerHitsOutput.classList.remove('d-none');
    }
    tab.scannerHitsHTML = dom.scannerHitsOutput.innerHTML;
}
