import {S3Client,PutObjectCommand} from "@aws-sdk/client-s3";import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
const bucket=process.env.S3_BUCKET;const hasStaticCredentials=Boolean(process.env.S3_ACCESS_KEY_ID&&process.env.S3_SECRET_ACCESS_KEY);const useS3=Boolean(bucket&&(process.env.NODE_ENV==="production"||hasStaticCredentials));const client=useS3?new S3Client({region:process.env.S3_REGION??"us-east-1",...(process.env.S3_ENDPOINT?{endpoint:process.env.S3_ENDPOINT,forcePathStyle:true}:{}),credentials:hasStaticCredentials?{accessKeyId:process.env.S3_ACCESS_KEY_ID!,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY!}:undefined}):null;
const extensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","video/mp4":"mp4","video/webm":"webm"};
export async function createUploadUrl(userId:string,key:string,mimeType:string){
  if(!client||!bucket){
    if(process.env.NODE_ENV==="production")throw new Error("Media storage is not configured");
    const safeKey=`users/${userId}/${key}.${extensions[mimeType]??"bin"}`;
    return{key:safeKey,uploadUrl:`/api/media/local?key=${encodeURIComponent(safeKey)}`,url:`/uploads/${safeKey}`,expiresIn:300};
  }
  const safeKey=`users/${userId}/${key}`;const url=await getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:safeKey,ContentType:mimeType}),{expiresIn:300});const publicBase=process.env.S3_PUBLIC_BASE_URL;return{key:safeKey,uploadUrl:url,url:publicBase?`${publicBase.replace(/\/$/,"")}/${safeKey}`:`https://${bucket}.s3.${process.env.S3_REGION??"us-east-1"}.amazonaws.com/${safeKey}`,expiresIn:300};
}
