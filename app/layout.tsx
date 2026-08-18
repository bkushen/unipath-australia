import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "UniPath Australia | Find Your Australian Study Path",
  description: "Compare Australian universities, courses, total study costs, career outcomes and potential migration pathways for international students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
