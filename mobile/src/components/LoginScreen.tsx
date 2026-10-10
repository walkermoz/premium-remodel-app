import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";

export default function LoginScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  function keepPasswordVisible() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 180);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.page}
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Image
            accessibilityLabel="Premium Remodel"
            source={require("../../assets/premium-remodel-logo.png")}
            resizeMode="contain"
            style={styles.logo}
          />

          <View style={styles.intro}>
            <Text style={styles.eyebrow}>COMPANY WORKSPACE</Text>
            <Text style={styles.title}>Everything your team needs.</Text>
            <Text style={styles.subtitle}>
              Projects, leads, quotes, schedules, contractors, and field work in
              one place.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Work email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              textContentType="username"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="you@premiumremodel.com"
              placeholderTextColor="#8A9AA6"
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordField}>
              <TextInput
                ref={passwordRef}
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                onFocus={keepPasswordVisible}
                onSubmitEditing={signIn}
                placeholder="Your password"
                placeholderTextColor="#8A9AA6"
                style={styles.passwordInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={8}
                style={styles.showButton}
              >
                <Text style={styles.showButtonText}>
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  scroll: { flex: 1 },
  page: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 20,
    paddingBottom: 32,
  },
  logo: { width: 226, height: 65 },
  intro: { marginTop: 42 },
  eyebrow: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    marginTop: 9,
    maxWidth: 340,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 350,
  },
  form: { marginTop: 28 },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
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
    marginBottom: 17,
  },
  passwordField: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  passwordInput: {
    flex: 1,
    height: "100%",
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 15,
  },
  showButton: {
    height: "100%",
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  showButtonText: { color: colors.blue, fontSize: 12, fontWeight: "900" },
  error: { color: colors.red, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  button: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.navy,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  privacy: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: "auto",
    paddingTop: 30,
  },
});
