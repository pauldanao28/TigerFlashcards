import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { UploadGuardProvider } from "@/context/UploadGuardContext";
import { AlertProvider } from "@/context/AlertContext";
import { FriendsProvider } from "@/context/FriendsContext";
import BottomNav from "@/components/BottomNav";
import AccountSetupGuard from "@/components/AccountSetupGuard";
import InstallPwaBanner from "@/components/InstallPwaBanner";
import Sidebar from "@/components/Sidebar";
import SidebarOffsetWrapper from "@/components/SidebarOffsetWrapper";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flashkado.app";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",          // enables env(safe-area-inset-*) for notch/home bar
  interactiveWidget: "resizes-content", // Android: keyboard resizes the layout viewport
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FlashKado — All-in-One AI Japanese Learning App",
    template: "%s | FlashKado",
  },
  description:
    "The only Japanese app you need: AI flashcards, reading, listening, writing, and an AI chat tutor, all built around spaced repetition. Free JLPT N5–N1 study tool from beginner to fluent.",
  keywords: [
    "Japanese flashcards",
    "learn Japanese",
    "AI Japanese tutor",
    "Japanese chatbot",
    "JLPT study",
    "spaced repetition Japanese",
    "JLPT N5 vocabulary",
    "JLPT N4 vocabulary",
    "Japanese reading practice",
    "Japanese listening practice",
    "Japanese writing practice",
    "Japanese grammar practice",
    "free Japanese learning",
    "all-in-one Japanese app",
    "AI flashcards",
    "Japanese vocabulary app",
  ],
  authors: [{ name: "FlashKado" }],
  creator: "FlashKado",
  verification: {
    google: "YIe9bCDYHHJ95eUlnm4IxV74W1i_kMirKOr6DspgtZE",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "FlashKado",
    title: "FlashKado — All-in-One AI Japanese Learning App",
    description:
      "AI flashcards, reading, listening, writing, and a chat tutor in one app. Free JLPT N5–N1 study tool with spaced repetition and friend streaks.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FlashKado — All-in-One AI Japanese Learning App",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlashKado — All-in-One AI Japanese Learning App",
    description:
      "AI flashcards, reading, listening, writing, and a chat tutor in one app. Free JLPT N5–N1 study tool with spaced repetition and friend streaks.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [{ url: "/logo.svg" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if ('serviceWorker' in navigator) {
                // register('/sw.js') alone can leave an app build stuck for up to 24h —
                // that's how long a browser may wait before even re-fetching sw.js to
                // check for a new STATIC_CACHE version, regardless of how many times
                // that version gets bumped. reg.update() forces an immediate check, both
                // right away and whenever the (often-backgrounded) PWA becomes visible
                // again — the moment a stale build is most likely to be sitting around.
                navigator.serviceWorker.register('/sw.js').then(function (reg) {
                  reg.update();
                  document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState === 'visible') reg.update();
                  });
                });
                // A new service worker taking over (it already calls skipWaiting +
                // clients.claim on activate) used to still leave the CURRENTLY OPEN page
                // running old JS until the user manually reopened the app a second time.
                // Reloading once here — guarded so it can only ever fire once per page
                // load — means an update is live after a single close/reopen instead of two.
                var reloaded = false;
                navigator.serviceWorker.addEventListener('controllerchange', function () {
                  if (reloaded) return;
                  reloaded = true;
                  window.location.reload();
                });
              }`,
            }}
          />
        )}
      </head>
      <body className="antialiased bg-slate-50 text-slate-900">
        <AuthProvider>
          <AlertProvider>
            <UploadGuardProvider>
              <FriendsProvider>
                <Sidebar />
                <SidebarOffsetWrapper>
                  {children}
                </SidebarOffsetWrapper>
                <BottomNav />
                <AccountSetupGuard />
                <InstallPwaBanner />
              </FriendsProvider>
            </UploadGuardProvider>
          </AlertProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
