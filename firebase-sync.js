import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  getDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-functions.js";

const APP_SCRIPT = "assets/index-CzAOxx0j.js";
const MAX_SNAPSHOT_BYTES = 900_000;

const defaultRace = {
  status: "idle",
  startTime: null,
  timeRemainingAtPause: 86400,
  totalDurationSeconds: 86400,
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const stablePayload = (value) => JSON.stringify({
  teams: value.teams || [],
  race: value.race || defaultRace,
  announcements: value.announcements || [],
});

const loadFirebaseConfig = async () => {
  if (window.__FIREBASE_CONFIG__) return window.__FIREBASE_CONFIG__;
  const response = await fetch("/__/firebase/init.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Firebase configuration is unavailable.");
  return response.json();
};

const createStore = async () => {
  const config = await loadFirebaseConfig();
  const app = initializeApp(config);
  const db = getFirestore(app);
  const functions = getFunctions(app, "us-central1");
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  const raceRef = doc(db, "raceSnapshots", "main");
  const raceAdmin = httpsCallable(functions, "raceAdmin");
  const listeners = new Set();
  let lastRemote = null;
  let lastRemotePayload = "";
  let lastRevision = 0;
  let writeQueue = Promise.resolve();
  let pendingWrites = 0;
  let adminMode = false;
  let adminPin = null;

  const notify = (snapshot) => {
    for (const listener of listeners) listener(clone(snapshot));
  };

  onSnapshot(raceRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    try {
      const remoteRevision = data.revision || 0;
      if (remoteRevision < lastRevision) return;
      const parsed = {
        teams: JSON.parse(data.teamsJson || "[]"),
        race: data.race || defaultRace,
        announcements: JSON.parse(data.announcementsJson || "[]"),
      };
      lastRemote = parsed;
      lastRemotePayload = stablePayload(parsed);
      lastRevision = remoteRevision;
      if (!adminMode || pendingWrites === 0) notify(parsed);
    } catch (error) {
      console.error("Ignoring an invalid race snapshot:", error);
    }
  }, (error) => console.error("Live race connection failed:", error));

  const isAdmin = () => adminMode;

  const loginAdmin = async (pin) => {
    const result = await raceAdmin({ action: "verify", pin });
    if (!result.data?.verified) throw new Error("Admin password could not be verified.");
    adminPin = pin;
    adminMode = true;
    return true;
  };

  const logoutAdmin = async () => {
    adminPin = null;
    adminMode = false;
  };

  const saveSnapshot = (nextSnapshot) => {
    const desired = clone(nextSnapshot);
    const payload = stablePayload(desired);
    if (payload === lastRemotePayload) return Promise.resolve();
    if (!isAdmin()) return Promise.reject(new Error("Admin mode is required to save changes."));
    if (new TextEncoder().encode(payload).length > MAX_SNAPSHOT_BYTES) {
      return Promise.reject(new Error("The race history is too large to save safely."));
    }

    pendingWrites += 1;
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const queuedPayload = stablePayload(desired);
      if (queuedPayload === lastRemotePayload) return;
      let result;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const baseRevision = lastRevision;
        try {
          result = await raceAdmin({
            action: "save",
            pin: adminPin,
            expectedRevision: baseRevision,
            snapshot: desired,
          });
          if (result.data?.conflict) {
            if (attempt > 0) throw new Error("Race data changed on another device. Reload and repeat the action.");
            const current = await getDoc(raceRef);
            if (!current.exists()) throw new Error("The latest race data could not be loaded.");
            lastRevision = current.data().revision || result.data.revision || 0;
            continue;
          }
          break;
        } catch (error) {
          if (error.code !== "functions/aborted" || attempt > 0) throw error;
          const current = await getDoc(raceRef);
          if (!current.exists()) throw error;
          lastRevision = current.data().revision || 0;
        }
      }
      if (!result?.data?.revision) throw new Error("The race update was not confirmed.");
      lastRevision = result.data.revision;
      lastRemotePayload = queuedPayload;
      lastRemote = desired;
    }).finally(() => {
      pendingWrites = Math.max(0, pendingWrites - 1);
    });
    return writeQueue;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (lastRemote) listener(clone(lastRemote));
      return () => listeners.delete(listener);
    },
    saveSnapshot,
    loginAdmin,
    logoutAdmin,
    isAdmin,
  };
};

const showStartupError = (error) => {
  console.error(error);
  const root = document.getElementById("root");
  root.innerHTML = `<div style="min-height:100vh;background:#020617;color:#e2e8f0;display:grid;place-items:center;font-family:system-ui;padding:24px"><div style="max-width:560px;text-align:center"><h1 style="font-size:24px">Unable to connect to the race</h1><p style="color:#94a3b8">Check the internet connection and reload this page.</p></div></div>`;
};

try {
  window.MuwciRaceStore = await createStore();
  const script = document.createElement("script");
  script.src = APP_SCRIPT;
  script.defer = true;
  script.onerror = () => showStartupError(new Error("The application failed to load."));
  document.body.appendChild(script);
} catch (error) {
  showStartupError(error);
}
