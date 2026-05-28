// MOCK MODE - hackathon demo only. Replace with real API before production.
import * as fs from "fs";
import * as path from "path";
import cron from "node-cron";

const STATE_PATH = path.resolve(__dirname, "../state.json");

export type MatchState = {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  score: { home: number; away: number };
  elapsed: number;
  possession: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  xG: { home: number; away: number };
  recentEvents: Array<{
    type: string;
    team: string;
    minute: number;
    detail: string;
  }>;
  lastUpdated: Date;
};

type MatchEvent = MatchState["recentEvents"][number];

let state = createInitialState();
let started = false;

export function startPolling(onUpdate: (state: MatchState) => void): void {
  if (started) {
    return;
  }

  started = true;

  tick(onUpdate);

  cron.schedule("* * * * *", () => {
    tick(onUpdate);
  });
}

function tick(onUpdate: (state: MatchState) => void): void {
  state = nextState(state);
  writeState(state);
  onUpdate(cloneState(state));
  console.log(`⚽ [MOCK] minute ${state.elapsed} | ${state.score.home}-${state.score.away}`);
}

function createInitialState(): MatchState {
  return {
    fixtureId: 19620260528,
    homeTeam: "Brazil",
    awayTeam: "Argentina",
    score: { home: 0, away: 0 },
    elapsed: 0,
    possession: { home: 52, away: 48 },
    shotsOnTarget: { home: 0, away: 0 },
    xG: { home: 0, away: 0 },
    recentEvents: [],
    lastUpdated: new Date(),
  };
}

function nextState(current: MatchState): MatchState {
  if (current.elapsed >= 90) {
    return createInitialState();
  }

  const elapsed = current.elapsed + 1;
  const homePossession = randomInt(45, 65);
  const next: MatchState = {
    ...current,
    elapsed,
    possession: {
      home: homePossession,
      away: 100 - homePossession,
    },
    score: { ...current.score },
    shotsOnTarget: { ...current.shotsOnTarget },
    xG: {
      home: round2(current.xG.home + randomFloat(0.01, 0.05)),
      away: round2(current.xG.away + randomFloat(0.01, 0.05)),
    },
    recentEvents: [...current.recentEvents],
    lastUpdated: new Date(),
  };

  maybeAddEvent(next);
  next.recentEvents = next.recentEvents.slice(-12);

  return next;
}

function maybeAddEvent(match: MatchState): void {
  const roll = Math.random();

  if (roll < 0.05) {
    addGoal(match);
    return;
  }

  if (roll < 0.08) {
    addYellowCard(match);
    return;
  }

  if (roll < 0.16) {
    addShotOnTarget(match);
  }
}

function addGoal(match: MatchState): void {
  const team = pickTeam(match);
  const side = team === match.homeTeam ? "home" : "away";

  match.score[side] += 1;
  match.xG[side] = round2(match.xG[side] + 0.15);
  match.recentEvents.push({
    type: "goal",
    team,
    minute: match.elapsed,
    detail: `${team} scores after sustained pressure`,
  });
}

function addYellowCard(match: MatchState): void {
  const team = pickTeam(match);

  match.recentEvents.push({
    type: "yellow_card",
    team,
    minute: match.elapsed,
    detail: `${team} player booked for a late challenge`,
  });
}

function addShotOnTarget(match: MatchState): void {
  const team = pickTeam(match);
  const side = team === match.homeTeam ? "home" : "away";

  match.shotsOnTarget[side] += 1;
  match.xG[side] = round2(match.xG[side] + randomFloat(0.04, 0.12));
  match.recentEvents.push({
    type: "shot_on_target",
    team,
    minute: match.elapsed,
    detail: `${team} forces a save with a shot on target`,
  });
}

function pickTeam(match: MatchState): string {
  return Math.random() < match.possession.home / 100 ? match.homeTeam : match.awayTeam;
}

function writeState(match: MatchState): void {
  const payload = {
    ...match,
    lastUpdated: match.lastUpdated.toISOString(),
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

function cloneState(match: MatchState): MatchState {
  return {
    ...match,
    score: { ...match.score },
    possession: { ...match.possession },
    shotsOnTarget: { ...match.shotsOnTarget },
    xG: { ...match.xG },
    recentEvents: match.recentEvents.map((event: MatchEvent) => ({ ...event })),
    lastUpdated: new Date(match.lastUpdated),
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
