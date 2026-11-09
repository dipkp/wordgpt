<template>
  <CheckPointsPage
    v-if="showCheckpoints"
    :thread-id="threadId"
    :saver="saver"
    :current-checkpoint-id="currentCheckpointId"
    @close="showCheckpoints = false"
    @restore="handleRestore"
    @select-thread="handleSelectThread"
  />
  <div
    v-show="!showCheckpoints"
    class="pane-shell"
  >
    <div class="relative flex h-full w-full flex-col gap-1 rounded-md">
      <!-- Header -->
      <div class="pane-head">
        <div class="pane-brand">
          <span class="pane-mark"><Sparkles :size="14" /></span>
          <span>LexDesk</span>
        </div>
        <div class="pane-actions">
          <CustomButton
            :title="t('newChat')"
            :icon="Plus"
            text=""
            type="secondary"
            class="border-none p-1!"
            :icon-size="18"
            @click="startNewChat"
          />
          <CustomButton
            :title="t('settings')"
            :icon="Settings"
            text=""
            type="secondary"
            class="border-none p-1!"
            :icon-size="18"
            @click="settings"
          />
          <CustomButton
            :title="t('checkPoints')"
            :icon="History"
            text=""
            type="secondary"
            class="border-none p-1!"
            :icon-size="18"
            @click="checkPoints"
          />
        </div>
      </div>

      <!-- Capability pills (only once a conversation is running) -->
      <div v-if="history.length > 0" class="chip-row">
        <button
          v-for="action in legalActions"
          :key="action.id"
          class="chip chip-sm"
          :disabled="loading"
          @click="applyLegalAction(action.id)"
        >
          <component :is="action.icon" :size="12" />
          {{ action.label }}
        </button>
        <button class="chip chip-sm chip-warn" :disabled="loading" @click="runRedaction">
          <Eraser :size="12" />
          {{ t('legalRedact') }}
        </button>
      </div>

      <!-- Chat Messages Container -->
      <div
        ref="messagesContainer"
        class="pane-messages"
      >
        <div v-if="history.length === 0" class="empty-hero">
          <div class="empty-mark"><Sparkles :size="16" /></div>
          <p class="empty-title">{{ $t('emptyTitle') }}</p>
          <p class="empty-sub">{{ $t('emptySubtitle') }}</p>

          <p class="empty-title">{{ t('legalStartTitle') }}</p>

          <div class="chip-list">
            <button
              v-for="action in legalActions"
              :key="action.id"
              class="chip"
              :disabled="loading"
              @click="applyLegalAction(action.id)"
            >
              <component :is="action.icon" :size="12" />
              <span>{{ action.label }}</span>
              <span class="chev">›</span>
            </button>
            <button class="chip chip-warn" :disabled="loading" @click="runRedaction">
              <Eraser :size="12" />
              <span>{{ t('legalRedact') }}</span>
              <span class="chev">›</span>
            </button>
          </div>

          <div class="chip-row chip-row-wrap">
            <button
              v-for="action in quickActions"
              :key="action.key"
              class="chip chip-xs"
              :disabled="loading"
              @click="applyQuickAction(action.key)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>

        <div
          v-for="(msg, index) in displayHistory"
          :key="msg.id || index"
          class="group flex items-end gap-4 [.user]:flex-row-reverse"
          :class="msg instanceof AIMessage ? 'assistant' : 'user'"
        >
          <div
            class="flex min-w-0 flex-1 flex-col gap-1 group-[.assistant]:items-start group-[.assistant]:text-left group-[.user]:items-end group-[.user]:text-left"
          >
            <div
              class="group max-w-[95%] rounded-md border border-border-secondary p-2 text-sm leading-[1.4] wrap-break-word text-main/90 shadow-sm group-[.assistant]:bg-bg-tertiary group-[.assistant]:text-left group-[.user]:bg-accent/10 group-[.user]:whitespace-pre-wrap"
            >
              <template v-for="(segment, idx) in renderSegments(msg)" :key="idx">
                <!-- eslint-disable-next-line vue/no-v-html -- markdown-it runs with html:false -->
                <div
                  v-if="segment.type === 'text' && msg instanceof AIMessage"
                  class="md-body"
                  v-html="renderMarkdown(segment.text.trim())"
                ></div>
                <div v-else-if="segment.type === 'text'" class="wa-msg">
                  <div
                    v-if="splitSelection(segment.text).quote"
                    class="wa-quote"
                    :class="{ open: isQuoteOpen(index) }"
                  >
                    <div class="wa-quote-text">{{ splitSelection(segment.text).quote }}</div>
                    <button class="wa-readmore" @click="toggleQuote(index)">
                      {{ isQuoteOpen(index) ? 'Show less' : 'Read more' }}
                    </button>
                  </div>
                  <div class="wa-body">{{ splitSelection(segment.text).body }}</div>
                </div>
                <details v-else class="mb-1 rounded-sm border border-border-secondary bg-bg-secondary">
                  <summary class="cursor-pointer list-none p-1 text-sm font-semibold text-secondary">
                    Thought process
                  </summary>
                  <pre class="m-0 p-1 text-xs wrap-break-word whitespace-pre-wrap text-secondary">{{
                    segment.text.trim()
                  }}</pre>
                </details>
              </template>
            </div>
            <div v-if="msg instanceof AIMessage" class="flex gap-1">
              <CustomButton
                :title="t('replaceSelectedText')"
                text=""
                :icon="FileText"
                type="secondary"
                class="bg-surface! p-1.5! text-secondary!"
                :icon-size="12"
                @click="insertToDocument(cleanMessageText(msg), 'replace')"
              />
              <CustomButton
                :title="t('appendToSelection')"
                text=""
                :icon="Plus"
                type="secondary"
                class="bg-surface! p-1.5! text-secondary!"
                :icon-size="12"
                @click="insertToDocument(cleanMessageText(msg), 'append')"
              />
              <CustomButton
                :title="t('copyToClipboard')"
                text=""
                :icon="Copy"
                type="secondary"
                class="bg-surface! p-1.5! text-secondary!"
                :icon-size="12"
                @click="copyToClipboard(cleanMessageText(msg))"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="composer">
        <div v-if="selectionPreview" class="context-pill">
          <Quote :size="11" />
          <span class="context-text">{{ selectionPreview }}</span>
          <span class="context-count">{{ selectionPreview.length }} chars</span>
          <button class="context-x" title="Remove" @click="dismissSelection">×</button>
        </div>
        <div class="composer-input">
          <textarea
            ref="inputTextarea"
            v-model="userInput"
            class="composer-textarea"
            :placeholder="mode === 'ask' ? $t('askAnything') : $t('directTheAgent')"
            rows="1"
            @keydown.enter.exact.prevent="sendMessage"
            @input="adjustTextareaHeight"
          />
          <button v-if="loading" class="composer-send stop" title="Stop" @click="stopGeneration">
            <Square :size="11" />
          </button>
          <button
            v-else
            class="composer-send"
            title="Send"
            :disabled="!userInput.trim()"
            @click="sendMessage"
          >
            <Send :size="12" />
          </button>
        </div>

        <div class="composer-meta">
          <div class="seg">
            <button :class="{ on: mode === 'ask' }" title="Ask Mode" @click="mode = 'ask'">
              <MessageSquare :size="11" />
            </button>
            <button :class="{ on: mode === 'agent' }" title="Agent Mode" @click="mode = 'agent'">
              <BotMessageSquare :size="11" />
            </button>
          </div>

          <select v-model="settingForm.api" class="meta-select" title="Provider">
            <option v-for="item in settingPreset.api.optionObj" :key="item.value" :value="item.value">
              {{ item.label.replace('official', 'OpenAI') }}
            </option>
          </select>

          <select
            v-if="currentModelOptions && currentModelOptions.length > 0"
            v-model="currentModelSelect"
            class="meta-select model"
            title="Model"
          >
            <option v-for="item in currentModelOptions" :key="item" :value="item">{{ item }}</option>
          </select>

          <span class="meta-spacer"></span>

          <div class="seg seg-mode" :title="$t('outputModeHint')">
            <button :class="{ on: outputMode === 'chat' }" @click="outputMode = 'chat'">
              <MessageSquare :size="10" />
            </button>
            <button :class="{ on: outputMode === 'apply' }" @click="outputMode = 'apply'">
              <FileCheck :size="10" />
            </button>
          </div>

          <label class="meta-toggle" :title="$t('useWordFormattingLabel')">
            <input v-model="useWordFormatting" type="checkbox" />
            <FileText :size="11" />
          </label>
          <label class="meta-toggle" :title="$t('includeSelectionLabel')">
            <input v-model="useSelectedText" type="checkbox" />
            <FileCheck :size="11" />
          </label>
        </div>
      </div>

    </div>
  </div>
</template>

<script lang="ts" setup>
import type { Message } from '@langchain/core/messages'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  BookOpen,
  BotMessageSquare,
  CheckCircle,
  ClipboardList,
  Copy,
  Eraser,
  FileCheck,
  FileSearch,
  FileText,
  Globe,
  History,
  Languages,
  ListChecks,
  MessageSquare,
  Plus,
  Quote,
  Scale,
  Send,
  Settings,
  Sparkle,
  Sparkles,
  Square,
} from '@lucide/vue'
import { useStorage } from '@vueuse/core'
import { v4 as uuidv4 } from 'uuid'
import type { Component } from 'vue'
import { computed, nextTick, onBeforeMount, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { type CheckpointTuple, IndexedDBSaver } from '@/api/checkpoints'
import { insertFormattedResult, insertResult } from '@/api/common'
import type { ProviderConfig } from '@/api/types'
import { getAgentResponse, getChatResponse } from '@/api/union'
import CustomButton from '@/components/CustomButton.vue'
import CheckPointsPage from '@/pages/checkPointsPage.vue'
import { getActiveTools } from '@/utils/activeTools'
import { messageContentToText, restoreChatMessages } from '@/utils/chatMessages'
import { checkAuth } from '@/utils/common'
import type { buildInPrompt } from '@/utils/constant'
import { getBuiltInPrompt } from '@/utils/constant'
import { logDiagnostic } from '@/utils/diagnostics'
import { localStorageKey } from '@/utils/enum'
import type { LegalActionId } from '@/utils/legalPrompts'
import { legalPrompts } from '@/utils/legalPrompts'
import { renderMarkdown } from '@/utils/markdown'
import { message as messageUtil } from '@/utils/message'
import { scanPII, tagFindings } from '@/utils/redaction'
import useSettingForm from '@/utils/settingForm'
import { settingPreset } from '@/utils/settingPreset'

const router = useRouter()
const { t } = useI18n()

const settingForm = useSettingForm()

interface SavedPrompt {
  id: string
  name: string
  systemPrompt: string
  userPrompt: string
}

const savedPrompts = ref<SavedPrompt[]>([])
const selectedPromptId = ref<string>('')
const customSystemPrompt = ref<string>('')

function loadSavedPrompts() {
  const stored = localStorage.getItem('savedPrompts')
  if (stored) {
    try {
      savedPrompts.value = JSON.parse(stored)
    } catch (error) {
      logDiagnostic('error', '[Prompts] Error loading saved prompts', { error })
      savedPrompts.value = []
    }
  }
}


// Chat state
const mode = useStorage(localStorageKey.chatMode, 'ask' as 'ask' | 'agent')
const history = ref<Message[]>([])
const userInput = ref('')
const loading = ref(false)
const messagesContainer = ref<HTMLElement>()
const inputTextarea = ref<HTMLTextAreaElement>()
const abortController = ref<AbortController | null>(null)
const threadId = useStorage(localStorageKey.threadId, uuidv4())
const showCheckpoints = ref(false)
const saver = new IndexedDBSaver()
const currentCheckpointId = ref<string>('')

// Settings
const useWordFormatting = useStorage(localStorageKey.useWordFormatting, true)
const useSelectedText = useStorage(localStorageKey.useSelectedText, true)
const insertType = ref<insertTypes>('replace')

const errorIssue = ref<boolean | string | null>(false)

const displayHistory = computed(() => {
  return history.value.filter(msg => !(msg instanceof SystemMessage))
})

// Quick actions
const quickActions: {
  key: keyof typeof buildInPrompt
  label: string
  icon: Component
}[] = [
  { key: 'translate', label: t('translate'), icon: Globe },
  { key: 'polish', label: t('polish'), icon: Sparkle },
  { key: 'academic', label: t('academic'), icon: BookOpen },
  { key: 'summary', label: t('summary'), icon: FileCheck },
  { key: 'grammar', label: t('grammar'), icon: CheckCircle },
]

const getCustomModels = (key: string, oldKey: string): string[] => {
  const stored = localStorage.getItem(key)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  }
  const oldModel = localStorage.getItem(oldKey)
  if (oldModel && oldModel.trim()) {
    return [oldModel]
  }
  return []
}

const currentModelOptions = computed(() => {
  let presetOptions: string[]
  let customModels: string[]

  switch (settingForm.value.api) {
    case 'official':
      presetOptions = settingPreset.officialModelSelect.optionList || []
      customModels = getCustomModels('customModels', 'customModel')
      break
    case 'gemini':
      presetOptions = settingPreset.geminiModelSelect.optionList || []
      customModels = getCustomModels('geminiCustomModels', 'geminiCustomModel')
      break
    case 'ollama':
      presetOptions = settingPreset.ollamaModelSelect.optionList || []
      customModels = getCustomModels('ollamaCustomModels', 'ollamaCustomModel')
      break
    case 'groq':
      presetOptions = settingPreset.groqModelSelect.optionList || []
      customModels = getCustomModels('groqCustomModels', 'groqCustomModel')
      break
    case 'azure':
      return []
    default:
      return []
  }

  return [...presetOptions, ...customModels]
})

const currentModelSelect = computed({
  get() {
    switch (settingForm.value.api) {
      case 'official':
        return settingForm.value.officialModelSelect
      case 'gemini':
        return settingForm.value.geminiModelSelect
      case 'ollama':
        return settingForm.value.ollamaModelSelect
      case 'groq':
        return settingForm.value.groqModelSelect
      case 'azure':
        return settingForm.value.azureDeploymentName
      default:
        return ''
    }
  },
  set(value) {
    switch (settingForm.value.api) {
      case 'official':
        settingForm.value.officialModelSelect = value
        localStorage.setItem(localStorageKey.model, value)
        break
      case 'gemini':
        settingForm.value.geminiModelSelect = value
        localStorage.setItem(localStorageKey.geminiModel, value)
        break
      case 'ollama':
        settingForm.value.ollamaModelSelect = value
        localStorage.setItem(localStorageKey.ollamaModel, value)
        break
      case 'groq':
        settingForm.value.groqModelSelect = value
        localStorage.setItem(localStorageKey.groqModel, value)
        break
      case 'azure':
        settingForm.value.azureDeploymentName = value
        localStorage.setItem(localStorageKey.azureDeploymentName, value)
        break
    }
  },
})

function settings() {
  // FIXME: 使用路由方式会改变当前的threadID,进而重置页面
  return router.push('/settings')
}

function checkPoints() {
  showCheckpoints.value = true
}

function startNewChat() {
  if (loading.value) {
    stopGeneration()
  }
  userInput.value = ''
  history.value = []
  threadId.value = uuidv4()
  customSystemPrompt.value = ''
  selectedPromptId.value = ''
  adjustTextareaHeight()
}

function stopGeneration() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  loading.value = false
}

function adjustTextareaHeight() {
  if (inputTextarea.value) {
    inputTextarea.value.style.height = 'auto'
    inputTextarea.value.style.height = Math.min(inputTextarea.value.scrollHeight, 120) + 'px'
  }
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function sendMessage() {
  if (!userInput.value.trim() || loading.value) return
  if (!checkApiKey()) return

  const userMessage = userInput.value.trim()
  userInput.value = ''
  adjustTextareaHeight()

  // Get selected text from Word
  let selectedText = ''
  if (useSelectedText.value && !selectionDismissed.value) {
    selectedText =
      selectionPreview.value ||
      (await Word.run(async ctx => {
        const range = ctx.document.getSelection()
        range.load('text')
        await ctx.sync()
        return range.text
      }))
  }

  // Add user message
  const fullMessage = new HumanMessage(
    selectedText ? `${userMessage}\n\n[Selected text: "${selectedText}"]` : userMessage,
  )

  await scrollToBottom()

  loading.value = true
  abortController.value = new AbortController()

  try {
    await processChat(fullMessage, undefined)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      messageUtil.info(t('generationStop'))
    } else {
      logDiagnostic('error', '[Chat] Failed to send message', { error, threadId: threadId.value })
      messageUtil.error(t('failedToResponse'))
      history.value.pop()
    }
  } finally {
    loading.value = false
    abortController.value = null
    selectionDismissed.value = false
  }
}

async function applyQuickAction(actionKey: keyof typeof buildInPrompt) {
  if (!checkApiKey()) return

  // Get selected text
  const selectedText = await Word.run(async ctx => {
    const range = ctx.document.getSelection()
    range.load('text')
    await ctx.sync()
    return range.text
  })

  if (!selectedText) {
    messageUtil.error(t('selectTextPrompt'))
    return
  }

  const builtInPrompts = getBuiltInPrompt()
  const action = builtInPrompts[actionKey]
  const settings = settingForm.value
  const { replyLanguage: lang } = settings

  const systemMessage = action.system(lang)
  const userMessage = new HumanMessage(action.user(selectedText, lang))

  await scrollToBottom()

  loading.value = true
  abortController.value = new AbortController()

  try {
    await processChat(userMessage, systemMessage)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      messageUtil.info(t('generationStop'))
    } else {
      logDiagnostic('error', '[Chat] Failed to process action', { error, threadId: threadId.value })
      messageUtil.error(t('failedToProcessAction'))
      // Remove failed message
      history.value.pop()
    }
  } finally {
    loading.value = false
    abortController.value = null
  }
}

const legalActions = computed<{ id: LegalActionId; label: string; icon: Component }[]>(() => [
  { id: 'review', label: t('legalReview'), icon: Scale },
  { id: 'check', label: t('legalCheck'), icon: FileSearch },
  { id: 'obligations', label: t('legalObligations'), icon: ListChecks },
  { id: 'dd', label: t('legalDd'), icon: ClipboardList },
  { id: 'research', label: t('legalResearch'), icon: BookOpen },
  { id: 'translate', label: t('legalTranslate'), icon: Languages },
])

async function applyLegalAction(actionId: LegalActionId) {
  if (!checkApiKey()) return

  const selectedText = await Word.run(async ctx => {
    const range = ctx.document.getSelection()
    range.load('text')
    await ctx.sync()
    return range.text
  })

  if (!selectedText?.trim()) {
    messageUtil.error(t('selectTextPrompt'))
    return
  }

  const { replyLanguage: lang } = settingForm.value
  const prompt = legalPrompts[actionId]
  // Keep the chat bubble short: instruction + document go to the model as the system
  // message, so the transcript shows only the action label instead of a wall of prompt.
  const systemMessage = `${prompt.system(lang)}\n\n${prompt.user(selectedText, lang)}`
  const actionLabel = legalActions.value.find(action => action.id === actionId)?.label ?? 'Legal action'
  const userMessage = new HumanMessage(actionLabel)

  await scrollToBottom()

  loading.value = true
  abortController.value = new AbortController()

  try {
    await processChat(userMessage, systemMessage)

    if (outputMode.value === 'apply') {
      // The answer streamed for ~30s; if the caret moved meanwhile, writing over the
      // new selection would destroy unrelated text. Verify the selection first.
      const stillThere = await Word.run(async ctx => {
        const range = ctx.document.getSelection()
        range.load('text')
        await ctx.sync()
        return (range.text || '').trim()
      })
      const expected = selectedText.trim()

      if (stillThere && expected && stillThere.slice(0, 80) !== expected.slice(0, 80)) {
        messageUtil.warning(t('applySkipped'))
      } else {
        const last = [...history.value].reverse().find(m => m instanceof AIMessage)
        const text = getMessageText(last)
        if (text.trim()) await insertToDocument(text, 'replace')
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      messageUtil.info(t('generationStop'))
    } else {
      logDiagnostic('error', '[Chat] Failed to run legal action', {
        error,
        actionId,
        threadId: threadId.value,
      })
      messageUtil.error(t('failedToProcessAction'))
      history.value.pop()
    }
  } finally {
    loading.value = false
    abortController.value = null
  }
}

async function runRedaction() {
  const selectedText = await Word.run(async ctx => {
    const range = ctx.document.getSelection()
    range.load('text')
    await ctx.sync()
    return range.text
  })

  if (!selectedText?.trim()) {
    messageUtil.error(t('selectTextPrompt'))
    return
  }

  const findings = scanPII(selectedText)
  if (!findings.length) {
    messageUtil.info(t('legalRedactNone'))
    return
  }

  const tagged = tagFindings(findings).slice(0, 40)
  let replaced = 0

  await Word.run(async ctx => {
    const range = ctx.document.getSelection()
    range.load('text')
    await ctx.sync()

    let text = range.text || ''
    for (const finding of tagged) {
      const before = text
      text = text.split(finding.value).join(finding.tag)
      if (text !== before) replaced += 1
    }

    if (text !== (range.text || '')) {
      range.insertText(text, 'Replace')
      await ctx.sync()
    }
  })

  messageUtil.success(t('legalRedactDone', { count: replaced }))
}

// ---- output mode: show the answer in chat, or also write it into the document ----
const outputMode = useStorage<'chat' | 'apply'>(localStorageKey.outputMode, 'chat')

// ---- WhatsApp-style rendering of "[Selected text: ...]" ----
const openQuotes = ref<number[]>([])

function splitSelection(content: string): { body: string; quote: string } {
  const match = (content || '').match(/\[Selected text:\s*"([\s\S]*)"\]\s*$/)
  if (!match) return { body: (content || '').trim(), quote: '' }
  return {
    body: content.slice(0, match.index).trim(),
    quote: (match[1] || '').trim(),
  }
}

function isQuoteOpen(index: number): boolean {
  return openQuotes.value.includes(index)
}

function toggleQuote(index: number) {
  openQuotes.value = isQuoteOpen(index)
    ? openQuotes.value.filter(i => i !== index)
    : [...openQuotes.value, index]
}

// ---- selection context pill ----
const selectionPreview = ref('')
const selectionDismissed = ref(false)
let selectionTimer: ReturnType<typeof setInterval> | null = null

async function refreshSelectionPreview() {
  if (!useSelectedText.value) {
    selectionPreview.value = ''
    return
  }
  try {
    const text = await Word.run(async ctx => {
      const range = ctx.document.getSelection()
      range.load('text')
      await ctx.sync()
      return range.text
    })
    if (!selectionDismissed.value) selectionPreview.value = (text || '').trim()
  } catch {
    selectionPreview.value = ''
  }
}

function dismissSelection() {
  selectionDismissed.value = true
  selectionPreview.value = ''
}

const agentPrompt = (lang: string) =>
  `
# Role
You are a highly skilled Microsoft Word Expert Agent. Your goal is to assist users in creating, editing, and formatting documents with professional precision.

# Capabilities
- You can interact with the document directly using provided tools (reading text, applying styles, inserting content, etc.).
- You understand document structure, typography, and professional writing standards.

# Guidelines
1. **Tool First**: Use only the tools currently provided. Web search requires explicit permission in Tools settings; if it is unavailable, explain that it must be enabled before searching.
2. **Accuracy**: Ensure formatting and content changes are precise and follow the user's intent.
3. **Conciseness**: Provide brief, helpful explanations of your actions.
4. **Language**: You must communicate entirely in ${lang}.

# Safety
Do not perform destructive actions (like clearing the whole document) unless explicitly instructed.
`.trim()

const standardPrompt = (lang: string) =>
  `You are a helpful Microsoft Word specialist. Help users with drafting, brainstorming, and Word-related questions. Reply in ${lang}.`

async function processChat(userMessage: HumanMessage, systemMessage?: string) {
  const settings = settingForm.value
  const { replyLanguage: lang, api: provider } = settings

  const isAgentMode = mode.value === 'agent'

  const finalSystemMessage =
    customSystemPrompt.value || systemMessage || (isAgentMode ? agentPrompt(lang) : standardPrompt(lang))

  const defaultSystemMessage = new SystemMessage(finalSystemMessage)

  // Add user message to history
  history.value.push(userMessage)

  // Prepare messages for LLM (always include system message first, followed by all history)
  const finalMessages = [defaultSystemMessage, ...history.value]
  // Build provider configuration
  const providerConfigs: Record<string, ProviderConfig> = {
    official: {
      provider: 'official',
      config: {
        apiKey: settings.officialAPIKey,
        baseURL: settings.officialBasePath,
        dangerouslyAllowBrowser: true,
      },
      maxTokens: settings.officialMaxTokens,
      temperature: settings.officialTemperature,
      model: settings.officialModelSelect,
    },
    groq: {
      provider: 'groq',
      groqAPIKey: settings.groqAPIKey,
      groqModel: settings.groqModelSelect,
      maxTokens: settings.groqMaxTokens,
      temperature: settings.groqTemperature,
    },
    azure: {
      provider: 'azure',
      azureAPIKey: settings.azureAPIKey,
      azureAPIEndpoint: settings.azureAPIEndpoint,
      azureDeploymentName: settings.azureDeploymentName,
      azureAPIVersion: settings.azureAPIVersion,
      maxTokens: settings.azureMaxTokens,
      temperature: settings.azureTemperature,
    },
    gemini: {
      provider: 'gemini',
      geminiAPIKey: settings.geminiAPIKey,
      maxTokens: settings.geminiMaxTokens,
      temperature: settings.geminiTemperature,
      geminiModel: settings.geminiModelSelect,
    },
    ollama: {
      provider: 'ollama',
      ollamaEndpoint: settings.ollamaEndpoint,
      ollamaModel: settings.ollamaModelSelect,
      temperature: settings.ollamaTemperature,
    },
  }

  const currentConfig = providerConfigs[provider]
  if (!currentConfig) {
    messageUtil.error(t('notSupportedProvider'))
    return
  }

  history.value.push(new AIMessage(''))

  // Use agent mode with tools if enabled
  if (isAgentMode) {
    const tools = getActiveTools()

    await getAgentResponse({
      ...currentConfig,
      recursionLimit: settings.agentMaxIterations,
      messages: finalMessages,
      tools,
      errorIssue,
      loading,
      abortSignal: abortController.value?.signal,
      threadId: threadId.value,
      checkpointId: currentCheckpointId.value,
      onStream: (text: string) => {
        const lastIndex = history.value.length - 1
        history.value[lastIndex] = new AIMessage(text)
        scrollToBottom().catch(error => logDiagnostic('error', '[Chat] Scroll failed', { error }))
      },
      onToolCall: (toolName: string) => {
        // Show tool call in UI
        const lastIndex = history.value.length - 1
        const currentContent = getMessageText(history.value[lastIndex])
        history.value[lastIndex] = new AIMessage(currentContent + `\n\n🔧 Calling tool: ${toolName}...`)
        scrollToBottom().catch(error => logDiagnostic('error', '[Chat] Scroll failed', { error }))
      },
      onToolResult: (toolName: string, _result: string, status?: 'success' | 'error') => {
        // Update with tool result
        const lastIndex = history.value.length - 1
        const currentContent = getMessageText(history.value[lastIndex])
        const updatedContent = currentContent.replace(
          `🔧 Calling tool: ${toolName}...`,
          status === 'error' ? `❌ Tool ${toolName} failed` : `✅ Tool ${toolName} completed`,
        )
        history.value[lastIndex] = new AIMessage(updatedContent)
        scrollToBottom().catch(error => logDiagnostic('error', '[Chat] Scroll failed', { error }))
      },
    })
  } else {
    await getChatResponse({
      ...currentConfig,
      messages: finalMessages,
      errorIssue,
      loading,
      abortSignal: abortController.value?.signal,
      threadId: threadId.value,
      onStream: (text: string) => {
        const lastIndex = history.value.length - 1
        history.value[lastIndex] = new AIMessage(text)
        scrollToBottom().catch(error => logDiagnostic('error', '[Chat] Scroll failed', { error }))
      },
    })
  }

  if (errorIssue.value) {
    if (typeof errorIssue.value === 'string') {
      messageUtil.error(t(errorIssue.value))
    } else {
      messageUtil.error(t('somethingWentWrong'))
    }
    errorIssue.value = null
    return
  }

  await scrollToBottom()
}

async function insertToDocument(content: string, type: insertTypes) {
  insertType.value = type

  if (useWordFormatting.value) {
    await insertFormattedResult(content, insertType)
  } else {
    insertResult(content, insertType)
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    messageUtil.success(t('copied'))
  } catch (error) {
    logDiagnostic('error', '[Clipboard] Copy failed', { error })
    messageUtil.error(t('somethingWentWrong'))
  }
}

function checkApiKey() {
  const auth = {
    type: settingForm.value.api as supportedPlatforms,
    apiKey: settingForm.value.officialAPIKey,
    azureAPIKey: settingForm.value.azureAPIKey,
    geminiAPIKey: settingForm.value.geminiAPIKey,
    groqAPIKey: settingForm.value.groqAPIKey,
  }
  if (!checkAuth(auth)) {
    messageUtil.error(t('noAPIKey'))
    return false
  }
  return true
}

const THINK_TAG = '<think>'
const THINK_TAG_END = '</think>'

interface RenderSegment {
  type: 'text' | 'think'
  text: string
}

const getMessageText = (msg: Message | undefined): string => messageContentToText(msg?.content)

const cleanMessageText = (msg: Message): string => {
  const raw = getMessageText(msg)
  const regex = new RegExp(`${THINK_TAG}[\\s\\S]*?${THINK_TAG_END}`, 'g')
  return raw.replace(regex, '').trim()
}

const splitThinkSegments = (text: string): RenderSegment[] => {
  if (!text) return []

  const segments: RenderSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf(THINK_TAG, cursor)
    if (start === -1) {
      segments.push({ type: 'text', text: text.slice(cursor) })
      break
    }

    if (start > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, start) })
    }

    const end = text.indexOf(THINK_TAG_END, start + THINK_TAG.length)
    if (end === -1) {
      segments.push({
        type: 'think',
        text: text.slice(start + THINK_TAG.length),
      })
      break
    }

    segments.push({
      type: 'think',
      text: text.slice(start + THINK_TAG.length, end),
    })
    cursor = end + THINK_TAG_END.length
  }

  return segments.filter(segment => segment.text)
}

const renderSegments = (msg: Message): RenderSegment[] => {
  const raw = getMessageText(msg)
  return splitThinkSegments(raw)
}

const addWatch = () => {
  watch(
    () => settingForm.value.replyLanguage,
    () => {
      localStorage.setItem(localStorageKey.replyLanguage, settingForm.value.replyLanguage)
    },
  )
  watch(
    () => settingForm.value.api,
    () => {
      localStorage.setItem(localStorageKey.api, settingForm.value.api)
    },
  )
}

function initData() {
  insertType.value = (localStorage.getItem(localStorageKey.insertType) as insertTypes) || 'replace'
}

async function handleRestore(checkpointId: string) {
  currentCheckpointId.value = checkpointId
  showCheckpoints.value = false

  // Fetch the history up to the selected checkpoint
  const checkpointTuple = await saver.getTuple({
    configurable: { thread_id: threadId.value, checkpoint_id: checkpointId },
  })

  if (checkpointTuple) {
    const messages = checkpointTuple.checkpoint.channel_values.messages
    if (messages && Array.isArray(messages)) {
      history.value = restoreChatMessages(messages)
    }
  }
}

async function loadThreadHistory(targetThreadId: string) {
  const checkpoints: CheckpointTuple[] = []
  const iterator = saver.list({
    configurable: { thread_id: targetThreadId },
  })

  for await (const checkpoint of iterator) {
    checkpoints.push(checkpoint)
  }

  checkpoints.sort((a, b) => (a.metadata?.step ?? 0) - (b.metadata?.step ?? 0))
  const latestCheckpoint = checkpoints.at(-1)
  if (latestCheckpoint) {
    const messages = latestCheckpoint.checkpoint.channel_values.messages
    // TODO: 优化过滤策略
    if (messages && Array.isArray(messages)) {
      history.value = restoreChatMessages(messages)
      currentCheckpointId.value = latestCheckpoint.config.configurable?.checkpoint_id || ''
    } else {
      history.value = []
      currentCheckpointId.value = ''
    }
  } else {
    // No checkpoints found for this thread
    history.value = []
    currentCheckpointId.value = ''
  }
  await scrollToBottom()
}

async function handleSelectThread(newThreadId: string) {
  threadId.value = newThreadId
  showCheckpoints.value = false
  await loadThreadHistory(newThreadId)
}

onBeforeMount(async () => {
  selectionTimer = setInterval(() => {
    void refreshSelectionPreview()
  }, 2500)
  void refreshSelectionPreview()
  addWatch()
  initData()
  loadSavedPrompts()

  if (threadId.value) {
    loading.value = true // 可选：显示加载状态
    try {
      await loadThreadHistory(threadId.value)
    } catch (e) {
      logDiagnostic('error', '[Sessions] Auto reload history failed', { error: e, threadId: threadId.value })
    } finally {
      loading.value = false
    }
  }
})

onBeforeUnmount(() => {
  if (selectionTimer) clearInterval(selectionTimer)
})
</script>
