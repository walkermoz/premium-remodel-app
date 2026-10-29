import { useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RoomPlanScanner, {
  type RoomScanCapture,
  type RoomScanResult,
} from "../../modules/room-plan-scanner";
import { colors } from "../theme";

type CaptureSession = {
  completed: boolean;
  expiresAt: string;
  quote: { name: string; address: string; customer: string };
  scan?: { roomName: string };
  uploads?: {
    model: { url: string; contentType: string };
    preview: { url: string; contentType: string };
    headers: Record<string, string>;
  };
};

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || "The room-scan session is unavailable.");
  return payload;
}

async function upload(
  target: { url: string; contentType: string },
  uri: string,
  headers: Record<string, string>,
) {
  const result = await FileSystem.uploadAsync(target.url, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { ...headers, "Content-Type": target.contentType },
  });
  if (result.status < 200 || result.status >= 300)
    throw new Error("The scan file could not be uploaded. Try again.");
}

export default function RoomScanFlow({
  token,
  server,
  onClose,
}: {
  token: string;
  server: string;
  onClose: () => void;
}) {
  const endpoint = `${server}/api/room-scans/capture/${encodeURIComponent(token)}`;
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [roomName, setRoomName] = useState("Room");
  const [result, setResult] = useState<RoomScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(endpoint, { headers: { Accept: "application/json" } }).then(
        responsePayload,
      ),
      RoomPlanScanner ? RoomPlanScanner.isSupported() : Promise.resolve(false),
    ])
      .then(([next, canScan]) => {
        if (!active) return;
        const capture = next as CaptureSession;
        setSession(capture);
        setSupported(canScan);
        if (capture.completed) setComplete(true);
      })
      .catch((cause) => {
        if (!active) return;
        setSupported(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "The room-scan session is unavailable.",
        );
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  async function capture() {
    if (!RoomPlanScanner || !roomName.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await RoomPlanScanner.startScan(roomName.trim()));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Scan cancelled.";
      if (!/cancel/i.test(message)) setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!session?.uploads || !result) return;
    setBusy(true);
    setError("");
    try {
      await Promise.all([
        upload(
          session.uploads.model,
          result.modelUri,
          session.uploads.headers,
        ),
        upload(
          session.uploads.preview,
          result.previewUri,
          session.uploads.headers,
        ),
      ]);
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.capture satisfies RoomScanCapture),
      }).then(responsePayload);
      setComplete(true);
      await Promise.allSettled([
        FileSystem.deleteAsync(result.modelUri, { idempotent: true }),
        FileSystem.deleteAsync(result.previewUri, { idempotent: true }),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The room scan could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!session && !error)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.blue} size="large" />
        <Text style={styles.muted}>Opening room scan…</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>QUOTE ROOM SCAN</Text>
          <Text style={styles.title}>
            {complete ? "Room added" : "Scan and measure a room"}
          </Text>
          {session && (
            <>
              <Text style={styles.quote}>{session.quote.name}</Text>
              <Text style={styles.muted}>{session.quote.address}</Text>
            </>
          )}
        </View>

        {complete ? (
          <View style={styles.completeCard}>
            <Text style={styles.completeIcon}>✓</Text>
            <Text style={styles.cardTitle}>
              {result?.capture.roomName || session?.scan?.roomName || "Room"} is
              attached to the quote
            </Text>
            <Text style={styles.muted}>
              Measurements, the floor plan, and the 3D model are available in
              ServiceBuddy.
            </Text>
            <Pressable style={styles.primary} onPress={onClose}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </View>
        ) : supported === false ? (
          <View style={styles.warning}>
            <Text style={styles.cardTitle}>LiDAR device required</Text>
            <Text style={styles.muted}>
              RoomPlan scanning works on LiDAR-equipped iPhone and iPad Pro
              models running iOS 16 or later.
            </Text>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Close</Text>
            </Pressable>
          </View>
        ) : result ? (
          <>
            <Image
              source={{ uri: result.previewUri }}
              style={styles.preview}
              resizeMode="contain"
            />
            <View style={styles.measurements}>
              <Metric
                label="Floor area"
                value={`${result.capture.measurements.floorAreaSqFt} sq ft`}
              />
              <Metric
                label="Wall area"
                value={`${result.capture.measurements.wallAreaSqFt} sq ft`}
              />
              <Metric
                label="Ceiling"
                value={`${result.capture.measurements.ceilingHeightFt} ft`}
              />
              <Metric
                label="Perimeter"
                value={`${result.capture.measurements.perimeterFt} ft`}
              />
            </View>
            <Text style={styles.reviewNote}>
              Review the floor plan now. Critical measurements should still be
              checked before materials are ordered.
            </Text>
            <Pressable
              style={[styles.primary, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void save()}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Add scan to quote</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              onPress={() => setResult(null)}
            >
              <Text style={styles.secondaryText}>Scan again</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.captureCard}>
            <Text style={styles.step}>1</Text>
            <Text style={styles.cardTitle}>Name this room</Text>
            <Text style={styles.muted}>
              Use a clear name so estimators can identify it in the quote.
            </Text>
            <TextInput
              style={styles.input}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="Primary bathroom"
              maxLength={120}
              autoCapitalize="words"
            />
            <View style={styles.instructions}>
              <Text>• Walk slowly around the full room.</Text>
              <Text>• Capture every wall, doorway, and window.</Text>
              <Text>• Keep mirrors and dark corners well lit.</Text>
            </View>
            <Pressable
              style={[
                styles.primary,
                (busy || !roomName.trim()) && styles.disabled,
              ]}
              disabled={busy || !roomName.trim()}
              onPress={() => void capture()}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Start RoomPlan scan</Text>
              )}
            </Pressable>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: colors.background,
  },
  content: { padding: 22, paddingBottom: 50 },
  header: { marginBottom: 22 },
  eyebrow: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    marginTop: 6,
  },
  quote: { color: colors.ink, fontWeight: "800", fontSize: 16, marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  captureCard: {
    padding: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  completeCard: {
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  warning: {
    padding: 22,
    borderWidth: 1,
    borderColor: colors.amber,
    backgroundColor: colors.surface,
  },
  completeIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#fff",
    backgroundColor: colors.green,
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 18,
  },
  step: {
    width: 34,
    height: 34,
    borderRadius: 17,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#fff",
    backgroundColor: colors.blue,
    fontWeight: "900",
    marginBottom: 14,
  },
  cardTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  input: {
    height: 52,
    paddingHorizontal: 14,
    marginTop: 20,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff",
    fontSize: 16,
  },
  instructions: { gap: 8, marginVertical: 20 },
  primary: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 20,
    backgroundColor: colors.blue,
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  secondary: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  preview: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#eef3f7",
    borderWidth: 1,
    borderColor: colors.line,
  },
  measurements: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  metric: {
    width: "50%",
    padding: 14,
    borderWidth: 0.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  metricLabel: { color: colors.muted, fontSize: 12 },
  metricValue: { color: colors.ink, fontSize: 17, fontWeight: "900", marginTop: 4 },
  reviewNote: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  error: {
    color: colors.red,
    backgroundColor: "#fff1f1",
    padding: 13,
    marginTop: 15,
    fontWeight: "700",
  },
});
