/* Lens — AI DB Investigator — app.js */

// ── Mermaid config ──────────────────────────────────────────────────────────
mermaid.initialize({
	startOnLoad: false,
	theme: 'base',
	themeVariables: {
		primaryColor: '#dbeafe',
		primaryTextColor: '#1e3a8a',
		primaryBorderColor: '#3b82f6',
		lineColor: '#60a5fa',
		secondaryColor: '#eff6ff',
		tertiaryColor: '#f0f9ff',
		fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		fontSize: '12px',
	},
	er: {
		diagramPadding: 20,
		minEntityWidth: 100,
		minEntityHeight: 60,
		entityPadding: 15,
		useMaxWidth: true,
	},
	securityLevel: 'loose',
});

// ── State ───────────────────────────────────────────────────────────────────
let rootHandle = null;
let investigationsHandle = null;
let dbContextHandle = null;
let selectedEnv = '';
let selectedEngine = '';

// ── Storage (IndexedDB for handles, localStorage for prefs) ─────────────────
const IDB_NAME    = 'lens-storage';
const IDB_STORE   = 'state';
const IDB_VERSION = 1;

function openIdb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(IDB_NAME, IDB_VERSION);
		request.onupgradeneeded = event => {
			event.target.result.createObjectStore(IDB_STORE);
		};
		request.onsuccess = event => resolve(event.target.result);
		request.onerror   = event => reject(event.target.error);
	});
}

async function idbSet(key, value) {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).put(value, key);
		tx.oncomplete = () => resolve();
		tx.onerror    = () => reject(tx.error);
	});
}

async function idbGet(key) {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const tx      = db.transaction(IDB_STORE, 'readonly');
		const request = tx.objectStore(IDB_STORE).get(key);
		request.onsuccess = event => resolve(event.target.result);
		request.onerror   = () => reject(request.error);
	});
}

async function idbDelete(key) {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, 'readwrite');
		tx.objectStore(IDB_STORE).delete(key);
		tx.oncomplete = () => resolve();
		tx.onerror    = () => reject(tx.error);
	});
}

function savePrefEnv(env) {
	if (env) localStorage.setItem('lens-env', env);
}

function savePrefEngine(engine) {
	if (engine) localStorage.setItem('lens-engine', engine);
}

function loadPrefs() {
	return {
		env:    localStorage.getItem('lens-env')    || '',
		engine: localStorage.getItem('lens-engine') || '',
	};
}

// ── DOM refs ────────────────────────────────────────────────────────────────
const btnOpenFolder    = document.getElementById('btn-open-folder');
const btnOpenLanding   = document.getElementById('btn-open-landing');
const btnRefresh       = document.getElementById('btn-refresh');
const btnClearStorage  = document.getElementById('btn-clear-storage');
const btnResumeFolderEl = document.getElementById('btn-resume-folder');
const resumeSectionEl  = document.getElementById('resume-section');
const envSelect        = document.getElementById('env-select');
const engineSelect     = document.getElementById('engine-select');
const toolbarStatus  = document.getElementById('toolbar-status');
const landingEl      = document.getElementById('landing');
const contentEl      = document.getElementById('content');
const sessionsList   = document.getElementById('sessions-list');
const sessionsCount  = document.getElementById('sessions-count');
const schemaDiagram  = document.getElementById('schema-diagram');
const entityMapContent   = document.getElementById('entity-map-content');
const dbProfileContent   = document.getElementById('db-profile-content');
const detailPlaceholder  = document.getElementById('detail-placeholder');
const detailContent      = document.getElementById('detail-content');
const detailSessionMeta  = document.getElementById('detail-session-meta');
const reportBody         = document.getElementById('report-body');
const queriesList        = document.getElementById('queries-list');
const queriesCount       = document.getElementById('queries-count');
const tabBtnSession      = document.getElementById('tab-btn-session');
const tabSessionLabel    = document.getElementById('tab-session-label');
const schemaZoomInBtn    = document.getElementById('schema-zoom-in');
const schemaZoomOutBtn   = document.getElementById('schema-zoom-out');
const schemaZoomResetBtn = document.getElementById('schema-zoom-reset');
const schemaZoomValueEl  = document.getElementById('schema-zoom-value');
const schemaFullscreenOpenBtn = document.getElementById('schema-fullscreen-open');
const schemaFullscreenOverlay = document.getElementById('schema-fullscreen-overlay');
const schemaFullscreenCloseBtn = document.getElementById('schema-fullscreen-close');
const schemaFullscreenCanvas = document.getElementById('schema-fullscreen-canvas');
const schemaDefaultCanvas = document.getElementById('schema-default-canvas');
const schemaFsZoomInBtn = document.getElementById('schema-fs-zoom-in');
const schemaFsZoomOutBtn = document.getElementById('schema-fs-zoom-out');
const schemaFsZoomResetBtn = document.getElementById('schema-fs-zoom-reset');
const schemaFsZoomValueEl = document.getElementById('schema-fs-zoom-value');

const schemaPanZoomState = {
	scale: 1,
	minScale: 0.25,
	maxScale: 5,
	step: 0.15,
	naturalWidth: 0,
	naturalHeight: 0,
	svgElement: null,
	isPanning: false,
	panStartX: 0,
	panStartY: 0,
	startScrollLeft: 0,
	startScrollTop: 0,
	pointers: new Map(),
	pinchStartDistance: 0,
	pinchStartScale: 1,
	isFullscreen: false,
};

// ── Tabs ────────────────────────────────────────────────────────────────────
function switchTab(tabName) {
	document.querySelectorAll('.tab-btn').forEach(button => {
		const isActive = button.dataset.tab === tabName;
		button.classList.toggle('active', isActive);
		button.setAttribute('aria-selected', isActive ? 'true' : 'false');
	});

	document.querySelectorAll('.tab-pane').forEach(pane => {
		pane.classList.toggle('hidden', pane.id !== 'tab-' + tabName);
	});
}

// ── Event listeners ─────────────────────────────────────────────────────────
btnOpenFolder.addEventListener('click', openFolder);
btnOpenLanding.addEventListener('click', openFolder);
btnRefresh.addEventListener('click', onRefresh);
btnClearStorage.addEventListener('click', clearStorage);
envSelect.addEventListener('change', onEnvChange);
engineSelect.addEventListener('change', onEngineChange);
document.querySelectorAll('.tab-btn').forEach(button => {
	button.addEventListener('click', () => {
		switchTab(button.dataset.tab);
	});
});

if (schemaZoomInBtn && schemaZoomOutBtn && schemaZoomResetBtn) {
	schemaZoomInBtn.addEventListener('click', () => {
		zoomSchemaByStep(1);
	});

	schemaZoomOutBtn.addEventListener('click', () => {
		zoomSchemaByStep(-1);
	});

	schemaZoomResetBtn.addEventListener('click', () => {
		resetSchemaZoom();
	});
}

if (schemaFsZoomInBtn && schemaFsZoomOutBtn && schemaFsZoomResetBtn) {
	schemaFsZoomInBtn.addEventListener('click', () => {
		zoomSchemaByStep(1);
	});

	schemaFsZoomOutBtn.addEventListener('click', () => {
		zoomSchemaByStep(-1);
	});

	schemaFsZoomResetBtn.addEventListener('click', () => {
		resetSchemaZoom();
	});
}

if (schemaFullscreenOpenBtn) {
	schemaFullscreenOpenBtn.addEventListener('click', () => {
		enterSchemaFullscreen();
	});
}

if (schemaFullscreenCloseBtn) {
	schemaFullscreenCloseBtn.addEventListener('click', () => {
		exitSchemaFullscreen();
	});
}

window.addEventListener('keydown', event => {
	if (event.key === 'Escape' && schemaPanZoomState.isFullscreen) {
		exitSchemaFullscreen();
	}
});

schemaDiagram.addEventListener('wheel', event => {
	if (!schemaPanZoomState.svgElement) return;
	event.preventDefault();
	const zoomDirection = event.deltaY < 0 ? 1 : -1;
	const factor = zoomDirection > 0 ? 1.1 : 0.9;
	setSchemaZoom(schemaPanZoomState.scale * factor, event.clientX, event.clientY);
}, { passive: false });

schemaDiagram.addEventListener('mousedown', event => {
	if (!schemaPanZoomState.svgElement) return;
	if (event.button !== 0 && event.button !== 1) return;

	schemaPanZoomState.isPanning = true;
	schemaPanZoomState.panStartX = event.clientX;
	schemaPanZoomState.panStartY = event.clientY;
	schemaPanZoomState.startScrollLeft = schemaDiagram.scrollLeft;
	schemaPanZoomState.startScrollTop = schemaDiagram.scrollTop;
	schemaDiagram.classList.add('is-panning');
	event.preventDefault();
});

window.addEventListener('mousemove', event => {
	if (!schemaPanZoomState.isPanning) return;
	const deltaX = event.clientX - schemaPanZoomState.panStartX;
	const deltaY = event.clientY - schemaPanZoomState.panStartY;
	schemaDiagram.scrollLeft = schemaPanZoomState.startScrollLeft - deltaX;
	schemaDiagram.scrollTop = schemaPanZoomState.startScrollTop - deltaY;
});

window.addEventListener('mouseup', () => {
	if (!schemaPanZoomState.isPanning) return;
	schemaPanZoomState.isPanning = false;
	schemaDiagram.classList.remove('is-panning');
});

schemaDiagram.addEventListener('pointerdown', event => {
	if (!schemaPanZoomState.svgElement) return;
	schemaPanZoomState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	if (schemaPanZoomState.pointers.size === 2) {
		const points = Array.from(schemaPanZoomState.pointers.values());
		schemaPanZoomState.pinchStartDistance = distanceBetweenPoints(points[0], points[1]);
		schemaPanZoomState.pinchStartScale = schemaPanZoomState.scale;
	}
});

schemaDiagram.addEventListener('pointermove', event => {
	if (!schemaPanZoomState.svgElement) return;
	if (!schemaPanZoomState.pointers.has(event.pointerId)) return;

	schemaPanZoomState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	if (schemaPanZoomState.pointers.size !== 2 || schemaPanZoomState.pinchStartDistance <= 0) return;

	const points = Array.from(schemaPanZoomState.pointers.values());
	const currentDistance = distanceBetweenPoints(points[0], points[1]);
	if (!currentDistance) return;

	const midpointX = (points[0].x + points[1].x) / 2;
	const midpointY = (points[0].y + points[1].y) / 2;
	const scaleRatio = currentDistance / schemaPanZoomState.pinchStartDistance;
	setSchemaZoom(schemaPanZoomState.pinchStartScale * scaleRatio, midpointX, midpointY);
});

const clearSchemaPointer = event => {
	if (!schemaPanZoomState.pointers.has(event.pointerId)) return;
	schemaPanZoomState.pointers.delete(event.pointerId);
	if (schemaPanZoomState.pointers.size < 2) {
		schemaPanZoomState.pinchStartDistance = 0;
	}
};

schemaDiagram.addEventListener('pointerup', clearSchemaPointer);
schemaDiagram.addEventListener('pointercancel', clearSchemaPointer);
schemaDiagram.addEventListener('pointerleave', clearSchemaPointer);

// ── File System ─────────────────────────────────────────────────────────────

/**
 * Derive the expected project root path from the page URL.
 * When index.html is at  .../<root>/lens/index.html
 * the root is two levels up from the pathname.
 * Returns a platform-formatted path string, or null if not a file:// URL.
 */
function detectProjectRootPath() {
	if (!window.location.href.startsWith('file://')) return null;
	try {
		const url = new URL(window.location.href);
		const parts = decodeURIComponent(url.pathname).split('/').filter(part => part !== '');
		// Remove 'index.html' if present
		if (parts[parts.length - 1].endsWith('.html')) parts.pop();
		// Remove the 'lens' directory
		if (parts[parts.length - 1] === 'lens') parts.pop();
		// Windows paths start with a drive letter like 'C:'
		const isWindows = /^[A-Za-z]:$/.test(parts[0]);
		return isWindows ? parts.join('\\') : '/' + parts.join('/');
	} catch {
		return null;
	}
}

async function openFolder() {
	if (!window.showDirectoryPicker) {
		setStatus('❌ File System Access API not supported — use Chrome or Edge');
		return;
	}

	// Use the last-known handle as startIn so the picker opens in the right folder.
	// We check rootHandle first (active session), then lastRootHandle (persists after reset).
	const pickerOptions = { id: 'ai-db-investigator-lens', mode: 'read' };
	try {
		const startInHandle = await idbGet('rootHandle') || await idbGet('lastRootHandle');
		if (startInHandle) pickerOptions.startIn = startInHandle;
	} catch { /* ignore, picker will use browser default */ }

	let handle;
	try {
		handle = await window.showDirectoryPicker(pickerOptions);
	} catch (error) {
		if (error.name !== 'AbortError') {
			setStatus('❌ ' + error.message);
		}
		return;
	}

	await initWithHandle(handle);
}

async function initWithHandle(handle, restorePrefs = true) {
	try {
		investigationsHandle = await handle.getDirectoryHandle('investigations');
	} catch {
		setStatus('❌ No "investigations/" folder found in selected root');
		return;
	}

	try {
		dbContextHandle = await handle.getDirectoryHandle('db-context');
	} catch {
		dbContextHandle = null;
	}

	rootHandle = handle;

	// Persist handle to IndexedDB.
	// rootHandle: restored on next load (cleared on reset).
	// lastRootHandle: never cleared — used as startIn for the picker even after reset.
	try {
		await idbSet('rootHandle', rootHandle);
		await idbSet('lastRootHandle', rootHandle);
	} catch { /* storage unavailable */ }

	setStatus('📂 ' + rootHandle.name);
	landingEl.classList.add('hidden');
	resumeSectionEl.classList.add('hidden');
	contentEl.classList.remove('hidden');
	btnRefresh.disabled = false;
	btnClearStorage.classList.remove('hidden');

	await loadEnvironments(restorePrefs ? loadPrefs() : null);
}

async function readFileText(dirHandle, fileName) {
	const fileHandle = await dirHandle.getFileHandle(fileName);
	const file = await fileHandle.getFile();
	return file.text();
}

async function getSubdirectories(dirHandle) {
	const dirs = [];
	for await (const [name, handle] of dirHandle.entries()) {
		if (handle.kind === 'directory') {
			dirs.push({ name, handle });
		}
	}
	dirs.sort((a, b) => a.name.localeCompare(b.name));
	return dirs;
}

async function getFiles(dirHandle) {
	const files = [];
	for await (const [name, handle] of dirHandle.entries()) {
		if (handle.kind === 'file') {
			files.push({ name, handle });
		}
	}
	files.sort((a, b) => a.name.localeCompare(b.name));
	return files;
}

// ── Load environments ────────────────────────────────────────────────────────
async function loadEnvironments(prefs = null) {
	envSelect.innerHTML = '<option value="">— select env —</option>';
	envSelect.disabled = false;
	engineSelect.innerHTML = '<option value="">— select engine —</option>';
	engineSelect.disabled = true;
	clearSessionsPanel();
	clearSchema();

	const envDirs = await getSubdirectories(investigationsHandle);
	for (const { name } of envDirs) {
		const option = document.createElement('option');
		option.value = name;
		option.textContent = name;
		envSelect.appendChild(option);
	}

	// Restore saved env, or auto-select if only one
	const savedEnv = prefs?.env;
	const envMatch = savedEnv && envDirs.some(d => d.name === savedEnv);
	if (envMatch) {
		envSelect.value = savedEnv;
		await onEnvChange(prefs);
	} else if (envDirs.length === 1) {
		envSelect.value = envDirs[0].name;
		await onEnvChange(prefs);
	}
}

// ── Env change ───────────────────────────────────────────────────────────────
async function onEnvChange(prefs = null) {
	selectedEnv = envSelect.value;
	selectedEngine = '';
	savePrefEnv(selectedEnv);

	engineSelect.innerHTML = '<option value="">— select engine —</option>';
	engineSelect.disabled = true;
	clearSessionsPanel();
	clearSchema();
	showDetailPlaceholder();

	if (!selectedEnv) return;

	const envHandle = await investigationsHandle.getDirectoryHandle(selectedEnv);
	const engineDirs = await getSubdirectories(envHandle);

	for (const { name } of engineDirs) {
		const option = document.createElement('option');
		option.value = name;
		option.textContent = name;
		engineSelect.appendChild(option);
	}

	engineSelect.disabled = false;

	// Restore saved engine, or auto-select if only one
	const savedEngine = prefs?.engine;
	const engineMatch = savedEngine && engineDirs.some(d => d.name === savedEngine);
	if (engineMatch) {
		engineSelect.value = savedEngine;
		await onEngineChange();
	} else if (engineDirs.length === 1) {
		engineSelect.value = engineDirs[0].name;
		await onEngineChange();
	}
}

// ── Engine change ────────────────────────────────────────────────────────────
async function onEngineChange() {
	selectedEngine = engineSelect.value;
	savePrefEngine(selectedEngine);
	clearSessionsPanel();
	showDetailPlaceholder();

	if (!selectedEngine) {
		clearSchema();
		return;
	}

	await Promise.all([
		loadSessions(),
		loadDbContext(),
	]);
}

// ── Refresh ──────────────────────────────────────────────────────────────────
async function onRefresh() {
	if (!selectedEngine) return;
	showDetailPlaceholder();
	await loadSessions();
}

// ── Sessions ─────────────────────────────────────────────────────────────────
async function loadSessions() {
	sessionsList.innerHTML = '<div class="loading">Loading sessions…</div>';
	sessionsCount.textContent = '0';

	let envHandle;
	let engineHandle;

	try {
		envHandle = await investigationsHandle.getDirectoryHandle(selectedEnv);
		engineHandle = await envHandle.getDirectoryHandle(selectedEngine);
	} catch {
		sessionsList.innerHTML = '<span class="empty-msg">Failed to read sessions folder.</span>';
		return;
	}

	const sessionDirs = await getSubdirectories(engineHandle);
	sessionsList.innerHTML = '';
	sessionsCount.textContent = sessionDirs.length;

	if (sessionDirs.length === 0) {
		sessionsList.innerHTML = '<span class="empty-msg">No sessions found.</span>';
		return;
	}

	// Newest first (timestamp-aware, with lexical fallback)
	sessionDirs.sort((a, b) => compareSessionNamesDesc(a.name, b.name));

	for (const { name } of sessionDirs) {
		const card = buildSessionCard(name);
		sessionsList.appendChild(card);
	}
}

function parseSessionName(name) {
	// New pattern: YYYY-MM-DD-HHmm_<slug>
	const newPatternMatch = name.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})_(.+)$/);
	if (newPatternMatch) {
		const [, datePart, hourPart, minutePart, slug] = newPatternMatch;
		const label = slug.replace(/-/g, ' ');
		return { date: `${datePart} ${hourPart}:${minutePart}`, label };
	}

	// Legacy pattern: YYYY-MM-DD_HH-mm-SS_<slug>
	const legacyPatternMatch = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_(.+)$/);
	if (legacyPatternMatch) {
		const [, datePart, hourPart, minutePart, secondPart, slug] = legacyPatternMatch;
		const label = slug.replace(/-/g, ' ');
		return { date: `${datePart} ${hourPart}:${minutePart}:${secondPart}`, label };
	}

	return { date: null, label: name };
}

function sessionNameToSortTimestamp(name) {
	const newPatternMatch = name.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})_/);
	if (newPatternMatch) {
		const [, datePart, hourPart, minutePart] = newPatternMatch;
		return Date.parse(`${datePart}T${hourPart}:${minutePart}:00Z`) || null;
	}

	const legacyPatternMatch = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_/);
	if (legacyPatternMatch) {
		const [, datePart, hourPart, minutePart, secondPart] = legacyPatternMatch;
		return Date.parse(`${datePart}T${hourPart}:${minutePart}:${secondPart}Z`) || null;
	}

	return null;
}

function compareSessionNamesDesc(sessionNameA, sessionNameB) {
	const timestampA = sessionNameToSortTimestamp(sessionNameA);
	const timestampB = sessionNameToSortTimestamp(sessionNameB);

	if (timestampA != null && timestampB != null && timestampA !== timestampB) {
		return timestampB - timestampA;
	}

	if (timestampA != null && timestampB == null) return -1;
	if (timestampA == null && timestampB != null) return 1;

	return sessionNameB.localeCompare(sessionNameA);
}

function buildSessionCard(sessionName) {
	const { date, label } = parseSessionName(sessionName);

	const card = document.createElement('div');
	card.className = 'session-card';
	card.dataset.session = sessionName;
	card.innerHTML =
		'<div class="session-label">' + escapeHtml(label) + '</div>' +
		(date ? '<div class="session-date">' + escapeHtml(date) + ' UTC</div>' : '');

	card.addEventListener('click', () => {
		document.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
		card.classList.add('active');
		loadSessionDetail(sessionName);
	});

	return card;
}

// ── Session detail ───────────────────────────────────────────────────────────
async function loadSessionDetail(sessionName) {
	detailPlaceholder.classList.add('hidden');
	detailContent.classList.remove('hidden');

	reportBody.innerHTML = '<div class="loading">Loading report…</div>';
	queriesList.innerHTML = '';
	queriesCount.textContent = '0';

	const { date, label } = parseSessionName(sessionName);

	// Reveal and switch to the session tab
	if (tabBtnSession && tabSessionLabel) {
		tabBtnSession.classList.remove('hidden');
		tabSessionLabel.textContent = label;
		switchTab('session');
	}

	detailSessionMeta.innerHTML =
		'<span class="meta-env">'     + escapeHtml(selectedEnv)    + '</span>' +
		'<span class="meta-sep">/</span>' +
		'<span class="meta-engine">'  + escapeHtml(selectedEngine) + '</span>' +
		'<span class="meta-sep">/</span>' +
		'<span class="meta-session">' + escapeHtml(label)          + '</span>' +
		(date ? '<span class="meta-date">' + escapeHtml(date) + ' UTC</span>' : '');

	let sessionHandle;
	try {
		const envHandle    = await investigationsHandle.getDirectoryHandle(selectedEnv);
		const engineHandle = await envHandle.getDirectoryHandle(selectedEngine);
		sessionHandle      = await engineHandle.getDirectoryHandle(sessionName);
	} catch {
		reportBody.innerHTML = '<p class="error-msg">Failed to open session folder.</p>';
		return;
	}

	const files = await getFiles(sessionHandle);

	// Investigation report
	const reportFile = files.find(f => f.name === 'investigation-report.md');
	if (reportFile) {
		const file = await reportFile.handle.getFile();
		const text = await file.text();
		reportBody.innerHTML = marked.parse(text);
	} else {
		reportBody.innerHTML = '<em style="color:#9ca3af;padding:1rem;display:block">No investigation-report.md found in this session.</em>';
	}

	// Query files
	const queryFiles = files.filter(f => f.name !== 'investigation-report.md');
	queriesCount.textContent = queryFiles.length;

	for (const { name, handle } of queryFiles) {
		const file = await handle.getFile();
		const text = await file.text();
		queriesList.appendChild(buildQueryBlock(name, text));
	}

	// Scroll session tab pane to top
	const sessionPane = document.getElementById('tab-session');
	if (sessionPane) sessionPane.scrollTop = 0;
}

function buildQueryBlock(fileName, rawContent) {
	// Parse the comment-header metadata from the top of the file
	const lines = rawContent.split('\n');
	const metaEntries = [];
	let bodyStart = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith('-- ')) {
			const colonIdx = line.indexOf(': ');
			if (colonIdx > 0) {
				metaEntries.push([line.slice(3, colonIdx), line.slice(colonIdx + 2)]);
				bodyStart = i + 1;
			}
		} else {
			break;
		}
	}

	const queryText = lines.slice(bodyStart).join('\n').trim();

	const wrapper = document.createElement('div');
	wrapper.className = 'query-block';

	let metaHtml = '';
	if (metaEntries.length > 0) {
		const rows = metaEntries.map(([key, val]) =>
			'<span class="query-meta-key">' + escapeHtml(key) + '</span>' +
			'<span class="query-meta-val">' + escapeHtml(val) + '</span>'
		).join('');
		metaHtml = '<div class="query-meta">' + rows + '</div>';
	}

	wrapper.innerHTML =
		'<div class="query-header" data-open="false">' +
			'<span style="font-size:0.85rem">🗄️</span>' +
			'<span class="query-filename">' + escapeHtml(fileName) + '</span>' +
			'<button class="query-copy-btn" title="Copy query to clipboard">Copy</button>' +
			'<span class="query-toggle">▼</span>' +
		'</div>' +
		'<div class="query-body" style="display:none">' +
			metaHtml +
			'<pre class="query-code"><code>' + escapeHtml(queryText) + '</code></pre>' +
		'</div>';

	const header   = wrapper.querySelector('.query-header');
	const body     = wrapper.querySelector('.query-body');
	const toggle   = wrapper.querySelector('.query-toggle');
	const copyBtn  = wrapper.querySelector('.query-copy-btn');

	header.addEventListener('click', event => {
		if (event.target === copyBtn) return;
		const isOpen = header.dataset.open === 'true';
		header.dataset.open = String(!isOpen);
		body.style.display = isOpen ? 'none' : 'block';
		toggle.textContent = isOpen ? '▼' : '▲';
	});

	copyBtn.addEventListener('click', event => {
		event.stopPropagation();
		navigator.clipboard.writeText(queryText).then(() => {
			copyBtn.textContent = '✓ Copied';
			copyBtn.classList.add('copied');
			setTimeout(() => {
				copyBtn.textContent = 'Copy';
				copyBtn.classList.remove('copied');
			}, 1800);
		});
	});

	return wrapper;
}

// ── DB Context (schema + entity-map + db-profile) ────────────────────────────
async function loadDbContext() {
	clearSchema();

	if (!dbContextHandle) return;

	let engineCtxHandle;

	try {
		const envCtxHandle = await dbContextHandle.getDirectoryHandle(selectedEnv);
		engineCtxHandle    = await envCtxHandle.getDirectoryHandle(selectedEngine);
	} catch {
		schemaDiagram.innerHTML = '<span class="empty-msg">No db-context found for this env / engine.</span>';
		return;
	}

	// Load all three context files in parallel
	const [schemaResult, entityMapResult, dbProfileResult] = await Promise.allSettled([
		readFileText(engineCtxHandle, 'schema.mermaid'),
		readFileText(engineCtxHandle, 'entity-map.md'),
		readFileText(engineCtxHandle, 'database-profile.md'),
	]);

	// Schema diagram
	if (schemaResult.status === 'fulfilled') {
		await renderMermaidDiagram(schemaResult.value);
	} else {
		schemaDiagram.innerHTML = '<span class="empty-msg">No schema.mermaid found.</span>';
	}

	// Entity map
	if (entityMapResult.status === 'fulfilled') {
		entityMapContent.innerHTML = marked.parse(entityMapResult.value);
	} else {
		entityMapContent.innerHTML = '<span class="empty-msg">No entity-map.md found.</span>';
	}

	// DB profile
	if (dbProfileResult.status === 'fulfilled') {
		dbProfileContent.innerHTML = marked.parse(dbProfileResult.value);
	} else {
		dbProfileContent.innerHTML = '<span class="empty-msg">No database-profile.md found.</span>';
	}
}

async function renderMermaidDiagram(diagramText) {
	schemaDiagram.innerHTML = '<div class="loading">Rendering diagram…</div>';

	try {
		const normalizedDiagramText = String(diagramText)
			.replace(/^\uFEFF/, '')
			.split(/\r?\n/)
			.filter(line => !line.trimStart().startsWith('%%'))
			.join('\n')
			.trim();

		if (!normalizedDiagramText) {
			throw new Error('schema.mermaid is empty after normalization');
		}

		if (!normalizedDiagramText.startsWith('erDiagram')) {
			throw new Error('schema.mermaid must start with erDiagram');
		}

		// Parse first so syntax errors are explicit and never fail silently.
		await mermaid.parse(normalizedDiagramText, { suppressErrors: false });

		const renderId = 'lens-mermaid-' + Date.now();
		const { svg } = await mermaid.render(renderId, normalizedDiagramText);
		if (!svg || !svg.includes('<svg')) {
			throw new Error('Mermaid did not produce SVG output');
		}

		schemaDiagram.innerHTML = svg;
		const renderedSvg = schemaDiagram.querySelector('svg');
		if (!renderedSvg) {
			throw new Error('Rendered SVG is missing from schema container');
		}

		initializeSchemaPanZoom(renderedSvg);
	} catch (error) {
		console.error('Mermaid render failed:', error);
		schemaDiagram.innerHTML =
			'<pre class="error-msg">Failed to render diagram:\n' + escapeHtml(error.message) + '</pre>';
		schemaPanZoomState.svgElement = null;
		updateSchemaZoomUi();
	}
}

function distanceBetweenPoints(pointA, pointB) {
	const deltaX = pointB.x - pointA.x;
	const deltaY = pointB.y - pointA.y;
	return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function enterSchemaFullscreen() {
	if (!schemaFullscreenOverlay || !schemaFullscreenCanvas || !schemaDefaultCanvas) return;
	if (schemaPanZoomState.isFullscreen) return;

	schemaPanZoomState.isFullscreen = true;
	schemaFullscreenOverlay.classList.remove('hidden');
	schemaFullscreenCanvas.appendChild(schemaDiagram);
	updateSchemaZoomUi();
}

function exitSchemaFullscreen() {
	if (!schemaFullscreenOverlay || !schemaFullscreenCanvas || !schemaDefaultCanvas) return;
	if (!schemaPanZoomState.isFullscreen) return;

	schemaPanZoomState.isFullscreen = false;
	schemaDefaultCanvas.appendChild(schemaDiagram);
	schemaFullscreenOverlay.classList.add('hidden');
	updateSchemaZoomUi();
}

function initializeSchemaPanZoom(renderedSvg) {
	const viewBox = renderedSvg.viewBox && renderedSvg.viewBox.baseVal
		? renderedSvg.viewBox.baseVal
		: null;

	const fallbackWidth = Math.max(renderedSvg.clientWidth || 0, 1200);
	const fallbackHeight = Math.max(renderedSvg.clientHeight || 0, 700);

	schemaPanZoomState.naturalWidth = viewBox && viewBox.width > 0 ? viewBox.width : fallbackWidth;
	schemaPanZoomState.naturalHeight = viewBox && viewBox.height > 0 ? viewBox.height : fallbackHeight;
	schemaPanZoomState.svgElement = renderedSvg;

	renderedSvg.style.display = 'block';
	renderedSvg.style.maxWidth = 'none';
	renderedSvg.style.margin = '0';

	resetSchemaZoom();
}

function zoomSchemaByStep(direction) {
	if (!schemaPanZoomState.svgElement) return;
	const factor = direction > 0 ? (1 + schemaPanZoomState.step) : (1 - schemaPanZoomState.step);
	const rectangle = schemaDiagram.getBoundingClientRect();
	setSchemaZoom(
		schemaPanZoomState.scale * factor,
		rectangle.left + rectangle.width / 2,
		rectangle.top + rectangle.height / 2
	);
}

function resetSchemaZoom() {
	if (!schemaPanZoomState.svgElement) {
		schemaPanZoomState.scale = 1;
		updateSchemaZoomUi();
		return;
	}
	setSchemaZoom(1);
	schemaDiagram.scrollLeft = 0;
	schemaDiagram.scrollTop = 0;
}

function setSchemaZoom(nextScale, anchorClientX = null, anchorClientY = null) {
	if (!schemaPanZoomState.svgElement) return;

	const clampedScale = Math.min(
		schemaPanZoomState.maxScale,
		Math.max(schemaPanZoomState.minScale, nextScale)
	);

	const previousScale = schemaPanZoomState.scale || 1;
	const rectangle = schemaDiagram.getBoundingClientRect();
	const localAnchorX = anchorClientX == null ? rectangle.width / 2 : (anchorClientX - rectangle.left);
	const localAnchorY = anchorClientY == null ? rectangle.height / 2 : (anchorClientY - rectangle.top);

	const contentAnchorX = (schemaDiagram.scrollLeft + localAnchorX) / previousScale;
	const contentAnchorY = (schemaDiagram.scrollTop + localAnchorY) / previousScale;

	schemaPanZoomState.scale = clampedScale;
	schemaPanZoomState.svgElement.style.width = (schemaPanZoomState.naturalWidth * clampedScale) + 'px';
	schemaPanZoomState.svgElement.style.height = (schemaPanZoomState.naturalHeight * clampedScale) + 'px';

	schemaDiagram.scrollLeft = (contentAnchorX * clampedScale) - localAnchorX;
	schemaDiagram.scrollTop = (contentAnchorY * clampedScale) - localAnchorY;

	updateSchemaZoomUi();
}

function updateSchemaZoomUi() {
	if (schemaZoomValueEl) {
		schemaZoomValueEl.textContent = Math.round(schemaPanZoomState.scale * 100) + '%';
	}
	if (schemaFsZoomValueEl) {
		schemaFsZoomValueEl.textContent = Math.round(schemaPanZoomState.scale * 100) + '%';
	}

	const hasDiagram = Boolean(schemaPanZoomState.svgElement);
	if (schemaZoomInBtn) schemaZoomInBtn.disabled = !hasDiagram;
	if (schemaZoomOutBtn) schemaZoomOutBtn.disabled = !hasDiagram;
	if (schemaZoomResetBtn) schemaZoomResetBtn.disabled = !hasDiagram;
	if (schemaFullscreenOpenBtn) schemaFullscreenOpenBtn.disabled = !hasDiagram;
	if (schemaFsZoomInBtn) schemaFsZoomInBtn.disabled = !hasDiagram;
	if (schemaFsZoomOutBtn) schemaFsZoomOutBtn.disabled = !hasDiagram;
	if (schemaFsZoomResetBtn) schemaFsZoomResetBtn.disabled = !hasDiagram;
}

// ── Reset helpers ────────────────────────────────────────────────────────────
function clearSessionsPanel() {
	sessionsList.innerHTML = '<span class="empty-msg">Select an engine to load sessions.</span>';
	sessionsCount.textContent = '0';
}

function clearSchema() {
	exitSchemaFullscreen();
	schemaDiagram.innerHTML    = '<span class="empty-msg">Select an engine to load schema.</span>';
	entityMapContent.innerHTML = '<span class="empty-msg">No entity-map.md found.</span>';
	dbProfileContent.innerHTML = '<span class="empty-msg">No database-profile.md found.</span>';
	schemaPanZoomState.svgElement = null;
	schemaPanZoomState.scale = 1;
	updateSchemaZoomUi();
}

function showDetailPlaceholder() {
	detailPlaceholder.classList.remove('hidden');
	detailContent.classList.add('hidden');
	switchTab('schema');
}

function setStatus(text) {
	toolbarStatus.textContent = text;
}

// ── Utils ────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
	return String(str)
		.replace(/&/g,  '&amp;')
		.replace(/</g,  '&lt;')
		.replace(/>/g,  '&gt;')
		.replace(/"/g,  '&quot;')
		.replace(/'/g,  '&#39;');
}

// ── Storage management ───────────────────────────────────────────────────────
async function clearStorage() {
	// Clear the active handle so tryRestoreSession no longer auto-loads.
	// lastRootHandle is intentionally preserved so the picker can startIn the right folder.
	try { await idbDelete('rootHandle'); } catch { /* ignore */ }
	localStorage.removeItem('lens-env');
	localStorage.removeItem('lens-engine');

	rootHandle           = null;
	investigationsHandle = null;
	dbContextHandle      = null;
	selectedEnv          = '';
	selectedEngine       = '';

	landingEl.classList.remove('hidden');
	contentEl.classList.add('hidden');
	btnRefresh.disabled  = true;
	btnClearStorage.classList.add('hidden');
	envSelect.innerHTML    = '<option value="">— select env —</option>';
	envSelect.disabled     = true;
	engineSelect.innerHTML = '<option value="">— select engine —</option>';
	engineSelect.disabled  = true;
	setStatus('No folder opened');
	clearSessionsPanel();
	clearSchema();
	showDetailPlaceholder();
	if (tabBtnSession) {
		tabBtnSession.classList.add('hidden');
	}
	switchTab('schema');
}

// ── Session restore on page load ─────────────────────────────────────────────
async function tryRestoreSession() {
	let storedHandle;
	try {
		storedHandle = await idbGet('rootHandle');
	} catch {
		return;
	}

	if (!storedHandle) return;

	const permission = await storedHandle.queryPermission({ mode: 'read' });

	if (permission === 'granted') {
		await initWithHandle(storedHandle, true);
	} else if (permission === 'prompt') {
		// Permission needs a user gesture — show a resume button on the landing page
		resumeSectionEl.classList.remove('hidden');
		btnResumeFolderEl.textContent = '📂 Resume: ' + storedHandle.name;
		btnResumeFolderEl.onclick = async () => {
			const granted = await storedHandle.requestPermission({ mode: 'read' });
			if (granted === 'granted') {
				await initWithHandle(storedHandle, true);
			}
		};
	}
	// If 'denied', nothing to restore — user sees normal landing
}

// Show auto-detected project root path on the landing card
const detectedRoot = detectProjectRootPath();
if (detectedRoot) {
	const detectedPathNote = document.getElementById('detected-path-note');
	const detectedPathText = document.getElementById('detected-path-text');
	detectedPathText.textContent = detectedRoot;
	detectedPathNote.classList.remove('hidden');
}

tryRestoreSession();
