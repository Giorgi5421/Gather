import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Gather — your people, your moments", description: "A calmer place to stay connected." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
