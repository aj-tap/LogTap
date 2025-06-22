import { initializeApp } from './app.js';
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();

    const collapseControlPanelBtn = document.getElementById('collapseControlPanelBtn');
    const controlPanel = document.querySelector('.control-panel');

    if (collapseControlPanelBtn && controlPanel) {
        // Load the collapsed state from local storage
        const isCollapsed = localStorage.getItem('controlPanelCollapsed') === 'true';
        if (isCollapsed) {
            controlPanel.classList.add('collapsed');
        }

        // Add click event listener to the collapse button
        collapseControlPanelBtn.addEventListener('click', () => {
            controlPanel.classList.toggle('collapsed');
            const isCurrentlyCollapsed = controlPanel.classList.contains('collapsed');
            localStorage.setItem('controlPanelCollapsed', isCurrentlyCollapsed);
        });
    }

    // Import QueryHistory class
    const queryHistory = new QueryHistory();

    // Function to save query
    const saveQueryBtn = document.getElementById('saveQueryBtn');
    if (saveQueryBtn) {
        saveQueryBtn.addEventListener('click', () => {
            const queryInput = document.getElementById('queryInput');
            if (queryInput) {
                const query = queryInput.value.trim();
                if (query) {
                    queryHistory.addQuery(query);
                    loadQueryHistoryItems();
                }
            }
        });
    }

    const LOCAL_QUERIES_KEY = 'localQueries';

    // Function to handle local queries
    const localQueriesSelect = document.getElementById('localQueriesSelect');
    const addLocalQueryBtn = document.getElementById('addLocalQueryBtn');
    if (addLocalQueryBtn && localQueriesSelect) {
        addLocalQueryBtn.addEventListener('click', () => {
            askForLocalQueries();
        });

        localQueriesSelect.addEventListener('change', () => {
            const queryInput = document.getElementById('queryInput');
            if (queryInput) {
                queryInput.value = localQueriesSelect.value;
            }
        });

        // Load local queries from localStorage
        loadLocalQueries();

        const loadLocalQueriesBtn = document.getElementById('loadLocalQueriesBtn');
        const loadLocalQueriesFile = document.getElementById('loadLocalQueriesFile');

        loadLocalQueriesBtn.addEventListener('click', () => {
            loadLocalQueriesFile.click();
        });

        loadLocalQueriesFile.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const yamlContent = e.target.result;
                    try {
                        const queries = jsyaml.load(yamlContent);
                        if (Array.isArray(queries)) {
                            queries.forEach(query => {
                                addLocalQuery(query);
                            });
                        } else {
                            alert("Invalid YAML file: queries must be an array.");
                        }
                    } catch (error) {
                        alert("Error loading YAML file: " + error);
                    }
                }
                reader.readAsText(file);
            }
        });
    }

    function askForLocalQueries() {
        const query = prompt("Enter local query to save:");
        if (query) {
            addLocalQuery(query);
        }
    }

    function addLocalQuery(query) {
        if (!query) return;

        const option = document.createElement('option');
        option.value = query;
        option.text = query;
        localQueriesSelect.add(option);

        saveLocalQueries();
    }

    function loadLocalQueries() {
        const savedQueries = localStorage.getItem(LOCAL_QUERIES_KEY);
        if (savedQueries) {
            const queries = JSON.parse(savedQueries);
            queries.forEach(query => {
                addLocalQuery(query);
            });
        }
    }

    function saveLocalQueries() {
        const queries = Array.from(localQueriesSelect.options).map(option => option.value);
        localStorage.setItem(LOCAL_QUERIES_KEY, JSON.stringify(queries));
    }

    // Function to load query history items into the dropdown
    const queryHistoryList = document.getElementById('queryHistoryList');
    function loadQueryHistoryItems() {
        if (queryHistoryList) {
            // Clear existing items
            queryHistoryList.innerHTML = '';

            // Get history
            const history = queryHistory.getHistory();

            // Add history items to the dropdown
            history.forEach(queryText => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');
                link.classList.add('dropdown-item');
                link.href = '#';
                link.textContent = queryText;
                listItem.appendChild(link);
                queryHistoryList.appendChild(listItem);

                // Add click event listener to load query into input
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const queryInput = document.getElementById('queryInput');
                    if (queryInput) {
                        queryInput.value = queryText;
                    }
                });
            });

            if (history.length === 0) {
                const listItem = document.createElement('li');
                listItem.innerHTML = '<span class="dropdown-item disabled">No queries saved</span>';
                queryHistoryList.appendChild(listItem);
            }
        }
    }

    // Load query history on DOMContentLoaded
    loadQueryHistoryItems();
});

import QueryHistory from './queryHistory.js';

function clearLocalQueries() {
    const localQueriesSelect = document.getElementById('localQueriesSelect');
    if (localQueriesSelect) {
        while (localQueriesSelect.options.length > 0) {
            localQueriesSelect.remove(0);
        }
        localStorage.removeItem('localQueries');
    }
}

const clearLocalQueriesBtn = document.getElementById('clearLocalQueriesBtn');
if (clearLocalQueriesBtn) {
    clearLocalQueriesBtn.addEventListener('click', clearLocalQueries);
}
