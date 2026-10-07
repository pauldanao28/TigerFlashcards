import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Focus Game — Japanese Stroop Challenge",
  description:
    "Test your Japanese reading speed with the FlashKado Focus game. A 30-second or 60-second Stroop color-word challenge using Japanese vocabulary.",
  keywords: ["Japanese game", "Stroop effect", "Japanese reading speed", "learn Japanese game"],
};

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
