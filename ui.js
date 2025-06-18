import { dom } from './config.js';
import { getActiveTab } from './state.js';
import { parseResultForTable } from './utils.js';
import { updateTimelineToggleButton, populateTimelineFieldSelect, renderTimelineChart, showRowDetails, updateGraphToggleButton } from './components.js';

export function showAppMessage(message, type = 'info', isSticky = false) {
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

export function hideAppMessage() {
    if (dom.statusMessage) dom.statusMessage.classList.add('d-none');
}

export function populateSelect(selectElement, options, selectedValue, valueKey = 'value', textKey = 'text') {
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

export function updateResultDisplay(tab) {
    if (!tab) return;
    dom.tableResultOutputContainer.classList.add('d-none');
    dom.textResultOutput.classList.add('d-none');
    dom.noResultsMessage.classList.add('d-none');
    dom.toggleViewBtn.classList.add('d-none');
    dom.pivotResultsBtn.classList.add('d-none');
    dom.toggleGraphBtn.classList.add('d-none');
    dom.exportBtn.disabled = true;
    const hasResults = tab.currentRawOutput && tab.currentRawOutput.trim() !== "";
    if (hasResults) dom.toggleGraphBtn.classList.remove('d-none');

    if (tab.gridInstance) {
        dom.tableResultOutputContainer.classList.remove('d-none');
        dom.toggleViewBtn.textContent = "View Raw";
        dom.toggleViewBtn.classList.remove('d-none');
        dom.pivotResultsBtn.classList.remove('d-none');
        dom.exportBtn.disabled = false;
    } else if (hasResults) {
        dom.resultOutputCode.textContent = tab.currentRawOutput;
        dom.textResultOutput.classList.remove('d-none');
        dom.pivotResultsBtn.classList.remove('d-none');
        dom.exportBtn.disabled = false;
        const canBeTable = parseResultForTable(tab.currentRawOutput, tab.outputFormat);
        if (canBeTable) {
            dom.toggleViewBtn.textContent = "View Table";
            dom.toggleViewBtn.classList.remove('d-none');
        }
    } else {
        dom.noResultsMessage.classList.remove('d-none');
    }

    const hasGridResults = !!tab.gridInstance;
    updateTimelineToggleButton(tab);
    if (!hasGridResults && tab.timelineVisible) {
        tab.timelineVisible = false;
        dom.timelineContainer.classList.add('d-none');
        if (tab.timelineChartInstance) {
            tab.timelineChartInstance.destroy();
            tab.timelineChartInstance = null;
        }
        tab.timelineChartDataCache = null;
    } else if (hasGridResults) {
        populateTimelineFieldSelect(tab);
        if (tab.timelineVisible && tab.timelineChartDataCache) {
            renderTimelineChart(tab, tab.timelineChartDataCache.labels, tab.timelineChartDataCache.datasets);
        } else if (tab.timelineVisible && !tab.timelineChartDataCache) {
            dom.timelineChartWrapper.classList.add('d-none');
        }
    }
    updateGraphToggleButton(tab);
    dom.timelineContainer.classList.toggle('d-none', !tab.timelineVisible || !hasGridResults);
    dom.graphContainer.classList.toggle('d-none', !tab.graphVisible);
}

export function displayTableWithGridJs(parsedData, containerElement, tab) {
    if (tab.gridInstance) {
        try { tab.gridInstance.destroy(); }
        catch (e) {}
    }
    containerElement.innerHTML = '';
    
    if (!parsedData || !parsedData.headers || !parsedData.dataRows) {
        tab.gridInstance = null;
        return;
    }
    if (typeof gridjs === 'undefined') {
        showAppMessage("Error: Table library (Grid.js) not loaded.", "error", true);
        tab.gridInstance = null;
        return;
    }
    
    const { headers, dataRows } = parsedData;
    const gridColumns = headers.map(header => ({ name: String(header) }));
    
    gridColumns.unshift({
        name: 'Details',
        width: '80px',
        sort: false,
        formatter: (cell, row) => gridjs.h('button', {
            className: 'btn btn-sm btn-outline-info py-0 px-1',
            title: 'Show row details',
            onClick: () => showRowDetails(row, gridColumns)
        }, gridjs.html('<i class="fa-solid fa-circle-info"></i>'))
    });

    const dataWithDetailsPlaceholder = dataRows.map(row => [null, ...row]);

    try {
        tab.gridInstance = new gridjs.Grid({
            columns: gridColumns,
            data: dataWithDetailsPlaceholder,
            search: { debounceTimeout: 250 },
            sort: true,
            pagination: { enabled: true, limit: 100, summary: true },
            resizable: true,
            fixedHeader: true,
            height: '60vh',
        }).render(containerElement);
    } catch (gridError) {
        showAppMessage(`Error displaying results table: ${gridError.message}`, 'error', true);
        tab.gridInstance = null;
    }
}

export function lockUI(isLocked, message = '') {
    const elementsToDisable = [
        dom.runQueryBtn, dom.exportBtn, dom.runScannerBtn, dom.addTabBtn,
        dom.loadTestDataBtn, dom.loadPredefinedRuleBtn, dom.applyShaperBtn,
        dom.fileInput, dom.dataInput, dom.queryInput, dom.shaperScriptsSelect
    ];
    elementsToDisable.forEach(el => { if (el) el.disabled = isLocked; });
    if (isLocked) showAppMessage(message, 'info', true);
    else hideAppMessage();
}

export function toggleResultsViewHandler() {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.currentRawOutput) return;

    if (activeTab.gridInstance) {
        try { activeTab.gridInstance.destroy(); } catch(e){}
        activeTab.gridInstance = null;
        dom.tableResultOutputContainer.innerHTML = '';
    } else {
        const tableData = parseResultForTable(activeTab.currentRawOutput, activeTab.outputFormat);
        if (tableData) {
            displayTableWithGridJs(tableData, dom.tableResultOutputContainer, activeTab);
        } else {
            showAppMessage('Cannot display as table. Output might be an error or unsuitable format.', 'warning');
        }
    }
    updateResultDisplay(activeTab);
}