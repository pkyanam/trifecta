import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "trifecta — belweave",
  description: "trifecta is a family of ai coding agent applications built for desktop and mobile.",
  metadataBase: new URL("https://trifecta.belweave.com"),
  openGraph: {
    title: "trifecta — belweave",
    description: "trifecta is a family of ai coding agent applications built for desktop and mobile.",
    type: "website",
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="min-h-full flex flex-col bg-[#050505] text-[#ececec]">
        {children}
      </body>
    </html>
  );
}
