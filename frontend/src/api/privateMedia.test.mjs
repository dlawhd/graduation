import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePrivateMedia, isPrivateMediaSource, createMediaSessionCheck } from "./privateMedia.mjs";
test("protected image and video addresses use the API origin without changing storage or blob addresses",()=>{
 const value={items:[{attachments:[{url:"/api/v1/files/attachments/12/content",thumbnailUrl:null},{url:"blob:https://frontend.invalid/abc"},{url:"https://storage.invalid/photo.png"}]}],publicUrl:"/api/v1/files/uploads/3/content"};
 const mapped=resolvePrivateMedia(value,"https://api.invalid","https://frontend.invalid");
 assert.equal(mapped.items[0].attachments[0].url,"https://api.invalid/api/v1/files/attachments/12/content");
 assert.equal(mapped.items[0].attachments[1].url,value.items[0].attachments[1].url);
 assert.equal(mapped.items[0].attachments[2].url,value.items[0].attachments[2].url);
 assert.equal(mapped.publicUrl,"https://api.invalid/api/v1/files/uploads/3/content");
 assert.equal(value.publicUrl,"/api/v1/files/uploads/3/content");
});
test("session retries only apply to protected media on the configured API origin",()=>{
 assert.equal(isPrivateMediaSource("https://api.invalid/api/v1/files/attachments/1/content","https://api.invalid","https://front.invalid"),true);
 assert.equal(isPrivateMediaSource("https://other.invalid/api/v1/files/attachments/1/content","https://api.invalid","https://front.invalid"),false);
 assert.equal(isPrivateMediaSource("blob:https://api.invalid/abc","https://api.invalid","https://front.invalid"),false);
 assert.equal(isPrivateMediaSource("blob:https://api.invalid/api/v1/files/attachments/1/content","https://api.invalid","https://front.invalid"),false);
});
test("parallel media failures share one session check and failure does not prevent later recovery",async()=>{
 let calls=0,release;
 const checked=createMediaSessionCheck(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const waiting=Array.from({length:50},()=>checked());
 await Promise.resolve();assert.equal(calls,1);assert.ok(waiting.every(p=>p===waiting[0]));release();await Promise.all(waiting);
 let attempts=0;const recovering=createMediaSessionCheck(()=>{if(++attempts===1)throw new Error("expired");});
 await assert.rejects(recovering());await recovering();assert.equal(attempts,2);
});
test("relative API configuration and local API port resolve correctly",()=>{
 assert.equal(resolvePrivateMedia({url:"/api/v1/files/attachments/1/content"},"http://localhost:8080","http://localhost:3000").url,"http://localhost:8080/api/v1/files/attachments/1/content");
 assert.equal(resolvePrivateMedia({url:"/api/v1/files/attachments/1/content"},"/backend/","https://front.invalid").url,"https://front.invalid/backend/api/v1/files/attachments/1/content");
 assert.equal(resolvePrivateMedia({url:"/api/v1/files/attachments/1/content"},"https://api.invalid/backend/","https://front.invalid").url,"https://api.invalid/backend/api/v1/files/attachments/1/content");
 assert.equal(resolvePrivateMedia(null),null);
 assert.equal(resolvePrivateMedia({url:"/api/v1/files/attachments/../unsafe/content"},"https://api.invalid").url,"/api/v1/files/attachments/../unsafe/content");
});
