// src/sidepanel.js
// AnyLLM — Side Panel Script
//
// Replaces the old dropdown popup. Opens as a persistent Chrome side panel
// (see background.js's chrome.sidePanel.setPanelBehavior call) and renders
// Pins and extracted Context natively in its own page — instead of the old
// approach of injecting floating overlay panels into the host page.
//
// Pins are read directly from chrome.storage.local via the pinService module
// (pure storage, no DOM dependency). Actions that must touch the host page's
// DOM (extracting context) are relayed to the content script via
// chrome.tabs.sendMessage.

'use strict';

import { getPins, unpinMessage } from './services/pinService.js';
import { getNamespaceKey, DATA_TYPES, getCollection, setCollection } from './services/storage.js';

// Cap how many past extractions we keep per conversation (oldest dropped first).
const MAX_CONTEXT_HISTORY = 20;

// ── Elements ─────────────────────────────────────────────────────────────────

const platformEl      = document.getElementById('sp-platform');
const tabs             = document.querySelectorAll('.sp-tab');
const panes = {
  pins:    document.getElementById('pane-pins'),
  context: document.getElementById('pane-context'),
  history: document.getElementById('pane-history'),
};

const pinsListEl      = document.getElementById('pins-list');
const pinsEmptyEl     = document.getElementById('pins-empty');
const btnPackPage     = document.getElementById('btn-pack-page');
const btnExtract      = document.getElementById('btn-extract');
const contextResultEl = document.getElementById('context-result');
const historyListEl   = document.getElementById('history-list');
const historyEmptyEl  = document.getElementById('history-empty');

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
let historyStorageKey = null;
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
  await loadHistory();
}

function setUnsupported() {
  currentPlatform = null;
  currentConversationId = null;
  platformEl.textContent = 'Open Claude, ChatGPT or Gemini to get started.';
  platformEl.style.color = '#ef4444';
  disableFeatureButtons();
  renderPins([]);
  renderHistory([]);
  pinsEmptyEl.textContent = 'Open Claude.ai, ChatGPT, or Gemini to see your Pack here.';
  historyEmptyEl.textContent = 'Open Claude.ai, ChatGPT, or Gemini to see Prime history here.';
}

function disableFeatureButtons() {
  btnExtract.disabled = true;
  btnPackPage.disabled = true;
}
function enableFeatureButtons() {
  btnExtract.disabled = false;
  btnPackPage.disabled = false;
}

// ── Live sync with in-page toolbar actions ────────────────────────────────────
// Pins can also be created or removed from the message toolbar on the page
// itself; chrome.storage.onChanged keeps this panel in sync with that.

function attachStorageListeners() {
  pinStorageKey = getNamespaceKey(currentPlatform, currentConversationId, DATA_TYPES.PIN);
  historyStorageKey = getNamespaceKey(currentPlatform, currentConversationId, DATA_TYPES.HANDOFF);

  if (_storageListenerAttached) return;
  _storageListenerAttached = true;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (pinStorageKey && changes[pinStorageKey]) {
      renderPins(changes[pinStorageKey].newValue || []);
    }
    if (historyStorageKey && changes[historyStorageKey]) {
      renderHistory(changes[historyStorageKey].newValue || []);
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

    const copyBtn = document.createElement('button');
    copyBtn.className = 'sp-card-action-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(pin.text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });

    const unpinBtn = document.createElement('button');
    unpinBtn.className = 'sp-card-action-btn';
    unpinBtn.textContent = 'Remove from Pack';
    unpinBtn.addEventListener('click', async () => {
      await unpinMessage(pin.id, currentPlatform, currentConversationId);
      if (activeTabId) {
        chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_SYNC_PINS' });
      }
    });

    actions.appendChild(copyBtn);
    actions.appendChild(unpinBtn);

    li.appendChild(head);
    li.appendChild(textEl);
    li.appendChild(actions);
    pinsListEl.appendChild(li);
  }
}

// ── Pack the whole page (instead of message-by-message) ───────────────────────

btnPackPage.addEventListener('click', () => {
  if (!activeTabId) return;
  btnPackPage.disabled = true;
  btnPackPage.textContent = 'Packing…';

  chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_PACK_PAGE' }, (response) => {
    btnPackPage.disabled = false;
    btnPackPage.textContent = '📦 Pack Whole Chat';

    if (chrome.runtime.lastError || !response?.success) {
      console.error('[AnyLLM] Pack whole page failed:', response?.error || chrome.runtime.lastError);
      return;
    }
    // chrome.storage.onChanged will also pick this up, but refresh immediately
    // for instant feedback rather than waiting on the event round-trip.
    loadPins();
  });
});

// ── Context extraction & handoff ──────────────────────────────────────────────

btnExtract.addEventListener('click', () => {
  if (!activeTabId) return;
  btnExtract.disabled = true;
  btnExtract.textContent = 'Extracting…';

  chrome.tabs.sendMessage(activeTabId, { type: 'ANYLLM_EXTRACT_CONTEXT' }, (response) => {
    btnExtract.disabled = false;
    btnExtract.textContent = '✦ Extract';

    contextResultEl.innerHTML = '';
    if (chrome.runtime.lastError || !response?.success) {
      const err = document.createElement('p');
      err.className = 'sp-empty';
      err.textContent = response?.error || 'Could not extract context. Reload the page and try again.';
      contextResultEl.appendChild(err);
      return;
    }
    renderContext(response.context);
    saveContextHistory(response.context);
  });
});

// ── Prime history (past extractions) ──────────────────────────────────────────

async function saveContextHistory(ctx) {
  if (!currentPlatform || !currentConversationId) return;

  const entry = {
    id: `ctxhist::${Date.now()}`,
    createdAt: Date.now(),
    totalMessages: ctx.totalMessages,
    promptText: ctx.handoffPrompt || '',
  };

  const existing = await getCollection(currentPlatform, currentConversationId, DATA_TYPES.HANDOFF);
  const updated = [...existing, entry].slice(-MAX_CONTEXT_HISTORY);
  await setCollection(currentPlatform, currentConversationId, DATA_TYPES.HANDOFF, updated);
  renderHistory(updated);
}

async function loadHistory() {
  const history = await getCollection(currentPlatform, currentConversationId, DATA_TYPES.HANDOFF);
  renderHistory(history);
}

function renderHistory(history) {
  const sorted = [...history].sort((a, b) => b.createdAt - a.createdAt);
  historyListEl.innerHTML = '';
  historyEmptyEl.style.display = sorted.length ? 'none' : 'block';

  for (const entry of sorted) {
    const li = document.createElement('li');
    li.className = 'sp-card';

    const head = document.createElement('div');
    head.className = 'sp-card-head';
    const dateTag = document.createElement('span');
    dateTag.className = 'sp-card-role';
    dateTag.textContent = new Date(entry.createdAt).toLocaleString();
    const countTag = document.createElement('span');
    countTag.className = 'sp-card-role';
    countTag.textContent = `${entry.totalMessages} msgs`;
    head.appendChild(dateTag);
    head.appendChild(countTag);

    const textEl = document.createElement('div');
    textEl.className = 'sp-card-text';
    textEl.textContent = entry.promptText;

    const actions = document.createElement('div');
    actions.className = 'sp-card-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'sp-card-action-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.promptText).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'sp-card-action-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      const current = await getCollection(currentPlatform, currentConversationId, DATA_TYPES.HANDOFF);
      const filtered = current.filter((h) => h.id !== entry.id);
      await setCollection(currentPlatform, currentConversationId, DATA_TYPES.HANDOFF, filtered);
      renderHistory(filtered);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(head);
    li.appendChild(textEl);
    li.appendChild(actions);
    historyListEl.appendChild(li);
  }
}

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

  // Handoff (no heading — just the prompt + icon-only action buttons)
  const handoffWrap = document.createElement('div');

  const textarea = document.createElement('textarea');
  textarea.className = 'sp-handoff-textarea';
  textarea.readOnly = true;
  textarea.value = ctx.handoffPrompt || '';
  handoffWrap.appendChild(textarea);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'sp-handoff-actions';

  const makeHandoffBtn = (label, targetPlatform, iconSrc) => {
    const btn = document.createElement('button');
    btn.className = 'sp-btn sp-btn-icon';
    btn.setAttribute('aria-label', label);
    btn.title = label;

    if (iconSrc) {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = label;
      btn.appendChild(img);
    } else {
      btn.textContent = '📋';
    }

    btn.addEventListener('click', () => {
      if (targetPlatform === 'copy') {
        navigator.clipboard.writeText(ctx.handoffPrompt || '').then(() => {
          btn.classList.add('copied');
          setTimeout(() => { btn.classList.remove('copied'); }, 1200);
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

  actionsRow.appendChild(makeHandoffBtn('Copy', 'copy'));
  actionsRow.appendChild(makeHandoffBtn('Claude', 'claude', '/claude.png'));
  actionsRow.appendChild(makeHandoffBtn('ChatGPT', 'chatgpt', '/chatgpt.jpg'));
  actionsRow.appendChild(makeHandoffBtn('Gemini', 'gemini', '/gemini.webp'));
  handoffWrap.appendChild(actionsRow);

  contextResultEl.appendChild(handoffWrap);
}

// ── Tab lifecycle: refresh when the active tab changes or navigates ───────────

chrome.tabs.onActivated.addListener(() => refreshForActiveTab());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'complete') refreshForActiveTab();
});

// ── Init ───────────────────────────────────────────────────────────────────────

disableFeatureButtons();
refreshForActiveTab();
