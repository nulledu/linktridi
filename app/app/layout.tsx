import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Tridi · Minhas Atividades",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tridi", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c0c0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh" }}>{children}</div>;
}
