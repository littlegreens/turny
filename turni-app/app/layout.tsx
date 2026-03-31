import type { Metadata } from "next";
import { Sue_Ellen_Francisco, Titillium_Web } from "next/font/google";
import "bootstrap-italia/dist/css/bootstrap-italia.min.css";
import "./globals.css";
import { AppToastProvider } from "@/components/app-toast-provider";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  weight: ["300", "400", "600", "700"],
  subsets: ["latin"],
});

const sueEllen = Sue_Ellen_Francisco({
  variable: "--font-sue-ellen",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Turny",
  description: "Gestione turni semplice per team e PMI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${titillium.variable} ${sueEllen.variable} h-full antialiased`}
    >
      <body className="min-h-full d-flex flex-column">
        <AppToastProvider>{children}</AppToastProvider>
      </body>
    </html>
  );
}
