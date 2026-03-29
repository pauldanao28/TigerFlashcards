"use client";
import Auth from "@/components/Auth";

export default function LoginPage() {
  return (
    // Added 'fixed' and 'inset-0' with 'overscroll-none'
    // This creates a rigid frame that the browser cannot push.
    <div className="fixed inset-0 h-[100dvh] w-screen bg-slate-50 overflow-hidden overscroll-none touch-none">
      <Auth />
    </div>
  );
}
