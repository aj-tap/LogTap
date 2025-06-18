import { dom, config, tourSteps } from './config.js';
import { getActiveTab, getTabById, updateActiveTab } from './state.js';
import { showAppMessage, updateResultDisplay } from './ui.js';
import { runQueryHandler, handleNewData } from './dataHandlers.js';
import { addTab, switchTab } from './tabManager.js';
import { formatDateForZQ, parseResultForTable } from './utils.js';
import { getSuperDB } from './app.js';
import { getDataAsStream } from './db.js';

let detailsModalInstance = null;
let currentTourStep = 0;
let currentFieldValueForCyberChef = '';
let cyberChefCustomRecipeModal = null;

export function initializeModals() {
    if (dom.rowDetailsModal && typeof bootstrap !== 'undefined') {
        detailsModalInstance = new bootstrap.Modal(dom.rowDetailsModal);
    }
    if (dom.cyberChefCustomRecipeModalElement && typeof bootstrap !== 'undefined') {
        cyberChefCustomRecipeModal = new bootstrap.Modal(dom.cyberChefCustomRecipeModalElement);
    }
}

export function hideRowDetailsModal() {
    if (detailsModalInstance) {
        detailsModalInstance.hide();
    }
}

export function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        if (typeof bootstrap !== 'undefined' && typeof bootstrap.Tooltip !== 'undefined') {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        }
        return null;
    });
}

export function loadQueryHistory() {
    const history = JSON.parse(localStorage.getItem('zqQueryHistory') || '[]');
    dom.queryHistorySelect.innerHTML = '';
    const placeholder = Object.assign(document.createElement('option'), { value: "", textContent: "Select from history..." });
    dom.queryHistorySelect.appendChild(placeholder);
    dom.queryHistorySelect.disabled = history.length === 0;
    if (history.length === 0) placeholder.textContent = "No history yet...";
    history.forEach(query => {
        const option = document.createElement('option');
        option.value = query;
        option.textContent = query.length > 60 ? query.substring(0, 57) + "..." : query;
        option.title = query;
        dom.queryHistorySelect.appendChild(option);
    });
}

export function saveQueryToHistory(query) {
    if (!query || !query.trim()) return;
    let history = JSON.parse(localStorage.getItem('zqQueryHistory') || '[]');
    history = history.filter(item => item !== query);
    history.unshift(query);
    if (history.length > config.MAX_HISTORY_ITEMS) history.pop();
    localStorage.setItem('zqQueryHistory', JSON.stringify(history));
    loadQueryHistory();
}

export function clearQueryHistory() {
    localStorage.removeItem('zqQueryHistory');
    loadQueryHistory();
    showAppMessage('Query history shredded.', 'info');
}

export function showRowDetails(row, columns) {
    if (!detailsModalInstance || !dom.rowDetailsModalBody) return;
    dom.rowDetailsModalBody.innerHTML = '';
    const startIndex = (columns[0]?.id === '_details_button') ? 1 : 0;
    for (let i = startIndex; i < columns.length; i++) {
        const columnName = String(columns[i].name);
        const cellData = row.cells[i] ? row.cells[i].data : '';
        const escapedDisplayData = String(cellData).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const encodedCellDataForFilter = encodeURIComponent(String(cellData));
        const dropdownValueText = escapedDisplayData.length > 20 ? escapedDisplayData.substring(0, 17) + '...' : escapedDisplayData;
        const fieldEntryContainer = document.createElement('div');
        fieldEntryContainer.className = 'row gx-2 py-2 border-bottom';
        fieldEntryContainer.innerHTML = `
            <div class="col-sm-3 text-truncate fw-semibold pt-1" title="${columnName}">${columnName}</div>
            <div class="col-sm-9">
                <div class="d-flex justify-content-between align-items-start">
                    <pre class="m-0 flex-grow-1 me-2 pt-1" style="white-space: pre-wrap; word-break: break-all;"><code>${escapedDisplayData}</code></pre>
                    <div class="btn-group flex-shrink-0">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" type="button" title="Create filter" data-bs-toggle="dropdown" aria-expanded="false"><i class="fa-solid fa-filter"></i></button>
                            <ul class="dropdown-menu dropdown-menu-dark">
                                <li><a class="dropdown-item filter-action" href="#" data-column="${columnName}" data-value="${encodedCellDataForFilter}" data-op="==">Filter == "${dropdownValueText}"</a></li>
                                <li><a class="dropdown-item filter-action" href="#" data-column="${columnName}" data-value="${encodedCellDataForFilter}" data-op="!=">Filter != "${dropdownValueText}"</a></li>
                                <li><a class="dropdown-item filter-action" href="#" data-column="${columnName}" data-op="count_by_sort">Count by "${columnName}"</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item filter-action" href="#" data-value="${encodedCellDataForFilter}" data-op="search">New search for "${dropdownValueText}"</a></li>
                            </ul>
                        </div>
                        <button class="btn btn-sm btn-outline-success py-0 px-1 ms-1 cyberchef-action-btn" type="button" title="Analyze with CyberChef" data-field-value="${encodeURIComponent(String(cellData).trim())}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                    </div>
                </div>
            </div>
        `;
        dom.rowDetailsModalBody.appendChild(fieldEntryContainer);
    }
    detailsModalInstance.show();
}

export async function copyRowDetailsToClipboardHandler() {
    if (!dom.rowDetailsModalBody) return;
    let textToCopy = '';
    const fieldEntries = dom.rowDetailsModalBody.querySelectorAll('.row.gx-2.py-2');
    fieldEntries.forEach(entry => {
        const key = entry.querySelector('.col-sm-3').textContent.trim();
        const value = entry.querySelector('pre code').textContent.trim();
        textToCopy += `${key}: ${value}\n`;
    });
    if (textToCopy) {
        await navigator.clipboard.writeText(textToCopy);
        showAppMessage('Row details copied!', 'success');
    }
}

export function createQueryFromDetail(op, column, encodedValue) {
    const activeTab = getActiveTab();
    if (!activeTab) return;
    let newQueryPart = '';
    const value = decodeURIComponent(encodedValue).replace(/'/g, "\\'");
    if (op === 'count_by_sort') newQueryPart = `count() by this['${column}'] | sort -r`;
    else if (op === 'search') newQueryPart = `search '${value}'`;
    else if (column) newQueryPart = `this['${column}'] ${op} '${value}'`;
    if (!newQueryPart) return;
    let currentQuery = dom.queryInput.value.trim();
    dom.queryInput.value = (currentQuery && currentQuery.toLowerCase() !== 'pass')
        ? (currentQuery.endsWith('|') ? `${currentQuery} ${newQueryPart}` : `${currentQuery} | ${newQueryPart}`)
        : newQueryPart;
    updateActiveTab({ query: dom.queryInput.value });
    showAppMessage('Query updated. Click "Run Query".', 'info', true);
    dom.queryInput.focus();
}

export function handlePivotResultsToNewTab() {
    const sourceTab = getActiveTab();
    if (!sourceTab || !sourceTab.currentRawOutput?.trim()) {
        showAppMessage("No results available to pivot.", "warning");
        return;
    }
    const newTab = addTab();
    const sourceQuery = sourceTab.query.split('|').pop().trim() || "results";
    newTab.name = `Pivot: ${sourceQuery.substring(0, 15)}`;
    const dataSourceInfo = `Result of query on '${sourceTab.name}'`;
    handleNewData(newTab, sourceTab.currentRawOutput, dataSourceInfo);
    updateActiveTab({
        query: "pass",
        inputFormat: sourceTab.outputFormat,
        outputFormat: sourceTab.outputFormat,
    });
    switchTab(newTab.id).then(() => {
        dom.queryInput.value = "pass";
        dom.inputFormatSelect.value = sourceTab.outputFormat;
        dom.outputFormatSelect.value = sourceTab.outputFormat;
        showAppMessage(`Pivoted to new tab. Data source is now the previous query's result.`, 'info');
    });
}

export function handleInvestigateInPlace(encodedRuleQuery) {
    const ruleQuery = decodeURIComponent(encodedRuleQuery);
    updateActiveTab({ query: ruleQuery });
    dom.queryInput.value = ruleQuery;
    dom.shaperScriptsSelect.value = "";
    showAppMessage(`Query loaded. Running...`, 'info');
    runQueryHandler();
}

export function handlePivotToNewTab(sourceTabId, ruleName, encodedRuleQuery) {
    const sourceTab = getTabById(sourceTabId);
    if (!sourceTab) return;
    const ruleQuery = decodeURIComponent(encodedRuleQuery);
    const newTab = addTab();
    newTab.name = `Pivot: ${ruleName.substring(0, 15)}`;
    newTab.query = ruleQuery;
    newTab.inputFormat = sourceTab.inputFormat;
    newTab.outputFormat = sourceTab.outputFormat;
    newTab.dataLocation = sourceTab.dataLocation;
    newTab.dataSummary = sourceTab.dataSummary;
    if (sourceTab.dataLocation?.type === 'memory') newTab.rawData = sourceTab.rawData;
    switchTab(newTab.id).then(() => setTimeout(() => runQueryHandler(), 50));
}

export function populateTimelineFieldSelect(tab) {
    if (!tab || !dom.timelineFieldSelect) return;
    dom.timelineFieldSelect.innerHTML = '';
    if (tab.gridInstance?.config?.columns) {
        const columns = tab.gridInstance.config.columns;
        const potentialFields = columns.slice(columns[0]?.id === '_details_button' ? 1 : 0);
        if (potentialFields.length === 0) {
            dom.timelineFieldSelect.innerHTML = '<option value="">No fields available</option>';
            return;
        }
        potentialFields.forEach(col => {
            if (col.name) {
                const option = document.createElement('option');
                option.value = col.name;
                option.textContent = col.name;
                dom.timelineFieldSelect.appendChild(option);
            }
        });
        const defaultSelection = Array.from(dom.timelineFieldSelect.options).find(opt =>
            ['ts', 'timestamp', 'time', '_ts'].includes(opt.value.toLowerCase())
        ) || dom.timelineFieldSelect.options[0];
        if (defaultSelection) {
            defaultSelection.selected = true;
            tab.selectedTimelineField = defaultSelection.value;
        }
    } else {
        dom.timelineFieldSelect.innerHTML = '<option value="">Run query for table results</option>';
    }
}

export function updateTimelineToggleButton(tab) {
    if (!tab || !dom.toggleTimelineBtn) return;
    const hasGridResults = !!tab.gridInstance;
    dom.toggleTimelineBtn.classList.toggle('d-none', !hasGridResults);
    if (hasGridResults) {
        dom.toggleTimelineBtn.innerHTML = tab.timelineVisible
            ? '<i class="fa-solid fa-chart-line"></i> Hide Timeline'
            : '<i class="fa-solid fa-chart-line"></i> Show Timeline';
    }
}

export async function toggleTimelineVisibilityHandler() {
    const activeTab = getActiveTab();
    if (!activeTab) return;
    if (!activeTab.gridInstance) {
        showAppMessage("Timeline requires table results.", "warning");
        return;
    }
    activeTab.timelineVisible = !activeTab.timelineVisible;
    dom.timelineContainer.classList.toggle('d-none', !activeTab.timelineVisible);
    updateTimelineToggleButton(activeTab);
    if (activeTab.timelineVisible) {
        populateTimelineFieldSelect(activeTab);
        if (activeTab.timelineChartDataCache) {
            renderTimelineChart(activeTab, activeTab.timelineChartDataCache.labels, activeTab.timelineChartDataCache.datasets);
        } else {
            dom.timelineChartWrapper.classList.add('d-none');
        }
    }
}

export async function generateTimelineChartHandler() {
    const activeTab = getActiveTab();
    const superdbInstance = getSuperDB();
    if (!activeTab || !superdbInstance) return;
    const timestampField = dom.timelineFieldSelect.value;
    const interval = dom.timelineIntervalInput.value.trim();
    if (!timestampField || !interval) return;
    let inputForWasm = (activeTab.dataLocation?.type === 'memory') ? activeTab.rawData : '';
    if (activeTab.dataLocation?.type === 'indexeddb') inputForWasm = await getDataAsStream(activeTab.dataLocation.key);
    const timelineQuery = `switch (case grep("sentinel", this["_ResourceId"]) => grok("%{MONTHNUM:month}/%{MONTHDAY:day}/%{YEAR:year}, %{HOUR:hour}:%{MINUTE:minute}:%{SECOND:second} %{AMPM:ampm}",this['${timestampField}'],"AMPM (?:AM|PM)") | ts := cast(year, <string>) + "-" + (length(cast(month, <string>)) == 1 ? "0" + cast(month, <string>) : cast(month, <string>)) + "-" + (length(cast(day, <string>)) == 1 ? "0" + cast(day, <string>) : cast(day, <string>)) + " " +   (length(cast(hour, <string>)) == 1 ? "0" + cast(hour, <string>) : cast(hour, <string>)) + ":" + (length(cast(minute, <string>)) == 1 ? "0" + cast(minute, <string>) : cast(minute, <string>)) + ":" + cast(second, <string>) + " " + cast(ampm, <string>) | drop month, day, year, hour, minute, second, ampm | ts:=time(ts) default => ts:=time(this['${timestampField}']))| count() by every(${interval}) | sort ts`;
    dom.generateTimelineBtn.disabled = true;
    try {
        const result = await superdbInstance.run({ query: timelineQuery, input: inputForWasm, inputFormat: activeTab.inputFormat, outputFormat: "zjson" });
        const lines = result.trim().split('\n').filter(Boolean);
        const labels = [], dataCounts = [];
        lines.forEach(line => {
            try {
                const record = JSON.parse(line);
                if (record.value?.length === 2) {
                    labels.push(new Date(record.value[0]));
                    dataCounts.push(parseInt(record.value[1], 10));
                }
            } catch (e) {}
        });
        const chartDatasets = [{ label: `Count per ${interval}`, data: dataCounts, tension: 0.1, fill: true }];
        renderTimelineChart(activeTab, labels, chartDatasets);
        updateActiveTab({ timelineChartDataCache: { labels, datasets: chartDatasets } });
    } catch (error) {
        showAppMessage(`Timeline error: ${error.message}`, 'error', true);
    } finally {
        dom.generateTimelineBtn.disabled = false;
    }
}

export function renderTimelineChart(tab, labels, datasets) {
    if (tab.timelineChartInstance) {
        try { tab.timelineChartInstance.destroy(); } catch(e) {}
    }
    if (!dom.timelineChart) return;
    const ctx = dom.timelineChart.getContext('2d');
    
    tab.timelineChartInstance = new Chart(ctx, { 
        type: 'line', 
        data: { labels, datasets }, 
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'MMM dd, HH:mm:ss' },
                    title: { display: true, text: 'Timestamp', color: '#adb5bd'},
                    ticks: { color: '#adb5bd' }, 
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    title: { display: true, text: 'Count', color: '#adb5bd' },
                    beginAtZero: true,
                    ticks: { color: '#adb5bd', precision: 0 }, 
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#adb5bd' } },
                tooltip: { mode: 'index', intersect: false },
                zoom: {
                    zoom: {
                        wheel: { enabled: false },
                        drag: { enabled: true, modifierKey: null },
                        mode: 'x',
                        onZoomComplete: function({chart}) {
                            const activeTab = getActiveTab();
                            const timestampField = dom.timelineFieldSelect.value;
                            if (!activeTab || !timestampField) return;
                            const {min, max} = chart.scales.x;
                            const startTime = formatDateForZQ(min);
                            const endTime = formatDateForZQ(max);
                            const timeRangeQuery = `this['${timestampField}'] >= time(${startTime}) and this['${timestampField}'] <= time(${endTime})`;
                            let currentQuery = dom.queryInput.value.trim();
                            if (currentQuery && currentQuery.toLowerCase() !== 'pass') {
                                dom.queryInput.value = `${timeRangeQuery} | ${currentQuery}`;
                            } else {
                                dom.queryInput.value = timeRangeQuery;
                            }
                            updateActiveTab({ query: dom.queryInput.value });
                            showAppMessage(`Query updated for selected time range. Click 'Run Query'.`, 'info', true);
                        }
                    }
                }
            }
        }
    });

    dom.timelineChartWrapper.classList.remove('d-none');
    tab.timelineVisible = true;
    updateTimelineToggleButton(tab);
}

export function updateGraphToggleButton(tab) {
    if (!tab || !dom.toggleGraphBtn) return;
    const hasResults = tab.currentRawOutput && tab.currentRawOutput.trim() !== "";
    dom.toggleGraphBtn.classList.toggle('d-none', !hasResults);
    if (hasResults) {
        dom.toggleGraphBtn.innerHTML = tab.graphVisible
            ? '<i class="fa-solid fa-project-diagram"></i> Hide Graph'
            : '<i class="fa-solid fa-project-diagram"></i> Visualize';
    }
}

export function toggleGraphVisibilityHandler() {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.currentRawOutput) {
        showAppMessage("No data to visualize.", "warning");
        return;
    }
    if (typeof window.cytoscape === 'undefined') {
        showAppMessage("Visualization library not loaded.", "error");
        return;
    }
    activeTab.graphVisible = !activeTab.graphVisible;
    dom.graphContainer.classList.toggle('d-none', !activeTab.graphVisible);
    updateGraphToggleButton(activeTab);
    if (activeTab.graphVisible) {
        if (activeTab.cyInstance) {
            activeTab.cyInstance.resize();
            activeTab.cyInstance.fit();
            return;
        }
        try {
            const records = parseResultForTable(activeTab.currentRawOutput, 'zjson');
            if (!records?.dataRows?.length) {
                 showAppMessage("Could not parse records for graph.", "warning");
                 return;
            }
            const zjsonObjects = records.dataRows.map(row => {
                const obj = {};
                records.headers.forEach((h, i) => obj[h] = row[i]);
                return obj;
            });
            renderLateralMovementGraph(activeTab, zjsonObjects);
        } catch (error) {
            showAppMessage(`Graph error: ${error.message}`, "error", true);
        }
    }
}

export function renderLateralMovementGraph(tab, records) {
    if (typeof window.cytoscape === 'undefined') return;
    if (tab.cyInstance) { try { tab.cyInstance.destroy(); } catch(e) {} }

    const elements = [];
    const existingNodes = new Set();
    const addNode = (id, label, type) => {
        if (id && !existingNodes.has(id)) {
            elements.push({ group: 'nodes', data: { id, label, type } });
            existingNodes.add(id);
        }
    };
    records.forEach(rec => {
        const eventId = String(rec.EventID);
        const computer = rec.Computer || 'Unknown Host';
        const user = rec.TargetUserName || rec.User;
        const ip = rec.IpAddress || rec.WorkstationName;
        if (!ip || !user || !computer) return;
        addNode(ip, ip, 'ip');
        addNode(computer, computer, 'computer');
        addNode(user, user, 'user');
        if (eventId === '4624' || eventId === '4625') {
            elements.push({ group: 'edges', data: { source: ip, target: computer, label: `EID: ${eventId}`, class: eventId === '4624' ? 'logon-success' : 'logon-fail' } });
        }
    });
    if (elements.filter(el => el.group === 'nodes').length === 0) {
        showAppMessage("No recognizable entities for graph.", "info");
        return;
    }
    tab.cyInstance = window.cytoscape({ container: dom.cyContainer, elements: elements, style: [ /* graph styles */ ], layout: { name: 'cose' } });
}

export function toggleFocusModeHandler() {
    document.body.classList.toggle('focus-mode');
    const icon = dom.focusModeBtn.querySelector('i');
    if (document.body.classList.contains('focus-mode')) {
        dom.focusModeBtn.title = "Exit Focus Mode";
        icon.classList.replace('fa-expand', 'fa-compress');
    } else {
        dom.focusModeBtn.title = "Toggle Focus Mode";
        icon.classList.replace('fa-compress', 'fa-expand');
    }
    window.dispatchEvent(new Event('resize'));
}

export function startTour() {
    dom.tourOverlay.style.display = 'block';
    showTourStep(0);
}

export function endTour() {
    const step = tourSteps[currentTourStep];
    if (step?.element) {
        document.querySelector(step.element)?.classList.remove('tour-highlight');
    }
    dom.tourOverlay.style.display = 'none';
    dom.tourTooltip.style.display = 'none';
}

export function showTourStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= tourSteps.length) {
        endTour();
        return;
    }
    const prevStep = tourSteps[currentTourStep];
    if (prevStep?.element) {
        document.querySelector(prevStep.element)?.classList.remove('tour-highlight');
    }
    currentTourStep = stepIndex;
    const step = tourSteps[stepIndex];
    const element = document.querySelector(step.element);
    if (element) {
        element.classList.add('tour-highlight');
        const rect = element.getBoundingClientRect();
        dom.tourTooltip.style.display = 'block';
        dom.tourContent.innerHTML = step.content;
        dom.tourTooltip.style.top = `${rect.bottom + 10 + window.scrollY}px`;
        dom.tourTooltip.style.left = `${rect.left + window.scrollX}px`;
    }
    dom.tourPrev.disabled = stepIndex === 0;
    dom.tourNext.textContent = stepIndex === tourSteps.length - 1 ? 'Finish' : 'Next';
}

export function advanceTour() {
    showTourStep(currentTourStep + 1);
}

export function retreatTour() {
    showTourStep(currentTourStep - 1);
}

function buildCyberChefUrl(inputValue, operationOrRecipe, isCustom = false) {
    const baseUrl = 'https://gchq.github.io/CyberChef/';
    const encodedInput = btoa(unescape(encodeURIComponent(String(inputValue))));
    let recipe = '';
    if (isCustom) {
        recipe = operationOrRecipe;
    } else {
        switch (operationOrRecipe) {
            case 'to_cyberchef_raw': recipe = ""; break;
            case 'magic': recipe = "Magic(3,true,false,'')"; break;
            case 'defang': recipe = "Defang_IP_Addresses()"; break;
            case 'from_base64': recipe = "From_Base64('A-Za-z0-9+/=',true,false)"; break;
            case 'url_decode': recipe = "URL_Decode()"; break;
        }
    }
    return `${baseUrl}#input=${encodedInput}&recipe=${encodeURIComponent(recipe)}`;
}

export function showCyberChefOperationsMenu(anchorElement) {
    if (!dom.cyberChefOperationsDropdownElement) return;
    dom.cyberChefOperationsDropdownElement.innerHTML = '';
    const operations = [
        { label: 'To CyberChef (Raw)', op: 'to_cyberchef_raw' },
        { label: 'Magic (Detect)', op: 'magic' },
        { label: 'Defang', op: 'defang' },
        { label: 'From Base64', op: 'from_base64' },
        { label: 'URL Decode', op: 'url_decode' },
    ];
    operations.forEach(item => {
        const menuItemLink = document.createElement('a');
        menuItemLink.href = '#';
        menuItemLink.className = 'dropdown-item';
        menuItemLink.textContent = item.label;
        menuItemLink.onclick = (e) => {
            e.preventDefault();
            const url = buildCyberChefUrl(currentFieldValueForCyberChef, item.op);
            if (url) window.open(url, '_blank');
            hideCyberChefOperationsMenu();
        };
        dom.cyberChefOperationsDropdownElement.appendChild(menuItemLink);
    });
    const divider = document.createElement('hr');
    divider.className = 'dropdown-divider';
    dom.cyberChefOperationsDropdownElement.appendChild(divider);
    const customRecipeItem = document.createElement('a');
    customRecipeItem.href = '#';
    customRecipeItem.className = 'dropdown-item';
    customRecipeItem.textContent = 'Enter Custom Recipe...';
    customRecipeItem.onclick = (e) => {
        e.preventDefault();
        hideCyberChefOperationsMenu();
        if (cyberChefCustomRecipeModal) cyberChefCustomRecipeModal.show();
    };
    dom.cyberChefOperationsDropdownElement.appendChild(customRecipeItem);
    const rect = anchorElement.getBoundingClientRect();
    dom.cyberChefOperationsDropdownElement.style.display = 'block';
    dom.cyberChefOperationsDropdownElement.style.top = `${rect.bottom + window.scrollY}px`;
    dom.cyberChefOperationsDropdownElement.style.left = `${rect.left + window.scrollX}px`;
    setTimeout(() => document.addEventListener('click', handleClickOutsideCyberChefMenu, true), 0);
}

function hideCyberChefOperationsMenu() {
    if (dom.cyberChefOperationsDropdownElement) {
        dom.cyberChefOperationsDropdownElement.style.display = 'none';
    }
    document.removeEventListener('click', handleClickOutsideCyberChefMenu, true);
}

function handleClickOutsideCyberChefMenu(event) {
    const isCyberChefAction = event.target.closest('.cyberchef-action-btn');
    if (dom.cyberChefOperationsDropdownElement && !dom.cyberChefOperationsDropdownElement.contains(event.target) && !isCyberChefAction) {
        hideCyberChefOperationsMenu();
    }
}

export function handleApplyCustomCyberChefRecipe() {
    const customRecipe = dom.customCyberChefRecipeInput.value.trim();
    if (!customRecipe) return;
    const url = buildCyberChefUrl(currentFieldValueForCyberChef, customRecipe, true);
    if (url) window.open(url, '_blank');
    if (cyberChefCustomRecipeModal) cyberChefCustomRecipeModal.hide();
}

export function handleCyberChefButtonClick(event) {
    const button = event.target.closest('.cyberchef-action-btn');
    if (!button) return;
    const encodedFieldValue = button.dataset.fieldValue;
    currentFieldValueForCyberChef = decodeURIComponent(encodedFieldValue);
    showCyberChefOperationsMenu(button);
}