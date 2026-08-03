// src/features/onboarding/components/WelcomeTutorialVisual.jsx

import MemoryJarLogoIcon from "../../../components/icons/MemoryJarLogoIcon";
import NoteIntoJarIcon from "../../../components/icons/NoteIntoJarIcon";
import MemoryDrawNoteIcon from "../../../components/icons/MemoryDrawNoteIcon";

/*
 * WelcomeTutorialVisual 역할
 *
 * WELCOME 온보딩의 현재 단계에 맞는 SVG 그림을 보여준다.
 *
 * 기존 Memory Jar 프로젝트에서 직접 만든 SVG를 재사용하므로
 * 로그인 화면과 서비스 소개 화면의 디자인이 자연스럽게 연결된다.
 */
export default function WelcomeTutorialVisual({
  visualKey,
}) {
  /*
   * 첫 번째 단계:
   * Memory Jar 저금통 로고를 크게 보여준다.
   */
  if (visualKey === "JAR") {
    return (
      <div className="relative flex h-[210px] items-center justify-center overflow-hidden">
        {/* 뒤쪽의 은은한 빛 */}
        <div className="absolute h-40 w-40 rounded-full bg-gradient-to-br from-cyan-200/60 via-violet-100/60 to-rose-100/70 blur-2xl" />

        {/* 작은 장식 점 */}
        <span className="absolute left-[18%] top-[28%] h-3 w-3 rounded-full bg-cyan-300/70" />
        <span className="absolute right-[20%] top-[22%] h-2.5 w-2.5 rounded-full bg-rose-300/70" />
        <span className="absolute bottom-[22%] right-[24%] h-2 w-2 rounded-full bg-emerald-300/70" />

        {/* 실제 저금통 아이콘 */}
        <div className="relative rounded-[36px] border border-white/90 bg-white/65 p-6 shadow-[0_24px_60px_rgba(14,165,233,0.16)] backdrop-blur">
          <MemoryJarLogoIcon className="h-28 w-28 md:h-32 md:w-32" />
        </div>
      </div>
    );
  }

  /*
   * 두 번째 단계:
   * 쪽지가 저금통 안으로 들어가는 그림을 보여준다.
   */
  if (visualKey === "NOTE_INTO_JAR") {
    return (
      <div className="flex h-[210px] items-center justify-center overflow-hidden">
        <NoteIntoJarIcon
          sizeClass="h-44 w-full max-w-[320px]"
          withShadow
        />
      </div>
    );
  }

  /*
   * 세 번째 단계:
   * 약속한 날 다시 꺼내보는 접힌 추억 쪽지를 보여준다.
   */
  return (
    <div className="relative flex h-[210px] items-center justify-center overflow-hidden">
      {/* 쪽지 뒤쪽의 은은한 배경 빛 */}
      <div className="absolute h-36 w-36 rounded-full bg-gradient-to-br from-amber-100 via-rose-100 to-cyan-100 blur-2xl" />

      <div className="relative">
        <MemoryDrawNoteIcon
          sizeClass="h-36 w-36 md:h-40 md:w-40"
          withShadow
          withDecorations
        />

        {/* 다시 만나는 순간을 표현하는 작은 반짝임 */}
        <span className="absolute -left-2 top-5 text-xl">
          ✦
        </span>

        <span className="absolute -right-3 top-12 text-lg">
          ✧
        </span>
      </div>
    </div>
  );
}