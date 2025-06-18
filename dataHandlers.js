import { dom, config } from './config.js';
import { getActiveTab, updateActiveTab, isEvtxWasmReady } from './state.js';
import { renderTabs } from './tabManager.js';
import { getSuperDB } from './app.js';
import { showAppMessage, hideAppMessage, lockUI, updateResultDisplay, displayTableWithGridJs } from './ui.js';
import { saveData, deleteData, getDataAsStream } from './db.js';
import { saveQueryToHistory } from './components.js';
import { parseResultForTable, applyEvtxCleaner } from './utils.js';

export async function handleNewData(tab, data, sourceName) {
    if (tab.gridInstance) { try { tab.gridInstance.destroy(); } catch(e) {} }
    if (tab.timelineChartInstance) { try { tab.timelineChartInstance.destroy(); } catch(e) {} }
    if (tab.cyInstance) { try { tab.cyInstance.destroy(); } catch(e) {} }

    updateActiveTab({
        currentRawOutput: null,
        gridInstance: null,
        cyInstance: null,
        timelineChartInstance: null,
        timelineChartDataCache: null,
        timelineVisible: false,
        graphVisible: false,
        query: 'pass'
    });
    
    dom.queryInput.value = 'pass';
    updateResultDisplay(tab);
    
    if (tab.dataLocation?.type === 'indexeddb' && tab.dataLocation.key) {
        try { 
            await deleteData(tab.dataLocation.key); 
        } catch (e) {
            console.error(`[Data] Could not delete old data for key ${tab.dataLocation.key}:`, e);
        }
    }

    const dataSize = (typeof data === 'string') ? data.length : 0;
    const isLarge = dataSize > config.LARGE_DATA_THRESHOLD;
    const displaySize = (dataSize / (1024 * 1024)).toFixed(2) + ' MB';
    const summary = `${sourceName} (${displaySize})`;

    tab.dataSummary = summary;
    dom.fileNameDisplay.textContent = summary;
    if (isLarge) {
        tab.originalDataSource = null;
        dom.dataInput.value = '';
        dom.dataInput.placeholder = `Large data (${displaySize}) stored in database...`;
        dom.dataInput.disabled = true;
        try {
            await saveData(tab.id, data);
            tab.dataLocation = { type: 'indexeddb', key: tab.id };
            showAppMessage(`Data "${sourceName}" stored successfully.`, 'success');
        } catch (dbError) {
            showAppMessage(`Failed to store large data: ${dbError.message}`, 'error', true);
            tab.dataLocation = { type: 'error' };
        }
    } else {
        tab.originalDataSource = data;
        tab.dataLocation = { type: 'memory' };
        dom.dataInput.value = data;
        dom.dataInput.placeholder = "Paste log data here...";
        dom.dataInput.disabled = false;
        showAppMessage(`Data "${sourceName}" loaded into memory.`, 'info');
    }
    
    const hasRules = tab.scannerRules && tab.scannerRules.length > 0;
    dom.runScannerBtn.disabled = !(hasRules && (tab.dataLocation?.type === 'memory' || tab.dataLocation?.type === 'indexeddb'));
}

export async function applyShaperScriptHandler() {
    const activeTab = getActiveTab();
    const superdbInstance = getSuperDB();
    if (!activeTab || !superdbInstance) return;
    const hasData = activeTab.dataLocation?.type !== 'empty';
    if (!hasData) {
        showAppMessage("No data loaded to apply a shaper to.", "warning");
        return;
    }
    const selectedShaperFile = dom.shaperScriptsSelect.value;
    if (!selectedShaperFile) {
        showAppMessage("Please select a valid shaper script.", "warning");
        return;
    }
    dom.applyShaperBtn.disabled = true;
    dom.applyShaperBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Applying...';
    try {
        const response = await fetch(`shapers/${selectedShaperFile}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const yamlContent = await response.text();
        const selectedShaper = jsyaml.load(yamlContent);
        if (!selectedShaper?.query || !selectedShaper?.inputFormat || !selectedShaper?.outputFormat) {
            throw new Error(`Invalid shaper file format.`);
        }
        let inputForWasm = null;
        if (activeTab.dataLocation?.type === 'indexeddb') {
            inputForWasm = await getDataAsStream(activeTab.dataLocation.key);
        } else if (activeTab.dataLocation?.type === 'memory') {
            inputForWasm = activeTab.originalDataSource;
        }
        const result = await superdbInstance.run({
            query: selectedShaper.query,
            input: inputForWasm,
            inputFormat: activeTab.inputFormat,
            outputFormat: selectedShaper.outputFormat
        });
        const originalFileName = activeTab.name.split(' (')[0].replace(/\..+$/, '');
        await handleNewData(activeTab, result, `${originalFileName} (Shaped)`);
        updateActiveTab({
            inputFormat: selectedShaper.outputFormat,
        });
        dom.inputFormatSelect.value = selectedShaper.outputFormat;
        showAppMessage(`Shaper "${selectedShaper.name}" applied. Data transformed.`, 'success');
    } catch (error) {
        showAppMessage(`Error applying shaper: ${error.message}`, 'error', true);
    } finally {
        dom.applyShaperBtn.disabled = false;
        dom.applyShaperBtn.textContent = 'Apply';
    }
}

export async function runQueryHandler(isRetryAttempt = false) {
    const activeTab = getActiveTab();
    const superdbInstance = getSuperDB();
    if (!activeTab || !superdbInstance) return;
    let query = activeTab.query.trim();
    let inputForWasm = null;
    if (activeTab.dataLocation?.type === 'indexeddb') {
        inputForWasm = await getDataAsStream(activeTab.dataLocation.key);
    } else if (activeTab.dataLocation?.type === 'memory') {
        inputForWasm = activeTab.originalDataSource;
    } else if (activeTab.dataLocation?.type === 'empty') {
        inputForWasm = '';
    }
    if (!inputForWasm && activeTab.dataLocation?.type !== 'empty') {
        showAppMessage("No data available to run the query.", "warning");
        return;
    }
    if (!isRetryAttempt) saveQueryToHistory(query);
    if (!query) {
        query = "pass";
        updateActiveTab({ query: "pass" });
        dom.queryInput.value = "pass";
    }
    if (activeTab.gridInstance) { try { activeTab.gridInstance.destroy(); } catch (e) {} }
    updateActiveTab({ currentRawOutput: null, gridInstance: null });
    dom.runQueryBtn.disabled = true;
    dom.runQueryBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Running...';
    try {
        const result = await superdbInstance.run({
            query: query,
            input: inputForWasm,
            inputFormat: activeTab.inputFormat,
            outputFormat: activeTab.outputFormat
        });
        updateActiveTab({ currentRawOutput: result });
        const tableData = parseResultForTable(result, activeTab.outputFormat);
        if (tableData) {
            displayTableWithGridJs(tableData, dom.tableResultOutputContainer, activeTab);
        }
        updateResultDisplay(activeTab);
    } catch (error) {
        const isFormatError = error.message?.includes("format detection error");
        if (activeTab.inputFormat === 'auto' && isFormatError && !isRetryAttempt) {
            showAppMessage("Auto-detection failed. Retrying with 'Line' format...", 'warning', true);
            updateActiveTab({ inputFormat: 'line' });
            dom.inputFormatSelect.value = 'line';
            await runQueryHandler(true);
        } else {
            updateActiveTab({ currentRawOutput: `Error: ${error.message}` });
            updateResultDisplay(activeTab);
            showAppMessage(`Query failed: ${error.message}`, 'error', true);
        }
    } finally {
        dom.runQueryBtn.disabled = false;
        dom.runQueryBtn.innerHTML = '<i class="fa-solid fa-play me-2"></i>Run Query';
    }
}

export async function processEvtxFiles(files, activeTab) {
    lockUI(true, "Processing EVTX files...");
    try {
        if (!isEvtxWasmReady()) throw new Error("EVTX converter is not ready.");
        const conversionPromises = Array.from(files).map((file) =>
            new Promise(async (resolve, reject) => {
                try {
                    const fileBuffer = await file.arrayBuffer();
                    const jsonResult = await goEvtxToJSON(new Uint8Array(fileBuffer));
                    resolve(jsonResult);
                } catch (error) {
                    reject(new Error(`Failed to process ${file.name}: ${error.message}`));
                }
            })
        );
        const results = await Promise.all(conversionPromises);
        const combinedJsonString = results.join('\n');
        const shapedResult = await applyEvtxCleaner(combinedJsonString);
        const tabName = files.length > 1 ? `${files.length}_evtx_files.json` : files[0].name.replace(/\.evtx$/i, '.json');
        await handleNewData(activeTab, shapedResult, tabName);
    } catch (error) {
        showAppMessage(`Error during EVTX processing: ${error.message}`, 'error', true);
    } finally {
        lockUI(false);
    }
}