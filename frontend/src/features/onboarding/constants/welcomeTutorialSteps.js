// src/features/onboarding/constants/welcomeTutorialSteps.js

/*
 * welcomeTutorialSteps 역할
 *
 * Memory Jar에 처음 들어온 사용자에게 보여줄
 * 전체 서비스 소개 3단계의 문구와 화면 정보를 관리한다.
 *
 * 문구를 모달 컴포넌트 안에 직접 적지 않고 별도 파일로 분리하면
 * 나중에 설명을 수정하거나 단계를 추가하기 쉬워진다.
 */
export const WELCOME_TUTORIAL_STEPS = Object.freeze([
  {
    // React가 각 단계를 구분할 때 사용하는 고유 이름
    id: "CREATE_JAR",

    // 화면 위쪽에 작게 보여줄 단계 문구
    stepLabel: "첫 번째 이야기",

    // 단계 제목
    title: "우리만의 추억 저금통을 만들어요",

    // \n을 기준으로 화면에서 줄바꿈된다.
    description:
      "친구, 가족, 연인과 함께 사용할 저금통을 만들고\n다시 열어볼 날짜를 약속해요.",

    // 이 단계에 어떤 그림을 보여줄지 구분하는 값
    visualKey: "JAR",
  },
  {
    id: "STORE_MEMORIES",
    stepLabel: "두 번째 이야기",
    title: "쪽지와 사진을 차곡차곡 담아요",
    description:
      "기억하고 싶은 이야기와 사진을 저금통에 넣어요.\n한 번 담은 추억은 약속한 날까지 소중하게 보관돼요.",
    visualKey: "NOTE_INTO_JAR",
  },
  {
    id: "REOPEN_MEMORIES",
    stepLabel: "세 번째 이야기",
    title: "약속한 날, 추억을 다시 만나요",
    description:
      "저금통이 열리면 함께 모은 쪽지를 확인하고\n매일 한 장씩 오늘의 추억을 뽑아볼 수 있어요.",
    visualKey: "MEMORY_DRAW",
  },
]);