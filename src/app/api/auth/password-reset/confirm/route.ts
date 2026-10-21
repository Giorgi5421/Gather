import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ token: z.string().min(20).max(100), password: z.string().min(10).max(128) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use a valid reset link and a password with at least 10 characters." }, { status: 400 });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.expiresAt < new Date()) return NextResponse.json({ error: "That reset link has expired. Request a new one." }, { status: 410 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) } }),
    prisma.passwordResetToken.delete({ where: { id: record.id } }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  return NextResponse.json({ message: "Password updated. You can now sign in." });
}
