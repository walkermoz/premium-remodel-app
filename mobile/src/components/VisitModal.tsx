import { useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme";
import type { DoorOutcome, VisitDraft } from "../types";

const outcomes: DoorOutcome[] = [
  "Not home",
  "Spoke — follow up",
  "Interested",
  "Not interested",
  "Lead captured",
];
const projects = [
  "Bathroom",
  "Kitchen",
  "Deck",
  "Shed",
  "Basement",
  "Attic",
  "Flooring",
  "Other",
];

function dateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function timeValue(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

type Props = {
  coordinate: { latitude: number; longitude: number } | null;
  initialAddress: string;
  onClose: () => void;
  onSave: (draft: VisitDraft) => Promise<void>;
};

export default function VisitModal({
  coordinate,
  initialAddress,
  onClose,
  onSave,
}: Props) {
  const [address, setAddress] = useState(initialAddress);
  const [outcome, setOutcome] = useState<DoorOutcome>("Not home");
  const [notes, setNotes] = useState("");
  const [createLead, setCreateLead] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleQuote, setScheduleQuote] = useState(false);
  const [quoteDate, setQuoteDate] = useState(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
    return next;
  });
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [quoteNotes, setQuoteNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSave = useMemo(
    () => Boolean(coordinate && address.trim() && !busy),
    [address, busy, coordinate],
  );

  async function save() {
    if (!coordinate || !address.trim()) return;
    if (createLead) {
      if (!firstName.trim())
        return setError("Enter the homeowner’s first name.");
      if (!phone.trim() && !email.trim())
        return setError("Add a phone number or email for the lead.");
      if (!project) return setError("Choose the type of work they need.");
      if (description.trim().length < 10)
        return setError("Add a short description of the requested work.");
    }
    setBusy(true);
    setError("");
    try {
      const end = new Date(quoteDate.getTime() + 60 * 60 * 1000);
      await onSave({
        address: address.trim(),
        ...coordinate,
        outcome: createLead ? "Lead captured" : outcome,
        notes: notes.trim(),
        createLead,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        zip: zip.trim(),
        project,
        projectDescription: description.trim(),
        scheduleQuote: createLead && scheduleQuote,
        quoteDate: scheduleQuote ? dateValue(quoteDate) : "",
        quoteStartTime: scheduleQuote ? timeValue(quoteDate) : "",
        quoteEndTime: scheduleQuote ? timeValue(end) : "",
        quoteNotes: quoteNotes.trim(),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save this visit.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} disabled={busy} hitSlop={12}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Mark this house</Text>
            <Pressable onPress={save} disabled={!canSave} hitSlop={12}>
              {busy ? (
                <ActivityIndicator color={colors.blue} />
              ) : (
                <Text style={[styles.save, !canSave && styles.disabled]}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.eyebrow}>VISIT DETAILS</Text>
            <Text style={styles.label}>House address</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Street address"
              style={styles.input}
            />

            <Text style={styles.label}>Result</Text>
            <View style={styles.chips}>
              {outcomes.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setOutcome(value)}
                  style={[styles.chip, outcome === value && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      outcome === value && styles.chipTextActive,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Visit notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Door hanger left, best time to return…"
              multiline
              style={[styles.input, styles.textarea]}
            />

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchTitle}>Create a lead</Text>
                <Text style={styles.help}>
                  Save the homeowner and their project request.
                </Text>
              </View>
              <Switch
                value={createLead}
                onValueChange={setCreateLead}
                trackColor={{ false: "#C8D2D9", true: colors.sky }}
                thumbColor={createLead ? colors.navy : "#fff"}
              />
            </View>

            {createLead && (
              <View style={styles.leadSection}>
                <Text style={styles.eyebrow}>HOMEOWNER</Text>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={styles.label}>First name</Text>
                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.half}>
                    <Text style={styles.label}>Last name</Text>
                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      style={styles.input}
                    />
                  </View>
                </View>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="(919) 555-0123"
                  style={styles.input}
                />
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Text style={styles.label}>ZIP code</Text>
                <TextInput
                  value={zip}
                  onChangeText={setZip}
                  keyboardType="number-pad"
                  maxLength={10}
                  style={styles.input}
                />

                <Text style={styles.label}>Interested in</Text>
                <View style={styles.chips}>
                  {projects.map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => setProject(value)}
                      style={[
                        styles.chip,
                        project === value && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          project === value && styles.chipTextActive,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>Project request</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What would they like Premium Remodel to quote?"
                  multiline
                  style={[styles.input, styles.textarea]}
                />

                <View style={styles.switchRow}>
                  <View style={styles.switchCopy}>
                    <Text style={styles.switchTitle}>Schedule a quote</Text>
                    <Text style={styles.help}>
                      Add the appointment to the company calendar.
                    </Text>
                  </View>
                  <Switch
                    value={scheduleQuote}
                    onValueChange={setScheduleQuote}
                    trackColor={{ false: "#C8D2D9", true: colors.sky }}
                    thumbColor={scheduleQuote ? colors.navy : "#fff"}
                  />
                </View>

                {scheduleQuote && (
                  <View style={styles.appointment}>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.dateButton, styles.half]}
                        onPress={() => setPicker("date")}
                      >
                        <Text style={styles.dateCaption}>DATE</Text>
                        <Text style={styles.dateValue}>
                          {quoteDate.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.dateButton, styles.half]}
                        onPress={() => setPicker("time")}
                      >
                        <Text style={styles.dateCaption}>START TIME</Text>
                        <Text style={styles.dateValue}>
                          {quoteDate.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </Pressable>
                    </View>
                    {picker && (
                      <DateTimePicker
                        value={quoteDate}
                        mode={picker}
                        minimumDate={picker === "date" ? new Date() : undefined}
                        onChange={(_, value) => {
                          if (Platform.OS !== "ios") setPicker(null);
                          if (value) setQuoteDate(value);
                        }}
                      />
                    )}
                    {picker && Platform.OS === "ios" && (
                      <Pressable onPress={() => setPicker(null)}>
                        <Text style={styles.done}>Done</Text>
                      </Pressable>
                    )}
                    <Text style={styles.label}>Appointment notes</Text>
                    <TextInput
                      value={quoteNotes}
                      onChangeText={setQuoteNotes}
                      placeholder="Gate code, parking, questions to prepare…"
                      multiline
                      style={[styles.input, styles.textareaSmall]}
                    />
                  </View>
                )}
              </View>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Pressable
              onPress={save}
              disabled={!canSave}
              style={[styles.bottomSave, !canSave && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.bottomSaveText}>
                  {createLead ? "Save visit & lead" : "Save visit"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 58,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cancel: { color: colors.muted, fontSize: 15 },
  save: { color: colors.blue, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.42 },
  content: { padding: 20, paddingBottom: 42 },
  eyebrow: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 16,
  },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 13,
    marginBottom: 17,
  },
  textarea: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  textareaSmall: { minHeight: 72, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.surface,
    marginBottom: 22,
  },
  switchCopy: { flex: 1 },
  switchTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  help: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  leadSection: {
    paddingTop: 4,
    borderTopWidth: 2,
    borderTopColor: colors.blue,
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  appointment: {
    padding: 14,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    marginBottom: 20,
  },
  dateButton: {
    minHeight: 62,
    padding: 11,
    borderWidth: 1,
    borderColor: "#C6DBEB",
    borderRadius: 9,
    backgroundColor: colors.surface,
    marginBottom: 16,
  },
  dateCaption: {
    color: colors.blue,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dateValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 6,
  },
  done: {
    color: colors.blue,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 14,
  },
  error: { color: colors.red, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  bottomSave: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: colors.navy,
  },
  bottomSaveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
