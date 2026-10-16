import { useEffect, useRef, useState } from "react";
import CustomJarBodyViewer from "./CustomJarBodyViewer";
import JarBodyArtwork from "./JarBodyArtwork";
import { preparedBodyOutline } from "../preparedBody3D.mjs";

/** 기존 SVG를 로컬 텍스처로 재사용한다. 사진은 별도로 입혀 원본 URL/저장 배치를 유지한다. */
export default function PreparedJarBodyViewer({body, children, ...props}) {
  const sourceRef=useRef(null), [prepared,setPrepared]=useState(null);
  useEffect(()=>{
    try {
      const path=document.createElementNS("http://www.w3.org/2000/svg","path");
      const outline=preparedBodyOutline(body,path);
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
      svg.setAttribute("width","480");svg.setAttribute("height","480");svg.setAttribute("viewBox","0 0 480 480");
      // 2D와 같은 얼굴/장식을 사용한다. CSS 애니메이션은 캡처하지 않고 정지한 기본 자세를 사용한다.
      for(const layer of sourceRef.current.querySelectorAll("svg[viewBox='0 0 480 480']")) {
        for(const child of layer.children) svg.append(child.cloneNode(true));
      }
      const artworkUrl="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(svg));
      // 바깥 장식은 본체 텍스처만으로 보존되지 않는다. 같은 SVG의 장식 그룹을 별도 입체 부품 도면으로 전달한다.
      const decorations=document.createElementNS("http://www.w3.org/2000/svg","svg");
      decorations.setAttribute("xmlns","http://www.w3.org/2000/svg");
      for(const element of svg.querySelectorAll("defs,[data-body-decoration]"))decorations.append(element.cloneNode(true));
      const decorationSvg=new XMLSerializer().serializeToString(decorations);
      setPrepared({id:body.id,customBody:{...outline,artworkUrl,decorationSvg}});
    } catch {setPrepared(null);}
  },[body]);
  return <>
    <div ref={sourceRef} hidden aria-hidden="true"><JarBodyArtwork bodyStyle={body.id}/></div>
    {/* 사진 교체는 원래 2D로 복귀한다. 새 사진으로 불필요한 GPU를 만들었다 즉시 폐기하지 않도록 뷰어도 초기화한다. */}
    {prepared?.id===body.id ? <CustomJarBodyViewer key={`${body.id}:${props.imageUrl||""}`} controlsOutside {...props} customBody={prepared.customBody} preparedBody={body}>{children}</CustomJarBodyViewer> : children}
  </>;
}
