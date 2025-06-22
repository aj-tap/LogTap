import { dom } from './config.js';
import { getSuperDB } from './app.js';
import { showAppMessage, populateSelect } from './ui.js';
import { getActiveTab, setEvtxWasmReady } from './state.js';

function prettifyRuleName(filename) {
    if (!filename) return "";
    return filename
        .replace(/\.yaml$/i, '').replace(/\.yml$/i, '')
        .replace(/_/g, ' ').replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export async function initializeShaperScriptsSelect() {
    const placeholder = [{ name: "Select a shaper...", path: "" }];
    try {
        const response = await fetch('shapers/shaper_files.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const shaperFiles = await response.json();
        if (Array.isArray(shaperFiles) && shaperFiles.length > 0) {
            const options = shaperFiles.map(filename => ({ path: filename, name: prettifyRuleName(filename) }));
            populateSelect(dom.shaperScriptsSelect, placeholder.concat(options), "", 'path', 'name');
        } else {
            populateSelect(dom.shaperScriptsSelect, placeholder.concat([{ name: "No shapers found.", path: "" }]), "", 'path', 'name');
        }
    } catch (error) {
        showAppMessage(`Failed to load shaper scripts: ${error.message}`, 'error', true);
    }
}

export async function initializePredefinedRulesSelect(selectedValue = "") {
    dom.loadPredefinedRuleBtn.disabled = true;
    const placeholder = [{ name: "Select a predefined set...", path: "" }];
    try {
        const response = await fetch('rules/rule_files.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const ruleFiles = await response.json();
        if (Array.isArray(ruleFiles) && ruleFiles.length > 0) {
            const options = ruleFiles.map(filename => ({ path: filename, name: prettifyRuleName(filename) }));
            populateSelect(dom.predefinedRulesSelect, placeholder.concat(options), selectedValue, 'path', 'name');
            dom.loadPredefinedRuleBtn.disabled = false;
        } else {
            populateSelect(dom.predefinedRulesSelect, placeholder.concat([{ name: "No rules found.", path: "" }]), "", 'path', 'name');
        }
    } catch (error) {
        showAppMessage(`Failed to load predefined rules: ${error.message}`, 'error', true);
    }
}

export async function loadScannerRulesFromFile(filePath, ruleSetName, tab) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const yamlContent = await response.text();
        parseAndSetScannerRules(yamlContent, ruleSetName, tab);
    } catch (e) {
        showAppMessage(`Failed to load rules "${ruleSetName}": ${e.message}.`, 'error', true);
    }
}

export function parseResultForTable(resultText, actualOutputFormat) {
    if (!resultText) return null;
    const lines = resultText.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return { headers: [], dataRows: [] };
    let headers = [], dataRows = [];
    try {
        if (actualOutputFormat === 'csv') {
            headers = parseCsvLine(lines[0]);
            dataRows = lines.slice(1).map(line => parseCsvLine(line).map(String));
        } else if (actualOutputFormat === 'line') {
            headers = ["line"];
            dataRows = lines.map(line => [line]);
        } else if (actualOutputFormat === 'zjson' || actualOutputFormat === 'json') {
            const jsonDataObjects = lines.map(line => JSON.parse(line));
            if (jsonDataObjects.length === 0) return { headers: [], dataRows: [] };
            const firstRecord = jsonDataObjects[0];
            if (firstRecord && firstRecord.type?.kind === 'record' && Array.isArray(firstRecord.type.fields) && Array.isArray(firstRecord.value)) {
                headers = firstRecord.type.fields.map(field => field.name);
                dataRows = jsonDataObjects.map(record => {
                    const rowData = record.value || [];
                    return headers.map((header, index) => {
                        const value = rowData[index];
                        if (value === undefined) return "";
                        if (value === null) return "null";
                        if (typeof value === 'object') return JSON.stringify(value);
                        return String(value);
                    });
                });
            } else {
                const allPossibleHeaders = new Set();
                jsonDataObjects.forEach(record => {
                    if (typeof record === 'object' && record !== null) {
                        Object.keys(record).forEach(k => allPossibleHeaders.add(k));
                    }
                });
                headers = Array.from(allPossibleHeaders);
                if (headers.length === 0 && typeof jsonDataObjects[0] !== 'object') {
                    headers.push("value");
                }
                dataRows = jsonDataObjects.map(record => {
                    if (typeof record !== 'object' || record === null) {
                        return headers.map(h => h === 'value' ? String(record) : '');
                    }
                    return headers.map(h => {
                        const value = record[h];
                        if (value === undefined) return "";
                        if (value === null) return "null";
                        if (typeof value === 'object') return JSON.stringify(value);
                        return String(value);
                    });
                });
            }
        } else {
            return { headers: [], dataRows: [] };
        }
    } catch (e) {
        console.error("Error parsing results for table:", e);
        return { headers: [], dataRows: [] };
    }
    return { headers, dataRows };
}

export function parseCsvLine(text) {
    const result = [];
    let currentField = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            result.push(currentField);
            currentField = '';
        } else currentField += char;
    }
    result.push(currentField);
    return result;
}

export async function applyEvtxCleaner(jsonData) {
    const superdbInstance = getSuperDB();
    if (!superdbInstance) throw new Error("SuperDB is not ready.");
    showAppMessage("Applying EVTX cleanup shaper...", 'info');
    const response = await fetch(`shapers/windows_evtx_json.yaml`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const yamlContent = await response.text();
    const shaper = jsyaml.load(yamlContent);
    if (!shaper || !shaper.query) throw new Error(`Invalid shaper file format.`);
    return await superdbInstance.run({
        query: shaper.query,
        input: jsonData,
        inputFormat: shaper.inputFormat,
        outputFormat: shaper.outputFormat
    });
}

export function parseAndSetScannerRules(yamlContent, fileName, tab) {
    try {
        const rulesData = jsyaml.load(yamlContent);
        if (rulesData && Array.isArray(rulesData.rules)) {
            tab.scannerRules = rulesData.rules.filter(rule => rule.name && rule.query);
            if (tab.scannerRules.length > 0) {
                tab.scannerRuleFileName = `Loaded: ${fileName} (${tab.scannerRules.length} rules)`;
                showAppMessage(`Scanner rules loaded.`, 'success');
            } else {
                tab.scannerRuleFileName = `File "${fileName}" has no valid rules.`;
                showAppMessage(`No valid rules in "${fileName}".`, 'warning');
            }
        } else throw new Error("YAML structure incorrect.");
    } catch (e) {
        tab.scannerRules = [];
        tab.scannerRuleFileName = `Error loading ${fileName}.`;
        showAppMessage(`Error parsing scanner file: ${e.message}`, 'error', true);
    }
    dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
    const hasData = tab.dataLocation?.type !== 'empty';
    dom.runScannerBtn.disabled = !(tab.scannerRules.length > 0 && hasData);
}

export async function initializeEvtxWasm() {
    if (typeof Go === 'undefined') {
        showAppMessage("EVTX converter script not found.", "error");
        return;
    }
    const goEvtx = new Go();
    try {
        const result = await WebAssembly.instantiateStreaming(fetch('evtx-convert.wasm'), goEvtx.importObject);
        goEvtx.run(result.instance);
        setEvtxWasmReady(true);
    } catch (error) {
        showAppMessage("EVTX converter WASM failed to load.", "error", true);
    }
}

export function formatDateForZQ(dateInput) {
    return new Date(dateInput).toISOString();
}

export async function exportResultsHandler() {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.currentRawOutput) return;
    const { outputFormat, currentRawOutput, name } = activeTab;
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
        a.download = `results_${name.replace(/[^a-z0-9_.-]/gi, '_')}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        showAppMessage(`Export error: ${error.message}`, 'error');
    }
}