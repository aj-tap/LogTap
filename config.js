export const dom = {
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
    focusModeBtn: document.getElementById('focusModeBtn'),
    rowDetailsModal: document.getElementById('rowDetailsModal'),
    rowDetailsModalBody: document.getElementById('rowDetailsModalBody'),
    copyRowDetailsBtn: document.getElementById('copyRowDetailsBtn'),
    timelineContainer: document.getElementById('timelineContainer'),
    timelineFieldSelect: document.getElementById('timelineFieldSelect'),
    timelineIntervalInput: document.getElementById('timelineIntervalInput'),
    generateTimelineBtn: document.getElementById('generateTimelineBtn'),
    timelineChartWrapper: document.getElementById('timelineChartWrapper'),
    timelineChart: document.getElementById('timelineChart'),
    toggleTimelineBtn: document.getElementById('toggleTimelineBtn'),
    toggleGraphBtn: document.getElementById('toggleGraphBtn'),
    graphContainer: document.getElementById('graphContainer'),
    cyContainer: document.getElementById('cy'),
    helpBtn: document.getElementById('helpBtn'),
    tourOverlay: document.getElementById('tourOverlay'),
    tourTooltip: document.getElementById('tourTooltip'),
    tourContent: document.getElementById('tourContent'),
    tourPrev: document.getElementById('tourPrev'),
    tourNext: document.getElementById('tourNext'),
    tourEnd: document.getElementById('tourEnd'),
    cyberChefOperationsDropdownElement: document.getElementById('cyberChefOperationsDropdown'),
    cyberChefCustomRecipeModalElement: document.getElementById('cyberChefCustomRecipeModal'),
    customCyberChefRecipeInput: document.getElementById('customCyberChefRecipeInput'),
    applyCustomCyberChefRecipeBtn: document.getElementById('applyCustomCyberChefRecipeBtn')
};

export const config = {
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
    MAX_HISTORY_ITEMS: 25,
    LARGE_DATA_THRESHOLD: 1 * 1024 * 1024
};

export const tourSteps = [
    {
        element: '#dataInput',
        content: '<strong>Data Source:</strong> This is where you can paste your raw log data. You can also upload files using the "Upload Data File" button below. The "Sample Data" button will load some sample Windows Event Log data for you to play with.'
    },
    {
        element: '.col-12.col-md-6.col-xl-4:nth-child(2) > .p-3',
        content: `<strong>Processing & Analysis:</strong> This section helps you prepare and analyze your data.
                  <ul>
                      <li><b>Input/Output Format:</b> Specify the format of your input data, or leave it as 'Auto-detect'. Choose the format for your exported results.</li>
                      <li><b>Shaper Scripts:</b> These are powerful SuperSQL queries that transform and shape your data. Use them for cleaning messy logs, like removing spaces from field names, dropping unnecessary columns, or parsing unstructured data into a clean, usable format.</li>
                      <li><b>Scanner Rules:</b> Load predefined or custom sets of rules (in YAML format) to automatically scan your data for specific patterns, threats, or interesting events.</li>
                  </ul>`
    },
    {
        element: '#queryInput',
        content: '<strong>Search Query:</strong> Write your SuperSQL queries here. SuperSQL allows you to filter, aggregate, and transform your data. Check out the "Cheatsheet" for a quick reference on how to use it.'
    },
    {
        element: '#runQueryBtn',
        content: '<strong>Run Query:</strong> Once you have your data loaded and a query written, click this button to execute the query and see the results below.'
    },
    {
        element: '#scannerResultsPanel',
        content: '<strong>Scanner Hits:</strong> After running the scanner, any matches to your loaded rules will appear here. You can then pivot these results to a new tab for deeper investigation.'
    },
    {
        element: '#tableResultOutputContainer',
        content: '<strong>Query Results:</strong> Your query results will be displayed here. You can switch between a table view and a raw text view. You can also pivot the results to a new tab for further analysis. When viewing row details, click the <i class="fa-solid fa-wand-magic-sparkles"></i> icon to send field data to CyberChef.'
    }
];