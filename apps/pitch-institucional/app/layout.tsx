import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import PitchRuntimeGuard from "./pitch-runtime-guard";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kino Campus — Pitch Institucional Interativo",
  description:
    "Apresentação institucional do Kino Campus em seis formatos: 5, 15 e 30 minutos, nos modos expositivo e interativo.",
  other: {
    "codex-preview": "development",
  },
  openGraph: {
    title: "Kino Campus — Toda a vida universitária em um só lugar",
    description: "Pitch institucional interativo para a Universidade Federal de Goiás.",
    type: "website",
  },
  icons: {
    icon: "/kino-campus-logo.svg",
    shortcut: "/kino-campus-logo.svg",
    apple: "/kino-campus-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${dmSans.variable} antialiased`}>
        <PitchRuntimeGuard />
        {children}
      </body>
    </html>
  );
}
