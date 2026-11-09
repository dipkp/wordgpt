/**
 * Focused checks for the merged legal modules.
 * Run with: node scripts/check-legal.mts   (Node 24 strips the types)
 */

import assert from 'node:assert/strict'

import { legalActionIds, legalPrompts, rewritePrompt, rewriteTones } from '../src/utils/legalPrompts.ts'
import { redactText, scanPII, tagFindings } from '../src/utils/redaction.ts'

let failures = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ok    ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL  ${name}\n        ${(error as Error).message}`)
  }
}

const sample =
  'Contact john.doe@example.com or +1 (555) 123-4567. Card 4111 1111 1111 1111. ID 110105197001011234.'

console.log('\nRedaction')

check('finds email, phone, card and national ID', () => {
  const types = scanPII(sample).map(finding => finding.type)
  for (const type of ['EMAIL', 'PHONE', 'CARD', 'ID']) {
    assert.ok(types.includes(type as never), `${type} missing: ${types.join(',')}`)
  }
})

check('national ID is not also reported as a card', () => {
  const findings = scanPII(sample)
  const id = findings.find(finding => finding.type === 'ID')
  assert.ok(id, 'ID not found')
  const overlapping = findings.filter(
    other => other !== id && id && other.start < id.end && other.end > id.start,
  )
  assert.equal(overlapping.length, 0, `overlap: ${JSON.stringify(overlapping)}`)
})

check('ignores ordinary prose', () => {
  assert.equal(scanPII('The parties agree to the terms set out above.').length, 0)
})

check('tags each distinct value once', () => {
  const tagged = tagFindings(scanPII('a@b.com and a@b.com and c@d.com'))
  assert.equal(tagged.length, 2, JSON.stringify(tagged))
  assert.equal(tagged[0]?.tag, '[EMAIL-1]')
  assert.equal(tagged[1]?.tag, '[EMAIL-2]')
})

check('redactText replaces values and reports the count', () => {
  const { text, count } = redactText(sample)
  assert.ok(count >= 4, `count ${count}`)
  assert.ok(!text.includes('john.doe@example.com'), text)
  assert.ok(text.includes('[EMAIL-1]'), text)
})

console.log('\nLegal prompts')

check('every action builds a system and user message', () => {
  assert.ok(legalActionIds.length >= 6, legalActionIds.join(','))
  for (const id of legalActionIds) {
    const prompt = legalPrompts[id]
    const system = prompt.system('English')
    const user = prompt.user('CONTRACT TEXT', 'English')
    assert.ok(system.length > 40, `system too short for ${id}`)
    assert.ok(user.includes('CONTRACT TEXT'), `user prompt drops the document for ${id}`)
    assert.ok(user.length > 120, `user prompt too short for ${id}`)
  }
})

check('rewrite tones all produce distinct prompts', () => {
  const prompts = Object.keys(rewriteTones).map(tone =>
    rewritePrompt('TEXT', tone as keyof typeof rewriteTones, 'English'),
  )
  assert.equal(new Set(prompts).size, prompts.length)
  assert.ok(prompts.every(prompt => prompt.includes('TEXT')))
})

console.log(`\n${failures === 0 ? 'Legal checks passed.' : `${failures} check(s) failed.`}\n`)
process.exit(failures === 0 ? 0 : 1)
