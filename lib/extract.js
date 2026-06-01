/**
 * lib/extract.js — file-format detection + text extraction.
 *
 * The matrix parser (ingest.js) is built around a Word TABLE, which .docx
 * carries cleanly. .doc (legacy binary) and PDF don't, so for those we extract
 * plain text and let the AI structure it (ai-extract.js).
 *
 * Format is detected from magic bytes (not the filename), so a mislabelled
 * upload is still handled correctly. PDF/doc text libs are imported lazily so
 * a .docx-only install never has to load them — and so a missing optional dep
 * fails with a clear message instead of crashing the app at boot.
 */

const startsWith = (buf, sig) => buf.length >= sig.length && sig.every((b, i) => buf[i] === b);
const contains = (buf, sig) => buf.indexOf(Buffer.from(sig)) !== -1;

/** 'docx' | 'docx-truncated' | 'doc' | 'pdf' | 'csv' | 'unknown' */
export function detectFormat(buffer) {
  if (!buffer || !buffer.length) return "unknown";
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return "pdf";            // %PDF
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) return "doc";            // OLE2 (legacy .doc)
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {                        // PK.. — a ZIP (.docx)
    // A complete ZIP ends with the end-of-central-directory record; if it's
    // missing, the upload was truncated in transit (e.g. a proxy body limit).
    return contains(buffer, [0x50, 0x4b, 0x05, 0x06]) ? "docx" : "docx-truncated";
  }
  // No binary magic — plain text. Treat as CSV/TSV if the first line is delimited
  // and there's more than one line (a header + rows). Covers Google Sheet exports
  // and spreadsheet CSVs. Anything else stays 'unknown'.
  const head = buffer.slice(0, 4096).toString("utf8");
  if (head && !head.includes("\u0000")) {
    const firstLine = head.split(/\r?\n/)[0] || "";
    if ((firstLine.includes(",") || firstLine.includes("\t")) && /\r?\n/.test(head)) return "csv";
  }
  return "unknown";
}

export async function pdfToText(buffer) {
  let pdf;
  try {
    // Import the lib entry directly — the package root runs a debug harness
    // when required without a parent module.
    ({ default: pdf } = await import("pdf-parse/lib/pdf-parse.js"));
  } catch {
    throw new Error("PDF support isn't installed. Run `npm install` in the Node folder (adds pdf-parse), or upload a .docx.");
  }
  const data = await pdf(buffer);
  return data.text || "";
}

export async function docToText(buffer) {
  let WordExtractor;
  try {
    ({ default: WordExtractor } = await import("word-extractor"));
  } catch {
    throw new Error("Legacy .doc support isn't installed. Run `npm install` in the Node folder (adds word-extractor), or save the file as .docx and upload that.");
  }
  const doc = await new WordExtractor().extract(buffer);
  return doc.getBody() || "";
}

/** Cheap HTML→text for the docx AI-fallback (when the table can't be parsed). */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<\/(p|tr|div|h[1-6]|li|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<t[dh][^>]*>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
