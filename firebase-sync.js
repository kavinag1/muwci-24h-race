import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  browserLocalPersistence,
  getRedirectResult,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const APP_SCRIPT = "assets/index-CzAOxx0j.js";
const ADMIN_EMAIL = "kavinagrawal20@gmail.com";
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
  const auth = getAuth(app);
  const db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);
  await getRedirectResult(auth);

  const raceRef = doc(db, "raceSnapshots", "main");
  const listeners = new Set();
  let lastRemote = null;
  let lastRemotePayload = "";
  let lastRevision = 0;
  let writeQueue = Promise.resolve();

  const notify = (snapshot) => {
    for (const listener of listeners) listener(clone(snapshot));
  };

  onSnapshot(raceRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    try {
      const parsed = {
        teams: JSON.parse(data.teamsJson || "[]"),
        race: data.race || defaultRace,
        announcements: JSON.parse(data.announcementsJson || "[]"),
      };
      lastRemote = parsed;
      lastRemotePayload = stablePayload(parsed);
      lastRevision = data.revision || 0;
      notify(parsed);
    } catch (error) {
      console.error("Ignoring an invalid race snapshot:", error);
    }
  }, (error) => console.error("Live race connection failed:", error));

  const isAdmin = () => {
    const user = auth.currentUser;
    return Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);
  };

  const loginAdmin = async () => {
    if (isAdmin()) return true;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ login_hint: ADMIN_EMAIL, prompt: "select_account" });
    await signInWithRedirect(auth, provider);
    return false;
  };

  const logoutAdmin = async () => {
    if (auth.currentUser) await signOut(auth);
  };

  const saveSnapshot = (nextSnapshot) => {
    const desired = clone(nextSnapshot);
    const payload = stablePayload(desired);
    if (payload === lastRemotePayload) return Promise.resolve();
    if (!isAdmin()) return Promise.reject(new Error("Admin sign-in is required to save changes."));
    if (new TextEncoder().encode(payload).length > MAX_SNAPSHOT_BYTES) {
      return Promise.reject(new Error("The race history is too large to save safely."));
    }

    writeQueue = writeQueue.then(async () => {
      const queuedPayload = stablePayload(desired);
      if (queuedPayload === lastRemotePayload) return;
      const baseRevision = lastRevision;
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(raceRef);
        const currentRevision = current.exists() ? (current.data().revision || 0) : 0;
        if (currentRevision !== baseRevision) {
          throw new Error("Race data changed on another device. The latest data has been reloaded; please repeat your action.");
        }
        transaction.set(raceRef, {
          schemaVersion: 1,
          race: desired.race || defaultRace,
          teamsJson: JSON.stringify(desired.teams || []),
          announcementsJson: JSON.stringify(desired.announcements || []),
          revision: currentRevision + 1,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid,
        });
        lastRevision = currentRevision + 1;
        lastRemotePayload = queuedPayload;
        lastRemote = desired;
      });
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
