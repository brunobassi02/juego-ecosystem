/* Feeding Choice Simulator — player assigns food web links each season */

// ─────────────────────────────────────────────────────────────────────────────
// Firebase (SDK v10, modular) — Google Auth + Firestore leaderboard
// NOTE: Leave firebaseConfig empty and paste your credentials.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Paste your config here:
const firebaseConfig = {apiKey: "AIzaSyBzNqw7LlcVzo_iG1jJkXoNKvQyXy3RMbo",
  authDomain: "juego-ecosystem.firebaseapp.com",
  projectId: "juego-ecosystem",
  storageBucket: "juego-ecosystem.firebasestorage.app",
  messagingSenderId: "173396332409",
  appId: "1:173396332409:web:4104b5f5aaf30e0756e9a8",
  measurementId: "G-EK5YH5CT73"};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let inactivityTimer = null;
let lastActivityAt = Date.now();

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

function startInactivityTracking() {
  stopInactivityTracking();
  lastActivityAt = Date.now();

  const bump = () => {
    lastActivityAt = Date.now();
    const status = document.getElementById("session-status");
    if (status) status.textContent = "";
  };

  const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
  for (const e of events) window.addEventListener(e, bump, { passive: true });

  inactivityTimer = window.setInterval(() => {
    if (!currentUser) return;
    const idleFor = Date.now() - lastActivityAt;
    if (idleFor >= INACTIVITY_MS) {
      const status = document.getElementById("session-status");
      if (status) status.textContent = "Logged out due to inactivity.";
      handleLogout();
    }
  }, 1000);

  // stash cleanup handler on window to avoid rewriting more code
  window.__stopInactivityTracking = () => {
    for (const e of events) window.removeEventListener(e, bump);
  };
}

function stopInactivityTracking() {
  if (typeof window.__stopInactivityTracking === "function") {
    window.__stopInactivityTracking();
    window.__stopInactivityTracking = null;
  }
  if (inactivityTimer) {
    window.clearInterval(inactivityTimer);
    inactivityTimer = null;
  }
}

async function handleGoogleLogin() {
  const err = document.getElementById("auth-error");
  if (err) err.textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    if (err) err.textContent = "Login failed. Please try again.";
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error(e);
  }
}

function showAuthScreen() {
  document.getElementById("auth-screen")?.classList.remove("hidden");
  document.getElementById("start-screen")?.classList.add("hidden");
  document.getElementById("game-screen")?.classList.add("hidden");
  document.getElementById("end-screen")?.classList.add("hidden");
  document.getElementById("leaderboard")?.classList.add("hidden");
}

function showStartScreen() {
  document.getElementById("auth-screen")?.classList.add("hidden");
  document.getElementById("start-screen")?.classList.remove("hidden");
  document.getElementById("game-screen")?.classList.add("hidden");
  document.getElementById("end-screen")?.classList.add("hidden");
  document.getElementById("leaderboard")?.classList.add("hidden");
}

function showLeaderboardScreen() {
  document.getElementById("auth-screen")?.classList.add("hidden");
  document.getElementById("start-screen")?.classList.add("hidden");
  document.getElementById("game-screen")?.classList.add("hidden");
  document.getElementById("end-screen")?.classList.add("hidden");
  document.getElementById("leaderboard")?.classList.remove("hidden");
}

async function saveFinalStabilityScore(finalStability) {
  if (!currentUser) return false;
  try {
    await addDoc(collection(db, "stability_quiz_results"), {
      displayName: currentUser.displayName || "Anonymous",
      photoURL: currentUser.photoURL || "",
      finalStability: Math.round(finalStability),
      createdAt: serverTimestamp(),
      uid: currentUser.uid,
    });
    return true;
  } catch (e) {
    console.error("Failed to save score:", e);
    return false;
  }
}

async function loadLeaderboard() {
  const body = document.getElementById("leaderboard-body");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="4" class="muted">Loading…</td></tr>`;

  try {
    const q = query(
      collection(db, "stability_quiz_results"),
      orderBy("finalStability", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach((doc) => rows.push(doc.data()));

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="4" class="muted">No scores yet.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((r, i) => {
        const photo = r.photoURL
          ? `<img class="lb-photo" src="${r.photoURL}" alt="" />`
          : `<div class="lb-photo" aria-hidden="true"></div>`;
        const name = (r.displayName || "Anonymous").replaceAll("<", "&lt;");
        const score = Number(r.finalStability ?? 0);
        return `<tr>
          <td class="num">${i + 1}</td>
          <td>${photo}</td>
          <td>${name}</td>
          <td class="num">${score}</td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    console.error("Failed to load leaderboard:", e);
    body.innerHTML = `<tr><td colspan="4" class="muted">Failed to load leaderboard.</td></tr>`;
  }
}

function renderUserChip() {
  const name = document.getElementById("user-name");
  const photo = document.getElementById("user-photo");
  if (!name || !photo) return;
  if (!currentUser) {
    name.textContent = "";
    photo.src = "";
    photo.alt = "";
    return;
  }
  name.textContent = currentUser.displayName || "Anonymous";
  photo.src = currentUser.photoURL || "";
  photo.alt = currentUser.displayName || "User";
}

const ACTIONS_PER_ROUND = 6;

const VALID_LINKS = {
  Aphid: ["Grass", "Clover"],
  Caterpillar: ["Grass", "Clover"],
  Rabbit: ["Grass", "Clover"],
  Mouse: ["Grass", "Clover"],
  BlueTit: ["Aphid", "Caterpillar"],
  Fox: ["Rabbit", "BlueTit", "Mouse"],
  Hawk: ["Mouse", "Rabbit", "BlueTit"],
};

const CONSUMERS = [
  "Aphid", "Caterpillar", "Rabbit", "Mouse", "BlueTit", "Fox", "Hawk",
];

const SPECIES_META = {
  Grass: { label: "Grass", emoji: "🌿", level: "Producer", color: "#4ade80" },
  Clover: { label: "Clover", emoji: "☘️", level: "Producer", color: "#22c55e" },
  Aphid: { label: "Aphid", emoji: "🐛", level: "Primary consumer", color: "#a3e635" },
  Caterpillar: { label: "Caterpillar", emoji: "🐛", level: "Primary consumer", color: "#84cc16" },
  Rabbit: { label: "Rabbit", emoji: "🐰", level: "Primary consumer", color: "#fbbf24" },
  Mouse: { label: "Mouse", emoji: "🐭", level: "Primary consumer", color: "#fcd34d" },
  BlueTit: { label: "Blue Tit", emoji: "🐦", level: "Secondary consumer", color: "#38bdf8" },
  Fox: { label: "Fox", emoji: "🦊", level: "Tertiary consumer", color: "#f97316" },
  Hawk: { label: "Hawk", emoji: "🦅", level: "Tertiary consumer", color: "#ef4444" },
  FungiBacteria: { label: "Fungi & Bacteria", emoji: "🍄", level: "Decomposer", color: "#a78bfa" },
};

const DISPLAY_ORDER = [
  "Grass", "Clover", "Aphid", "Caterpillar", "Rabbit", "Mouse",
  "BlueTit", "Fox", "Hawk", "FungiBacteria",
];

const INITIAL_POP = {
  Grass: 6000, Clover: 2500, Aphid: 3000, Caterpillar: 1200,
  Rabbit: 180, Mouse: 1400, BlueTit: 90, Fox: 12, Hawk: 8,
  FungiBacteria: 10000,
};

const BASELINE_TOTAL = Object.values(INITIAL_POP).reduce((a, b) => a + b, 0);
const PRODUCER_BASELINE = INITIAL_POP.Grass + INITIAL_POP.Clover;
const PREDATOR_BASELINE = INITIAL_POP.Fox + INITIAL_POP.BlueTit + INITIAL_POP.Hawk;
const BASELINE_CONSUMER_TOTAL = CONSUMERS.reduce(
  (s, n) => s + INITIAL_POP[n],
  0
);
const MAX_EVENTS_PER_GAME = 4;

// Hunger death rates per season when player assigns NO food
const STARVE_DEATH_RATE = {
  primary: 0.14,
  secondary: 0.26,
  tertiary: 0.38,
};

const EVENT_LABELS = {
  Drought: "Drought",
  HeavyRain: "Heavy Rain",
  PesticideSpray: "Pesticide Spray",
  OverharvestingRabbits: "Overharvesting Rabbits",
  InvasivePredator: "Invasive Predator",
  DiseaseOutbreak: "Disease Outbreak",
};

// ─── Data structures ─────────────────────────────────────────────────────────

function createSpecies(data) {
  const s = {
    ...data,
    foodPreferences: data.foodPreferences || [],
    chosenFoodTarget: null,
    chosenFoodAmount: 0,
  };
  s.totalEnergy = s.population * s.energyPerIndividual;
  return s;
}

function initializeGame() {
  const ecosystem = {
    speciesMap: {},
    roundNumber: 0,
    stabilityIndex: 100,
    deadMatterPool: 120,
    waterFactor: 1.0,
    activeEvent: null,
    maxRounds: 12,
    collapseThreshold: 18,
    availableActions: ACTIONS_PER_ROUND,
    pendingChoices: [],
    phase: "feeding",
    lastRoundReport: null,
    eventRoundsRemaining: new Set(),
  };

  const seasonSlots = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(
    0,
    MAX_EVENTS_PER_GAME
  );
  for (const r of seasonSlots) ecosystem.eventRoundsRemaining.add(r);

  const speciesList = [
    createSpecies({ name: "Grass", trophicLevel: "producer", population: 6000, energyPerIndividual: 1.0, birthRate: 0.18, naturalDeathRate: 0.045, hungerSensitivity: 0, isProducer: true, isDecomposer: false }),
    createSpecies({ name: "Clover", trophicLevel: "producer", population: 2500, energyPerIndividual: 1.0, birthRate: 0.38, naturalDeathRate: 0.04, hungerSensitivity: 0, isProducer: true, isDecomposer: false }),
    createSpecies({ name: "Aphid", trophicLevel: "primary", population: 3000, energyPerIndividual: 0.1, birthRate: 0.3, naturalDeathRate: 0.06, hungerSensitivity: 0.08, foodPreferences: ["Grass", "Clover"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "Caterpillar", trophicLevel: "primary", population: 1200, energyPerIndividual: 0.1, birthRate: 0.28, naturalDeathRate: 0.06, hungerSensitivity: 0.08, foodPreferences: ["Grass", "Clover"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "Rabbit", trophicLevel: "primary", population: 180, energyPerIndividual: 0.5, birthRate: 0.16, naturalDeathRate: 0.05, hungerSensitivity: 0.07, foodPreferences: ["Grass", "Clover"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "Mouse", trophicLevel: "primary", population: 1400, energyPerIndividual: 0.12, birthRate: 0.32, naturalDeathRate: 0.06, hungerSensitivity: 0.08, foodPreferences: ["Grass", "Clover"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "BlueTit", trophicLevel: "secondary", population: 90, energyPerIndividual: 0.2, birthRate: 0.14, naturalDeathRate: 0.06, hungerSensitivity: 0.1, foodPreferences: ["Aphid", "Caterpillar"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "Fox", trophicLevel: "tertiary", population: 12, energyPerIndividual: 0.8, birthRate: 0.09, naturalDeathRate: 0.08, hungerSensitivity: 0.14, foodPreferences: ["Rabbit", "BlueTit", "Mouse"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "Hawk", trophicLevel: "tertiary", population: 8, energyPerIndividual: 0.9, birthRate: 0.08, naturalDeathRate: 0.08, hungerSensitivity: 0.14, foodPreferences: ["Mouse", "Rabbit", "BlueTit"], isProducer: false, isDecomposer: false }),
    createSpecies({ name: "FungiBacteria", trophicLevel: "decomposer", population: 10000, energyPerIndividual: 0.05, birthRate: 0.28, naturalDeathRate: 0.015, hungerSensitivity: 0.02, foodPreferences: [], isProducer: false, isDecomposer: true }),
  ];

  for (const sp of speciesList) ecosystem.speciesMap[sp.name] = sp;
  return ecosystem;
}

function clamp(value, minValue, maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function roundDown(value) {
  return Math.floor(value);
}

/** Fisher–Yates shuffle (returns new array) */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomEventCard(eventCards) {
  return eventCards[Math.floor(Math.random() * eventCards.length)];
}

// ─── Feeding validation & choices ──────────────────────────────────────────

function isValidFeedingLink(predator, prey) {
  if (predator.isProducer || predator.isDecomposer) return false;
  const allowed = VALID_LINKS[predator.name];
  return allowed && allowed.includes(prey.name);
}

function resetPlayerChoices(ecosystem) {
  ecosystem.availableActions = ACTIONS_PER_ROUND;
  ecosystem.pendingChoices = [];
  for (const key of Object.keys(ecosystem.speciesMap)) {
    const sp = ecosystem.speciesMap[key];
    sp.chosenFoodTarget = null;
    sp.chosenFoodAmount = 0;
  }
}

function getPreyPopulation(ecosystem, preyName) {
  return ecosystem.speciesMap[preyName]?.population ?? 0;
}

function addPlayerChoice(ecosystem, predatorName, preyName, amount) {
  const predator = ecosystem.speciesMap[predatorName];
  const prey = ecosystem.speciesMap[preyName];

  if (!predator || !prey) return { ok: false, msg: "Unknown species." };
  if (ecosystem.availableActions <= 0) return { ok: false, msg: "No feeding actions left this season." };
  if (!isValidFeedingLink(predator, prey)) {
    return { ok: false, msg: `${SPECIES_META[predatorName].label} cannot eat ${SPECIES_META[preyName].label}.` };
  }
  if (prey.population <= 0) return { ok: false, msg: "That food source is extinct." };

  const amt = Math.max(10, Math.round(Number(amount) || 0));
  if (amt < 10) return { ok: false, msg: "Amount must be at least 10." };

  ecosystem.pendingChoices.push({ predator: predatorName, prey: preyName, amount: amt });
  ecosystem.availableActions -= 1;
  syncPredatorChoicesFromPending(ecosystem);

  return { ok: true, msg: "Feeding assigned!" };
}

function syncPredatorChoicesFromPending(ecosystem) {
  for (const name of CONSUMERS) {
    const sp = ecosystem.speciesMap[name];
    const choices = ecosystem.pendingChoices.filter((c) => c.predator === name);
    if (choices.length === 0) {
      sp.chosenFoodTarget = null;
      sp.chosenFoodAmount = 0;
    } else {
      sp.chosenFoodTarget = choices[choices.length - 1].prey;
      sp.chosenFoodAmount = choices.reduce((sum, c) => sum + c.amount, 0);
    }
  }
}

function removePendingChoice(ecosystem, index) {
  const removed = ecosystem.pendingChoices.splice(index, 1)[0];
  if (!removed) return;

  ecosystem.availableActions += 1;
  syncPredatorChoicesFromPending(ecosystem);
}

// ─── Round resolution (pseudocode) ───────────────────────────────────────────

function resolveFeeding(ecosystem) {
  const report = { feeding: [] };

  for (const choice of ecosystem.pendingChoices) {
    const species = ecosystem.speciesMap[choice.predator];
    const prey = ecosystem.speciesMap[choice.prey];
    if (!species || !prey) continue;

    const transferableEnergy = choice.amount * 0.1;
    const maxEnergyFromPrey = prey.population * 0.05;
    const gainedEnergy = Math.min(transferableEnergy, maxEnergyFromPrey);

    species.totalEnergy += gainedEnergy;

    const preyLoss = roundDown(choice.amount * 0.02);
    prey.population = Math.max(0, prey.population - preyLoss);
    ecosystem.deadMatterPool += choice.amount * 0.01;

    report.feeding.push({
      predator: choice.predator,
      prey: choice.prey,
      amount: choice.amount,
      energyGained: gainedEnergy,
      preyLost: preyLoss,
    });
  }

  // Producers: sunlight (reduced by drought via waterFactor)
  const water = ecosystem.waterFactor ?? 1;
  for (const name of ["Grass", "Clover"]) {
    const sp = ecosystem.speciesMap[name];
    const share = name === "Grass" ? 0.6 : 0.4;
    sp.totalEnergy += sp.population * 0.06 * share * water;
  }

  return report;
}

function applyDecomposerFeeding(ecosystem) {
  const fungi = ecosystem.speciesMap["FungiBacteria"];
  if (fungi.population <= 0 || ecosystem.deadMatterPool <= 0) return null;

  const consumed = Math.min(
    ecosystem.deadMatterPool,
    fungi.population * 8,
    2500
  );
  const gain = consumed * 0.15;
  fungi.totalEnergy += gain;
  ecosystem.deadMatterPool = Math.max(0, ecosystem.deadMatterPool - consumed * 0.85);
  fungi.chosenFoodTarget = "deadMatter";
  fungi.energyPerIndividual = fungi.totalEnergy / fungi.population;

  return {
    predator: "FungiBacteria",
    prey: "deadMatter",
    amount: consumed,
    energyGained: gain,
    preyLost: 0,
    auto: true,
  };
}

function addDeadMatterFromDeaths(ecosystem, species, deaths, energyPerIndividual) {
  if (deaths <= 0) return;
  const biomass = deaths * (energyPerIndividual + 0.15) * 2.5;
  ecosystem.deadMatterPool += biomass;
}

function getMetabolicCost(species) {
  if (species.isProducer) return 0.025;
  if (species.isDecomposer) return 0.008;
  if (species.trophicLevel === "primary") return 0.035;
  if (species.trophicLevel === "secondary") return 0.05;
  if (species.trophicLevel === "tertiary") return 0.065;
  return 0.03;
}

function computeHungerDeaths(species, starved) {
  if (!starved || species.isProducer || species.isDecomposer) return 0;
  const rate = STARVE_DEATH_RATE[species.trophicLevel] ?? 0.2;
  let deaths = roundDown(species.population * rate);
  if (species.population > 0 && deaths < 1) deaths = 1;
  return deaths;
}

function applyMetabolismAndHunger(ecosystem) {
  const report = { hunger: [] };

  for (const key of Object.keys(ecosystem.speciesMap)) {
    const species = ecosystem.speciesMap[key];
    const metabolicLoss = species.population * getMetabolicCost(species);

    let hungerLoss;
    const noChoice =
      species.chosenFoodTarget === null &&
      !species.isProducer &&
      !species.isDecomposer;

    if (noChoice) {
      hungerLoss = species.population * species.hungerSensitivity * 2.5;
    } else if (species.chosenFoodTarget === null) {
      hungerLoss = species.population * species.hungerSensitivity * 1.5;
    } else {
      hungerLoss = species.population * species.hungerSensitivity * 0.4;
    }

    species.totalEnergy -= metabolicLoss + hungerLoss;
    if (species.totalEnergy < 0) species.totalEnergy = 0;

    if (species.population > 0) {
      species.energyPerIndividual = species.totalEnergy / species.population;
    }

    report.hunger.push({
      name: key,
      metabolicLoss,
      hungerLoss,
      starved: noChoice && !species.isProducer,
    });
  }

  return report;
}

function applyBirthsAndDeaths(ecosystem, hungerEntries) {
  const report = { populations: [] };
  const hungerByName = {};
  if (hungerEntries) {
    for (const h of hungerEntries) hungerByName[h.name] = h;
  }

  for (const key of Object.keys(ecosystem.speciesMap)) {
    const species = ecosystem.speciesMap[key];
    const energyPerIndividual =
      species.totalEnergy / Math.max(1, species.population);

    let birthFactor = clamp(energyPerIndividual / 2, 0, 1);

    if (species.isDecomposer) {
      const deadBonus = clamp(ecosystem.deadMatterPool / 2000, 0.4, 2.5);
      birthFactor = clamp((energyPerIndividual / 0.08) * deadBonus, 0.2, 1.8);
    }

    let births = roundDown(
      species.birthRate * species.population * birthFactor
    );
    if (species.name === "Grass") {
      births = roundDown(births * 0.22);
    }

    let starvationDeaths = 0;
    if (energyPerIndividual < 0.5 && !species.isProducer) {
      starvationDeaths = roundDown(
        species.population * (0.5 - energyPerIndividual) * 0.45
      );
    }

    const hungerInfo = hungerByName[key];
    const hungerDeaths = computeHungerDeaths(species, hungerInfo?.starved);

    const naturalDeaths = roundDown(
      species.population * species.naturalDeathRate
    );

    species.population =
      species.population +
      births -
      starvationDeaths -
      hungerDeaths -
      naturalDeaths;
    if (species.population < 0) species.population = 0;

    const totalDeaths = starvationDeaths + hungerDeaths + naturalDeaths;
    addDeadMatterFromDeaths(ecosystem, species, totalDeaths, energyPerIndividual);

    if (species.population > 0) {
      species.energyPerIndividual = species.totalEnergy / species.population;
    } else {
      ecosystem.deadMatterPool += species.totalEnergy * 1.5;
      species.totalEnergy = 0;
      species.energyPerIndividual = 0;
    }

    report.populations.push({
      name: key,
      births,
      starvationDeaths,
      hungerDeaths,
      naturalDeaths,
      population: species.population,
    });
  }

  return report;
}

function createEventCards() {
  return [
    {
      name: "HeavyRain",
      targetSpecies: ["Grass", "Clover"],
      description: "Heavy rains soak the soil: grass surges, water returns.",
      icon: "🌧️",
      grassPopMultiplier: 1.22,
      grassFlatBonus: 420,
      cloverPopMultiplier: 1.06,
      waterBoost: 0.12,
    },
    { name: "Drought", targetSpecies: ["Grass", "Clover"], populationMultiplier: 0.5, extraPlantDeathRate: 0.12, description: "Severe drought kills plants and stops growth.", icon: "🌵" },
    { name: "PesticideSpray", targetSpecies: ["Aphid", "Caterpillar", "Mouse"], populationMultiplier: 0.25, description: "Pesticides wipe out many small herbivores.", icon: "🧪" },
    { name: "OverharvestingRabbits", targetSpecies: ["Rabbit"], populationMultiplier: 0.55, description: "Humans remove too many rabbits.", icon: "🪤" },
    { name: "InvasivePredator", targetSpecies: ["Rabbit", "BlueTit", "Mouse"], populationMultiplier: 0.75, description: "Extra predators increase pressure on prey.", icon: "🐾" },
    { name: "DiseaseOutbreak", targetSpecies: ["Clover", "Rabbit", "BlueTit", "Fox", "Hawk", "Aphid", "Caterpillar", "Mouse"], populationMultiplier: 0.65, description: "Disease spreads through populations.", icon: "🦠" },
  ];
}

function maybeTriggerEvent(ecosystem, eventCards) {
  ecosystem.activeEvent = null;
  const upcomingRound = ecosystem.roundNumber + 1;
  if (
    upcomingRound <= ecosystem.maxRounds &&
    ecosystem.eventRoundsRemaining &&
    ecosystem.eventRoundsRemaining.has(upcomingRound)
  ) {
    ecosystem.eventRoundsRemaining.delete(upcomingRound);
    ecosystem.activeEvent = pickRandomEventCard(eventCards);
  }
}

function applyEventEffects(ecosystem) {
  if (!ecosystem.activeEvent) return;
  const event = ecosystem.activeEvent;

  if (event.name === "HeavyRain") {
    const grass = ecosystem.speciesMap["Grass"];
    const clover = ecosystem.speciesMap["Clover"];
    grass.population = roundDown(
      grass.population * (event.grassPopMultiplier ?? 1.22)
    );
    grass.population += roundDown(event.grassFlatBonus ?? 400);
    clover.population = roundDown(
      clover.population * (event.cloverPopMultiplier ?? 1.06)
    );
    grass.totalEnergy *= 1.12;
    clover.totalEnergy *= 1.06;
    if (grass.population > 0) {
      grass.energyPerIndividual = grass.totalEnergy / grass.population;
    }
    if (clover.population > 0) {
      clover.energyPerIndividual = clover.totalEnergy / clover.population;
    }
    ecosystem.waterFactor = clamp(
      (ecosystem.waterFactor ?? 1) + (event.waterBoost ?? 0.1),
      0.25,
      1.2
    );
    return;
  }

  if (event.name === "Drought") {
    ecosystem.waterFactor = (ecosystem.waterFactor ?? 1) * 0.45;
    for (const name of ["Grass", "Clover"]) {
      const sp = ecosystem.speciesMap[name];
      sp.population = roundDown(sp.population * event.populationMultiplier);
      const extra = roundDown(sp.population * (event.extraPlantDeathRate || 0.12));
      sp.population = Math.max(0, sp.population - extra);
      sp.totalEnergy *= 0.55;
      if (sp.population > 0) {
        sp.energyPerIndividual = sp.totalEnergy / sp.population;
      }
    }
    return;
  }

  for (const targetName of event.targetSpecies) {
    const species = ecosystem.speciesMap[targetName];
    if (species) {
      species.population = roundDown(
        species.population * event.populationMultiplier
      );
    }
  }
}

function updateStability(ecosystem) {
  let totalPop = 0;
  let consumerPop = 0;
  for (const key of Object.keys(ecosystem.speciesMap)) {
    const p = ecosystem.speciesMap[key].population;
    totalPop += p;
    if (CONSUMERS.includes(key)) consumerPop += p;
  }
  const producerPop =
    ecosystem.speciesMap["Grass"].population +
    ecosystem.speciesMap["Clover"].population;
  const predatorPop =
    ecosystem.speciesMap["Fox"].population +
    ecosystem.speciesMap["BlueTit"].population +
    ecosystem.speciesMap["Hawk"].population;

  const fungiPop = ecosystem.speciesMap["FungiBacteria"].population;
  const popWithoutFungi = Math.max(0, totalPop - fungiPop);
  const baselineWithoutFungi = BASELINE_TOTAL - INITIAL_POP.FungiBacteria;

  const consumerRatio = consumerPop / Math.max(1, BASELINE_CONSUMER_TOTAL);

  let stability =
    100 *
    (0.18 * (popWithoutFungi / Math.max(1, baselineWithoutFungi)) +
      0.22 * (producerPop / PRODUCER_BASELINE) +
      0.28 * (predatorPop / Math.max(1, PREDATOR_BASELINE)) +
      0.32 * consumerRatio);

  if (consumerPop === 0) {
    stability = Math.min(stability, 8);
  } else if (consumerRatio < 0.04) {
    stability = Math.min(stability, 18);
  } else if (consumerRatio < 0.15) {
    stability = Math.min(stability, 22);
  }

  if (fungiPop > totalPop * 0.75 && consumerPop < BASELINE_CONSUMER_TOTAL * 0.08) {
    stability *= 0.45;
  }

  ecosystem.stabilityIndex = clamp(stability, 0, 100);
}

function checkCollapse(ecosystem) {
  const grass = ecosystem.speciesMap["Grass"].population;
  const clover = ecosystem.speciesMap["Clover"].population;
  const consumerSum = CONSUMERS.reduce(
    (s, n) => s + ecosystem.speciesMap[n].population,
    0
  );

  if (grass === 0 && clover === 0) return { collapsed: true, reason: "producers" };
  if (consumerSum === 0 && ecosystem.roundNumber > 0) {
    return { collapsed: true, reason: "foodweb" };
  }
  if (ecosystem.stabilityIndex < ecosystem.collapseThreshold)
    return { collapsed: true, reason: "stability" };
  if (ecosystem.roundNumber >= ecosystem.maxRounds)
    return { collapsed: true, reason: "rounds" };

  return { collapsed: false, reason: null };
}

function getCollapseMessage(reason) {
  const messages = {
    producers: "All producers died! Without plants, the food web cannot survive.",
    foodweb:
      "All animal populations died out. A meadow with only plants and microbes is not a stable food web.",
    stability: "Stability fell below 25. The ecosystem lost its balance.",
    rounds: "You completed 12 seasons! Review how your decisions shaped the meadow.",
  };
  return messages[reason] || "Simulation ended.";
}

function runSeasonSimulation(ecosystem, eventCards) {
  const populationsBefore = snapshotPopulations();

  const feedingReport = resolveFeeding(ecosystem);
  const hungerLog = applyMetabolismAndHunger(ecosystem).hunger;
  const populationLog = applyBirthsAndDeaths(ecosystem, hungerLog).populations;

  const decompFeed = applyDecomposerFeeding(ecosystem);
  if (decompFeed) feedingReport.feeding.push(decompFeed);

  // Second decomposer pass: births from dead matter accumulated this season
  const fungi = ecosystem.speciesMap["FungiBacteria"];
  if (fungi.population > 0 && ecosystem.deadMatterPool > 100) {
    const extraConsumed = Math.min(ecosystem.deadMatterPool * 0.35, fungi.population * 4);
    const extraBirths = roundDown(fungi.birthRate * fungi.population * clamp(ecosystem.deadMatterPool / 1500, 0.3, 1.2));
    fungi.population += extraBirths;
    fungi.totalEnergy += extraConsumed * 0.12;
    ecosystem.deadMatterPool -= extraConsumed * 0.7;
    fungi.energyPerIndividual = fungi.totalEnergy / fungi.population;
  }

  maybeTriggerEvent(ecosystem, eventCards);
  applyEventEffects(ecosystem);
  updateStability(ecosystem);

  ecosystem.roundNumber += 1;

  return {
    round: ecosystem.roundNumber,
    feeding: feedingReport.feeding,
    hunger: hungerLog,
    populations: populationLog,
    populationsBefore,
    populationsAfter: snapshotPopulations(),
  };
}

// ─── Game state & UI ─────────────────────────────────────────────────────────

let ecosystem = null;
let eventCards = [];
let gameOver = false;
let history = [];
let selectedPredator = null;
let selectedPrey = null;

function startGame() {
  ecosystem = initializeGame();
  eventCards = createEventCards();
  gameOver = false;
  history = [{ round: 0, stability: 100, populations: snapshotPopulations() }];
  selectedPredator = null;
  selectedPrey = null;

  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  document.getElementById("end-screen").classList.add("hidden");

  resetPlayerChoices(ecosystem);
  renderAll();
}

function snapshotPopulations() {
  const pop = {};
  for (const name of DISPLAY_ORDER) pop[name] = ecosystem.speciesMap[name].population;
  return pop;
}

function finishFeedingPhase() {
  if (gameOver || !ecosystem) return;

  const report = runSeasonSimulation(ecosystem, eventCards);
  ecosystem.lastRoundReport = report;

  history.push({
    round: ecosystem.roundNumber,
    stability: ecosystem.stabilityIndex,
    populations: snapshotPopulations(),
    choices: [...ecosystem.pendingChoices],
    event: ecosystem.activeEvent,
  });

  const collapse = checkCollapse(ecosystem);

  // Update UI first so season counter and populations always refresh
  resetPlayerChoices(ecosystem);
  ecosystem.phase = "feeding";
  renderAll();

  try {
    if (ecosystem.activeEvent) showEventModal(ecosystem.activeEvent);
    showResultsModal(report);
  } catch (err) {
    console.error("Results modal error:", err);
    document.getElementById("feeding-feedback").textContent =
      `Season ${report.round} completed. (Results panel had an error.)`;
    document.getElementById("feeding-feedback").className = "feeding-feedback ok";
  }

  if (collapse.collapsed) {
    setTimeout(() => endGame(collapse.reason), 400);
  }
}

function endGame(reason) {
  gameOver = true;
  document.getElementById("game-screen").classList.add("hidden");
  document.getElementById("end-screen").classList.remove("hidden");

  const won = reason === "rounds" && ecosystem.stabilityIndex >= 50;
  document.getElementById("end-title").textContent = won ? "Ecosystem Survived!" : "Ecosystem Collapse";
  document.getElementById("end-message").textContent = getCollapseMessage(reason);
  document.getElementById("end-round").textContent = ecosystem.roundNumber;
  const finalStability = Math.round(ecosystem.stabilityIndex);
  document.getElementById("end-stability").textContent = finalStability;

  // Save silently in the background. Do NOT navigate to the leaderboard here.
  void saveFinalStabilityScore(finalStability).then((saved) => {
    const status = document.getElementById("session-status");
    if (status) {
      status.textContent = saved
        ? "Score saved! Loading leaderboard…"
        : "Score not saved (check Firebase config/login).";
    }
    void loadLeaderboard();
  });

  const summary = document.getElementById("end-summary");
  summary.innerHTML = "";
  for (const name of DISPLAY_ORDER) {
    const sp = ecosystem.speciesMap[name];
    const meta = SPECIES_META[name];
    const initial = INITIAL_POP[name];
    const change = sp.population - initial;
    const pct = initial > 0 ? ((sp.population / initial) * 100).toFixed(0) : 0;
    const row = document.createElement("div");
    row.className = "summary-row";
    row.innerHTML = `
      <span>${meta.emoji} ${meta.label}</span>
      <span>${sp.population.toLocaleString()}</span>
      <span class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${change.toLocaleString()} (${pct}%)</span>
    `;
    summary.appendChild(row);
  }
}

// The rest of the game (rendering, modals, etc.) is identical to the original.
// To keep this patch focused on navigation flow, we import the remaining logic
// by reusing the existing global functions from the original file where possible.

function showEventModal(event) {
  document.getElementById("event-modal-icon").textContent = event.icon || "⚡";
  document.getElementById("event-modal-title").textContent = EVENT_LABELS[event.name] || event.name;
  let extra = "";
  if (event.name === "Drought") {
    extra =
      " Grass and Clover lose ~50% population plus extra die-off.";
  } else if (event.name === "HeavyRain") {
    extra = " Grass gets a strong boost; water factor rises.";
  }
  document.getElementById("event-modal-desc").textContent = event.description + extra;
  document.getElementById("event-modal-targets").textContent =
    "Affected: " + event.targetSpecies.map((n) => SPECIES_META[n]?.label || n).join(", ");
  document.getElementById("event-modal").classList.remove("hidden");
}

function closeEventModal() {
  document.getElementById("event-modal").classList.add("hidden");
}

function showResultsModal(report) {
  const body = document.getElementById("results-body");
  body.innerHTML = "";

  const h = document.createElement("p");
  h.className = "results-intro";
  h.textContent = `Season ${report.round} results — only ~10% of food energy moves up the web!`;
  body.appendChild(h);

  const feedingList = Array.isArray(report.feeding) ? report.feeding : [];
  const hungerList = Array.isArray(report.hunger) ? report.hunger : [];

  if (feedingList.filter((f) => !f.auto).length === 0) {
    const p = document.createElement("p");
    p.className = "warn-text";
    p.textContent =
      "You assigned no feeding links. Consumers lost energy and population from hunger.";
    body.appendChild(p);
  }

  for (const f of feedingList) {
    if (f.auto) continue;
    const row = document.createElement("div");
    row.className = "result-row";
    const preyLabel = f.prey === "deadMatter" ? "♻️" : SPECIES_META[f.prey]?.emoji;
    row.innerHTML = `<span>${SPECIES_META[f.predator].emoji} → ${preyLabel}</span>
      <span>+${f.energyGained.toFixed(1)} energy</span>
      <span class="down">−${f.preyLost} prey</span>`;
    body.appendChild(row);
  }

  const starved = hungerList.filter((h) => h.starved);
  if (starved.length) {
    const warn = document.createElement("p");
    warn.className = "warn-text";
    warn.textContent =
      "Starved (no food assigned): " +
      starved.map((s) => SPECIES_META[s.name].label).join(", ");
    body.appendChild(warn);
  }

  const popTitle = document.createElement("p");
  popTitle.className = "results-subtitle";
  popTitle.textContent = "Population changes:";
  body.appendChild(popTitle);

  for (const name of DISPLAY_ORDER) {
    const before = report.populationsBefore[name];
    const after = report.populationsAfter[name];
    const delta = after - before;
    if (delta === 0) continue;
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span>${SPECIES_META[name].emoji} ${SPECIES_META[name].label}</span>
      <span>${before.toLocaleString()} → ${after.toLocaleString()}</span>
      <span class="${delta < 0 ? "down" : "up"}">${delta > 0 ? "+" : ""}${delta.toLocaleString()}</span>`;
    body.appendChild(row);
  }

  document.getElementById("results-modal").classList.remove("hidden");
}

function closeResultsModal() {
  document.getElementById("results-modal").classList.add("hidden");
}

// Minimal UI hooks we need for navigation & gameplay.
function updatePreyOptions() {
  const predatorName = document.getElementById("predator-select").value;
  const preySelect = document.getElementById("prey-select");
  const allowed = VALID_LINKS[predatorName] || [];
  preySelect.innerHTML = "";
  for (const preyName of allowed) {
    const pop = getPreyPopulation(ecosystem, preyName);
    const opt = document.createElement("option");
    opt.value = preyName;
    opt.textContent = `${SPECIES_META[preyName].emoji} ${SPECIES_META[preyName].label} (${pop.toLocaleString()})`;
    opt.disabled = pop <= 0;
    preySelect.appendChild(opt);
  }
}

function renderHeader() {
  document.getElementById("round-num").textContent = ecosystem.roundNumber;
  document.getElementById("max-rounds").textContent = ecosystem.maxRounds;
  const stab = Math.round(ecosystem.stabilityIndex);
  document.getElementById("stability-value").textContent = stab;
  const fill = document.getElementById("stability-fill");
  fill.style.width = stab + "%";
  fill.className = "stability-fill";
  if (stab < ecosystem.collapseThreshold) fill.classList.add("critical");
  else if (stab < 50) fill.classList.add("warning");
  else fill.classList.add("healthy");

  const banner = document.getElementById("active-event-banner");
  if (ecosystem.activeEvent) {
    banner.classList.remove("hidden");
    document.getElementById("active-event-text").textContent =
      (ecosystem.activeEvent.icon || "") + " " +
      (EVENT_LABELS[ecosystem.activeEvent.name] || ecosystem.activeEvent.name) +
      " — " + ecosystem.activeEvent.description;
  } else banner.classList.add("hidden");

  document.getElementById("actions-left").textContent = ecosystem.availableActions;
  document.getElementById("dead-matter").textContent = Math.round(ecosystem.deadMatterPool).toLocaleString();
  const water = ecosystem.waterFactor ?? 1;
  document.getElementById("water-factor").textContent = (water * 100).toFixed(0) + "%";
  const waterBar = document.getElementById("water-bar");
  if (waterBar) waterBar.style.width = water * 100 + "%";
}

function renderFeedingUI() {
  const list = document.getElementById("choices-list");
  list.innerHTML = "";

  if (ecosystem.pendingChoices.length === 0) {
    list.innerHTML = '<li class="empty-choice">No feeding assigned yet — consumers may starve!</li>';
  } else {
    ecosystem.pendingChoices.forEach((c, i) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${SPECIES_META[c.predator].emoji} eats ${SPECIES_META[c.prey].emoji} <strong>${c.amount}</strong> units</span>
        <button type="button" class="btn-remove" data-index="${i}" aria-label="Remove">✕</button>
      `;
      li.querySelector(".btn-remove").addEventListener("click", () => {
        removePendingChoice(ecosystem, i);
        document.getElementById("feeding-feedback").textContent = "Choice removed. Action refunded.";
        renderAll();
      });
      list.appendChild(li);
    });
  }

  document.getElementById("resolve-btn").disabled = gameOver;
  document.getElementById("add-feed-btn").disabled =
    gameOver || ecosystem.availableActions <= 0;

  updatePreyOptions();
}

function renderSpeciesCards() {
  const grid = document.getElementById("species-grid");
  grid.innerHTML = "";

  for (const name of DISPLAY_ORDER) {
    const sp = ecosystem.speciesMap[name];
    const meta = SPECIES_META[name];
    const initial = INITIAL_POP[name];
    const pctPop = Math.min(100, (sp.population / initial) * 100);

    const fed = ecosystem.pendingChoices.filter((c) => c.predator === name);
    let feedStatus = "—";
    if (sp.isProducer) feedStatus = "☀️ Sunlight (auto)";
    else if (sp.isDecomposer) feedStatus = "♻️ Dead matter (auto)";
    else if (fed.length) feedStatus = fed.map((f) => `${SPECIES_META[f.prey].emoji} (${f.amount})`).join(", ");
    else feedStatus = '<span class="warn-text">No food!</span>';

    const card = document.createElement("article");
    card.className = "species-card" + (sp.population === 0 ? " extinct" : "");
    card.style.setProperty("--accent", meta.color);
    card.innerHTML = `
      <header>
        <span class="species-emoji">${meta.emoji}</span>
        <div>
          <h3>${meta.label}</h3>
          <span class="trophic">${meta.level}</span>
        </div>
      </header>
      <div class="pop-bar"><div class="pop-fill" style="width:${pctPop}%"></div></div>
      <dl>
        <div><dt>Population</dt><dd>${sp.population.toLocaleString()}</dd></div>
        <div><dt>Energy / ind.</dt><dd>${sp.energyPerIndividual.toFixed(2)}</dd></div>
        <div class="full"><dt>This season</dt><dd>${feedStatus}</dd></div>
      </dl>
    `;
    grid.appendChild(card);
  }
}

function renderFoodWeb() {
  // Reuse the existing SVG from the page. This matches the original game.js logic.
  const links = [
    ["Grass", "Aphid"], ["Grass", "Caterpillar"], ["Grass", "Rabbit"], ["Grass", "Mouse"],
    ["Clover", "Aphid"], ["Clover", "Caterpillar"], ["Clover", "Rabbit"], ["Clover", "Mouse"],
    ["Aphid", "BlueTit"], ["Caterpillar", "BlueTit"],
    ["Mouse", "Fox"], ["Mouse", "Hawk"],
    ["Rabbit", "Fox"], ["Rabbit", "Hawk"],
    ["BlueTit", "Fox"], ["BlueTit", "Hawk"],
  ];

  const svg = document.getElementById("food-web-svg");
  svg.querySelectorAll(".web-link, .web-node, .web-choice").forEach((el) => el.remove());

  const positions = {
    Grass: { x: 55, y: 35 }, Clover: { x: 175, y: 35 },
    Aphid: { x: 25, y: 105 }, Caterpillar: { x: 95, y: 105 },
    Mouse: { x: 165, y: 105 }, Rabbit: { x: 255, y: 105 },
    BlueTit: { x: 70, y: 175 },
    Hawk: { x: 200, y: 175 }, Fox: { x: 130, y: 245 },
    FungiBacteria: { x: 300, y: 245 },
  };

  const activePairs = new Set(
    ecosystem.pendingChoices.map((c) => `${c.predator}-${c.prey}`)
  );

  for (const [from, to] of links) {
    const a = positions[from];
    const b = positions[to];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.classList.add("web-link");
    if (activePairs.has(`${to}-${from}`)) line.classList.add("active-feed");
    const canClick =
      VALID_LINKS[to]?.includes(from) &&
      ecosystem.availableActions > 0 &&
      !gameOver &&
      getPreyPopulation(ecosystem, from) > 0 &&
      ecosystem.speciesMap[to].population > 0;
    if (canClick) {
      line.classList.add("clickable");
      line.dataset.predator = to;
      line.dataset.prey = from;
      line.addEventListener("click", () => {
        document.getElementById("predator-select").value = to;
        updatePreyOptions();
        document.getElementById("prey-select").value = from;
        document.getElementById("feeding-feedback").textContent =
          `Selected: ${SPECIES_META[to].label} → ${SPECIES_META[from].label}. Pick amount and Add.`;
        document.getElementById("feeding-feedback").className = "feeding-feedback ok";
      });
    }
    svg.appendChild(line);
  }

  for (const name of DISPLAY_ORDER) {
    const pos = positions[name];
    const sp = ecosystem.speciesMap[name];
    const meta = SPECIES_META[name];
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("web-node");
    if (sp.population === 0) g.classList.add("extinct");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const r = 18 + Math.min(12, Math.log10(sp.population + 1) * 3);
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", meta.color);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", pos.x);
    text.setAttribute("y", pos.y + 4);
    text.textContent = meta.emoji;

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", pos.x);
    label.setAttribute("y", pos.y + r + 14);
    label.classList.add("web-label");
    label.textContent = sp.population > 999 ? (sp.population / 1000).toFixed(1) + "k" : sp.population;

    g.appendChild(circle);
    g.appendChild(text);
    g.appendChild(label);
    svg.appendChild(g);
  }
}

function renderStabilityChart() {
  const canvas = document.getElementById("stability-chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const data = history.map((x) => x.stability);
  if (data.length < 2) return;

  const thresholdY = h - (ecosystem.collapseThreshold / 100) * h;
  ctx.strokeStyle = "#334155";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(w, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px sans-serif";
  ctx.fillText("Collapse (18)", 4, thresholdY - 4);

  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const step = w / (data.length - 1);
  data.forEach((val, i) => {
    const x = i * step;
    const y = h - (val / 100) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderQuickLinks() {
  const grid = document.getElementById("quick-links");
  grid.innerHTML = "";
  const presets = [
    ["Aphid", "Grass", 120],
    ["Mouse", "Clover", 110],
    ["Rabbit", "Grass", 200],
    ["BlueTit", "Aphid", 80],
    ["Fox", "Rabbit", 60],
    ["Hawk", "Mouse", 50],
  ];

  for (const [pred, prey, amt] of presets) {
    const preyPop = getPreyPopulation(ecosystem, prey);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-btn";
    btn.disabled =
      gameOver ||
      ecosystem.availableActions <= 0 ||
      preyPop <= 0 ||
      ecosystem.speciesMap[pred].population <= 0;
    btn.innerHTML = `${SPECIES_META[pred].emoji}→${SPECIES_META[prey].emoji} (${amt})`;
    btn.title = `Assign: ${SPECIES_META[pred].label} eats ${SPECIES_META[prey].label}`;
    btn.addEventListener("click", () => onQuickFeed(pred, prey, amt));
    grid.appendChild(btn);
  }
}

function renderAll() {
  renderHeader();
  renderFeedingUI();
  renderSpeciesCards();
  renderFoodWeb();
  renderStabilityChart();
  renderQuickLinks();
}

function onAddFeeding() {
  const predator = document.getElementById("predator-select").value;
  const prey = document.getElementById("prey-select").value;
  const amount = document.getElementById("amount-input").value;
  const feedback = document.getElementById("feeding-feedback");

  const result = addPlayerChoice(ecosystem, predator, prey, amount);
  feedback.textContent = result.msg;
  feedback.className = "feeding-feedback " + (result.ok ? "ok" : "err");

  if (result.ok) {
    selectedPredator = null;
    selectedPrey = null;
    updatePreyOptions();
  }
  renderAll();
}

function onQuickFeed(predator, prey, amount) {
  const feedback = document.getElementById("feeding-feedback");
  const result = addPlayerChoice(ecosystem, predator, prey, amount);
  feedback.textContent = result.msg;
  feedback.className = "feeding-feedback " + (result.ok ? "ok" : "err");
  renderAll();
}

document.addEventListener("DOMContentLoaded", () => {
  // Auth UI
  document
    .getElementById("google-login-btn")
    ?.addEventListener("click", handleGoogleLogin);
  document
    .getElementById("logout-btn")
    ?.addEventListener("click", handleLogout);
  document
    .getElementById("refresh-leaderboard-btn")
    ?.addEventListener("click", loadLeaderboard);

  // Start screen: leaderboard navigation
  document.getElementById("leaderboard-btn")?.addEventListener("click", () => {
    renderUserChip();
    showLeaderboardScreen();
    void loadLeaderboard();
  });

  // End screen: go to leaderboard
  document.getElementById("go-to-leaderboard-btn")?.addEventListener("click", () => {
    renderUserChip();
    showLeaderboardScreen();
    void loadLeaderboard();
  });

  // Leaderboard: back to menu
  document.getElementById("back-to-start-btn")?.addEventListener("click", () => {
    showStartScreen();
  });

  // Game UI (only usable when logged in)
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("add-feed-btn").addEventListener("click", onAddFeeding);
  document.getElementById("resolve-btn").addEventListener("click", finishFeedingPhase);
  document.getElementById("predator-select").addEventListener("change", updatePreyOptions);
  document.getElementById("restart-btn").addEventListener("click", () => {
    document.getElementById("end-screen").classList.add("hidden");
    showStartScreen();
  });
  document.getElementById("event-modal-close").addEventListener("click", closeEventModal);
  document.getElementById("results-close").addEventListener("click", closeResultsModal);

  // Auth state
  onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;
    if (!currentUser) {
      stopInactivityTracking();
      showAuthScreen();
      return;
    }
    renderUserChip();
    startInactivityTracking();
    showStartScreen();
    await loadLeaderboard();
  });
});

