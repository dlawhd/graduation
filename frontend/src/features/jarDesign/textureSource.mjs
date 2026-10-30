/** 서버가 발급한 디자인 전용 경로만 인증 API로 읽는다. 임의 URL에 로그인 정보를 보내지 않는다. */
export async function openTextureSource(imageUrl,textureUrl,{fetchBlob,createObjectURL=URL.createObjectURL,revokeObjectURL=URL.revokeObjectURL,signal}={}) {
  if(!textureUrl)return {url:imageUrl,dispose(){}};
  if(!/^\/api\/v1\/jars\/[1-9]\d*\/design\/texture\?part=(IMAGE|BODY)$/.test(textureUrl))throw new Error("Invalid texture path");
  const blob=await fetchBlob(textureUrl,signal);
  if(signal?.aborted)throw new Error("Cancelled texture load");
  if(!(blob instanceof Blob)||blob.type!=="image/png"||blob.size===0||blob.size>16*1024*1024)throw new Error("Invalid texture image");
  const url=createObjectURL(blob);let disposed=false;
  return {url,dispose(){if(!disposed){disposed=true;revokeObjectURL(url);}}};
}
