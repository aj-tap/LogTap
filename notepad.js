let loadedNoteTemplates = [];
let quill;
const notepadStorageKey = 'notepadContent_quill_v1';
const analystNameKey = 'logtapAnalystName';
const currentCaseIdKey = 'logtapCurrentCaseId';

const piiRegexes = {
    emailAddress: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ipAddress: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    phoneNumber: /\b(?:\+?1\s?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    usSocialSecurityNumber: /\b\d{3}-\d{2}-\d{4}\b/g,
    zipcode: /\b\d{5}(?:-\d{4})?\b/g,
    url: /\b(?:https?|ftp):\/\/(?:www\.)?[-\w@:%\._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-\w()@:%\._\+~#?&//=]*)\b/g,
    domain: /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\b/g,
    creditCardNumber: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})\b/g,
    streetAddress: /\b\d+\s+[A-Za-z0-9\s.-]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct)\b/gi,
    credentials: /\b(?:password\s*[:=]|secret\s*[:=]|token\s*[:=]|api_key\s*[:=]|auth_key\s*[:=])\s*([A-Za-z0-9\-_.~+/=]{8,})\b/gi
};

let PiiHighlightBlot;

function registerPiiBlot() {
    if (typeof Quill === 'undefined') return;
    const Inline = Quill.import('blots/inline');
    PiiHighlightBlot = class PiiHighlightBlot extends Inline {
        static create(value) {
            let node = super.create();
            if (value && value.type) {
                node.setAttribute('data-pii-type', value.type);
                node.style.backgroundColor = 'rgba(255, 160, 122, 0.5)'; 
                node.style.borderRadius = '3px';
                node.style.padding = '0 2px';
            }
            return node;
        }
        static formats(node) {
            const piiType = node.getAttribute('data-pii-type');
            return piiType ? { type: piiType } : {};
        }
    }
    PiiHighlightBlot.blotName = 'pii-highlight';
    PiiHighlightBlot.tagName = 'SPAN';
    Quill.register(PiiHighlightBlot);
}

function detectAndHighlightPII() {
    if (!quill || !PiiHighlightBlot) return;

    const text = quill.getText();
    const currentSelection = quill.getSelection();
    
    quill.formatText(0, text.length, 'pii-highlight', false); 

    for (const piiType in piiRegexes) {
        const regex = piiRegexes[piiType];
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match[0] && match[0].length > 0) {
                quill.formatText(match.index, match[0].length, 'pii-highlight', { type: piiType });
            }
        }
    }
    if (currentSelection) {
       setTimeout(() => quill.setSelection(currentSelection), 0);
    }
}

async function loadNoteTemplatesFromYAML(yamlFilePath = 'note_templates.yaml') {
    try {
        if (typeof jsyaml === 'undefined') {
            loadedNoteTemplates = [{ name: "Error", template: "# CRITICAL ERROR\n\njs-yaml library not found." }];
            return;
        }
        const response = await fetch(yamlFilePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const yamlText = await response.text();
        const templates = jsyaml.load(yamlText);
        if (Array.isArray(templates)) {
            loadedNoteTemplates = templates.map(t => ({ name: t.name || "Unnamed Template", template: t.template || "" }));
        } else {
            loadedNoteTemplates = [{ name: "YAML Parse Error", template: "# ERROR\n\nFailed to parse YAML." }];
        }
    } catch (error) {
        console.error("Failed to load/parse note templates:", error);
        loadedNoteTemplates = [{ name: "Error Loading Templates", template: `# ERROR\n\nFailed to load templates.\n\nDetails:\n${error.message}` }];
    }
}

function populateTemplateDropdown() {
    const dropdown = document.getElementById('notepadTemplateSelect');
    if (!dropdown) return;
    dropdown.innerHTML = '<option value="">Select a template...</option>';
    if (!loadedNoteTemplates || loadedNoteTemplates.length === 0) {
        const option = document.createElement('option');
        option.textContent = "No templates available";
        option.disabled = true;
        dropdown.appendChild(option);
        return;
    }
    loadedNoteTemplates.forEach((template, index) => {
        const option = document.createElement('option');
        option.value = index.toString();
        option.textContent = template.name;
        dropdown.appendChild(option);
    });
}

function processTemplatePlaceholders(templateString) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
    const analystName = localStorage.getItem(analystNameKey) || 'YOUR_NAME_HERE';
    const caseId = localStorage.getItem(currentCaseIdKey) || 'YOUR_CASE_ID_HERE';

    return templateString
        .replace(/\{\{CURRENT_DATE\}\}/g, today)
        .replace(/\{\{CURRENT_TIME\}\}/g, now.toTimeString().slice(0,8))
        .replace(/\{\{CURRENT_DATETIME\}\}/g, now.toISOString())
        .replace(/\{\{CURRENT_DATE_START\}\}/g, startTime)
        .replace(/\{\{CURRENT_DATE_END\}\}/g, endTime)
        .replace(/YOUR_NAME_HERE/g, analystName)
        .replace(/YOUR_CASE_ID_HERE/g, caseId);
}

function applyNoteTemplate() {
    const dropdown = document.getElementById('notepadTemplateSelect');
    if (!dropdown || !quill) return;
    const selectedIndex = dropdown.value;
    if (selectedIndex === "" || !loadedNoteTemplates[selectedIndex]) return;

    let templateContent = loadedNoteTemplates[selectedIndex].template;
    templateContent = processTemplatePlaceholders(templateContent);
    
    quill.setText(templateContent);
    saveNotepadContent(); 
    dropdown.value = "";
    setTimeout(detectAndHighlightPII, 50); 
}

function saveNotepadContent() {
    if (quill) {
        try {
            const content = quill.getContents();
            localStorage.setItem(notepadStorageKey, JSON.stringify(content));
        } catch (e) {
            console.error("Error saving notepad content:", e);
        }
    }
}

function loadNotepadContent() {
    if (quill) {
        try {
            const savedContentRaw = localStorage.getItem(notepadStorageKey);
            if (savedContentRaw) {
                const savedContent = JSON.parse(savedContentRaw);
                quill.setContents(savedContent);
            } else {
                quill.setText('');
            }
        } catch (e) {
            console.error("Error loading notepad content:", e);
            quill.setText("# Error loading saved notes.");
        }
        setTimeout(detectAndHighlightPII, 50);
    }
}

function exportNotepadContent(format = 'text') {
    if (!quill) return;
    let content, fileExtension, mimeType;
    const caseId = localStorage.getItem(currentCaseIdKey) || 'Case';
    const analystName = localStorage.getItem(analystNameKey) || 'Analyst';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const sanitizeFilename = (name) => name.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
    
    if (format === 'text' || format === 'md') {
        content = quill.getText();
        fileExtension = 'md';
        mimeType = 'text/markdown;charset=utf-8;';
    } else if (format === 'html') {
        content = quill.root.innerHTML;
        fileExtension = 'html';
        mimeType = 'text/html;charset=utf-8;';
    } else {
        content = quill.getText();
        fileExtension = 'txt';
        mimeType = 'text/plain;charset=utf-8;';
    }
    const filename = `notes_${sanitizeFilename(caseId)}_${sanitizeFilename(analystName)}_${dateStr}.${fileExtension}`;
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        alert("Direct file download not supported.");
    }
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

const debouncedSaveNotepadContent = debounce(saveNotepadContent, 750);
const debouncedDetectAndHighlightPII = debounce(detectAndHighlightPII, 600);

async function initializeNotepad() {
    let attempts = 0;
    const maxAttempts = 50;
    while ((typeof jsyaml === 'undefined' || typeof Quill === 'undefined') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    if (typeof jsyaml === 'undefined') console.error("js-yaml library failed to load.");
    if (typeof Quill === 'undefined') {
        console.error("Quill library failed to load.");
        return;
    }

    registerPiiBlot();

    const toolbarOptions = [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        [{ 'align': [] }],
        ['link', 'image', 'video', 'blockquote', 'code-block'],
        ['clean']
    ];

    quill = new Quill('#quill-editor', {
        modules: { toolbar: toolbarOptions },
        placeholder: 'Start typing your investigation notes here...',
        theme: 'snow'
    });

    await loadNoteTemplatesFromYAML();
    populateTemplateDropdown();
    loadNotepadContent();

    const dropdown = document.getElementById('notepadTemplateSelect');
    if (dropdown) dropdown.addEventListener('change', applyNoteTemplate);

    if (quill) {
        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                debouncedSaveNotepadContent();
                debouncedDetectAndHighlightPII();
            }
        });
    }
    
    const notepadOffcanvasElement = document.getElementById('notepadOffcanvas');
    if (notepadOffcanvasElement) {
        const exportMdButton = document.createElement('button');
        exportMdButton.innerHTML = '<i class="fa-solid fa-file-arrow-down me-1"></i> Export MD';
        exportMdButton.classList.add('btn', 'btn-sm', 'btn-outline-light', 'me-2');
        exportMdButton.title = "Export notes as Markdown";
        exportMdButton.addEventListener('click', () => exportNotepadContent('md'));

        const exportHtmlButton = document.createElement('button');
        exportHtmlButton.innerHTML = '<i class="fa-solid fa-file-code me-1"></i> Export HTML';
        exportHtmlButton.classList.add('btn', 'btn-sm', 'btn-outline-light');
        exportHtmlButton.title = "Export notes as HTML";
        exportHtmlButton.addEventListener('click', () => exportNotepadContent('html'));
        
        const offcanvasHeader = notepadOffcanvasElement.querySelector('.offcanvas-header');
        if (offcanvasHeader) {
            const buttonGroup = document.createElement('div');
            buttonGroup.classList.add('ms-auto');
            buttonGroup.appendChild(exportMdButton);
            buttonGroup.appendChild(exportHtmlButton);
            const existingCloseButton = offcanvasHeader.querySelector('.btn-close');
            if (existingCloseButton) {
                offcanvasHeader.insertBefore(buttonGroup, existingCloseButton);
            } else {
                offcanvasHeader.appendChild(buttonGroup);
            }
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNotepad);
} else {
    initializeNotepad();
}

export { exportNotepadContent, detectAndHighlightPII };
