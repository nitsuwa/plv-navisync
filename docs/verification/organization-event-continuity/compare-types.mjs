import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=process.cwd(),tempRoot=path.resolve('.tmp');
fs.mkdirSync(tempRoot,{recursive:true});
const snapshot=fs.mkdtempSync(path.join(tempRoot,'continuity-types-'));
const compiler=path.resolve(path.dirname(require.resolve('typescript')),'../bin/tsc');
const output='docs/verification/organization-event-continuity';
function diagnostics(cwd){
  const result=spawnSync(process.execPath,[compiler,'--noEmit'],{cwd,encoding:'utf8',maxBuffer:24*1024*1024,windowsHide:true});
  if(result.error||![0,1].includes(result.status))throw result.error??new Error(result.stderr||'TypeScript failed');
  const rows=[];
  for(const line of result.stdout.replaceAll('\\','/').split(/\r?\n/)){
    const match=/^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line);
    if(match)rows.push({file:match[1],code:match[2],message:match[3]});
    else if(line.trim()&&rows.length)rows.at(-1).message+=` ${line.trim()}`;
  }
  return {rows,stdout:result.stdout};
}
try{
  const archive=path.join(snapshot,'source.tar');
  fs.writeFileSync(archive,execFileSync('git',['archive','--format=tar','0679fa0','src','tsconfig.json'],{maxBuffer:100*1024*1024,windowsHide:true}));
  execFileSync('tar',['-xf',archive,'-C',snapshot],{windowsHide:true});
  // The temporary snapshot lives under .tmp inside the repository, so Node/TS
  // resolution already walks up to the checked-out node_modules. Avoid a Windows
  // junction here: restricted shells commonly deny symlink creation.
  const baseline=diagnostics(snapshot),current=diagnostics(root);
  fs.writeFileSync(`${output}/types-baseline.txt`,baseline.stdout);
  fs.writeFileSync(`${output}/types-baseline.json`,JSON.stringify({commit:'0679fa0',diagnostics:baseline.rows},null,2));
  fs.writeFileSync(`${output}/types-current.json`,JSON.stringify(current.rows,null,2));
  const counts=new Map();const key=row=>JSON.stringify([row.file,row.code]);
  for(const row of baseline.rows)counts.set(key(row),(counts.get(key(row))??0)+1);
  const introduced=current.rows.filter(row=>{const count=counts.get(key(row))??0;if(!count)return true;counts.set(key(row),count-1);return false;});
  const report={baselineCommit:'0679fa0',comparison:'multiplicity per file/code; full messages retained for review',baselineCount:baseline.rows.length,currentCount:current.rows.length,introduced};
  fs.writeFileSync(`${output}/type-comparison.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));process.exitCode=introduced.length?1:0;
}finally{
  if(path.dirname(path.resolve(snapshot))!==tempRoot||!path.basename(snapshot).startsWith('continuity-types-'))throw new Error('Unsafe type snapshot cleanup');
  fs.rmSync(snapshot,{recursive:true,force:true});
}
