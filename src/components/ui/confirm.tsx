"use client";

import { create } from "zustand";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { t } from "@/i18n";

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
}

const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }));

/** Promise-based confirmation, so a call site reads as one line. */
export function confirmAction(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ request: { ...options, resolve } });
  });
}

export function ConfirmHost() {
  const request = useConfirmStore((state) => state.request);

  const finish = (confirmed: boolean): void => {
    request?.resolve(confirmed);
    useConfirmStore.setState({ request: null });
  };

  return (
    <Dialog
      open={request !== null}
      onClose={() => finish(false)}
      title={request?.title ?? ""}
      size="s"
      footer={
        <>
          <Button onClick={() => finish(false)}>{t("Cancel")}</Button>
          <Button variant={request?.danger ? "danger" : "primary"} onClick={() => finish(true)}>
            {request?.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{request?.message}</p>
    </Dialog>
  );
}
