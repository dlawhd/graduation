import { useEffect, useRef, useState } from "react";
import { DirectionalLight, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { body3DOutline, body3DProfile, bodyRotation, bodyPhotoSurface, bodyViewExtent, projectedSurfaceMatrix,
  canExtrudeHollowBody, BODY_3D_VIEW } from "../body3DGeometry.mjs";
import { roundedBodyGeometry } from "../body3DMesh.mjs";
import CustomJarBodyArtwork from "./CustomJarBodyArtwork";
import JarSlotOverlay from "./JarSlotOverlay";

/** 외곽선을 입체화하고 사진/입구 평면을 같은 카메라로 투영한다. 사진 속 인물을 3D로 바꾸지는 않는다. */
export default function CustomJarBody3D({ customBody, imageUrl, photoFrame, imageStyle, imageRendering,
  outlineOnly, slot, resetKey, onFailure }) {
  const stageRef=useRef(null), surfaceRef=useRef(null), slotRef=useRef(null), controllerRef=useRef(null);
  const [ready,setReady]=useState(false);
  useEffect(() => {
    const stage=stageRef.current, surface=surfaceRef.current;
    const body=body3DProfile(customBody), points=body3DOutline(customBody);
    let renderer, geometry, faceMaterial, observer, frame=0, disposed=false;
    let gesture=null, yaw=.35, pitch=-.12;
    const cleanup = () => {
      if (disposed) return;
      disposed=true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      stage.removeEventListener("pointerdown",start);
      stage.removeEventListener("pointermove",move);
      stage.removeEventListener("pointerup",finish);
      stage.removeEventListener("pointercancel",finish);
      stage.removeEventListener("lostpointercapture",finish);
      stage.removeEventListener("keydown",keyDown);
      renderer?.domElement.removeEventListener("webglcontextlost",lostContext);
      geometry?.dispose(); faceMaterial?.dispose();
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
      controllerRef.current=null;
    };
    function fail(message) { cleanup(); onFailure(message); }
    function lostContext(event) { event.preventDefault(); fail(); }
    function start(event) {
      if (event.target.closest("button") || (event.pointerType==="mouse" && event.button!==0)) return;
      stage.focus({preventScroll:true});
      stage.setPointerCapture(event.pointerId);
      gesture={id:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch};
    }
    function move(event) {
      if (!gesture || event.pointerId!==gesture.id) return;
      // 화면 크기에 비례해 PC와 모바일에서 같은 움직임으로 돌릴 수 있게 한다.
      const scale=4/Math.max(stage.clientWidth,1);
      rotate(gesture.yaw+(event.clientX-gesture.x)*scale,gesture.pitch+(event.clientY-gesture.y)*scale);
    }
    function finish(event) {
      if (!gesture || event.pointerId!==gesture.id) return;
      gesture=null;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    }
    function keyDown(event) {
      if (event.target.closest("button")) return;
      const delta={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]}[event.key];
      if (!delta && event.key!=="Home") return;
      event.preventDefault();
      rotate(delta?yaw+delta[0]:0,delta?pitch+delta[1]:0);
    }
    let scene, camera, group;
    /** 고정 타이머 대신 조작/크기 변경 때만 한 프레임을 그린다. */
    function draw() {
      frame=0;
      if (disposed) return;
      try {
        group.rotation.set(pitch,yaw,0);
        group.updateMatrixWorld(true);
        const aspect=stage.clientWidth/Math.max(stage.clientHeight,1);
        const view=bodyViewExtent(points,yaw,pitch,aspect);
        if (camera.top!==view || camera.right!==view*aspect) {
          camera.top=view;camera.bottom=-view;camera.left=-view*aspect;camera.right=view*aspect;
          camera.updateProjectionMatrix();
        }
        renderer.render(scene,camera);
        const photoSurface=bodyPhotoSurface(yaw,pitch);
        const project=(x,y) => {
          const p=group.localToWorld(new Vector3(x,y,photoSurface.depth)).project(camera);
          return {x:(p.x+1)*stage.clientWidth/2,y:(1-p.y)*stage.clientHeight/2};
        };
        const matrix=projectedSurfaceMatrix(project(-1,1),project(1,1),project(-1,-1));
        surface.style.transform=`matrix(${matrix.join(",")})`;
        // 같은 DOM 사진을 보이는 면으로 옮긴다. 뒷면의 음수 가로 투영이 사진/배경/글자를 함께 반전한다.
        // 옆으로 거의 세워진 평면은 잠깐 숨겨 가느다란 사진 띠가 입체 옆면 위에 떠 보이지 않게 한다.
        surface.style.visibility=photoSurface.visible?"visible":"hidden";
        if (slotRef.current) slotRef.current.style.visibility=photoSurface.visible && photoSurface.side==="front"?"visible":"hidden";
        stage.dataset.yaw=String(yaw);
        stage.dataset.pitch=String(pitch);
        stage.dataset.side=photoSurface.side;
      } catch { fail(); }
    }
    function schedule() { if (!disposed && !frame) frame=requestAnimationFrame(draw); }
    function rotate(nextYaw,nextPitch) {
      ({yaw,pitch}=bodyRotation(nextYaw,nextPitch));
      schedule();
    }
    try {
      setReady(false);
      if (!body || !points) throw new Error("Unsupported outline");
      if (outlineOnly && !imageUrl && !canExtrudeHollowBody(body)) {
        fail("이 빈 틀은 굴곡이 깊어 2D로 보여드려요. 사진을 담은 뒤에는 3D로 돌려볼 수 있어요.");
        return cleanup;
      }
      renderer=new WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});
      // 작은 모바일 화면에서 과도한 GPU 메모리 사용을 막는다. 최대 840x840 drawing buffer.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
      renderer.setClearColor(0xffffff,0);
      renderer.domElement.setAttribute("aria-hidden","true");
      renderer.domElement.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
      renderer.domElement.addEventListener("webglcontextlost",lostContext);
      stage.prepend(renderer.domElement);
      scene=new Scene(); group=new Group(); scene.add(group);
      camera=new OrthographicCamera(-BODY_3D_VIEW,BODY_3D_VIEW,BODY_3D_VIEW,-BODY_3D_VIEW,.1,20);
      camera.position.set(0,0,5);
      // 빈 틀에는 실제 구멍을 낸다. 사진이 있으면 앞뒤 표면 위에 같은 사진을 투영하고 옆면 두께는 유지한다.
      geometry=roundedBodyGeometry(customBody,Boolean(outlineOnly && !imageUrl));
      faceMaterial=new MeshStandardMaterial({color:customBody.color,roughness:.8,metalness:0});
      group.add(new Mesh(geometry,faceMaterial));
      // 따뜻한 반사광으로 밝은 틀도 아래쪽이 검게 변하지 않게 하면서 곡면의 명암은 남긴다.
      scene.add(new HemisphereLight(0xffffff,0xd8ccc8,2));
      const key=new DirectionalLight(0xffffff,2.6);key.position.set(-3,4,5);scene.add(key);
      const fill=new DirectionalLight(0xe0e8ff,1.2);fill.position.set(3,-1,-4);scene.add(fill);
      const resize=() => {
        if (disposed || !stage.clientWidth || !stage.clientHeight) return;
        const width=stage.clientWidth,height=stage.clientHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2,840/Math.max(width,height)));
        renderer.setSize(width,height,false);
        schedule();
      };
      observer=new ResizeObserver(resize);observer.observe(stage);resize();
      stage.addEventListener("pointerdown",start);
      stage.addEventListener("pointermove",move);
      stage.addEventListener("pointerup",finish);
      stage.addEventListener("pointercancel",finish);
      stage.addEventListener("lostpointercapture",finish);
      stage.addEventListener("keydown",keyDown);
      controllerRef.current={reset:()=>rotate(0,0),turn:delta=>rotate(yaw+delta,pitch),refresh:schedule};
      setReady(true);
    } catch { fail(); }
    return cleanup;
  },[customBody,Boolean(imageUrl),outlineOnly,onFailure]);
  useEffect(()=>{if(resetKey)controllerRef.current?.reset();},[resetKey]);
  // 회전 중 입구 prop이 바뀌어도 새 DOM의 앞/뒤 표시를 한 프레임 안에 맞춘다.
  useEffect(()=>{controllerRef.current?.refresh();},[slot]);
  return <div ref={stageRef} role="group" aria-label="저금통 3D 회전 보기" tabIndex={0}
    className="relative h-full w-full touch-none overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
    <div ref={surfaceRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0"
      style={{width:480,height:480,transformOrigin:"0 0",visibility:"hidden"}}>
      <CustomJarBodyArtwork {...{customBody,imageUrl,photoFrame,imageStyle,imageRendering,outlineOnly}} suppressShadow photoOnly />
      {slot && <div ref={slotRef} data-3d-front-slot className="absolute inset-0" style={{visibility:"hidden"}}><JarSlotOverlay slot={slot}/></div>}
    </div>
    {!ready && <p role="status" className="absolute inset-x-0 bottom-16 text-center text-xs text-stone-500">3D를 준비하고 있어요.</p>}
    <div className="pointer-events-auto absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-white/90 p-1 shadow-sm">
      <button type="button" aria-label="3D 왼쪽으로 돌리기" disabled={!ready} onClick={()=>controllerRef.current?.turn(-.3)} className="h-10 w-10 rounded-full text-stone-700">←</button>
      <span className="self-center whitespace-nowrap text-[10px] font-bold text-stone-500">드래그로 돌려보기</span>
      <button type="button" aria-label="3D 오른쪽으로 돌리기" disabled={!ready} onClick={()=>controllerRef.current?.turn(.3)} className="h-10 w-10 rounded-full text-stone-700">→</button>
    </div>
  </div>;
}
