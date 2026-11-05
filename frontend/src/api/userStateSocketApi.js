/** 본인 전용 상태 채널이다. 메시지는 재조회 신호로만 쓰고 실제 내용은 기존 API에서 권한을 다시 검사한다. */
export function subscribeUserStateSocket({subscribe,userId,onChanged}) {
  return subscribe({destination:`/topic/users/${userId}/state`,onMessage:message=>{
    let event;try{event=JSON.parse(message.body);}catch{return;}
    if(!event||!["JAR_CHANGED","JAR_LIST_CHANGED","JAR_ACCESS_REVOKED","INVITES_CHANGED","SUPPORT_CHANGED"].includes(event.type))return;
    const id=event.type==="SUPPORT_CHANGED"?event.inquiryId:event.jarId;
    if(!Number.isSafeInteger(Number(id))||Number(id)<=0)return;
    onChanged(event);
  }});
}
