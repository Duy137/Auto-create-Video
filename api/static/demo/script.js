const state = {
    jobId: null,
    status: 'idle',
    props: null,
    originalProps: null,
    pollingTimer: null,
    pollingDelayMs: 1500,
    pollingStartedAt: 0,
    pollingTimeoutMs: 0,
    pollingMode: null,
    pollingErrorCount: 0,
    lastRequest: null
};

const POLL_BASE_DELAY_MS = 1500;
const POLL_MAX_DELAY_MS = 12000;
const PROPS_TIMEOUT_MS = 5 * 60 * 1000;
const RENDER_TIMEOUT_MS = 15 * 60 * 1000;
const MIN_WORDS = 30;
const MAX_OPTIMAL_WORDS = 500;

// Selectors
const mainContainer = document.querySelector('.pipeline-card');
const stepEls = document.querySelectorAll('.step');
const viewInput = document.getElementById('view-input');
const viewReview = document.getElementById('view-review');
const viewRendering = document.getElementById('view-rendering');
const viewFinal = document.getElementById('view-final');

const inputText = document.getElementById('input-text');
const wordCountVal = document.getElementById('word-count-val');
const wordCountEl = document.getElementById('word-count');
const voiceSelect = document.getElementById('voice-select');
const rateSelect = document.getElementById('rate-select');
const rateVal = document.getElementById('rate-val');
const btnGenerateProps = document.getElementById('btn-generate-props');

const jsonEditor = document.getElementById('json-editor');
const jsonValidationMsg = document.getElementById('json-validation-msg');
const btnFormatJson = document.getElementById('btn-format-json');
const btnCopyJson = document.getElementById('btn-copy-json');
const btnResetJson = document.getElementById('btn-reset-json');
const btnStartRender = document.getElementById('btn-start-render');
const btnBackToInput = document.getElementById('btn-back-to-input');

const logContainer = document.getElementById('log-container');
const renderStatusText = document.getElementById('render-status-text');
const renderProgressPercent = document.getElementById('render-progress-percent');
const renderProgressFill = document.getElementById('render-progress-fill');
const btnRetryRender = document.getElementById('btn-retry-render');
const finalVideo = document.getElementById('final-video');
const downloadLink = document.getElementById('download-link');
const btnRestart = document.getElementById('btn-restart');
const toastContainer = document.getElementById('toast-container');

let jsonValidationTimer = null;

// ── Helpers ──

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 220);
    }, 4000);
}

function updateProgress(progressValue) {
    const safeProgress = Math.max(0, Math.min(100, Number(progressValue) || 0));
    renderProgressPercent.textContent = `${Math.round(safeProgress)}%`;
    renderProgressFill.style.width = `${safeProgress}%`;
}

function setWordCountStatus(wordCount) {
    wordCountEl.classList.remove('error', 'success', 'warning');

    if (wordCount < MIN_WORDS) {
        wordCountEl.classList.add('error');
        return;
    }

    if (wordCount > MAX_OPTIMAL_WORDS) {
        wordCountEl.classList.add('warning');
        return;
    }

    wordCountEl.classList.add('success');
}

function autoResizeTextarea(textareaEl, minHeight = 150, maxHeight = 400) {
    textareaEl.style.height = `${minHeight}px`;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, textareaEl.scrollHeight));
    textareaEl.style.height = `${nextHeight}px`;
}

function classifyLogLevel(message) {
    if (/error|failed|timeout/i.test(message)) return 'error';
    if (/complete|success|ready|done|✅/i.test(message)) return 'success';
    return 'info';
}

function setStep(stepNum) {
    stepEls.forEach(el => {
        const s = parseInt(el.dataset.step);
        el.className = 'step';
        if (s < stepNum) el.classList.add('completed');
        if (s === stepNum) el.classList.add('active');
    });

    const views = [viewInput, viewReview, viewRendering, viewFinal];
    views.forEach((v, idx) => {
        if (idx + 1 === stepNum) {
            v.classList.remove('hidden');
            v.classList.remove('view-animate');
            requestAnimationFrame(() => v.classList.add('view-animate'));
        } else {
            v.classList.add('hidden');
            v.classList.remove('view-animate');
        }
    });
}

function addLog(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logLine = document.createElement('div');
    logLine.className = `log-line log-${classifyLogLevel(msg)}`;

    const timestampEl = document.createElement('span');
    timestampEl.className = 'timestamp';
    timestampEl.textContent = `[${time}]`;

    const messageEl = document.createElement('span');
    messageEl.textContent = msg;

    logLine.appendChild(timestampEl);
    logLine.appendChild(messageEl);
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLogs() {
    logContainer.innerHTML = '';
}

function validateJsonEditor(showMessage = true) {
    const raw = jsonEditor.value.trim();

    if (!raw) {
        jsonEditor.classList.remove('json-valid', 'json-invalid');
        jsonValidationMsg.textContent = '';
        jsonValidationMsg.className = 'validation-msg';
        return { valid: false, parsed: null, error: 'JSON is empty' };
    }

    try {
        const parsed = JSON.parse(raw);
        jsonEditor.classList.remove('json-invalid');
        jsonEditor.classList.add('json-valid');
        if (showMessage) {
            jsonValidationMsg.textContent = 'JSON is valid.';
            jsonValidationMsg.className = 'validation-msg success';
        }
        return { valid: true, parsed, error: null };
    } catch (err) {
        jsonEditor.classList.remove('json-valid');
        jsonEditor.classList.add('json-invalid');
        if (showMessage) {
            jsonValidationMsg.textContent = `Invalid JSON: ${err.message}`;
            jsonValidationMsg.className = 'validation-msg error';
        }
        return { valid: false, parsed: null, error: err.message };
    }
}

function stopPolling() {
    if (state.pollingTimer) {
        clearTimeout(state.pollingTimer);
        state.pollingTimer = null;
    }
}

function schedulePoll(waitingForProps) {
    state.pollingTimer = setTimeout(() => {
        pollJob(waitingForProps);
    }, state.pollingDelayMs);
}

async function pollJob(waitingForProps) {
    if (!state.jobId) return;

    const elapsed = Date.now() - state.pollingStartedAt;
    if (elapsed > state.pollingTimeoutMs) {
        stopPolling();
        renderStatusText.textContent = 'Timed Out';
        renderStatusText.style.color = 'var(--error)';
        addLog('Polling timed out.');
        showToast('Timed out while waiting for job completion.', 'error');
        btnRetryRender.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch(`/api/demo/jobs/${state.jobId}`);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const job = await response.json();
        state.pollingDelayMs = POLL_BASE_DELAY_MS;
        state.pollingErrorCount = 0;

        if (Array.isArray(job.logs) && job.logs.length > logContainer.children.length) {
            const newLogs = job.logs.slice(logContainer.children.length);
            newLogs.forEach(addLog);
        }

        updateProgress(job.progress ?? 0);

        if (waitingForProps) {
            renderStatusText.textContent = 'Generating Video Props...';

            if (job.status === 'review_ready') {
                stopPolling();
                state.props = job.props;
                state.originalProps = JSON.parse(JSON.stringify(job.props));
                jsonEditor.value = JSON.stringify(job.props, null, 2);
                validateJsonEditor(true);
                setStep(2);
                showToast('Video props are ready for review.', 'success');
                return;
            }
        } else {
            renderStatusText.textContent = 'Rendering Video...';

            if (job.status === 'completed') {
                stopPolling();
                updateProgress(100);
                finalVideo.src = job.video_url;
                downloadLink.href = job.video_url;
                setStep(4);
                showToast('Rendering completed successfully.', 'success');
                return;
            }
        }

        if (job.status === 'failed') {
            stopPolling();
            renderStatusText.textContent = waitingForProps ? 'Generation Failed' : 'Render Failed';
            renderStatusText.style.color = 'var(--error)';
            addLog(`Job failed: ${job.error || 'Unknown error'}`);
            showToast(job.error || 'Job failed.', 'error');
            btnRetryRender.classList.remove('hidden');
            return;
        }

        schedulePoll(waitingForProps);
    } catch (err) {
        state.pollingErrorCount += 1;
        state.pollingDelayMs = Math.min(POLL_MAX_DELAY_MS, state.pollingDelayMs * 2);

        const errorMessage = err?.message || 'Unknown polling error';
        addLog(`Polling error: ${errorMessage}`);

        if (state.pollingErrorCount === 1 || state.pollingErrorCount % 3 === 0) {
            const waitSeconds = Math.round(state.pollingDelayMs / 1000);
            showToast(`Connection issue. Retrying in ${waitSeconds}s...`, 'info');
        }

        schedulePoll(waitingForProps);
    }
}

function startPolling(waitingForProps) {
    stopPolling();
    state.pollingStartedAt = Date.now();
    state.pollingDelayMs = POLL_BASE_DELAY_MS;
    state.pollingErrorCount = 0;
    state.pollingMode = waitingForProps ? 'props' : 'render';
    state.pollingTimeoutMs = waitingForProps ? PROPS_TIMEOUT_MS : RENDER_TIMEOUT_MS;
    schedulePoll(waitingForProps);
}

async function createJobAndPoll() {
    if (!state.lastRequest) return;

    try {
        btnRetryRender.classList.add('hidden');

        const response = await fetch('/api/demo/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.lastRequest)
        });

        if (!response.ok) {
            throw new Error(`Failed to create job (${response.status})`);
        }

        const data = await response.json();
        state.jobId = data.job_id;
        state.status = 'parsing';

        setStep(3);
        clearLogs();
        updateProgress(0);
        renderStatusText.style.color = 'var(--text-primary)';
        renderStatusText.textContent = 'Generating Video Props...';
        addLog(`Job created: ${state.jobId}`);
        startPolling(true);
    } catch (err) {
        const errorMessage = err?.message || 'Unknown error';
        addLog(`Failed to start job: ${errorMessage}`);
        showToast(`Failed to start job: ${errorMessage}`, 'error');
        btnRetryRender.classList.remove('hidden');
    }
}

// ── Step 1: Input ──

inputText.addEventListener('input', () => {
    const text = inputText.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    wordCountVal.textContent = count;
    setWordCountStatus(count);
    btnGenerateProps.disabled = count < MIN_WORDS;
    autoResizeTextarea(inputText, 150, 400);
});

rateSelect.addEventListener('input', () => {
    rateVal.textContent = parseFloat(rateSelect.value).toFixed(1) + 'x';
});

btnGenerateProps.addEventListener('click', async () => {
    const text = inputText.value.trim();
    const count = text ? text.split(/\s+/).length : 0;

    if (count < MIN_WORDS) {
        showToast('Please enter at least 30 words before starting.', 'error');
        return;
    }

    state.lastRequest = {
        text,
        voice: voiceSelect.value,
        rate: parseFloat(rateSelect.value)
    };

    await createJobAndPoll();
    showToast('Job started. Generating video props...', 'info');
});

// ── Step 2: Review ──

btnBackToInput.addEventListener('click', () => {
    setStep(1);
});

btnStartRender.addEventListener('click', async () => {
    const validation = validateJsonEditor(true);
    if (!validation.valid) {
        showToast('Invalid JSON structure. Please correct it before rendering.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/demo/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                job_id: state.jobId,
                video_props: validation.parsed
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to start render (${response.status})`);
        }

        btnRetryRender.classList.add('hidden');
        setStep(3);
        updateProgress(0);
        renderStatusText.style.color = 'var(--text-primary)';
        renderStatusText.textContent = 'Rendering Video...';
        addLog('Final render started.');
        startPolling(false);
        showToast('Final render started.', 'info');
    } catch (err) {
        showToast(err?.message || 'Unable to start final render.', 'error');
    }
});

btnFormatJson.addEventListener('click', () => {
    const validation = validateJsonEditor(false);
    if (!validation.valid) {
        showToast('Cannot format invalid JSON.', 'error');
        validateJsonEditor(true);
        return;
    }

    jsonEditor.value = JSON.stringify(validation.parsed, null, 2);
    validateJsonEditor(true);
    showToast('JSON formatted.', 'success');
});

btnCopyJson.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(jsonEditor.value);
        showToast('JSON copied to clipboard.', 'success');
    } catch (err) {
        showToast('Failed to copy JSON.', 'error');
    }
});

btnResetJson.addEventListener('click', () => {
    if (!state.originalProps) {
        showToast('No original JSON to reset.', 'info');
        return;
    }

    jsonEditor.value = JSON.stringify(state.originalProps, null, 2);
    validateJsonEditor(true);
    showToast('JSON reset to original version.', 'info');
});


jsonEditor.addEventListener('input', () => {
    if (jsonValidationTimer) clearTimeout(jsonValidationTimer);
    jsonValidationTimer = setTimeout(() => validateJsonEditor(true), 500);
});

btnRetryRender.addEventListener('click', async () => {
    if (!state.lastRequest) {
        showToast('No previous request available for retry.', 'error');
        return;
    }

    showToast('Retry started with previous input.', 'info');
    await createJobAndPoll();
});

// ── Step 4: Final ──

btnRestart.addEventListener('click', () => {
    stopPolling();
    state.jobId = null;
    state.status = 'idle';
    state.props = null;
    state.originalProps = null;
    state.pollingMode = null;
    state.pollingStartedAt = 0;
    state.pollingTimeoutMs = 0;
    state.pollingDelayMs = POLL_BASE_DELAY_MS;
    state.pollingErrorCount = 0;
    inputText.value = '';
    autoResizeTextarea(inputText, 150, 400);
    wordCountVal.textContent = '0';
    setWordCountStatus(0);
    btnGenerateProps.disabled = true;
    jsonEditor.value = '';
    jsonEditor.classList.remove('json-valid', 'json-invalid');
    jsonValidationMsg.textContent = '';
    jsonValidationMsg.className = 'validation-msg';
    renderStatusText.style.color = 'var(--text-primary)';
    renderStatusText.textContent = 'Processing...';
    updateProgress(0);
    clearLogs();
    btnRetryRender.classList.add('hidden');
    setStep(1);
    showToast('Ready for a new video.', 'info');
});

// Init
setStep(1);
setWordCountStatus(0);
updateProgress(0);
autoResizeTextarea(inputText, 150, 400);
