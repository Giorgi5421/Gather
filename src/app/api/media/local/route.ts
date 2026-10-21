import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const maxBytes = 100 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function PUT(request: Request) {
  if (process.env.NODE_ENV === "production") return jsonError("Not found", 404);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError("Unauthorized", 401);

  const key = new URL(request.url).searchParams.get("key") ?? "";
  const parts = key.split("/");
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp|gif|mp4|webm)$/i.exec(parts[2] ?? "");
  if (parts.length !== 3 || parts[0] !== "users" || parts[1] !== userId || !match) return jsonError("Invalid upload key", 400);

  const mimeType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (extensions[mimeType] !== match[2].toLowerCase()) return jsonError("File type does not match the upload key", 415);
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) return jsonError("File is too large", 413);
  if (!request.body) return jsonError("Upload body is empty", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return jsonError("File is too large", 413);
      }
      chunks.push(value);
    }
  } catch {
    return jsonError("Could not read upload", 400);
  }
  if (total === 0) return jsonError("Upload body is empty", 400);

  const destination = path.join(process.cwd(), "public", "uploads", ...parts);
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.concat(chunks), { flag: "wx" });
  } catch {
    return jsonError("Could not save uploaded media", 500);
  }
  return Response.json({ ok: true }, { status: 201 });
}
