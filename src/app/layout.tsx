import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import BottomNav from "@/components/BottomNav";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flashkado.com";

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
    default: "FlashKado — Free AI Japanese Flashcards",
    template: "%s | FlashKado",
  },
  description:
    "Learn Japanese vocabulary faster with AI-powered flashcards and spaced repetition. Free JLPT N5–N1 study tool with friend streaks and smart card scheduling.",
  keywords: [
    "Japanese flashcards",
    "JLPT study",
    "learn Japanese",
    "spaced repetition Japanese",
    "JLPT N5 vocabulary",
    "JLPT N4 vocabulary",
    "free Japanese learning",
    "AI flashcards",
    "Japanese vocabulary app",
  ],
  authors: [{ name: "FlashKado" }],
  creator: "FlashKado",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "FlashKado",
    title: "FlashKado — Free AI Japanese Flashcards",
    description:
      "Learn Japanese vocabulary faster with AI-powered flashcards and spaced repetition. Free JLPT N5–N1 study tool.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FlashKado — AI Japanese Flashcards",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlashKado — Free AI Japanese Flashcards",
    description:
      "Learn Japanese vocabulary faster with AI-powered flashcards and spaced repetition. Free JLPT N5–N1 study tool.",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`,
          }}
        />
      </head>
      <body className="antialiased bg-slate-50 text-slate-900">
        <AuthProvider>
          <LanguageProvider>
            {children}
            <BottomNav />
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
