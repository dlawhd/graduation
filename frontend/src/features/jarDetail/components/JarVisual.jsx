import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL } from "../constants/jarDetailLabels";
import {
  createJarSnowballParticles,
  getJarSnowballTheme,
  getThemeIcon,
  getThemePalette,
} from "../theme/jarDetailTheme";

/*
 * JarVisual 역할
 *
 * 저금통 상세 페이지 가운데에 보이는
 * "큰 저금통 그림"을 담당하는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 저금통 몸통을 그리고
 * - 테마별 아이콘을 보여주고
 * - 저금통 안에서 벚꽃/눈/잎사귀 같은 장식이 떨어지게 해.
 */
export default function JarVisual({
  jar,
  jarRef,
  onClick,
  interactive = false,

  /*
   * 저금통 상세 온보딩에서
   * "쪽지 확인" 실제 버튼의 위치를 찾기 위한 Ref다.
   *
   * 평소에는 null이고,
   * JarDetailPage에서 온보딩용 Ref를 전달한다.
   */
  tutorialButtonRef = null,

  /*
   * 현재 "쪽지 확인"이 튜토리얼 대상인지 알려준다.
   *
   * true이면 버튼 주변에 밝은 ring을 보여준다.
   */
  tutorialHighlighted = false,
}) {
  const palette = getThemePalette(jar?.theme);

  // 현재 테마에 맞는 파티클 정보
  // 지금은 createJarSnowballParticles가 실제 파티클을 만들어주기 때문에
  // 이 값은 테마 존재 확인용으로만 사용할 수 있어.
  getJarSnowballTheme(jar?.theme);

  // 화면에 보이는 벚꽃/눈/잎사귀 목록
  const [particles, setParticles] = useState([]);

  // 자동으로 2~3개씩 추가하는 interval 저장소
  const snowballIntervalRef = useRef(null);

  // 각 파티클을 나중에 지우는 타이머들을 모아두는 저장소
  const particleRemoveTimerRefs = useRef([]);

  /*
   * playSnowballEffect 역할
   *
   * 파티클을 한 번에 전부 갈아끼우지 않고,
   * 2~3개씩 계속 추가해준다.
   *
   * 그래서 화면이 끊기지 않고 자연스럽게 이어져 보여.
   */
  function playSnowballEffect() {
    // 이번에 추가할 개수: 2개 또는 3개
    const nextCount = Math.random() > 0.55 ? 3 : 2;

    // 새 파티클 2~3개 생성
    const nextParticles = createJarSnowballParticles(jar?.theme, nextCount);

    // 기존 파티클은 유지하고, 새 파티클만 뒤에 추가
    setParticles((prev) => {
      // 너무 많이 쌓이면 화면이 복잡해지니까 최대 18개 정도만 유지
      const merged = [...prev, ...nextParticles];
      return merged.slice(-18);
    });

    // 각 파티클은 자기 수명이 끝나면 혼자 사라지게 한다.
    nextParticles.forEach((particle) => {
      const timerId = window.setTimeout(() => {
        setParticles((prev) =>
          prev.filter((item) => item.id !== particle.id)
        );
      }, particle.lifetime * 1000);

      particleRemoveTimerRefs.current.push(timerId);
    });
  }

  /*
   * 저금통이 화면에 보이면 파티클을 계속 조금씩 추가한다.
   *
   * 핵심:
   * - 650ms마다 2~3개씩 추가
   * - 기존 파티클은 갑자기 지우지 않음
   * - 각 파티클이 자기 애니메이션이 끝나면 알아서 사라짐
   */
  useEffect(() => {
    if (!interactive) return;

    // 처음 들어왔을 때 너무 비어 보이지 않게 바로 한 번 실행
    playSnowballEffect();

    // 이후 계속 2~3개씩 자연스럽게 추가
    snowballIntervalRef.current = window.setInterval(() => {
      playSnowballEffect();
    }, 650);

    return () => {
      // 자동 추가 interval 정리
      if (snowballIntervalRef.current) {
        window.clearInterval(snowballIntervalRef.current);
      }

      // 파티클 삭제 예약 타이머들 정리
      particleRemoveTimerRefs.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });

      particleRemoveTimerRefs.current = [];
    };
  }, [interactive, jar?.theme]);

  /*
   * 기존 "저금통 크게 보기" 기능
   *
   * 자동 효과와 분리해서,
   * 크게 보고 싶을 때는 아래 작은 버튼을 누르도록 한다.
   */
  function handleOpenZoom(e) {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  }

  return (
    <div
      ref={jarRef}
      className="relative mx-auto flex h-[320px] w-[260px] items-center justify-center outline-none"
      aria-label="저금통"
    >
      {/* 이 컴포넌트 안에서만 쓰는 애니메이션 CSS */}
      <style>
        {`
          @keyframes jarSnowballParticleFall {
            0% {
              opacity: 0;
              transform: translate(0, -10px) rotate(0deg) scale(0.75);
            }

            12% {
              opacity: 0.9;
            }

            55% {
              opacity: 0.9;
            }

            100% {
              opacity: 0;
              transform:
                translate(var(--fall-x), var(--fall-y))
                rotate(var(--fall-rotate))
                scale(1);
            }
          }

          .jar-snowball-particle {
            opacity: 0;
            transform: translate(0, -10px) rotate(0deg) scale(0.75);
            animation-name: jarSnowballParticleFall;
            animation-duration: var(--fall-duration);
            animation-delay: var(--fall-delay);
            animation-timing-function: ease-in-out;
            animation-fill-mode: both;
            will-change: transform, opacity;
          }

          @keyframes jarSnowballSoftFloat {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-3px);
            }
          }

          .jar-snowball-soft-float {
            animation: jarSnowballSoftFloat 3.2s ease-in-out infinite;
          }
        `}
      </style>

      {/* 저금통 그림 전체 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center jar-snowball-soft-float">
        {/* 뒤쪽 둥근 빛 */}
        <div
          className={`absolute inset-6 rounded-full blur-3xl ${palette.floating}`}
        />

        {/* 뚜껑 */}
        <div
          className={`absolute top-[48px] z-20 h-10 w-36 rounded-full ${palette.lid} shadow-lg`}
        />
        <div className="absolute top-[60px] z-30 h-2 w-14 rounded-full bg-slate-700/80" />

        {/* 저금통 몸통 */}
        <div
          className={`relative z-10 mt-8 h-[210px] w-[180px] overflow-hidden rounded-[42%_42%_28%_28%] border-4 ${palette.jarBody} shadow-[0_20px_50px_rgba(15,23,42,0.12)]`}
        >
          {/* 유리 느낌 하이라이트 */}
          <div className="absolute left-6 top-6 z-30 h-24 w-8 rounded-full bg-white/60 blur-sm" />
          <div className="absolute right-8 top-10 z-30 h-16 w-4 rounded-full bg-white/40 blur-sm" />

          {/* 자동 스노우볼 파티클 */}
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="jar-snowball-particle absolute z-20 select-none"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                fontSize: `${particle.size}px`,
                "--fall-x": `${particle.fallX}px`,
                "--fall-y": `${particle.fallY}px`,
                "--fall-rotate": `${particle.rotate}deg`,
                "--fall-duration": `${particle.duration}s`,
                "--fall-delay": `${particle.delay}s`,
              }}
            >
              {typeof particle.icon === "string"
                ? particle.icon
                : particle.icon.type === "emoji"
                  ? particle.icon.value
                  : particle.icon.render(particle.size)}
            </span>
          ))}

          {/* 안쪽 아이콘 */}
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3">
            <div className="flex h-[76px] w-[76px] items-center justify-center">
              {getThemeIcon(jar?.theme, 72)}
            </div>

            <div className="text-center text-xs text-slate-500">
              {ROLE_LABEL[jar?.myRole] || jar?.myRole}
            </div>
          </div>
        </div>
      </div>

      {/* 기존 확대 모달 열기 버튼 */}
      {interactive && (
        <button
          /*
           * 저금통 상세 온보딩의 "쪽지 확인" 단계에서
           * TutorialSpotlight가 이 실제 버튼의 위치를 찾는다.
           */
          ref={tutorialButtonRef}

          type="button"
          onClick={handleOpenZoom}

          className={`absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-white ${
            tutorialHighlighted
              ? "ring-4 ring-white/90"
              : ""
          }`}
        >
          쪽지 확인
        </button>
      )}
    </div>
  );
}