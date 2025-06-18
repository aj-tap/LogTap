import { dom } from './config.js';
import { getActiveTab, updateActiveTab } from './state.js';
import { addTab, saveActiveTabData, renderTabs } from './tabManager.js';
import { applyShaperScriptHandler, runQueryHandler, processEvtxFiles, handleNewData } from './dataHandlers.js';
import { runScannerHandler, cancelScanHandler } from './scanner.js';
import {
    clearQueryHistory, copyRowDetailsToClipboardHandler, createQueryFromDetail,
    handlePivotResultsToNewTab, handleInvestigateInPlace, handlePivotToNewTab,
    toggleTimelineVisibilityHandler, toggleGraphVisibilityHandler, generateTimelineChartHandler,
    toggleFocusModeHandler, startTour, endTour, advanceTour, retreatTour,
    handleApplyCustomCyberChefRecipe, handleCyberChefButtonClick, hideRowDetailsModal
} from './components.js';
import { exportResultsHandler, parseAndSetScannerRules, loadScannerRulesFromFile } from './utils.js';
import { showAppMessage, toggleResultsViewHandler } from './ui.js';

export function setupEventListeners() {
    dom.runQueryBtn.addEventListener('click', () => runQueryHandler());
    dom.addTabBtn.addEventListener('click', addTab);
    dom.applyShaperBtn.addEventListener('click', applyShaperScriptHandler);
    dom.exportBtn.addEventListener('click', exportResultsHandler);
    dom.runScannerBtn.addEventListener('click', runScannerHandler);
    dom.cancelScanBtn.addEventListener('click', cancelScanHandler);
    dom.loadPredefinedRuleBtn.addEventListener('click', () => {
        const activeTab = getActiveTab();
        if (!activeTab) return;
        const selectedFile = dom.predefinedRulesSelect.value;
        if (selectedFile) {
            const selectedText = dom.predefinedRulesSelect.options[dom.predefinedRulesSelect.selectedIndex].text;
            loadScannerRulesFromFile(`rules/${selectedFile}`, selectedText, activeTab);
        }
    });
    dom.toggleViewBtn.addEventListener('click', toggleResultsViewHandler);
    dom.toggleTimelineBtn.addEventListener('click', toggleTimelineVisibilityHandler);
    dom.toggleGraphBtn.addEventListener('click', toggleGraphVisibilityHandler);
    dom.focusModeBtn.addEventListener('click', toggleFocusModeHandler);
    dom.loadTestDataBtn.addEventListener('click', async () => {
        const activeTab = getActiveTab();
        if (!activeTab) return;
        try {
            const response = await fetch('test_data.zjson');
            const data = await response.text();
            handleNewData(activeTab, data, 'test_data.zjson');
            updateActiveTab({ name: 'test_data.zjson', inputFormat: 'zjson' });
            dom.inputFormatSelect.value = 'zjson';
            renderTabs();
        } catch (error) {
            showAppMessage(`Failed to load test data: ${error.message}`, 'error', true);
        }
    });
    dom.dataInput.addEventListener('paste', async (event) => {
        event.preventDefault();
        const activeTab = getActiveTab();
        if (!activeTab) return;
        const pastedData = (event.clipboardData || window.clipboardData).getData('text');
        await handleNewData(activeTab, pastedData, 'Pasted Data');
    });
    dom.fileInput.addEventListener('change', async (event) => {
        const activeTab = getActiveTab();
        if (!activeTab) return;
        const files = event.target.files;
        if (!files || files.length === 0) return;
        const evtxFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.evtx'));
        const otherFiles = Array.from(files).filter(f => !f.name.toLowerCase().endsWith('.evtx'));
        if (evtxFiles.length > 0) await processEvtxFiles(evtxFiles, activeTab);
        for (const file of otherFiles) {
            const newTab = (files.length > 1) ? addTab() : activeTab;
            updateActiveTab({ name: file.name });
            renderTabs();
            const reader = new FileReader();
            reader.onload = (e) => handleNewData(newTab, e.target.result, file.name);
            reader.onerror = () => showAppMessage(`Error reading ${file.name}.`, 'error', true);
            reader.readAsText(file);
        }
        dom.fileInput.value = "";
    });
    dom.scannerRuleFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        const activeTab = getActiveTab();
        if (file && activeTab) {
            const reader = new FileReader();
            reader.onload = (e) => parseAndSetScannerRules(e.target.result, file.name, activeTab);
            reader.readAsText(file);
        }
        dom.scannerRuleFileInput.value = "";
    });
    dom.queryInput.addEventListener('input', () => {
        const tab = getActiveTab();
        if (tab) tab.query = dom.queryInput.value;
    });
    dom.inputFormatSelect.addEventListener('change', (event) => {
        updateActiveTab({ inputFormat: event.target.value });
    });
    dom.outputFormatSelect.addEventListener('change', (event) => {
        updateActiveTab({ outputFormat: event.target.value });
    });
    dom.queryHistorySelect.addEventListener('change', (event) => {
        const activeTab = getActiveTab();
        if (!activeTab || !event.target.value) return;
        activeTab.query = event.target.value;
        dom.queryInput.value = event.target.value;
        showAppMessage('Query loaded from history.', 'info');
    });
    dom.clearHistoryBtn.addEventListener('click', clearQueryHistory);
    dom.copyRowDetailsBtn.addEventListener('click', copyRowDetailsToClipboardHandler);
    dom.pivotResultsBtn.addEventListener('click', handlePivotResultsToNewTab);
    dom.generateTimelineBtn.addEventListener('click', generateTimelineChartHandler);
    dom.scannerHitsOutput.addEventListener('click', (event) => {
        const pivotButton = event.target.closest('.pivot-button');
        if (pivotButton) {
            const { ruleName, ruleQuery, sourceTabId } = pivotButton.dataset;
            handlePivotToNewTab(sourceTabId, ruleName, ruleQuery);
            return;
        }
        const investigateButton = event.target.closest('.investigate-button');
        if (investigateButton) handleInvestigateInPlace(investigateButton.dataset.ruleQuery);
    });
    dom.rowDetailsModalBody.addEventListener('click', (event) => {
        const filterTarget = event.target.closest('.filter-action');
        if (filterTarget) {
            event.preventDefault();
            const { column, value, op } = filterTarget.dataset;
            createQueryFromDetail(op, column, value);
            hideRowDetailsModal();
            return;
        }
        const cyberChefTarget = event.target.closest('.cyberchef-action-btn');
        if (cyberChefTarget) {
            handleCyberChefButtonClick(event);
        }
    });
    dom.helpBtn.addEventListener('click', startTour);
    dom.tourNext.addEventListener('click', advanceTour);
    dom.tourPrev.addEventListener('click', retreatTour);
    dom.tourEnd.addEventListener('click', endTour);
    dom.applyCustomCyberChefRecipeBtn.addEventListener('click', handleApplyCustomCyberChefRecipe);
    window.addEventListener('beforeunload', () => saveActiveTabData());
}