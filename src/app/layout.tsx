import type { Metadata } from "next";
import { Karla, Sora } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";

const sora = Sora({
  variable: "--font-heading",
  subsets: ["latin"],
});

const karla = Karla({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Indikan",
  description: "A lightweight kanban board for indie product development.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${karla.variable} antialiased`}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
