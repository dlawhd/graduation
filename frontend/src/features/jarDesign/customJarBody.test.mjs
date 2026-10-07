import test from "node:test";
import assert from "node:assert/strict";
import { basicBodyOutline, customJarBody, customContainWindow, outlineError, readBodyDraft, MAX_BODY_POINTS } from "./customJarBody.mjs";
import { getJarBody } from "./jarBodies.mjs";

test("three unadorned templates have valid independent shapes",()=>{
  const paths=new Set();
  for(const kind of ["ROUND","JAR","SQUARE"]){const value=basicBodyOutline(kind);assert.equal(outlineError(value),"");paths.add(customJarBody(value).path);assert.equal(getJarBody("CUSTOM",value).id,"CUSTOM");}
  assert.equal(paths.size,3);
});
test("custom body uses saved coordinates and color, without mutating the outline",()=>{
  const value=basicBodyOutline("JAR","#aabbcc"),before=JSON.stringify(value),body=customJarBody(value);
  assert.equal(JSON.stringify(value),before);assert.equal(body.customBody.color,"#aabbcc");
  assert.equal(body.window.radius,0);assert.ok(body.window.width>200);assert.ok(body.path.endsWith("Z"));
});
test("malformed coordinates, scripts, tiny lines and too many points are rejected",()=>{
  for(const value of [null,{points:[]},{...basicBodyOutline(),color:"url(javascript:bad)"},{...basicBodyOutline(),points:Array(MAX_BODY_POINTS+1).fill({x:.5,y:.5})},
    {points:[{x:.1,y:.1},{x:.2,y:.1},{x:.2,y:.2}],color:"#abcdef"},
    {...basicBodyOutline(),points:[{x:NaN,y:.3},{x:.9,y:.3},{x:.5,y:.8}]},
    {...basicBodyOutline(),points:[{x:.01,y:.3},{x:.9,y:.3},{x:.5,y:.8}]}]){assert.ok(outlineError(value));assert.equal(customJarBody(value),null);}
});
test("self-intersecting or duplicate outlines cannot be applied",()=>{
  for(const points of [[{x:.1,y:.1},{x:.9,y:.9},{x:.1,y:.9},{x:.9,y:.1}], [{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.1},{x:.1,y:.9}]]) assert.ok(outlineError({points,color:"#abcdef"}));
});
test("storage errors and corrupt drafts do not break creation; valid shape restores",()=>{
  const value=basicBodyOutline("SQUARE");assert.deepEqual(readBodyDraft({getItem:()=>JSON.stringify(value)}),value);
  assert.equal(readBodyDraft({getItem:()=>"{broken"}),null);assert.equal(readBodyDraft({getItem:()=>{throw Error();}}),null);assert.equal(getJarBody("CUSTOM"),null);
});

test("whole image fits inside round and concave custom outlines without clipping corners",()=>{
  const concave={points:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.65,y:.9},{x:.65,y:.4},{x:.35,y:.4},{x:.35,y:.9},{x:.1,y:.9}],color:"#abcdef"};
  const inside=(p,points)=>{let result=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;};
  for(const value of [basicBodyOutline(),basicBodyOutline("JAR"),basicBodyOutline("SQUARE"),concave]) {
    const body=customJarBody(value);
    for(const ratio of [1,16/9,9/16]) {
      const fitted=customContainWindow(body,{width:ratio,height:1});
      assert.ok(fitted.width>20);assert.ok(Math.abs(fitted.width/fitted.height-ratio)<.000001);
      for(let x=0;x<=10;x++) for(let y=0;y<=10;y++) assert.ok(inside({x:fitted.x+fitted.width*x/10,y:fitted.y+fitted.height*y/10},body.photoOutline));
    }
  }
});
