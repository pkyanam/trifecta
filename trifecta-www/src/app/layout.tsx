import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trifecta | Cross-Platform AI Coding Agent Platform",
  description: "Chat with your AI coding agents, watch them work, review diffs, approve actions, and drive Git from iOS, Android, macOS, Windows, Linux, and Web.",
  metadataBase: new URL("https://trifecta.belweave.com"),
  openGraph: {
    title: "Trifecta | Cross-Platform AI Coding Agent Platform",
    description: "One interface, nine coding agents. Drive Git, approve actions, and review code from anywhere.",
    type: "website",
    url: "https://trifecta.belweave.com",
    siteName: "Trifecta",
  },
  icons: {
    icon: "/trifecta-logo.png",
    apple: "/trifecta-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} h-full`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-primary/20">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
