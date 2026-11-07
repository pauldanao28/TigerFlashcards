import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

// Server-side metadata for the (client) join page, so a shared invite link unfurls
// in Messenger/LINE/WhatsApp/etc. with the inviter's name and a preview card.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.rpc("find_user_by_referral_code", { p_code: code });
  const name = data?.[0]?.full_name as string | undefined;

  const title = name ? `${name} invited you to FlashKado` : "Join me on FlashKado";
  const description = "Learn Japanese together — flashcards, quizzes, and streaks with friends.";
  const image = `/api/og/invite?code=${encodeURIComponent(code)}`;

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
