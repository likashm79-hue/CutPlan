'use strict';
const assert = require('node:assert/strict');
const CutPlanEngine = require('./nesting-engine.js');

const benchmarkRows = [
  [1,470,300,2],[2,700,300,4],[3,470,290,1],[4,688,490,5],[5,676,65,2],[6,676,180,3],
  [7,220,300,2],[8,220,290,1],[9,776,300,1],[10,300,300,2],[11,470,300,1],[12,300,300,2],
  [13,1012,400,2],[14,350,400,2],[15,877,380,1],[16,877,90,2],[17,800,380,2],[18,877,370,1],
  [19,677,500,2],[20,1306,500,2],[21,717,490,1],[22,860,300,2],[23,565,300,2],[24,677,270,1],
  [25,570,300,2],[26,565,300,2],[27,450,290,1]
].map(([rowId,length,width,qty]) => ({rowId:String(rowId),length,width,qty,rotate:true}));

const plan = CutPlanEngine.optimize(benchmarkRows, {
  sheetLength:2440, sheetWidth:1220, kerf:3, margin:0, effort:'high', cutMode:'optimum'
});
assert.equal(plan.rows, 27);
assert.equal(plan.pieces, 51);
assert.equal(plan.validated, true);
assert.equal(plan.guillotine, true);
assert.equal(plan.sheets.reduce((n,s)=>n+s.placed.length,0),51);
for (const sheet of plan.sheets) {
  for (let i=0;i<sheet.placed.length;i++) {
    const a=sheet.placed[i];
    assert(a.x>=0 && a.y>=0 && a.x+a.w<=2440+1e-7 && a.y+a.h<=1220+1e-7);
    for(let j=i+1;j<sheet.placed.length;j++){
      const b=sheet.placed[j];
      const overlap=a.x<b.x+b.w-1e-7 && a.x+a.w>b.x+1e-7 && a.y<b.y+b.h-1e-7 && a.y+a.h>b.y+1e-7;
      assert.equal(overlap,false,'parts must not overlap');
    }
  }
}
const alpha = CutPlanEngine.optimize([
  {rowId:'A',length:470,width:300,qty:2,rotate:true},
  {rowId:'KB-1',length:700,width:300,qty:1,rotate:true}
],{sheetLength:2440,sheetWidth:1220,kerf:3,effort:'standard'});
assert.deepEqual(new Set(alpha.sheets.flatMap(s=>s.placed.map(p=>p.rowId))),new Set(['A','KB-1']));
assert.throws(()=>CutPlanEngine.expandRows([
  {rowId:'A',length:100,width:100,qty:1},{rowId:'a',length:120,width:80,qty:1}
]),/duplicate/);
console.log(`PASS: ${plan.rows} rows, ${plan.pieces} pieces, ${plan.sheets.length} sheets, ${plan.utilization.toFixed(2)}% utilization; alphanumeric references accepted.`);
