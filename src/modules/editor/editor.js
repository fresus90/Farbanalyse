// Crop & Touchup editor - extracted from working reference

// Editor state
export let tu = {
  canvas:null, ctx:null, cursorCanvas:null, cursorCtx:null,
  imageData:null, origImageData:null, W:0, H:0,
  tool:'erase', painting:false, undoStack:[],
  scale:1, offX:0, offY:0,
  pinching:false, lastPinchDist:0, pinchMidX:0, pinchMidY:0,
  panning:false, lastPanX:0, lastPanY:0
};
export let cropState = {
  dragging:false, resizing:null, startX:0, startY:0,
  box:{x:5,y:5,w:90,h:90}, _origBox:null
};

export function openEdit(){document.getElementById('viewMode').style.display='none';document.getElementById('editMode').style.display='block';switchTab('crop');initCrop();}

export function cancelEdit(){document.getElementById('editMode').style.display='none';document.getElementById('viewMode').style.display='block';}

export function applyEdit(){if(document.getElementById('tabCrop').classList.contains('active'))applyCrop();else applyTouchup();}

export function switchTab(tab){
  document.getElementById('tabCrop').classList.toggle('active',tab==='crop');
  document.getElementById('tabTouchup').classList.toggle('active',tab==='touchup');
  document.getElementById('cropPanel').style.display=tab==='crop'?'block':'none';
  document.getElementById('touchupPanel').style.display=tab==='touchup'?'block':'none';
  if(tab==='touchup')initTouchup();
}

export function initCrop(){
  var img=document.getElementById('cropSourceImg');
  img.src=window.appState.originalDataUrl;
  img.onload=function(){
    var wrap=document.getElementById('cropWrap');
    wrap.style.height=(wrap.offsetWidth*(img.naturalHeight/img.naturalWidth))+'px';
    cropState.box={x:5,y:5,w:90,h:90};renderCropBox();
  };
  setupCropEvents();
}

export function renderCropBox(){
  var box=document.getElementById('cropBox'),b=cropState.box;
  if(!box)return;
  box.style.left=b.x+'%';box.style.top=b.y+'%';box.style.width=b.w+'%';box.style.height=b.h+'%';
}

export function setupCropEvents(){
  var wrap=document.getElementById('cropWrap'),box=document.getElementById('cropBox');
  if(!wrap||!box)return;
  function getPos(e){var r=wrap.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:(t.clientX-r.left)/r.width*100,y:(t.clientY-r.top)/r.height*100};}
  box.addEventListener('mousedown',function(e){if(e.target!==box)return;cropState.dragging=true;var p=getPos(e);cropState.startX=p.x-cropState.box.x;cropState.startY=p.y-cropState.box.y;e.preventDefault();});
  box.addEventListener('touchstart',function(e){if(e.target!==box)return;cropState.dragging=true;var p=getPos(e);cropState.startX=p.x-cropState.box.x;cropState.startY=p.y-cropState.box.y;e.preventDefault();},{passive:false});
  [['h-tl','tl'],['h-tr','tr'],['h-bl','bl'],['h-br','br']].forEach(function(arr){
    var h=document.getElementById(arr[0]),type=arr[1];
    function start(e){cropState.resizing=type;var p=getPos(e);cropState.startX=p.x;cropState.startY=p.y;cropState._origBox=Object.assign({},cropState.box);e.stopPropagation();e.preventDefault();}
    h.addEventListener('mousedown',start);h.addEventListener('touchstart',start,{passive:false});
  });
  function move(e){
    var p=getPos(e);
    if(cropState.dragging){
      var nx=Math.max(0,Math.min(p.x-cropState.startX,100-cropState.box.w));
      var ny=Math.max(0,Math.min(p.y-cropState.startY,100-cropState.box.h));
      cropState.box.x=nx;cropState.box.y=ny;renderCropBox();
    } else if(cropState.resizing){
      var ob=cropState._origBox,dx=p.x-cropState.startX,dy=p.y-cropState.startY;
      var x=ob.x,y=ob.y,w=ob.w,h=ob.h,r=cropState.resizing;
      if(r==='tl'){x=Math.min(ob.x+ob.w-5,ob.x+dx);y=Math.min(ob.y+ob.h-5,ob.y+dy);w=ob.x+ob.w-x;h=ob.y+ob.h-y;}
      if(r==='tr'){w=Math.max(5,ob.w+dx);y=Math.min(ob.y+ob.h-5,ob.y+dy);h=ob.y+ob.h-y;}
      if(r==='bl'){x=Math.min(ob.x+ob.w-5,ob.x+dx);w=ob.x+ob.w-x;h=Math.max(5,ob.h+dy);}
      if(r==='br'){w=Math.max(5,ob.w+dx);h=Math.max(5,ob.h+dy);}
      x=Math.max(0,x);y=Math.max(0,y);if(x+w>100)w=100-x;if(y+h>100)h=100-y;
      cropState.box={x:x,y:y,w:w,h:h};renderCropBox();
    }
  }
  function end(){cropState.dragging=false;cropState.resizing=null;}
  wrap.addEventListener('mousemove',move);wrap.addEventListener('mouseup',end);
  wrap.addEventListener('touchmove',move,{passive:false});wrap.addEventListener('touchend',end);
}

export function applyCrop(){
  var img=document.getElementById('cropSourceImg'),b=cropState.box;
  var sx=img.naturalWidth*b.x/100,sy=img.naturalHeight*b.y/100;
  var sw=img.naturalWidth*b.w/100,sh=img.naturalHeight*b.h/100;
  var wc=document.getElementById('workCanvas');wc.width=sw;wc.height=sh;
  wc.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
  var cropped=wc.toDataURL('image/png');
  window.appState.originalDataUrl=cropped;window.appState.cutoutDataUrl=cropped;window.appState.finalDataUrl=cropped;
  document.getElementById('editMode').style.display='none';document.getElementById('viewMode').style.display='block';
  showInView(window.appState.finalDataUrl);
}

export function setTool(t){tu.tool=t;tu.painting=false;document.getElementById('btnRestore').classList.toggle('active',t==='restore');document.getElementById('btnErase').classList.toggle('active',t==='erase');clearCursor();}

export function pushUndo(){if(tu.undoStack.length>=20)tu.undoStack.shift();tu.undoStack.push(new ImageData(new Uint8ClampedArray(tu.imageData.data),tu.W,tu.H));updateUndoBtn();}

export function doUndo(){if(!tu.undoStack.length)return;tu.imageData=tu.undoStack.pop();tu.ctx.putImageData(tu.imageData,0,0);updateUndoBtn();}

export function updateUndoBtn(){var btn=document.getElementById('btnUndo');if(btn){btn.disabled=!tu.undoStack.length;btn.style.opacity=tu.undoStack.length?'1':'.35';}}

export function resetToOriginal(){if(!tu.origImageData)return;pushUndo();tu.imageData=new ImageData(new Uint8ClampedArray(tu.origImageData.data),tu.W,tu.H);tu.ctx.putImageData(tu.imageData,0,0);}

export function clampPan(){var wrap=document.getElementById('touchupWrap'),dw=wrap.clientWidth,dh=wrap.clientHeight,iw=tu.W*tu.scale,ih=tu.H*tu.scale;tu.offX=Math.min(0,Math.max(tu.offX,dw-iw));tu.offY=Math.min(0,Math.max(tu.offY,dh-ih));if(iw<dw)tu.offX=(dw-iw)/2;if(ih<dh)tu.offY=(dh-ih)/2;}

export function applyTransform(){if(!tu.canvas)return;tu.canvas.style.transformOrigin='0 0';tu.canvas.style.transform='translate('+tu.offX+'px,'+tu.offY+'px) scale('+tu.scale+')';}

export function zoomAt(cx,cy,factor){tu.offX=cx-factor*(cx-tu.offX);tu.offY=cy-factor*(cy-tu.offY);tu.scale=Math.min(10,Math.max(1,tu.scale*factor));clampPan();applyTransform();}

export function getXY(e){var r=tu.canvas.getBoundingClientRect();return{x:Math.round((e.clientX-r.left)*(tu.W/r.width)),y:Math.round((e.clientY-r.top)*(tu.H/r.height))};}

export function getScreenXY(e){var r=document.getElementById('touchupWrap').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}

export function drawCursor(sx,sy){if(!tu.cursorCanvas)return;var cc=tu.cursorCanvas,ctx=tu.cursorCtx;cc.width=cc.offsetWidth;cc.height=cc.offsetHeight;ctx.clearRect(0,0,cc.width,cc.height);var sv=parseInt(document.getElementById('tuStrength').value);var cr=(Math.round(sv*2)+10)*(tu.canvas.getBoundingClientRect().width/tu.W);ctx.beginPath();ctx.arc(sx,sy,cr,0,Math.PI*2);ctx.strokeStyle=tu.tool==='erase'?'rgba(220,80,60,0.85)':'rgba(80,160,80,0.85)';ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.arc(sx,sy,2,0,Math.PI*2);ctx.fillStyle=tu.tool==='erase'?'rgba(220,80,60,0.9)':'rgba(80,160,80,0.9)';ctx.fill();}

export function clearCursor(){if(tu.cursorCtx)tu.cursorCtx.clearRect(0,0,tu.cursorCanvas.width,tu.cursorCanvas.height);}

export function applyBrush(e){
  if(!tu.imageData)return;
  var pos=getXY(e),d=tu.imageData.data,od=tu.origImageData.data,W=tu.W,H=tu.H;
  var sv=parseInt(document.getElementById('tuStrength').value),radius=Math.round(sv*2)+10,r2=radius*radius;
  for(var py=Math.max(0,pos.y-radius);py<=Math.min(H-1,pos.y+radius);py++){
    for(var px=Math.max(0,pos.x-radius);px<=Math.min(W-1,pos.x+radius);px++){
      var ddx=px-pos.x,ddy=py-pos.y,dist2=ddx*ddx+ddy*ddy;if(dist2>r2)continue;
      var falloff=1-(Math.sqrt(dist2)/radius),idx=(py*W+px)*4;
      if(tu.tool==='erase'){d[idx+3]=Math.max(0,Math.round(d[idx+3]*(1-falloff*0.95)));}
      else{var t=falloff*0.95;d[idx]=Math.round(d[idx]+(od[idx]-d[idx])*t);d[idx+1]=Math.round(d[idx+1]+(od[idx+1]-d[idx+1])*t);d[idx+2]=Math.round(d[idx+2]+(od[idx+2]-d[idx+2])*t);d[idx+3]=Math.min(od[idx+3],Math.round(d[idx+3]+(od[idx+3]-d[idx+3])*t));}
    }
  }
  tu.ctx.putImageData(tu.imageData,0,0);
}

export function initTouchup(){
  var wrap=document.getElementById('touchupWrap'),oldC=document.getElementById('touchupCanvas');
  var newC=document.createElement('canvas');newC.id='touchupCanvas';newC.style.cssText='display:block;position:absolute;top:0;left:0;transform-origin:0 0;';
  oldC.replaceWith(newC);tu.canvas=newC;tu.ctx=newC.getContext('2d');
  tu.cursorCanvas=document.getElementById('cursorCanvas');if(tu.cursorCanvas)tu.cursorCtx=tu.cursorCanvas.getContext('2d');
  tu.painting=false;tu.undoStack=[];tu.scale=1;tu.offX=0;tu.offY=0;updateUndoBtn();
  var imgC=new Image(),imgO=new Image(),cReady=false,oReady=false;
  function tryInit(){
    if(!cReady||!oReady)return;
    var MAX=900,W=imgC.naturalWidth,H=imgC.naturalHeight;
    if(W>MAX){H=Math.round(H*MAX/W);W=MAX;} if(H>MAX){W=Math.round(W*MAX/H);H=MAX;}
    newC.width=W;newC.height=H;if(wrap)wrap.style.height=(wrap.offsetWidth*(H/W))+'px';
    tu.W=W;tu.H=H;tu.ctx.drawImage(imgC,0,0,W,H);
    tu.imageData=tu.ctx.getImageData(0,0,W,H);
    var off=document.createElement('canvas');off.width=W;off.height=H;off.getContext('2d').drawImage(imgO,0,0,W,H);
    tu.origImageData=off.getContext('2d').getImageData(0,0,W,H);applyTransform();
  }
  imgC.onload=function(){cReady=true;tryInit();};imgO.onload=function(){oReady=true;tryInit();};
  imgC.src=window.appState.cutoutDataUrl;imgO.src=window.appState.originalDataUrl;
  newC.addEventListener('mousedown',function(e){if(e.button===1||e.altKey){tu.panning=true;tu.lastPanX=e.clientX;tu.lastPanY=e.clientY;e.preventDefault();return;}pushUndo();tu.painting=true;applyBrush(e);e.preventDefault();});
  newC.addEventListener('mousemove',function(e){var s=getScreenXY(e);drawCursor(s.x,s.y);if(tu.panning){tu.offX+=e.clientX-tu.lastPanX;tu.offY+=e.clientY-tu.lastPanY;tu.lastPanX=e.clientX;tu.lastPanY=e.clientY;clampPan();applyTransform();return;}if(tu.painting)applyBrush(e);});
  newC.addEventListener('mouseup',function(){tu.painting=false;tu.panning=false;});newC.addEventListener('mouseleave',function(){tu.painting=false;tu.panning=false;clearCursor();});
  if(wrap)wrap.addEventListener('wheel',function(e){e.preventDefault();var r=wrap.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,e.deltaY<0?1.15:1/1.15);},{passive:false});
  newC.addEventListener('touchstart',function(e){e.preventDefault();if(e.touches.length>=2){tu.painting=false;tu.pinching=true;tu.lastPinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);tu.lastPanX=(e.touches[0].clientX+e.touches[1].clientX)/2;tu.lastPanY=(e.touches[0].clientY+e.touches[1].clientY)/2;var r=wrap.getBoundingClientRect();tu.pinchMidX=tu.lastPanX-r.left;tu.pinchMidY=tu.lastPanY-r.top;clearCursor();}else if(!tu.pinching){pushUndo();tu.painting=true;applyBrush(e.touches[0]);var s=getScreenXY(e.touches[0]);drawCursor(s.x,s.y);}},{passive:false});
  newC.addEventListener('touchmove',function(e){e.preventDefault();if(e.touches.length>=2&&tu.pinching){var dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);var mx=(e.touches[0].clientX+e.touches[1].clientX)/2,my=(e.touches[0].clientY+e.touches[1].clientY)/2;var r=wrap.getBoundingClientRect();zoomAt(mx-r.left,my-r.top,dist/tu.lastPinchDist);tu.lastPinchDist=dist;tu.offX+=mx-tu.lastPanX;tu.offY+=my-tu.lastPanY;tu.lastPanX=mx;tu.lastPanY=my;clampPan();applyTransform();}else if(e.touches.length===1&&tu.painting){applyBrush(e.touches[0]);var s=getScreenXY(e.touches[0]);drawCursor(s.x,s.y);}},{passive:false});
  newC.addEventListener('touchend',function(e){e.preventDefault();if(e.touches.length===0){tu.painting=false;tu.pinching=false;clearCursor();}else if(e.touches.length===1){tu.pinching=false;tu.painting=false;}},{passive:false});
  document.addEventListener('keydown',handleUndoKey);
}

export function handleUndoKey(e){if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();doUndo();}}

export function applyTouchup(){
  document.removeEventListener('keydown',handleUndoKey);
  window.appState.finalDataUrl=tu.canvas.toDataURL('image/png');window.appState.cutoutDataUrl=window.appState.finalDataUrl;
  tu={canvas:null,ctx:null,cursorCanvas:null,cursorCtx:null,imageData:null,origImageData:null,W:0,H:0,tool:'erase',painting:false,undoStack:[],scale:1,offX:0,offY:0,pinching:false,lastPinchDist:0,pinchMidX:0,pinchMidY:0,panning:false,lastPanX:0,lastPanY:0};
  document.getElementById('editMode').style.display='none';document.getElementById('viewMode').style.display='block';showInView(window.appState.finalDataUrl);
}

