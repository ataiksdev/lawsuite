import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { HighContrastEffect } from "@/components/shared/high-contrast-effect";

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lawmate - Legal Operations & Practice Management",
  description: "Next-generation legal operations and practice management platform. Streamline matter management, client intake, task tracking, secure document drives, and team collaboration for modern law firms and legal departments.",
  keywords: ["Lawmate", "legal management", "law firm", "practice management", "legal operations", "matter management", "case management", "client management"],
  authors: [{ name: "Lawmate Team" }],
  openGraph: {
    title: "Lawmate - Legal Operations & Practice Management",
    description: "Streamline your legal practice with Lawmate. Built for modern high-performing law firms.",
    type: "website",
  },
};

// The desktop build runs on a client's own machine with no Vercel hosting
// behind it — there's nothing for Vercel Analytics to report to, and a
// locally-installed app shouldn't phone home by default.
const isDesktopBuild = process.env.NEXT_PUBLIC_DESKTOP_BUILD === "1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sourceSerif.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <HighContrastEffect />
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
        {!isDesktopBuild && <Analytics />}
      </body>
    </html>
  );
}
