import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });

  try {
    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 12) },
      select: { id: true, name: true, email: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (error instanceof Error && error.name === "PrismaClientInitializationError") {
      return NextResponse.json({ error: "The database is unavailable. Start PostgreSQL, then run pnpm db:migrate --name init." }, { status: 503 });
    }
    console.error("Account registration failed", error);
    return NextResponse.json({ error: "Could not create your account." }, { status: 500 });
  }
}
