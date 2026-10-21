import { NextResponse } from "next/server";

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export const jsonError = apiError;

export async function readJson<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}
