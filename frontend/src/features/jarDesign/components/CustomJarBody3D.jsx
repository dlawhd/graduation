import { useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, DirectionalLight, Group, HemisphereLight, Mesh,
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
import {thickenPreparedBody} from "../preparedBodyVolume.mjs";
import {addPreparedBodyDecorations} from "../preparedBodyDecorations.mjs";
import {IMAGE_ONLY_PROFILE,IMAGE_ONLY_DEPTH,drawImageOnlyPhoto,imageOnlyGeometry} from "../imageOnly3D.mjs";

/** 외곽선과 사진 면을 둥근 몸통으로 만들고 입구도 같은 카메라로 투영한다. 사진 속 인물을 3D로 바꾸지는 않는다. */
export default function CustomJarBody3D({ customBody, imageUrl, photoFrame, imageStyle, imageRendering,
  outlineOnly, slot, resetKey, onFailure, preparedBody = null, imageTextureUrl, bodyArtworkTextureUrl, imageOnly=false, timing:devTiming=null }) {
  const timing=import.meta.env.DEV?devTiming:null;
  const stageRef=useRef(null), surfaceRef=useRef(null), slotRef=useRef(null), controllerRef=useRef(null);
  const slotValueRef=useRef(slot);
  // 곡선과 안전한 사진 창 탐색은 틀이 바뀔 때만 수행한다. 회전/사진 배치 변경에서는 재사용한다.
  const measure=(name,task)=>timing?timing.measure(name,task):task();
  const renderProfile=useMemo(()=>{
    timing?.mark("componentRender");
    return measure("profile",()=>imageOnly?IMAGE_ONLY_PROFILE:preparedBody?preparedBodyProfile(customBody,preparedBody):body3DProfile(customBody));
  },[customBody,preparedBody,imageOnly,timing]);
  const [ready,setReady]=useState(false);
  useEffect(() => {
    const stage=stageRef.current, surface=surfaceRef.current;
    const effectTiming=timing?.beginEffect();
    const endEffectSetup=effectTiming?.start("effectSetup");
    const measure=(name,task)=>effectTiming?effectTiming.measure(name,task):task();
    effectTiming?.mark("effectStart");
    const body=renderProfile, points=body?.renderOutline.map(bodyWorldPoint);
    const rasterHollow=!imageOnly&&!preparedBody&&outlineOnly&&!imageUrl&&Boolean(customBody?.artworkUrl);
    let renderer, geometry, faceMaterial, photoMaterial, backMaterial, reliefCleanup, bodyMesh, observer, texture, textureImage, photoTexture, photoImage, photoVersion=0, frame=0, disposed=false;
    let photoUrl="";
    let photoSource,borderSource,photoAbort;
    const borderAbort=new AbortController();
    const fetchBlob=async(path,signal)=>(await apiClient.get(path,{responseType:"blob",signal,timeout:15000})).data;
    let borderReady=!customBody?.artworkUrl,photoReady=!imageUrl;
    const refreshReady=()=>{if(!disposed){if(borderReady&&photoReady)effectTiming?.mark("texturesReady");setReady(borderReady&&photoReady);}};
    let gesture=null, yaw=.35, pitch=-.12;
    const cleanup = () => {
      if (disposed) return;
      disposed=true;
      const endEffectCleanup=effectTiming?.start("effectCleanup");
      try {
      // 클릭 계측은 뷰어가 소유한다. StrictMode의 정리→재실행에서 취소하면 완료 기록이 사라진다.
      // 폐기한 효과의 출력은 disposed로 차단하고, 실제 2D 전환 취소는 뷰어에서 처리한다.
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
      } finally { endEffectCleanup?.();effectTiming?.dispose(); }
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
        const view=bodyViewExtent(points,yaw,pitch,aspect,imageOnly?IMAGE_ONLY_DEPTH/2+.007:preparedBody?geometry.boundingBox.max.z+.007:undefined);
        if (camera.top!==view || camera.right!==view*aspect) {
          camera.top=view;camera.bottom=-view;camera.left=-view*aspect;camera.right=view*aspect;
          camera.updateProjectionMatrix();
        }
        measure("renderSubmit",()=>renderer.render(scene,camera));
        // 빈 몸통의 첫 그리기가 아니라 사진/테두리까지 적용한 render가 끝난 결과만 공개한다.
        // render 반환은 GPU 완료 신호가 아니므로 진단 화면에서도 그 한계를 명시한다.
        if(effectTiming && borderReady && photoReady) {
          const result=effectTiming.finish();
          if(result)stage.dataset.body3dTiming=JSON.stringify({...result,triangles:geometry.index?.count/3||0,
            viewport:{width:stage.clientWidth,height:stage.clientHeight,pixelRatio:renderer.getPixelRatio()}});
        }
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
      if (!body.photoSafe && !rasterHollow) {
        fail("이 틀은 안전한 사진 공간이 작아 2D로 보여드려요. 원본과 사진 배치는 그대로 유지돼요.");
        return cleanup;
      }
      if (outlineOnly && !imageUrl && !rasterHollow && !canExtrudeHollowBody(body)) {
        fail("이 빈 틀은 굴곡이 깊어 2D로 보여드려요. 사진을 담은 뒤에는 3D로 돌려볼 수 있어요.");
        return cleanup;
      }
      renderer=measure("rendererInit",()=>new WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"}));
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
      geometry=measure("bodyGeometry",()=>imageOnly||rasterHollow?new BufferGeometry():roundedBodyGeometry(customBody,Boolean(outlineOnly && !imageUrl),renderProfile,effectTiming));
      faceMaterial=new MeshStandardMaterial({color:customBody?.color||0xffffff,roughness:.55,metalness:0});
      photoMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.55,metalness:0,alphaTest:imageOnly ? .02 : 0});
      if(preparedBody) {
        measure("preparedVolume",()=>thickenPreparedBody(geometry));
        measure("materialGroups",()=>preparedMaterialGroups(geometry));
        backMaterial=new MeshStandardMaterial({color:preparedBody.colors.base,roughness:.48});
      }
      bodyMesh=new Mesh(geometry,imageOnly?[photoMaterial,faceMaterial]:preparedBody?[faceMaterial,photoMaterial,backMaterial]:[faceMaterial,photoMaterial]);
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
        const endPhotoLoad=effectTiming?.start("photoLoadToOnload");
        // 기존 배경 편집 마스크를 무시해서 보여주지 않는다. 이런 Draft는 기존 2D에서 정확히 표시한다.
        if(!imageOnly&&style&&Object.values(style).some(v=>v!=null&&v!=="")) {
          fail("배경 편집이 있는 디자인은 원본 편집을 유지한 2D로 보여드려요.");return;
        }
        const paint=()=>{
          if(disposed||version!==photoVersion)return;
          endPhotoLoad?.();
          const endPhotoPaint=effectTiming?.start("photoCanvasAndTexture");
          try {
            // 슬라이더로 배치만 바꾸면 같은 디코딩 이미지/Canvas/텍스처를 재사용해 반복 GET과 GPU 할당을 막는다.
            const canvas=photoTexture?.image||document.createElement("canvas");canvas.width=canvas.height=480;
            if(imageOnly) {
              drawImageOnlyPhoto(canvas.getContext("2d"),photoImage,style,pixelRendering==="pixelated");
              // 원본 해상도가 커도 윤곽 계산은 128px로 제한한다. 2D 원본/저장 파일은 바꾸지 않는다.
              const mask=document.createElement("canvas");mask.width=mask.height=128;
              const context=mask.getContext("2d");context.drawImage(canvas,0,0,128,128);
              const next=measure("imageOnlyGeometry",()=>imageOnlyGeometry(context.getImageData(0,0,128,128)));
              bodyMesh.geometry=next;geometry.dispose();geometry=next;
              faceMaterial.color.setRGB(...geometry.userData.sideColor,SRGBColorSpace);
              // 투명 영역은 geometry가 비운다. 경계 텍스처는 기존 색 확장기를 재사용해 검은 틈을 막는다.
              const photoContext=canvas.getContext("2d"),pixels=photoContext.getImageData(0,0,480,480);
              pixels.data.set(measure("photoPixelExpansion",()=>bodyArtworkPixels(pixels)));photoContext.putImageData(pixels,0,0);
              stage.dataset.imageOnlyTriangles=String(geometry.index.count/3);
            } else if(preparedBody) {
              const context=canvas.getContext("2d"),r=preparedPhotoLayout(preparedBody.window,placement,photoImage);
              context.clearRect(0,0,480,480);context.fillStyle="#fffdf8";context.fillRect(0,0,480,480);
              context.imageSmoothingEnabled=pixelRendering!=="pixelated";
              context.drawImage(photoImage,r.x,r.y,r.width,r.height);
            } else {
              const context=canvas.getContext("2d");
              drawBody3DPhoto(context,photoImage,renderProfile,placement,pixelRendering==="pixelated");
              // 새로 허용한 내부 꾸밈도 사진 위에 합성한다. 색을 확장한 텍스처가 아닌 투명 원본을 사용한다.
              if(textureImage?.complete&&textureImage.naturalWidth===480)context.drawImage(textureImage,0,0,480,480);
            }
            if(!photoTexture){photoTexture=new CanvasTexture(canvas);photoTexture.colorSpace=SRGBColorSpace;}
            photoTexture.magFilter=pixelRendering==="pixelated"?NearestFilter:LinearFilter;
            photoTexture.minFilter=pixelRendering==="pixelated"?NearestFilter:LinearMipmapLinearFilter;
            photoTexture.generateMipmaps=pixelRendering!=="pixelated";photoTexture.needsUpdate=true;
            photoMaterial.map=photoTexture;photoMaterial.needsUpdate=true;
            photoReady=true;refreshReady();schedule();
          } catch {fail("사진을 곡면에 불러오지 못했어요. 원본 배치를 유지한 2D로 보여드려요.");}
          finally {endPhotoPaint?.();}
        };
        if(reuse){paint();return;}
        photoImage=new Image();photoImage.crossOrigin="anonymous";photoUrl=url;
        photoImage.onload=paint;
        photoImage.onerror=()=>{if(!disposed&&version===photoVersion)fail("3D 사진을 불러오지 못했어요. 기존 2D로 보여드려요.");};
        photoAbort=new AbortController();
        const endPhotoSource=effectTiming?.start("photoSource");
        openTextureSource(url,imageTextureUrl,{fetchBlob,signal:photoAbort.signal}).then(source=>{
          if(disposed||version!==photoVersion){source.dispose();return;}
          endPhotoSource?.();
          photoSource=source;photoImage.src=source.url;
        }).catch(()=>{if(!disposed&&version===photoVersion)photoImage.onerror?.();});
      }
      controllerRef.current={reset:()=>rotate(0,0),turn:delta=>rotate(yaw+delta,pitch),refresh:schedule,updatePhoto};
      if(customBody?.artworkUrl) {
        // 권한 확인 뒤 발급한 PNG만 읽는다. 읽기/CORS 실패 시 단색으로 속이지 않고 원본을 보존한 2D로 복구한다.
        textureImage=new Image();textureImage.crossOrigin="anonymous";
        const endBorderLoad=effectTiming?.start("borderLoadToOnload");
        textureImage.onload=()=>{
          if(disposed) return;
          endBorderLoad?.();
          const endBorderPaint=effectTiming?.start("borderCanvasAndDecorations");
          try {
            const canvas=document.createElement("canvas");canvas.width=canvas.height=480;
            if(textureImage.naturalWidth!==480||textureImage.naturalHeight!==480) throw new Error("Invalid body artwork");
            const context=canvas.getContext("2d");context.drawImage(textureImage,0,0);
            if(!preparedBody) {
              const pixels=context.getImageData(0,0,480,480);
              if(rasterHollow){
                // 사진 창의 안전 여백으로 획을 두껍게 만들지 않고 실제 PNG의 1px 선까지 입체 경계로 쓴다.
                const next=measure("hollowImageGeometry",()=>imageOnlyGeometry(pixels,{fullResolution:true}));
                bodyMesh.geometry=next;geometry.dispose();geometry=next;
                bodyMesh.material=[faceMaterial,faceMaterial];stage.dataset.originalStrokeGeometry="true";
                stage.dataset.strokeDepth=String(geometry.userData.extrusionDepth);
                stage.dataset.strokeWidth=String(geometry.userData.strokeWidth);
              }
              pixels.data.set(measure("borderPixelExpansion",()=>bodyArtworkPixels(pixels)));context.putImageData(pixels,0,0);
            }
            texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
            faceMaterial.color.set(0xffffff);faceMaterial.map=texture;faceMaterial.needsUpdate=true;
            if(preparedBody) {
              if(!imageUrl){photoMaterial.map=texture;photoMaterial.needsUpdate=true;}
              reliefCleanup=measure("preparedRelief",()=>addPreparedBodyRelief(group,bodyMesh,preparedBody,texture));
              const innerCleanup=reliefCleanup;
              const decorationCleanup=measure("preparedDecorations",()=>addPreparedBodyDecorations(group,preparedBody,customBody,texture));
              reliefCleanup=()=>{innerCleanup();decorationCleanup();};
              stage.dataset.externalDecorationCount=String(decorationCleanup.count);
            } else if(imageUrl) {
              // 사진이 테두리보다 먼저 도착했어도 원본을 재요청하지 않고 꾸밈만 다시 합성한다.
              controllerRef.current?.updatePhoto(imageUrl,photoFrame,imageStyle,imageRendering);
            }
            borderReady=true;refreshReady();schedule();
          } catch {fail("테두리 색을 3D로 불러오지 못했어요. 원본 색을 유지한 2D로 보여드려요.");}
          finally {endBorderPaint?.();}
        };
        textureImage.onerror=()=>{if(!disposed)fail("테두리 그림을 불러오지 못했어요. 2D로 돌아가 다시 확인해 주세요.");};
        const endBorderSource=effectTiming?.start("borderSource");
        openTextureSource(customBody.artworkUrl,bodyArtworkTextureUrl,{fetchBlob,signal:borderAbort.signal}).then(source=>{
          if(disposed){source.dispose();return;}
          endBorderSource?.();
          borderSource=source;textureImage.src=source.url;
        }).catch(()=>{if(!disposed)textureImage.onerror?.();});
      } else refreshReady();
    } catch { fail(); }
    finally { endEffectSetup?.(); }
    return cleanup;
  },[customBody,renderProfile,Boolean(imageUrl),outlineOnly,onFailure,preparedBody,imageTextureUrl,bodyArtworkTextureUrl,imageOnly,timing]);
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
    {!ready && <p role="status" className="absolute inset-x-0 bottom-12 text-center text-xs text-stone-500">3D를 준비하고 있어요.</p>}
    <div data-rotation-controls className="pointer-events-auto absolute bottom-2 left-1/2 flex max-w-[calc(100%-16px)] -translate-x-1/2 gap-0.5 rounded-full bg-white/90 p-0.5 shadow-sm">
      <button type="button" aria-label="3D 왼쪽으로 돌리기" disabled={!ready} onClick={()=>controllerRef.current?.turn(-.3)} className="h-8 w-8 shrink-0 rounded-full text-sm text-stone-700">←</button>
      <span className="self-center whitespace-nowrap text-[9px] font-bold text-stone-500">드래그로 돌려보기</span>
      <button type="button" aria-label="3D 오른쪽으로 돌리기" disabled={!ready} onClick={()=>controllerRef.current?.turn(.3)} className="h-8 w-8 shrink-0 rounded-full text-sm text-stone-700">→</button>
    </div>
  </div>;
}
