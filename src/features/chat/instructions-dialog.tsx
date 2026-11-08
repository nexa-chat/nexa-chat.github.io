"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Segmented, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useActiveContext } from "@/hooks/use-active-model";
import { getStorage } from "@/storage";
import type { SavedPrompt, SystemPresetId } from "@/types";
import { useUiStore } from "../shell/ui-store";
import { useChatStore } from "./chat-store";
import { SYSTEM_PRESETS } from "./system-prompts";
import { t } from "@/i18n";

function InstructionsForm({ onClose }: { onClose: () => void }) {
  const { conversation } = useActiveContext();
  const draftPreset = useChatStore((state) => state.draftSystemPreset);
  const draftPrompt = useChatStore((state) => state.draftSystemPrompt);
  const updateConversation = useChatStore((state) => state.updateConversation);
  const setDraft = useChatStore((state) => state.setDraft);

  const [preset, setPreset] = useState<SystemPresetId>(conversation?.systemPreset ?? draftPreset ?? "default");
  const [prompt, setPrompt] = useState(conversation?.systemPrompt ?? draftPrompt ?? "");
  const [library, setLibrary] = useState<SavedPrompt[]>([]);

  useEffect(() => {
    void getStorage().getAll("prompts").then(setLibrary);
  }, []);

  const save = (): void => {
    if (conversation) void updateConversation(conversation.id, { systemPreset: preset, systemPrompt: prompt });
    else setDraft({ draftSystemPreset: preset, draftSystemPrompt: prompt });
    toast.success(t("Instructions saved."));
    onClose();
  };

  const presetText = SYSTEM_PRESETS.find((item) => item.id === preset)?.prompt;

  return (
    <div className="flex flex-col gap-4">
      <Segmented label={t("Instruction preset")} value={preset} options={SYSTEM_PRESETS.map(({ id, label }) => ({ value: id, label: t(label) }))} onChange={setPreset} />

      {preset === "custom" ? (
        <>
          {library.length > 0 ? (
            <Field label={t("From My prompts")} htmlFor="prompt-library">
              <Select
                id="prompt-library"
                value=""
                onChange={(event) => {
                  const found = library.find((item) => item.id === event.target.value);
                  if (found) setPrompt(found.prompt);
                }}
              >
                <option value="">{t("Choose a saved prompt")}</option>
                {library.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t("System instructions")} htmlFor="system-prompt">
            <Textarea id="system-prompt" rows={7} value={prompt} placeholder={t("You are a helpful assistant who…")} onChange={(event) => setPrompt(event.target.value)} />
          </Field>
        </>
      ) : (
        <p className="rounded-md bg-background-deep px-3 py-2.5 text-sm text-muted">
          {preset === "default" ? t("Uses the default instructions from Settings, under Chat. If there are none, the model gets no system prompt.") : presetText}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("Cancel")}</Button>
        <Button variant="primary" onClick={save}>
          {t("Save")}</Button>
      </div>
    </div>
  );
}

export function InstructionsDialog() {
  const open = useUiStore((state) => state.instructionsOpen);
  const setOpen = useUiStore((state) => state.setInstructionsOpen);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title={t("System instructions")} description={t("How the model should behave in this chat.")}>
      {open ? <InstructionsForm onClose={() => setOpen(false)} /> : null}
    </Dialog>
  );
}
