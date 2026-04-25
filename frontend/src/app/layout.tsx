import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SpeedInsights } from '@vercel/speed-insights/next';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LegalOps - Legal Operations Management",
  description: "Nigerian legal operations management platform. Streamline matter management, task tracking, document handling, and team collaboration for law firms and legal departments.",
  keywords: ["LegalOps", "legal management", "law firm", "Nigeria", "legal operations", "matter management", "case management"],
  authors: [{ name: "LegalOps Team" }],
  openGraph: {
    title: "LegalOps - Legal Operations Management",
    description: "Streamline your legal practice with LegalOps. Built for Nigerian law firms.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
