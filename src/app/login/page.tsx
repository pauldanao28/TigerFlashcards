import type { Metadata } from "next";
import Auth from "@/components/Auth";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in or create a free FlashKado account to start learning Japanese with AI flashcards, reading, listening, writing, and a chat tutor.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    // Added 'fixed' and 'inset-0' with 'overscroll-none'
    // This creates a rigid frame that the browser cannot push.
    <div className="fixed inset-0 h-[100dvh] w-screen bg-slate-50 overflow-hidden overscroll-none touch-none">
      <Auth />
    </div>
  );
}
