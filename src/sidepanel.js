// src/sidepanel.js
// AnyLLM — Side Panel Script
//
// Replaces the old dropdown popup. Opens as a persistent Chrome side panel
// (see background.js's chrome.sidePanel.setPanelBehavior call) and renders
// Pins, Highlights, and extracted Context natively in its own page — instead
// of the old approach of injecting floating overlay panels into the host page.
//
// Pins and Highlights are read directly from chrome.storage.local via the
// pinService/highlightService modules (pure storage, no DOM dependency).
// Actions that must touch the host page's DOM (extracting context, removing
// a highlight span, toggling deleted messages) are relayed to the content
// script via chrome.tabs.sendMessage.

'use strict';

import { getPins, unpinMessage } from './services/pinService.js';
import { getHighlights } from './services/highlightService.js';
import { getNamespaceKey, DATA_TYPES } from './services/storage.js';

// ── Elements ─────────────────────────────────────────────────────────────────

const platformEl          = document.getElementById('sp-platform');
const tabs                 = document.querySelectorAll('.sp-tab');
const panes = {
  pins:       document.getElementById('pane-pins'),
  highlights: document.getElementById('pane-highlights'),
  context:    document.getElementById('pane-context'),
  tools:      document.getElementById('pane-tools'),
};

const pinsListEl          = document.getElementById('pins-list');
const pinsEmptyEl         = document.getElementById('pins-empty');
const highlightsListEl    = document.getElementById('highlights-list');
const highlightsEmptyEl   = document.getElementById('highlights-empty');
const btnExtract          = document.getElementById('btn-extract');
const contextResultEl     = document.getElementById('context-result');
const btnToggleDeleted    = document.getElementById('btn-toggle-deleted');
const btnToggleDeletedLbl = document.getElementById('btn-toggle-deleted-label');
const btnBulkDelete       = document.getElementById('btn-bulk-delete');

// ── Tab switching ─────────────────────────────────────────────────────────────

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    Object.values(panes).forEach((p) => p.classList.remove('active'));
    panes[tab.dataset.tab].classList.add('active');
  });
});

// ── State ──────────────────────────────────────────────────────────────────────

let activeTabId = null;
let currentPlatform = null;
let currentConversationId = null;
let pinStorageKey = null;
let highlightStorageKey = null;
let _showingDeleted = false;
let _bulkModeOn = false;
let _storageListenerAttached = false;

// ── Active tab / platform detection ───────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function detectPlatformLabel(url) {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes('claude.ai')) return { label: 'Claude.ai', color: '#7c3aed' };
    if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) return { label: 'ChatGPT', color: '#10a37f' };
    if (hostname.includes('gemini.google.com')) return { label: 'Google Gemini', color: '#4285f4' };
  } catch (_) {
    // Invalid/unavailable URL — treated as unsupported below
  }
  return null;
}

function requestContextInfo(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'ANYLLM_GET_CONTEXT_INFO' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function refreshForActiveTab() {
  const tab = await getActiveTab();
  if (!tab) { setUnsupported(); return; }
  activeTabId = tab.id;

  const detected = detectPlatformLabel(tab.url || '');
  if (!detected) { setUnsupported(); return; }

  const info = await requestContextInfo(tab.id);
  if (!info) {
    platformEl.textContent = `Platform: ${detected.label} (waiting for page…)`;
    platformEl.style.color = detected.color;
    disableFeatureButtons();
    return;
  }

  currentPlatform = info.platform;
  currentConversationId = info.conversationId;
  platformEl.textContent = `Platform: ${detected.label}`;
  platformEl.style.color = detected.color;
  enableFeatureButtons();

  attachStorageListeners();
  await loadPins();
  await loadHighlights();
}

function setUnsupported() {
  currentPlatform = null;
  currentConversationId = null;
  platformEl.textContent = 'Open Claude, ChatGPT or Gemini to get started.';
  platformEl.style.color = '#ef4444';
  disableFeatureButtons();
  renderPins([]);
  renderHighlights([]);
  pinsEmptyEl.textContent = 'Open Claude.ai, ChatGPT, or Gemini to see pins here.';
  highlightsEmptyEl.textContent = 'Open Claude.ai, ChatGPT, or Gemini to see highlights here.';
}

function disableFeatureButtons() {
  [btnExtract, btnToggleDeleted, btnBulkDelete].forEach((b) => { b.disabled = true; });
}
function enableFeatureButtons() {
  [btnExtract, btnToggleDeleted, btnBulkDelete].forEach((b) => { b.disabled = false; });
}

// ── Live sync with in-page toolbar actions ────────────────────────────────────
// Pins/highlights can also be created or removed from the message toolbar on
// the page itself; chrome.storage.onChanged keeps this panel in sync with that.

function attachStorageListeners() {
  pinStorageKey = getNamespaceKey(currentPlatform, currentConversationId, DATA_TYPES.PIN);
  highlightStorageKey = getNamespaceKey(currentPlatform, currentConversationId, DATA_TYPES.HIGHLIGHT);

  if (_storageListenerAttached) return;
  _storageListenerAttached = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (pinStorageKey && changes[pinStorageKey]) {
      renderPins(changes[pinStorageKey].newValue || []);
    }
    if (highlightStorageKey && changes[highlightStorageKey]) {
      renderHighlights(changes[highlightStorageKey].newValue || []);
    }
  });
}

// ── Pins ───────────────────────────────────────────────────────────────────────

async function loadPins() {
  const pins = await getPins(currentPlatform, currentConversationId);
  renderPins(pins);
}

function renderPins(pins) {
  pinsListEl.innerHTML = '';
  pinsEmptyEl.style.display = pins.length ? 'none' : 'block';

  for (const pin of pins) {
    const li = document.createElement('li');
    li.className = 'sp-card';

    const head = document.createElement('div');
    head.className = 'sp-card-head';
    const roleTag = document.createElement('span');
    roleTag.className = `sp-card-role ${pin.role}`;
    roleTag.textContent = pin.role;
    head.appendChild(roleTag);

    const textEl = document.createElement('div');
    textEl.className = 'sp-card-text';
    textEl.textContent = pin.text;

    const actions = document.createElement('div');
    actions.className = 'sp-card-actions';
    const unpinBtn = document.createElement('button');
    unpinBtn.className = 'sp-card-action-btn';
    unpinBtn.textContent = 'Unpin';
    unpinBtn.addEventListener('click', async () => {
      await unpinMessage(pin.id, currentPlatform, currentConversationId);
      if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_SYNC_PINS' });
      }
    });
    actions.appendChild(unpinBtn);

    li.appendChild(head);
    li.appendChild(textEl);
    li.appendChild(actions);
    pinsListEl.appendChild(li);
  }
}

// ── Highlights ─────────────────────────────────────────────────────────────────

async function loadHighlights() {
  const highlights = await getHighlights(currentPlatform, currentConversationId);
  renderHighlights(highlights);
}

function renderHighlights(highlights) {
  highlightsListEl.innerHTML = '';
  highlightsEmptyEl.style.display = highlights.length ? 'none' : 'block';

  for (const hl of highlights) {
    const li = document.createElement('li');
    li.className = 'sp-card';

    const head = document.createElement('div');
    head.className = 'sp-card-head';
    const swatch = document.createElement('span');
    swatch.className = `sp-highlight-swatch ${hl.color}`;
    const label = document.createElement('span');
    label.textContent = hl.color;
    head.appendChild(swatch);
    head.appendChild(label);

    const textEl = document.createElement('div');
    textEl.className = 'sp-card-text';
    textEl.textContent = hl.text;

    const actions = document.createElement('div');
    actions.className = 'sp-card-actions';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'sp-card-action-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (!activeTabId) return;
      chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_REMOVE_HIGHLIGHT', record: hl });
    });
    actions.appendChild(removeBtn);

    li.appendChild(head);
    li.appendChild(textEl);
    li.appendChild(actions);
    highlightsListEl.appendChild(li);
  }
}

// ── Context extraction & handoff ──────────────────────────────────────────────

btnExtract.addEventListener('click', () => {
  if (!activeTabId) return;
  btnExtract.disabled = true;
  btnExtract.textContent = 'Extracting…';

  chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_EXTRACT_CONTEXT' }, (response) => {
    btnExtract.disabled = false;
    btnExtract.textContent = '✦ Extract Context';

    contextResultEl.innerHTML = '';
    if (chrome.runtime.lastError || !response?.success) {
      const err = document.createElement('p');
      err.className = 'sp-empty';
      err.textContent = response?.error || 'Could not extract context. Reload the page and try again.';
      contextResultEl.appendChild(err);
      return;
    }
    renderContext(response.context);
  });
});

function appendSection(title, items, className) {
  if (!items.length) return;
  const wrap = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'sp-section-heading';
  heading.textContent = title;
  wrap.appendChild(heading);

  for (const text of items) {
    const item = document.createElement('div');
    item.className = className;
    item.textContent = text;
    wrap.appendChild(item);
  }
  contextResultEl.appendChild(wrap);
}

function renderContext(ctx) {
  contextResultEl.innerHTML = '';

  // Topics
  if (ctx.topics?.length) {
    const wrap = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = 'sp-section-heading';
    heading.textContent = 'Topics';
    wrap.appendChild(heading);
    for (const topic of ctx.topics) {
      const pill = document.createElement('span');
      pill.className = 'sp-topic-pill';
      pill.textContent = topic;
      wrap.appendChild(pill);
    }
    contextResultEl.appendChild(wrap);
  }

  // Decisions
  appendSection(
    'Decisions',
    (ctx.decisions || []).map((d) => `[${d.role}] ${d.sentence}`),
    'sp-decision-item'
  );

  // Next steps
  appendSection(
    'Next Steps',
    (ctx.nextSteps || []).map((s) => `[${s.role}] ${s.sentence}`),
    'sp-nextstep-item'
  );

  // Code blocks
  if (ctx.codeBlocks?.length) {
    const wrap = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = 'sp-section-heading';
    heading.textContent = 'Code';
    wrap.appendChild(heading);
    for (const block of ctx.codeBlocks) {
      const pre = document.createElement('div');
      pre.className = 'sp-code-block';
      pre.textContent = block.code;
      wrap.appendChild(pre);
    }
    contextResultEl.appendChild(wrap);
  }

  // Handoff
  const handoffWrap = document.createElement('div');
  const handoffHeading = document.createElement('div');
  handoffHeading.className = 'sp-section-heading';
  handoffHeading.textContent = 'Handoff';
  handoffWrap.appendChild(handoffHeading);

  const textarea = document.createElement('textarea');
  textarea.className = 'sp-handoff-textarea';
  textarea.readOnly = true;
  textarea.value = ctx.handoffPrompt || '';
  handoffWrap.appendChild(textarea);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'sp-handoff-actions';

  const makeHandoffBtn = (label, targetPlatform) => {
    const btn = document.createElement('button');
    btn.className = 'sp-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (targetPlatform === 'copy') {
        navigator.clipboard.writeText(ctx.handoffPrompt || '').then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = label; }, 1500);
        });
        return;
      }
      chrome.runtime.sendMessage({
        type: 'ANYLLM_DELIVER_HANDOFF_NEW_TAB',
        targetPlatform,
        prompt: ctx.handoffPrompt || '',
      });
    });
    return btn;
  };

  actionsRow.appendChild(makeHandoffBtn('📋 Copy', 'copy'));
  actionsRow.appendChild(makeHandoffBtn('Claude', 'claude'));
  actionsRow.appendChild(makeHandoffBtn('ChatGPT', 'chatgpt'));
  actionsRow.appendChild(makeHandoffBtn('Gemini', 'gemini'));
  handoffWrap.appendChild(actionsRow);

  contextResultEl.appendChild(handoffWrap);
}

// ── Tools: show/hide deleted, bulk delete ─────────────────────────────────────

btnToggleDeleted.addEventListener('click', () => {
  if (!activeTabId) return;
  chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_TOGGLE_DELETED' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) return;
    _showingDeleted = response.visible;
    btnToggleDeletedLbl.textContent = _showingDeleted ? '🙈 Hide Deleted' : '👁 Show Deleted';
    btnToggleDeleted.classList.toggle('active-state', _showingDeleted);
  });
});

btnBulkDelete.addEventListener('click', () => {
  if (!activeTabId) return;
  chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_BULK_DELETE_MODE' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) return;
    _bulkModeOn = response.mode === 'on';
    btnBulkDelete.textContent = _bulkModeOn ? '✕ Exit Bulk Mode' : '🗑 Bulk Delete';
    btnBulkDelete.classList.toggle('active-state', _bulkModeOn);
  });
});

// ── Tab lifecycle: refresh when the active tab changes or navigates ───────────

chrome.tabs.onActivated.addListener(() => refreshForActiveTab());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'complete') refreshForActiveTab();
});

// ── Init ───────────────────────────────────────────────────────────────────────

disableFeatureButtons();
refreshForActiveTab();
