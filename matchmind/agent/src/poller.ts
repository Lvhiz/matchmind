import "dotenv/config";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import cron from "node-cron";

const API_BASE = "https://api.football-data.org/v4/";
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

type FootballDataMatch = {
  id: number;
  minute?: number | null;
  homeTeam?: {
    name?: string | null;
  } | null;
  awayTeam?: {
    name?: string | null;
  } | null;
  score?: {
    fullTime?: {
      home?: number | null;
      away?: number | null;
    } | null;
  } | null;
};

type FootballDataLiveResponse = {
  matches?: FootballDataMatch[];
};

let started = false;

export function startPolling(onUpdate: (state: MatchState) => void): void {
  if (started) {
    return;
  }

  started = true;

  pollLiveMatches(onUpdate).catch((error) => {
    console.error("[poller] Initial poll failed:", error);
  });

  cron.schedule("* * * * *", () => {
    pollLiveMatches(onUpdate).catch((error) => {
      console.error("[poller] Scheduled poll failed:", error);
    });
  });
}

async function pollLiveMatches(onUpdate: (state: MatchState) => void): Promise<void> {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    console.warn("[poller] FOOTBALL_API_KEY is not set");
    writeState([]);
    return;
  }

  const { data } = await axios.get<FootballDataLiveResponse>("matches?status=LIVE", {
    baseURL: API_BASE,
    headers: {
      "X-Auth-Token": apiKey,
    },
    timeout: 30_000,
  });

  const matches = Array.isArray(data.matches) ? data.matches : [];

  if (matches.length === 0) {
    console.log("No live matches currently");
    writeState([]);
    return;
  }

  const states = matches.map(toMatchState);

  for (const state of states) {
    onUpdate(state);
  }

  writeState(states);
}

function toMatchState(match: FootballDataMatch): MatchState {
  return {
    fixtureId: match.id,
    homeTeam: match.homeTeam?.name ?? "Home",
    awayTeam: match.awayTeam?.name ?? "Away",
    score: {
      home: match.score?.fullTime?.home || 0,
      away: match.score?.fullTime?.away || 0,
    },
    elapsed: match.minute || 0,
    possession: { home: 50, away: 50 },
    shotsOnTarget: { home: 0, away: 0 },
    xG: { home: 0, away: 0 },
    recentEvents: [],
    lastUpdated: new Date(),
  };
}

function writeState(matches: MatchState[]): void {
  const payload = {
    matches: matches.map((match) => ({
      ...match,
      lastUpdated: match.lastUpdated.toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}
