import JarBodyArtwork from "./JarBodyArtwork";
import JarDesignImage from "./JarDesignImage";

/** 선택 화면의 오브제를 작은 전시장처럼 보여준다. 배경은 그림 합성·저장 좌표와 분리한다. */
export default function JarBodyStage({ body, imageUrl = "", className = "", alt = body.name, allow3D = false, disabled = false, viewControlsTarget = null }) {
  // 선택 미리보기에서는 버튼 줄을 이미지의 둥근 클립 바깥에 둬 캐릭터와 겹치지 않게 한다.
  if(allow3D) return <div className={className} style={{border:0,borderRadius:0}}>
    <JarDesignImage bodyStyle={body.id} imageUrl={imageUrl} alt={alt} allow3D viewDisabled={disabled} viewControlsTarget={viewControlsTarget} className="w-full"
      viewerStageStyle={{background:`radial-gradient(ellipse at 48% 24%, #fffdf9 0%, ${body.stage.light} 48%, ${body.stage.shade} 100%)`,borderRadius:"40% 40% 22px 22px",overflow:"hidden"}}/>
  </div>;
  return <div className={`relative isolate overflow-hidden ${className}`} style={{ background: `radial-gradient(ellipse at 48% 24%, #fffdf9 0%, ${body.stage.light} 48%, ${body.stage.shade} 100%)` }}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] bottom-[15%] top-[10%] rounded-t-[48%] rounded-b-[8%] border border-white/65 bg-white/15"/>
    <div aria-hidden="true" className="pointer-events-none absolute bottom-[9%] left-[10%] right-[10%] h-[7%] rounded-[50%] border-t border-white/70 bg-white/25"/>
    <JarBodyArtwork bodyStyle={body.id} imageUrl={imageUrl} alt={alt} showDefaultSlot className="w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.025]"/>
  </div>;
}
