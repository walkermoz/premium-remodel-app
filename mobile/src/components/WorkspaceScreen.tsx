import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { appUrl } from "../lib/config";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function WorkspaceScreen() {
  const [sessionHeaders, setSessionHeaders] = useState<Record<
    string,
    string
  > | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) {
        setError("Your session expired. Sign in again.");
        return;
      }
      setSessionHeaders({
        Authorization: `Bearer ${data.session.access_token}`,
        "X-Supabase-Refresh-Token": data.session.refresh_token,
        "X-Premium-Remodel-App": "mobile",
      });
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const source = useMemo(
    () =>
      sessionHeaders
        ? {
            uri: `${appUrl}/api/mobile/session`,
            headers: sessionHeaders,
          }
        : undefined,
    [sessionHeaders],
  );

  if (!source || error)
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.errorTitle}>Workspace unavailable</Text>
            <Text style={styles.errorCopy}>{error}</Text>
            <Pressable
              onPress={() => {
                setError("");
                setSessionHeaders(null);
                setReloadKey((value) => value + 1);
              }}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.blue} size="large" />
        )}
      </View>
    );

  return (
    <WebView
      key={reloadKey}
      source={source}
      style={styles.webview}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      pullToRefreshEnabled
      allowsBackForwardNavigationGestures
      applicationNameForUserAgent="PremiumRemodelMobile/1.1"
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.blue} size="large" />
          <Text style={styles.loadingCopy}>Opening company workspace…</Text>
        </View>
      )}
      onError={() => setError("Check your connection and try again.")}
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode >= 400)
          setError("The company workspace could not be loaded.");
      }}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url.startsWith(appUrl) || request.url === "about:blank")
          return true;
        if (/^(tel|mailto):/i.test(request.url)) {
          void Linking.openURL(request.url);
          return false;
        }
        if (/^https?:/i.test(request.url)) {
          void Linking.openURL(request.url);
          return false;
        }
        return false;
      }}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingCopy: { color: colors.muted, fontSize: 13 },
  errorTitle: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  errorCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  retry: {
    height: 46,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: colors.navy,
    marginTop: 20,
  },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});
