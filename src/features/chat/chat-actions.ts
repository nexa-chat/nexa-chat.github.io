"use client";

import { toast } from "@/components/ui/toast";
import { NexaError, toNexaError } from "@/lib/errors";
import { createId } from "@/lib/ids";
import { estimateCost, resolveParams } from "@/lib/params";
import { hostOf } from "@/lib/url";
import { activePath, deepestLeaf, findForks, isSaved } from "@/services/branches";
import { CONTINUE_INSTRUCTION, buildChatMessages, composeSystem } from "@/services/context";
import { runGeneration } from "@/services/generation";
import { createAdapter } from "@/services/provider-service";
import { invalidateSearchIndex } from "@/services/search";
import { generateTitle, heuristicTitle } from "@/services/titles";
import { collectTools, runToolCall, type Toolset } from "@/services/tools/registry";
import { getStorage } from "@/storage";
import type { Attachment, Conversation, Message, ModelConfig, ProviderConfig, ToolResult } from "@/types";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "../settings/settings-store";
import { readTree, useChatStore, type StreamState } from "./chat-store";
import { resolveSystemPrompt } from "./system-prompts";
import { requestApproval } from "./tool-approvals";
import { getLocale, t } from "@/i18n";

const PERSIST_INTERVAL_MS = 1500;

/** One live request per conversation. */
const controllers = new Map<string, AbortController>();

export function resolveModel(conversation: Conversation | undefined): { model?: ModelConfig; provider?: ProviderConfig } {
  const { models, providers } = useProviderStore.getState();
  const { settings } = useSettingsStore.getState();
  const { draftModelId } = useChatStore.getState();

  const ids = [conversation?.modelConfigId, conversation ? undefined : draftModelId, settings.defaultModelId];
  const model =
    ids.flatMap((id) => models.filter((item) => item.id === id))[0] ?? models.find((item) => item.favorite) ?? models[0];
  return { model, provider: providers.find((item) => item.id === model?.providerId) };
}

function saveMessage(message: Message): Promise<void> {
  return getStorage().put("messages", message);
}

function patchActive(id: string, patch: Partial<Message>): void {
  useChatStore.getState().setMessages((messages) => messages.map((item) => (item.id === id ? { ...item, ...patch } : item)));
}

function createAssistant(conversationId: string, parentId: string | null, createdAt: number, model: ModelConfig, provider: ProviderConfig): Message {
  return {
    id: createId("msg"),
    conversationId,
    parentId,
    role: "assistant",
    content: "",
    status: "streaming",
    model: { modelConfigId: model.id, modelName: model.name, providerName: provider.name, host: hostOf(provider.baseUrl) },
    createdAt,
    updatedAt: createdAt,
  };
}

async function failBeforeStart(assistant: Message, error: NexaError): Promise<void> {
  const failed: Message = { ...assistant, status: "error", error: error.toJSON() };
  await saveMessage(failed);
  patchActive(assistant.id, failed);
}

interface GenerateOptions {
  conversation: Conversation;
  history: Message[];
  assistant: Message;
  model: ModelConfig;
  provider: ProviderConfig;
  /** Text already on the message when continuing it. */
  prefix?: string;
  instruction?: string;
  /** A one-off model, as when comparing: the chat keeps its own model afterwards. */
  oneOff?: boolean;
  /** Set on the second try, so a fallback never falls back again. */
  isFallback?: boolean;
  /** How many tool rounds came before this answer in the same turn. */
  depth?: number;
}

/** A model that keeps calling tools is stopped after this many rounds in one turn. */
const MAX_TOOL_ROUNDS = 6;

function appendIfActive(conversationId: string, message: Message): void {
  const chat = useChatStore.getState();
  if (chat.activeId === conversationId) chat.setMessages((messages) => [...messages, message]);
}

/**
 * Runs the calls of one answer, asking first for any tool outside the browser, then hands the
 * results back to the model for the next round. Every call gets a result, denied ones included,
 * because providers refuse a call left unanswered.
 */
async function runToolRound(options: GenerateOptions, answer: Message, toolset: Toolset, signal: AbortSignal): Promise<void> {
  const { conversation, model, provider, depth = 0 } = options;
  const results: ToolResult[] = [];
  for (const call of answer.toolCalls ?? []) {
    const entry = toolset.find(call.name);
    const settings = useSettingsStore.getState().settings;
    if (signal.aborted) {
      results.push({ toolCallId: call.id, content: "The user stopped the answer before this tool ran.", isError: true });
      continue;
    }
    if (entry?.needsApproval && !settings.alwaysAllowedTools.includes(call.name)) {
      const decision = await requestApproval(call, entry.source, signal);
      if (decision === "deny") {
        results.push({ toolCallId: call.id, content: "The user declined to run this tool.", isError: true });
        continue;
      }
      if (decision === "always") useSettingsStore.getState().update({ alwaysAllowedTools: [...settings.alwaysAllowedTools, call.name] });
    }
    results.push(await runToolCall(entry, call, signal));
  }

  const now = Math.max(Date.now(), answer.createdAt + 1);
  const toolMessage: Message = { id: createId("msg"), conversationId: conversation.id, parentId: answer.id, role: "tool", content: "", toolResults: results, status: "complete", createdAt: now, updatedAt: now };
  await saveMessage(toolMessage);
  appendIfActive(conversation.id, toolMessage);
  if (signal.aborted) return;

  const next = createAssistant(conversation.id, toolMessage.id, now + 1, model, provider);
  await saveMessage(next);
  appendIfActive(conversation.id, next);
  await generate({ ...options, history: [...options.history, answer, toolMessage], assistant: next, prefix: "", instruction: undefined, depth: depth + 1 });
}

/** Failures on the provider's or the network's side, where another model may well succeed. */
const FALLBACK_ERRORS = new Set(["rate_limited", "quota_exceeded", "provider_error", "bad_gateway", "unavailable", "timeout", "network", "stream_interrupted"]);

function fallbackFor(model: ModelConfig): { model: ModelConfig; provider: ProviderConfig } | undefined {
  const { fallbackModelId } = useSettingsStore.getState().settings;
  if (!fallbackModelId || fallbackModelId === model.id) return undefined;
  const { models, providers } = useProviderStore.getState();
  const fallback = models.find((item) => item.id === fallbackModelId);
  const provider = providers.find((item) => item.id === fallback?.providerId);
  return fallback && provider ? { model: fallback, provider } : undefined;
}

async function generate(options: GenerateOptions): Promise<void> {
  const { conversation, history, assistant, model, provider, prefix = "", instruction, oneOff = false, isFallback = false, depth = 0 } = options;
  const chat = useChatStore.getState();
  const { settings } = useSettingsStore.getState();
  const conversationId = conversation.id;

  const controller = new AbortController();
  controllers.set(conversationId, controller);

  let text = prefix;
  let reasoning = assistant.reasoning ?? "";
  let phase: StreamState["phase"] = "connecting";
  let retryAttempt: number | undefined;
  let frame: number | undefined;
  let lastPersist = Date.now();

  const publish = (): void => {
    frame = undefined;
    chat.setStream(conversationId, { messageId: assistant.id, conversationId, text, reasoning, phase, retryAttempt });
  };
  // Tokens arrive faster than frames. Coalesce so React renders at most once per frame.
  const schedule = (): void => {
    frame ??= requestAnimationFrame(publish);
    if (Date.now() - lastPersist > PERSIST_INTERVAL_MS) {
      lastPersist = Date.now();
      void saveMessage({ ...assistant, content: text, reasoning: reasoning || undefined });
    }
  };

  publish();

  try {
    const adapter = await createAdapter(provider);
    const messages = await buildChatMessages(history, model.capabilities, adapter);
    // Tools are offered only to models that can use them, and never past the round limit.
    const toolset = model.capabilities.supportsTools && depth < MAX_TOOL_ROUNDS ? await collectTools(settings) : undefined;
    if (toolset?.unavailable.length && depth === 0) toast.warning(t("Couldn't reach {0}. Its tools are off for this message.", { 0: toolset.unavailable.join(", ") }));
    if (instruction) messages.push({ role: "user", parts: [{ type: "text", text: instruction }] });

    const outcome = await runGeneration({
      adapter,
      autoRetry: settings.autoRetry,
      request: {
        model,
        system: composeSystem(
          resolveSystemPrompt(conversation, settings),
          chat.folders.find((folder) => folder.id === conversation.folderId),
          conversation,
        ),
        messages,
        params: resolveParams(model, conversation.preset),
        tools: toolset?.definitions,
        signal: controller.signal,
        timeoutMs: settings.requestTimeoutSeconds * 1000,
      },
      callbacks: {
        onText: (delta) => {
          text += delta;
          phase = "streaming";
          schedule();
        },
        onReasoning: (delta) => {
          reasoning += delta;
          phase = "streaming";
          schedule();
        },
        onRetrying: ({ attempt }) => {
          phase = "retrying";
          retryAttempt = attempt;
          publish();
        },
        onParamDropped: (param) => useProviderStore.getState().markUnsupportedParam(model.id, param),
      },
    });

    if (frame !== undefined) cancelAnimationFrame(frame);

    // Nothing arrived and the failure was on the provider's side: let the fallback model answer.
    const fallback = !isFallback && !prefix && !text && !reasoning && outcome.error && FALLBACK_ERRORS.has(outcome.error.code) ? fallbackFor(model) : undefined;
    if (fallback && outcome.error) {
      const retried: Message = {
        ...assistant,
        model: { modelConfigId: fallback.model.id, modelName: fallback.model.name, providerName: fallback.provider.name, host: hostOf(fallback.provider.baseUrl) },
        fellBackFrom: { modelName: model.name, reason: outcome.error.title },
      };
      patchActive(assistant.id, retried);
      await generate({ ...options, assistant: retried, model: fallback.model, provider: fallback.provider, oneOff: true, isFallback: true });
      return;
    }

    const finished: Message = {
      ...assistant,
      content: text,
      reasoning: reasoning || undefined,
      toolCalls: outcome.toolCalls.length > 0 ? outcome.toolCalls : undefined,
      status: outcome.error ? "error" : outcome.stopped ? "stopped" : "complete",
      error: outcome.error?.toJSON(),
      finishReason: outcome.finishReason,
      usage: outcome.usage,
      estimatedCost: estimateCost(outcome.usage, model.pricing),
      updatedAt: Date.now(),
    };
    await saveMessage(finished);
    invalidateSearchIndex();
    patchActive(assistant.id, finished);
    await chat.updateConversation(conversationId, { updatedAt: Date.now(), ...(oneOff ? {} : { modelConfigId: model.id, providerId: provider.id }), messageCount: history.length + 1 });
    maybeGenerateTitle(conversationId, model, provider, finished);
    if (toolset && finished.status === "complete" && finished.toolCalls?.length) await runToolRound(options, finished, toolset, controller.signal);
  } catch (caught) {
    await failBeforeStart({ ...assistant, content: text }, toNexaError(caught));
  } finally {
    controllers.delete(conversationId);
    chat.setStream(conversationId, null);
  }
}

function maybeGenerateTitle(conversationId: string, model: ModelConfig, provider: ProviderConfig, finished: Message): void {
  const { settings } = useSettingsStore.getState();
  const chat = useChatStore.getState();
  const conversation = chat.conversations.find((item) => item.id === conversationId);
  if (!settings.autoTitle || finished.status !== "complete" || conversation?.titleSource !== "auto") return;

  void (async () => {
    try {
      const messages = await getStorage().messagesFor(conversationId);
      const firstUser = messages.find((message) => message.role === "user");
      if (!firstUser?.content) return;
      const title = await generateTitle(await createAdapter(provider), model, firstUser.content);
      const current = useChatStore.getState().conversations.find((item) => item.id === conversationId);
      // A title typed by the user while this ran always wins.
      if (title && current?.titleSource === "auto") {
        await useChatStore.getState().updateConversation(conversationId, { title, titleSource: "ai" });
      }
    } catch {
      // The local title stays. A failed cosmetic request shouldn't interrupt anyone.
    }
  })();
}

export function isGenerating(conversationId: string | null): boolean {
  return conversationId !== null && controllers.has(conversationId);
}

export function stopGeneration(conversationId: string | null): void {
  if (conversationId) controllers.get(conversationId)?.abort();
}

export interface OutgoingAttachment {
  attachment: Attachment;
  blob?: Blob;
}

export async function sendMessage(text: string, attachments: readonly OutgoingAttachment[] = []): Promise<void> {
  const chat = useChatStore.getState();
  const active = chat.conversations.find((item) => item.id === chat.activeId);
  const { model, provider } = resolveModel(active);
  if (!model || !provider) {
    toast.warning(t("Add a provider first."));
    return;
  }
  if (active && isGenerating(active.id)) return;

  const conversation =
    active ?? (await chat.createConversation({ modelConfigId: model.id, providerId: provider.id }));

  const storage = getStorage();
  await Promise.all(
    attachments.flatMap(({ attachment, blob }) => (blob ? [storage.put("blobs", { id: attachment.id, blob })] : [])),
  );

  const previous = useChatStore.getState().activeId === conversation.id ? useChatStore.getState().messages : [];
  await followNewestBranch(conversation);

  const now = Date.now();
  const user: Message = {
    id: createId("msg"),
    conversationId: conversation.id,
    parentId: previous.at(-1)?.id ?? null,
    role: "user",
    content: text,
    attachments: attachments.length > 0 ? attachments.map((item) => item.attachment) : undefined,
    status: "complete",
    createdAt: now,
    updatedAt: now,
  };
  const assistant = createAssistant(conversation.id, user.id, now + 1, model, provider);

  await saveMessage(user);
  await saveMessage(assistant);
  invalidateSearchIndex();

  chat.setMessages(() => [...previous, user, assistant]);

  let current = conversation;
  if (conversation.titleSource === "pending") {
    const title = heuristicTitle(text || attachments[0]?.attachment.name || "New chat");
    current = { ...conversation, title, titleSource: "auto" };
    await chat.updateConversation(conversation.id, { title, titleSource: "auto", updatedAt: now });
  }

  await generate({ conversation: current, history: [...previous, user], assistant, model, provider });
}

function conversationFor(message: Message): Conversation | undefined {
  return useChatStore.getState().conversations.find((item) => item.id === message.conversationId);
}

/** The newest message marks the active branch, so a chosen leaf only matters until the next one. */
async function followNewestBranch(conversation: Conversation): Promise<void> {
  const current = useChatStore.getState().conversations.find((item) => item.id === conversation.id);
  if (current?.activeLeafId) await useChatStore.getState().updateConversation(conversation.id, { activeLeafId: undefined });
}

/**
 * Leaves the screen at the point just before a message, which stays in storage as another
 * version. The exception is a failed reply with nothing in it, which isn't worth keeping.
 */
async function rewindTo(messageId: string): Promise<Message[]> {
  const { messages, setMessages } = useChatStore.getState();
  const index = messages.findIndex((item) => item.id === messageId);
  const message = messages[index];
  if (!message) return messages;
  const kept = messages.slice(0, index);
  if (index === messages.length - 1 && message.status === "error" && !message.content && !message.reasoning) {
    await getStorage().delete("messages", messageId);
    invalidateSearchIndex();
  }
  setMessages(() => kept);
  return kept;
}

function modelWithProvider(modelId: string): { model?: ModelConfig; provider?: ProviderConfig } {
  const { models, providers } = useProviderStore.getState();
  const model = models.find((item) => item.id === modelId);
  return { model, provider: providers.find((item) => item.id === model?.providerId) };
}

async function respondTo(conversation: Conversation, history: Message[], modelId?: string): Promise<void> {
  const { model, provider } = modelId ? modelWithProvider(modelId) : resolveModel(conversation);
  if (!model || !provider) {
    toast.warning(t("This chat's model is gone. Pick another one."));
    return;
  }
  const last = history.at(-1);
  const assistant = createAssistant(conversation.id, last?.id ?? null, Math.max(Date.now(), (last?.createdAt ?? 0) + 1), model, provider);
  await followNewestBranch(conversation);
  await saveMessage(assistant);
  useChatStore.getState().setMessages((messages) => [...messages, assistant]);
  await useChatStore.getState().refreshForks(conversation.id);
  await generate({ conversation, history, assistant, model, provider, oneOff: modelId !== undefined && modelId !== conversation.modelConfigId });
}

/** Adds a new version of an answer, keeping the old one. Also how Retry works after an error. */
export async function regenerate(messageId: string, modelId?: string): Promise<void> {
  const message = useChatStore.getState().messages.find((item) => item.id === messageId);
  const conversation = message && conversationFor(message);
  if (!conversation || isGenerating(conversation.id)) return;
  await respondTo(conversation, await rewindTo(messageId), modelId);
}

/** Resends a user message. What came after it stays available as another version. */
export async function resend(messageId: string): Promise<void> {
  const { messages } = useChatStore.getState();
  const index = messages.findIndex((item) => item.id === messageId);
  const message = messages[index];
  const conversation = message && conversationFor(message);
  if (!conversation || isGenerating(conversation.id)) return;

  const next = messages[index + 1];
  const history = next ? await rewindTo(next.id) : messages;
  await respondTo(conversation, history);
}

/** An edit is a new version of the message, so the original and its answers survive. */
export async function editMessage(messageId: string, content: string): Promise<void> {
  const { messages, setMessages } = useChatStore.getState();
  const index = messages.findIndex((item) => item.id === messageId);
  const message = messages[index];
  const conversation = message && conversationFor(message);
  if (!message || !conversation || isGenerating(conversation.id)) return;
  if (content === message.content) return resend(messageId);

  const now = Date.now();
  const edited: Message = { ...message, id: createId("msg"), content, saved: undefined, createdAt: now, updatedAt: now };
  const history = [...messages.slice(0, index), edited];
  await saveMessage(edited);
  invalidateSearchIndex();
  setMessages(() => history);
  await respondTo(conversation, history);
}

/** Shows another version of a message, and the conversation that followed it. */
export async function switchBranch(messageId: string): Promise<void> {
  const { activeId, updateConversation } = useChatStore.getState();
  if (!activeId || isGenerating(activeId)) return;
  const tree = await readTree(activeId);
  const leaf = deepestLeaf(tree, messageId);
  await updateConversation(activeId, { activeLeafId: leaf });
  useChatStore.setState({ messages: activePath(tree, leaf), forks: findForks(tree), keepScroll: true });
}

/** Opens a chat on the branch holding a message, wherever that branch is. */
export async function openMessage(conversationId: string, messageId: string): Promise<void> {
  const chat = useChatStore.getState();
  const leaf = deepestLeaf(await readTree(conversationId), messageId);
  await chat.updateConversation(conversationId, { activeLeafId: leaf });
  if (chat.activeId === conversationId) useChatStore.setState({ messages: [] });
  await chat.openConversation(conversationId);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { setMessages, messages, updateConversation, refreshForks } = useChatStore.getState();
  const message = messages.find((item) => item.id === messageId);
  if (!message) return;

  // Whatever answered this message now follows the message before it, so no branch is lost.
  const parentId = message.parentId ?? null;
  const children = (await readTree(message.conversationId)).filter((item) => item.parentId === messageId);
  await getStorage().putMany("messages", children.map((item) => ({ ...item, parentId })));
  await getStorage().delete("messages", messageId);
  invalidateSearchIndex();

  const remaining = messages.filter((item) => item.id !== messageId).map((item) => (item.parentId === messageId ? { ...item, parentId } : item));
  setMessages(() => remaining);
  await updateConversation(message.conversationId, { messageCount: remaining.length, activeLeafId: remaining.at(-1)?.id });
  await refreshForks(message.conversationId);
}

/**
 * Extends a stopped or truncated answer on the same message. It uses an instruction rather
 * than an assistant prefill, which current Claude models reject with a 400.
 */
export async function continueMessage(messageId: string): Promise<void> {
  const { messages } = useChatStore.getState();
  const index = messages.findIndex((item) => item.id === messageId);
  const message = messages[index];
  const conversation = message && conversationFor(message);
  if (!message || !conversation || isGenerating(conversation.id)) return;

  const { model, provider } = resolveModel(conversation);
  if (!model || !provider) return;

  const assistant: Message = { ...message, status: "streaming", error: undefined, finishReason: undefined };
  patchActive(message.id, assistant);
  await generate({
    conversation,
    history: messages.slice(0, index + 1),
    assistant,
    model,
    provider,
    prefix: message.content,
    instruction: CONTINUE_INSTRUCTION,
  });
}

const SUMMARY_SYSTEM =
  "Summarize this conversation so it can continue in a new chat. Keep every decision, fact, name, number, " +
  "piece of code and open question that later messages may need. Write it in the conversation's language, " +
  "as compact notes, with no introduction.";

/**
 * Long chats resend everything with each message. This writes a summary with the chat's model,
 * then opens a new chat that starts from it. The original chat is left exactly as it was.
 */
export async function continueWithSummary(conversationId: string): Promise<void> {
  const chat = useChatStore.getState();
  const conversation = chat.conversations.find((item) => item.id === conversationId);
  if (!conversation || isGenerating(conversationId)) return;
  const { model, provider } = resolveModel(conversation);
  if (!model || !provider) {
    toast.warning(t("This chat's model is gone. Pick another one first."));
    return;
  }
  const messages = chat.activeId === conversationId ? chat.messages : (await getStorage().messagesFor(conversationId)).filter((message) => message.status !== "error");
  const transcript = messages
    .filter((message) => message.content.trim())
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");

  toast.info(t("Writing a summary of this chat…"));
  const summarize = async (target: ModelConfig, targetProvider: ProviderConfig): Promise<string> => {
    const adapter = await createAdapter(targetProvider);
    const result = await adapter.sendMessage({
      model: target,
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", parts: [{ type: "text", text: transcript }] }],
      params: { maxTokens: 2000 },
      timeoutMs: useSettingsStore.getState().settings.requestTimeoutSeconds * 1000,
    });
    return result.text;
  };
  try {
    let text: string;
    try {
      text = await summarize(model, provider);
    } catch (caught) {
      // The chat's model is down: the fallback model can write the summary instead.
      const fallback = FALLBACK_ERRORS.has(toNexaError(caught).code) ? fallbackFor(model) : undefined;
      if (!fallback) throw caught;
      text = await summarize(fallback.model, fallback.provider);
    }
    const summary = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!summary) throw new NexaError("malformed_response");
    chat.newChat();
    await chat.createConversation({
      title: t("{0} (continued)", { 0: conversation.title }),
      titleSource: "user",
      modelConfigId: model.id,
      providerId: provider.id,
      folderId: conversation.folderId,
      systemPreset: conversation.systemPreset,
      systemPrompt: conversation.systemPrompt,
      preset: conversation.preset,
      summary,
      summaryOf: conversation.id,
    });
    toast.success(t("New chat started from the summary. The original is unchanged."));
  } catch (caught) {
    toast.error(toNexaError(caught).message);
  }
}

export async function togglePinned(message: Message): Promise<void> {
  const pinned = !message.pinned;
  await saveMessage({ ...message, pinned });
  patchActive(message.id, { pinned });
}

export async function toggleSaved(message: Message): Promise<void> {
  const saved = !isSaved(message);
  await saveMessage({ ...message, saved, feedback: undefined });
  patchActive(message.id, { saved, feedback: undefined });
}

export const CHAT_ACTIONS = [
  { id: "summarize", label: "Summarize", prompt: "Summarize your previous answer in a few sentences." },
  { id: "rewrite", label: "Rewrite", prompt: "Rewrite your previous answer so it reads more clearly." },
  { id: "explain", label: "Explain", prompt: "Explain your previous answer in simpler terms." },
  { id: "translate", label: "Translate", prompt: "Translate your previous answer into {language}." },
  { id: "fix-code", label: "Fix code", prompt: "Review the code in your previous answer, fix any bugs, and show the corrected version." },
] as const;

export function runChatAction(actionId: (typeof CHAT_ACTIONS)[number]["id"]): Promise<void> {
  const action = CHAT_ACTIONS.find((item) => item.id === actionId);
  const language = new Intl.DisplayNames([getLocale()], { type: "language" }).of(navigator.language.split("-")[0] ?? "en") ?? "English";
  // The prompt appears in the chat as the user's message, so it is in the interface's language.
  return sendMessage(t(action?.prompt ?? "").replace("{language}", language));
}
