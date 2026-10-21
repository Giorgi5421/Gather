import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ email: z.string().email().max(254).transform((value) => value.toLowerCase()) });
const generic = { message: "If that email belongs to an account, a reset link is on its way." };

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, email: true } });
  if (!user) return NextResponse.json(generic);

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.passwordResetToken.create({ data: { tokenHash, userId: user.id, expiresAt } });
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(raw)}`, process.env.AUTH_URL ?? "http://localhost:3000").toString();

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transport.sendMail({ from: process.env.RESET_EMAIL_FROM, to: user.email, subject: "Reset your Gather password", text: `This link expires in 30 minutes: ${resetUrl}` });
  } else if (process.env.NODE_ENV !== "production") {
    console.info("Development password reset link:", resetUrl);
  }
  return NextResponse.json(generic);
}
