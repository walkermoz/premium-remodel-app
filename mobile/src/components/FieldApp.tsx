import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, {
  Marker,
  type MapPressEvent,
  type Region,
} from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  locationSharingActive,
  startLocationSharing,
  stopLocationSharing,
} from "../background-location";
import { appRequest } from "../lib/api";
import { appUrl } from "../lib/config";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";
import type {
  Contact,
  DoorOutcome,
  DoorVisit,
  Lead,
  Member,
  VisitDraft,
} from "../types";
import VisitModal from "./VisitModal";

type Tab = "map" | "schedule" | "account";
type Coordinate = { latitude: number; longitude: number };

const raleighRegion: Region = {
  latitude: 35.7796,
  longitude: -78.6382,
  latitudeDelta: 0.09,
  longitudeDelta: 0.065,
};

const outcomeColors: Record<DoorOutcome, string> = {
  "Not home": colors.gray,
  "Spoke — follow up": colors.amber,
  Interested: colors.blue,
  "Not interested": colors.red,
  "Lead captured": colors.green,
};

function friendlyDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function friendlyTime(value?: string) {
  if (!value) return "Time not set";
  return new Date(`2000-01-01T${value}`).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function visitTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleName(role: string) {
  return role === "doorknocker"
    ? "Door knocker"
    : role.charAt(0).toUpperCase() + role.slice(1);
}

async function reverseAddress(coordinate: Coordinate) {
  try {
    const matches = await Location.reverseGeocodeAsync(coordinate);
    const place = matches[0];
    if (!place) return "";
    const street = [place.streetNumber, place.street].filter(Boolean).join(" ");
    return [street, place.city, place.region].filter(Boolean).join(", ");
  } catch {
    return "";
  }
}

export default function FieldApp() {
  const mapRef = useRef<MapView>(null);
  const [tab, setTab] = useState<Tab>("map");
  const [member, setMember] = useState<Member | null>(null);
  const [visits, setVisits] = useState<DoorVisit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [marking, setMarking] = useState(false);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [address, setAddress] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [memberResult, recordsResult] = await Promise.all([
      supabase.rpc("remodel_current_member"),
      supabase
        .from("remodel_records")
        .select("kind,data")
        .in("kind", ["door_visit", "lead", "contact"])
        .order("updated_at", { ascending: false }),
    ]);
    if (memberResult.error) throw memberResult.error;
    if (recordsResult.error) throw recordsResult.error;
    const current = memberResult.data?.[0] as Member | undefined;
    if (!current) {
      await supabase.auth.signOut();
      return;
    }
    setMember(current);
    const rows = recordsResult.data || [];
    setVisits(
      rows
        .filter((row) => row.kind === "door_visit")
        .map((row) => row.data as DoorVisit),
    );
    setLeads(
      rows.filter((row) => row.kind === "lead").map((row) => row.data as Lead),
    );
    setContacts(
      rows
        .filter((row) => row.kind === "contact")
        .map((row) => row.data as Contact),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    Promise.all([load(), locationSharingActive().then(setSharing)]).catch(
      (caught) => {
        setMessage(
          caught instanceof Error
            ? caught.message
            : "Could not load field data.",
        );
        setLoading(false);
      },
    );
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    setMessage("");
    try {
      await load(true);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not refresh.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function centerOnMe() {
    setMessage("");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setMessage("Allow location access to center the map on your position.");
      return;
    }
    try {
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = {
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
      };
      mapRef.current?.animateToRegion(
        { ...next, latitudeDelta: 0.012, longitudeDelta: 0.009 },
        500,
      );
    } catch {
      setMessage("Your current location is not available yet.");
    }
  }

  async function selectHouse(next: Coordinate) {
    setMarking(false);
    setMessage("Finding this house address…");
    const found = await reverseAddress(next);
    setAddress(found);
    setCoordinate(next);
    setMessage("");
  }

  async function toggleShift() {
    setShiftBusy(true);
    setMessage("");
    try {
      if (sharing) {
        await stopLocationSharing();
        setSharing(false);
        setMessage("Shift ended. Your saved location was cleared.");
      } else {
        const point = await startLocationSharing();
        setSharing(true);
        setMessage("Shift started. Your latest work location is now shared.");
        mapRef.current?.animateToRegion(
          {
            latitude: point.coords.latitude,
            longitude: point.coords.longitude,
            latitudeDelta: 0.012,
            longitudeDelta: 0.009,
          },
          500,
        );
      }
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not change location sharing.",
      );
    } finally {
      setShiftBusy(false);
    }
  }

  async function saveVisit(draft: VisitDraft) {
    const result = await appRequest<{
      visit: DoorVisit;
      lead?: Lead;
      contact?: Contact;
    }>("/api/door-knocking", {
      method: "POST",
      body: { ...draft, visitedAt: new Date().toISOString() },
    });
    setVisits((current) => [result.visit, ...current]);
    if (result.lead) setLeads((current) => [result.lead as Lead, ...current]);
    if (result.contact)
      setContacts((current) => [result.contact as Contact, ...current]);
    setCoordinate(null);
    setAddress("");
    setMessage(
      result.lead
        ? "Visit, lead, and quote details saved."
        : "House visit saved.",
    );
  }

  async function signOut() {
    if (sharing) {
      Alert.alert(
        "End your active shift?",
        "Signing out will stop location sharing and clear your saved position.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "End shift & sign out",
            style: "destructive",
            onPress: async () => {
              await stopLocationSharing().catch(() => undefined);
              await supabase.auth.signOut();
            },
          },
        ],
      );
      return;
    }
    await supabase.auth.signOut();
  }

  const appointments = useMemo(
    () =>
      leads
        .filter((lead) => lead.quoteDate)
        .sort((a, b) =>
          `${a.quoteDate}${a.quoteStartTime}`.localeCompare(
            `${b.quoteDate}${b.quoteStartTime}`,
          ),
        ),
    [leads],
  );

  if (loading)
    return (
      <View style={styles.loading}>
        <View style={styles.loadingMark} />
        <ActivityIndicator color={colors.blue} size="large" />
        <Text style={styles.loadingText}>Loading your field workspace…</Text>
      </View>
    );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brand}>PREMIUM REMODEL</Text>
          <Text style={styles.welcome}>
            Hi, {member?.full_name.split(" ")[0] || "there"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={toggleShift}
          disabled={shiftBusy}
          style={[styles.shift, sharing && styles.shiftActive]}
        >
          {shiftBusy ? (
            <ActivityIndicator
              color={sharing ? colors.green : colors.navy}
              size="small"
            />
          ) : (
            <View style={[styles.shiftDot, sharing && styles.shiftDotActive]} />
          )}
          <Text style={[styles.shiftText, sharing && styles.shiftTextActive]}>
            {sharing ? "End shift" : "Start shift"}
          </Text>
        </Pressable>
      </View>

      {!!message && (
        <Pressable onPress={() => setMessage("")} style={styles.message}>
          <Text style={styles.messageText}>{message}</Text>
          <Text style={styles.messageClose}>×</Text>
        </Pressable>
      )}

      <View style={styles.content}>
        {tab === "map" && (
          <View style={styles.mapPage}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={raleighRegion}
              showsUserLocation
              showsMyLocationButton={false}
              onPress={(event: MapPressEvent) => {
                if (marking) void selectHouse(event.nativeEvent.coordinate);
              }}
            >
              {visits.map((visit) => (
                <Marker
                  key={visit.id}
                  coordinate={{
                    latitude: visit.latitude,
                    longitude: visit.longitude,
                  }}
                  pinColor={outcomeColors[visit.outcome]}
                  title={visit.address}
                  description={`${visit.outcome} · ${visit.canvasserName}`}
                />
              ))}
            </MapView>
            {marking && (
              <View pointerEvents="none" style={styles.mapInstruction}>
                <Text style={styles.mapInstructionText}>
                  Tap the house you visited
                </Text>
              </View>
            )}
            <View style={styles.mapActions}>
              <Pressable onPress={centerOnMe} style={styles.mapCircle}>
                <Text style={styles.mapCircleText}>◎</Text>
              </Pressable>
              <Pressable
                onPress={() => setMarking((value) => !value)}
                style={[styles.markButton, marking && styles.markButtonCancel]}
              >
                <Text
                  style={[
                    styles.markButtonText,
                    marking && styles.markButtonTextCancel,
                  ]}
                >
                  {marking ? "Cancel" : "+ Mark house"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.mapSummary}>
              <View>
                <Text style={styles.summaryNumber}>{visits.length}</Text>
                <Text style={styles.summaryLabel}>HOUSES VISITED</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View>
                <Text style={styles.summaryNumber}>
                  {visits.filter((visit) => visit.leadId).length}
                </Text>
                <Text style={styles.summaryLabel}>LEADS CAPTURED</Text>
              </View>
            </View>
            {!!visits[0] && (
              <View style={styles.latestVisit}>
                <View
                  style={[
                    styles.outcomeDot,
                    { backgroundColor: outcomeColors[visits[0].outcome] },
                  ]}
                />
                <View style={styles.latestCopy}>
                  <Text style={styles.latestEyebrow}>
                    LATEST VISIT ·{" "}
                    {visitTime(visits[0].visitedAt).toUpperCase()}
                  </Text>
                  <Text numberOfLines={1} style={styles.latestAddress}>
                    {visits[0].address}
                  </Text>
                  <Text style={styles.latestOutcome}>{visits[0].outcome}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {tab === "schedule" && (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.blue}
              />
            }
            contentContainerStyle={styles.listPage}
          >
            <Text style={styles.eyebrow}>UPCOMING</Text>
            <Text style={styles.pageTitle}>Quote schedule</Text>
            <Text style={styles.pageDescription}>
              Appointments created from your captured leads.
            </Text>
            {appointments.length ? (
              appointments.map((lead) => {
                const contact = contacts.find(
                  (item) => item.id === lead.contactId,
                );
                return (
                  <View key={lead.id} style={styles.appointmentCard}>
                    <View style={styles.dateBlock}>
                      <Text style={styles.dateMonth}>
                        {new Date(`${lead.quoteDate}T12:00:00`)
                          .toLocaleDateString(undefined, { month: "short" })
                          .toUpperCase()}
                      </Text>
                      <Text style={styles.dateDay}>
                        {new Date(`${lead.quoteDate}T12:00:00`).getDate()}
                      </Text>
                    </View>
                    <View style={styles.appointmentCopy}>
                      <Text style={styles.appointmentTime}>
                        {friendlyDate(lead.quoteDate!)} ·{" "}
                        {friendlyTime(lead.quoteStartTime)}
                      </Text>
                      <Text style={styles.appointmentName}>{lead.name}</Text>
                      <Text style={styles.appointmentProject}>
                        {lead.project}
                      </Text>
                      {!!contact?.address && (
                        <Text style={styles.appointmentAddress}>
                          {contact.address}
                        </Text>
                      )}
                    </View>
                    {!!contact?.phone && (
                      <Pressable
                        onPress={() =>
                          Linking.openURL(
                            `tel:${contact.phone.replace(/[^+\d]/g, "")}`,
                          )
                        }
                        style={styles.callButton}
                      >
                        <Text style={styles.callButtonText}>Call</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>◷</Text>
                <Text style={styles.emptyTitle}>No quotes scheduled</Text>
                <Text style={styles.emptyCopy}>
                  Create a lead while marking a house and turn on Schedule a
                  quote.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {tab === "account" && (
          <ScrollView contentContainerStyle={styles.listPage}>
            <Text style={styles.eyebrow}>ACCOUNT</Text>
            <Text style={styles.pageTitle}>{member?.full_name}</Text>
            <Text style={styles.pageDescription}>{member?.email}</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileLine}>
                <Text style={styles.profileLabel}>Workspace role</Text>
                <Text style={styles.profileValue}>
                  {roleName(member?.role || "member")}
                </Text>
              </View>
              <View style={styles.profileLine}>
                <Text style={styles.profileLabel}>Location status</Text>
                <Text
                  style={[
                    styles.profileValue,
                    sharing && { color: colors.green },
                  ]}
                >
                  {sharing ? "Sharing during shift" : "Off"}
                </Text>
              </View>
            </View>
            <View style={styles.privacyCard}>
              <Text style={styles.privacyTitle}>
                Location stays in your control
              </Text>
              <Text style={styles.privacyCopy}>
                Premium Remodel stores only your latest position while a shift
                is active. Ending the shift clears that position. Location
                access can also be revoked in your phone settings.
              </Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(appUrl)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                Open full web dashboard
              </Text>
            </Pressable>
            <Pressable onPress={signOut} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
            <Text style={styles.version}>
              Premium Remodel Field · Version 1.0
            </Text>
          </ScrollView>
        )}
      </View>

      <View style={styles.tabs}>
        {(
          [
            ["map", "⌖", "Map"],
            ["schedule", "◷", "Schedule"],
            ["account", "○", "Account"],
          ] as const
        ).map(([value, icon, label]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={styles.tab}
          >
            <Text style={[styles.tabIcon, tab === value && styles.tabActive]}>
              {icon}
            </Text>
            <Text style={[styles.tabLabel, tab === value && styles.tabActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!coordinate && (
        <VisitModal
          key={`${coordinate.latitude}-${coordinate.longitude}`}
          coordinate={coordinate}
          initialAddress={address}
          onClose={() => {
            setCoordinate(null);
            setAddress("");
          }}
          onSave={saveVisit}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: colors.background,
  },
  loadingMark: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.navy,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
  topbar: {
    height: 70,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  brand: {
    color: colors.blue,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  welcome: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 3 },
  shift: {
    minWidth: 106,
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.background,
  },
  shiftActive: { borderColor: "#ACDCC6", backgroundColor: colors.greenSoft },
  shiftDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray,
  },
  shiftDotActive: { backgroundColor: colors.green },
  shiftText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  shiftTextActive: { color: "#207849" },
  message: {
    minHeight: 42,
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.blueSoft,
    borderBottomWidth: 1,
    borderBottomColor: "#C7DDEB",
  },
  messageText: {
    flex: 1,
    color: colors.navy,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  messageClose: { color: colors.muted, fontSize: 21 },
  content: { flex: 1, backgroundColor: colors.background },
  mapPage: { flex: 1 },
  map: { flex: 1 },
  mapInstruction: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  mapInstructionText: {
    overflow: "hidden",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    color: "#fff",
    backgroundColor: "rgba(14,40,56,.92)",
    fontSize: 12,
    fontWeight: "800",
  },
  mapActions: {
    position: "absolute",
    top: 14,
    right: 14,
    alignItems: "flex-end",
    gap: 10,
  },
  mapCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    shadowColor: colors.navyDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  mapCircleText: { color: colors.navy, fontSize: 26, lineHeight: 28 },
  markButton: {
    height: 46,
    paddingHorizontal: 17,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
    shadowColor: colors.navyDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  markButtonCancel: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  markButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  markButtonTextCancel: { color: colors.ink },
  mapSummary: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 104,
    minHeight: 76,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(255,255,255,.96)",
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.navyDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.13,
    shadowRadius: 11,
    elevation: 5,
  },
  summaryNumber: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 3,
  },
  summaryDivider: { width: 1, height: 40, backgroundColor: colors.line },
  latestVisit: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    height: 78,
    padding: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.navy,
  },
  outcomeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
  },
  latestCopy: { flex: 1 },
  latestEyebrow: {
    color: "#A9C7D8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  latestAddress: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  latestOutcome: { color: "#CFE4EF", fontSize: 11, marginTop: 2 },
  listPage: { padding: 20, paddingBottom: 42 },
  eyebrow: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    marginTop: 7,
  },
  pageDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    marginBottom: 24,
  },
  appointmentCard: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: "flex-start",
  },
  dateBlock: {
    width: 50,
    height: 58,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  dateMonth: {
    color: colors.blue,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  dateDay: {
    color: colors.navy,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 1,
  },
  appointmentCopy: { flex: 1 },
  appointmentTime: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  appointmentName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  appointmentProject: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  appointmentAddress: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  callButton: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
  },
  callButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  empty: {
    marginTop: 38,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  emptyIcon: { color: colors.blue, fontSize: 32 },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 7,
  },
  profileCard: {
    borderTopWidth: 2,
    borderTopColor: colors.navy,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  profileLine: {
    minHeight: 55,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  profileLabel: { color: colors.muted, fontSize: 13 },
  profileValue: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  privacyCard: {
    marginTop: 20,
    padding: 18,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
  },
  privacyTitle: { color: colors.navy, fontSize: 14, fontWeight: "900" },
  privacyCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  secondaryButton: {
    height: 50,
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.navy, fontSize: 13, fontWeight: "900" },
  signOutButton: {
    height: 50,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  signOutText: { color: colors.red, fontSize: 13, fontWeight: "900" },
  version: {
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 28,
  },
  tabs: {
    height: 76,
    paddingBottom: 8,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabIcon: { color: colors.gray, fontSize: 22, lineHeight: 24 },
  tabLabel: { color: colors.gray, fontSize: 10, fontWeight: "800" },
  tabActive: { color: colors.blue },
});
