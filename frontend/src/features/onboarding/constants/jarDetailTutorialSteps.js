// src/features/onboarding/constants/jarDetailTutorialSteps.js

/*
 * JAR_DETAIL_TUTORIAL_TARGET 역할
 *
 * 저금통 상세 안내에서
 * 어떤 실제 버튼을 강조할지 구분하는 이름표다.
 *
 * 예:
 * NOTE       → 새 쪽지 쓰기
 * VIEW_NOTES → 쪽지 확인
 * INVITE     → 초대 관리
 * CHAT       → 저금통 채팅
 *
 * 문자열을 JarDetailPage 안에서 직접 반복하지 않고
 * 한 곳에서 관리해서 오타를 방지한다.
 */
export const JAR_DETAIL_TUTORIAL_TARGET =
  Object.freeze({
    NOTE: "NOTE",

    // 저금통 그림 아래의 "쪽지 확인" 버튼
    VIEW_NOTES: "VIEW_NOTES",

    INVITE: "INVITE",
    CHAT: "CHAT",
  });

/*
 * createJarDetailTutorialSteps 역할
 *
 * 저금통 상세 화면의 기본 온보딩 4단계를 만든다.
 *
 * 실제 화면 순서:
 *
 * 1. 새 쪽지 쓰기
 * 2. 쪽지 확인
 * 3. 초대 관리
 * 4. 저금통 채팅
 *
 * 이후 DAILY_DRAW가 별도로 이어져
 * 사용자에게는 전체 5단계 안내로 보인다.
 *
 * 초대 관리는 방장과 관리자만 실제로 사용할 수 있으므로
 * 현재 사용자의 권한에 따라 설명 문구를 다르게 반환한다.
 */
export function createJarDetailTutorialSteps({
  canManageInvites,
}) {
  return [
    {
      id: "WRITE_NOTE",
      targetKey:
        JAR_DETAIL_TUTORIAL_TARGET.NOTE,

      title: "첫 번째 추억을 남겨보세요",

      description:
        "새 쪽지 쓰기 버튼을 눌러\n기억하고 싶은 이야기와 사진을 남길 수 있어요.",
    },

    /*
     * 새로 추가하는 두 번째 단계
     *
     * JarVisual 안에 있는 실제 "쪽지 확인" 버튼을 강조한다.
     */
    {
      id: "VIEW_NOTES",
      targetKey:
        JAR_DETAIL_TUTORIAL_TARGET.VIEW_NOTES,

      title: "담아둔 추억을 확인해보세요",

      description:
        "쪽지 확인 버튼을 누르면\n저금통에 담긴 쪽지 목록과 공개 상태를 확인할 수 있어요.",
    },

    {
      id: "MANAGE_INVITE",
      targetKey:
        JAR_DETAIL_TUTORIAL_TARGET.INVITE,

      title: canManageInvites
        ? "함께할 사람을 초대해보세요"
        : "초대 관리는 이곳에서 확인해요",

      description: canManageInvites
        ? "초대 관리에서 새로운 초대코드를 만들고\n사용 중인 초대 링크를 확인하거나 폐기할 수 있어요."
        : "초대코드 생성과 관리는 방장 또는 관리자만 할 수 있어요.\n일반 멤버라면 위치만 알아두면 돼요.",
    },

    {
      id: "OPEN_CHAT",
      targetKey:
        JAR_DETAIL_TUTORIAL_TARGET.CHAT,

      title: "저금통 멤버들과 이야기해요",

      description:
        "저금통 채팅에서 함께한 사람들과\n추억에 관한 이야기를 실시간으로 나눌 수 있어요.",
    },
  ];
}