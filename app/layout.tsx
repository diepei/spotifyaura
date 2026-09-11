import type { Metadata } from "next";
import { Bricolage_Grotesque, Roboto_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spotify Aura — See a song's streams",
  description: "Check the total number of streams for any Spotify song from its URL.",
  icons: {
    icon: "/flex-mark.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${robotoMono.variable}`}>
      <body>
        <div className="noise" aria-hidden="true" />
        <header>
          <Link className={`${bricolage.className} brand`} href="/" aria-label="Spotify Aura, home">
            <Image src="/flex-mark.svg" alt="" width={40} height={40} priority />
            <span>Spotify Aura</span>
          </Link>
        </header>
        {children}
        <footer className="developer-credit">
          Developed by{" "}
          <a href="https://github.com/diepei" target="_blank" rel="noreferrer">
            Diego Peinado
          </a>
        </footer>
      </body>
    </html>
  );
}
