import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";

// Kanit is not a variable font, so the weights we actually use have to be
// listed. `thai` is the subset that matters most here — every summary, legend
// and place name in this app is Thai.
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ถามภัยพิบัติ | askme-disaster",
  description:
    "ถามหาข้อมูลน้ำท่วม ไฟป่า และภัยแล้งในประเทศไทยด้วยภาษาธรรมชาติ ผ่าน STAC API ของ GISTDA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
