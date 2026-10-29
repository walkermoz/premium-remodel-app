import { requireOptionalNativeModule } from "expo-modules-core";

export type RoomScanCapture = {
  schemaVersion: 1;
  roomName: string;
  capturedAt: string;
  device: {
    model: string;
    systemName: string;
    systemVersion: string;
  };
  measurements: {
    floorAreaSqFt: number;
    wallAreaSqFt: number;
    ceilingHeightFt: number;
    perimeterFt: number;
    widthFt: number;
    depthFt: number;
    doors: number;
    windows: number;
    openings: number;
  };
  surfaces: Array<{
    id: string;
    kind: "wall" | "door" | "window" | "opening" | "object";
    widthFt: number;
    heightFt: number;
    depthFt: number;
    confidence: "low" | "medium" | "high";
  }>;
};

export type RoomScanResult = {
  modelUri: string;
  previewUri: string;
  capture: RoomScanCapture;
};

type RoomPlanScannerNative = {
  isSupported(): Promise<boolean>;
  startScan(roomName: string): Promise<RoomScanResult>;
};

export default requireOptionalNativeModule<RoomPlanScannerNative>(
  "RoomPlanScanner",
);
