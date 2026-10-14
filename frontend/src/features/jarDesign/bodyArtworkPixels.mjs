/** 원래 그린 픽셀은 그대로 두고 투명한 곳에만 가까운 테두리 색을 이어 3D 곡면/옆면의 색을 만든다. */
export function bodyArtworkPixels(image) {
  const {width,height,data}=image;
  if(width!==480||height!==480||data.length!==width*height*4) throw new Error("Invalid body artwork");
  const count=width*height,nearest=new Int32Array(count).fill(-1),queue=new Int32Array(count),output=new Uint8ClampedArray(data.length);
  let head=0,tail=0;
  for(let i=0;i<count;i++) if(data[i*4+3]>=48){nearest[i]=i;queue[tail++]=i;}
  if(!tail) throw new Error("Empty body artwork");
  while(head<tail) {
    const p=queue[head++];
    for(const q of [p-width,p+width,...(p%width?[p-1]:[]),...(p%width<width-1?[p+1]:[])])
      if(q>=0&&q<count&&nearest[q]<0){nearest[q]=nearest[p];queue[tail++]=q;}
  }
  for(let i=0;i<count;i++){const source=nearest[i]*4;output.set(data.subarray(source,source+3),i*4);output[i*4+3]=255;}
  return output;
}
