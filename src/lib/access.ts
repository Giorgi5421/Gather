import {prisma} from "@/lib/prisma";

export async function canViewPost(userId:string,postId:string){
  const post=await prisma.post.findUnique({where:{id:postId},select:{authorId:true,visibility:true,groupId:true,pageId:true,author:{select:{privacy:true}}}});
  if(!post)return false;if(post.authorId===userId)return true;
  if(post.groupId)return Boolean(await prisma.groupMember.findUnique({where:{groupId_userId:{groupId:post.groupId,userId}},select:{id:true}}));
  if(post.visibility==="PRIVATE"||post.author.privacy==="PRIVATE")return false;
  if(post.visibility==="PUBLIC"&&post.author.privacy==="PUBLIC")return true;
  if(post.author.privacy==="PUBLIC"&&post.visibility==="PUBLIC")return true;
  return Boolean(await prisma.friendship.findFirst({where:{status:"ACCEPTED",OR:[{requesterId:userId,addresseeId:post.authorId},{requesterId:post.authorId,addresseeId:userId}]},select:{id:true}}));
}
