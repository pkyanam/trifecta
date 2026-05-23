import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

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
    icon: "/trifectaAppLogo.png",
    apple: "/trifectaAppLogo.png",
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
        className="h-full"
      >
        <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-primary/20">
          <ThemeProvider
            attribute="class"
            forcedTheme="dark"
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
