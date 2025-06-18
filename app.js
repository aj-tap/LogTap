import { SuperDB } from './index.js';
import { openDB } from './db.js';
import { dom } from './config.js';
import { showAppMessage } from './ui.js';
import { initializeTabs } from './tabManager.js';
import { setupEventListeners } from './eventListeners.js';
import { loadQueryHistory, initializeModals, initializeTooltips } from './components.js';
import { initializeShaperScriptsSelect, initializePredefinedRulesSelect, initializeEvtxWasm } from './utils.js';

let superdbInstance = null;

export async function initializeApp() {
    if (!SuperDB) {
        document.querySelector('body').innerHTML = `<div class="vh-100 d-flex align-items-center justify-content-center text-bg-danger p-5"><div class="text-center"><h1 class="display-4 fw-bold mb-4">Critical Error</h1><p class="lead">SuperDB Wasm module failed to load. The application cannot start.</p></div></div>`;
        return;
    }
    try {
        await openDB();
        await initializeEvtxWasm();
        initializeModals();
        initializeTooltips();
        await initializeShaperScriptsSelect();
        await initializePredefinedRulesSelect();
        loadQueryHistory();
        superdbInstance = await SuperDB.instantiate("superdb.wasm");
        initializeTabs();
        setupEventListeners();
        dom.runQueryBtn.disabled = false;
        dom.addTabBtn.disabled = false;
        dom.loadTestDataBtn.disabled = false;
        dom.applyShaperBtn.disabled = false;
        dom.runQueryBtn.innerHTML = '<i class="fa-solid fa-play me-2"></i>Run Query';
        showAppMessage('LogTap Viewer ready.', 'success');
    } catch (error) {
        console.error('[LogTap] A critical error occurred during initialization:', error);
        showAppMessage(`Critical Error: App initialization failed: ${error.message}. Check console for details.`, 'error', true);
    }
}

export function getSuperDB() {
    if (!superdbInstance) {
        throw new Error("SuperDB has not been instantiated.");
    }
    return superdbInstance;
}