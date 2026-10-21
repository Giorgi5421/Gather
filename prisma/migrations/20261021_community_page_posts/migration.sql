ALTER TABLE "Post" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Post" ADD COLUMN "pageId" TEXT;

ALTER TABLE "Post" ADD CONSTRAINT "Post_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CommunityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Post_groupId_createdAt_idx" ON "Post"("groupId", "createdAt" DESC);
CREATE INDEX "Post_pageId_createdAt_idx" ON "Post"("pageId", "createdAt" DESC);
