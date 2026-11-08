"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { formatBytes } from "@/services/files";
import { getStorage } from "@/storage";
import type { Attachment } from "@/types";

function StoredImage({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    void getStorage()
      .get("blobs", attachment.id)
      .then((record) => {
        if (cancelled || !record) return;
        objectUrl = URL.createObjectURL(record.blob);
        setUrl(objectUrl);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (!url) return <div className="skeleton h-32 w-40" />;
  // eslint-disable-next-line @next/next/no-img-element -- local blob URL, next/image can't optimise it
  return <img src={url} alt={attachment.name} className="max-h-64 max-w-full rounded-md object-contain" />;
}

export function AttachmentList({ attachments }: { attachments: readonly Attachment[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map((attachment) =>
        attachment.kind === "image" ? (
          <StoredImage key={attachment.id} attachment={attachment} />
        ) : (
          <div key={attachment.id} className="flex max-w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 truncate text-[0.8125rem]">{attachment.name}</span>
            <span className="tabular shrink-0 text-xs text-muted">{formatBytes(attachment.size)}</span>
          </div>
        ),
      )}
    </div>
  );
}
