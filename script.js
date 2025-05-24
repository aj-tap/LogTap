import { saveData, getData, deleteData, openDB, getDataAsStream } from './db.js';
let SuperDB;
try {
    SuperDB = (await import("./index.js")).SuperDB;
} catch (e) {
    if (typeof globalThis.SuperDB !== 'undefined') {
        SuperDB = globalThis.SuperDB;
    } else {
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = `<div class="vh-100 d-flex align-items-center justify-content-center text-bg-danger p-5">
                                <div class="text-center">
                                    <h1 class="display-4 fw-bold mb-4">Critical Error</h1>
                                    <p class="lead">SuperDB Wasm module failed to load. The application cannot start.</p>
                                    <p class="mt-2 small">Details: ${e.message}</p>
                                    <p class="mt-4 small text-light-emphasis">Please ensure 'index.js' and the Wasm file are correctly placed and accessible.</p>
                                </div>
                              </div>`;
        }
        throw new Error("SuperDB Wasm module failed to load. App cannot start.");
    }
}
const dom = {
    sidebar: document.getElementById('sidebar'),
    queryInput: document.getElementById('queryInput'),
    shaperScriptsSelect: document.getElementById('shaperScriptsSelect'),
    applyShaperBtn: document.getElementById('applyShaperBtn'),
    dataInput: document.getElementById('dataInput'),
    fileInput: document.getElementById('fileInput'),
    loadTestDataBtn: document.getElementById('loadTestDataBtn'),
    fileNameDisplay: document.getElementById('fileNameDisplay'),
    inputFormatSelect: document.getElementById('inputFormat'),
    outputFormatSelect: document.getElementById('outputFormat'),
    runQueryBtn: document.getElementById('runQueryBtn'),
    exportBtn: document.getElementById('exportBtn'),
    resultOutputCode: document.getElementById('resultOutputCode'),
    statusMessage: document.getElementById('statusMessage'),
    toggleViewBtn: document.getElementById('toggleViewBtn'),
    pivotResultsBtn: document.getElementById('pivotResultsBtn'),
    textResultOutput: document.getElementById('textResultOutput'),
    tableResultOutputContainer: document.getElementById('tableResultOutputContainer'),
    noResultsMessage: document.getElementById('noResultsMessage'),
    runScannerBtn: document.getElementById('runScannerBtn'),
    scannerResultsPanel: document.getElementById('scannerResultsPanel'),
    scannerHitsOutput: document.getElementById('scannerHitsOutput'),
    noScannerHitsMessage: document.getElementById('noScannerHitsMessage'),
    scannerRuleFileInput: document.getElementById('scannerRuleFileInput'),
    scannerRuleFileNameDisplay: document.getElementById('scannerRuleFileNameDisplay'),
    predefinedRulesSelect: document.getElementById('predefinedRulesSelect'),
    loadPredefinedRuleBtn: document.getElementById('loadPredefinedRuleBtn'),
    queryHistorySelect: document.getElementById('queryHistorySelect'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    logTabsContainer: document.getElementById('logTabsContainer'),
    addTabBtn: document.getElementById('addTabBtn'),
    cancelScanBtn: document.getElementById('cancelScanBtn'),
    scanProgress: document.getElementById('scanProgress'),
    focusModeBtn: document.getElementById('focusModeBtn')
};
let superdbInstance = null;
let tabsState = [];
let activeTabId = null;
let nextTabId = 1;
const MAX_HISTORY_ITEMS = 25;
let scannerWorker = null;
const LARGE_DATA_THRESHOLD = 1 * 1024 * 1024;
let goEvtx;
let evtxWasmReady = false;

const config = {
    inputFormats: [
        { value: "auto", text: "Auto-detect" }, { value: "csv", text: "CSV" },
        { value: "zjson", text: "ZJSON (ndjson)" }, { value: "json", text: "JSON" },
        { value: "line", text: "Line" }, { value: "tsv", text: "TSV" }
    ],
    outputFormats: [
        { value: "zjson", text: "ZJSON" }, { value: "csv", text: "CSV" },
        { value: "json", text: "JSON (single object)" }, { value: "line", text: "Line" },
        { value: "tsv", text: "TSV" }, { value: "zson", text: "ZSON" }
    ]
};
function showAppMessage(message, type = 'info', isSticky = false) {
    if (!dom.statusMessage) return;
    dom.statusMessage.textContent = message;
    dom.statusMessage.className = 'alert d-none flex-grow-1 ms-auto p-2 mb-0 text-sm';
    let alertClass = 'alert-info';
    switch (type) {
        case 'error': alertClass = 'alert-danger'; break;
        case 'success': alertClass = 'alert-success'; break;
        case 'warning': alertClass = 'alert-warning'; break;
    }
    dom.statusMessage.classList.add(alertClass);
    dom.statusMessage.classList.remove('d-none');
    if (!isSticky && (type === 'info' || type === 'success')) {
        setTimeout(() => {
            if (dom.statusMessage.textContent === message) hideAppMessage();
        }, 5000);
    }
}
function hideAppMessage() {
    if (dom.statusMessage) dom.statusMessage.classList.add('d-none');
}
function populateSelect(selectElement, options, selectedValue, valueKey = 'value', textKey = 'text') {
    if (!selectElement) return;
    selectElement.innerHTML = '';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt[valueKey] !== undefined ? opt[valueKey] : opt.template;
        option.textContent = opt[textKey] !== undefined ? opt[textKey] : opt.name;
        selectElement.appendChild(option);
    });
    if (selectedValue !== undefined) selectElement.value = selectedValue;
}
function createNewTabState(nameSuffix = tabsState.length + 1) {
    const newTabId = `tab-${nextTabId++}`;
    return {
        id: newTabId, name: `Log ${nameSuffix}`, isActive: false,
        rawData: null,
        dataLocation: { type: 'empty' },
        dataSummary: 'No data loaded.',
        query: "pass", inputFormat: "auto", outputFormat: "zjson",
        currentRawOutput: null, gridInstance: null,
        scannerRules: [], scannerRuleFileName: "No scanner rules loaded.",
        predefinedRulesSelectValue: "", scannerHitsHTML: "",
    };
}
function renderTabs() {
    dom.logTabsContainer.innerHTML = '';
    tabsState.forEach(tab => {
        const navLink = document.createElement('button');
        navLink.className = `nav-link w-100 d-flex align-items-center ${tab.isActive ? 'active' : ''}`;
        navLink.dataset.tabId = tab.id;
        navLink.id = `${tab.id}-tab`;
        navLink.type = 'button';
        navLink.setAttribute('role', 'tab');
        navLink.setAttribute('aria-selected', tab.isActive.toString());
        const tabNameSpan = document.createElement('span');
        tabNameSpan.textContent = tab.name;
        tabNameSpan.className = 'text-truncate me-auto';
        navLink.appendChild(tabNameSpan);
        if (tabsState.length > 1) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.innerHTML = '&times;';
            closeBtn.className = 'btn-close btn-close-white ms-2 p-0 px-1';
            closeBtn.style.fontSize = '0.7em';
            closeBtn.setAttribute('aria-label', 'Close Tab');
            closeBtn.dataset.tabIdToClose = tab.id;
            closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(closeBtn.dataset.tabIdToClose); };
            navLink.appendChild(closeBtn);
        }
        navLink.addEventListener('click', () => switchTab(tab.id));
        dom.logTabsContainer.appendChild(navLink);
    });
}
function getActiveTabState() {
    return tabsState.find(tab => tab.id === activeTabId);
}
function updateResultDisplay(tab) {
    if (!tab) return;
    dom.tableResultOutputContainer.classList.add('d-none');
    dom.textResultOutput.classList.add('d-none');
    dom.noResultsMessage.classList.add('d-none');
    dom.toggleViewBtn.classList.add('d-none');
    dom.pivotResultsBtn.classList.add('d-none');
    dom.exportBtn.disabled = true;
    const viewRawText = "View Raw";
    const viewTableText = "View Table";
    const hasResults = tab.currentRawOutput && tab.currentRawOutput.trim() !== "";
    if (tab.gridInstance) {
        dom.tableResultOutputContainer.classList.remove('d-none');
        dom.toggleViewBtn.textContent = viewRawText;
        dom.toggleViewBtn.classList.remove('d-none');
        dom.pivotResultsBtn.classList.remove('d-none');
        dom.exportBtn.disabled = false;
    } else if (hasResults) {
        dom.resultOutputCode.textContent = tab.currentRawOutput;
        dom.textResultOutput.classList.remove('d-none');
        const canBeTable = parseResultForTable(tab.currentRawOutput, tab.outputFormat);
        if (canBeTable && canBeTable.headers && canBeTable.headers.length > 0) {
            dom.toggleViewBtn.textContent = viewTableText;
            dom.toggleViewBtn.classList.remove('d-none');
        }
        dom.pivotResultsBtn.classList.remove('d-none');
        dom.exportBtn.disabled = false;
    } else {
        dom.noResultsMessage.classList.remove('d-none');
    }
}
async function loadTabData(tabId) {
    const tab = tabsState.find(t => t.id === tabId);
    if (!tab) { return; }
    dom.queryInput.value = tab.query;
    dom.dataInput.value = (tab.dataLocation?.type === 'memory' && tab.rawData) ? tab.rawData : '';
    dom.dataInput.placeholder = (tab.dataLocation?.type === 'indexeddb')
        ? `Large data stored in database (${tab.dataSummary}). Paste or upload to replace.`
        : "Paste log data here...";
    dom.dataInput.disabled = (tab.dataLocation?.type === 'indexeddb');
    populateSelect(dom.inputFormatSelect, config.inputFormats, tab.inputFormat);
    populateSelect(dom.outputFormatSelect, config.outputFormats, tab.outputFormat);
    dom.fileNameDisplay.textContent = tab.dataSummary;
    dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;

    if (dom.predefinedRulesSelect.options.length <= 1 && dom.predefinedRulesSelect.firstChild?.value === "") {
        await initializePredefinedRulesSelect(tab.predefinedRulesSelectValue);
    } else {
        dom.predefinedRulesSelect.value = tab.predefinedRulesSelectValue;
    }
    dom.resultOutputCode.textContent = '';
    if (tab.gridInstance) { try { tab.gridInstance.destroy(); tab.gridInstance = null; } catch(e) {} }
    dom.tableResultOutputContainer.innerHTML = '';
    updateResultDisplay(tab);
    dom.scannerHitsOutput.innerHTML = tab.scannerHitsHTML || '';
    const hasHits = tab.scannerHitsHTML && tab.scannerHitsHTML.trim() !== '';
    dom.scannerResultsPanel.classList.remove('d-none'); 
    dom.scannerHitsOutput.classList.toggle('d-none', !hasHits); 
    dom.noScannerHitsMessage.classList.toggle('d-none', hasHits); 
    const hasData = tab.dataLocation?.type === 'memory' || tab.dataLocation?.type === 'indexeddb';
    dom.runScannerBtn.disabled = !(tab.scannerRules && tab.scannerRules.length > 0 && superdbInstance && hasData);
}
function saveActiveTabData() {
    const activeTab = getActiveTabState();
    if (!activeTab) return;
    activeTab.query = dom.queryInput.value;
    if (activeTab.dataLocation?.type === 'memory') {
        activeTab.rawData = dom.dataInput.value;
    }
    activeTab.inputFormat = dom.inputFormatSelect.value;
    activeTab.outputFormat = dom.outputFormatSelect.value;
    activeTab.predefinedRulesSelectValue = dom.predefinedRulesSelect.value;
}
async function switchTab(tabId) {
    if (activeTabId === tabId && tabsState.find(t => t.id === tabId && t.isActive)) return;
    if(activeTabId) saveActiveTabData();
    tabsState.forEach(tab => tab.isActive = (tab.id === tabId));
    activeTabId = tabId;
    renderTabs();
    await loadTabData(tabId);
}
function addTab() {
    if(activeTabId) saveActiveTabData();
    const newTab = createNewTabState();
    tabsState.push(newTab);
    switchTab(newTab.id);
    if (tabsState.length === 1 && superdbInstance) {
        dom.queryInput.focus();
    }
    return newTab;
}
async function closeTab(tabIdToClose) {
    if (tabsState.length <= 1) {
        showAppMessage("Cannot close the last tab.", "warning");
        return;
    }
    const tabIndex = tabsState.findIndex(tab => tab.id === tabIdToClose);
    if (tabIndex === -1) return;
    const tabToClose = tabsState[tabIndex];
    if (tabToClose.dataLocation?.type === 'indexeddb' && tabToClose.dataLocation.key) {
        try {
            await deleteData(tabToClose.dataLocation.key);
        } catch (dbError) {
            showAppMessage(`Error deleting stored data for closed tab: ${dbError.message}`, 'error');
        }
    }
    if (tabToClose.gridInstance) {
        try { tabToClose.gridInstance.destroy(); } catch(e) { }
    }
    tabsState.splice(tabIndex, 1);
    if (scannerWorker && scannerWorker.tabId === tabIdToClose) {
        terminateScannerWorker();
    }
    if (activeTabId === tabIdToClose) {
        activeTabId = null;
        const newActiveIndex = Math.max(0, tabIndex - 1);
        if (tabsState.length > 0) {
            await switchTab(tabsState[newActiveIndex].id);
        } else {
             addTab();
        }
    } else {
        renderTabs();
    }
}
function loadQueryHistory() {
    const history = JSON.parse(localStorage.getItem('zqQueryHistory') || '[]');
    dom.queryHistorySelect.innerHTML = '';
    const placeholder = Object.assign(document.createElement('option'), {value: "", textContent: "Select from history..."});
    dom.queryHistorySelect.appendChild(placeholder);
    dom.queryHistorySelect.disabled = history.length === 0;
    if(history.length === 0) {
        placeholder.textContent = "No history yet...";
    }
    history.forEach(query => {
        const option = document.createElement('option');
        option.value = query;
        option.textContent = query.length > 60 ? query.substring(0, 57) + "..." : query;
        option.title = query;
        dom.queryHistorySelect.appendChild(option);
    });
}
function saveQueryToHistory(query) {
    if (!query || !query.trim()) return;
    let history = JSON.parse(localStorage.getItem('zqQueryHistory') || '[]');
    history = history.filter(item => item !== query);
    history.unshift(query);
    if (history.length > MAX_HISTORY_ITEMS) history.pop();
    localStorage.setItem('zqQueryHistory', JSON.stringify(history));
    loadQueryHistory();
}
function clearQueryHistory() {
    localStorage.removeItem('zqQueryHistory');
    loadQueryHistory();
    showAppMessage('Query history shredded, Gutmann style (35x).', 'info');
}
function parseAndSetScannerRules(yamlContent, fileName, tab) {
    try {
        const rulesData = jsyaml.load(yamlContent);
        if (rulesData && Array.isArray(rulesData.rules)) {
            tab.scannerRules = rulesData.rules.filter(rule => rule.name && rule.query);
            if (tab.scannerRules.length > 0) {
                tab.scannerRuleFileName = `Loaded: ${fileName} (${tab.scannerRules.length} rules)`;
                showAppMessage(`Scanner rules from "${fileName}" loaded: ${tab.scannerRules.length} rules.`, 'success');
            } else {
                tab.scannerRuleFileName = `File "${fileName}" contained no valid rules.`;
                showAppMessage(`No valid rules in "${fileName}". Ensure 'name' and 'query' for each rule.`, 'warning');
            }
        } else {
            throw new Error("YAML structure incorrect. Expected a 'rules' array with 'name' and 'query' for each rule.");
        }
    } catch (e) {
        tab.scannerRules = [];
        tab.scannerRuleFileName = `Error loading ${fileName}.`;
        showAppMessage(`Error parsing scanner file "${fileName}": ${e.message}`, 'error', true);
    }
    dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
    const hasData = tab.dataLocation?.type === 'memory' || tab.dataLocation?.type === 'indexeddb';
    dom.runScannerBtn.disabled = !(tab.scannerRules.length > 0 && superdbInstance && hasData);
}
async function loadScannerRulesFromFile(filePath, ruleSetName, tab) {
    try {
        if (!filePath || filePath.startsWith("rules/Select")) {
             showAppMessage(`Cannot load example rules for "${ruleSetName}" as path is a placeholder: ${filePath}`, 'warning', true);
             return;
        }
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching ${ruleSetName} from ${filePath}`);
        }
        const yamlContent = await response.text();
        parseAndSetScannerRules(yamlContent, ruleSetName, tab);
    } catch (e) {
        tab.scannerRules = [];
        tab.scannerRuleFileName = `Failed to load ${ruleSetName}.`;
        dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
        showAppMessage(`Failed to load rules "${ruleSetName}": ${e.message}. Check path and file.`, 'error', true);
        const hasData = tab.dataLocation?.type === 'memory' || tab.dataLocation?.type === 'indexeddb';
        dom.runScannerBtn.disabled = !(tab.scannerRules.length > 0 && superdbInstance && hasData);
    }
}
function parseCsvLine(text) {
    const result = [];
    let currentField = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && i + 1 < text.length && text[i+1] === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }
    result.push(currentField);
    return result;
}
function parseResultForTable(resultText, actualOutputFormat) {
    const lines = resultText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return null;
    let headers = [];
    let dataRows = [];
    const typeDefinitions = {};
    try {
        if (actualOutputFormat === 'zjson') {
            const jsonDataObjects = [];
            const allPossibleHeaders = new Set();
            lines.forEach(line => {
                try {
                    const record = JSON.parse(line);
                    jsonDataObjects.push(record);
                    if (record.type && record.type.kind === 'record' && record.type.fields) {
                        typeDefinitions[record.type.id] = record.type.fields.map(f => f.name);
                        record.type.fields.forEach(f => allPossibleHeaders.add(f.name));
                    } else if (record.type && record.type.kind === 'ref' && typeDefinitions[record.type.id]) {
                        typeDefinitions[record.type.id].forEach(fieldName => allPossibleHeaders.add(fieldName));
                    } else if (typeof record === 'object' && record !== null && !record.type) {
                        Object.keys(record).forEach(k => allPossibleHeaders.add(k));
                    }
                } catch (parseError) {
                }
            });
            headers = Array.from(allPossibleHeaders);
            if (headers.length === 0 && jsonDataObjects.length > 0 && typeof jsonDataObjects[0] !== 'object') {
                 headers.push("value");
            }
            jsonDataObjects.forEach(record => {
                let currentSchemaFields;
                let valuesToMap = record.value;
                if (record.type && record.type.kind === 'record') {
                    currentSchemaFields = record.type.fields.map(f => f.name);
                } else if (record.type && record.type.kind === 'ref' && typeDefinitions[record.type.id]) {
                    currentSchemaFields = typeDefinitions[record.type.id];
                } else if (typeof record === 'object' && record !== null && !record.type) {
                    currentSchemaFields = Object.keys(record);
                    valuesToMap = record;
                } else {
                    if (headers.includes("value")) {
                        dataRows.push(headers.map(h => (h === "value") ? String(record) : ''));
                    }
                    return;
                }
                if (currentSchemaFields && (Array.isArray(valuesToMap) || (typeof valuesToMap === 'object' && valuesToMap !== null))) {
                    const rowObject = {};
                    if (Array.isArray(valuesToMap)) {
                        currentSchemaFields.forEach((fieldName, idx) => {
                            rowObject[fieldName] = valuesToMap[idx];
                        });
                    } else {
                         currentSchemaFields.forEach(fieldName => {
                            rowObject[fieldName] = valuesToMap[fieldName];
                        });
                    }
                    dataRows.push(headers.map(h => String(rowObject[h] !== undefined ? rowObject[h] : '')));
                } else if (currentSchemaFields && headers.length === currentSchemaFields.length && !valuesToMap && typeof record === 'object' && record !== null) {
                     dataRows.push(headers.map(h => String(record[h] !== undefined ? record[h] : '')));
                }
            });
        } else if (actualOutputFormat === 'csv') {
            if (lines.length > 0) {
                headers = parseCsvLine(lines[0]);
                dataRows = lines.slice(1).map(line => {
                    const parsedLine = parseCsvLine(line);
                    const rowArray = [];
                    for (let i = 0; i < headers.length; i++) {
                        rowArray.push(parsedLine[i] !== undefined ? String(parsedLine[i]) : '');
                    }
                    return rowArray;
                });
            }
        } else {
            return null;
        }
        if (headers.length === 0 && dataRows.length === 0) return null;
        if (headers.length === 0 && dataRows.length > 0) {
            headers = ["value"];
            dataRows = dataRows.map(row => [String(row[0] !== undefined ? row[0] : (Array.isArray(row) ? row.join(", ") : row) )]);
        }
        return { headers, dataRows };
    } catch (e) {
        return null;
    }
}
function displayTableWithGridJs(parsedData, containerElement, tab) {
    if (tab.gridInstance) {
        try {
            tab.gridInstance.destroy();
        } catch (e) {
            console.error("Error destroying previous grid instance:", e);
        } finally {
            tab.gridInstance = null;
        }
    }

    if (!parsedData || !parsedData.headers || parsedData.headers.length === 0 || !parsedData.dataRows) {
        containerElement.classList.add('d-none');
        containerElement.innerHTML = '';
        return null;
    }

    if (typeof gridjs === 'undefined') {
        showAppMessage("Error: Table library (Grid.js) not loaded.", "error", true);
        return null;
    }

    const { headers, dataRows } = parsedData;

    containerElement.innerHTML = '';
    containerElement.className = 'gridjs-dark-theme'; 
    const gridColumns = headers.map(header => ({
        name: String(header),
        id: String(header).toLowerCase().replace(/\s+/g, '_')
    }));

    try {
        tab.gridInstance = new gridjs.Grid({
            columns: gridColumns,
            data: dataRows,
            search: {
                debounceTimeout: 250
            },
            sort: true,
            pagination: {
                enabled: true,
                limit: 100,
                summary: true
            },
            resizable: true,
            fixedHeader: true,
            height: '60vh',
        }).render(containerElement);

        containerElement.classList.remove('d-none');
        return tab.gridInstance;

    } catch (gridError) {
        showAppMessage(`Error displaying results table: ${gridError.message}`, 'error', true);
        containerElement.innerHTML = `<div class="alert alert-danger">Failed to render results table.</div>`;
        containerElement.classList.remove('d-none');
        return null;
    }
}
async function handleNewData(tab, data, sourceName) {
    const dataSize = (typeof data === 'string') ? data.length : 0;
    const isLarge = dataSize > LARGE_DATA_THRESHOLD;
    const displaySize = (dataSize / (1024 * 1024)).toFixed(2) + ' MB';
    const summary = `${sourceName} (${displaySize})`;
    if (tab.dataLocation?.type === 'indexeddb' && tab.dataLocation.key) {
        try {
            await deleteData(tab.dataLocation.key);
        } catch (e) {
        }
    }
    tab.dataSummary = summary;
    dom.fileNameDisplay.textContent = summary;
    if (isLarge) {
        tab.rawData = null;
        dom.dataInput.value = '';
        dom.dataInput.placeholder = `Large data (${displaySize}) stored in database. Paste or upload to replace.`;
        dom.dataInput.disabled = true;
        showAppMessage(`Storing large data (${displaySize}) in database...`, 'info', true);
        try {
            await saveData(tab.id, data);
            tab.dataLocation = { type: 'indexeddb', key: tab.id };
            showAppMessage(`Data "${sourceName}" (${displaySize}) stored successfully.`, 'success');
            const hasRules = tab.scannerRules && tab.scannerRules.length > 0;
            dom.runScannerBtn.disabled = !(hasRules && superdbInstance);
        } catch (dbError) {
            showAppMessage(`Failed to store large data: ${dbError.message}`, 'error', true);
            tab.dataLocation = { type: 'error' };
            tab.dataSummary = `Error storing ${sourceName}`;
            dom.fileNameDisplay.textContent = tab.dataSummary;
            dom.runScannerBtn.disabled = true;
        }
    } else {
        tab.rawData = data;
        tab.dataLocation = { type: 'memory' };
        dom.dataInput.value = data;
        dom.dataInput.placeholder = "Paste log data here...";
        dom.dataInput.disabled = false;
        showAppMessage(`Data "${sourceName}" loaded into memory.`, 'info');
        const hasRules = tab.scannerRules && tab.scannerRules.length > 0;
        dom.runScannerBtn.disabled = !(hasRules && superdbInstance);
    }
}
async function applyShaperScriptHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !superdbInstance) {
        showAppMessage(superdbInstance ? "No active tab." : "SuperDB not ready.", 'error', true);
        return;
    }

    const hasData = activeTab.dataLocation?.type === 'memory' || activeTab.dataLocation?.type === 'indexeddb';
    if (!hasData) {
        showAppMessage("No data loaded to apply a shaper script to.", "warning", true);
        return;
    }

    const selectedShaperFile = dom.shaperScriptsSelect.value;
    if (!selectedShaperFile) {
        showAppMessage("Please select a valid shaper script to apply.", "warning");
        return;
    }
    
    dom.applyShaperBtn.disabled = true;
    dom.applyShaperBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Applying...';

    try {
        const response = await fetch(`shapers/${selectedShaperFile}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching ${selectedShaperFile}`);
        }
        const yamlContent = await response.text();
        const selectedShaper = jsyaml.load(yamlContent);

        if (!selectedShaper || !selectedShaper.query || !selectedShaper.inputFormat || !selectedShaper.outputFormat) {
            throw new Error(`Invalid shaper file format for ${selectedShaperFile}.`);
        }
        
        showAppMessage(`Applying shaper: "${selectedShaper.name || selectedShaperFile}"...`, 'info', true);

        let inputForWasm = null;
        let dataLoadError = null;
        if (activeTab.dataLocation?.type === 'indexeddb' && activeTab.dataLocation.key) {
            try {
                inputForWasm = await getDataAsStream(activeTab.dataLocation.key);
            } catch (dbError) {
                dataLoadError = `Failed to stream data from DB: ${dbError.message}`;
            }
        } else if (activeTab.dataLocation?.type === 'memory') {
            inputForWasm = activeTab.rawData;
        }

        if (dataLoadError) throw new Error(dataLoadError);

        const result = await superdbInstance.run({
            query: selectedShaper.query,
            input: inputForWasm,
            inputFormat: selectedShaper.inputFormat,
            outputFormat: selectedShaper.outputFormat
        });

        const originalFileName = activeTab.name.split(' (')[0].replace(/\.(json|csv|log|txt|evtx|zjson|tsv|zson)$/i, '');
        await handleNewData(activeTab, result, `${originalFileName} (Shaped)`);
        
        activeTab.inputFormat = selectedShaper.outputFormat;
        dom.inputFormatSelect.value = selectedShaper.outputFormat;
        activeTab.query = 'pass';
        dom.queryInput.value = 'pass';
        
        showAppMessage(`Shaper "${selectedShaper.name}" applied. Data transformed to ${selectedShaper.outputFormat.toUpperCase()}.`, 'success');

    } catch (error) {
        showAppMessage(`Error applying shaper: ${error.message}`, 'error', true);
    } finally {
        dom.applyShaperBtn.disabled = false;
        dom.applyShaperBtn.textContent = 'Apply';
    }
}
function setupEventListeners() {
    dom.applyShaperBtn.addEventListener('click', applyShaperScriptHandler);
    dom.fileInput.addEventListener('change', async (event) => {
        const activeTab = getActiveTabState();
        if (!activeTab) return;
        const file = event.target.files[0];
        if (file) {
            const oldTabName = activeTab.name;
            activeTab.name = file.name; 
            if (oldTabName !== activeTab.name) renderTabs();

            if (file.name.toLowerCase().endsWith('.evtx')) {
                if (!evtxWasmReady) {
                    showAppMessage("EVTX converter is not ready. Please try again.", "error", true);
                    return;
                }
                showAppMessage("Converting EVTX file to JSON... This may take a moment.", "info", true);
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const evtxData = new Uint8Array(e.target.result);
                        const jsonResult = await goEvtxToJSON(evtxData);
                        await handleNewData(activeTab, jsonResult, file.name.replace(/\.evtx$/i, '.json'));
                        activeTab.inputFormat = 'json'; 
                        dom.inputFormatSelect.value = 'json';
                        showAppMessage("EVTX file successfully converted and loaded.", "success");
                    } catch (error) {
                        showAppMessage(`Error converting EVTX file: ${error.message}`, 'error', true);
                    }
                };
                reader.onerror = () => {
                    showAppMessage(`Error reading EVTX file: ${file.name}.`, 'error', true);
                };
                reader.readAsArrayBuffer(file);
            } else {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        await handleNewData(activeTab, e.target.result, file.name);
                    } catch (error) {
                        showAppMessage(`Error processing file data: ${error.message}`, 'error', true);
                    }
                };
                reader.onerror = () => {
                    showAppMessage(`Error reading data file: ${file.name}.`, 'error', true);
                    activeTab.dataSummary = "File load error.";
                    dom.fileNameDisplay.textContent = activeTab.dataSummary;
                    activeTab.dataLocation = { type: 'error' };
                };
                reader.readAsText(file);
            }
        }
        dom.fileInput.value = ""; 
    });
    dom.loadTestDataBtn.addEventListener('click', async () => {
        const activeTab = getActiveTabState();
        if (!activeTab) {
            showAppMessage("No active tab to load data into.", "warning");
            return;
        }
        const testDataPath = 'test_data.csv';
        try {
            showAppMessage(`Loading ${testDataPath}...`, 'info');
            const response = await fetch(testDataPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} while fetching ${testDataPath}`);
            }
            const csvData = await response.text();
            const oldTabName = activeTab.name;
            activeTab.name = testDataPath;
            if (oldTabName !== activeTab.name) renderTabs();
            await handleNewData(activeTab, csvData, testDataPath);
            dom.inputFormatSelect.value = 'csv';
            activeTab.inputFormat = 'csv';
            showAppMessage(`${testDataPath} loaded successfully. Input format set to CSV.`, 'success');
        } catch (error) {
            showAppMessage(`Failed to load ${testDataPath}: ${error.message}`, 'error', true);
            activeTab.dataSummary = `Failed to load ${testDataPath}.`;
            dom.fileNameDisplay.textContent = activeTab.dataSummary;
            activeTab.dataLocation = { type: 'error' };
        }
    });
    dom.dataInput.addEventListener('input', () => {
         const activeTab = getActiveTabState();
         if (activeTab && activeTab.dataLocation?.type === 'memory') {
             activeTab.rawData = dom.dataInput.value;
         }
    });
    dom.dataInput.addEventListener('paste', async (event) => {
        const activeTab = getActiveTabState();
        if (!activeTab) return;
        event.preventDefault();
        const pastedData = (event.clipboardData || window.clipboardData).getData('text');
        await handleNewData(activeTab, pastedData, 'Pasted Data');
    });
    dom.queryInput.addEventListener('input', () => { const t = getActiveTabState(); if (t) t.query = dom.queryInput.value; });
    dom.inputFormatSelect.addEventListener('change', () => { const t = getActiveTabState(); if (t) t.inputFormat = dom.inputFormatSelect.value; });
    dom.outputFormatSelect.addEventListener('change', () => { const t = getActiveTabState(); if (t) t.outputFormat = dom.outputFormatSelect.value; });
    dom.scannerRuleFileInput.addEventListener('change', (event) => {
        const activeTab = getActiveTabState(); if (!activeTab) return;
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { parseAndSetScannerRules(e.target.result, file.name, activeTab); };
            reader.onerror = (e) => {
                showAppMessage(`Error reading rule file: ${file.name}.`, 'error', true);
                activeTab.scannerRuleFileName = "Rule file load error.";
                dom.scannerRuleFileNameDisplay.textContent = activeTab.scannerRuleFileName;
            };
            reader.readAsText(file);
        }
        dom.scannerRuleFileInput.value = "";
    });
    dom.loadPredefinedRuleBtn.addEventListener('click', () => {
        const activeTab = getActiveTabState(); if (!activeTab) return;
        const selectedFileName = dom.predefinedRulesSelect.value;
        if (selectedFileName) {
            const selectedOptionText = dom.predefinedRulesSelect.options[dom.predefinedRulesSelect.selectedIndex].text;
            const filePath = `rules/${selectedFileName}`;
            loadScannerRulesFromFile(filePath, selectedOptionText, activeTab);
            activeTab.predefinedRulesSelectValue = selectedFileName;
        } else {
            showAppMessage('Please select a predefined rule set to load.', 'warning');
        }
    });
    dom.queryHistorySelect.addEventListener('change', (event) => {
        const activeTab = getActiveTabState(); if (!activeTab) return;
        if (event.target.value) {
            dom.queryInput.value = event.target.value;
            activeTab.query = event.target.value;
            showAppMessage('Query loaded from history.', 'info');
        }
    });
    dom.clearHistoryBtn.addEventListener('click', clearQueryHistory);
    dom.addTabBtn.addEventListener('click', addTab);
    dom.runQueryBtn.addEventListener('click', runQueryHandler);
    dom.exportBtn.addEventListener('click', exportResultsHandler);
    dom.runScannerBtn.addEventListener('click', runScannerHandler);
    dom.toggleViewBtn.addEventListener('click', toggleResultsViewHandler);
    dom.pivotResultsBtn.addEventListener('click', handlePivotResultsToNewTab);
    dom.cancelScanBtn.addEventListener('click', cancelScanHandler);

    if (dom.focusModeBtn) {
        dom.focusModeBtn.addEventListener('click', toggleFocusModeHandler);
    }

    dom.scannerHitsOutput.addEventListener('click', (event) => {
        const pivotButton = event.target.closest('.pivot-button');
        if (pivotButton) {
            const ruleName = pivotButton.dataset.ruleName;
            const ruleQuery = pivotButton.dataset.ruleQuery;
            const sourceTabId = pivotButton.dataset.sourceTabId;
            handlePivotToNewTab(sourceTabId, ruleName, ruleQuery);
            return;
        }
        const investigateButton = event.target.closest('.investigate-button');
        if (investigateButton) {
            const ruleQuery = investigateButton.dataset.ruleQuery;
            handleInvestigateInPlace(ruleQuery);
        }
    });
}
async function runQueryHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !superdbInstance) {
        showAppMessage(superdbInstance ? "No active tab." : "SuperDB not ready.", 'error', true); return;
    }
    let query = activeTab.query.trim();
    let inputForWasm = null;
    let dataLoadError = null;
    if (activeTab.dataLocation?.type === 'indexeddb' && activeTab.dataLocation.key) {
        showAppMessage("Preparing large data stream for query...", 'info', true);
        try {
            inputForWasm = await getDataAsStream(activeTab.dataLocation.key);
            hideAppMessage();
        } catch (dbError) {
            dataLoadError = `Failed to stream data from DB: ${dbError.message}`;
        }
    } else if (activeTab.dataLocation?.type === 'memory') {
        inputForWasm = activeTab.rawData;
    }
    if (dataLoadError) {
         showAppMessage(dataLoadError, 'error', true);
         return;
    }

    if (!inputForWasm && activeTab.dataLocation?.type === 'empty') {
        if (query !== 'pass') {
            showAppMessage("No data available to run the query.", 'warning');
            return;
        }
        inputForWasm = '';
    }

    saveQueryToHistory(query);
    if (!query && inputForWasm) { query = "pass"; activeTab.query = "pass"; dom.queryInput.value = "pass"; }
    if (!query && !inputForWasm && activeTab.dataLocation?.type === 'empty') { query = "pass"; activeTab.query = "pass"; dom.queryInput.value = "pass"; inputForWasm = "";}


    activeTab.currentRawOutput = null;
    if (activeTab.gridInstance) { try {activeTab.gridInstance.destroy();} catch(e){} activeTab.gridInstance = null; }
    updateResultDisplay(activeTab);
    dom.runQueryBtn.disabled = true;
    dom.runScannerBtn.disabled = true;
    dom.runQueryBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Running...';
    hideAppMessage();
    try {
        const result = await superdbInstance.run({
            query: query,
            input: inputForWasm,
            inputFormat: activeTab.inputFormat,
            outputFormat: activeTab.outputFormat
        });
        activeTab.currentRawOutput = result;
        const tableData = parseResultForTable(result, activeTab.outputFormat);
        if (tableData && tableData.headers && tableData.headers.length > 0) {
            displayTableWithGridJs(tableData, dom.tableResultOutputContainer, activeTab);
        } else {
            if (activeTab.gridInstance) { try {activeTab.gridInstance.destroy();} catch(e){} activeTab.gridInstance = null; }
        }
        updateResultDisplay(activeTab);
    } catch (error) {
        activeTab.currentRawOutput = `Error: ${error.message || String(error)}`;
        if (activeTab.gridInstance) { try {activeTab.gridInstance.destroy();} catch(e){} activeTab.gridInstance = null; }
        updateResultDisplay(activeTab);
        showAppMessage(`Query failed: ${error.message || String(error)}`, 'error', true);
    } finally {
        dom.runQueryBtn.disabled = false;
        const hasData = activeTab.dataLocation?.type === 'memory' || activeTab.dataLocation?.type === 'indexeddb';
        dom.runScannerBtn.disabled = !(activeTab.scannerRules && activeTab.scannerRules.length > 0 && superdbInstance && hasData);
        dom.runQueryBtn.textContent = 'Run Query';
    }
}
function toggleResultsViewHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !activeTab.currentRawOutput) return;
    if (activeTab.gridInstance) {
        try { activeTab.gridInstance.destroy(); } catch(e){}
        activeTab.gridInstance = null;
    } else {
        const tableData = parseResultForTable(activeTab.currentRawOutput, activeTab.outputFormat);
        if (tableData && tableData.headers && tableData.headers.length > 0) {
            displayTableWithGridJs(tableData, dom.tableResultOutputContainer, activeTab);
        } else {
            showAppMessage('Cannot display as table. Output might be an error or unsuitable format.', 'warning');
        }
    }
    updateResultDisplay(activeTab);
}
function toggleFocusModeHandler() {
    document.body.classList.toggle('focus-mode');
    const icon = dom.focusModeBtn.querySelector('i');
    if (document.body.classList.contains('focus-mode')) {
        dom.focusModeBtn.title = "Exit Focus Mode";
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
    } else {
        dom.focusModeBtn.title = "Toggle Focus Mode";
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
    }
}
async function exportResultsHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !activeTab.currentRawOutput) {
        showAppMessage("No results to export.", 'info');
        return;
    }
    const {outputFormat, currentRawOutput, name} = activeTab;
    let fileExtension = outputFormat, mimeType = 'text/plain';
    switch (outputFormat) {
        case 'csv': mimeType = 'text/csv'; break;
        case 'json': mimeType = 'application/json'; break;
        case 'zjson': mimeType = 'application/x-ndjson'; fileExtension = 'zjson'; break;
        case 'tsv': mimeType = 'text/tab-separated-values'; fileExtension = 'tsv'; break;
        case 'zson': mimeType = 'application/zson'; break;
        case 'line': fileExtension = 'txt'; break;
    }
    try {
        const blob = new Blob([currentRawOutput], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = name.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 30);
        a.download = `results_${safeName}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAppMessage(`Results exported as ${a.download}.`, 'success');
    } catch (error) {
        showAppMessage(`Export error: ${error.message}`, 'error', true);
    }
}
function terminateScannerWorker() {
    if (scannerWorker) {
        scannerWorker.terminate();
        scannerWorker = null;
        const activeTab = getActiveTabState();
        const hasData = activeTab?.dataLocation?.type === 'memory' || activeTab?.dataLocation?.type === 'indexeddb';
        dom.runScannerBtn.disabled = !(activeTab?.scannerRules?.length > 0 && superdbInstance && hasData);
        dom.runQueryBtn.disabled = !superdbInstance;
        dom.cancelScanBtn.classList.add('d-none');
        dom.scanProgress.classList.add('d-none');
        dom.runScannerBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass me-2"></i>Run Scanner';
    }
}
function handleWorkerMessage(event) {
    const { type, ...data } = event.data;
    const activeTab = getActiveTabState();
    if (!scannerWorker || !activeTab || activeTab.id !== scannerWorker.tabId) {
        if (type.includes('complete') || type.includes('error') || type === 'cancelled') {
             if(scannerWorker && type !== 'cancelled') {
                terminateScannerWorker();
             }
        }
        return;
    }
    switch (type) {
        case 'init_done':
            if (scannerWorker && scannerWorker.pendingStartData) {
                 scannerWorker.postMessage({ type: 'start', ...scannerWorker.pendingStartData });
                 delete scannerWorker.pendingStartData;
                 dom.runScannerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Scanning...';
            }
            break;
        case 'init_error':
        case 'critical_error':
            const errorPrefix = type === 'init_error' ? 'Scanner Worker Init Error' : 'Scanner Worker Critical Error';
            showAppMessage(`${errorPrefix}: ${data.message}`, 'error', true);
            terminateScannerWorker();
            break;
        case 'progress':
            dom.scanProgress.textContent = `Scanning ${data.processed}/${data.total}...`;
            break;
        case 'progress_detail':
            dom.scanProgress.textContent = data.message || 'Scanning...';
            break;
        case 'scanner_hit':
            if (activeTab && data.hit) {
                const hit = data.hit;
                const trimmedResult = typeof hit.result === 'string' ? hit.result.trim() : '';
                if (hit.result && typeof hit.result === 'string' && trimmedResult && trimmedResult !== "[]" && trimmedResult !== "{}") {
                    const hitDiv = document.createElement('div');
                    hitDiv.className = "mb-3 pb-3 border-bottom border-secondary-subtle last:border-bottom-0";
                    hitDiv.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start">
                            <strong class="text-info d-block mb-1 small">Hit for Rule: "${hit.ruleName}"</strong>
                            <div>
                                <button class="btn btn-outline-primary btn-sm py-0 px-1 investigate-button"
                                        data-rule-query="${encodeURIComponent(hit.query)}"
                                        title="Load rule query in the editor and run it in the current tab">
                                    Investigate
                                </button>
                                <button class="btn btn-outline-info btn-sm py-0 px-1 ms-1 pivot-button"
                                        data-rule-name="${hit.ruleName}"
                                        data-rule-query="${encodeURIComponent(hit.query)}"
                                        data-source-tab-id="${activeTab.id}"
                                        title="Run this rule query in a new tab">
                                    Pivot &raquo;
                                </button>
                            </div>
                        </div>
                        <p class="mb-1 small text-body-secondary scanner-hit-query">Query: <code class="text-light small">${hit.query}</code></p>
                        <div class="scanner-hit-result">
                            <pre class="small m-0"><code>${hit.result.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
                        </div>`;
                    dom.noScannerHitsMessage.classList.add('d-none');
                    dom.scannerHitsOutput.classList.remove('d-none');
                    dom.scannerHitsOutput.appendChild(hitDiv);
                    dom.scannerHitsOutput.scrollTop = dom.scannerHitsOutput.scrollHeight;
                    activeTab.scannerHitsHTML = dom.scannerHitsOutput.innerHTML;
                }
            }
            break;
        case 'scanner_error':
             if (activeTab && data.error) {
                const error = data.error;
                const errorDiv = document.createElement('div');
                errorDiv.className = "mb-3 pb-3 border-bottom border-secondary-subtle last:border-bottom-0 text-danger";
                errorDiv.innerHTML = `<strong>Error for Rule: "${error.ruleName}"</strong><br><small class="small">${error.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</small>`;
                dom.noScannerHitsMessage.classList.add('d-none');
                dom.scannerHitsOutput.classList.remove('d-none');
                dom.scannerHitsOutput.appendChild(errorDiv);
                dom.scannerHitsOutput.scrollTop = dom.scannerHitsOutput.scrollHeight;
                activeTab.scannerHitsHTML = dom.scannerHitsOutput.innerHTML;
             }
            break;
        case 'scanner_batch_results':
            if (activeTab) {
                let displayedHits = 0;
                (data.hits || []).forEach(hit => {
                    const trimmedResult = typeof hit.result === 'string' ? hit.result.trim() : '';
                    if (hit.result && typeof hit.result === 'string' && trimmedResult && trimmedResult !== "[]" && trimmedResult !== "{}") {
                        displayedHits++;
                        const hitDiv = document.createElement('div');
                        hitDiv.className = "mb-3 pb-3 border-bottom border-secondary-subtle last:border-bottom-0";
                        hitDiv.innerHTML = `
                            <div class="d-flex justify-content-between align-items-start">

    <strong class="text-info d-block mb-1 small me-3">Hit for Rule: "${hit.ruleName}"</strong>

    <div class="flex-shrink-0">
        <button class="btn btn-outline-primary btn-sm py-0 px-1 investigate-button"
                data-rule-query="${encodeURIComponent(hit.query)}"
                title="Load rule query in the editor and run it in the current tab">
            Investigate
        </button>
        <button class="btn btn-outline-info btn-sm py-0 px-1 ms-1 pivot-button"
                data-rule-name="${hit.ruleName}"
                data-rule-query="${encodeURIComponent(hit.query)}"
                data-source-tab-id="${activeTab.id}"
                title="Run this rule query in a new tab">
            Pivot &raquo;
        </button>
    </div>
</div>

<div class="scanner-hit-result">
    <pre class="small m-0"><code>${hit.result.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
</div>`;
                        dom.scannerHitsOutput.appendChild(hitDiv);
                    }
                });
                 (data.errors || []).forEach(error => {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = "mb-3 pb-3 border-bottom border-secondary-subtle last:border-bottom-0 text-danger";
                    errorDiv.innerHTML = `<strong>Error for Rule: "${error.ruleName}"</strong><br><small class="small">${error.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</small>`;
                    dom.scannerHitsOutput.appendChild(errorDiv);
                });
                if (dom.scannerHitsOutput.children.length > 0) {
                    dom.noScannerHitsMessage.classList.add('d-none');
                    dom.scannerHitsOutput.classList.remove('d-none');
                }
                dom.scannerHitsOutput.scrollTop = dom.scannerHitsOutput.scrollHeight;
                activeTab.scannerHitsHTML = dom.scannerHitsOutput.innerHTML;
            }
            break;
        case 'cancelled':
            showAppMessage('Scan cancelled by user.', 'warning', true);
            terminateScannerWorker();
            break;
        case 'complete':
            if (activeTab) {
                if (dom.scannerHitsOutput.children.length === 0) {
                    dom.noScannerHitsMessage.classList.remove('d-none');
                    dom.scannerHitsOutput.classList.add('d-none');
                }

                if (data.hitsFound === 0 && !data.errorsOccurred) {
                    showAppMessage(`Scanner finished. No hits found. ${data.isStreamed ? "(Streamed)" : "(Batched)"}`, 'success');
                } else if (data.hitsFound > 0 && dom.scannerHitsOutput.children.length > 0) {
                    showAppMessage(`Scanner finished. Displaying ${dom.scannerHitsOutput.children.length} hit(s). ${data.errorsOccurred ? 'Some rules had errors.' : ''} ${data.isStreamed ? "(Streamed)" : "(Batched)"}`, data.errorsOccurred ? 'warning' : 'success');
                } else if (data.hitsFound > 0 && dom.scannerHitsOutput.children.length === 0) {
                    showAppMessage(`Scanner finished. ${data.hitsFound} potential hit(s) found by worker, but none met display criteria. ${data.errorsOccurred ? 'Some rules had errors.' : ''} ${data.isStreamed ? "(Streamed)" : "(Batched)"}`, data.errorsOccurred ? 'warning' : 'info');
                }
                 else if (data.errorsOccurred) {
                    showAppMessage(`Scanner finished with errors. See details. ${data.isStreamed ? "(Streamed)" : "(Batched)"}`, 'error');
                 } else {
                      showAppMessage(`Scanner finished. ${data.isStreamed ? "(Streamed)" : "(Batched)"}`, 'info');
                 }
            }
            terminateScannerWorker();
            break;
        default:
    }
}
function runScannerHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !superdbInstance) {
        showAppMessage(superdbInstance ? "No active tab." : "SuperDB not ready.", 'error', true);
        return;
    }
    if (!activeTab.scannerRules || activeTab.scannerRules.length === 0) {
        showAppMessage("No scanner rules loaded. Upload or select predefined rules.", 'warning', true);
        return;
    }
    const hasData = activeTab.dataLocation?.type === 'memory' || activeTab.dataLocation?.type === 'indexeddb';
    if (!hasData) {
        showAppMessage("No data available to scan. Paste or upload data first.", 'warning', true);
        return;
    }
    terminateScannerWorker();
    activeTab.scannerHitsHTML = '';
    dom.scannerHitsOutput.innerHTML = '';
    dom.noScannerHitsMessage.classList.remove('d-none'); 
    dom.scannerHitsOutput.classList.add('d-none');   
    dom.scannerResultsPanel.classList.remove('d-none');
    dom.scanProgress.classList.remove('d-none');
    dom.scanProgress.textContent = 'Initializing scanner...';
    hideAppMessage();
    dom.runScannerBtn.disabled = true;
    dom.runQueryBtn.disabled = true;
    dom.cancelScanBtn.classList.remove('d-none');
    dom.runScannerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Starting...';
    const startData = {
        rules: activeTab.scannerRules,
        inputFormat: activeTab.inputFormat,
        wasmPath: "superdb.wasm"
    };
    if (activeTab.dataLocation?.type === 'indexeddb' && activeTab.dataLocation.key) {
        startData.dataLocation = { type: 'indexeddb', key: activeTab.dataLocation.key };
    } else if (activeTab.dataLocation?.type === 'memory') {
        startData.data = activeTab.rawData;
    } else {
        showAppMessage("Invalid data state for scanning.", 'error', true);
        terminateScannerWorker();
        return;
    }
    try {
        scannerWorker = new Worker('scanner.worker.js', { type: 'module' });
        scannerWorker.onerror = (error) => {
            const errorMessage = `Scanner Worker failed: ${error.message || 'Unknown error'}. Check console.`;
            showAppMessage(errorMessage, 'error', true);
            terminateScannerWorker();
        };
        scannerWorker.onmessage = handleWorkerMessage;
        scannerWorker.tabId = activeTab.id;
        scannerWorker.pendingStartData = startData;
        scannerWorker.postMessage({ type: 'init', wasmPath: startData.wasmPath });
    } catch (error) {
        showAppMessage(`Failed to start scanner: ${error.message}`, 'error', true);
        terminateScannerWorker();
    }
}
function cancelScanHandler() {
    if (scannerWorker) {
        showAppMessage("Attempting to cancel scan...", "warning");
        scannerWorker.postMessage({ type: 'cancel' });
    }
}
function handleInvestigateInPlace(encodedRuleQuery) {
    const activeTab = getActiveTabState();
    if (!activeTab) {
        showAppMessage("Cannot investigate, no active tab found.", "error", true);
        return;
    }
    const ruleQuery = decodeURIComponent(encodedRuleQuery);
    dom.queryInput.value = ruleQuery;
    activeTab.query = ruleQuery;
    dom.shaperScriptsSelect.value = "";
    showAppMessage(`Query loaded into editor. Running...`, 'info');
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
    runQueryHandler();
}
function handlePivotToNewTab(sourceTabId, ruleName, encodedRuleQuery) {
    const sourceTab = tabsState.find(tab => tab.id === sourceTabId);
    if (!sourceTab) {
        showAppMessage("Could not find the original tab data for pivoting.", "error", true);
        return;
    }
    const ruleQuery = decodeURIComponent(encodedRuleQuery);
    const newTab = addTab();
    const newTabId = newTab.id;
    newTab.name = `Pivot: ${ruleName.substring(0, 15)}${ruleName.length > 15 ? '...' : ''}`;
    newTab.query = ruleQuery;
    newTab.inputFormat = sourceTab.inputFormat;
    newTab.outputFormat = sourceTab.outputFormat;
    newTab.dataLocation = sourceTab.dataLocation;
    newTab.dataSummary = sourceTab.dataSummary;
    if (sourceTab.dataLocation?.type === 'memory') {
        newTab.rawData = sourceTab.rawData;
    }
    switchTab(newTabId).then(() => {
        setTimeout(() => {
            if (activeTabId === newTabId) {
                 runQueryHandler();
            }
        }, 50);
    });
    showAppMessage(`Pivoted to new tab with query for rule "${ruleName}".`, 'info');
}
async function handlePivotResultsToNewTab() {
    const sourceTab = getActiveTabState();
    if (!sourceTab || !sourceTab.currentRawOutput || !sourceTab.currentRawOutput.trim()) {
        showAppMessage("No results available to pivot.", "warning");
        return;
    }
    const newTab = addTab();
    const newTabId = newTab.id;
    newTab.name = `Pivot from ${sourceTab.name.substring(0, 10)}${sourceTab.name.length > 10 ? '...' : ''}`;
    newTab.query = "pass";
    newTab.inputFormat = sourceTab.outputFormat;
    newTab.outputFormat = sourceTab.outputFormat;
    newTab.dataSummary = `Pivoted from ${sourceTab.name}`;
    await handleNewData(newTab, sourceTab.currentRawOutput, `Pivoted from ${sourceTab.name}`);
    await switchTab(newTabId);
    setTimeout(() => {
        if (activeTabId === newTabId) {
             runQueryHandler();
        }
    }, 50);
    showAppMessage(`Pivoted results from tab "${sourceTab.name}" to new tab.`, 'info');
}
function prettifyRuleName(filename) {
    if (!filename) return "";
    return filename
        .replace(/\.yaml$/i, '')
        .replace(/\.yml$/i, '')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
async function initializeShaperScriptsSelect() {
    const placeholder = [{ name: "Select a shaper...", path: "" }];
    try {
        const response = await fetch('shapers/shaper_files.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Could not load shaper_files.json`);
        }
        const shaperFiles = await response.json();
        if (Array.isArray(shaperFiles) && shaperFiles.length > 0) {
            const options = shaperFiles.map(filename => ({
                path: filename,
                name: prettifyRuleName(filename)
            }));
            populateSelect(dom.shaperScriptsSelect, placeholder.concat(options), "", 'path', 'name');
        } else {
            populateSelect(dom.shaperScriptsSelect, placeholder.concat([{ name: "No shapers found.", path: "" }]), "", 'path', 'name');
            showAppMessage("No shaper scripts found in manifest.", "warning");
        }
    } catch (error) {
        populateSelect(dom.shaperScriptsSelect, placeholder.concat([{ name: "Error loading shapers.", path: "" }]), "", 'path', 'name');
        showAppMessage(`Failed to load shaper scripts: ${error.message}`, 'error', true);
    }
}
async function initializePredefinedRulesSelect(selectedValue = "") {
    dom.loadPredefinedRuleBtn.disabled = true;
    const placeholder = [{ name: "Select a predefined set...", path: "" }];
    try {
        const response = await fetch('rules/rule_files.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - Could not load rule_files.json`);
        }
        const ruleFiles = await response.json();
        if (Array.isArray(ruleFiles) && ruleFiles.length > 0) {
            const options = ruleFiles.map(filename => ({
                path: filename,
                name: prettifyRuleName(filename)
            }));
            populateSelect(dom.predefinedRulesSelect, placeholder.concat(options), selectedValue, 'path', 'name');
            dom.loadPredefinedRuleBtn.disabled = false;
        } else {
            populateSelect(dom.predefinedRulesSelect, placeholder.concat([{ name: "No rules found in manifest.", path: "" }]), "", 'path', 'name');
            showAppMessage("No predefined rules found or manifest is empty.", "warning");
        }
    } catch (error) {
        populateSelect(dom.predefinedRulesSelect, placeholder.concat([{ name: "Error loading rules.", path: "" }]), "", 'path', 'name');
        showAppMessage(`Failed to load predefined rules: ${error.message}`, 'error', true);
    }
}
async function initializeEvtxWasm() {
    if (typeof Go === 'undefined') {
        console.error("wasm_exec.js not loaded, EVTX conversion disabled.");
        showAppMessage("EVTX converter script not found.", "error", true);
        return;
    }
    goEvtx = new Go();
    try {
        const result = await WebAssembly.instantiateStreaming(fetch('evtx-convert.wasm'), goEvtx.importObject);
        goEvtx.run(result.instance);
        evtxWasmReady = true;
        console.log("evtx-convert.wasm module loaded and initialized.");
    } catch (error) {
        console.error("Failed to load or instantiate evtx-convert.wasm:", error);
        showAppMessage("Critical Error: EVTX converter WASM failed to load.", "error", true);
    }
}
async function initializeApp() {
    if (!SuperDB) {
        return;
    }
    try {
        [dom.runQueryBtn, dom.exportBtn, dom.runScannerBtn, dom.addTabBtn, dom.loadTestDataBtn, dom.loadPredefinedRuleBtn, dom.applyShaperBtn].forEach(btn => { if(btn) btn.disabled = true; });
        dom.runQueryBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Initializing...';
        showAppMessage('Igniting Wasm engines... Stand by.', 'info', true);
        try {
            await openDB();
        } catch (dbError) {
             showAppMessage(`Failed to initialize local database: ${dbError}. Large file support disabled.`, 'warning', true);
        }
        await initializeEvtxWasm();
        populateSelect(dom.inputFormatSelect, config.inputFormats, 'auto');
        populateSelect(dom.outputFormatSelect, config.outputFormats, 'zjson');
        await initializeShaperScriptsSelect();
        await initializePredefinedRulesSelect();
        loadQueryHistory();
        superdbInstance = await SuperDB.instantiate("superdb.wasm");
        [dom.runQueryBtn, dom.addTabBtn, dom.loadTestDataBtn, dom.applyShaperBtn].forEach(btn => { if(btn) btn.disabled = false; });
        addTab();
        dom.runQueryBtn.innerHTML = '<i class="fa-solid fa-play me-2"></i>Run Query';
        showAppMessage('LogTap Viewer ready.', 'success');
        setupEventListeners();
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
          if (typeof bootstrap !== 'undefined' && typeof bootstrap.Tooltip !== 'undefined') {
             return new bootstrap.Tooltip(tooltipTriggerEl);
          } else {
             return null;
          }
        });
    } catch (error) {
        showAppMessage(`Critical Error: SuperDB instantiation failed: ${error.message || String(error)}. Check Wasm files.`, 'error', true);
        if (dom.runQueryBtn) {
            dom.runQueryBtn.textContent = 'Load Failed';
            dom.runQueryBtn.classList.remove('btn-primary');
            dom.runQueryBtn.classList.add('btn-danger');
        }
    }
}
initializeApp();