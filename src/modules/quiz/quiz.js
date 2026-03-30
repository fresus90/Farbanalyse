// Onboarding quiz - swipe + questions
import { COLOR_TYPES, QUIZ_QUESTIONS, SWIPE_TYPES } from '../../data/colorTypes.js';
import { showObPhotoPreview } from '../photo/photo.js';

export const quiz = { step:0, scores:{}, answers:[], _started:false };

export function goToScreen(id){
  document.querySelectorAll('.ob-screen').forEach(function(s){s.classList.remove('active');});
  var sc=document.getElementById(id); if(sc){sc.classList.add('active');sc.scrollTop=0;}
  if(id==='obQuiz'&&!quiz._started){quiz._started=true;initScores();quiz.step=0;quiz.answers=[];buildCards();updateProgress();}
  if((id==='obQuiz'||id==='obResult')&&window.appState.obPhotoDataUrl) showObPhotoPreview(window.appState.obPhotoDataUrl);
}

export function initScores(){Object.keys(COLOR_TYPES).forEach(function(k){quiz.scores[k]=0;});}

export function addScore(tokens,pts){
  tokens.forEach(function(tok){
    Object.keys(quiz.scores).forEach(function(k){
      if(k===tok||k.startsWith(tok+'_')||tok.startsWith(k.split('_')[0]+'_')&&k.startsWith(tok.split('_')[0]))
        quiz.scores[k]+=pts;
    });
  });
}

export function buildCards(){
  var area=document.getElementById('quizCardArea'); if(!area) return;
  area.innerHTML='';
  var types=SWIPE_TYPES;
  for(var i=Math.min(2,types.length-quiz.step-1);i>=0;i--){
    var tk=types[quiz.step+i]; if(!tk||!COLOR_TYPES[tk]) continue;
    var t=COLOR_TYPES[tk], card=document.createElement('div');
    card.className='quiz-card '+(i===0?'front':'back-'+i);
    if(i===0) card.id='frontCard';
    var paletteHtml=t.good.slice(0,8).map(function(c){
      return '<div class="card-pal-swatch" style="background:'+c.hex+'" title="'+c.name+'"></div>';
    }).join('');
    var traitsHtml=t.desc.split('·').map(function(s){
      return '<span class="card-trait">'+s.trim()+'</span>';
    }).join('');
    card.innerHTML='<div class="like-stamp">\u2665 PASST</div>'
      +'<div class="nope-stamp">\u2715 NICHT ICH</div>'
      +'<div class="card-avatar">'+makeAvatar(tk)+'</div>'
      +'<div class="card-info">'
        +'<div class="card-type-name">'+t.name+'</div>'
        +'<div class="card-type-season">'+t.season+'</div>'
        +'<div class="card-traits">'+traitsHtml+'</div>'
        +'<div class="card-palette">'+paletteHtml+'</div>'
      +'</div>';
    area.appendChild(card);
  }
  var fc=document.getElementById('frontCard'); if(fc) attachDrag(fc);
}

export function attachDrag(card){
  function getPos(e){var pt=e.touches?e.touches[0]:e;return{x:pt.clientX,y:pt.clientY};}
  function start(e){dragState.active=true;dragState.card=card;var p=getPos(e);dragState.startX=p.x;dragState.startY=p.y;dragState.tx=0;card.style.transition='none';}
  function move(e){
    if(!dragState.active) return; e.preventDefault();
    var dx=(e.touches?e.touches[0]:e).clientX-dragState.startX;
    var dy=(e.touches?e.touches[0]:e).clientY-dragState.startY;
    dragState.tx=dx;
    card.style.transform='translate('+dx+'px,'+(dy*.3)+'px) rotate('+(dx*.08)+'deg)';
    card.querySelector('.like-stamp').style.opacity=Math.max(0,dx/80);
    card.querySelector('.nope-stamp').style.opacity=Math.max(0,-dx/80);
  }
  function end(){
    if(!dragState.active) return; dragState.active=false;
    var dx=dragState.tx;
    if(dx>70){animateSwipe(card,'right');}
    else if(dx<-70){animateSwipe(card,'left');}
    else{card.style.transition='transform .4s';card.style.transform='';card.querySelector('.like-stamp').style.opacity=0;card.querySelector('.nope-stamp').style.opacity=0;}
  }
  card.addEventListener('mousedown',start);card.addEventListener('mousemove',move);card.addEventListener('mouseup',end);card.addEventListener('mouseleave',end);
  card.addEventListener('touchstart',start,{passive:false});card.addEventListener('touchmove',move,{passive:false});card.addEventListener('touchend',end);
}

export function animateSwipe(card,dir){
  card.style.transition='transform .35s,opacity .35s';
  card.style.transform=dir==='right'?'translate(140%,-20px) rotate(25deg)':'translate(-140%,-20px) rotate(-25deg)';
  card.style.opacity='0';
  setTimeout(function(){processSwipe(dir==='right');},320);
}

export function swipeLike(){var fc=document.getElementById('frontCard');if(fc)animateSwipe(fc,'right');}

export function swipeNope(){var fc=document.getElementById('frontCard');if(fc)animateSwipe(fc,'left');}

export function processSwipe(liked){
  var tk=SWIPE_TYPES[quiz.step],t=COLOR_TYPES[tk];
  if(liked&&t) addScore([t.season.toLowerCase(),tk],3);
  quiz.answers.push({step:quiz.step,typeKey:tk,liked:liked});
  quiz.step++;updateProgress();
  if(quiz.step<4){buildCards();}else{showQuestionStep(0);}
}

export function showQuestionStep(qIdx){
  document.getElementById('quizCardArea').style.display='none';
  var qa=document.getElementById('quizQuestionArea'); qa.classList.add('active');
  document.getElementById('btnNope').style.display='none';
  document.getElementById('btnLike').style.display='none';
  document.getElementById('btnSkip').style.display='flex';
  var q=QUIZ_QUESTIONS[qIdx];
  document.getElementById('quizQTitle').textContent=q.title;
  document.getElementById('quizQSub').textContent=q.sub;
  var opts=document.getElementById('quizOptions'); opts.innerHTML='';
  var isSkin=q.layout==='skin'; if(isSkin) opts.style.gridTemplateColumns='1fr 1fr';
  q.options.forEach(function(opt,i){
    var div=document.createElement('div'); div.className='quiz-option';
    if(isSkin&&opt.swatches){
      var grad='linear-gradient(135deg,'+opt.swatches[0]+','+opt.swatches[1]+','+opt.swatches[2]+')';
      div.innerHTML='<div style="width:100%;height:52px;border-radius:8px;background:'+grad+';margin-bottom:8px;position:relative;">'
        +'<div style="position:absolute;bottom:4px;right:6px;width:14px;height:4px;border-radius:2px;background:'+opt.veinColor+';opacity:.7;"></div></div>'
        +'<div style="font-size:.68rem;color:#c8d4dc;font-weight:500;margin-bottom:2px;">'+opt.label+'</div>'
        +'<div style="font-size:.58rem;color:#4a6a7a;">'+opt.sub+'</div>'
        +'<div style="font-size:.54rem;color:#3a5060;margin-top:3px;">Ader: <span style="color:'+opt.veinColor+'">'+opt.vein+'</span></div>';
    } else if(opt.swatch){
      div.innerHTML='<div style="width:100%;height:36px;border-radius:6px;background:'+opt.swatch+';margin-bottom:8px;"></div>'
        +'<div style="font-size:.68rem;color:#c8d4dc;font-weight:500;margin-bottom:2px;">'+opt.label+'</div>'
        +'<div style="font-size:.58rem;color:#4a6a7a;">'+(opt.sub||'')+'</div>';
    } else {
      div.innerHTML='<span style="font-size:1.5rem;display:block;margin-bottom:6px;">'+(opt.icon||'●')+'</span>'
        +'<div style="font-size:.68rem;color:#c8d4dc;font-weight:500;margin-bottom:2px;">'+opt.label+'</div>'
        +'<div style="font-size:.58rem;color:#4a6a7a;">'+(opt.sub||'')+'</div>';
    }
    div.addEventListener('click',function(){
      opts.querySelectorAll('.quiz-option').forEach(function(o){o.classList.remove('selected');});
      div.classList.add('selected');
      addScore(opt.tokens,4);
      quiz.answers.push({step:quiz.step,qId:q.id,choice:i});
      setTimeout(function(){
        quiz.step++;updateProgress();
        var nq=quiz.step-4;
        if(nq<QUIZ_QUESTIONS.length){showQuestionStep(nq);}else{showResult();}
      },380);
    });
    opts.appendChild(div);
  });
}

export function updateProgress(){
  var total=8,pct=Math.round(((quiz.step+1)/total)*100);
  var bf=document.getElementById('quizBarFill'); if(bf) bf.style.width=pct+'%';
  var sl=document.getElementById('quizStepLabel'); if(sl) sl.textContent='Schritt '+Math.min(quiz.step+1,total)+' von '+total;
}

export function nextQuizStep(){
  quiz.step++;updateProgress();
  var nq=quiz.step-4;
  if(quiz.step<4){processSwipe(false);}
  else if(nq<QUIZ_QUESTIONS.length){showQuestionStep(nq);}
  else{showResult();}
}

export function showResult(){
  var qa=document.getElementById('quizQuestionArea'); if(qa) qa.classList.remove('active');
  var ca=document.getElementById('quizCardArea'); if(ca) ca.style.display='none';
  var ab=document.getElementById('quizActionBtns'); if(ab) ab.style.display='none';
  var bf=document.getElementById('quizBarFill'); if(bf) bf.style.width='100%';
  var sl=document.getElementById('quizStepLabel'); if(sl) sl.textContent='Auswertung \u2728';
  goToScreen('obResult');
  var qr=document.getElementById('quizResult'); if(qr) qr.style.display='flex';
  var sorted=Object.entries(quiz.scores).sort(function(a,b){return b[1]-a[1];}).filter(function(x){return x[1]>0;});
  var topKey=sorted[0]?sorted[0][0]:'summer_cool', topScore=sorted[0]?sorted[0][1]:1;
  var t=COLOR_TYPES[topKey];
  var ri=document.getElementById('resultIcon'); if(ri) ri.style.background=t.gradient;
  var rb=document.getElementById('resultBadge'); if(rb) rb.textContent=t.season;
  var rn=document.getElementById('resultName');  if(rn) rn.textContent=t.name;
  var rd=document.getElementById('resultDesc');  if(rd) rd.textContent=t.desc;
  var rp=document.getElementById('resultPalette');
  if(rp) rp.innerHTML=t.good.map(function(c){return '<div class="result-pal-swatch" style="background:'+c.hex+'"></div>';}).join('');
  var rr=document.getElementById('resultRunners');
  if(rr){
    rr.innerHTML='';
    sorted.slice(1,4).forEach(function(arr){
      var k=arr[0],v=arr[1],rt=COLOR_TYPES[k],pct=Math.round((v/topScore)*100);
      var el=document.createElement('div'); el.className='runner-up';
      el.innerHTML='<div class="runner-icon" style="background:'+rt.gradient+'"></div>'
        +'<div class="runner-name">'+rt.name+'</div>'
        +'<div class="runner-bar-track"><div class="runner-bar-fill" style="width:'+pct+'%;background:'+rt.good[0].hex+'"></div></div>'
        +'<div class="conf-label">'+pct+'%</div>';
      rr.appendChild(el);
    });
  }
  var rc=document.getElementById('resultCta'); if(rc) rc.onclick=function(){applyQuizResult(topKey);};
  var re=document.getElementById('resultExplain');
  if(re){
    var stext={'Frühling':'Du bist ein warmer, heller Typ – frische, leuchtende Farben bringen deine natürliche Ausstrahlung zum Vorschein.',
      'Sommer':'Du bist ein kühler, weicher Typ – gedämpfte, kühle Töne harmonieren perfekt mit deinem Undertone.',
      'Herbst':'Du bist ein warmer, geerdeter Typ – reiche Erdtöne und warme Herbstfarben schmeicheln deinem Teint.',
      'Winter':'Du bist ein kühler, kontrastreicher Typ – klare, intensive Farben lassen dich besonders strahlend wirken.'}[t.season]||'';
    var bestColors=t.good.slice(0,4).map(function(c){
      return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+c.hex+';vertical-align:middle;margin:0 2px;"></span>'+c.name;
    }).join(', ');
    re.innerHTML='<strong style="color:#c8d4dc;display:block;margin-bottom:6px;">Was das bedeutet</strong>'
      +stext+'<br><br>Deine <strong style="color:#a8c4d8">Bestfarben</strong> sind '+bestColors+'.'
      +'<br><span style="color:#4a6a7a;font-size:.64rem;display:block;margin-top:8px;">Vergleiche im nächsten Schritt dein Foto direkt mit verschiedenen Farbhintergründen.</span>';
  }
  if(window.appState.obPhotoDataUrl) showObPhotoPreview(window.appState.obPhotoDataUrl);
}

export function applyQuizResult(typeKey){
  try{
    var qs=document.getElementById('quizScreen'); if(qs) qs.style.display='none';
    var vm=document.getElementById('viewMode');   if(vm) vm.style.display='block';
    var ts=document.getElementById('typeSelectorWrap'); if(ts) ts.style.display='block';
    var tc=document.getElementById('typeCard');   if(tc) tc.style.display='flex';
    if(typeKey&&COLOR_TYPES[typeKey]) onTypeChange(typeKey);
    if(window.appState.obPhotoDataUrl){
      originalDataUrl=window.appState.obPhotoDataUrl;
      var uz=document.getElementById('uploadZone'),pr=document.getElementById('procOverlay'),fi=document.getElementById('faceImg');
      if(uz) uz.style.display='none'; if(pr) pr.style.display='flex'; if(fi) fi.style.display='none';
      var img=new Image();
      img.onload=function(){
        removeBackground(img).then(function(url){
          cutoutDataUrl=url;finalDataUrl=url;showInView(url);
        }).catch(function(){showInView(window.appState.obPhotoDataUrl);});
      };
      img.onerror=function(){showInView(window.appState.obPhotoDataUrl);};
      img.src=window.appState.obPhotoDataUrl;
    }
  }catch(e){
    var qs=document.getElementById('quizScreen'); if(qs) qs.style.display='none';
    var vm=document.getElementById('viewMode');   if(vm) vm.style.display='block';
  }
}

export function skipQuiz(){
  try{
    var qs=document.getElementById('quizScreen'); if(qs) qs.style.display='none';
    var vm=document.getElementById('viewMode');   if(vm) vm.style.display='block';
    var ts=document.getElementById('typeSelectorWrap'); if(ts) ts.style.display='block';
    var tc=document.getElementById('typeCard');   if(tc) tc.style.display='flex';
  }catch(e){
    var qs=document.getElementById('quizScreen'); if(qs) qs.style.display='none';
    var vm=document.getElementById('viewMode');   if(vm) vm.style.display='block';
  }
}

export function makeAvatar(k){
  var t=COLOR_TYPES[k]; if(!t) return '';
  var c=t.good, i={'Frühling':'🌸','Sommer':'☀️','Herbst':'🍂','Winter':'❄️'}[t.season]||'🎨';
  var dots=c.slice(0,6).map(function(x,j){return '<circle cx="'+(50+j*40)+'" cy="285" r="14" fill="'+x.hex+'"/>';}).join('');
  return '<svg viewBox="0 0 300 375" xmlns="http://www.w3.org/2000/svg">'
    +'<defs><radialGradient id="rg'+k+'" cx="40%" cy="35%" r="70%">'
    +'<stop offset="0%" stop-color="'+c[0].hex+'" stop-opacity=".9"/>'
    +'<stop offset="60%" stop-color="'+(c[2]||c[1]).hex+'" stop-opacity=".7"/>'
    +'<stop offset="100%" stop-color="'+(c[4]||c[1]).hex+'" stop-opacity=".5"/>'
    +'</radialGradient></defs>'
    +'<rect width="300" height="375" fill="#0f1117"/>'
    +'<rect width="300" height="375" fill="url(#rg'+k+')" opacity=".85"/>'
    +'<circle cx="220" cy="60" r="55" fill="'+c[0].hex+'" opacity=".2"/>'
    +'<text x="150" y="155" text-anchor="middle" font-size="72">'+i+'</text>'
    +'<text x="150" y="208" text-anchor="middle" font-size="20" fill="white" font-family="Georgia,serif">'+t.name+'</text>'
    +'<text x="150" y="232" text-anchor="middle" font-size="10" fill="white" font-family="sans-serif" opacity=".5" letter-spacing="3">'+t.season.toUpperCase()+'</text>'
    +dots
    +'<rect x="0" y="330" width="300" height="45" fill="rgba(0,0,0,0.4)"/>'
    +'<text x="150" y="357" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.55)" font-family="sans-serif">'+t.desc.split('·')[0].trim()+'</text>'
    +'</svg>';
}

