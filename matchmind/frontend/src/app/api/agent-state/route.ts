import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_PATH = path.join(process.cwd(), "../agent/state.json");
const MAX_STATE_AGE_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    if (!existsSync(STATE_PATH)) {
      return NextResponse.json({ status: "offline" });
    }

    const fileStat = await stat(STATE_PATH);
    const isFresh = Date.now() - fileStat.mtimeMs < MAX_STATE_AGE_MS;

    if (!isFresh) {
      return NextResponse.json({ status: "offline" });
    }

    const fileContents = await readFile(STATE_PATH, "utf8");
    return NextResponse.json(JSON.parse(fileContents));
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}
