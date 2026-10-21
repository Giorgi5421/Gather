import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/http";
import { z } from "zod";

type RouteContext = { params: Promise<{ conversationId: string; messageId: string }> };

async function ownedMessage(conversationId: string, messageId: string, userId: string) {
  const participant = await prisma.participant.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { id: true } });
  if (!participant) return null;
  return prisma.message.findFirst({ where: { id: messageId, conversationId, senderId: userId }, select: { id: true } });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  const { conversationId, messageId } = await params;
  if (!await ownedMessage(conversationId, messageId, session.user.id)) return jsonError("Message not found", 404);
  const parsed = z.object({ content: z.string().trim().min(1).max(10000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Messages must contain up to 10,000 characters", 400);
  return Response.json(await prisma.message.update({ where: { id: messageId }, data: { content: parsed.data.content, editedAt: new Date() }, include: { sender: { select: { id: true, name: true, image: true } }, reactions: true } }));
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  const { conversationId, messageId } = await params;
  if (!await ownedMessage(conversationId, messageId, session.user.id)) return jsonError("Message not found", 404);
  await prisma.message.delete({ where: { id: messageId } });
  return Response.json({ ok: true });
}
