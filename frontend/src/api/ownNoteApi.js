import { resolvePrivateMedia } from "./privateMedia.mjs";
import apiClient from "./apiClient";

/** 작성자 번호를 보내지 않는다. 서버가 로그인 계정으로 소유권과 현재 멤버 여부를 검사한다. */
export async function getOwnNotes(jarId,{page=0,q="",signal}={}) {
  const response=await apiClient.get(`/api/v1/jars/${jarId}/notes/mine`,{params:{page,size:10,q},signal});
  return resolvePrivateMedia(response.data?.data,apiClient.defaults.baseURL,window.location.origin);
}
export async function getOwnNoteDetail(jarId,noteId,{signal}={}) {
  const response=await apiClient.get(`/api/v1/jars/${jarId}/notes/${noteId}`,{signal});
  return resolvePrivateMedia(response.data?.data,apiClient.defaults.baseURL,window.location.origin);
}
