import { prisma } from "@/lib/prisma";

export async function acceptedFriendIds(userId: string) {
  const records = await prisma.friendship.findMany({
    where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return records.map((record: { requesterId: string; addresseeId: string }) => record.requesterId === userId ? record.addresseeId : record.requesterId);
}
