import "./src/background-location";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import FieldApp from "./src/components/FieldApp";
import LoginScreen from "./src/components/LoginScreen";
import { hasConfiguration } from "./src/lib/config";
import { supabase } from "./src/lib/supabase";
import { colors } from "./src/theme";
import RoomScanFlow from "./src/components/RoomScanFlow";

type RoomScanLink = { token: string; server: string };

function parseRoomScanLink(value: string | null): RoomScanLink | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "premiumremodelfield:" || url.hostname !== "room-scan")
      return null;
    const token = url.searchParams.get("token") || "";
    const server = new URL(url.searchParams.get("server") || "");
    if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
    if (server.protocol !== "https:" && !__DEV__) return null;
    return { token, server: server.origin };
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [roomScan, setRoomScan] = useState<RoomScanLink | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const parsed = parseRoomScanLink(url);
      if (parsed) setRoomScan(parsed);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const parsed = parseRoomScanLink(url);
      if (parsed) setRoomScan(parsed);
    });
    return () => subscription.remove();
  }, []);

  if (!hasConfiguration()) {
    return (
      <SafeAreaProvider>
        <View style={styles.config}>
          <Text style={styles.configTitle}>App setup needed</Text>
          <Text style={styles.configText}>
            Add the Premium Remodel Supabase values to the mobile build
            environment.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {roomScan ? (
        <RoomScanFlow
          token={roomScan.token}
          server={roomScan.server}
          onClose={() => setRoomScan(null)}
        />
      ) : session === undefined ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.blue} size="large" />
        </View>
      ) : session ? (
        <FieldApp />
      ) : (
        <LoginScreen />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  config: {
    flex: 1,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  configTitle: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  configText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
});
