/* CutPlan v0.4 — multi-start guillotine nesting.
 * Every placement is made at the origin of a rectangular free region.
 * The region is split by full straight cuts into two rectangular offcuts;
 * no free-form/non-guillotine placement is permitted. Heuristic, not a proof
 * of global optimality. Validate the generated cut sequence on the actual saw.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CutPlanEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict'; const EPS=1e-7;
const ORDER=['area','long','short','perimeter','input','width','length','aspect','areaPerimeter','longArea','shortArea','widthArea','lengthArea','areaShort','areaLong','maxSide','minSide','aspectInverse','square','longWidth','longLength','widthLength','lengthWidth','thinArea'];
function n(v,label,min=0){const x=Number(v);if(!Number.isFinite(x)||x<min)throw Error(`${label} must be at least ${min}.`);return x;}
function expandRows(rows){const out=[],ids=new Set();rows.forEach((r,i)=>{const id=String(r.rowId??i+1).trim();const idKey=id.toLowerCase();if(!id||ids.has(idKey))throw Error(`Missing or duplicate cutting-list reference: ${id||i+1}.`);ids.add(idKey);const l=n(r.length,`#${id} length`,.001),w=n(r.width,`#${id} width`,.001),q=n(r.qty,`#${id} quantity`,1);if(!Number.isInteger(q))throw Error(`#${id} quantity must be a whole number.`);for(let u=1;u<=q;u++)out.push({rowId:id,unit:u,rowQty:q,length:l,width:w,rotate:!!r.rotate,edgeBanding:r.edgeBanding||{top:false,right:false,bottom:false,left:false},area:l*w,inputIndex:i});});if(!out.length)throw Error('Add at least one cutting-list row.');return out;}
function sortItems(items,key,reverse){
  const metric = item => {
    const long=Math.max(item.length,item.width), short=Math.min(item.length,item.width), area=item.area, perimeter=item.length+item.width;
    switch(key){
      case'area':return area;
      case'long':case'maxSide':return long;
      case'short':case'minSide':return short;
      case'perimeter':return perimeter;
      case'width':return item.width;
      case'length':return item.length;
      case'aspect':return long/short;
      case'aspectInverse':return short/long;
      case'areaPerimeter':return area*perimeter;
      case'longArea':return long*area;
      case'shortArea':return short*area;
      case'widthArea':return item.width*area;
      case'lengthArea':return item.length*area;
      case'areaShort':return area/short;
      case'areaLong':return area/long;
      case'square':return 1/(long/short);
      case'longWidth':return long*item.width;
      case'longLength':return long*item.length;
      case'widthLength':return item.width*item.length;
      case'lengthWidth':return item.length*item.width;
      case'thinArea':return (long/short)*area;
      default:return area;
    }
  };
  return items.slice().sort((a,b)=>{
    if(key==='input') return ((a.inputIndex-b.inputIndex)||(a.unit-b.unit))*(reverse?-1:1);
    const delta=metric(b)-metric(a);
    return (Math.abs(delta)>EPS?delta*(reverse?-1:1):0)||a.inputIndex-b.inputIndex||a.unit-b.unit;
  });
}
function seededShuffle(items,seed){
  const out=items.slice(); let state=(seed>>>0)||1;
  const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
  for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function edgeMap(b,rot){return rot?{top:b.left,right:b.top,bottom:b.right,left:b.bottom}:{...b};}
function fits(item,free,cfg,mode){
  const os=[{w:item.length,h:item.width,rot:false}];
  if(item.rotate&&item.length!==item.width) os.push({w:item.width,h:item.length,rot:true});
  const out=[];
  for(const o of os){
    const rw=o.w+(o.w<free.w-EPS?cfg.kerf:0), rh=o.h+(o.h<free.h-EPS?cfg.kerf:0);
    if(rw<=free.w+EPS&&rh<=free.h+EPS){
      const dw=free.w-rw, dh=free.h-rh;
      const orient=mode==='width'?'H':mode==='length'?'V':(dw>=dh?'V':'H');
      for(const cut of (mode==='optimum'?['V','H']:[orient])){
        const rem1=cut==='V'?Math.max(0,free.w-rw)*free.h:free.w*Math.max(0,free.h-rh);
        const rem2=cut==='V'?o.w*Math.max(0,free.h-rh):Math.max(0,free.w-rw)*o.h;
        out.push({...o,rw,rh,cut,dw,dh,rem1,rem2,freeArea:free.w*free.h,partArea:o.w*o.h,score:[Math.min(dw,dh),Math.max(dw,dh),-(rem1+rem2),o.rot?1:0]});
      }
    }
  }
  return out;
}
function placementScore(option,free,scorer){
  const short=Math.min(option.dw,option.dh), long=Math.max(option.dw,option.dh);
  const remnant=Math.max(option.rem1,option.rem2), tiny=Math.min(option.rem1,option.rem2);
  switch(scorer){
    case'area':return [option.freeArea-option.rw*option.rh,short,long,option.rot?1:0];
    case'long':return [long,short,-remnant,tiny,option.rot?1:0];
    case'remnant':return [-remnant,tiny,long,short,option.rot?1:0];
    default:return [short,long,-(option.rem1+option.rem2),option.rot?1:0];
  }
}
function cmp(a,b){for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>EPS)return a[i]-b[i];return 0;}
function pack(items,cfg,ordering,reverse,mode,seed=0,scorer='short'){const sheets=[];const ordered=ordering==='shuffle'?seededShuffle(items,seed):sortItems(items,ordering,reverse);for(const item of ordered){let best=null;for(let si=0;si<sheets.length;si++)for(let fi=0;fi<sheets[si].free.length;fi++){const f=sheets[si].free[fi];for(const o of fits(item,f,cfg,mode)){const cand={si,fi,x:f.x,y:f.y,...o};cand.rank=placementScore(cand,f,scorer);if(!best||cmp(cand.rank,best.rank)<0)best=cand;}}
if(!best){const f={x:cfg.margin,y:cfg.margin,w:cfg.usableW,h:cfg.usableH};const opts=fits(item,f,cfg,mode).map(o=>({...o,rank:placementScore(o,f,scorer)}));if(!opts.length)throw Error(`#${item.rowId} (${item.length} × ${item.width}) cannot fit on the usable sheet.`);sheets.push({free:[f],placed:[],cuts:[]});const si=sheets.length-1;const o=opts.sort((a,b)=>cmp(a.rank,b.rank))[0];best={si,fi:0,x:f.x,y:f.y,...o};}
const s=sheets[best.si],f=s.free.splice(best.fi,1)[0],p={rowId:item.rowId,unit:item.unit,rowQty:item.rowQty,length:item.length,width:item.width,x:f.x,y:f.y,w:best.w,h:best.h,rotated:best.rot,edgeBanding:edgeMap(item.edgeBanding,best.rot)};s.placed.push(p);
// Record actual guillotine cuts within the current rectangular offcut.
if(best.cut==='V'){const xcut=f.x+best.rw;s.cuts.push({axis:'vertical',x:xcut,y:f.y,length:f.h,kerf:cfg.kerf});const rightW=f.w-best.rw;if(rightW>EPS)s.free.push({x:xcut,y:f.y,w:rightW,h:f.h});const belowH=f.h-best.rh;if(belowH>EPS)s.free.push({x:f.x,y:f.y+best.rh,w:best.rw,h:belowH});if(belowH>EPS)s.cuts.push({axis:'horizontal',x:f.x,y:f.y+best.rh,length:best.rw,kerf:cfg.kerf});}
else{const ycut=f.y+best.rh;s.cuts.push({axis:'horizontal',x:f.x,y:ycut,length:f.w,kerf:cfg.kerf});const belowH=f.h-best.rh;if(belowH>EPS)s.free.push({x:f.x,y:ycut,w:f.w,h:belowH});const rightW=f.w-best.rw;if(rightW>EPS)s.free.push({x:f.x+best.rw,y:f.y,w:rightW,h:best.rh});if(rightW>EPS)s.cuts.push({axis:'vertical',x:f.x+best.rw,y:f.y,length:best.rh,kerf:cfg.kerf});}
}return sheets;}
function validate(sheets,cfg,expected){let count=0;for(let si=0;si<sheets.length;si++){const s=sheets[si];count+=s.placed.length;for(let i=0;i<s.placed.length;i++){const a=s.placed[i];if(a.x<cfg.margin-EPS||a.y<cfg.margin-EPS||a.x+a.w>cfg.sheetLength-cfg.margin+EPS||a.y+a.h>cfg.sheetWidth-cfg.margin+EPS)throw Error('Guillotine validation: a part lies outside the usable sheet.');for(let j=i+1;j<s.placed.length;j++){const b=s.placed[j];if(a.x<b.x+b.w-EPS&&a.x+a.w>b.x+EPS&&a.y<b.y+b.h-EPS&&a.y+a.h>b.y+EPS)throw Error(`Guillotine validation: #${a.rowId} overlaps #${b.rowId}.`);}}for(const c of s.cuts){if(c.axis==='vertical'&&(c.x<cfg.margin-EPS||c.x>cfg.sheetLength-cfg.margin+EPS||c.y<cfg.margin-EPS||c.y+c.length>cfg.sheetWidth-cfg.margin+EPS))throw Error('Invalid vertical cut extent.');if(c.axis==='horizontal'&&(c.y<cfg.margin-EPS||c.y>cfg.sheetWidth-cfg.margin+EPS||c.x<cfg.margin-EPS||c.x+c.length>cfg.sheetLength-cfg.margin+EPS))throw Error('Invalid horizontal cut extent.');}}if(count!==expected)throw Error(`Only ${count} of ${expected} pieces were placed.`);return count;}
function optimize(rows,opt={}){
  const sheetLength=n(opt.sheetLength,'Sheet length',1), sheetWidth=n(opt.sheetWidth,'Sheet width',1),
    kerf=n(opt.kerf??0,'Kerf',0), margin=n(opt.margin??0,'Edge margin',0);
  if(2*margin>=Math.min(sheetLength,sheetWidth)) throw Error('Edge margin is too large.');
  const items=expandRows(rows), cfg={sheetLength,sheetWidth,kerf,margin,usableW:sheetLength-2*margin,usableH:sheetWidth-2*margin};
  const mode=['width','length'].includes(opt.cutMode)?opt.cutMode:'optimum';
  const effort=opt.effort||'high', limit=effort==='standard'?12:effort==='max'?240:64;
  const strategies=[];
  const scoreModes=['short','area','long','remnant'];
  for(const scorer of scoreModes) for(const order of ORDER) for(const rev of [false,true]) strategies.push({order,rev,seed:0,scorer});
  for(let seed=1;strategies.length<limit;seed++) strategies.push({order:'shuffle',rev:false,seed,scorer:scoreModes[(seed-1)%scoreModes.length]});
  let best=null, attempts=0;
  for(const strategy of strategies.slice(0,limit)){
    attempts++;
    let sheets;
    try{sheets=pack(items,cfg,strategy.order,strategy.rev,mode,strategy.seed,strategy.scorer);}catch(e){continue;}
    validate(sheets,cfg,items.length);
    const bbox=sheets.reduce((v,s)=>v+s.placed.reduce((m,p)=>Math.max(m,(p.x+p.w)*(p.y+p.h)),0),0);
    const cuts=sheets.reduce((v,s)=>v+s.cuts.length,0);
    const fragments=sheets.reduce((v,s)=>v+s.free.length,0);
    const candidate={sheets,order:strategy.order,rev:strategy.rev,scorer:strategy.scorer,bbox,cuts,fragments};
    const better=!best || sheets.length<best.sheets.length ||
      (sheets.length===best.sheets.length && (
        fragments<best.fragments ||
        (fragments===best.fragments && (cuts<best.cuts || (cuts===best.cuts && bbox<best.bbox)))
      ));
    if(better) best=candidate;
  }
  if(!best) throw Error('No feasible guillotine layout found. Try a larger sheet or verify dimensions/rotation.');
  const pieces=validate(best.sheets,cfg,items.length), partArea=items.reduce((a,p)=>a+p.area,0),
    grossSheetArea=sheetLength*sheetWidth*best.sheets.length;
  return {sheets:best.sheets,sheetLength,sheetWidth,kerf,margin,rows:rows.length,pieces,partArea,grossSheetArea,
    wasteArea:grossSheetArea-partArea,utilization:partArea/grossSheetArea*100,attempts,ordering:best.order,
    scorer:best.scorer,cutMode:mode,validated:true,guillotine:true};
}
return{optimize,expandRows};
});
