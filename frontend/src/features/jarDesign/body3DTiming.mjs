/** 개발 진단 화면에서만 3D 전환의 구간별 시간을 모은다. URL·사진·사용자 정보는 기록하지 않는다. */
export function createBody3DTiming({ enabled = false, now = () => performance.now() } = {}) {
  if (!enabled) return null;
  const origin = now(), marks = {}, spans = [], effects = [];
  let closed = false;
  const elapsed = () => Math.max(0, now() - origin);
  // 클릭 시계는 하나로 유지하되 효과별 작업에 번호를 붙여 폐기된 준비와 최종 출력을 구분한다.
  const scope = (effect = null) => ({
    /** 같은 완료 지점을 중복 기록하지 않아 회전 조작이 최초 전환 시간을 덮어쓰지 않는다. */
    mark(name) {
      const target=effect?effect.marks:marks;
      if (!closed && !effect?.disposed && target[name] === undefined) target[name] = elapsed();
    },
    /** 비동기 대기와 동기 계산을 같은 시계로 기록한다. 겹치는 구간은 합산하면 안 된다. */
    start(name) {
      const startMs = elapsed();
      let ended = false;
      return () => {
        if (ended || closed || effect?.disposed) return;
        ended = true;
        const endMs = elapsed();
        spans.push({ name, startMs, endMs, durationMs: endMs - startMs, ...(effect?{effectId:effect.id}:{}) });
      };
    },
    measure(name, task) {
      const end = this.start(name);
      try { return task(); } finally { end(); }
    },
    /** React 효과가 재실행되어도 기존 결과를 지우지 않고 각 실행의 수명을 독립적으로 기록한다. */
    beginEffect() {
      if (closed || effect) return null;
      const next={id:effects.length+1,startMs:elapsed(),disposed:false,marks:{}};effects.push(next);
      return scope(next);
    },
    /** 폐기한 효과의 늦은 콜백은 버린다. 클릭 전체 시계와 새 효과의 측정은 계속 유지한다. */
    dispose() {
      if (!closed && effect && !effect.disposed) { effect.disposed=true;effect.disposedMs=elapsed(); }
    },
    /** 모든 텍스처를 사용한 render 호출이 끝난 시점이다. GPU 완료나 물리적 화면 출력을 뜻하지 않는다. */
    finish() {
      if (closed || effect?.disposed) return null;
      this.mark("texturedRenderEnd");
      closed = true;
      return { version: 1, status: "complete", marks: { ...marks,...effect?.marks }, spans: spans.map(span => ({ ...span })),
        effects:effects.map(item=>({id:item.id,startMs:item.startMs,disposedMs:item.disposedMs??null,
          status:item===effect?"rendered":item.disposed?"discarded":"unresolved"})) };
    },
    cancel() { closed = true; },
  });
  return scope();
}

/** 실제 사진은 로컬 개발의 명시적 진단 URL에서만 잰다. 주소 자체를 결과에 포함하지 않는다. */
export function localBody3DTimingEnabled({development=false,hostname="",pathname="",search=""}={}) {
  if(!development||!["localhost","127.0.0.1","[::1]"].includes(hostname))return false;
  if(!/^\/jars\/(?:[1-9]\d*|new|design\/new)$/.test(pathname))return false;
  const values=new URLSearchParams(search).getAll("diagnose3d");
  return values.length===1&&values[0]==="1";
}

/** 허용한 숫자 필드만 골라 UI/복사에 사용한다. 임의 라벨·URL·사진·사용자 값은 전달하지 않는다. */
export function body3DTimingReport(result) {
  const number=value=>Number.isFinite(value)&&value>=0?value:null;
  if(result?.status!=="complete"||number(result.marks?.texturedRenderEnd)===null)return null;
  const span=name=>{
    const matches=(Array.isArray(result.spans)?result.spans:[]).filter(item=>item?.name===name);
    return matches.length&&matches.every(item=>number(item.durationMs)!==null)
      ?matches.reduce((sum,item)=>sum+item.durationMs,0):null;
  };
  const effectBreakdown=body3DEffectBreakdown(result);
  return {version:1,completion:"renderer.render-return",timingsMs:{
    clickToRenderReturn:number(result.marks.texturedRenderEnd),clickToComponent:number(result.marks.componentRender),
    profile:span("profile"),rendererInit:span("rendererInit"),bodyGeometry:span("bodyGeometry"),
    photoSource:span("photoSource"),photoLoadToOnload:span("photoLoadToOnload"),
    photoCanvasAndTexture:span("photoCanvasAndTexture"),borderLoadToOnload:span("borderLoadToOnload"),
    renderSubmitCpu:span("renderSubmit")},
    viewport:{width:number(result.viewport?.width),height:number(result.viewport?.height),pixelRatio:number(result.viewport?.pixelRatio)},
    triangles:number(result.triangles),effectBreakdown};
}

/** 출력한 효과와 폐기한 효과는 중첩 시간을 합산하지 않고 같은 종류의 구간끼리 비교한다. */
function body3DEffectBreakdown(result) {
  const effects=result.effects;
  if(!Array.isArray(effects)||!effects.length)return null;
  const valid=effects.every(item=>Number.isSafeInteger(item?.id)&&item.id>0&&["rendered","discarded","unresolved"].includes(item.status));
  if(!valid||new Set(effects.map(item=>item.id)).size!==effects.length)return null;
  const rendered=effects.filter(item=>item.status==="rendered");if(rendered.length!==1)return null;
  const discarded=effects.filter(item=>item.status==="discarded"),ids=new Set(effects.map(item=>item.id));
  const spans=Array.isArray(result.spans)?result.spans:[];
  const sum=(name,selected)=>{
    const values=spans.filter(item=>item?.name===name&&selected.has(item.effectId));
    return values.length&&values.every(item=>Number.isFinite(item.durationMs)&&item.durationMs>=0)
      ?values.reduce((total,item)=>total+item.durationMs,0):null;
  };
  const metrics=selected=>({setupMs:sum("effectSetup",selected),cleanupMs:sum("effectCleanup",selected),
    bodyGeometryMs:sum("bodyGeometry",selected),rendererInitMs:sum("rendererInit",selected),
    geometryStagesMs:Object.fromEntries(["rimTessellation","rimHeightField","rimSurfaceVertices",
      "photoTessellation","photoHeightField","photoSurfaceVertices","flatBase"].map(name=>[name,sum(name,selected)]))});
  const profiles=spans.filter(item=>item?.name==="profile"&&Number.isFinite(item.durationMs)&&item.durationMs>=0);
  return {observedEffectCount:ids.size,discardedEffectCount:discarded.length,
    unresolvedEffectCount:effects.filter(item=>item.status==="unresolved").length,
    renderedEffect:{id:rendered[0].id,...metrics(new Set([rendered[0].id]))},
    discardedEffects:metrics(new Set(discarded.map(item=>item.id))),
    profileComputations:{count:profiles.length,totalMs:profiles.reduce((total,item)=>total+item.durationMs,0)}};
}
