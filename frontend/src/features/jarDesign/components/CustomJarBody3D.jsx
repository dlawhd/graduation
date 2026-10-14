import { useEffect, useMemo, useRef, useState } from "react";
import { DirectionalLight, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, OrthographicCamera, Scene, Vector3, WebGLRenderer,CanvasTexture,SRGBColorSpace,NearestFilter,LinearFilter,LinearMipmapLinearFilter } from "three";
import { bodyWorldPoint, body3DProfile, bodyRotation, bodyPhotoSurface, bodyViewExtent, projectedSurfaceMatrix,
  canExtrudeHollowBody, BODY_3D_VIEW } from "../body3DGeometry.mjs";
import { roundedBodyGeometry } from "../body3DMesh.mjs";
import { bodyArtworkPixels } from "../bodyArtworkPixels.mjs";
import {drawBody3DPhoto} from "../body3DPhoto.mjs";
import JarSlotOverlay from "./JarSlotOverlay";
import { addPreparedBodyRelief, preparedMaterialGroups } from "../preparedBodyRelief.mjs";
import { preparedPhotoLayout, preparedBodyProfile } from "../preparedBody3D.mjs";
import {openTextureSource} from "../textureSource.mjs";
import apiClient from "../../../api/apiClient";

/** 외곽선과 사진 면을 둥근 몸통으로 만들고 입구도 같은 카메라로 투영한다. 사진 속 인물을 3D로 바꾸지는 않는다. */
export default function CustomJarBody3D({ customBody, imageUrl, photoFrame, imageStyle, imageRendering,
  outlineOnly, slot, resetKey, onFailure, preparedBody = null, imageTextureUrl, bodyArtworkTextureUrl }) {
  const stageRef=useRef(null), surfaceRef=useRef(null), slotRef=useRef(null), controllerRef=useRef(null);
  const slotValueRef=useRef(slot);
  // 곡선과 안전한 사진 창 탐색은 틀이 바뀔 때만 수행한다. 회전/사진 배치 변경에서는 재사용한다.
  const renderProfile=useMemo(()=>preparedBody?preparedBodyProfile(customBody,preparedBody):body3DProfile(customBody),[customBody,preparedBody]);
  const [ready,setReady]=useState(false);
  useEffect(() => {
    const stage=stageRef.current, surface=surfaceRef.current;
    const body=renderProfile, points=body?.renderOutline.map(bodyWorldPoint);
    let renderer, geometry, faceMaterial, photoMaterial, backMaterial, reliefCleanup, bodyMesh, observer, texture, textureImage, photoTexture, photoImage, photoVersion=0, frame=0, disposed=false;
    let photoUrl="";
    let photoSource,borderSource,photoAbort;
    const borderAbort=new AbortController();
    const fetchBlob=async(path,signal)=>(await apiClient.get(path,{responseType:"blob",signal,timeout:15000})).data;
    let borderReady=!customBody?.artworkUrl,photoReady=!imageUrl;
    const refreshReady=()=>{if(!disposed)setReady(borderReady&&photoReady);};
    let gesture=null, yaw=.35, pitch=-.12;
    const cleanup = () => {
      if (disposed) return;
      disposed=true;
      photoAbort?.abort();borderAbort.abort();photoSource?.dispose();borderSource?.dispose();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      stage.removeEventListener("pointerdown",start);
      stage.removeEventListener("pointermove",move);
      stage.removeEventListener("pointerup",finish);
      stage.removeEventListener("pointercancel",finish);
      stage.removeEventListener("lostpointercapture",finish);
      stage.removeEventListener("keydown",keyDown);
      renderer?.domElement.removeEventListener("webglcontextlost",lostContext);
      reliefCleanup?.();backMaterial?.dispose();
      geometry?.dispose(); faceMaterial?.dispose();
      photoMaterial?.dispose();photoTexture?.dispose();
      texture?.dispose();
      if(textureImage) {textureImage.onload=null;textureImage.onerror=null;}
      if(photoImage) {photoImage.onload=null;photoImage.onerror=null;}
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
        const currentSlot=slotValueRef.current;
        const center=currentSlot?{x:currentSlot.centerX,y:currentSlot.centerY}:null;
        const depth=center&&geometry.userData.photoHeight
          ? geometry.userData.photoHeight(bodyWorldPoint(center))+.007 : Math.abs(photoSurface.depth);
        const project=(x,y) => {
          const p=group.localToWorld(new Vector3(x,y,photoSurface.side==="front"?depth:-depth)).project(camera);
          return {x:(p.x+1)*stage.clientWidth/2,y:(1-p.y)*stage.clientHeight/2};
        };
        const matrix=projectedSurfaceMatrix(project(-1,1),project(1,1),project(-1,-1));
        surface.style.transform=`matrix(${matrix.join(",")})`;
        // 앞뒤 사진은 이제 곡면 텍스처가 같은 카메라로 그린다. DOM에는 앞면 입구만 투영한다.
        // 옆으로 거의 세워진 입구는 숨겨 가느다란 띠가 옆면 위에 떠 보이지 않게 한다.
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
      if (!body.photoSafe) {
        fail("이 틀은 안전한 사진 공간이 작아 2D로 보여드려요. 원본과 사진 배치는 그대로 유지돼요.");
        return cleanup;
      }
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
      geometry=roundedBodyGeometry(customBody,Boolean(outlineOnly && !imageUrl),renderProfile);
      faceMaterial=new MeshStandardMaterial({color:customBody.color,roughness:.55,metalness:0});
      photoMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.55,metalness:0});
      if(preparedBody) {
        preparedMaterialGroups(geometry);
        backMaterial=new MeshStandardMaterial({color:preparedBody.colors.base,roughness:.48});
      }
      bodyMesh=new Mesh(geometry,preparedBody?[faceMaterial,photoMaterial,backMaterial]:[faceMaterial,photoMaterial]);
      group.add(bodyMesh);
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
      /** 사진 URL/배치가 바뀌어도 몸통 geometry는 재사용하고 이전 비동기 이미지 결과만 폐기한다. */
      function updatePhoto(url,placement,style,pixelRendering) {
        const version=++photoVersion;
        const reuse=photoUrl===url&&photoImage?.complete&&photoImage.naturalWidth>0;
        if(photoImage){photoImage.onload=null;photoImage.onerror=null;}
        if(!reuse){photoAbort?.abort();photoSource?.dispose();photoSource=null;}
        photoReady=!url;refreshReady();
        if(!url)return;
        // 기존 배경 편집 마스크를 무시해서 보여주지 않는다. 이런 Draft는 기존 2D에서 정확히 표시한다.
        if(style&&Object.values(style).some(v=>v!=null&&v!=="")) {
          fail("배경 편집이 있는 디자인은 원본 편집을 유지한 2D로 보여드려요.");return;
        }
        const paint=()=>{
          if(disposed||version!==photoVersion)return;
          try {
            // 슬라이더로 배치만 바꾸면 같은 디코딩 이미지/Canvas/텍스처를 재사용해 반복 GET과 GPU 할당을 막는다.
            const canvas=photoTexture?.image||document.createElement("canvas");canvas.width=canvas.height=480;
            if(preparedBody) {
              const context=canvas.getContext("2d"),r=preparedPhotoLayout(preparedBody.window,placement,photoImage);
              context.clearRect(0,0,480,480);context.fillStyle="#fffdf8";context.fillRect(0,0,480,480);
              context.imageSmoothingEnabled=pixelRendering!=="pixelated";
              context.drawImage(photoImage,r.x,r.y,r.width,r.height);
            } else drawBody3DPhoto(canvas.getContext("2d"),photoImage,renderProfile,placement,pixelRendering==="pixelated");
            if(!photoTexture){photoTexture=new CanvasTexture(canvas);photoTexture.colorSpace=SRGBColorSpace;}
            photoTexture.magFilter=pixelRendering==="pixelated"?NearestFilter:LinearFilter;
            photoTexture.minFilter=pixelRendering==="pixelated"?NearestFilter:LinearMipmapLinearFilter;
            photoTexture.generateMipmaps=pixelRendering!=="pixelated";photoTexture.needsUpdate=true;
            photoMaterial.map=photoTexture;photoMaterial.needsUpdate=true;
            photoReady=true;refreshReady();schedule();
          } catch {fail("사진을 곡면에 불러오지 못했어요. 원본 배치를 유지한 2D로 보여드려요.");}
        };
        if(reuse){paint();return;}
        photoImage=new Image();photoImage.crossOrigin="anonymous";photoUrl=url;
        photoImage.onload=paint;
        photoImage.onerror=()=>{if(!disposed&&version===photoVersion)fail("3D 사진을 불러오지 못했어요. 기존 2D로 보여드려요.");};
        photoAbort=new AbortController();
        openTextureSource(url,imageTextureUrl,{fetchBlob,signal:photoAbort.signal}).then(source=>{
          if(disposed||version!==photoVersion){source.dispose();return;}
          photoSource=source;photoImage.src=source.url;
        }).catch(()=>{if(!disposed&&version===photoVersion)photoImage.onerror?.();});
      }
      controllerRef.current={reset:()=>rotate(0,0),turn:delta=>rotate(yaw+delta,pitch),refresh:schedule,updatePhoto};
      if(customBody.artworkUrl) {
        // 권한 확인 뒤 발급한 PNG만 읽는다. 읽기/CORS 실패 시 단색으로 속이지 않고 원본을 보존한 2D로 복구한다.
        textureImage=new Image();textureImage.crossOrigin="anonymous";
        textureImage.onload=()=>{
          if(disposed) return;
          try {
            const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
            if(textureImage.naturalWidth!==480||textureImage.naturalHeight!==480) throw new Error("Invalid body artwork");
            const context=canvas.getContext("2d");context.drawImage(textureImage,0,0);
            if(!preparedBody) {
              const pixels=context.getImageData(0,0,480,480);pixels.data.set(bodyArtworkPixels(pixels));context.putImageData(pixels,0,0);
            }
            texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
            faceMaterial.color.set(0xffffff);faceMaterial.map=texture;faceMaterial.needsUpdate=true;
            if(preparedBody) {
              if(!imageUrl){photoMaterial.map=texture;photoMaterial.needsUpdate=true;}
              reliefCleanup=addPreparedBodyRelief(group,bodyMesh,preparedBody,texture);
            }
            borderReady=true;refreshReady();schedule();
          } catch {fail("테두리 색을 3D로 불러오지 못했어요. 원본 색을 유지한 2D로 보여드려요.");}
        };
        textureImage.onerror=()=>{if(!disposed)fail("테두리 그림을 불러오지 못했어요. 2D로 돌아가 다시 확인해 주세요.");};
        openTextureSource(customBody.artworkUrl,bodyArtworkTextureUrl,{fetchBlob,signal:borderAbort.signal}).then(source=>{
          if(disposed){source.dispose();return;}
          borderSource=source;textureImage.src=source.url;
        }).catch(()=>{if(!disposed)textureImage.onerror?.();});
      } else refreshReady();
    } catch { fail(); }
    return cleanup;
  },[customBody,renderProfile,Boolean(imageUrl),outlineOnly,onFailure,preparedBody,imageTextureUrl,bodyArtworkTextureUrl]);
  useEffect(()=>{controllerRef.current?.updatePhoto(imageUrl,photoFrame,imageStyle,imageRendering);},[imageUrl,photoFrame,imageStyle,imageRendering,renderProfile,outlineOnly,imageTextureUrl,bodyArtworkTextureUrl]);
  useEffect(()=>{if(resetKey)controllerRef.current?.reset();},[resetKey]);
  // 회전 중 입구 prop이 바뀌어도 새 DOM의 앞/뒤 표시를 한 프레임 안에 맞춘다.
  useEffect(()=>{slotValueRef.current=slot;controllerRef.current?.refresh();},[slot]);
  return <div ref={stageRef} role="group" aria-label="저금통 3D 회전 보기" tabIndex={0}
    className="relative h-full w-full touch-none overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
    <div ref={surfaceRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0"
      style={{width:480,height:480,transformOrigin:"0 0",visibility:"hidden"}}>
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
