"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { FileRejectedError, processFile } from "@/services/files";
import type { Attachment, ModelCapabilities } from "@/types";
import { t } from "@/i18n";

export interface PendingAttachment {
  attachment: Attachment;
  blob?: Blob;
  /** Object URL for image previews. */
  previewUrl?: string;
}

const MAX_ATTACHMENTS = 10;

export function useAttachments(capabilities: ModelCapabilities | undefined, modelName: string | undefined) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [processing, setProcessing] = useState(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl)), []);

  const add = useCallback(
    async (files: readonly File[]) => {
      for (const file of files) {
        if (itemsRef.current.length + 1 > MAX_ATTACHMENTS) {
          toast.warning(t("You can attach up to {0} files.", { 0: MAX_ATTACHMENTS }));
          return;
        }
        if (file.type.startsWith("image/") && capabilities && !capabilities.supportsVision) {
          toast.warning(t("{0} can't read images. Pick a model with Vision.", { 0: modelName ?? "This model" }));
          continue;
        }
        setProcessing((count) => count + 1);
        try {
          const { attachment, blob, warning } = await processFile(file);
          const previewUrl = attachment.kind === "image" && blob ? URL.createObjectURL(blob) : undefined;
          setItems((current) => [...current, { attachment, blob, previewUrl }]);
          if (warning) toast.warning(warning);
        } catch (caught) {
          toast.error(caught instanceof FileRejectedError ? caught.message : t("{0} couldn't be read.", { 0: file.name }));
        } finally {
          setProcessing((count) => count - 1);
        }
      }
    },
    [capabilities, modelName],
  );

  const remove = useCallback((id: string) => {
    setItems((current) => {
      const target = current.find((item) => item.attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.attachment.id !== id);
    });
  }, []);

  /** Hands the list to the sender. Image previews stay valid until the page unloads. */
  const take = useCallback(() => {
    const taken = itemsRef.current;
    setItems([]);
    return taken;
  }, []);

  return { items, processing, add, remove, take };
}
