import { dom, config } from './config.js';
import { getTabsState, setTabsState, getActiveTabId, setActiveTabId, getNextTabId, incrementNextTabId, getActiveTab, getTabById } from './state.js';
import { showAppMessage, updateResultDisplay, populateSelect } from './ui.js';
import { deleteData } from './db.js';
import { terminateScannerWorker } from './scanner.js';

export function initializeTabs() {
    const tabs = [createNewTabState(1)];
    tabs[0].isActive = true;
    setTabsState(tabs);
    setActiveTabId(tabs[0].id);
    renderTabs();
    loadTabData(getActiveTabId());
}

export function createNewTabState(nameSuffix) {
    const newTabId = `tab-${getNextTabId()}`;
    incrementNextTabId();
    return {
        id: newTabId,
        name: `Log ${nameSuffix}`,
        isActive: false,
        originalDataSource: null,
        dataLocation: { type: 'empty' },
        dataSummary: 'No data loaded.',
        query: "pass",
        inputFormat: "auto",
        outputFormat: "zjson",
        currentRawOutput: null,
        gridInstance: null,
        cyInstance: null,
        timelineChartInstance: null,
        scannerRules: [],
        scannerRuleFileName: "No scanner rules loaded. Please choose a predefined rule set or upload a custom rule set (in YAML format).",
        predefinedRulesSelectValue: "",
        scannerHitsHTML: "",
        timelineVisible: false,
        selectedTimelineField: '',
        timelineInterval: '1h',
        timelineChartDataCache: null,
        graphVisible: false,
    };
}

export function renderTabs() {
    const tabsState = getTabsState();
    if (!dom.logTabsContainer) return;
    dom.logTabsContainer.innerHTML = '';
    tabsState.forEach(tab => {
        const navLink = document.createElement('button');
        navLink.className = `nav-link w-100 d-flex align-items-center ${tab.isActive ? 'active' : ''}`;
        navLink.dataset.tabId = tab.id;
        navLink.type = 'button';
        const tabNameSpan = document.createElement('span');
        tabNameSpan.textContent = tab.name;
        tabNameSpan.className = 'text-truncate me-auto';
        navLink.appendChild(tabNameSpan);
        if (tabsState.length > 1) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.innerHTML = '&times;';
            closeBtn.className = 'btn-close btn-close-white ms-2 p-0 px-1';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                closeTab(tab.id);
            };
            navLink.appendChild(closeBtn);
        }
        navLink.addEventListener('click', () => switchTab(tab.id));
        dom.logTabsContainer.appendChild(navLink);
    });
}

export function saveActiveTabData() {
    console.groupCollapsed(`%c[STATE] saveActiveTabData triggered`, 'color: gray');
    const activeTab = getActiveTab();
    if (!activeTab) {
        console.log("No active tab, aborting save.");
        console.groupEnd();
        return;
    }
    console.log(`Saving state for tab: ${activeTab.name} (${activeTab.id})`);
    activeTab.query = dom.queryInput.value;
    activeTab.inputFormat = dom.inputFormatSelect.value;
    activeTab.outputFormat = dom.outputFormatSelect.value;
    console.log(`Saved query: "${activeTab.query}"`);
    console.groupEnd();
}

export async function loadTabData(tabId) {
    const tab = getTabById(tabId);
    if (!tab) return;
    dom.queryInput.value = tab.query;
    dom.dataInput.value = (tab.dataLocation?.type === 'memory') ? tab.originalDataSource : '';
    showAppMessage(`tab.dataLocation?.type (tabManager): ${tab.dataLocation?.type}`, 'info');
    dom.dataInput.placeholder = (tab.dataLocation?.type === 'indexeddb') ?
        `Large data stored in database (${tab.dataSummary}).` : "Paste log data here...";
    dom.dataInput.disabled = (tab.dataLocation?.type === 'indexeddb');
    populateSelect(dom.inputFormatSelect, config.inputFormats, tab.inputFormat);
    populateSelect(dom.outputFormatSelect, config.outputFormats, tab.outputFormat);
    dom.fileNameDisplay.textContent = tab.dataSummary;
    dom.scannerRuleFileNameDisplay.textContent = tab.scannerRuleFileName;
    dom.predefinedRulesSelect.value = tab.predefinedRulesSelectValue;

    if (tab.gridInstance) { try { tab.gridInstance.destroy(); } catch (e) {} }
    tab.gridInstance = null;
    
    if (tab.timelineChartInstance) { try { tab.timelineChartInstance.destroy(); } catch (e) {} }
    tab.timelineChartInstance = null;

    if (tab.cyInstance) { try { tab.cyInstance.destroy(); } catch (e) {} }
    tab.cyInstance = null;

    dom.scannerHitsOutput.innerHTML = tab.scannerHitsHTML || '';
    const hasHits = tab.scannerHitsHTML && tab.scannerHitsHTML.trim() !== '';
    dom.scannerHitsOutput.classList.toggle('d-none', !hasHits);
    dom.noScannerHitsMessage.classList.toggle('d-none', hasHits);
    const hasData = tab.dataLocation?.type !== 'empty';
    dom.runScannerBtn.disabled = !(tab.scannerRules?.length > 0 && hasData);
    updateResultDisplay(tab);
}

export async function switchTab(tabId) {
    const currentActiveId = getActiveTabId();
    if (currentActiveId === tabId) return;
    if (currentActiveId) {
        saveActiveTabData();
    }
    getTabsState().forEach(tab => tab.isActive = (tab.id === tabId));
    setActiveTabId(tabId);
    renderTabs();
    await loadTabData(tabId);
}

export function addTab() {
    saveActiveTabData();
    const tabs = getTabsState();
    const newTab = createNewTabState(tabs.length + 1);
    tabs.push(newTab);
    setTabsState(tabs);
    switchTab(newTab.id);
    return newTab;
}

export async function closeTab(tabIdToClose) {
    let tabs = getTabsState();
    if (tabs.length <= 1) {
        showAppMessage("Cannot close the last tab.", "warning");
        return;
    }
    saveActiveTabData();
    const tabIndex = tabs.findIndex(tab => tab.id === tabIdToClose);
    if (tabIndex === -1) return;
    const tabToClose = tabs[tabIndex];

    if (tabToClose.dataLocation?.type === 'indexeddb' && tabToClose.dataLocation.key) {
        try {
            await deleteData(tabToClose.dataLocation.key);
        }
        catch (dbError) {
            showAppMessage(`Error deleting stored data: ${dbError.message}`, 'error');
        }
    }
    if (tabToClose.gridInstance) { try { tabToClose.gridInstance.destroy(); } catch(e) {} }
    if (tabToClose.timelineChartInstance) { try { tabToClose.timelineChartInstance.destroy(); } catch(e) {} }
    if (tabToClose.cyInstance) { try { tabToClose.cyInstance.destroy(); } catch(e) {} }
    
    terminateScannerWorker(tabIdToClose);

    const wasActive = tabToClose.isActive;
    tabs.splice(tabIndex, 1);
    setTabsState(tabs);

    if (wasActive) {
        const newActiveIndex = Math.max(0, tabIndex - 1);
        const newActiveTabId = tabs[newActiveIndex].id;
        setActiveTabId(newActiveTabId);
        tabs[newActiveIndex].isActive = true;
        await loadTabData(newActiveTabId);
    }
    renderTabs();
}
