import { z } from "zod";

const localMediaUrl = z.string().regex(/^\/uploads\/users\/[a-zA-Z0-9_-]+\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|webm)$/i);
export const mediaUrlSchema = z.union([z.string().url(), localMediaUrl]);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
});

export const postSchema = z.object({
  content: z.string().trim().max(5000).default(""),
  visibility: z.enum(["PUBLIC", "FRIENDS_ONLY", "PRIVATE"]).default("FRIENDS_ONLY"),
  feeling: z.string().trim().max(80).optional(),
  groupId: z.string().cuid().optional(),
  pageId: z.string().cuid().optional(),
  media: z.array(z.object({ key: z.string().min(1).max(512), url: mediaUrlSchema, mediaType: z.enum(["image", "video"]), mimeType: z.string().max(100), size: z.number().int().positive().max(100 * 1024 * 1024) })).max(10).default([]),
}).refine((value) => value.content.length > 0 || value.media.length > 0, "A post needs text or media.").refine((value) => !(value.groupId && value.pageId), "Choose a group or a page, not both.");

export const commentSchema = z.object({ content: z.string().trim().min(1).max(3000), parentId: z.string().cuid().optional() });
