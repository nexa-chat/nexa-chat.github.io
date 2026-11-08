"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { createId } from "@/lib/ids";
import { getStorage } from "@/storage";
import type { SavedPrompt } from "@/types";
import { t } from "@/i18n";

function PromptForm({ prompt, onSave, onClose }: { prompt?: SavedPrompt; onSave: (prompt: SavedPrompt) => void; onClose: () => void }) {
  const [name, setName] = useState(prompt?.name ?? "");
  const [description, setDescription] = useState(prompt?.description ?? "");
  const [text, setText] = useState(prompt?.prompt ?? "");

  const save = (): void => {
    const now = Date.now();
    onSave({ id: prompt?.id ?? createId("prm"), name: name.trim(), description: description.trim(), prompt: text, createdAt: prompt?.createdAt ?? now, updatedAt: now });
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label={t("Name")} htmlFor="prompt-name">
        <Input id="prompt-name" value={name} placeholder={t("Coding Expert")} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={t("Description")} htmlFor="prompt-desc">
        <Input id="prompt-desc" value={description} placeholder={t("For code reviews")} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label={t("Prompt")} htmlFor="prompt-text">
        <Textarea id="prompt-text" rows={7} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("Cancel")}</Button>
        <Button variant="primary" disabled={!name.trim() || !text.trim()} onClick={save}>
          {t("Save prompt")}</Button>
      </div>
    </div>
  );
}

export function PromptLibrary() {
  const [prompts, setPrompts] = useState<SavedPrompt[] | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; prompt?: SavedPrompt }>({ open: false });

  useEffect(() => {
    void getStorage().getAll("prompts").then(setPrompts);
  }, []);

  const save = async (prompt: SavedPrompt): Promise<void> => {
    await getStorage().put("prompts", prompt);
    setPrompts((current) => [...(current ?? []).filter((item) => item.id !== prompt.id), prompt]);
    setEditing({ open: false });
    toast.success(t("Prompt saved."));
  };

  const remove = async (prompt: SavedPrompt): Promise<void> => {
    const confirmed = await confirmAction({ title: t("Delete \"{0}\"?", { 0: prompt.name }), message: t("This prompt will be removed from your library."), confirmLabel: t("Delete prompt"), danger: true });
    if (!confirmed) return;
    await getStorage().delete("prompts", prompt.id);
    setPrompts((current) => current?.filter((item) => item.id !== prompt.id) ?? null);
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("My prompts")}</h2>
          <p className="text-sm text-muted">{t("Reusable system instructions, available from any chat.")}</p>
        </div>
        <Button onClick={() => setEditing({ open: true })}>
          <Plus className="size-4" />
          {t("New prompt")}</Button>
      </div>

      {prompts?.length === 0 ? <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">{t("No saved prompts yet.")}</p> : null}
      {prompts && prompts.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">{prompt.name}</p>
                {prompt.description ? <p className="truncate text-[0.8125rem] text-muted">{prompt.description}</p> : null}
              </div>
              <Button size="s" onClick={() => setEditing({ open: true, prompt })}>
                {t("Edit")}</Button>
              <Button size="s" variant="danger" onClick={() => void remove(prompt)}>
                {t("Delete")}</Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={editing.open} onClose={() => setEditing({ open: false })} title={editing.prompt ? t("Edit prompt") : t("New prompt")}>
        {editing.open ? <PromptForm key={editing.prompt?.id ?? "new"} prompt={editing.prompt} onSave={(prompt) => void save(prompt)} onClose={() => setEditing({ open: false })} /> : null}
      </Dialog>
    </section>
  );
}
