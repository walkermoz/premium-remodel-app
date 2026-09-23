import "./src/background-location";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import FieldApp from "./src/components/FieldApp";
import LoginScreen from "./src/components/LoginScreen";
import { hasConfiguration } from "./src/lib/config";
import { supabase } from "./src/lib/supabase";
import { colors } from "./src/theme";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
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
      {session === undefined ? (
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
