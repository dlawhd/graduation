/*
 * JAR_INVITE_TUTORIAL_TARGET 역할
 *
 * 초대 관리 튜토리얼에서
 * 지금 어느 부분을 밝게 강조해야 하는지 구분한다.
 *
 * 쉽게 말하면 튜토리얼이 따라다닐
 * "목적지 이름표"를 모아둔 곳이다.
 */
export const JAR_INVITE_TUTORIAL_TARGET =
  Object.freeze({
    EXPIRES: "EXPIRES",
    MAX_USES: "MAX_USES",
    CREATE: "CREATE",
    RESULT: "RESULT",
    SHARE: "SHARE",
    REVOKE: "REVOKE",
  });

/*
 * JAR_INVITE_TUTORIAL_STEPS 역할
 *
 * 초대 관리 화면을 처음 사용하는 사람에게
 * 아래 순서대로 기능을 알려준다.
 *
 * 1. 초대코드 유효 시간
 * 2. 최대 사용 횟수
 * 3. 초대코드 생성
 * 4. 생성된 코드 확인
 * 5. 초대 링크 공유
 * 6. 초대코드 폐기
 */
export const JAR_INVITE_TUTORIAL_STEPS =
  Object.freeze([
    {
      id: "INVITE_EXPIRES",
      targetKey:
        JAR_INVITE_TUTORIAL_TARGET.EXPIRES,

      title: "초대 링크의 유효 시간을 정해요",

      description:
        "초대코드를 몇 시간 동안 사용할 수 있을지 정할 수 있어요.\n1시간부터 최대 168시간까지 설정할 수 있어요.",
    },
    {
      id: "INVITE_MAX_USES",
      targetKey:
        JAR_INVITE_TUTORIAL_TARGET.MAX_USES,

      title: "사용할 수 있는 횟수를 정해요",

      description:
        "하나의 초대코드로 몇 명까지 참여할 수 있을지 정해요.\n1회부터 최대 50회까지 설정할 수 있어요.",
    },
    {
      id: "INVITE_CREATE",
      targetKey:
        JAR_INVITE_TUTORIAL_TARGET.CREATE,

      title: "이제 초대코드를 만들어요",

      description:
        "설정을 확인한 뒤 초대코드 만들기 버튼을 눌러주세요.\n코드가 만들어지면 다음 사용 방법도 이어서 알려드릴게요.",
    },
    {
      id: "INVITE_RESULT",
      targetKey:
        JAR_INVITE_TUTORIAL_TARGET.RESULT,

      title: "초대코드가 만들어졌어요",

      description:
        "여기에서 초대코드와 초대 링크, 만료 시간과 사용 횟수를 한 번에 확인할 수 있어요.",
    },
    {
      id: "INVITE_SHARE",
      targetKey:
        JAR_INVITE_TUTORIAL_TARGET.SHARE,

      title: "친구에게 초대 링크를 보내보세요",

      description:
        "링크 복사를 누르면 바로 공유할 수 있는 주소가 복사돼요.\n필요하면 왼쪽의 코드 복사도 사용할 수 있어요.",
    },
    {
      id: "INVITE_REVOKE",
      targetKey:
        JAR_INVITE_TUTORIAL_TARGET.REVOKE,

      title: "필요 없어진 코드는 폐기할 수 있어요",

      description:
        "더 이상 사용하지 않을 초대코드는 폐기할 수 있어요.\n폐기한 코드는 새로운 사람이 사용할 수 없어요.",
    },
  ]);