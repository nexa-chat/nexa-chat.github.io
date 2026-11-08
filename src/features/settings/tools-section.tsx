"use client";

import { LoaderCircle, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { createId } from "@/lib/ids";
import { forgetSession } from "@/services/mcp";
import { BUILT_IN_TOOLS, serverTools } from "@/services/tools/registry";
import { getVault } from "@/storage";
import type { McpServerConfig } from "@/types";
import { useSettingsStore } from "./settings-store";
import { t, tn } from "@/i18n";

type TestState = { phase: "idle" } | { phase: "testing" } | { phase: "done"; ok: true; tools: string[] } | { phase: "done"; ok: false; message: string };

function ServerRow({ server }: { server: McpServerConfig }) {
  const update = useSettingsStore((state) => state.update);
  const servers = useSettingsStore((state) => state.settings.mcpServers);
  const [test, setTest] = useState<TestState>({ phase: "idle" });

  const patch = (changes: Partial<McpServerConfig>): void => update({ mcpServers: servers.map((item) => (item.id === server.id ? { ...item, ...changes } : item)) });

  const runTest = async (): Promise<void> => {
    setTest({ phase: "testing" });
    try {
      const tools = await serverTools(server, true);
      setTest({ phase: "done", ok: true, tools: tools.map((tool) => tool.name) });
    } catch (caught) {
      setTest({ phase: "done", ok: false, message: caught instanceof Error ? caught.message : t("The server couldn't be reached.") });
    }
  };

  const remove = async (): Promise<void> => {
    await getVault().delete(`mcp_${server.id}`);
    forgetSession(server.id);
    update({ mcpServers: servers.filter((item) => item.id !== server.id) });
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-medium">{server.name}</p>
          <p className="truncate font-mono text-xs text-muted">{server.url}</p>
        </div>
        <Switch label={t("On")} checked={server.enabled} onChange={(enabled) => patch({ enabled })} />
        <Button size="s" disabled={test.phase === "testing"} onClick={() => void runTest()}>
          {test.phase === "testing" ? <LoaderCircle className="animate-spin" /> : null}
          {t("Test")}</Button>
        <IconButton size="s" label={t("Remove {0}", { 0: server.name })} onClick={() => void remove()}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      {test.phase === "done" ? (
        <p role="status" className={`mt-2 text-[0.8125rem] ${test.ok ? "text-muted" : "text-danger"}`}>
          {test.ok ? (test.tools.length > 0 ? tn(test.tools.length, "Connected. {count} tool: {names}", "Connected. {count} tools: {names}", { names: test.tools.join(", ") }) : t("Connected, but the server offers no tools.")) : t(test.message)}
        </p>
      ) : null}
    </li>
  );
}

function AddServer() {
  const update = useSettingsStore((state) => state.update);
  const servers = useSettingsStore((state) => state.settings.mcpServers);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [authorization, setAuthorization] = useState("");

  const valid = (() => {
    try {
      const parsed = new URL(url);
      return name.trim().length > 0 && (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    } catch {
      return false;
    }
  })();

  const add = async (): Promise<void> => {
    const server: McpServerConfig = { id: createId("mcp"), name: name.trim(), url: url.trim(), enabled: true, hasAuth: authorization.trim().length > 0 };
    if (server.hasAuth) await getVault().set(`mcp_${server.id}`, { apiKey: authorization.trim() });
    update({ mcpServers: [...servers, server] });
    setName("");
    setUrl("");
    setAuthorization("");
    toast.success(t("{0} added. Use Test to check it.", { 0: server.name }));
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-dashed border-border-strong p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void add();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Name")} htmlFor="mcp-name">
          <Input id="mcp-name" autoComplete="off" value={name} placeholder={t("My tools")} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t("URL")} htmlFor="mcp-url" hint={t("Streamable HTTP endpoint, https or localhost.")}>
          <Input id="mcp-url" type="url" autoComplete="off" spellCheck={false} className="font-mono" value={url} placeholder="https://mcp.example.com/mcp" onChange={(event) => setUrl(event.target.value)} />
        </Field>
      </div>
      <Field label={t("Authorization header (optional)")} htmlFor="mcp-auth" hint={t("For example Bearer and a token. Encrypted and kept in this browser.")}>
        <Input id="mcp-auth" type="password" autoComplete="off" value={authorization} placeholder={t("Bearer …")} onChange={(event) => setAuthorization(event.target.value)} />
      </Field>
      <Button type="submit" disabled={!valid} className="self-start">
        <Plus />
        {t("Add server")}</Button>
    </form>
  );
}

/** Which tools models may call: NEXA's own, run in the browser, and those of MCP servers. */
export function ToolsSection() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{t("Tools")}</h2>
        <p className="mt-1 text-sm text-muted">{t("Tools let a model look things up or act. They are only offered to models that support tools.")}</p>
      </div>

      <Switch
        label={t("Let models use tools")}
        description={t("NEXA's own tools run in your browser. Tools from an MCP server ask you before each use, unless you always allow them.")}
        checked={settings.toolsEnabled}
        onChange={(toolsEnabled) => update({ toolsEnabled })}
      />

      {settings.toolsEnabled ? (
        <>
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("Built in")}</h3>
            {BUILT_IN_TOOLS.map((tool) => (
              <Switch key={tool.id} label={t(tool.label)} description={t(tool.description)} checked={settings.builtinTools[tool.id] !== false} onChange={(on) => update({ builtinTools: { ...settings.builtinTools, [tool.id]: on } })} />
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("MCP servers")}</h3>
            <p className="text-[0.8125rem] text-muted">
              {t("Your browser talks to these servers directly. A server must allow this site's address (CORS) and expose the Mcp-Session-Id header, or the browser blocks it.")}</p>
            {settings.mcpServers.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {settings.mcpServers.map((server) => (
                  <ServerRow key={server.id} server={server} />
                ))}
              </ul>
            ) : null}
            <AddServer />
          </section>

          {settings.alwaysAllowedTools.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("Always allowed")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {settings.alwaysAllowedTools.map((name) => (
                  <li key={name} className="flex items-center gap-1 rounded-[0.625rem] border border-border py-0.5 pr-0.5 pl-2.5 font-mono text-xs">
                    {name}
                    <IconButton size="s" label={t("Ask again before {0}", { 0: name })} onClick={() => update({ alwaysAllowedTools: settings.alwaysAllowedTools.filter((item) => item !== name) })}>
                      <X className="size-3" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
