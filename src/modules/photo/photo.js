// Photo upload, background removal, camera

export let camStream = null;
export let camFacing = 'user';

export function removeBackground(imgEl){
  return new Promise(function(resolve){
    var wc=document.getElementById('workCanvas'),MAX=900;
    var W=imgEl.naturalWidth,H=imgEl.naturalHeight;
    if(W>MAX){H=Math.round(H*MAX/W);W=MAX;} if(H>MAX){W=Math.round(W*MAX/H);H=MAX;}
    wc.width=W;wc.height=H;
    var ctx=wc.getContext('2d'); ctx.drawImage(imgEl,0,0,W,H);
    var id=ctx.getImageData(0,0,W,H),d=id.data,s=[];
    for(var x=0;x<W;x++){s.push([d[(0*W+x)*4],d[(0*W+x)*4+1],d[(0*W+x)*4+2]]);s.push([d[((H-1)*W+x)*4],d[((H-1)*W+x)*4+1],d[((H-1)*W+x)*4+2]]);}
    for(var y=0;y<H;y++){s.push([d[(y*W)*4],d[(y*W)*4+1],d[(y*W)*4+2]]);s.push([d[(y*W+W-1)*4],d[(y*W+W-1)*4+1],d[(y*W+W-1)*4+2]]);}
    var bgR=s.reduce(function(a,c){return a+c[0];},0)/s.length;
    var bgG=s.reduce(function(a,c){return a+c[1];},0)/s.length;
    var bgB=s.reduce(function(a,c){return a+c[2];},0)/s.length;
    var HARD=48,SOFT=70;
    function dist(i){var dr=d[i]-bgR,dg=d[i+1]-bgG,db=d[i+2]-bgB;return Math.sqrt(dr*dr+dg*dg+db*db);}
    var visited=new Uint8Array(W*H),queue=[];
    function enq(x,y){var i=y*W+x;if(visited[i])return;visited[i]=1;if(dist(i*4)<HARD)queue.push(i);}
    for(var x=0;x<W;x++){enq(x,0);enq(x,H-1);} for(var y=0;y<H;y++){enq(0,y);enq(W-1,y);}
    var qi=0;
    while(qi<queue.length){
      var i=queue[qi++];d[i*4+3]=0;
      var qx=i%W,qy=(i/W)|0;
      [[qx-1,qy],[qx+1,qy],[qx,qy-1],[qx,qy+1]].forEach(function(p){
        var nx=p[0],ny=p[1];
        if(nx<0||nx>=W||ny<0||ny>=H) return;
        var ni=ny*W+nx; if(visited[ni]) return; visited[ni]=1;
        var nd=dist(ni*4);
        if(nd<HARD) queue.push(ni);
        else if(nd<SOFT) d[ni*4+3]=Math.round(((nd-HARD)/(SOFT-HARD))*255);
      });
    }
    var a=new Uint8Array(W*H); for(var i=0;i<W*H;i++) a[i]=d[i*4+3];
    for(var y=1;y<H-1;y++) for(var x=1;x<W-1;x++){
      var i=y*W+x;
      if(a[i]===255){
        var hasT=false;
        [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].forEach(function(p){if(a[p[1]*W+p[0]]===0)hasT=true;});
        if(hasT) d[i*4+3]=140;
      }
    }
    ctx.putImageData(id,0,0);resolve(wc.toDataURL('image/png'));
  });
}

export function showInView(url){
  var s=function(id){return document.getElementById(id);};
  var fi=s('faceImg'); if(fi){fi.src=url;fi.style.display='block';}
  if(s('procOverlay'))      s('procOverlay').style.display='none';
  if(s('viewActions'))      s('viewActions').style.display='flex';
  if(s('palettesWrap'))     s('palettesWrap').style.display='block';
  if(s('avoidPaletteWrap')) s('avoidPaletteWrap').style.display='block';
  if(!currentSwatch){var f=document.querySelector('#goodSwatches .swatch');if(f)setBackground(f._hex||f.getAttribute('data-hex'),f._name||f.getAttribute('data-name'),f);}
}

export function handleFile(file){
  var uz=document.getElementById('uploadZone'),pr=document.getElementById('procOverlay');
  if(uz) uz.style.display='none'; if(pr) pr.style.display='flex';
  var fr=new FileReader();
  fr.onload=function(e){
    originalDataUrl=e.target.result;
    var skip=document.getElementById('skipBgRemoval');
    if(skip&&skip.checked){cutoutDataUrl=originalDataUrl;finalDataUrl=originalDataUrl;showInView(finalDataUrl);return;}
    var img=new Image();
    img.onload=function(){
      removeBackground(img).then(function(url){cutoutDataUrl=url;finalDataUrl=url;showInView(url);});
    };
    img.src=originalDataUrl;
  };
  fr.readAsDataURL(file);
}

export function openGuide(){var g=document.getElementById('cameraGuide');if(g)g.classList.add('open');}

export function closeGuide(){var g=document.getElementById('cameraGuide');if(g)g.classList.remove('open');}

export function confirmGuide(){closeGuide();document.getElementById('fileInput').click();}

export function openLiveCamera(){closeGuide();var m=document.getElementById('liveCameraModal');if(m)m.classList.add('open');startStream();}

export function openLiveCameraForOb(){var m=document.getElementById('liveCameraModal');if(m)m.classList.add('open');startStream();}

export function closeLiveCamera(){
  if(camStream){camStream.getTracks().forEach(function(t){t.stop();});camStream=null;}
  var m=document.getElementById('liveCameraModal');if(m)m.classList.remove('open');
  var v=document.getElementById('camVideo');if(v)v.srcObject=null;
}

export function flipCamera(){camFacing=camFacing==='user'?'environment':'user';startStream();}

export function startStream(){
  if(camStream)camStream.getTracks().forEach(function(t){t.stop();});
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){showCameraError('Kamerazugriff nicht unterstützt. Bitte lade die Datei lokal im Browser.');return;}
  navigator.mediaDevices.getUserMedia({video:{facingMode:camFacing,width:{ideal:1280},height:{ideal:1280}},audio:false})
  .then(function(stream){
    camStream=stream;var v=document.getElementById('camVideo');
    if(v){v.srcObject=stream;v.classList.toggle('mirror',camFacing==='user');}
  }).catch(function(err){closeLiveCamera();showCameraError('Kamerazugriff verweigert: '+err.message);});
}

export function capturePhoto(){
  var video=document.getElementById('camVideo'),wc=document.getElementById('workCanvas');
  wc.width=video.videoWidth;wc.height=video.videoHeight;
  var ctx=wc.getContext('2d');
  if(camFacing==='user'){ctx.translate(wc.width,0);ctx.scale(-1,1);}
  ctx.drawImage(video,0,0);
  var url=wc.toDataURL('image/jpeg',0.92);
  closeLiveCamera();
  fetch(url).then(function(r){return r.blob();}).then(function(b){handleFile(new File([b],'camera.jpg',{type:'image/jpeg'}));});
}

export function captureObPhoto(){
  var video=document.getElementById('camVideo'),wc=document.getElementById('workCanvas');
  wc.width=video.videoWidth;wc.height=video.videoHeight;
  var ctx=wc.getContext('2d');
  if(camFacing==='user'){ctx.translate(wc.width,0);ctx.scale(-1,1);}
  ctx.drawImage(video,0,0);
  window.appState.obPhotoDataUrl=wc.toDataURL('image/jpeg',0.92);
  closeLiveCamera();showObPhotoPreview(window.appState.obPhotoDataUrl);
}

export function showCameraError(msg){
  openGuide();
  var actions=document.querySelector('.guide-actions');
  var e=document.getElementById('camErrorMsg');
  if(!e){e=document.createElement('div');e.id='camErrorMsg';e.style.cssText='padding:0 20px 12px;';if(actions&&actions.parentNode)actions.parentNode.insertBefore(e,actions);}
  e.innerHTML='<p style="font-size:.68rem;color:#c07878;line-height:1.5;margin-bottom:10px;">\u26a0\ufe0f '+msg+'</p>'
    +'<button onclick="openInNewTab()" style="width:100%;padding:10px;border-radius:8px;background:linear-gradient(135deg,#4a7fa5,#3a6a90);border:none;color:#fff;font-family:sans-serif;font-size:.76rem;cursor:pointer;">\u2b07\ufe0f App herunterladen & lokal \u00f6ffnen</button>';
}

export function openInNewTab(){
  var src=document.documentElement.outerHTML;
  var blob=new Blob([src],{type:'text/html'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='farbanalyse.html';a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
}

export function showObPhotoPreview(url){
  var ids=['obPhotoPreview','resultPhotoHero','resultPhotoBg'];
  ids.forEach(function(id){var e=document.getElementById(id);if(e){e.src=url;e.style.display='block';}});
  var ph=document.getElementById('obPhotoPlaceholder'); if(ph) ph.style.display='none';
  var ru=document.getElementById('obPhotoReupload');    if(ru) ru.style.display='block';
  var bg=document.getElementById('obPhotoBgImg');       if(bg){bg.src=url;bg.style.opacity='1';}
  var ar=document.getElementById('obPhotoArea');        if(ar) ar.style.borderColor='transparent';
  var ct=document.getElementById('obPhotoCta');         if(ct) ct.textContent='Mit diesem Foto weiter \u2192';
  var pp=document.getElementById('resultPheroPlaceholder'); if(pp) pp.style.display='none';
  var st=document.getElementById('obQuizPhotoStrip'),th=document.getElementById('obQuizThumb');
  if(st&&th){th.src=url;st.style.display='block';}
}

export function handleObPhoto(input){
  var file=input.files[0]; if(!file) return;
  var fr=new FileReader();
  fr.onload=function(e){window.appState.obPhotoDataUrl=e.target.result;showObPhotoPreview(window.appState.obPhotoDataUrl);};
  fr.readAsDataURL(file);
}

