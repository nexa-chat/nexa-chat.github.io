import { Fragment } from "react";

/** Lets a long URL wrap after a slash, never in the middle of a word. */
export function UrlText({ url, className = "" }: { url: string; className?: string }) {
  return (
    <span className={`font-mono ${className}`}>
      {url.split(/(?<=\/)/).map((part, index) => (
        <Fragment key={`${index}-${part}`}>
          {part}
          <wbr />
        </Fragment>
      ))}
    </span>
  );
}
