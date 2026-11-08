"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { hostOf } from "@/lib/url";
import { invalidateSearchIndex } from "@/services/search";
import { STORE_NAMES, getStorage, getVault } from "@/storage";
import { useChatStore } from "../chat/chat-store";
import { useProviderStore } from "../providers/provider-store";
import { useSettingsStore } from "../settings/settings-store";
import { t } from "@/i18n";

function Answer({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[13rem_1fr] sm:gap-6">
      <dt className="font-medium">{question}</dt>
      <dd className="text-sm leading-relaxed text-muted">{children}</dd>
    </div>
  );
}

function RouteMap() {
  const providers = useProviderStore((state) => state.providers);
  if (providers.length === 0) return <p className="text-sm text-muted">{t("No providers yet, so nothing leaves this browser.")}</p>;

  return (
    <ul className="flex flex-col gap-2.5">
      {providers.map((provider) => (
        <li key={provider.id} className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted">{t("Your browser")}</span>
          <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border-strong" />
          {provider.connection === "relay" ? (
            <>
              <span className="shrink-0 text-warning">{t("relay on this site")}</span>
              <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border-strong" />
            </>
          ) : null}
          <span className="min-w-0 truncate font-mono text-[0.8125rem]">{hostOf(provider.baseUrl)}</span>
        </li>
      ))}
    </ul>
  );
}

function DangerRow({ title, description, label, onConfirm }: { title: string; description: string; label: string; onConfirm: () => Promise<void> }) {
  const run = async (): Promise<void> => {
    const confirmed = await confirmAction({ title: `${label}?`, message: t("{0} This can't be undone.", { 0: description }), confirmLabel: label, danger: true });
    if (confirmed) {
      await onConfirm();
      toast.success(t("Done."));
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium">{title}</p>
        <p className="text-[0.8125rem] text-muted">{description}</p>
      </div>
      <Button variant="danger" size="s" onClick={() => void run()}>
        {label}
      </Button>
    </li>
  );
}

export function PrivacyCenter() {
  const router = useRouter();
  const providers = useProviderStore((state) => state.providers);

  const reloadStores = async (): Promise<void> => {
    invalidateSearchIndex();
    useChatStore.getState().newChat();
    await Promise.all([useChatStore.getState().load(), useProviderStore.getState().load(), useSettingsStore.getState().load()]);
  };

  const clearConversations = async (): Promise<void> => {
    const storage = getStorage();
    await Promise.all([storage.clear("conversations"), storage.clear("messages"), storage.clear("blobs"), storage.clear("folders")]);
    await reloadStores();
  };

  const clearKeys = async (): Promise<void> => {
    await getVault().clear();
    const storage = getStorage();
    await storage.putMany("providers", providers.map((provider) => ({ ...provider, keyHint: undefined, health: "not_tested" as const })));
    await reloadStores();
  };

  const clearEverything = async (): Promise<void> => {
    await Promise.all(STORE_NAMES.map((store) => getStorage().clear(store)));
    await getVault().clear();
    await reloadStores();
  };

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-display text-lg font-semibold">{t("Where your data goes")}</h2>
        <dl className="mt-1 divide-y divide-border">
          <Answer question={t("Where your API key is stored")}>
            {t("In this browser only, in IndexedDB, encrypted with a key the browser holds and page scripts can't export. NEXA has no server-side copy, and it isn't in backups unless you ask.")}</Answer>
          <Answer question={t("Where requests are sent")}>
            {t("Straight from your browser to the provider you chose. If you turn on the relay for a provider, those requests pass through this site's server on the way. The relay keeps nothing, and you can see below which providers use it.")}</Answer>
          <Answer question={t("Which data stays local")}>{t("Conversations, files, settings, prompts, keys and usage figures. There are no analytics and no accounts.")}</Answer>
          <Answer question={t("Which data leaves the browser")}>
            {t("What you send to a model: your messages, the conversation so far, attachments and system instructions. It goes to that provider and falls under their privacy policy. Generating a chat title sends your first message too, and you can turn that off in Settings. If you dictate, your browser's speech service hears the audio, which in Chrome means Google. NEXA doesn't receive it.")}</Answer>
        </dl>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">{t("Your routes right now")}</h2>
        <RouteMap />
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">{t("What this doesn't protect against")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t("Anyone with access to this browser profile can use your keys and read your chats. Malicious browser extensions can too. On a shared computer, clear your data when you finish.")}</p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{t("Your data")}</h2>
          <Button size="s" onClick={() => router.push("/settings/data")}>
            {t("Export my data")}</Button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          <DangerRow title={t("Conversations")} description={t("Removes every chat, message, file and folder from this browser.")} label={t("Clear conversations")} onConfirm={clearConversations} />
          <DangerRow title={t("API keys")} description={t("Removes every stored key. Providers stay, without their keys.")} label={t("Clear API keys")} onConfirm={clearKeys} />
          <DangerRow title={t("Everything")} description={t("Removes all NEXA data from this browser, including settings.")} label={t("Clear local data")} onConfirm={clearEverything} />
        </ul>
      </section>
    </div>
  );
}
