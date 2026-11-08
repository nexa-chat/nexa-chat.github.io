"use client";

import { useEffect, useMemo, useState } from "react";
import { Segmented } from "@/components/ui/field";
import { formatCost, formatTokens } from "@/lib/params";
import { summarizeUsage, type UsagePeriod } from "@/services/usage";
import { getStorage } from "@/storage";
import type { Message } from "@/types";
import { t } from "@/i18n";

const COUNT = new Intl.NumberFormat();

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="text-[0.8125rem] text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-faint">{note}</p> : null}
    </div>
  );
}

/** What your answers used, from the token counts providers returned and the prices you entered. */
export function UsageSection() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [period, setPeriod] = useState<UsagePeriod>("month");

  useEffect(() => {
    void getStorage().getAll("messages").then(setMessages);
  }, []);

  const summary = useMemo(() => (messages ? summarizeUsage(messages, period) : null), [messages, period]);
  const top = summary?.byModel[0]?.tokens ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{t("Usage")}</h2>
        <Segmented<UsagePeriod>
          label={t("Period")}
          value={period}
          options={[
            { value: "month", label: t("This month") },
            { value: "all", label: t("All time") },
          ]}
          onChange={setPeriod}
        />
      </div>

      {summary ? (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Tile
              label={t("Estimated cost")}
              value={summary.totals.cost === undefined ? "—" : formatCost(summary.totals.cost)}
              note={summary.totals.unpriced > 0 ? `${COUNT.format(summary.totals.unpriced)} ${summary.totals.unpriced === 1 ? "answer" : "answers"} from models without prices` : undefined}
            />
            <Tile label={t("Tokens")} value={formatTokens(summary.totals.tokens)} />
            <Tile label={t("Answers")} value={COUNT.format(summary.totals.answers)} />
          </div>

          {summary.byModel.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-6 py-10 text-center text-sm text-muted">{period === "month" ? t("No answers yet this month.") : t("No answers yet.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="sr-only">{t("Usage by model")}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      {t("Model")}</th>
                    <th scope="col" className="w-[30%] px-4 py-2.5 font-medium">
                      <span className="sr-only">{t("Share of tokens")}</span>
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      {t("Answers")}</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      {t("Tokens")}</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      {t("Cost")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.byModel.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <span className="block font-medium">{row.model}</span>
                        {row.provider ? <span className="block text-xs text-muted">{row.provider}</span> : null}
                      </th>
                      <td className="px-4 py-3">
                        <span aria-hidden="true" className="block h-1.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]">
                          <span className="block h-full min-w-1 rounded-full bg-accent" style={{ width: `${top > 0 ? (row.tokens / top) * 100 : 0}%` }} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{COUNT.format(row.answers)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatTokens(row.tokens)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.cost === undefined ? "—" : formatCost(row.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[0.8125rem] text-muted">{t("Tokens are what each provider reported. Costs use the prices you entered for each model, in Models, so they are estimates. Nothing here leaves this browser.")}</p>
        </>
      ) : null}
    </div>
  );
}
