// Root layout providing global metadata, styling, and tab favicon for FLUX.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLUX — Codebase Architecture & Autonomous Synthesis",
  description:
    "Explore complex repository architectures, trace AST dependency networks, and solve issues autonomously with grounded AI agent synthesis.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Renders the main document shell and child layout components.
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
