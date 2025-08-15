// App.js — JobForge (single-file MVP)
// Runs on iOS, Android, and Web. No backend required.
// Includes: Master CV editor, ATS-aware tailoring, cover letter generator,
// job link import (heuristic), application tracker, portfolio, and file export.
//
// Minimal deps (install once):
//   npx expo install @react-native-async-storage/async-storage expo-clipboard expo-file-system
//
// Start:
//   npx expo start
//
// Notes:
// - expo-file-system is optional; the app guards it so Web still works without native FS.
// - For production, split this into modules and consider a real backend.
// - All data persists locally via AsyncStorage.

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

// Optional FS (mobile). Web will skip it safely.
let FileSystem = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  FileSystem = require("expo-file-system");
} catch (_) {
  FileSystem = null;
}

/* --------------------------------
   Theming
--------------------------------- */
const COLORS = {
  bg: "#f5f7fb",
  card: "#ffffff",
  ink: "#111827",
  sub: "#6b7280",
  line: "#e6e9ef",
  brand: "#2f6bed",
  brandAlt: "#2447B2",
};

/* --------------------------------
   Templates (categories)
--------------------------------- */
const TEMPLATES = [
  "Software Development & IT",
  "Marketing & Communications",
  "Administration & Office Support",
  "Education & Training",
  "Healthcare & Nursing",
  "Political Science & Public Policy",
  "Sales & Customer Service",
  "Engineering & Technical",
  "Finance & Accounting",
  "Creative & Design",
  "Law & Legal Services",
  "Project Management",
  "Human Resources & Recruitment",
  "Supply Chain & Logistics",
  "Hospitality & Tourism",
];

/* --------------------------------
   Seed Data / Defaults
--------------------------------- */
const seedJobs = () => [
  { id: 1, title: "Product Manager — FinTech", company: "Kaelo Labs", status: "Saved", appliedOn: null, requirements: ["Backlog, analytics, GTM"] },
  { id: 2, title: "Data Analyst", company: "DataNest", status: "Draft", appliedOn: null, requirements: ["SQL, dashboards, Python"] },
];

function defaultMasterCV() {
  return [
    "NAME SURNAME",
    "Johannesburg, South Africa • email@example.com • +27 00 000 0000 • linkedin.com/in/yourname",
    "",
    "SUMMARY",
    "Data-driven professional with 5+ years’ experience across product, analytics, and operations. Skilled in stakeholder engagement, problem solving, and measurable impact.",
    "",
    "CORE SKILLS",
    "• Product strategy • User research • SQL • Python • Data visualization • Roadmapping • A/B testing",
    "",
    "EXPERIENCE",
    "Company A — Product Analyst (2022–Present)",
    "• Shipped feature X improving conversion by 12%",
    "• Built dashboards that cut weekly reporting time by 40%",
    "",
    "Company B — Operations Associate (2020–2022)",
    "• Standardized SOPs across 3 teams; reduced error rate by 18%",
    "",
    "EDUCATION",
    "BCom, University of Somewhere",
  ].join("\n");
}

/* --------------------------------
   ATS-aware keyword extraction
--------------------------------- */
const STOP_WORDS = new Set(
  `the a an and or for with of to in on at as by from is are be this that those these it its their his her they we you your our
   via will can able have has had using use into within under over out per year years month months week day remote hybrid office
   role job company team teams strong excellent great good ability responsibilities requirements detail results`.split(/\s+/)
);

function extractKeywords(text = "") {
  const raw = String(text || "").toLowerCase();
  const tokens = raw
    .replace(/[^a-z0-9+\-#\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOP_WORDS.has(t));
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 30);
}

/* --------------------------------
   Tailoring & Letter Generation
--------------------------------- */
function normalizeBullet(b) {
  return b.replace(/^[\-\*\u2022]\s*/, "• ").trim();
}

function tailorCV({ masterCV, jobTitle, company, template, atsKeywords = [] }) {
  const header = [
    `TAILORED CV — ${jobTitle} @ ${company}`,
    `Template: ${template}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const baseHighlights = (masterCV.match(/^[-•].+$/gmi) || []).slice(0, 5).map(normalizeBullet);
  const tailoredHighlights = [
    `• Impact aligned to ${jobTitle} — quantified outcomes preferred`,
    `• Keywords for ATS: ${atsKeywords.slice(0, 6).join(", ") || "N/A"}`,
    `• Cross-functional collaboration to deliver ${company} priorities`,
    ...baseHighlights,
  ].slice(0, 6);

  const body = [
    header,
    "",
    atsKeywords.length ? `ATS Focus: ${atsKeywords.slice(0, 12).join(", ")}` : "ATS Focus: (not provided)",
    "",
    "SUMMARY",
    `Results-oriented candidate targeting ${jobTitle} at ${company}. Blends domain knowledge with data-driven decision making and a bias for measurable impact.`,
    "",
    "HIGHLIGHTS",
    ...tailoredHighlights,
    "",
    "EXPERIENCE & EDUCATION (from Master CV)",
    masterCV.trim(),
  ].join("\n");

  return { text: body, highlights: tailoredHighlights };
}

function generateCoverLetter({ candidateName = "Candidate", jobTitle, company, highlights = [] }) {
  const top = highlights.slice(0, 3).map((h) => h.replace(/^•\s*/, ""));
  return [
    `Dear Hiring Manager at ${company},`,
    "",
    `I’m excited to apply for the ${jobTitle} role. I bring relevant experience and a track record of measurable impact:`,
    top.length ? top.map((h) => `• ${h}`).join("\n") : "• Delivered outcomes aligned to the role’s requirements",
    "",
    "I would welcome the opportunity to discuss how I can contribute to your team’s priorities.",
    "",
    "Kind regards,",
    candidateName,
  ].join("\n");
}

/* --------------------------------
   Utils
--------------------------------- */
function guessTitleFromLink(link) {
  if (!link) return null;
  const l = link.toLowerCase();
  if (l.includes("product")) return "Product Manager";
  if (l.includes("data")) return "Data Analyst";
  if (l.includes("engineer")) return "Software Engineer";
  if (l.includes("designer")) return "Product Designer";
  return null;
}
function guessCompanyFromLink(link) {
  if (!link) return null;
  try {
    const u = new URL(link);
    const host = u.hostname.replace("www.", "");
    const parts = host.split(".");
    if (parts.length >= 2) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch (_) {}
  return null;
}

function saveTextAsDownloadWeb(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------
   Small UI Partials
--------------------------------- */
const RowButton = ({ label, onPress, outline = false }) => (
  <TouchableOpacity
    style={[outline ? styles.buttonOutline : styles.button, { marginTop: 8 }]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <Text style={outline ? styles.buttonOutlineText : styles.buttonText}>{label}</Text>
  </TouchableOpacity>
);

const Tag = ({ text, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.tag}>
    <Text style={{ color: COLORS.ink }}>{text}</Text>
  </TouchableOpacity>
);

const Section = ({ title, children, right }) => (
  <View style={{ marginTop: 14 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={styles.h3}>{title}</Text>
      {right}
    </View>
    {children}
  </View>
);

const SmallLink = ({ label, onPress }) => (
  <TouchableOpacity onPress={onPress}>
    <Text style={styles.link}>{label}</Text>
  </TouchableOpacity>
);

const NavBack = ({ onPress }) => (
  <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 14, paddingTop: 12 }}>
    <Text style={{ color: COLORS.sub }}>← Back</Text>
  </TouchableOpacity>
);

const Header = ({ user }) => {
  const firstName = useMemo(() => (user?.name || "User").split(" ")[0], [user?.name]);
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>JobForge</Text>
      <Text style={styles.headerSub}>Welcome, {firstName}</Text>
    </View>
  );
};

/* --------------------------------
   Main App
--------------------------------- */
export default function App() {
  const [screen, setScreen] = useState("home");

  const [user, setUser] = useState({ name: "User" });
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  const [masterCV, setMasterCV] = useState(defaultMasterCV());
  const [tailoredCV, setTailoredCV] = useState("");
  const [coverLetter, setCoverLetter] = useState("");

  const [linkInput, setLinkInput] = useState("");
  const [jobDescText, setJobDescText] = useState(""); // paste raw JD text to improve ATS

  const [portfolio, setPortfolio] = useState([]);
  const [note, setNote] = useState("");

  // Restore persisted data
  useEffect(() => {
    (async () => {
      try {
        const sJobs = await AsyncStorage.getItem("jf:jobs");
        const sUser = await AsyncStorage.getItem("jf:user");
        const sCV = await AsyncStorage.getItem("jf:masterCV");
        const sPortfolio = await AsyncStorage.getItem("jf:portfolio");
        setJobs(sJobs ? JSON.parse(sJobs) : seedJobs());
        if (sUser) setUser(JSON.parse(sUser));
        if (sCV) setMasterCV(sCV);
        if (sPortfolio) setPortfolio(JSON.parse(sPortfolio));
      } catch (e) {
        console.warn("Restore failed", e);
      }
    })();
  }, []);

  // Persist
  useEffect(() => void AsyncStorage.setItem("jf:jobs", JSON.stringify(jobs)), [jobs]);
  useEffect(() => void AsyncStorage.setItem("jf:user", JSON.stringify(user)), [user]);
  useEffect(() => void AsyncStorage.setItem("jf:masterCV", masterCV), [masterCV]);
  useEffect(() => void AsyncStorage.setItem("jf:portfolio", JSON.stringify(portfolio)), [portfolio]);

  const go = (s) => setScreen(s);

  /* ----------------------------
      Core Actions
  ----------------------------- */
  const importJobFromLink = (link) => {
    const job = {
      id: Date.now(),
      title: guessTitleFromLink(link) || "Software Engineer (Backend)",
      company: guessCompanyFromLink(link) || "AureusTech",
      status: "Saved",
      appliedOn: null,
      raw: link || "mock://job/1",
      requirements: ["3+ years backend", "REST APIs & PostgreSQL", "Testing & CI"],
    };
    setJobs((prev) => [job, ...prev]);
    setSelectedJob(job);
    setTailoredCV("");
    setCoverLetter("");
    setScreen("job");
  };

  const generateTailoredNow = (job, templateName) => {
    // Build ATS keywords from pasted job description text + requirements
    const atsKeywords = extractKeywords(`${jobDescText}\n${(job.requirements || []).join("\n")}`);
    const tailored = tailorCV({
      masterCV,
      jobTitle: job.title,
      company: job.company,
      template: templateName,
      atsKeywords,
    });
    setTailoredCV(tailored.text);
    setCoverLetter(
      generateCoverLetter({
        candidateName: user.name || "Candidate",
        jobTitle: job.title,
        company: job.company,
        highlights: tailored.highlights,
      })
    );
    Alert.alert("Generated", "Tailored CV & Cover Letter created.");
  };

  const applyToJob = (job) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id ? { ...j, status: "Applied", appliedOn: new Date().toLocaleDateString() } : j
      )
    );
    Alert.alert("Marked as Applied", `Application for “${job.title}” tracked.`);
    setScreen("tracker");
  };

  const copyToClipboard = async (text) => {
    await Clipboard.setStringAsync(text || "");
    Alert.alert("Copied", "Text copied to clipboard.");
  };

  const saveTextToFile = async (filename, text) => {
    if (Platform.OS === "web") {
      saveTextAsDownloadWeb(filename, text);
      Alert.alert("Downloaded", `${filename} saved via browser.`);
      return;
    }
    if (!FileSystem) {
      Alert.alert("Save unavailable", "expo-file-system not available on this platform.");
      return;
    }
    const path = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert("Saved", `File saved to: ${path}`);
  };

  const addPortfolioItem = () => {
    if (!note.trim()) return Alert.alert("Add text", "Enter a highlight first.");
    setPortfolio((p) => [{ id: Date.now(), title: note.trim() }, ...p]);
    setNote("");
  };

  /* ----------------------------
      Screens
  ----------------------------- */
  if (screen === "home") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <Header user={user} />
        <View style={styles.card}>
          <Text style={styles.h2}>Forge your future — one application at a time</Text>
          <Text style={styles.p}>
            Scan job links, paste descriptions, tailor ATS-ready CVs & cover letters, build a portfolio, and track every application.
          </Text>

          <RowButton label="Scan Job Link" onPress={() => setScreen("scan")} />
          <RowButton label="Paste Job Description (for ATS)" onPress={() => setScreen("jd")} />
          <RowButton label="Upload / Edit Master CV" onPress={() => setScreen("cv")} />
          <RowButton label="Tailored CV Generator" onPress={() => setScreen("gen")} outline />
          <RowButton label="Application Tracker" onPress={() => setScreen("tracker")} outline />
          <RowButton label="Portfolio" onPress={() => setScreen("portfolio")} outline />

          <Section title="Recent jobs">
            {jobs.map((j) => (
              <TouchableOpacity
                key={j.id}
                style={styles.jobRow}
                onPress={() => {
                  setSelectedJob(j);
                  setScreen("job");
                }}
              >
                <View>
                  <Text style={styles.jobTitle}>{j.title}</Text>
                  <Text style={styles.muted}>
                    {j.company} • {j.status}
                    {j.appliedOn ? ` • Applied ${j.appliedOn}` : ""}
                  </Text>
                </View>
                <Text style={styles.open}>Open</Text>
              </TouchableOpacity>
            ))}
          </Section>
        </View>
        <Footer />
      </ScrollView>
    );
  }

  if (screen === "scan") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h3}>Scan a job post</Text>
          <Text style={styles.p}>Paste a job link (or leave empty for demo) and press Scan.</Text>
          <TextInput
            placeholder="https://company.example/jobs/123"
            value={linkInput}
            onChangeText={setLinkInput}
            style={styles.input}
            autoCapitalize="none"
          />
          <RowButton label="Scan" onPress={() => importJobFromLink(linkInput)} />
        </View>
      </ScrollView>
    );
  }

  if (screen === "jd") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h3}>Paste Job Description</Text>
          <Text style={styles.p}>
            Paste the full job description here. We’ll extract keywords to improve ATS alignment when generating your CV.
          </Text>
          <TextInput
            value={jobDescText}
            onChangeText={setJobDescText}
            multiline
            placeholder="Paste the job description here…"
            style={[styles.input, { minHeight: 220, textAlignVertical: "top" }]}
          />
          <RowButton label="Save" onPress={() => Alert.alert("Saved", "Job description stored for ATS extraction.")} />
        </View>
      </ScrollView>
    );
  }

  if (screen === "cv") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h3}>Master CV</Text>
          <Text style={styles.p}>Paste or edit your master CV — the generator uses this as the base.</Text>
          <TextInput
            value={masterCV}
            onChangeText={setMasterCV}
            multiline
            style={[styles.input, { minHeight: 220, textAlignVertical: "top" }]}
          />
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <RowButton label="Save" onPress={() => Alert.alert("Saved", "Master CV updated.")} />
            <RowButton outline label="Copy" onPress={() => copyToClipboard(masterCV)} />
            <RowButton
              outline
              label="Download TXT"
              onPress={() => saveTextToFile("JobForge_MasterCV.txt", masterCV)}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (screen === "job" && selectedJob) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h2}>{selectedJob.title}</Text>
          <Text style={styles.muted}>{selectedJob.company}</Text>

          <Section title="Parsed requirements (demo)">
            {(selectedJob.requirements || []).map((r, i) => (
              <Text key={i} style={styles.pList}>
                • {r}
              </Text>
            ))}
          </Section>

          <Section title="Choose a template">
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {TEMPLATES.slice(0, 8).map((t) => (
                <Tag key={t} text={t} onPress={() => generateTailoredNow(selectedJob, t)} />
              ))}
            </View>
          </Section>

          <RowButton
            label="Generate Tailored CV & Cover Letter"
            onPress={() => generateTailoredNow(selectedJob, TEMPLATES[0])}
          />

          <Section title="Tailored CV" right={<SmallLink label="Copy" onPress={() => copyToClipboard(tailoredCV)} />}>
            <TextInput value={tailoredCV} multiline editable={false} style={[styles.input, { minHeight: 140 }]} />
            <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
              <RowButton
                outline
                label="Download TXT"
                onPress={() => saveTextToFile("JobForge_TailoredCV.txt", tailoredCV)}
              />
            </View>
          </Section>

          <Section
            title="Cover Letter"
            right={<SmallLink label="Copy" onPress={() => copyToClipboard(coverLetter)} />}
          >
            <TextInput value={coverLetter} multiline editable={false} style={[styles.input, { minHeight: 120 }]} />
            <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
              <RowButton
                outline
                label="Download TXT"
                onPress={() => saveTextToFile("JobForge_CoverLetter.txt", coverLetter)}
              />
            </View>
          </Section>

          <RowButton label="Mark as Applied" onPress={() => applyToJob(selectedJob)} />
        </View>
      </ScrollView>
    );
  }

  if (screen === "gen") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h3}>Tailored CV Generator</Text>
          <Text style={styles.p}>Pick a job below, then a template to generate a tailored CV instantly.</Text>

          <FlatList
            data={jobs}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: COLORS.line }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ paddingVertical: 10 }}
                onPress={() => {
                  setSelectedJob(item);
                  setScreen("job");
                }}
              >
                <Text style={styles.jobTitle}>{item.title}</Text>
                <Text style={styles.muted}>
                  {item.company} • {item.status}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </ScrollView>
    );
  }

  if (screen === "tracker") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h3}>Application Tracker</Text>
          <Text style={styles.p}>Track your applications, statuses, and dates.</Text>

          {jobs.map((j) => (
            <View key={j.id} style={styles.cardSmall}>
              <Text style={styles.jobTitle}>{j.title}</Text>
              <Text style={styles.muted}>
                {j.company} • {j.status}
                {j.appliedOn ? ` • Applied on ${j.appliedOn}` : ""}
              </Text>
              <View style={{ marginTop: 8, flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                <SmallLink label="Open" onPress={() => { setSelectedJob(j); setScreen("job"); }} />
                <SmallLink
                  label="Saved"
                  onPress={() => setJobs((p) => p.map((x) => (x.id === j.id ? { ...x, status: "Saved" } : x)))}
                />
                <SmallLink
                  label="Interview"
                  onPress={() => setJobs((p) => p.map((x) => (x.id === j.id ? { ...x, status: "Interview" } : x)))}
                />
                <SmallLink
                  label="Offer"
                  onPress={() => setJobs((p) => p.map((x) => (x.id === j.id ? { ...x, status: "Offer" } : x)))}
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  if (screen === "portfolio") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <NavBack onPress={() => setScreen("home")} />
        <View style={styles.card}>
          <Text style={styles.h3}>Portfolio</Text>
          <Text style={styles.p}>Add quick highlights recruiters can scan fast.</Text>

          <TextInput
            placeholder="Title — e.g., Launched analytics dashboard that cut reporting time 40%"
            style={styles.input}
            value={note}
            onChangeText={setNote}
          />
          <RowButton label="Add Highlight" onPress={addPortfolioItem} />

          <Section title="Your Highlights">
            {portfolio.length === 0 && <Text style={styles.muted}>No items yet.</Text>}
            {portfolio.map((p) => (
              <View key={p.id} style={styles.cardSmall}>
                <Text style={styles.jobTitle}>{p.title}</Text>
              </View>
            ))}
          </Section>
        </View>
      </ScrollView>
    );
  }

  // Fallback
  return (
    <ScrollView style={styles.container}>
      <Header user={user} />
      <Text style={{ padding: 16 }}>Unknown screen</Text>
    </ScrollView>
  );
}

/* --------------------------------
   Footer
--------------------------------- */
function Footer() {
  return (
    <View style={{ alignItems: "center", padding: 12 }}>
      <Text style={styles.footer}>
        Prototype — replace local tailoring with real AI APIs & add cloud storage when ready.
      </Text>
    </View>
  );
}

/* --------------------------------
   Styles
--------------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 18 },
  header: { paddingHorizontal: 14, marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: COLORS.ink },
  headerSub: { color: COLORS.sub, marginTop: 4 },

  card: {
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 12,
    margin: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "#eef0f5",
  },
  cardSmall: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#eef0f5",
  },

  h2: { fontSize: 16, fontWeight: "700", marginBottom: 6, color: COLORS.ink },
  h3: { fontSize: 14, fontWeight: "700", marginBottom: 6, color: COLORS.ink },
  p: { color: COLORS.sub, marginBottom: 12 },
  pList: { color: "#374151", marginLeft: 6, marginBottom: 4 },

  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    marginBottom: 10,
    color: COLORS.ink,
    textAlignVertical: "top",
  },

  button: {
    backgroundColor: COLORS.brand,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  buttonText: { color: "#fff", fontWeight: "800" },

  buttonOutline: {
    borderWidth: 1,
    borderColor: "#c5cee8",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  buttonOutlineText: { color: COLORS.brand, fontWeight: "800" },

  jobRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f2f8",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  jobTitle: { fontWeight: "700", color: COLORS.ink },
  muted: { color: COLORS.sub, fontSize: 12 },
  open: { color: COLORS.brand, fontWeight: "700" },
  link: { color: COLORS.brand, fontWeight: "700", marginRight: 10 },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe0ea",
    margin: 4,
    backgroundColor: "#fff",
  },
  footer: { color: "#9aa0b4", fontSize: 11, textAlign: "center" },
});
