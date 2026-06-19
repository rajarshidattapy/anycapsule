**LM-Source**

Browser Extension

Product Requirements Document — v1.1

| Project | LM-Source |
| --- | --- |
| Type | Browser Extension (Chrome & Edge) |
| Stage | MVP In Progress |
| Target Users | Developers, Students, Business / Power Users |
| Supported Platforms | Claude.ai, ChatGPT |
| Author | Product Team |
| Date | June 2026 |
| Version | 1.1 — Added F-06 Context Handoff |

# 1\. Executive Summary

LM-Source is a browser extension for Chrome and Edge that enhances the LLM chat experience on Claude.ai and ChatGPT. It gives users granular control over their conversations — from extracting and pinning important messages to deleting noise, editing AI responses, and highlighting critical insights — turning raw LLM chats into structured, reusable knowledge assets.

Version 1.1 adds the Context Handoff feature (F-06): when a chat hits its token limit, LM-Source automatically extracts the full conversation context and packages it as a structured prompt, ready to continue seamlessly in a new chat — on the same platform or a different one.

# 2\. Problem Statement

Users of AI chat tools face a consistent set of pain points:

*   Conversations grow long and noisy, making it hard to find key insights later.
*   There is no native way to pin, bookmark, or tag important messages within a session.
*   Incorrect or outdated AI responses cannot be edited or removed.
*   There is no mechanism to visually highlight important segments of a response.
*   When a chat hits the token limit, all context is lost — users must manually reconstruct the entire conversation from scratch in a new chat.
*   There is no way to hand off a conversation from Claude to ChatGPT (or vice versa) without significant manual effort.

# 3\. Goals & Objectives

## 3.1 Primary Goals

*   Deliver a non-intrusive, lightweight extension that works seamlessly on Claude.ai and ChatGPT.
*   Enable users to extract, pin, delete, edit, and highlight chat messages with minimal friction.
*   Enable zero-loss context handoff when a chat hits its token limit, including cross-platform LLM transfer.
*   Ship a functional MVP targeting Chrome and Edge within the current development cycle.

## 3.2 Non-Goals (v1.0)

*   Native mobile app support.
*   Firefox or Safari browser support.
*   Cloud sync or cross-device persistence of annotations (deferred to v2.0).
*   Support for LLM platforms beyond Claude.ai and ChatGPT.

# 4\. Target Users

| Persona | Description | Primary Use Case |
| --- | --- | --- |
| Developer / Researcher | Technical users who use AI for code reviews, documentation, and research synthesis. | Extract and pin code snippets; delete irrelevant tangents; hand off long debugging sessions to a fresh chat. |
| Student / Learner | Students using AI for learning, essay drafting, and concept explanations. | Highlight key definitions; pin summary messages; seamlessly continue long study sessions past the token limit. |
| Business / Power User | Professionals using AI for drafting, analysis, and decision support. | Extract action items; hand off strategic discussions to another LLM; edit verbose responses for conciseness. |

# 5\. Feature Requirements

## 5.1 Feature Overview

| ID | Feature | Description | Priority | Status |
| --- | --- | --- | --- | --- |
| F-01 | Context Extraction | Automatically extract and display the structured context of the current chat. | P0 | In Progress |
| F-02 | Pin Messages | Allow users to pin any message to a persistent pinboard panel. | P0 | Planned |
| F-03 | Delete Messages | Soft-delete or hide non-required messages from the conversation view. | P0 | Planned |
| F-04 | Edit AI Responses | Allow inline editing of AI-generated messages, saved locally. | P1 | Planned |
| F-05 | Highlight Text | Enable colour-coded text highlighting within any message. | P1 | Planned |
| F-06 | Context Handoff | On token limit, extract full conversation context and hand it off to a new LLM chat with zero information loss. | P0 | NEW |

## 5.2 Detailed Feature Specifications

**F-01 — Context Extraction**

The extension analyses the current chat and generates a structured context snapshot including detected topics, key entities, and a brief summary. Accessible via a side panel triggered by the extension icon.

**F-02 — Pin Messages**

Users hover over any message and click a pin icon to save it to the Pinboard. Pins persist in chrome.storage.local with message text, timestamp, platform, and conversation ID. Users can unpin or reorder via drag-and-drop.

**F-03 — Delete Non-Required Messages**

A soft-delete mechanism hides messages in the DOM (view-layer only). A toggle shows or hides deleted messages. Bulk-delete mode allows selecting multiple messages at once.

**F-04 — Edit AI Responses**

Clicking the pencil icon converts a message into an editable text area. Changes are saved locally and tagged \[Edited\] with a timestamp. The original text is preserved and recoverable. Editing is view-layer only and does not alter the LLM session context.

**F-05 — Highlight Text**

Users select text within any message and choose a highlight colour (Yellow = default, Green = important, Red = incorrect). Highlights persist per session in local storage. A highlights summary panel lists all snippets grouped by colour.

**F-06 — Context Handoff (NEW)**

This feature enables zero-loss conversation continuity when a chat hits its token limit. It is the primary new feature in v1.1.

**Trigger**

*   Automatic: LM-Source detects the token limit warning/error message injected by Claude.ai or ChatGPT and surfaces the handoff UI proactively.
*   Manual: The user can trigger a handoff at any time via the extension panel, even before the limit is reached.

**Context extraction scope**

The handoff prompt captures the complete conversation context so the new chat can continue from exactly the same point:

*   Full conversation summary — a structured, condensed retelling of the entire chat arc, written in a format that a fresh LLM instance can parse and act on.
*   Key decisions and conclusions — any explicit decisions made, outcomes agreed upon, or hypotheses confirmed/rejected.
*   Code snippets and technical content — full code blocks extracted verbatim and labelled with language and context.
*   Action items and next steps — the last outstanding tasks, questions, or requests that were in progress when the limit was hit.
*   Conversation metadata — original platform (Claude / ChatGPT), estimated message count, and timestamp of handoff.

**Handoff prompt format**

The extracted context is packaged as a structured, LLM-readable handoff prompt using a consistent template:

*   A system-level preamble instructing the new LLM to treat this as a continuation.
*   Clearly labelled sections: \[CONTEXT SUMMARY\], \[KEY DECISIONS\], \[CODE\], \[NEXT STEPS\].
*   A final line: "Please confirm you have received this context and are ready to continue from this point."

**Delivery options**

The user can choose how to deliver the handoff prompt — all three options are available via the extension popup:

*   Auto open new tab: LM-Source opens a new Claude.ai or ChatGPT tab and injects the handoff prompt directly into the chat input field, ready to send.
*   Copy to clipboard: The formatted prompt is copied to the clipboard so the user can paste it into any LLM interface (including third-party or local models).
*   Save to pinboard: The prompt is saved to the LM-Source pinboard for retrieval later.

**Cross-platform handoff**

The handoff feature explicitly supports cross-platform transfer. A conversation started on Claude.ai can be handed off to ChatGPT, and vice versa. The prompt format is platform-agnostic and model-agnostic.

**Important constraints**

*   The handoff is a view-layer operation. LM-Source reads the rendered DOM to extract messages — it does not access any internal API or session token.
*   The handoff prompt does not include the raw message-by-message transcript. It is a synthesised, compressed representation to stay within the new chat's context budget.
*   For very long conversations, a progressive summarisation strategy is applied: recent messages are kept verbatim; older messages are progressively compressed.

# 6\. Technical Requirements

## 6.1 Platform & Browser

*   Manifest Version: MV3.
*   Target Browsers: Google Chrome (v120+), Microsoft Edge (v120+).
*   Target Platforms: Claude.ai, ChatGPT.
*   No backend server required for MVP; all data stored client-side.

## 6.2 Storage

*   chrome.storage.local for pins, highlights, edits, deleted message state, and saved handoff prompts.
*   Data namespaced by platform and conversation ID.
*   Storage budget: target < 2 MB per user for MVP.

## 6.3 Token Limit Detection

*   Claude.ai: Monitor DOM for the token limit warning banner (MutationObserver on known CSS classes).
*   ChatGPT: Monitor for the context-length error message pattern in the chat feed.
*   Fallback: User can trigger handoff manually at any time via the extension popup.

## 6.4 DOM Injection Strategy

*   Content script injected on matching URLs (claude.ai/\*, chat.openai.com/\*).
*   DOM selectors abstracted behind a platform adapter layer to survive UI updates.
*   MutationObserver used to detect dynamically rendered messages (streaming responses).

## 6.5 Permissions Required

*   activeTab — to interact with the current tab.
*   storage — for chrome.storage.local.
*   scripting — to inject content scripts.
*   clipboardWrite — to support the copy-to-clipboard handoff option.
*   host\_permissions — limited to claude.ai and chat.openai.com.

# 7\. User Experience

## 7.1 UI Entry Points

*   Extension Popup: accessible via the toolbar icon; shows pinboard, highlights summary, context extraction, and handoff trigger.
*   In-Chat Toolbar: appears on message hover — Pin, Delete, Edit, Highlight.
*   Handoff Banner: appears automatically when token limit is detected, with three delivery option buttons.

## 7.2 Handoff UX Flow

*   Token limit detected → LM-Source shows a non-intrusive banner at the top of the chat: "Chat limit reached. Extract context and continue?"
*   User sees three buttons: Open New Tab, Copy to Clipboard, Save to Pinboard.
*   On Open New Tab: user is asked to choose the target platform (Claude or ChatGPT).
*   The new tab opens and the handoff prompt is auto-injected, awaiting the user to press Send.

## 7.3 Design Principles

*   Non-intrusive: the extension never obscures the core chat interface.
*   Zero friction: the handoff should require at most 2 clicks from detection to new chat ready.
*   Transparent: the user can preview the handoff prompt before sending.
*   Performance: < 50ms overhead on page load, < 5ms on message rendering.

# 8\. Milestones & Roadmap

| Phase | Milestone | Deliverables |
| --- | --- | --- |
| Phase 1 | Foundation | MV3 scaffold, content script injection, platform adapter for Claude.ai & ChatGPT, local storage setup. | Week 1-2 |
| Phase 2 | Core Features | Pin (F-02), Delete (F-03), Context Extraction (F-01). Internal alpha. | Week 3-4 |
| Phase 3 | Enhanced Features | Edit (F-04), Highlight (F-05), popup UI, Edge compatibility. | Week 5-6 |
| Phase 4 | Context Handoff | Token limit detection, context extraction engine, handoff prompt builder, all 3 delivery options (F-06). | Week 7-8 |
| Phase 5 | MVP Launch | Beta testing, bug fixes, Chrome Web Store & Edge Add-ons submission. | Week 9-10 |

# 9\. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Claude.ai or ChatGPT DOM changes break content scripts | High — all features depend on stable DOM selectors | Abstract selectors behind a platform adapter; monitor DOM changes in CI. |
| Token limit detection fails if platform changes error message format | High — F-06 auto-trigger won't fire | Support manual handoff trigger as primary path; auto-detect as enhancement. |
| Handoff prompt exceeds new chat's context budget for very long sessions | Medium — handoff may be incomplete | Implement progressive summarisation; warn user if compression ratio is high. |
| MV3 API limitations block required functionality | Medium — MV3 restricts background tasks | Design all features within MV3 constraints from day one. |
| Chrome Web Store review rejection | Medium — delays launch | Minimum permissions; prepare detailed privacy policy pre-submission. |
| User data privacy concerns | High — extension reads chat content | All processing is local; no data leaves the browser. Clear privacy policy. |

# 10\. Future Scope (v2.0+)

*   Cross-device sync via encrypted cloud storage.
*   Export to Notion, Obsidian, Google Docs, and Markdown formats.
*   Firefox and Safari support.
*   AI-powered smart summarisation for the context extraction engine.
*   Multi-turn handoff history: track all past handoffs and allow resuming any prior context.
*   Support for additional LLM platforms (Gemini, Perplexity, Copilot, local models via Ollama).
*   Collaborative annotation: share highlights and pins with team members.

# 11\. Success Metrics

## 11.1 MVP Launch (Target: 60 days post-launch)

*   500+ installs on Chrome Web Store.
*   4.0+ average user rating.
*   < 2% uninstall rate within first 7 days.
*   All 6 core features (F-01 to F-06) functional on both Claude.ai and ChatGPT.

## 11.2 Engagement Metrics

*   Handoff feature used in > 20% of sessions where the token limit is approached.
*   Pin feature used in > 40% of sessions.
*   Highlight feature used in > 30% of sessions.
*   < 5% of handoff prompts result in the user manually editing the prompt before sending (signal of extraction quality).

# 12\. Appendix

## 12.1 Priority Definitions

*   P0 — Must Have: Core to MVP. Blocking launch if absent.
*   P1 — Should Have: High value; included in MVP if feasible.
*   P2 — Nice to Have: Deferred to v1.1 or v2.0.

## 12.2 Handoff Prompt Template

The following is the standard template for F-06 handoff prompts:

_You are continuing an ongoing conversation. The previous session reached its context limit. Below is a structured summary of everything discussed. Treat this as full context and pick up exactly where we left off._

\[CONTEXT SUMMARY\] ...

\[KEY DECISIONS\] ...

\[CODE\] ...

\[NEXT STEPS\] ...

_Please confirm you have received this context and are ready to continue from this point._

## 12.3 Glossary

*   MV3: Chrome Extensions Manifest Version 3.
*   DOM: Document Object Model — the in-browser representation of a web page.
*   Content Script: JavaScript injected into a web page by a browser extension.
*   Token Limit: The maximum context window size of an LLM chat session.
*   Context Handoff: The LM-Source feature that packages a conversation's context for transfer to a new chat.
*   Pinboard: The LM-Source panel that collects pinned messages and saved handoff prompts.
*   Progressive Summarisation: A strategy that compresses older messages more aggressively than recent ones to stay within the new chat's context budget.

_End of Document — LM-Source PRD v1.1 — Confidential_