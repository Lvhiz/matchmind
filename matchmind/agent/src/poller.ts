import axios, { AxiosInstance } from "axios";
import * as fs from "fs";
import * as path from "path";
import cron from "node-cron";

const API_BASE = "https://www.thesportsdb.com/api/v1/json/3/";
const STATE_PATH = path.resolve(__dirname, "../state.json");

/** Normalised live match state for the agent and frontend API. */
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

/** Raw live event from TheSportsDB GET /livescore.php */
export type TheSportsDbLiveEvent = {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string;
  intElapsed: string | null;
  strLeague: string;
};

type LivescoreResponse = {
  livescore?: TheSportsDbLiveEvent[] | null;
  events?: TheSportsDbLiveEvent[] | null;
};

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
});

function parseIntSafe(value: string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Map a TheSportsDB live event to {MatchState}.
 */
export function toMatchState(event: TheSportsDbLiveEvent): MatchState {
  return {
    fixtureId: parseIntSafe(event.idEvent),
    homeTeam: event.strHomeTeam ?? "",
    awayTeam: event.strAwayTeam ?? "",
    score: {
      home: parseIntSafe(event.intHomeScore),
      away: parseIntSafe(event.intAwayScore),
    },
    elapsed: parseIntSafe(event.intElapsed),
    possession: { home: 50, away: 50 },
    shotsOnTarget: { home: 0, away: 0 },
    xG: { home: 0, away: 0 },
    recentEvents: [],
    lastUpdated: new Date(),
  };
}

/**
 * Fetch all live matches from TheSportsDB.
 * GET /livescore.php
 */
export async function fetchLiveMatches(): Promise<TheSportsDbLiveEvent[]> {
  const { data } = await client.get<LivescoreResponse>("/livescore.php");

  const rows = data.livescore ?? data.events ?? [];
  return Array.isArray(rows) ? rows : [];
}

function writeState(matches: MatchState[]): void {
  const payload = {
    matches: matches.map((m) => ({
      ...m,
      lastUpdated: m.lastUpdated.toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Poll TheSportsDB every 60 seconds for live matches.
 * Never throws — errors are logged and the next cycle runs on schedule.
 */
export function startPolling(onUpdate: (state: MatchState) => void): void {
  const run = async () => {
    const ts = new Date().toISOString();
    try {
      const live = await fetchLiveMatches();
      console.log(`⚽ Polling... [${ts}] — ${live.length} live matches`);

      const states: MatchState[] = [];
      for (const event of live) {
        try {
          const state = toMatchState(event);
          states.push(state);
          onUpdate(state);
        } catch (err) {
          console.error(
            `[poller] Event ${event.idEvent} update failed:`,
            err
          );
        }
      }

      writeState(states);
    } catch (err) {
      console.error(`[poller] Poll cycle failed [${ts}]:`, err);
    }
  };

  run().catch((err) => console.error("[poller] Initial poll failed:", err));

  cron.schedule("* * * * *", () => {
    run().catch((err) => console.error("[poller] Scheduled poll failed:", err));
  });

  console.log("[poller] Started — polling TheSportsDB live matches every 60s");
}
