"use client";
import { useEffect, useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";

// Shares an achievement card (image from /api/og/share) through the native share
// sheet, so the user can pick IG Story, Facebook, LINE, etc. The image is fetched as
// soon as the button mounts, not on tap: iOS Safari only allows navigator.share()
// close to the tap itself, and waiting on a network request first loses that
// permission. Where file sharing isn't supported (most desktops), it downloads the
// image and copies the caption + link instead.
export default function ShareButton({
  params,
  caption,
  className = "",
  preview = false,
}: {
  params: Record<string, string | number>;
  caption: string;
  className?: string;
  // Show the generated card above the button (used when sharing from Home, where
  // there's no celebration screen around it).
  preview?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

  useEffect(() => {
    let cancelled = false;
    authedFetch(`/api/og/share?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        setShareUrl(res.headers.get("X-Share-Url") || window.location.origin);
        setFile(new File([blob], "flashkado.png", { type: "image/png" }));
        if (preview) setPreviewUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query, preview]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleShare = async () => {
    if (!file) return;
    const text = `${caption} ${shareUrl}`;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        // Link goes inside `text`, not `url` — some share targets drop the image
        // when a separate url is passed alongside files.
        await navigator.share({ files: [file], text });
      } catch (err) {
        if ((err as Error).name !== "AbortError") flash("Couldn't open sharing");
      }
      return;
    }
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(href);
    try {
      await navigator.clipboard.writeText(text);
      flash("Image saved · caption & link copied");
    } catch {
      flash("Image saved");
    }
  };

  if (failed) return preview ? <p className="text-center text-xs font-bold text-slate-400 py-6">Couldn&apos;t create the image. Try again later.</p> : null;

  return (
    <div className="relative w-full">
      {preview && (
        <div className="mb-4 mx-auto w-full max-w-[220px] aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Your share card" className="w-full h-full object-cover" />
          ) : (
            <Loader2 size={20} className="animate-spin text-slate-300" />
          )}
        </div>
      )}
      <button
        onClick={handleShare}
        disabled={!file}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-60 ${className}`}
      >
        {file ? <Share2 size={14} /> : <Loader2 size={14} className="animate-spin" />}
        {file ? "Share" : "Preparing…"}
      </button>
      {toast && (
        <p className="absolute left-0 right-0 -bottom-6 text-center text-[10px] font-bold text-slate-400">{toast}</p>
      )}
    </div>
  );
}
