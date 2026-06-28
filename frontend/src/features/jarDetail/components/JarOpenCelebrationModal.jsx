import { formatDate } from "../utils/jarDetailDateUtils";
import { getThemeIcon } from "../theme/jarDetailTheme";

/*
 * JarOpenCelebrationModal 역할
 *
 * 저금통이 열리는 순간 보여주는 "오픈 축하 연출" 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 화면 주변을 어둡게 만들고
 * - 저금통을 가운데 크게 보여주고
 * - 뚜껑이 열리는 모션을 보여주고
 * - 쪽지와 반짝이가 터지는 느낌을 보여준다.
 *
 * 이 컴포넌트는 데이터를 바꾸지 않고,
 * 사용자가 "오! 저금통 열렸다!" 하고 느끼게 만드는 화면 효과만 담당해.
 */
export default function JarOpenCelebrationModal({
  open,
  jar,
  palette,
  event,
  onClose,
  onViewNotes,
}) {
  // open이 false면 화면에 아무것도 만들지 않는다.
  if (!open) return null;

  // 오픈 축하 모달에서도 이모지가 아니라 우리가 만든 대표 SVG 아이콘을 사용한다.
  const themeIcon = getThemeIcon(jar?.theme, 82);

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center overflow-hidden bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <style>
        {`
          @keyframes jarOpenBackdropFade {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }

          @keyframes jarOpenStagePop {
            0% {
              opacity: 0;
              transform: translateY(28px) scale(0.72);
              filter: blur(6px);
            }
            55% {
              opacity: 1;
              transform: translateY(-8px) scale(1.05);
              filter: blur(0);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
              filter: blur(0);
            }
          }

          @keyframes jarOpenLidFly {
            0% {
              transform: translateY(0) rotate(0deg);
            }
            35% {
              transform: translateY(-12px) rotate(-4deg);
            }
            100% {
              transform: translateY(-95px) translateX(34px) rotate(28deg);
            }
          }

          @keyframes jarOpenBodyBounce {
            0%, 100% {
              transform: translateY(0) scale(1);
            }
            45% {
              transform: translateY(8px) scale(0.98);
            }
            70% {
              transform: translateY(-10px) scale(1.03);
            }
          }

          @keyframes jarOpenGlowPulse {
            0% {
              opacity: 0;
              transform: scale(0.75);
            }
            40% {
              opacity: 1;
              transform: scale(1.08);
            }
            100% {
              opacity: 0.72;
              transform: scale(1);
            }
          }

          @keyframes jarOpenNoteBurst {
            0% {
              opacity: 0;
              transform: translate(0, 40px) rotate(0deg) scale(0.4);
            }
            35% {
              opacity: 1;
            }
            100% {
              opacity: 1;
              transform:
                translate(var(--note-x), var(--note-y))
                rotate(var(--note-rotate))
                scale(1);
            }
          }

          @keyframes jarOpenSparkleBurst {
            0% {
              opacity: 0;
              transform: translate(0, 0) scale(0.3);
            }
            45% {
              opacity: 1;
            }
            100% {
              opacity: 0.95;
              transform:
                translate(var(--sparkle-x), var(--sparkle-y))
                scale(1);
            }
          }

          @keyframes jarOpenTextUp {
            0% {
              opacity: 0;
              transform: translateY(16px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .jar-open-backdrop {
            animation: jarOpenBackdropFade 220ms ease-out both;
          }

          .jar-open-stage {
            animation: jarOpenStagePop 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .jar-open-lid {
            animation: jarOpenLidFly 900ms 520ms cubic-bezier(0.2, 1, 0.22, 1) both;
            transform-origin: center;
          }

          .jar-open-body {
            animation: jarOpenBodyBounce 900ms 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .jar-open-glow {
            animation: jarOpenGlowPulse 1100ms 420ms ease-out both;
          }

          .jar-open-note {
            animation: jarOpenNoteBurst 950ms 760ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          .jar-open-sparkle {
            animation: jarOpenSparkleBurst 900ms 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          .jar-open-text {
            animation: jarOpenTextUp 500ms 1100ms ease-out both;
          }
        `}
      </style>

      {/* 배경 반짝이 */}
      <div className="jar-open-backdrop pointer-events-none absolute inset-0">
        <div className="absolute left-[12%] top-[18%] h-32 w-32 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute right-[14%] top-[22%] h-40 w-40 rounded-full bg-yellow-200/20 blur-3xl" />
        <div className="absolute bottom-[12%] left-[28%] h-44 w-44 rounded-full bg-emerald-200/15 blur-3xl" />
      </div>

      {/* 가운데 무대 */}
      <div className="jar-open-stage relative w-full max-w-2xl rounded-[38px] border border-white/30 bg-white/95 px-6 py-8 text-center shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-sm font-black text-slate-500 transition hover:bg-slate-50"
        >
          ✕
        </button>

        <div className="relative mx-auto mb-6 flex h-[360px] max-w-[420px] items-center justify-center">
          {/* 열릴 때 나오는 빛 */}
          <div className={`jar-open-glow absolute h-72 w-72 rounded-full blur-3xl ${palette.floating}`} />
          <div className="jar-open-glow absolute h-52 w-52 rounded-full bg-yellow-200/50 blur-2xl" />

          {/* 터지는 쪽지들 */}
          {[
            { x: "-145px", y: "-120px", r: "-18deg", t: "추억" },
            { x: "-95px", y: "-185px", r: "14deg", t: "사진" },
            { x: "120px", y: "-150px", r: "18deg", t: "쪽지" },
            { x: "155px", y: "-70px", r: "-12deg", t: "기억" },
            { x: "-165px", y: "-25px", r: "10deg", t: "마음" },
            { x: "55px", y: "-215px", r: "-8deg", t: "우리" },
          ].map((note, index) => (
            <div
              key={`${note.t}-${index}`}
              className="jar-open-note absolute left-1/2 top-1/2 z-30 flex h-[70px] w-[88px] items-center justify-center rounded-[18px] border-2 border-sky-300 bg-white/95 text-xs font-black text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.22)]"
              style={{
                "--note-x": note.x,
                "--note-y": note.y,
                "--note-rotate": note.r,
              }}
            >
              <span>{note.t}</span>
              <span className="absolute right-0 top-0 h-4 w-4 rounded-bl-[10px] border-b-2 border-l-2 border-sky-300 bg-white" />
            </div>
          ))}

          {/* 터지는 반짝이들 */}
          {[
            { x: "-190px", y: "-160px", icon: "✨" },
            { x: "190px", y: "-145px", icon: "💫" },
            { x: "-210px", y: "10px", icon: "🌟" },
            { x: "205px", y: "20px", icon: "✨" },
            { x: "-50px", y: "-235px", icon: "💛" },
            { x: "75px", y: "-240px", icon: "🌿" },
          ].map((sparkle, index) => (
            <div
              key={`${sparkle.icon}-${index}`}
              className="jar-open-sparkle absolute left-1/2 top-1/2 z-40 text-3xl"
              style={{
                "--sparkle-x": sparkle.x,
                "--sparkle-y": sparkle.y,
              }}
            >
              {sparkle.icon}
            </div>
          ))}

          {/* 저금통 */}
          <div className="relative z-20 mt-16 h-[250px] w-[210px]">
            {/* 뚜껑 */}
            <div
              className={`jar-open-lid absolute left-1/2 top-0 z-30 h-12 w-44 -translate-x-1/2 rounded-full ${palette.lid} shadow-[0_18px_34px_rgba(15,23,42,0.22)]`}
            />
            <div className="jar-open-lid absolute left-1/2 top-[16px] z-40 h-2.5 w-20 -translate-x-1/2 rounded-full bg-slate-700/80" />

            {/* 몸통 */}
            <div
              className={`jar-open-body absolute bottom-0 left-1/2 h-[220px] w-[190px] -translate-x-1/2 rounded-[42%_42%_28%_28%] border-[5px] ${palette.jarBody} shadow-[0_28px_70px_rgba(15,23,42,0.22)]`}
            >
              <div className="absolute left-7 top-8 h-28 w-9 rounded-full bg-white/60 blur-sm" />
              <div className="absolute right-8 top-12 h-20 w-5 rounded-full bg-white/40 blur-sm" />

              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="flex h-[90px] w-[90px] items-center justify-center">
                  {themeIcon}
                </div>

                <div className="rounded-full bg-white/85 px-4 py-2 text-sm font-black text-emerald-700 shadow">
                  OPEN
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 안내 문구 */}
        <div className="jar-open-text">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-500">
            Jar Opened
          </p>

          <h2 className="mt-3 text-3xl font-black text-slate-900 md:text-4xl">
            저금통이 열렸어요!
          </h2>

          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-500">
            이제 잠겨 있던 추억을 확인할 수 있어요.
            쪽지 목록이 자동으로 새로고침되고, 채팅방에도 오픈 메시지가 남아요.
          </p>

          {event?.openedAt && (
            <p className="mt-3 text-xs font-bold text-slate-400">
              열린 시간: {formatDate(event.openedAt)}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onViewNotes}
              className={`rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition hover:scale-[1.03] ${palette.primaryButton}`}
            >
              추억 보러가기
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${palette.outlineButton}`}
            >
              조금 있다 보기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}