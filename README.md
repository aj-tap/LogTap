# LogTap Viewer

LogTap Viewer is a powerful, browser-based log analysis tool designed for defenders. It allows you to quickly load, parse, search, and visualize log data from various sources directly in your browser, ensuring your data remains private and secure.

## Features

* **Client-Side Processing:** All log processing happens in your browser. No data ever leaves your machine, providing complete privacy.
* **Powerful Query Language:** Utilizes **SuperSQL** for advanced data filtering, aggregation, and transformation right within the UI.
* **Multiple Data Formats:** Supports various data formats, including CSV, JSON, ZJSON, and plain text logs.
* **EVTX Support:** On-the-fly conversion and analysis of Windows Event Log (EVTX) files.
* **Rule-Based Scanning:** Use predefined or custom YAML rules to scan your data for interesting patterns, threats, or indicators of compromise.
* **Data Visualization:** Includes timeline and graph visualizations to help you understand temporal patterns and relationships in your data.
* **Tabbed Interface:** Analyze multiple log sources in different tabs for better organization and workflow.

## How to Use

There are two ways to get started with LogTap Viewer:

### 1. Live Demo

You can access the hosted version of the application directly in your browser—no setup required.

[**>> Launch LogTap Viewer Live Demo <<**](https://logtap.shinkensec.com)

### 2. Local Setup

If you prefer to run the application locally:

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/aj-tap/LogTap.git
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd LogTap-Viewer
    ```
3.  **Open `index.html`:**
    Simply open the `index.html` file in your preferred web browser (e.g., Chrome, Firefox, Edge).

Once the application is loaded, you can paste your log data, upload files, and start analyzing. For a guided walkthrough of the features, click the **Help** button (<i class="fa-solid fa-question-circle"></i>) in the sidebar.

## Limitations

LogTap Viewer runs entirely in your browser using WebAssembly (WASM). While this provides excellent privacy and portability, it's important to be aware of some performance considerations:

* **Performance Overhead:** Since the application is compiled to WASM instead of running as a native program, there can be performance overhead. CPU-intensive tasks, such as scanning very large files, may run slower than they would in a native desktop application. Performance will vary depending on your browser and hardware.
* **Memory Usage:** Processing large datasets can consume a significant amount of browser memory. It is recommended to use a modern browser with sufficient RAM for a smooth experience, especially with larger logs.

To learn more about the technology and its capabilities, visit the official [WebAssembly website](https://webassembly.org/).


## Credits
A huge thank you to the developers and communities behind these incredible open-source projects:

* **[SuperDB (superdb-wasm)](https://github.com/brimdata/superdb-wasm):** Powers the core query and data processing engine, allowing for complex data manipulation directly in the browser.
* **[golang-evtx](https://github.com/0xrawsec/golang-evtx):** Used for the efficient parsing of Windows Event Log (EVTX) files.
* **[Cytoscape.js](https://github.com/cytoscape/cytoscape.js):** Powers the interactive and beautiful graph visualization feature.
* **[Sigma](https://github.com/SigmaHQ/sigma):** The basis for the predefined rule sets, providing a generic signature format for detection.