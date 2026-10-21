import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { acceptedFriendIds } from "@/lib/friends";
import { postSchema } from "@/lib/validation";
import { jsonError } from "@/lib/http";
import { canViewPost } from "@/lib/access";

export async function GET(request: Request) {
  const session=await auth(); if(!session?.user?.id)return jsonError("Unauthorized",401);
  const url=new URL(request.url); const cursor=url.searchParams.get("cursor");
  const friendIds=await acceptedFriendIds(session.user.id); const visibleIds=[session.user.id,...friendIds];const [memberships,follows]=await Promise.all([prisma.groupMember.findMany({where:{userId:session.user.id},select:{groupId:true}}),prisma.pageFollower.findMany({where:{userId:session.user.id},select:{pageId:true}})]);const [owned]=await Promise.all([prisma.page.findMany({where:{ownerId:session.user.id},select:{id:true}})]);const groupIds=memberships.map(x=>x.groupId);const pageIds=[...new Set([...follows.map(x=>x.pageId),...owned.map(x=>x.id)])];
  const rows=await prisma.post.findMany({where:{OR:[{authorId:{in:visibleIds},visibility:{in:["PUBLIC","FRIENDS_ONLY"]}},{authorId:session.user.id},{visibility:"PUBLIC",author:{privacy:"PUBLIC"}},{groupId:{in:groupIds}},{pageId:{in:pageIds}}]},include:{author:{select:{id:true,name:true,image:true}},group:{select:{id:true,name:true}},page:{select:{id:true,name:true}},media:true,reactions:{select:{type:true,userId:true}},originalPost:{include:{author:{select:{id:true,name:true,image:true}},media:true}},_count:{select:{comments:true}}},orderBy:{createdAt:"desc"},take:21,...(cursor?{skip:1,cursor:{id:cursor}}:{})});
  const hasMore=rows.length>20; const items=await Promise.all(rows.slice(0,20).map(async row=>row.originalPost&&!await canViewPost(session.user.id,row.originalPost.id)?{...row,originalPost:null}:row)); return Response.json({items,nextCursor:hasMore?items.at(-1)?.id:null});
}
export async function POST(request:Request){
  const session=await auth();if(!session?.user?.id)return jsonError("Unauthorized",401);
  const parsed=postSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return jsonError("Invalid post",400);
  if(parsed.data.groupId&&!await prisma.groupMember.findUnique({where:{groupId_userId:{groupId:parsed.data.groupId,userId:session.user.id}},select:{id:true}}))return jsonError("Join that group before posting",403);if(parsed.data.pageId&&!await prisma.page.findFirst({where:{id:parsed.data.pageId,ownerId:session.user.id},select:{id:true}}))return jsonError("Only page owners can publish on a page",403);
  const post=await prisma.post.create({data:{authorId:session.user.id,content:parsed.data.content,visibility:parsed.data.visibility,feeling:parsed.data.feeling,groupId:parsed.data.groupId,pageId:parsed.data.pageId,media:{create:parsed.data.media??[]}},include:{author:{select:{id:true,name:true,image:true}},group:{select:{id:true,name:true}},page:{select:{id:true,name:true}},media:true,reactions:true,_count:{select:{comments:true}}}});
  return Response.json(post,{status:201});
}
