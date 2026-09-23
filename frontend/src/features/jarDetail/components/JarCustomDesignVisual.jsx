import { useEffect, useMemo, useState } from "react";
import JarSlotOverlay from "../../jarDesign/components/JarSlotOverlay";
import { storedSlot } from "../../jarDesign/slotGeometry.mjs";

/**
 * 최종 Jar의 커스텀 이미지와 저장된 투입구 위치를 모든 Jar 화면에서 똑같이 그린다.
 * 이미지 URL이 없거나 만료되면 기존 Theme Jar로 속이지 않고 명확한 오류 상태를 보여준다.
 */
export default function JarCustomDesignVisual({
  design,
  alt = "커스텀 저금통 디자인",
  className = "",
  imageClassName = "h-full w-full object-contain",
  onReload = null,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState("");
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const slot = useMemo(() => storedSlot(design ?? {}), [design]);

  useEffect(() => {
    setImageFailed(false);
    setReloadError("");
  }, [design?.imageUrl]);

  /**
   * 만료된 Presigned URL은 Jar 상세를 조용히 다시 조회해 새 URL로 교체한다.
   * 성공해도 URL 문자열이 우연히 같을 수 있으므로 img key도 함께 바꿔
   * 브라우저가 이미지 요청을 다시 수행하도록 한다.
   */
  async function handleReload() {
    if (!onReload || isReloading) return;

    setIsReloading(true);
    setReloadError("");

    try {
      const reloaded = await onReload();

      if (!reloaded) {
        setReloadError("이미지를 다시 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }

      setImageFailed(false);
      setReloadAttempt((previous) => previous + 1);
    } catch {
      // 부모의 재조회 구현이 예외를 던져도 이미지 영역 안에서만 안내한다.
      setReloadError("이미지를 다시 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsReloading(false);
    }
  }

  if (!design?.imageUrl || imageFailed) {
    return (
      <div className={`flex aspect-square flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/75 px-4 text-center text-xs font-bold leading-5 text-slate-500 ${className}`}>
        <p>
          디자인 이미지를 불러오지 못했어요.
          {!onReload && <><br />화면을 새로고침해 주세요.</>}
        </p>
        {onReload && (
          <>
            <button
              type="button"
              onClick={handleReload}
              disabled={isReloading}
              className="mt-3 rounded-full bg-violet-600 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:bg-violet-300"
            >
              {isReloading ? "새 이미지 불러오는 중..." : "이미지 다시 불러오기"}
            </button>
            {reloadError && (
              <p className="mt-2 text-[11px] leading-4 text-rose-500" role="status">
                {reloadError}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`relative aspect-square overflow-visible bg-transparent ${className}`}>
      <img
        key={`${design.imageUrl}-${reloadAttempt}`}
        src={design.imageUrl}
        alt={alt}
        className={imageClassName}
        onError={() => setImageFailed(true)}
      />
      {slot && <JarSlotOverlay slot={slot} />}
    </div>
  );
}
