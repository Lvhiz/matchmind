import Anthropic from "@anthropic-ai/sdk";
import type { MatchState } from "./poller";
import logger from "./logger";

export type MarketSuggestion = {
  question: string;
  windowMinutes: number;
  reasoning: string;
};

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const MAX_MARKETS_PER_CYCLE = 2;

export async function generateMarkets(
  state: MatchState,
  openQuestions: string[]
): Promise<MarketSuggestion[]> {
  const fallback = buildFallbackMarkets(state, openQuestions);

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback;
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: 800,
      temperature: 0.2,
      system:
        "You generate short-lived binary prediction market suggestions for a live football match. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: buildPrompt(state, openQuestions),
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const suggestions = parseSuggestions(text, openQuestions);
    return suggestions.length > 0 ? suggestions : fallback;
  } catch (error) {
    logger.error("[marketGenerator] Failed to generate AI markets; using fallback:", error);
    return fallback;
  }
}

function buildPrompt(state: MatchState, openQuestions: string[]): string {
  return [
    "Suggest up to 2 new binary prediction markets for this live match.",
    `Fixture: ${state.fixtureId}`,
    `Match: ${state.homeTeam} vs ${state.awayTeam}`,
    `Score: ${state.score.home}-${state.score.away}`,
    `Minute: ${state.elapsed}`,
    `Possession: ${state.possession.home}-${state.possession.away}`,
    `Shots on target: ${state.shotsOnTarget.home}-${state.shotsOnTarget.away}`,
    `xG: ${state.xG.home}-${state.xG.away}`,
    `Recent events: ${JSON.stringify(state.recentEvents)}`,
    `Already open questions: ${JSON.stringify(openQuestions)}`,
    "Each suggestion needs question, windowMinutes, and reasoning.",
    "Use objective outcomes that can be resolved from score/events.",
    'Return JSON only: [{"question":"...","windowMinutes":10,"reasoning":"..."}]',
  ].join("\n");
}

function parseSuggestions(text: string, openQuestions: string[]): MarketSuggestion[] {
  const json = extractJsonArray(text);
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(normalizeSuggestion)
    .filter((suggestion): suggestion is MarketSuggestion => Boolean(suggestion))
    .filter((suggestion) => !openQuestions.includes(suggestion.question))
    .slice(0, MAX_MARKETS_PER_CYCLE);
}

function normalizeSuggestion(value: unknown): MarketSuggestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const question = typeof value.question === "string" ? value.question.trim() : "";
  const reasoning = typeof value.reasoning === "string" ? value.reasoning.trim() : "";
  const windowMinutes = Number(value.windowMinutes);

  if (!question || !reasoning || !Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    return null;
  }

  return {
    question,
    windowMinutes: Math.round(windowMinutes),
    reasoning,
  };
}

function buildFallbackMarkets(state: MatchState, openQuestions: string[]): MarketSuggestion[] {
  const candidates: MarketSuggestion[] = [
    {
      question: `Will there be another goal in ${state.homeTeam} vs ${state.awayTeam}?`,
      windowMinutes: 10,
      reasoning: "Fallback live market based on whether the total score changes during the window.",
    },
    {
      question: `Will either team record a shot on target in the next 10 minutes?`,
      windowMinutes: 10,
      reasoning: "Fallback activity market based on shots-on-target changes during the window.",
    },
  ];

  return candidates
    .filter((candidate) => !openQuestions.includes(candidate.question))
    .slice(0, MAX_MARKETS_PER_CYCLE);
}

function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not include a JSON array");
  }

  return text.slice(start, end + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
