/**
 * Legal workflow prompts.
 *
 * Same shape as `buildInPrompt` in `constant.ts` — `system(language)` and
 * `user(text, language)` — so the existing quick-action pipeline can run them
 * unchanged. Kept in a separate module because these are domain prompts, not
 * general writing helpers, and they are the part most likely to be edited.
 */

export type LegalActionId = 'review' | 'check' | 'obligations' | 'dd' | 'research' | 'translate'

export interface LegalPrompt {
  system: (language: string) => string
  user: (text: string, language: string) => string
}

const baseSystem = (language: string) =>
  `You are a senior commercial lawyer acting as a review and drafting assistant inside Microsoft Word.
Be precise and concrete. Never invent clauses, parties, dates or citations that are not supported by the supplied text.
If something is absent, write "not found" rather than guessing.

OUTPUT CONTRACT — follow it exactly:
1. Start with the first required heading. No preamble, no "Here is", no restating the request, no closing summary.
2. Use only "## " for main sections and "### " for sub-sections. Never skip or rename a required section.
3. Tables: Markdown pipe tables with exactly one header row; maximum 4 columns; every cell under 22 words;
   no line breaks inside a cell; no nested lists inside cells.
4. Bullets: one sentence each, maximum 20 words, no sub-bullets.
5. Never wrap the whole reply in a code fence. Never repeat the input document.
6. Refer to clause numbers ("Clause 3") instead of long quotations; quote at most 12 words at a time.

Answer in ${language}.`

const documentBlock = (text: string) =>
  `--- DOCUMENT TEXT START ---
${text}
--- DOCUMENT TEXT END ---`

export const legalPrompts: Record<LegalActionId, LegalPrompt> = {
  review: {
    system: language => baseSystem(language),
    user: (text, language) => `Review the contract below and report in ${language}.

Structure the answer exactly as:

## Summary
Three bullets, 25 words max each.

## Risk table
| Clause / location | Issue | Severity | Suggested wording |
Severity must be High, Medium or Low. Quote the document wording in the first column where possible.

## Missing or weak terms
What is normally expected in this type of document but absent or inadequate here.

## Before signing
Numbered practical checks.

${documentBlock(text)}`,
  },

  check: {
    system: language => baseSystem(language),
    user: (text, language) => `Audit the document below for drafting defects and report in ${language}.

Group findings under:

## Structure and completeness
## Internal consistency
(defined terms, cross-references, numbering, party names)
## Dates, amounts and blanks
## Ambiguity and enforceability flags

For every item: location → problem → fix, plus a severity tag. Quote the text.

${documentBlock(text)}`,
  },

  obligations: {
    system: language => baseSystem(language),
    user: (text, language) => `Extract every obligation from the document below and report in ${language}.

## Obligations
| Party | Obligation | Deadline / trigger | Clause |
Every row must be traceable to the text. If a deadline is not stated, write "not stated".

## Money and dates
Bullets: amounts, currencies, payment terms, milestones, notice periods.

## Dependencies
Which obligations are conditional on the other party's performance.

${documentBlock(text)}`,
  },

  dd: {
    system: language => baseSystem(language),
    user: (text, language) => `Write a due-diligence memo based only on the document below, in ${language}.

## Scope and limits
What this review covers, and what it cannot cover because only this document was supplied.

## Parties and relationship
## Obligations and deliverables
## Red flags
| Finding | Why it matters | Severity | Follow-up |

## Information requests
Numbered list of documents or clarifications to request next.

${documentBlock(text)}`,
  },

  research: {
    system: language => baseSystem(language),
    user: (text, language) => `Act as a legal research assistant. Using the text below, answer in ${language}.

## Legal issues identified
## Principles that generally apply
State which jurisdiction each statement is about.

## Authorities you are confident about
Statute name + section, or case name + year + court. If you are not certain a citation is real, write "verify" instead of inventing it.

## Jurisdiction-specific questions
## Next steps

${documentBlock(text)}`,
  },

  translate: {
    system: language =>
      `You are a bilingual legal translator working inside Microsoft Word. Keep the structure, numbering and defined terms intact. Write the translation notes in ${language}.`,
    user: (text, language) => `Translate the document below into English.
Start with the first line of the translation itself — never with "Here is", "Sure" or a description of the task.

- Preserve headings, numbering and structure exactly.
- Formal, plain professional English.
- On first use of a defined term, keep the original in brackets.
- Translate everything; do not summarise, merge or omit clauses.
- After the translation add "## Translation notes" (in ${language}) listing terms where the rendering is uncertain.

${documentBlock(text)}`,
  },
}

export const legalActionIds = Object.keys(legalPrompts) as LegalActionId[]

/** Registers that should be used when rewriting a selection. */
export const rewriteTones = {
  formal: 'a formal legal register: precise, unambiguous, no colloquialisms',
  concise: 'concise: cut padding, target roughly 30% fewer words while keeping every obligation',
  plain: 'plain English: short sentences, active voice, no legalese where a plain word will do',
  persuasive: 'persuasive but strictly factual: conclusion first, then the supporting facts',
  client: 'client-friendly: explain technical terms in plain words, warm but professional',
} as const

export type RewriteTone = keyof typeof rewriteTones

export function rewritePrompt(text: string, tone: RewriteTone, language: string): string {
  return `Rewrite the text below in ${rewriteTones[tone]}, in ${language}.

Rules:
- Keep every fact, number, defined term, party name and obligation. Change style, not substance.
- Do not add clauses, caveats or commentary.
- Return only the rewritten text — no preamble.

${documentBlock(text)}`
}
