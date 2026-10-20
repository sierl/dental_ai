const imageInput = document.getElementById("imageInput");
const uploadBox = document.getElementById("uploadBox");
const previewArea = document.getElementById("previewArea");
const imagePreview = document.getElementById("imagePreview");
const fileName = document.getElementById("fileName");
const loadingArea = document.getElementById("loadingArea");
const resultArea = document.getElementById("resultArea");
const errorArea = document.getElementById("errorArea");
const errorTitle = document.getElementById("errorTitle");
const errorMessage = document.getElementById("errorMessage");
const resultTitle = document.getElementById("resultTitle");
const confidenceValue = document.getElementById("confidenceValue");
const confidenceLabel = document.getElementById("confidenceLabel");
const progressBar = document.getElementById("progressBar");
const resultGrid = document.getElementById("resultGrid");
const resultMessage = document.getElementById("resultMessage");
const resultMeta = document.getElementById("resultMeta");
const annotatedWrap = document.getElementById("annotatedWrap");
const annotatedImage = document.getElementById("annotatedImage");
const annotatedCaption = document.getElementById("annotatedCaption");
const detectionBlock = document.getElementById("detectionBlock");
const detectionList = document.getElementById("detectionList");
const sampleBar = document.getElementById("sampleBar");
const sampleSelect = document.getElementById("sampleSelect");
const modelName = document.getElementById("modelName");
const modelStatus = document.getElementById("modelStatus");

const API_BASE = window.location.protocol === "file:"
    ? "http://127.0.0.1:8000"
    : "";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

let selectedFile = null;
let lastResult = null;
let originalImageSrc = "";
let overlaySource = "";
let showingOverlay = true;

// Navigation buttons in the page call these functions.
function startScreening() {
    document.getElementById("screening").scrollIntoView({ behavior: "smooth" });
}

function scrollToSection(id) {
    const section = document.getElementById(id);
    if (section) section.scrollIntoView({ behavior: "smooth" });
}

// Choose an image from the file picker or drag one onto the upload area.
imageInput.addEventListener("change", () => {
    if (imageInput.files[0]) {
        handleImage(imageInput.files[0]);
    }
});

uploadBox.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadBox.classList.add("dragover");
});

uploadBox.addEventListener("dragleave", () => {
    uploadBox.classList.remove("dragover");
});

uploadBox.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadBox.classList.remove("dragover");
    if (event.dataTransfer.files[0]) {
        handleImage(event.dataTransfer.files[0]);
    }
});

function handleImage(file) {
    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type)) {
        showError("Unsupported image", "Please upload a JPG, JPEG or PNG image.");
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        showError("Image is too large", "Please choose an image smaller than 10 MB.");
        return;
    }

    hideError();
    selectedFile = file;

    const reader = new FileReader();
    reader.onload = () => {
        originalImageSrc = reader.result;
        imagePreview.src = originalImageSrc;
        fileName.textContent = file.name;

        uploadBox.style.display = "none";
        previewArea.style.display = "flex";
        loadingArea.style.display = "none";
        resultArea.style.display = "none";
    };

    reader.readAsDataURL(file);
}

function showLoading() {
    previewArea.style.display = "none";
    loadingArea.style.display = "block";
    resultArea.style.display = "none";
}

function hideLoading() {
    loadingArea.style.display = "none";
}

function showError(title, message) {
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    errorArea.hidden = false;
}

function hideError() {
    errorArea.hidden = true;
    errorMessage.textContent = "";
}

// Read JSON responses, including useful error messages from FastAPI.
async function readPayload(response) {
    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch {
        return { detail: text || response.statusText };
    }
}

async function requestResults(url, options = {}) {
    hideError();
    showLoading();

    try {
        const response = await fetch(API_BASE + url, options);
        const data = await readPayload(response);

        if (!response.ok) {
            throw new Error(data.detail || "The screening request failed.");
        }

        renderResult(data);
        return data;
    } catch (error) {
        hideLoading();
        showError("Screening failed", error.message || "Could not connect to the backend.");
        return null;
    }
}

async function analyzeImage() {
    if (!selectedFile) {
        showError("No image selected", "Upload a dental X-ray before starting the screening.");
        return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    await requestResults("/api/predict", {
        method: "POST",
        body: formData
    });
}

async function runSample() {
    const sampleId = sampleSelect.value;

    if (!sampleId) {
        showError("No sample available", "No dataset samples were found.");
        return;
    }

    const data = await requestResults(
        "/api/samples/" + encodeURIComponent(sampleId) + "/predict",
        { method: "POST" }
    );

    if (!data) return;

    fileName.textContent = sampleId;
    uploadBox.style.display = "none";
    previewArea.style.display = "flex";
    originalImageSrc = API_BASE + "/api/samples/" + encodeURIComponent(sampleId) + "/image";
    imagePreview.src = originalImageSrc;
    // Keep the preview visible after the sample prediction finishes.
    previewArea.style.display = "flex";
}

function renderResult(data) {
    lastResult = data;
    hideLoading();
    resultArea.style.display = "block";
    resultArea.scrollIntoView({ behavior: "smooth", block: "center" });

    resultTitle.textContent = data.screening || "Screening complete";

    const confidence = Math.round((data.confidence || 0) * 100);
    const count = data.meta?.num_detections || 0;
    confidenceLabel.textContent = count ? "Confidence of the top finding" : "Model confidence";
    confidenceValue.textContent = confidence + "%";
    progressBar.style.width = Math.min(confidence, 100) + "%";

    renderCategories(data.category_details || []);
    resultMessage.textContent = data.summary || "";
    renderAnnotatedImage(data);
    renderDetections(data.detections || []);
    renderMeta(data);

    if (window.lucide) window.lucide.createIcons();
}

function renderCategories(categories) {
    resultGrid.innerHTML = "";

    if (!categories.length) {
        resultGrid.innerHTML = "<div><span>No classes above threshold</span><strong>0%</strong></div>";
        return;
    }

    categories.slice(0, 4).forEach((category) => {
        const cell = document.createElement("div");
        const label = document.createElement("span");
        const value = document.createElement("strong");

        label.textContent = category.label;
        value.textContent = Math.round(category.share) + "%";
        cell.append(label, value);
        resultGrid.appendChild(cell);
    });
}

function renderAnnotatedImage(data) {
    overlaySource = data.image?.annotated_data_url || "";
    showingOverlay = true;

    if (!overlaySource) {
        annotatedWrap.hidden = true;
        return;
    }

    annotatedImage.src = overlaySource;
    annotatedWrap.hidden = false;
    updateOverlayToggle();

    const image = data.image;
    const count = data.meta?.num_detections || 0;
    annotatedCaption.textContent =
        count + " detected region(s) on a " + image.width + " × " + image.height + " image.";
}

function updateOverlayToggle() {
    const toggle = document.getElementById("overlayToggle");
    if (!toggle) return;

    toggle.innerHTML = showingOverlay
        ? '<i data-lucide="eye"></i> Show original'
        : '<i data-lucide="eye-off"></i> Show overlay';

    if (window.lucide) window.lucide.createIcons();
}

function toggleOverlay() {
    if (!overlaySource) return;

    showingOverlay = !showingOverlay;
    annotatedImage.src = showingOverlay ? overlaySource : (originalImageSrc || overlaySource);
    updateOverlayToggle();
}

function renderDetections(detections) {
    detectionList.innerHTML = "";

    if (!detections.length) {
        detectionBlock.hidden = true;
        return;
    }

    detections.slice(0, 12).forEach((detection) => {
        const row = document.createElement("div");
        row.className = "detection-row";

        const label = document.createElement("span");
        label.className = "detection-label";

        const badge = document.createElement("span");
        badge.className = "detection-index";
        badge.textContent = detection.index;

        const name = document.createElement("span");
        name.textContent = detection.label;
        label.append(badge, name);

        const bar = document.createElement("div");
        bar.className = "detection-bar";

        const fill = document.createElement("div");
        fill.style.width = Math.round(detection.confidence * 100) + "%";
        bar.appendChild(fill);

        const value = document.createElement("strong");
        value.textContent = Math.round(detection.confidence * 100) + "%";

        row.append(label, bar, value);
        detectionList.appendChild(row);
    });

    if (detections.length > 12) {
        const more = document.createElement("p");
        more.className = "detection-more";
        more.textContent = "+" + (detections.length - 12) + " more detected region(s).";
        detectionList.appendChild(more);
    }

    detectionBlock.hidden = false;
}

function renderMeta(data) {
    const meta = data.meta || {};
    resultMeta.textContent =
        "Model " + (meta.model || "best.pt") +
        " • device " + (meta.device || "cpu") +
        " • " + (meta.num_detections || 0) + " region(s)" +
        " • inference " + Math.round(meta.inference_ms || 0) + " ms" +
        " • confidence threshold " + (meta.conf_threshold ?? 0.25);
}

function resetScreening() {
    selectedFile = null;
    lastResult = null;
    originalImageSrc = "";
    overlaySource = "";
    showingOverlay = true;
    imageInput.value = "";

    hideError();
    uploadBox.style.display = "flex";
    previewArea.style.display = "none";
    loadingArea.style.display = "none";
    resultArea.style.display = "none";
    annotatedWrap.hidden = true;
    detectionBlock.hidden = true;
}

// Open a simple printable report.
function generateReport() {
    if (!lastResult) {
        alert("Run a screening first to generate a report.");
        return;
    }

    const data = lastResult;
    const popup = window.open("", "_blank");

    if (!popup) {
        alert("Please allow pop-ups to print the screening report.");
        return;
    }

    const rows = (data.category_details || []).map((category) =>
        "<tr><td>" + escapeHtml(category.label) + "</td><td>" +
        category.detections + "</td><td>" + Math.round(category.share) + "%</td></tr>"
    ).join("");

    popup.document.write(`
        <!doctype html>
        <html>
        <head>
            <title>DentalAI Screening Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 32px; color: #172337; }
                table { border-collapse: collapse; width: 100%; max-width: 600px; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                .notice { margin-top: 24px; padding: 12px; background: #fff4d6; }
            </style>
        </head>
        <body>
            <h1>DentalAI Screening Report</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <h2>${escapeHtml(data.screening || "Screening results")}</h2>
            <p>Confidence: ${Math.round((data.confidence || 0) * 100)}%</p>
            <p>${escapeHtml(data.summary || "")}</p>
            <h2>Detected regions</h2>
            <table>
                <tr><th>Class</th><th>Count</th><th>Share</th></tr>
                ${rows}
            </table>
            <div class="notice">
                <strong>This is an AI screening result, not a medical diagnosis.</strong>
                <p>Please consult a qualified dentist.</p>
            </div>
        </body>
        </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

// Show backend status and load the optional sample-image list.
async function loadBackendInfo() {
    try {
        const response = await fetch(API_BASE + "/api/health");
        const health = await readPayload(response);

        modelName.textContent = "DentalAI YOLO";
        modelStatus.textContent = response.ok && health.model_loaded
            ? "Online (" + (health.device || "ready") + ")"
            : "Offline";
    } catch {
        modelName.textContent = "Unavailable";
        modelStatus.textContent = "Offline";
    }

    try {
        const response = await fetch(API_BASE + "/api/samples");
        const data = await readPayload(response);

        if (!response.ok || !data.samples?.length) return;

        sampleSelect.innerHTML = "";
        data.samples.slice(0, 40).forEach((sample) => {
            const option = document.createElement("option");
            option.value = sample.id;
            option.textContent = sample.filename.replace(/\.[^.]+$/, "");
            sampleSelect.appendChild(option);
        });
        sampleBar.hidden = false;
    } catch {
        sampleBar.hidden = true;
    }
}

loadBackendInfo();
if (window.lucide) window.lucide.createIcons();
