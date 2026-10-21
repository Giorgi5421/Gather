import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { prisma } from "../src/lib/prisma";

const port = Number(process.env.SOCKET_PORT ?? 3001);
const allowedOrigins = new Set([process.env.SOCKET_ALLOWED_ORIGIN ?? "http://127.0.0.1:3010"]);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:3010");
  allowedOrigins.add("http://127.0.0.1:3010");
}
const http = createServer();
const io = new Server(http, { cors: { origin: [...allowedOrigins], credentials: true } });
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
const userRoom = (id: string) => `user:${id}`;
const conversationRoom = (id: string) => `conversation:${id}`;

io.use((socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token ?? "");
    const [head, body, signature] = token.split(".");
    if (!head || !body || !signature || !secret.length) throw new Error("Invalid token");
    const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid signature");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload.sub !== "string" || payload.exp < Date.now() / 1000) throw new Error("Expired token");
    socket.data.userId = payload.sub;
    next();
  } catch { next(new Error("Unauthorized")); }
});

async function isParticipant(conversationId: string, userId: string) {
  return prisma.participant.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { id: true } });
}

async function notifyFriendsPresence(userId: string, online: boolean) {
  const friendships = await prisma.friendship.findMany({ where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] }, select: { requesterId: true, addresseeId: true } });
  const friendIds = new Set(friendships.map((friendship) => friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId));
  for (const friendId of friendIds) io.to(userRoom(friendId)).emit("presence", { userId, online });
}

io.on("connection", (socket: Socket) => {
  const userId = socket.data.userId as string;
  void socket.join(userRoom(userId));
  void notifyFriendsPresence(userId, true);

  socket.on("presence:check", async (requestedIds: unknown) => {
    if (!Array.isArray(requestedIds)) return;
    const ids = [...new Set(requestedIds.filter((id): id is string => typeof id === "string" && id.length < 64))].slice(0, 100);
    const friendships = await prisma.friendship.findMany({ where: { status: "ACCEPTED", OR: ids.map((id) => ({ requesterId: userId, addresseeId: id })).concat(ids.map((id) => ({ requesterId: id, addresseeId: userId }))) }, select: { requesterId: true, addresseeId: true } });
    const friends = new Set(friendships.map((friendship) => friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId));
    const onlineUserIds = ids.filter((id) => friends.has(id) && (io.sockets.adapter.rooms.get(userRoom(id))?.size ?? 0) > 0);
    socket.emit("presence:sync", { onlineUserIds });
  });

  socket.on("conversation:join", async (data: { conversationId?: string }, ack?: (value: { ok: boolean }) => void) => {
    const id = data?.conversationId;
    if (!id || !await isParticipant(id, userId)) { ack?.({ ok: false }); return; }
    await socket.join(conversationRoom(id));
    ack?.({ ok: true });
  });

  socket.on("conversation:leave", async (data: { conversationId?: string }) => {
    if (typeof data?.conversationId === "string") await socket.leave(conversationRoom(data.conversationId));
  });

  socket.on("conversation:read", async (data: { conversationId?: string }) => {
    const id = data?.conversationId;
    if (!id || !await isParticipant(id, userId)) return;
    const readAt = new Date();
    await prisma.participant.update({ where: { conversationId_userId: { conversationId: id, userId } }, data: { lastReadAt: readAt } });
    socket.to(conversationRoom(id)).emit("read:receipt", { conversationId: id, userId, readAt: readAt.toISOString() });
  });

  socket.on("message:send", async (payload: { conversationId?: string; content?: string; attachmentUrl?: string; attachmentKey?: string }, ack?: (result: { ok: boolean; error?: string; id?: string }) => void) => {
    try {
      const conversationId = payload?.conversationId;
      const content = typeof payload?.content === "string" ? payload.content.trim() : "";
      if (!conversationId || content.length > 10000 || (!content && !payload?.attachmentUrl)) { ack?.({ ok: false, error: "Invalid message" }); return; }
      if (!await isParticipant(conversationId, userId)) { ack?.({ ok: false, error: "Conversation not found" }); return; }
      const message = await prisma.message.create({ data: { conversationId, senderId: userId, content, attachmentUrl: payload.attachmentUrl, attachmentKey: payload.attachmentKey }, include: { sender: { select: { id: true, name: true, image: true } }, reactions: true } });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      const recipients = await prisma.participant.findMany({ where: { conversationId, userId: { not: userId } }, select: { userId: true } });
      for (const recipient of recipients) {
        await prisma.notification.create({ data: { recipientId: recipient.userId, actorId: userId, type: "MESSAGE", message: "sent you a message." } });
        io.to(userRoom(recipient.userId)).emit("notification:new", { recipientId: recipient.userId, actorId: userId, type: "MESSAGE", message: "sent you a message.", createdAt: new Date(), actor: { name: message.sender.name } });
      }
      io.to(conversationRoom(conversationId)).emit("message:new", message);
      ack?.({ ok: true, id: message.id });
    } catch { ack?.({ ok: false, error: "Could not save message" }); }
  });

  socket.on("message:edited", async (data: { conversationId?: string; messageId?: string }) => {
    const conversationId = data?.conversationId; const messageId = data?.messageId;
    if (!conversationId || !messageId || !await isParticipant(conversationId, userId)) return;
    const message = await prisma.message.findFirst({ where: { id: messageId, conversationId }, include: { sender: { select: { id: true, name: true, image: true } }, reactions: true } });
    if (message) io.to(conversationRoom(conversationId)).emit("message:updated", message);
  });

  socket.on("message:deleted", async (data: { conversationId?: string; messageId?: string }) => {
    const conversationId = data?.conversationId; const messageId = data?.messageId;
    if (!conversationId || !messageId || !await isParticipant(conversationId, userId)) return;
    const stillExists = await prisma.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
    if (!stillExists) io.to(conversationRoom(conversationId)).emit("message:deleted", { conversationId, messageId });
  });

  socket.on("typing", async (data: { conversationId?: string; typing?: boolean }) => {
    const conversationId = data?.conversationId;
    if (!conversationId || !await isParticipant(conversationId, userId)) return;
    socket.to(conversationRoom(conversationId)).emit("typing", { conversationId, userId, typing: Boolean(data.typing) });
  });

  socket.on("disconnect", async () => {
    const sockets = await io.in(userRoom(userId)).fetchSockets();
    if (sockets.length === 0) void notifyFriendsPresence(userId, false);
  });
});

http.listen(port, () => console.log(`Socket.IO listening on ${port}`));
