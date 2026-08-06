// src/features/onboarding/constants/jarCreateTutorialSteps.js

/*
 * JAR_CREATE_TUTORIAL_TARGET 역할
 *
 * 새 저금통 만들기 화면에서
 * 튜토리얼이 어떤 영역을 강조할지 구분한다.
 *
 * 입력 항목을 하나씩 따로 안내해서
 * 강조 영역과 설명 카드가 화면 밖으로 커지지 않게 한다.
 */
export const JAR_CREATE_TUTORIAL_TARGET =
  Object.freeze({
    // 왼쪽의 저금통 종류 선택 영역
    TEMPLATE: "TEMPLATE",

    // 오른쪽 저금통 미리보기
    PREVIEW: "PREVIEW",

    // 저금통 이름 입력
    NAME: "NAME",

    // 저금통 설명 입력
    DESCRIPTION: "DESCRIPTION",

    // 테마 선택
    THEME: "THEME",

    // 최대 인원 설정
    MAX_MEMBERS: "MAX_MEMBERS",

    // 오픈 날짜 설정
    OPEN_AT: "OPEN_AT",

    // 최종 생성 버튼
    SUBMIT: "SUBMIT",
  });

/*
 * JAR_CREATE_TUTORIAL_STEPS 역할
 *
 * 새 저금통 만들기 페이지에서 보여줄
 * 8단계 안내 문구와 강조 대상을 관리한다.
 */
export const JAR_CREATE_TUTORIAL_STEPS =
  Object.freeze([
    {
      id: "SELECT_TEMPLATE",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.TEMPLATE,

      title:
        "어떤 저금통을 만들고 싶어요?",

      description:
        "왼쪽의 8가지 저금통 중 원하는 분위기를 선택해보세요.\n카드를 누르면 해당 저금통의 기본 정보가 바로 적용돼요.",
    },
    {
      id: "CHECK_PREVIEW",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.PREVIEW,

      title:
        "완성될 저금통을 미리 확인해요",

      description:
        "오른쪽 미리보기에서 선택한 저금통의 색상과 모양,\n움직이는 장식과 입력한 정보를 바로 확인할 수 있어요.",
    },
    {
      id: "WRITE_NAME",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.NAME,

      title:
        "저금통 이름을 정해보세요",

      description:
        "이 저금통에 붙이고 싶은 이름을\n자유롭게 입력해보세요.",
    },
    {
      id: "WRITE_DESCRIPTION",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.DESCRIPTION,

      title:
        "저금통에 대한 설명을 남겨보세요",

      description:
        "함께 담을 이야기나 사용 목적처럼\n저금통을 소개할 내용을 자유롭게 작성할 수 있어요.",
    },
    {
      id: "SELECT_THEME",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.THEME,

      title:
        "저금통 테마를 선택해보세요",

      description:
        "테마를 변경하면 저금통의 색상과 장식이 바뀌고 \n오른쪽 미리보기에도 바로 반영돼요.",
    },
    {
      id: "SET_MAX_MEMBERS",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.MAX_MEMBERS,

      title:
        "함께할 수 있는 인원을 정해요",

      description:
        "최대 인원은 방장을 포함해\n2명부터 50명까지 설정할 수 있어요.",
    },
    {
      id: "SET_OPEN_DATE",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.OPEN_AT,

      title:
        "저금통을 열 날짜를 정해요",

      description:
        "설정한 날짜가 되면 저금통이 열리고\n함께 모은 추억을 확인할 수 있어요.",
    },
    {
      id: "CREATE_JAR",

      targetKey:
        JAR_CREATE_TUTORIAL_TARGET.SUBMIT,

      title:
        "준비가 끝나면 저금통을 만들어요",

      description:
        "입력한 정보와 오른쪽 미리보기를 확인한 뒤\n저금통 만들기 버튼을 눌러주세요.",
    },
  ]);