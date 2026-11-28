"use client";
import { useEffect, useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";

// Generate a share image ONLY after a deliberate Share tap. Some browsers
// (notably iOS Safari) may require a second tap to open the native share sheet
// once asynchronous image generation has completed; keep the image ready.
export default function ShareButton({
  params,
  caption,
  className = "",
  preview = false,
}: {
  params: Record<string, string | number>;
  caption: string;
  className?: string;
  preview?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

  // Invalidate an old share card when switching between achievements.
  // This effect deliberately does not generate or prefetch anything.
  useEffect(() => {
    setFile(null);
    setShareUrl("");
  }, [query]);

  useEffect(() => {
    if (!preview || !file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, preview]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const sharePrepared = async (image: File, link: string, justGenerated: boolean) => {
    const text = `${caption} ${link}`;
    if (navigator.canShare?.({ files: [image] })) {
      try {
        await navigator.share({ files: [image], text });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") return;
        // On iOS the async generation can consume the tap's transient user
        // activation. A second tap (now with the file cached) shares normally.
        if (justGenerated && name === "NotAllowedError") {
          flash("Image ready — tap Share again");
        } else {
          flash("Couldn't open sharing — tap Share again");
        }
      }
      return;
    }

    // No native file share: download the generated image instead.
    const href = URL.createObjectURL(image);
    const a = document.createElement("a");
    a.href = href;
    a.download = image.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    try {
      await navigator.clipboard.writeText(text);
      flash("Image saved · caption & link copied");
    } catch {
      flash("Image saved");
    }
  };

  const handleShare = async () => {
    if (generating) return;
    if (file) {
      await sharePrepared(file, shareUrl, false);
      return;
    }

    setGenerating(true);
    setToast(null);
    try {
      // The request starts here, never on mount or when opening a modal.
      const response = await authedFetch(`/api/og/share?${query}`);
      if (!response.ok) throw new Error(`Share image HTTP ${response.status}`);
      const blob = await response.blob();
      const image = new File([blob], "flashkado.png", { type: "image/png" });
      const link = response.headers.get("X-Share-Url") || window.location.origin;
      setFile(image);
      setShareUrl(link);
      await sharePrepared(image, link, true);
    } catch (error) {
      console.error("Share image generation failed:", error);
      flash("Couldn't generate image — try again");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="relative w-full">
      {preview && (
        <div className="mb-4 mx-auto w-full max-w-[220px] aspect-[9/16] rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Your share card" className="w-full h-full object-cover" />
          ) : generating ? (
            <Loader2 size={20} className="animate-spin text-slate-300" />
          ) : (
            <p className="px-5 text-center text-xs font-bold text-slate-400">
              Tap Share to generate your image
            </p>
          )}
        </div>
      )}
      <button
        onClick={handleShare}
        disabled={generating}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-60 ${className}`}
      >
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
        {generating ? "Generating image…" : "Share"}
      </button>
      {toast && (
        <p role="status" className="absolute left-0 right-0 -bottom-6 text-center text-[10px] font-bold text-slate-400">{toast}</p>
      )}
    </div>
  );
}
