// Split-screen compare mode - extracted from working reference
import { COLOR_TYPES } from '../../data/colorTypes.js';

// Compare state
export const cmp = {
  dividerPct: 50, dragging: false,
  left:  { typeKey: '', color: '#4a7fa5', gradActive: false },
  right: { typeKey: '', color: '#1a2e4a', gradActive: false }
};

export function openCompare(){
  if(!finalDataUrl) return;
  var groups={'🌸 Frühling':['spring_light','spring_warm','spring_clear'],'☀️ Sommer':['summer_light','summer_cool','summer_soft'],'🍂 Herbst':['autumn_soft','autumn_warm','autumn_deep'],'❄️ Winter':['winter_cool','winter_deep','winter_clear']};
  ['cmpTypeLeft','cmpTypeRight'].forEach(function(id){
    var sel=document.getElementById(id); if(!sel) return;
    while(sel.options.length>1) sel.remove(1);
    Object.entries(groups).forEach(function(entry){
      var og=document.createElement('optgroup'); og.label=entry[0];
      entry[1].forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=COLOR_TYPES[k].name;og.appendChild(o);});
      sel.appendChild(og);
    });
  });
  var cur=document.getElementById('typeDropdown');if(cur){document.getElementById('cmpTypeLeft').value=cur.value;onCmpTypeChange('left',cur.value);}
  onCmpTypeChange('right','');
  var ci=document.getElementById('cmpFaceImg');if(ci)ci.src=finalDataUrl;
  document.getElementById('viewMode').style.display='none';
  document.getElementById('compareMode').style.display='block';
  updateCmpDivider();setupCmpDrag();
}

export function closeCompare(){document.getElementById('compareMode').style.display='none';document.getElementById('viewMode').style.display='block';}

export function setupCmpDrag(){
  var stage=document.getElementById('cmpStage'),div=document.getElementById('cmpDivider');if(!stage||!div)return;
  function setFromEvent(e){var t=e.touches?e.touches[0]:e,r=stage.getBoundingClientRect();cmp.dividerPct=Math.min(95,Math.max(5,(t.clientX-r.left)/r.width*100));updateCmpDivider();}
  div.addEventListener('mousedown',function(e){cmp.dragging=true;e.preventDefault();});
  window.addEventListener('mousemove',function(e){if(cmp.dragging)setFromEvent(e);});
  window.addEventListener('mouseup',function(){cmp.dragging=false;});
  div.addEventListener('touchstart',function(e){cmp.dragging=true;e.preventDefault();},{passive:false});
  window.addEventListener('touchmove',function(e){if(cmp.dragging)setFromEvent(e);},{passive:false});
  window.addEventListener('touchend',function(){cmp.dragging=false;});
}

export function updateCmpDivider(){
  var p=cmp.dividerPct;
  var d=document.getElementById('cmpDivider');if(d)d.style.left=p+'%';
  var bl=document.getElementById('cmpBgLeft');if(bl)bl.style.right=(100-p)+'%';
  var br=document.getElementById('cmpBgRight');if(br)br.style.left=p+'%';
  var gl=document.getElementById('cmpGradLeft');if(gl)gl.style.right=(100-p)+'%';
  var gr=document.getElementById('cmpGradRight');if(gr)gr.style.left=p+'%';
}

export function onCmpTypeChange(side,key){
  cmp[side].typeKey=key;
  var swId=side==='left'?'cmpSwatchesLeft':'cmpSwatchesRight';
  var container=document.getElementById(swId);if(!container)return;
  container.innerHTML='';
  if(!key){applyCmpBackground(side,'');updateCmpLabel(side,side==='left'?'Links':'Rechts');return;}
  var t=COLOR_TYPES[key]; updateCmpLabel(side,t.name);
  var togId=side==='left'?'cmpGradToggleLeft':'cmpGradToggleRight';
  t.good.forEach(function(item){
    var d=document.createElement('div');d.className='cmp-swatch';d.style.background=item.hex;d.title=item.name;
    d.addEventListener('click',function(){
      var tog=document.getElementById(togId);if(tog)tog.checked=false;
      cmp[side].gradActive=false;
      container.querySelectorAll('.cmp-swatch').forEach(function(s){s.classList.remove('active');});
      d.classList.add('active');cmp[side].color=item.hex;applyCmpBackground(side,item.hex);
    });
    container.appendChild(d);
  });
  if(cmp[side].gradActive)applyCmpGradient(side);
  else{cmp[side].color=t.good[0].hex;applyCmpBackground(side,t.good[0].hex);var f=container.querySelector('.cmp-swatch');if(f)f.classList.add('active');}
}

export function onCmpGradToggle(side){
  var id=side==='left'?'cmpGradToggleLeft':'cmpGradToggleRight';
  var cb=document.getElementById(id);if(!cb)return;
  cmp[side].gradActive=cb.checked;
  if(cb.checked)applyCmpGradient(side);else applyCmpBackground(side,cmp[side].color);
}

export function applyCmpBackground(side,color){
  var bg=document.getElementById(side==='left'?'cmpBgLeft':'cmpBgRight');if(bg)bg.style.background=color||'#1a1f2a';
  var gr=document.getElementById(side==='left'?'cmpGradLeft':'cmpGradRight');if(gr)gr.style.opacity='0';
}

export function applyCmpGradient(side){
  if(!cmp[side].typeKey) return;
  var t=COLOR_TYPES[cmp[side].typeKey];
  var stops=t.good.map(function(c,i){return c.hex+' '+Math.round(i/(t.good.length-1)*100)+'%';}).join(',');
  var gr=document.getElementById(side==='left'?'cmpGradLeft':'cmpGradRight');
  var bg=document.getElementById(side==='left'?'cmpBgLeft':'cmpBgRight');
  if(gr){gr.style.background='linear-gradient(to bottom,'+stops+')';gr.style.opacity='1';}
  if(bg) bg.style.background='transparent';
}

export function updateCmpLabel(side,text){var e=document.getElementById(side==='left'?'cmpLabelLeft':'cmpLabelRight');if(e)e.textContent=text;}

