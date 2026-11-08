"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { fillTemplate, templateVariables } from "@/services/templates";
import { t } from "@/i18n";

function labelOf(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Asks for each {{variable}} of a prompt, then hands back the filled text. */
export function VariableDialog({ title, template, onDone, onClose }: { title: string; template: string; onDone: (text: string) => void; onClose: () => void }) {
  const names = templateVariables(template);
  const [values, setValues] = useState<Record<string, string>>({});

  const submit = (): void => onDone(fillTemplate(template, values));

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={t("Fill in the blanks. Anything left empty is simply left out.")}
      size="s"
      footer={
        <>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" type="submit" form="prompt-variables">
            {t("Insert")}</Button>
        </>
      }
    >
      <form
        id="prompt-variables"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {names.map((name, index) => (
          <Field key={name} label={labelOf(name)} htmlFor={`variable-${index}`}>
            <Input id={`variable-${index}`} data-autofocus={index === 0 ? true : undefined} autoComplete="off" value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />
          </Field>
        ))}
      </form>
    </Dialog>
  );
}
