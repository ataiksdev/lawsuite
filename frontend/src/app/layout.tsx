import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
        <Analytics />
      </body>
    </html>
  );
}
