// Pure parsers for a finished Manus agent result. No I/O — unit-testable, and
// shared so the "did we get an edited image back?" logic can't drift between
// call sites.

export interface AttachmentLike {
  type?: string;
  filename?: string;
  url?: string;
  content_type?: string;
}

const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif)(?:[?#].*)?$/i;

/**
 * The edited-image attachment from a Manus result — LAST match wins (the agent
 * often attaches the source first, its output last). Accept it whether Manus
 * tags it `type:"image"`, gives it an `image/*` content-type, OR merely
 * names/links it with an image extension — real responses do only the last of
 * those often enough that requiring `type:"image"` silently drops results.
 */
export function pickImageAttachment<T extends AttachmentLike>(attachments: T[] | undefined): T | undefined {
  return [...(attachments || [])]
    .reverse()
    .find(
      (a) =>
        !!a?.url &&
        (a.type === "image" ||
          /^image\//i.test(a.content_type || "") ||
          IMG_EXT_RE.test(a.filename || "") ||
          IMG_EXT_RE.test(a.url || "")),
    );
}

/**
 * Did the agent's FINAL verdict say "nothing to do"? Only trust the token when
 * it stands alone / ends the reply — never a mid-reasoning mention such as
 * "this is not a NO_CHANGE_NEEDED case" (which would otherwise make us throw a
 * perfectly good translation away). Caller must also confirm there is no image.
 */
export function saidNoChange(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^NO[_ ]?CHANGE[_ ]?NEEDED\.?$/i.test(t)) return true;
  const tail = t.slice(-160);
  return /(^|[\s>*_"'`([-])NO[_ ]?CHANGE[_ ]?NEEDED\.?\s*$/i.test(tail);
}
