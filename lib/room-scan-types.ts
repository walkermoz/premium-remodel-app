export type RoomScanSurfaceKind =
  "wall" | "door" | "window" | "opening" | "object";

export type RoomScanObjectCategory =
  | "bathtub"
  | "bed"
  | "cabinet"
  | "chair"
  | "dishwasher"
  | "fireplace"
  | "object"
  | "oven"
  | "refrigerator"
  | "shelf"
  | "sink"
  | "sofa"
  | "stairs"
  | "storage"
  | "stove"
  | "table"
  | "television"
  | "toilet"
  | "washerDryer";

export interface RoomScanDetectedObject {
  category: RoomScanObjectCategory;
  count: number;
}

export interface RoomScanMeasurements {
  floorAreaSqFt: number;
  wallAreaSqFt: number;
  ceilingHeightFt: number;
  perimeterFt: number;
  widthFt: number;
  depthFt: number;
  doors: number;
  windows: number;
  openings: number;
}

export interface RoomScanSurface {
  id: string;
  kind: RoomScanSurfaceKind;
  category?: RoomScanObjectCategory;
  widthFt: number;
  heightFt: number;
  depthFt: number;
  confidence: "low" | "medium" | "high";
}

export interface RoomScanCapture {
  schemaVersion: 1;
  roomName: string;
  capturedAt: string;
  device: {
    model: string;
    systemName: string;
    systemVersion: string;
  };
  measurements: RoomScanMeasurements;
  surfaces: RoomScanSurface[];
}

export interface RoomScanSummary {
  id: string;
  quoteId: string;
  roomName: string;
  capturedAt: string;
  createdAt: string;
  createdByName: string;
  device: RoomScanCapture["device"];
  measurements: RoomScanMeasurements;
  detectedObjects: RoomScanDetectedObject[];
  surfaceCount: number;
}
