let tabsState = [];
let activeTabId = null;
let nextTabId = 1;
let scannerWorker = null;
let evtxWasmReady = false;

export function getTabsState() { return tabsState; }
export function setTabsState(newTabsState) { tabsState = newTabsState; }

export function getActiveTabId() { return activeTabId; }
export function setActiveTabId(id) { activeTabId = id; }

export function getNextTabId() { return nextTabId; }
export function incrementNextTabId() { nextTabId++; }

export function getActiveTab() {
    return tabsState.find(tab => tab.id === activeTabId);
}

export function updateActiveTab(props) {
    const tab = getActiveTab();
    if (tab) {
        Object.assign(tab, props);
    }
}

export function getTabById(id) {
    return tabsState.find(tab => tab.id === id);
}

export function getScannerWorker() { return scannerWorker; }
export function setScannerWorker(worker) { scannerWorker = worker; }

export function isEvtxWasmReady() { return evtxWasmReady; }
export function setEvtxWasmReady(isReady) { evtxWasmReady = isReady; }