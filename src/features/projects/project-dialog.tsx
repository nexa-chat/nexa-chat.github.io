"use client";

import { FileText, LoaderCircle, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { formatBytes, processFile } from "@/services/files";
import type { Attachment, Folder } from "@/types";
import { useChatStore } from "../chat/chat-store";
import { t } from "@/i18n";

/** Text that every chat in a project starts with. Above this, sending it each time gets costly. */
const MAX_PROJECT_CHARACTERS = 120_000;

const TEXT_FILES = ".txt,.md,.markdown,.json,.csv,.pdf,.docx,text/plain,text/markdown,application/json,text/csv,application/pdf";

function charactersOf(files: readonly Attachment[]): number {
  return files.reduce((sum, file) => sum + (file.extractedText?.length ?? 0), 0);
}

/**
 * A project is a folder with its own instructions and files. Every chat inside it starts from
 * them: they are added to the system prompt of each request, read in this browser only.
 */
export function ProjectDialog({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const updateFolder = useChatStore((state) => state.updateFolder);
  const [name, setName] = useState(folder.name);
  const [instructions, setInstructions] = useState(folder.instructions ?? "");
  const [files, setFiles] = useState<Attachment[]>(folder.files ?? []);
  const [reading, setReading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const size = charactersOf(files) + instructions.length;

  const addFiles = async (list: FileList | null): Promise<void> => {
    if (!list?.length) return;
    setReading(true);
    const added: Attachment[] = [];
    for (const file of list) {
      try {
        const { attachment, warning } = await processFile(file);
        if (attachment.kind === "image") {
          toast.warning(t("{0}: projects keep text files. Attach images to a message instead.", { 0: file.name }));
          continue;
        }
        if (warning) toast.warning(warning);
        added.push(attachment);
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : t("{0} couldn't be read.", { 0: file.name }));
      }
    }
    setFiles((current) => [...current, ...added]);
    setReading(false);
  };

  const save = async (): Promise<void> => {
    await updateFolder(folder.id, { name: name.trim() || folder.name, instructions: instructions.trim() || undefined, files: files.length > 0 ? files : undefined });
    toast.success(t("Project saved."));
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("Project")}
      description={t("Every chat in this project starts from these instructions and files.")}
      footer={
        <>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={size > MAX_PROJECT_CHARACTERS} onClick={() => void save()}>
            {t("Save project")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("Name")} htmlFor="project-name">
          <Input id="project-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t("Instructions")} htmlFor="project-instructions" hint={t("For example: who you are, the stack you use, the tone you want. Added to this chat's own instructions.")}>
          <Textarea id="project-instructions" rows={5} value={instructions} placeholder={t("This project is a Next.js app. Answer with TypeScript, and keep explanations short.")} onChange={(event) => setInstructions(event.target.value)} />
        </Field>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.8125rem] font-medium">{t("Files")}</span>
            <Button size="s" disabled={reading} onClick={() => picker.current?.click()}>
              {reading ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {t("Add files")}</Button>
            <input ref={picker} type="file" multiple accept={TEXT_FILES} className="hidden" onChange={(event) => void addFiles(event.target.files).then(() => (event.target.value = ""))} />
          </div>
          {files.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong px-4 py-5 text-center text-sm text-muted">{t("Text, Markdown, JSON, CSV, PDF or Word files. Their text is read here and sent with each message.")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{file.name}</span>
                    <span className="block text-xs text-muted">{formatBytes(file.size)}</span>
                  </span>
                  <IconButton size="s" label={t("Remove {0}", { 0: file.name })} onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}>
                    <X className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <p className={`text-xs ${size > MAX_PROJECT_CHARACTERS ? "text-danger" : "text-muted"}`}>
            {size > MAX_PROJECT_CHARACTERS
              ? t("Too long to send with every message: {0}k of {1}k characters. Remove a file.", { 0: Math.round(size / 1000), 1: MAX_PROJECT_CHARACTERS / 1000 })
              : t("About {0} tokens are sent with each message in this project.", { 0: Math.ceil(size / 4).toLocaleString() })}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
