import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { UploadGuardProvider } from "@/context/UploadGuardContext";
import { AlertProvider } from "@/context/AlertContext";
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
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`,
          }}
        />
      </head>
      <body className="antialiased bg-slate-50 text-slate-900">
        <AuthProvider>
          <AlertProvider>
            <UploadGuardProvider>
              {children}
              <BottomNav />
            </UploadGuardProvider>
          </AlertProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
