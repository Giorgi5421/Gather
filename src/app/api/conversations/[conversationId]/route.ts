import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/http";
import { z } from "zod";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  const { conversationId } = await params;
  const participant = await prisma.participant.findUnique({ where: { conversationId_userId: { conversationId, userId: session.user.id } } });
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { isGroup: true } });
  if (!participant || !conversation) return jsonError("Conversation not found", 404);
  if (!conversation.isGroup || !["OWNER", "ADMIN"].includes(participant.role)) return jsonError("Only group admins can rename this conversation", 403);
  const parsed = z.object({ title: z.string().trim().min(1).max(100) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter a group name under 100 characters", 400);
  return Response.json(await prisma.conversation.update({ where: { id: conversationId }, data: { title: parsed.data.title } }));
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  const { conversationId } = await params;
  const participant = await prisma.participant.findUnique({ where: { conversationId_userId: { conversationId, userId: session.user.id } } });
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { isGroup: true } });
  if (!participant || !conversation) return jsonError("Conversation not found", 404);
  if (!conversation.isGroup || !["OWNER", "ADMIN"].includes(participant.role)) return jsonError("Only group admins can add people", 403);
  const parsed = z.object({ userIds: z.array(z.string().cuid()).min(1).max(20) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Choose up to 20 people", 400);
  const ids = [...new Set(parsed.data.userIds)].filter((id) => id !== session.user.id);
  if (!ids.length) return jsonError("Choose someone to add", 400);
  const friendships = await prisma.friendship.findMany({ where: { status: "ACCEPTED", OR: ids.map((id) => ({ requesterId: session.user!.id, addresseeId: id })).concat(ids.map((id) => ({ requesterId: id, addresseeId: session.user!.id }))) }, select: { requesterId: true, addresseeId: true } });
  const acceptedIds = new Set(friendships.map((f) => f.requesterId === session.user!.id ? f.addresseeId : f.requesterId));
  const eligible = ids.filter((id) => acceptedIds.has(id));
  if (!eligible.length) return jsonError("You can add accepted friends to a group", 403);
  await prisma.participant.createMany({ data: eligible.map((userId) => ({ conversationId, userId, role: "MEMBER" as const })), skipDuplicates: true });
  return Response.json(await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: { include: { user: { select: { id: true, name: true, image: true } } } } } }));
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  const { conversationId } = await params;
  const participant = await prisma.participant.findUnique({ where: { conversationId_userId: { conversationId, userId: session.user.id } } });
  if (!participant) return jsonError("Conversation not found", 404);
  await prisma.participant.delete({ where: { id: participant.id } });
  if (participant.role === "OWNER") {
    const nextOwner = await prisma.participant.findFirst({ where: { conversationId }, orderBy: { joinedAt: "asc" } });
    if (nextOwner) await prisma.participant.update({ where: { id: nextOwner.id }, data: { role: "OWNER" } });
  }
  return Response.json({ ok: true });
}
