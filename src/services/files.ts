import { createId } from "@/lib/ids";
import type { Attachment, AttachmentKind } from "@/types";
import { t } from "@/i18n";
import { withBase } from "@/lib/base-path";

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * MB;
export const MAX_FILE_BYTES = 32 * MB;
export const MAX_EXTRACTED_CHARS = 500_000;

interface FileType {
  kind: AttachmentKind;
  mimeType: string;
}

const EXTENSIONS: Record<string, FileType> = {
  png: { kind: "image", mimeType: "image/png" },
  jpg: { kind: "image", mimeType: "image/jpeg" },
  jpeg: { kind: "image", mimeType: "image/jpeg" },
  webp: { kind: "image", mimeType: "image/webp" },
  pdf: { kind: "pdf", mimeType: "application/pdf" },
  txt: { kind: "text", mimeType: "text/plain" },
  md: { kind: "text", mimeType: "text/markdown" },
  json: { kind: "text", mimeType: "application/json" },
  csv: { kind: "text", mimeType: "text/csv" },
  docx: { kind: "text", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};

export const ACCEPTED_FILES = Object.keys(EXTENSIONS).map((extension) => `.${extension}`).join(",");

const IMAGE_FROM_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Magic numbers. The file's content decides, not its name. */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};

export class FileRejectedError extends Error {}

export function detectFileType(name: string, mimeType: string): FileType | undefined {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const fromExtension = EXTENSIONS[extension];
  if (fromExtension) return fromExtension;
  const fromMime = IMAGE_FROM_MIME[mimeType];
  return fromMime ? EXTENSIONS[fromMime] : undefined;
}

function formatLimit(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}

async function readHeader(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

async function extractPdfText(file: Blob): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = withBase("/pdf.worker.min.mjs");
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const document = await task.promise;

  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(text.trim());
  }
  await task.destroy();
  return pages.filter(Boolean).join("\n\n");
}

async function extractDocxText(file: Blob): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => entry.name === "word/document.xml",
  });
  const xml = archive["word/document.xml"];
  if (!xml) throw new FileRejectedError("This .docx file has no readable document.");

  const parsed = new DOMParser().parseFromString(strFromU8(xml), "application/xml");
  const paragraphs = [...parsed.getElementsByTagName("w:p")];
  return paragraphs
    .map((paragraph) => [...paragraph.getElementsByTagName("w:t")].map((node) => node.textContent ?? "").join(""))
    .filter((text) => text.length > 0)
    .join("\n");
}

async function extractText(file: File, type: FileType): Promise<string> {
  if (type.kind === "pdf") return extractPdfText(file);
  if (type.mimeType.includes("wordprocessingml")) return extractDocxText(file);
  return file.text();
}

export interface ProcessedFile {
  attachment: Attachment;
  /** Kept for images and PDFs, which some models read natively. */
  blob?: Blob;
  warning?: string;
}

/** Validates and reads a file entirely in the browser. Nothing is uploaded here. */
export async function processFile(file: File): Promise<ProcessedFile> {
  const type = detectFileType(file.name, file.type);
  if (!type) throw new FileRejectedError(t("{0}: this file type isn't supported.", { 0: file.name }));

  const limit = type.kind === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size > limit) throw new FileRejectedError(t("{0} is larger than {1}.", { 0: file.name, 1: formatLimit(limit) }));
  if (file.size === 0) throw new FileRejectedError(t("{0} is empty.", { 0: file.name }));

  const signature = SIGNATURES[type.mimeType];
  if (signature && !signature(await readHeader(file))) {
    throw new FileRejectedError(t("{0} doesn't match its file type.", { 0: file.name }));
  }

  const name = file.name || `pasted-image.${IMAGE_FROM_MIME[type.mimeType] ?? "png"}`;
  const attachment: Attachment = { id: createId("att"), name, mimeType: type.mimeType, size: file.size, kind: type.kind };
  if (type.kind === "image") return { attachment, blob: file };

  let text: string;
  try {
    text = await extractText(file, type);
  } catch (caught) {
    if (caught instanceof FileRejectedError) throw caught;
    throw new FileRejectedError(t("{0} couldn't be read.", { 0: file.name }));
  }

  let warning: string | undefined;
  if (text.length > MAX_EXTRACTED_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_CHARS);
    warning = `${name} is long, so only the first ${MAX_EXTRACTED_CHARS.toLocaleString("en")} characters will be sent.`;
  }
  if (type.kind === "pdf" && !text.trim()) {
    warning = `${name} has no selectable text. Only models that read PDFs natively can see it.`;
  }

  return { attachment: { ...attachment, extractedText: text }, blob: type.kind === "pdf" ? file : undefined, warning };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
