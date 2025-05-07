let SuperDB;
try {
    SuperDB = (await import("./index.js")).SuperDB;
} catch (e) {
    console.error("Failed to load SuperDB module from ./index.js.", e);
    if (typeof globalThis.SuperDB !== 'undefined') {
        SuperDB = globalThis.SuperDB;
        console.info("SuperDB loaded from globalThis.SuperDB");
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
    querySnippetsSelect: document.getElementById('querySnippets'),
    dataInput: document.getElementById('dataInput'),
    fileInput: document.getElementById('fileInput'),
    fileNameDisplay: document.getElementById('fileNameDisplay'),
    inputFormatSelect: document.getElementById('inputFormat'),
    outputFormatSelect: document.getElementById('outputFormat'),
    runQueryBtn: document.getElementById('runQueryBtn'),
    exportBtn: document.getElementById('exportBtn'),
    resultOutputCode: document.getElementById('resultOutputCode'),
    statusMessage: document.getElementById('statusMessage'),
    toggleViewBtn: document.getElementById('toggleViewBtn'),
    pivotResultsBtn: document.getElementById('pivotResultsBtn'), // Added
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
    scanProgress: document.getElementById('scanProgress')
};

let superdbInstance = null;
let tabsState = [];
let activeTabId = null;
let nextTabId = 1;
const MAX_HISTORY_ITEMS = 25;
let scannerWorker = null;

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
    ],
    querySnippets: [
        { name: "Select a snippet...", template: "" },
        { name: "Show all (pass)", template: "pass" },
        { name: "Filter data by search term", template: "grep('pattern')" },
        { name: "Count by field", template: "count() by this['<field>']" },
        { name: "Top N values", template: "top N this['<field>']" },
        { name: "Sort by field", template: "sort this['<field>']" },
        { name: "Parse Unstructured Linux Logs", template: "yield grok('%{SYSLOGTIMESTAMP:timestamp} %{HOSTNAME:hostname} %{GREEDYDATA:message}', this) " },
    ],
    predefinedRuleSets: [
        { name: "Select a predefined set...", path: "" },
        { name: "Common_iocs_pattern", path: "rules/common_iocs_pattern.yaml" },
        { name: "Extended_iocs_pattern", path: "rules/extended_iocs_pattern.yaml" },
        { name: "Linux_basic_pattern", path: "rules/linux_basic_pattern.yaml" },
        { name: "c2_pattern", path: "rules/c2_pattern.yaml" },
        { name: "security_event_IDs_pattern", path: "rules/security_event_IDs_pattern.yaml" },
        { name: "http_logs_pattern", path: "rules/http_investigation_pattern.yaml" },
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
        id: newTabId, name: `Log ${nameSuffix}`, isActive: false, rawData: "", query: "pass",
        inputFormat: "auto", outputFormat: "zjson", currentRawOutput: null, gridInstance: null,
        scannerRules: [], scannerRuleFileName: "No scanner rules loaded.", fileName: "No file loaded.",
        querySnippetValue: "", predefinedRulesSelectValue: "", scannerHitsHTML: "",
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
    dom.pivotResultsBtn.classList.add('d-none'); // Hide pivot button initially
    dom.exportBtn.disabled = true;

    const viewRawText = "View Raw";
    const viewTableText = "View Table";
    const hasResults = tab.currentRawOutput && tab.currentRawOutput.trim() !== "";

    if (tab.gridInstance) {
        dom.tableResultOutputContainer.classList.remove('d-none');
        dom.toggleViewBtn.textContent = viewRawText;
        dom.toggleViewBtn.classList.remove('d-none');
        dom.pivotResultsBtn.classList.remove('d-none'); // Show pivot button
        dom.exportBtn.disabled = false;
    } else if (hasResults) {
        dom.resultOutputCode.textContent = tab.currentRawOutput;
        dom.textResultOutput.classList.remove('d-none');
        const canBeTable = parseResultForTable(tab.currentRawOutput, tab.outputFormat);
        if (canBeTable && canBeTable.headers && canBeTable.headers.length > 0) {
            dom.toggleViewBtn.textContent = viewTableText;
            dom.toggleViewBtn.classList.remove('d-none');
        }
        dom.pivotResultsBtn.classList.remove('d-none'); // Show pivot button
        dom.exportBtn.disabled = false;
    } else {
        dom.noResultsMessage.classList.remove('d-none');
    }
}

function loadTabData(tabId) {
    const tab = tabsState.find(t => t.id === tabId);
    if (!tab) { console.error("Tab not found:", tabId); return; }

    dom.queryInput.value = tab.query;
    dom.dataInput.value = tab.rawData;
    populateSelect(dom.inputFormatSelect, config.inputFormats, tab.inputFormat);
    populateSelect(dom.outputFormatSelect, config.outputFormats, tab.outputFormat);
    dom.fileNameDisplay.textContent = tab.fileName;
    dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
    populateSelect(dom.querySnippetsSelect, config.querySnippets, tab.querySnippetValue, 'template', 'name');
    populateSelect(dom.predefinedRulesSelect, config.predefinedRuleSets, tab.predefinedRulesSelectValue, 'path', 'name');

    dom.resultOutputCode.textContent = '';
    if (tab.gridInstance) { try { tab.gridInstance.destroy(); tab.gridInstance = null; } catch(e) {} }
    dom.tableResultOutputContainer.innerHTML = '';
    updateResultDisplay(tab);

    dom.scannerHitsOutput.innerHTML = tab.scannerHitsHTML || '';
    dom.scannerResultsPanel.classList.toggle('d-none', !(tab.scannerHitsHTML && tab.scannerHitsHTML.trim() !== ''));
    dom.noScannerHitsMessage.classList.toggle('d-none', (tab.scannerHitsHTML && tab.scannerHitsHTML.trim() !== '') || dom.scannerResultsPanel.classList.contains('d-none'));

    dom.runScannerBtn.disabled = !(tab.scannerRules && tab.scannerRules.length > 0 && superdbInstance);
}

function saveActiveTabData() {
    const activeTab = getActiveTabState();
    if (!activeTab) return;
    activeTab.query = dom.queryInput.value;
    activeTab.rawData = dom.dataInput.value;
    activeTab.inputFormat = dom.inputFormatSelect.value;
    activeTab.outputFormat = dom.outputFormatSelect.value;
    activeTab.querySnippetValue = dom.querySnippetsSelect.value;
    activeTab.predefinedRulesSelectValue = dom.predefinedRulesSelect.value;
}

function switchTab(tabId) {
    if (activeTabId === tabId && tabsState.find(t => t.id === tabId && t.isActive)) return;
    if(activeTabId) saveActiveTabData();
    tabsState.forEach(tab => tab.isActive = (tab.id === tabId));
    activeTabId = tabId;
    renderTabs();
    loadTabData(tabId);
}

function addTab() {
    if(activeTabId) saveActiveTabData();
    const newTab = createNewTabState();
    tabsState.push(newTab);
    switchTab(newTab.id);
    if (tabsState.length === 1 && superdbInstance) { dom.queryInput.focus(); }
    return newTab;
}

function closeTab(tabIdToClose) {
    if (tabsState.length <= 1) { showAppMessage("Cannot close the last tab.", "warning"); return; }
    const tabIndex = tabsState.findIndex(tab => tab.id === tabIdToClose);
    if (tabIndex === -1) return;

    const tabToClose = tabsState[tabIndex];
    if (tabToClose.gridInstance) { try { tabToClose.gridInstance.destroy(); } catch(e) {} }
    tabsState.splice(tabIndex, 1);

    if (scannerWorker && scannerWorker.tabId === tabIdToClose) {
        scannerWorker.terminate();
        scannerWorker = null;
        console.log(`Scanner worker for tab ${tabIdToClose} terminated.`);
        dom.cancelScanBtn.classList.add('d-none');
        dom.scanProgress.classList.add('d-none');
        dom.runScannerBtn.disabled = !(getActiveTabState()?.scannerRules?.length > 0 && superdbInstance);
        dom.runScannerBtn.textContent = 'Run Scanner';
        dom.runQueryBtn.disabled = !superdbInstance;
    }

    if (activeTabId === tabIdToClose) {
        activeTabId = null;
        const newActiveIndex = Math.max(0, tabIndex - 1);
        switchTab(tabsState[newActiveIndex].id);
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
    if(history.length === 0) placeholder.textContent = "No history yet...";

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
                showAppMessage(`No valid rules in "${fileName}". Ensure 'name' and 'query'.`, 'warning');
            }
        } else { throw new Error("YAML needs a 'rules' array with 'name' and 'query' per rule."); }
    } catch (e) {
        console.error("Error parsing scanner YAML:", e); tab.scannerRules = [];
        tab.scannerRuleFileName = `Error loading ${fileName}.`;
        showAppMessage(`Error parsing scanner file "${fileName}": ${e.message}`, 'error', true);
    }
    dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
    dom.runScannerBtn.disabled = !(tab.scannerRules.length > 0 && superdbInstance);
}

async function loadScannerRulesFromFile(filePath, ruleSetName, tab) {
    try {
        if (!filePath) {
             const exampleRuleContent = `rules:\n  - name: Example Rule for ${ruleSetName}\n    query: "pass | head 1"`;
             console.warn(`Using example content for ${ruleSetName} as path is placeholder: ${filePath}`);
             parseAndSetScannerRules(exampleRuleContent, `${ruleSetName} (Example)`, tab);
             showAppMessage(`Loaded example rules for "${ruleSetName}". Replace with actual file path.`, 'warning', true);
             return;
        }
        const response = await fetch(filePath);
        if (!response.ok) { throw new Error(`HTTP ${response.status} fetching ${ruleSetName} from ${filePath}`); }
        const yamlContent = await response.text();
        parseAndSetScannerRules(yamlContent, ruleSetName, tab);
    } catch (e) {
        console.error(`Failed to load predefined rules "${ruleSetName}":`, e);
        tab.scannerRules = []; tab.scannerRuleFileName = `Failed to load ${ruleSetName}.`;
        dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
        showAppMessage(`Failed to load rules "${ruleSetName}": ${e.message}. Check path and file.`, 'error', true);
        dom.runScannerBtn.disabled = true;
    }
}

function parseCsvLine(text) {
    const result = []; let currentField = ''; let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuotes && i + 1 < text.length && text[i+1] === '"') { currentField += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) { result.push(currentField); currentField = ''; }
        else { currentField += char; }
    }
    result.push(currentField); return result;
}

function parseResultForTable(resultText, actualOutputFormat) {
    const lines = resultText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return null;
    let headers = []; let dataRows = []; const typeDefinitions = {};

    try {
        if (actualOutputFormat === 'zjson') {
            const jsonDataObjects = []; const allPossibleHeaders = new Set();
            lines.forEach(line => {
                try {
                    const record = JSON.parse(line); jsonDataObjects.push(record);
                    if (record.type && record.type.kind === 'record' && record.type.fields) {
                        typeDefinitions[record.type.id] = record.type.fields.map(f => f.name);
                        record.type.fields.forEach(f => allPossibleHeaders.add(f.name));
                    } else if (record.type && record.type.kind === 'ref') {
                        const refSchemaFields = typeDefinitions[record.type.id];
                        if (refSchemaFields) { refSchemaFields.forEach(fieldName => allPossibleHeaders.add(fieldName)); }
                    } else if (typeof record === 'object' && record !== null && !record.type) {
                        Object.keys(record).forEach(k => allPossibleHeaders.add(k));
                    }
                } catch (parseError) { console.warn("Skipping line (JSON parse error in ZJSON):", parseError, line); }
            });
            headers = Array.from(allPossibleHeaders);
            if (headers.length === 0 && jsonDataObjects.length > 0 && typeof jsonDataObjects[0] !== 'object') {
                 headers.push("value");
            }
            jsonDataObjects.forEach(record => {
                let currentSchemaFields; let valuesToMap = record.value;
                if (record.type && record.type.kind === 'record') { currentSchemaFields = record.type.fields.map(f => f.name); }
                else if (record.type && record.type.kind === 'ref') { currentSchemaFields = typeDefinitions[record.type.id]; }
                else if (typeof record === 'object' && record !== null && !record.type) { currentSchemaFields = Object.keys(record); valuesToMap = record; }
                else {
                    if (headers.includes("value")) { dataRows.push(headers.map(h => (h === "value") ? String(record) : '')); }
                    return;
                }
                if (currentSchemaFields && (Array.isArray(valuesToMap) || (typeof valuesToMap === 'object' && valuesToMap !== null))) {
                    const rowObject = {};
                    if (Array.isArray(valuesToMap)) { currentSchemaFields.forEach((fieldName, idx) => { rowObject[fieldName] = valuesToMap[idx]; }); }
                    else { currentSchemaFields.forEach(fieldName => { rowObject[fieldName] = valuesToMap[fieldName]; }); }
                    dataRows.push(headers.map(h => String(rowObject[h] !== undefined ? rowObject[h] : '')));
                } else if (currentSchemaFields && headers.length === currentSchemaFields.length && !valuesToMap && typeof record === 'object' && record !== null) {
                     dataRows.push(headers.map(h => String(record[h] !== undefined ? record[h] : '')));
                }
            });
        } else if (actualOutputFormat === 'csv') {
            if (lines.length > 0) {
                headers = parseCsvLine(lines[0]);
                dataRows = lines.slice(1).map(line => {
                    const parsedLine = parseCsvLine(line); const rowArray = [];
                    for (let i = 0; i < headers.length; i++) { rowArray.push(parsedLine[i] !== undefined ? String(parsedLine[i]) : ''); }
                    return rowArray;
                });
            }
        } else { return null; }
        if (headers.length === 0) return null;
        return { headers, dataRows };
    } catch (e) { console.error(`Error parsing result for table (format: ${actualOutputFormat}):`, e, resultText); return null; }
}

function displayTableWithGridJs(parsedData, containerElement, tab) {
    if (!parsedData || !parsedData.headers || parsedData.headers.length === 0) {
        containerElement.classList.add('d-none');
        if (tab.gridInstance) { try { tab.gridInstance.destroy(); } catch(e){} tab.gridInstance = null; }
        return null;
    }
    const { headers, dataRows } = parsedData;
    if (tab.gridInstance) { try { tab.gridInstance.destroy(); } catch(e){} }
    containerElement.innerHTML = '';

    if (typeof gridjs === 'undefined') {
        console.error("Grid.js library is not loaded!");
        showAppMessage("Error: Table library (Grid.js) not loaded.", "error", true);
        return null;
    }
    try {
        tab.gridInstance = new gridjs.Grid({
            columns: headers, data: dataRows, search: true, sort: true,
            pagination: { enabled: true, limit: 100, summary: true },
        }).render(containerElement);
        containerElement.classList.remove('d-none');
        return tab.gridInstance;
    } catch (gridError) {
        console.error("Error rendering Grid.js table:", gridError);
        showAppMessage(`Error displaying results table: ${gridError.message}`, 'error', true);
        containerElement.innerHTML = `<div class="alert alert-danger">Failed to render results table.</div>`;
        containerElement.classList.remove('d-none');
        tab.gridInstance = null;
        return null;
    }
}

function setupEventListeners() {
    dom.querySnippetsSelect.addEventListener('change', (event) => {
        const activeTab = getActiveTabState(); if (!activeTab) return;
        const selectedTemplate = event.target.value;
        if (selectedTemplate) { dom.queryInput.value = selectedTemplate; activeTab.query = selectedTemplate; }
        activeTab.querySnippetValue = selectedTemplate;
    });
    dom.fileInput.addEventListener('change', (event) => {
        const activeTab = getActiveTabState(); if (!activeTab) return;
        const file = event.target.files[0];
        if (file) {
            const oldTabName = activeTab.name;
            activeTab.name = file.name.length > 20 ? file.name.substring(0,17) + "..." : file.name;
            if (oldTabName !== activeTab.name) renderTabs();
            const reader = new FileReader();
            reader.onload = (e) => {
                activeTab.rawData = e.target.result; dom.dataInput.value = e.target.result;
                activeTab.fileName = `Loaded: ${file.name}`; dom.fileNameDisplay.textContent = activeTab.fileName;
                showAppMessage(`Data file "${file.name}" loaded into tab "${activeTab.name}".`, 'info');
            };
            reader.onerror = (e) => {
                console.error("Error reading data file:", e);
                showAppMessage(`Error reading data file: ${file.name}.`, 'error', true);
                activeTab.fileName = "File load error."; dom.fileNameDisplay.textContent = activeTab.fileName;
            };
            reader.readAsText(file);
        }
        dom.fileInput.value = "";
    });

    dom.dataInput.addEventListener('input', () => { const t = getActiveTabState(); if (t) t.rawData = dom.dataInput.value; });
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
        const selectedPath = dom.predefinedRulesSelect.value;
        if (selectedPath) {
            const ruleSet = config.predefinedRuleSets.find(rs => rs.path === selectedPath);
            loadScannerRulesFromFile(selectedPath, ruleSet ? ruleSet.name : selectedPath, activeTab);
            activeTab.predefinedRulesSelectValue = selectedPath;
        } else { showAppMessage('Please select a predefined rule set to load.', 'warning'); }
    });

    dom.queryHistorySelect.addEventListener('change', (event) => {
        const activeTab = getActiveTabState(); if (!activeTab) return;
        if (event.target.value) {
            dom.queryInput.value = event.target.value; activeTab.query = event.target.value;
            showAppMessage('Query loaded from history.', 'info');
        }
    });

    dom.clearHistoryBtn.addEventListener('click', clearQueryHistory);
    dom.addTabBtn.addEventListener('click', addTab);
    dom.runQueryBtn.addEventListener('click', runQueryHandler);
    dom.exportBtn.addEventListener('click', exportResultsHandler);
    dom.runScannerBtn.addEventListener('click', runScannerHandler);
    dom.toggleViewBtn.addEventListener('click', toggleResultsViewHandler);
    dom.pivotResultsBtn.addEventListener('click', handlePivotResultsToNewTab); // Added listener
    dom.cancelScanBtn.addEventListener('click', cancelScanHandler);

    dom.scannerHitsOutput.addEventListener('click', (event) => {
        const pivotButton = event.target.closest('.pivot-button');
        if (pivotButton) {
            const ruleName = pivotButton.dataset.ruleName;
            const ruleQuery = pivotButton.dataset.ruleQuery;
            const sourceTabId = pivotButton.dataset.sourceTabId;
            handlePivotToNewTab(sourceTabId, ruleName, ruleQuery);
        }
    });
}

async function runQueryHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !superdbInstance) {
        showAppMessage(superdbInstance ? "No active tab." : "SuperDB not ready.", 'error', true); return;
    }
    let query = activeTab.query.trim();
    saveQueryToHistory(query);
    if (!query && activeTab.rawData) { query = "pass"; activeTab.query = "pass"; dom.queryInput.value = "pass"; }
    if (!query && !activeTab.rawData) { showAppMessage("Enter a query or provide data.", 'info'); return; }

    activeTab.currentRawOutput = null;
    if (activeTab.gridInstance) { try {activeTab.gridInstance.destroy();} catch(e){} activeTab.gridInstance = null; }
    updateResultDisplay(activeTab);

    dom.runQueryBtn.disabled = true;
    dom.runQueryBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Running...';
    hideAppMessage();

    try {
        const result = await superdbInstance.run({ query, input: activeTab.rawData, inputFormat: activeTab.inputFormat, outputFormat: activeTab.outputFormat });
        activeTab.currentRawOutput = result;
        const tableData = parseResultForTable(result, activeTab.outputFormat);
        if (tableData && tableData.headers && tableData.headers.length > 0) {
            displayTableWithGridJs(tableData, dom.tableResultOutputContainer, activeTab);
        } else {
            if (activeTab.gridInstance) { try {activeTab.gridInstance.destroy();} catch(e){} activeTab.gridInstance = null; }
        }
        updateResultDisplay(activeTab);
    } catch (error) {
        console.error("Error running query:", error);
        activeTab.currentRawOutput = `Error: ${error.message || String(error)}`;
        if (activeTab.gridInstance) { try {activeTab.gridInstance.destroy();} catch(e){} activeTab.gridInstance = null; }
        updateResultDisplay(activeTab);
        showAppMessage(`Query failed: ${error.message || String(error)}`, 'error', true);
    } finally {
        dom.runQueryBtn.disabled = false;
        dom.runQueryBtn.textContent = 'Run Query';
    }
}

function toggleResultsViewHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !activeTab.currentRawOutput) return;
    if (activeTab.gridInstance) {
        try { activeTab.gridInstance.destroy(); } catch(e){} activeTab.gridInstance = null;
    } else {
        const tableData = parseResultForTable(activeTab.currentRawOutput, activeTab.outputFormat);
        if (tableData && tableData.headers && tableData.headers.length > 0) {
            displayTableWithGridJs(tableData, dom.tableResultOutputContainer, activeTab);
        } else { showAppMessage('Cannot display as table. Output might be an error or unsuitable format.', 'warning'); }
    }
    updateResultDisplay(activeTab);
}

async function exportResultsHandler() {
    const activeTab = getActiveTabState();
    if (!activeTab || !activeTab.currentRawOutput) { showAppMessage("No results to export.", 'info'); return; }
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
        const a = document.createElement('a'); a.href = url;
        const safeName = name.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 30);
        a.download = `results_${safeName}.${fileExtension}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAppMessage(`Results exported as ${a.download}.`, 'success');
    } catch (error) { showAppMessage(`Export error: ${error.message}`, 'error', true); }
}

function terminateScannerWorker() {
    if (scannerWorker) {
        scannerWorker.terminate();
        scannerWorker = null;
        console.log("Scanner worker terminated.");
        dom.runScannerBtn.disabled = !(getActiveTabState()?.scannerRules?.length > 0 && superdbInstance);
        dom.runQueryBtn.disabled = !superdbInstance;
        dom.cancelScanBtn.classList.add('d-none');
        dom.scanProgress.classList.add('d-none');
        dom.runScannerBtn.textContent = 'Run Scanner';
    }
}

function handleWorkerMessage(event) {
    const { type, ...data } = event.data;
    const activeTab = getActiveTabState();

    switch (type) {
        case 'init_done':
            console.log("Scanner worker initialized successfully.");
            if (scannerWorker && scannerWorker.pendingStartData) {
                 scannerWorker.postMessage({ type: 'start', ...scannerWorker.pendingStartData });
                 delete scannerWorker.pendingStartData;
            }
            break;
        case 'init_error':
            showAppMessage(`Scanner Worker Error: ${data.message}`, 'error', true);
            terminateScannerWorker();
            break;
        case 'progress':
            dom.scanProgress.textContent = `Scanning ${data.processed}/${data.total}...`;
            break;
        case 'hit':
            if (activeTab) {
                const hitDiv = document.createElement('div');
                hitDiv.className = "mb-3 pb-3 border-bottom border-secondary-subtle last:border-bottom-0";
                hitDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start">
                        <strong class="text-info d-block mb-1 small">Hit for Rule: "${data.ruleName}"</strong>
                        <button class="btn btn-outline-info btn-sm py-0 px-1 pivot-button"
                                data-rule-name="${data.ruleName}"
                                data-rule-query="${encodeURIComponent(data.query)}"
                                data-source-tab-id="${activeTab.id}"
                                title="Run this rule query in a new tab">
                            Pivot &raquo;
                        </button>
                    </div>
                    <p class="mb-1 small text-body-secondary scanner-hit-query">Query: <code class="text-light small">${data.query}</code></p>
                    <div class="scanner-hit-result">
                        <pre class="small m-0"><code>${data.result.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
                    </div>`;
                dom.scannerHitsOutput.appendChild(hitDiv);
                dom.scannerHitsOutput.scrollTop = dom.scannerHitsOutput.scrollHeight;
            }
            break;
        case 'error':
             if (activeTab) {
                const errorDiv = document.createElement('div');
                errorDiv.className = "mb-3 pb-3 border-bottom border-secondary-subtle last:border-bottom-0 text-danger";
                errorDiv.innerHTML = `<strong>Error for Rule: "${data.ruleName}"</strong><br><small class="small">${data.message}</small>`;
                dom.scannerHitsOutput.appendChild(errorDiv);
                dom.scannerHitsOutput.scrollTop = dom.scannerHitsOutput.scrollHeight;
             }
            break;
        case 'cancelled':
            showAppMessage('Scan cancelled by user.', 'warning', true);
            terminateScannerWorker();
            break;
        case 'complete':
            if (activeTab) {
                activeTab.scannerHitsHTML = dom.scannerHitsOutput.innerHTML;
                if (data.hitsFound === 0 && !data.errorsOccurred) {
                    dom.noScannerHitsMessage.classList.remove('d-none');
                    showAppMessage(`Scanner finished. No hits found.`, 'success');
                } else if (data.hitsFound > 0) {
                    dom.noScannerHitsMessage.classList.add('d-none');
                    showAppMessage(`Scanner finished. Found ${data.hitsFound} hit(s). ${data.errorsOccurred ? 'Some rules had errors.' : ''}`, data.errorsOccurred ? 'warning' : 'success');
                } else {
                    dom.noScannerHitsMessage.classList.add('d-none');
                    showAppMessage(`Scanner finished with errors. See details.`, 'error');
                }
            }
            terminateScannerWorker();
            break;
        default:
            console.warn("Received unknown message type from worker:", type, data);
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
    if (!activeTab.rawData || !activeTab.rawData.trim()) {
        showAppMessage("No data to scan. Paste or upload data first.", 'warning', true);
        return;
    }

    terminateScannerWorker();

    activeTab.scannerHitsHTML = '';
    dom.scannerHitsOutput.innerHTML = '';
    dom.noScannerHitsMessage.classList.add('d-none');
    dom.scannerResultsPanel.classList.remove('d-none');
    dom.scanProgress.classList.remove('d-none');
    dom.scanProgress.textContent = 'Initializing scanner worker...';
    hideAppMessage();

    dom.runScannerBtn.disabled = true;
    dom.runQueryBtn.disabled = true;
    dom.cancelScanBtn.classList.remove('d-none');
    dom.runScannerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Starting...';

    try {
        scannerWorker = new Worker('scanner.worker.js', { type: 'module' });
        scannerWorker.onerror = (error) => {
            console.error("Scanner Worker Error:", error);
            showAppMessage(`Scanner Worker failed: ${error.message}`, 'error', true);
            terminateScannerWorker();
        };
        scannerWorker.onmessage = handleWorkerMessage;

        scannerWorker.tabId = activeTab.id;

        const startData = {
            data: activeTab.rawData,
            rules: activeTab.scannerRules,
            inputFormat: activeTab.inputFormat,
            wasmPath: "superdb.wasm"
        };

        scannerWorker.pendingStartData = startData;
        scannerWorker.postMessage({ type: 'init', wasmPath: "superdb.wasm" });

    } catch (error) {
        console.error("Failed to create or start scanner worker:", error);
        showAppMessage(`Failed to start scanner: ${error.message}`, 'error', true);
        dom.runScannerBtn.disabled = false;
        dom.runQueryBtn.disabled = false;
        dom.cancelScanBtn.classList.add('d-none');
        dom.scanProgress.classList.add('d-none');
        dom.runScannerBtn.textContent = 'Run Scanner';
    }
}

function cancelScanHandler() {
    if (scannerWorker) {
        showAppMessage("Attempting to cancel scan...", "warning");
        scannerWorker.postMessage({ type: 'cancel' });
    } else {
        console.warn("Cancel button clicked but no active scanner worker found.");
    }
}

function handlePivotToNewTab(sourceTabId, ruleName, encodedRuleQuery) {
    const sourceTab = tabsState.find(tab => tab.id === sourceTabId);
    if (!sourceTab) {
        showAppMessage("Could not find the original tab data for pivoting.", "error", true);
        return;
    }

    const ruleQuery = decodeURIComponent(encodedRuleQuery);

    const newTab = addTab();

    newTab.name = `Pivot: ${ruleName.substring(0, 15)}${ruleName.length > 15 ? '...' : ''}`;
    newTab.rawData = sourceTab.rawData;
    newTab.query = ruleQuery;
    newTab.inputFormat = sourceTab.inputFormat;
    newTab.outputFormat = sourceTab.outputFormat;
    newTab.fileName = sourceTab.fileName;

    dom.queryInput.value = newTab.query;
    dom.dataInput.value = newTab.rawData;
    dom.inputFormatSelect.value = newTab.inputFormat;
    dom.outputFormatSelect.value = newTab.outputFormat;
    dom.fileNameDisplay.textContent = newTab.fileName;

    renderTabs();

    setTimeout(() => {
        runQueryHandler();
    }, 50);

    showAppMessage(`Pivoted to new tab with query for rule "${ruleName}".`, 'info');
}

function handlePivotResultsToNewTab() {
    const sourceTab = getActiveTabState();
    if (!sourceTab || !sourceTab.currentRawOutput || !sourceTab.currentRawOutput.trim()) {
        showAppMessage("No results available to pivot.", "warning");
        return;
    }

    const newTab = addTab();

    newTab.name = `Pivot from ${sourceTab.name.substring(0, 10)}${sourceTab.name.length > 10 ? '...' : ''}`;
    newTab.rawData = sourceTab.currentRawOutput; // Use current results as new raw data
    newTab.query = "pass"; // Default query for the pivoted data
    newTab.inputFormat = sourceTab.outputFormat; // Input format is the previous output format
    newTab.outputFormat = sourceTab.outputFormat; // Keep output format or default to zjson
    newTab.fileName = `Pivoted from ${sourceTab.name}`; // Indicate source

    dom.queryInput.value = newTab.query;
    dom.dataInput.value = newTab.rawData;
    dom.inputFormatSelect.value = newTab.inputFormat;
    dom.outputFormatSelect.value = newTab.outputFormat;
    dom.fileNameDisplay.textContent = newTab.fileName;

    renderTabs();

    setTimeout(() => {
        runQueryHandler(); // Run default 'pass' query on the pivoted data
    }, 50);

    showAppMessage(`Pivoted results from tab "${sourceTab.name}" to new tab.`, 'info');
}


async function initializeApp() {
    if (!SuperDB) {
        console.error("SuperDB class not loaded. Cannot initialize app.");
        return;
    }
    try {
        [dom.runQueryBtn, dom.exportBtn, dom.runScannerBtn, dom.addTabBtn].forEach(btn => { if(btn) btn.disabled = true; });
        dom.runQueryBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Initializing...';
        showAppMessage('Igniting Wasm engines... Stand by.', 'info', true);

        populateSelect(dom.inputFormatSelect, config.inputFormats, 'auto');
        populateSelect(dom.outputFormatSelect, config.outputFormats, 'zjson');
        populateSelect(dom.querySnippetsSelect, config.querySnippets, "", 'template', 'name');
        populateSelect(dom.predefinedRulesSelect, config.predefinedRuleSets, "", 'path', 'name');
        loadQueryHistory();

        superdbInstance = await SuperDB.instantiate("superdb.wasm");

        [dom.runQueryBtn, dom.addTabBtn].forEach(btn => { if(btn) btn.disabled = false; });
        dom.runScannerBtn.disabled = true;
        addTab();
        dom.runQueryBtn.textContent = 'Run Query';
        showAppMessage('LogTap Viewer ready.', 'success');
        setupEventListeners();

        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
          if (typeof bootstrap !== 'undefined' && typeof bootstrap.Tooltip !== 'undefined') {
             return new bootstrap.Tooltip(tooltipTriggerEl);
          } else {
             console.warn("Bootstrap Tooltip component not found. Tooltips will not work.");
             return null;
          }
        });

    } catch (error) {
        console.error("Failed to instantiate SuperDB Wasm:", error);
        showAppMessage(`Critical Error: SuperDB instantiation failed: ${error.message || String(error)}. Check Wasm files.`, 'error', true);
        if (dom.runQueryBtn) {
            dom.runQueryBtn.textContent = 'Load Failed';
            dom.runQueryBtn.classList.remove('btn-primary');
            dom.runQueryBtn.classList.add('btn-danger');
        }
    }
}

initializeApp();
