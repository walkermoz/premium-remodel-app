import type { Metadata } from "next";
import BrowserRoomScan from "./browser-room-scan";

export const metadata: Metadata = {
  title: "Room scan | Premium Remodel",
  description: "Capture room measurements for a Premium Remodel quote.",
  robots: { index: false, follow: false },
};

export default async function RoomScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <BrowserRoomScan token={token} />;
}
