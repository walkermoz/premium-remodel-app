import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa-install";
import "./globals.css";
import "./theme.css";
import "./quotes-payments.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./team-map.css";
import { ThemeController } from "@/components/theme-controls";
import { themeInitScript } from "@/lib/theme";
export const metadata: Metadata = {
  title: "ServiceBuddy",
  applicationName: "ServiceBuddy",
  appleWebApp: {
    capable: true,
    title: "ServiceBuddy",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/servicebuddy-apple.png" },
  description: "The shared workspace for service businesses and field teams.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#173d52",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeController />
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
