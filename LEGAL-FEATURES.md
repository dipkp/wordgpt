# Legal features — additions to Word GPT Plus

This fork adds the legal workflow from our own add-in to upstream **word-gpt-plus v2.0.2**.
It is a code change, not a patch file: the upstream app now ships these features directly.

MIT © 2023-present KuingSmile applies to the upstream code; the files listed as *new* below are
ours and carry no third-party obligations.

---

## What was added

### 1. Legal action bar (UI)

A row of six buttons under the existing quick actions, plus one redaction button:

| Button | Prompt | Output |
|---|---|---|
| Review contract | risk review | Summary · Risk table · Missing terms · Before signing |
| Document check | drafting audit | Structure · consistency · dates/amounts · ambiguity |
| Obligations | obligation extraction | table with party, obligation, deadline, clause |
| DD memo | due diligence | scope · parties · red flags · information requests |
| Legal research | research framing | issues · principles · authorities (`verify` when unsure) |
| To English | translation | full translation + translation notes |
| Redact PII | **no model call** | replaces matches with `[EMAIL-1]`-style placeholders |

Each button runs on the current selection and uses the existing streaming chat pipeline, so replies
still stream into the transcript and can be inserted/replaced with the existing controls.

### 3. Interface rework (English, AutoClaw-style)

- Empty state is a capability list: a centred title and a **two-column chip grid** (Review contract ·
  Document check · Obligations · DD memo · Legal research · To English, with Redact PII spanning the
  full row), plus the generic actions as small pills. Seven chips occupy four short rows instead of
  filling the pane.
- **The chat bubble is short.** The action label ("Review contract") is the human turn; the prompt and
  the selected document travel in the system message. Previously the entire prompt — headings and
  table rules included — was echoed into the transcript.
- **Strict output contract** in every legal system prompt: start at the first heading, no preamble,
  `##`/`###` only, one header row per table, max 4 columns, cells under 22 words, bullets under 20
  words, no code fences, quote at most 12 words, use clause numbers.
- Once a conversation starts the same actions collapse into a horizontal pill row above the
  composer, so the transcript keeps the space.
- **Risk tables render as labelled cards on narrow panes.** A 640px-wide table in a 326px Word
  task pane used to show one column and a scrollbar; below 560px each row becomes a card with
  the column name above every value (`CLAUSE / LOCATION`, `ISSUE`, `SEVERITY`, `SUGGESTED WORDING`).
- Severity cells are colour-coded: High red, Medium amber, Low green.
- Composer is a single rounded surface with mode toggle, provider, model and send in one card;
  the two behaviour checkboxes sit inline under it at 10.5px instead of wrapping into their own row.

Implementation: `src/utils/markdown.ts` adds `data-label` to every body cell and a `sev-*` class
for severity words; `src/index.css` carries the pane shell, chips, composer and the ≤560px card
layout.

**Direction C (conversation-first) implemented — matched to prototypes/C-chat.png.** 44px header,
2-column tiles with the icon above the label (12px radius, 53px tall), 7th tile full width, 12px
message cards, 14px card composer with a 30px circular send button. Measured live: header 44,
tile 53, tile radius 12, composer 80, composer radius 14, chevrons hidden.

**Stylesheet rebuilt from scratch.** src/index.css had accumulated six appended layers (pane
shell, density pass, compact pass, Fluent layer, pill, chip-scroll) — every selector redefined up to
six times. The pane presentation is now a single 450-line block with one definition per selector and
its own --p-* token set, cut from 1262 to 990 lines. Measured after the rewrite: header 36px,
chip 32px, chip grid 140px, 2 columns at 326px / 4 columns above 720px.

**Design system: Fluent 2.** The pane lives inside Word, so it follows Microsoft's own system
rather than a generic Tailwind look — Segoe UI Variable, 4px corner radius, 4px spacing grid,
neutral surfaces (`#faf9f8` / `#ffffff`), one brand accent (`#0F6CBD`). Measured after the rework:
36px header bar, 32px capability rows, 140px chip grid, **56px composer**, 11.5px chip label.

**Composer rebuilt from scratch** (was three stacked rows of separate boxes, 85px):

```
 row 1   [ text you want to write …                            ] [send]
 row 2   [chat|bot]  OpenAI ▾  deepseek-v4-flash ▾        [WF] [Sel]
```

Mode is a 20px segmented control, provider and model are borderless text selects, and the two
behaviour toggles became 11px icon switches with tooltips — three rows collapsed into two, 85px
to 56px, with the input row holding focus.

**Selection pill.** While "Include selected text" is on, the Word selection is surfaced as an
attachment strip above the composer — quote icon, the selected text truncated to one line, the
character count and an `×` to drop it for this message. It refreshes every 2.5s and on send, so
switching documents or selections is reflected without re-opening the pane.

**Chat / Apply toggle.** A two-button segment in the composer picks what happens to a legal
answer: `Chat` only shows it in the transcript, `Apply` also writes it into the document at the
selection (via the existing insert path, so Word formatting still applies). Stored in
`localStorage.outputMode`, default `chat`.

**Chip row scrolls.** The capability pills above the transcript now scroll horizontally with a
4px visible scrollbar instead of clipping at the pane edge.

**Translation prompts hardened.** Both the generic Translate action and the legal translate
prompt now state: start with the first line of the translation, never open with "Here is"/"Sure"/
"Below is", and keep numbering and line breaks identical to the source.

### 4. Five new Word tools (agent mode)

Registered in `wordTools.ts`, so they appear automatically in Settings → Tools:

| Tool | Purpose | Requires |
|---|---|---|
| `insertComment` | attach a Word comment to the selection | WordApi 1.4 |
| `setTrackChanges` | toggle revision tracking (TrackAll / Off) | WordApi 1.5 |
| `setHeaderFooter` | write primary header/footer on section 1 | WordApi 1.1 |
| `setParagraphFormat` | alignment, line spacing, space after (selection or document) | WordApi 1.1 |
| `redactDocument` | deterministic PII replacement, no model call | WordApi 1.1 |

`redactDocument` reuses the same regex engine as the button, caps at 40 distinct values, and reports
how many occurrences were replaced.

### 3. Rendered answers (Markdown + tables)

Assistant replies used to be printed as raw text, so `##` headings and `| … |` table rows showed up
literally. They are now rendered:

- `markdown-it` with `html: false` (a prompt-injected tag cannot execute in the pane), `linkify`,
  `breaks`.
- Tables get a bordered, zebra-striped wrapper with a readable floor width and horizontal scroll —
  Word's default task pane is only ~330 px wide, so a four-column risk table scrolls instead of
  squeezing letters onto separate lines.
- Headings, lists (Tailwind's preflight had stripped the markers), inline code and block quotes are
  styled with the app's own theme tokens.

### 4. Tool labels in Settings

Settings renders each tool through `wordTool_<name>` i18n keys; without them the five new tools
showed raw key strings. 20 keys were added (EN + ZH).

---

## Files

**New**

```
src/utils/legalPrompts.ts     legal action prompts + rewrite tones
src/utils/redaction.ts        PII scan / tagging / in-memory redaction
src/utils/markdown.ts         markdown-it setup for assistant answers
scripts/check-legal.mts       7 checks for the two legal modules
serve-https.mjs               serves dist/ over https + proxies /v1 to the local router
INSTALL.md                    full install path, both HTTPS and dev server
release/local-https/manifest.xml   manifest pointing at the HTTPS server
LEGAL-FEATURES.md             this file
```

**Modified**

```
src/utils/wordTools.ts        +5 tool definitions, +5 union members, +1 import
src/pages/HomePage.vue        +legal action row, +handlers, +icons, markdown rendering
src/index.css                 styling for rendered answers and tables
package.json                  +"test:legal" script, +markdown-it
src/i18n/locales/en.json      +11 action keys, +10 tool keys
src/i18n/locales/zh-cn.json   +11 action keys, +10 tool keys
src/utils/markdown.ts         +data-label decoration, +severity classes
src/index.css                 +pane shell, chips, composer, card tables
package.json                  +"test:legal" script
release/local-https/manifest.xml   new manifest for the HTTPS server
release/self-hosted/manifest.xml   fixed: real AppDomains, added <Requirements>
release/instant-use/manifest.xml   same fixes
```

> Two manifest defects were found by testing in a real Word install: the shipped manifests
> contained template placeholders (`AppDomain1/2/3`) and no `<Requirements>` block. Word
> registers the add-in but renders **no ribbon group** until both are fixed.

Line endings are preserved (CRLF) so the diff stays reviewable.

---

## Run it

Full instructions (certificate, build, sideload, troubleshooting) are in **`INSTALL.md`**. Short
version — the HTTPS path, which is what is running on this machine:

```powershell
cd upstream\word-gpt-plus
pnpm install --config.engine-strict=false --ignore-scripts
pnpm build
node serve-https.mjs                 # https://localhost:3443
npx office-addin-dev-settings sideload release\local-https\manifest.xml
```

For hot reload during development use `pnpm dev` (serves `http://localhost:3000`) and
`release/self-hosted/manifest.xml` — but Word may refuse a plain `http://` add-in URL.

> The repo pins Node **24.21.0** exactly. On 24.20.0 the `preinstall` toolchain check fails, hence
> the two install flags. Everything else (typecheck, build, tests) runs unchanged.

Then sideload a manifest:

- **Local dev** — `release/self-hosted/manifest.xml` points at `http://localhost:3000`. Run
  `pnpm serve` (vite preview serves on 3000 by default) or edit the port to match.
- **Hosted** — `release/instant-use/manifest.xml` points at `https://word.msq.pub`, i.e. *their*
  deployment. It will not contain these changes; use it only to compare behaviour.

---

## Verification performed

| Check | Result |
|---|---|
| `pnpm typecheck` (vue-tsc) | clean |
| `pnpm build` (vite) | success, 14 s cold / 8 s warm |
| `eslint` on all changed source files | clean, `--max-warnings 0` |
| `node scripts/check-legal.mts` | 7/7 checks pass |
| Dev server (`pnpm dev`) | serves on `http://localhost:3000` |
| Headless render | legal bar present in DOM with the Scale icon and all six labels |
| Click test (CDP) | button click runs the handler, shows "No API key provided" and throws no JS error |
| Settings → Tools | all five new tools listed with translated labels, no raw i18n keys |

The redaction checks cover the regression that bit us earlier: an 18-digit national ID must be
reported as `ID`, not as a card number, and matches must never overlap.

**Not verified:** behaviour inside a live Word/WPS host. The five new tools call Office.js APIs
that type-check against `@types/office-js`, but `insertComment` and `setTrackChanges` need
WordApi 1.4/1.5 at runtime. On older builds the tool wrapper returns the host error string
instead of throwing — check the chat transcript if a call silently does nothing.

Note on the click test: outside a Word host the handler stops at the API-key guard, because
`Word.run` is unavailable. That is the furthest this can be driven without the real host.

---

## Staying in sync with upstream

```powershell
git remote -v                        # origin = our clone
git fetch origin --depth 1
git log --oneline -1 origin/main
```

Keep the legal additions isolated to the files above; when upstream changes `HomePage.vue` or
`wordTools.ts`, resolve by re-applying the marked blocks rather than rewriting the files.
