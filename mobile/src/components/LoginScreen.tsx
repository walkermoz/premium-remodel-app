import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    const result = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (result.error) setError("Email or password is incorrect.");
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <View style={styles.roof} />
            <View style={styles.door} />
          </View>
          <View>
            <Text style={styles.brandTop}>PREMIUM</Text>
            <Text style={styles.brandBottom}>REMODEL</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>FIELD COMPANION</Text>
          <Text style={styles.title}>Your shift, mapped.</Text>
          <Text style={styles.subtitle}>
            Mark visits, capture leads, schedule quotes, and share your active
            work location.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Work email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@premiumremodel.com"
            placeholderTextColor="#8A9AA6"
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={signIn}
            placeholder="Your password"
            placeholderTextColor="#8A9AA6"
            style={styles.input}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={busy || !email.trim() || !password}
            onPress={signIn}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              (busy || !email.trim() || !password) && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.privacy}>
          Location sharing begins only when you tap Start shift and stops when
          you tap End shift.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, paddingHorizontal: 26, paddingTop: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: {
    width: 42,
    height: 42,
    backgroundColor: colors.blue,
    overflow: "hidden",
    position: "relative",
  },
  roof: {
    position: "absolute",
    width: 38,
    height: 38,
    backgroundColor: colors.background,
    transform: [{ rotate: "45deg" }],
    left: -8,
    top: 16,
  },
  door: {
    position: "absolute",
    width: 8,
    height: 9,
    backgroundColor: colors.blue,
    right: 5,
    bottom: 5,
  },
  brandTop: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 4,
  },
  brandBottom: { color: colors.ink, fontSize: 14, letterSpacing: 3 },
  intro: { marginTop: 76 },
  eyebrow: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    marginTop: 10,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 330,
  },
  form: { marginTop: 42 },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 15,
    marginBottom: 18,
  },
  error: { color: colors.red, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  button: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.navy,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  privacy: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: "auto",
    marginBottom: 22,
  },
});
