import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLUX — Codebase Architecture & Autonomous Synthesis",
  description:
    "Explore complex repository architectures, trace AST dependency networks, and solve issues autonomously with grounded AI agent synthesis.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased bg-[#f7f4ec] text-[#171817] min-h-screen selection:bg-[#df7d4c]/30 selection:text-[#171817]"
      >
        {children}
      </body>
    </html>
  );
}
