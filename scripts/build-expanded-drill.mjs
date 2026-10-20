import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const context={window:{}};
vm.runInNewContext(fs.readFileSync('public/conservative-atlas/data.js','utf8'),context);
const atlas=context.window.ATLAS_DATA,sourceIds=new Set(Object.keys(atlas.articles));
const works=JSON.parse(fs.readFileSync('.trials/adaptive-leadership-full/works.json','utf8'));
const corpus=works.filter(work=>sourceIds.has(work.id));assert.equal(corpus.length,2855);
const postings=new Map(),metadata=new Map(works.map(work=>[work.id,work]));
for(const work of corpus)for(const id of new Set(work.referenced_works||[])){if(!postings.has(id))postings.set(id,[]);postings.get(id).push(work.id);}
for(const name of fs.readdirSync('.trials/conservative-cocitation').filter(name=>/^reference-metadata-/.test(name)))for(const work of JSON.parse(fs.readFileSync('.trials/conservative-cocitation/'+name,'utf8')).results)metadata.set(work.id,work);
const eligible=[...postings.keys()].filter(id=>postings.get(id).length>=5).sort(),missing=eligible.filter(id=>!metadata.has(id));
console.log(JSON.stringify({references:eligible.length,metadataLookups:missing.length}));
for(let offset=0;offset<missing.length;offset+=100){
 const batch=missing.slice(offset,offset+100),file='.trials/conservative-cocitation/expanded-metadata-'+offset+'.json';let result;
 if(fs.existsSync(file))result=JSON.parse(fs.readFileSync(file,'utf8'));
 else{
  const url=new URL('https://api.openalex.org/works');url.search=new URLSearchParams({filter:'openalex:'+batch.map(id=>id.split('/').pop()).join('|'),per_page:'100',select:'id,doi,display_name,publication_year,authorships'});
  const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.OPENALEX_API_KEY},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Reference metadata lookup failed: '+response.status);
  result=await response.json();fs.writeFileSync(file,JSON.stringify(result));
 }
 for(const work of result.results)metadata.set(work.id,work);
 console.log('Metadata batch '+(offset/100+1));
}
const nodes=eligible.map(key=>{const work=metadata.get(key);return {id:key.split('/').pop(),key,label:work?[work.authorships?.[0]?.author?.display_name,work.display_name].filter(Boolean).join(', '):key,citations:postings.get(key).length,articles:postings.get(key),year:work?.publication_year||null,doi:(work?.doi||'').replace(/^https?:\/\/doi.org\//,''),variants:[key],rules:['OpenAlex ID; distinct IDs retained'],x:0,y:0,cluster:0,degree:0};});
const eligibleSet=new Set(eligible),pairs=new Map();
for(const work of corpus){const refs=[...new Set(work.referenced_works||[])].filter(id=>eligibleSet.has(id)).sort();for(let left=0;left<refs.length;left++)for(let right=left+1;right<refs.length;right++){const key=refs[left]+'|'+refs[right];if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(work.id);}}
const links=[...pairs].filter(([,articles])=>articles.length>=3).map(([key,articles])=>{const [source,target]=key.split('|');return {source:source.split('/').pop(),target:target.split('/').pop(),articles,count:articles.length,strength:articles.length/(postings.get(source).length*postings.get(target).length)};});
const base={nodes,links,order:2,threshold:5,minimumSupport:3,method:'cocitation',directed:false};
fs.writeFileSync('.trials/conservative-cocitation/expanded-input.json',JSON.stringify(base));
execFileSync('C:/Users/Austin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['scripts/mine-expanded-drill.py'],{stdio:'inherit'});
const mined=JSON.parse(fs.readFileSync('.trials/conservative-cocitation/expanded-bundles.json','utf8'));
const sets=new Map(nodes.map(node=>[node.id,new Set(node.articles)]));
for(const bundle of mined.bundles){const expected=[...sets.get(bundle.members[0])].filter(id=>bundle.members.every(member=>sets.get(member).has(id))).sort();assert.deepEqual([...bundle.articles].sort(),expected);}
const result={version:1,sourceCorpusId:atlas.summary.corpus_id,sourceArticleCount:corpus.length,minimumReferenceCitations:5,minimumSupport:3,maximumOrder:mined.maximumOrder,complete:true,base,bundles:mined.bundles.map((bundle,index)=>({...bundle,id:'expanded:'+index}))};
fs.writeFileSync('public/conservative-atlas/expanded-data.json',JSON.stringify(result));
console.log(JSON.stringify({nodes:nodes.length,links:links.length,bundles:result.bundles.length,maximumOrder:result.maximumOrder,metadataMissing:eligible.filter(id=>!metadata.has(id)).length}));
