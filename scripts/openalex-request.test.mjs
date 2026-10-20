import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {OPENALEX_WORK_SELECT,fetchOpenAlexWorks} from './openalex-request.mjs';
import {searchSpecification,evidenceDataset} from './workspace-projects-core.mjs';
import {evidenceCoverage} from './scientific-manifest.mjs';
import {executeStage,OPENALEX_FIELDS} from './multiuser/stages.mjs';

const query='("leadership development" OR "leader development" OR "leadership training" OR "leader training" OR "leadership education" OR "leadership program" OR "leadership programme")';
const previousFields='id,doi,display_name,publication_date,publication_year,cited_by_count,authorships,authors_count,primary_location,topics,open_access,referenced_works,referenced_works_count,abstract_inverted_index,keywords,type,language,is_retracted,institutions_distinct_count';
test('supported work select changes only the provider-rejected field across all three consumers',()=>{
 assert.equal(OPENALEX_WORK_SELECT,previousFields.split(',').filter(field=>field!=='authors_count').join(','));assert.equal(OPENALEX_FIELDS,OPENALEX_WORK_SELECT);
 for(const file of ['scripts/workspace-projects-service.mjs','scripts/retrieve-openalex.mjs']){const source=readFileSync(file,'utf8');assert.match(source,/import \{OPENALEX_WORK_SELECT/);assert.match(source,/const fields = OPENALEX_WORK_SELECT;/);}
 assert.match(readFileSync('scripts/multiuser/stages.mjs','utf8'),/if\(\['retrieval','reference-metadata'\]\.includes\(stage\)\)contents.push\(await readFile\(new URL\('\.\.\/openalex-request.mjs'/);
});
test('actual legacy request adapter and protected retrieval preserve the exact Boolean query/filter/core scope',async()=>{
 const specification=searchSpecification({query,phrase:false,limit:3000}),requests=[],mock=async target=>{const url=new URL(target);requests.push(url);assert.equal(url.searchParams.get('search'),query);assert.equal(url.searchParams.get('filter'),specification.filter);assert.equal(url.searchParams.get('corpus'),'core');assert.equal(url.searchParams.get('select'),OPENALEX_WORK_SELECT);return Response.json({results:[],meta:{count:0,next_cursor:null}});};
 const source=readFileSync('scripts/workspace-projects-service.mjs','utf8'),adapter=source.match(/async function openalex\(parameters, signal\) \{[\s\S]*?\n\}/)[0],sandbox={process:{env:{}},fetchOpenAlexWorks:(parameters,options)=>fetchOpenAlexWorks(parameters,{...options,fetch:mock})};vm.runInNewContext(adapter,sandbox);await sandbox.openalex({search:specification.terms,corpus:'core',filter:specification.filter,cursor:'*',per_page:100,select:OPENALEX_WORK_SELECT});
 const context={signal:new AbortController().signal,fetch:mock,rateLimit:async()=>{},progress:()=>{},saveCheckpoint:async()=>{},files:{put:async()=>({checksum:'empty-page'}),get:async()=>[]}};const result=await executeStage('retrieval',{specification},{},context);assert.equal(result.exhausted,true);assert.equal(requests.length,2);
});
test('provider schema and query 400 failures are actionable, nontransient and never expose raw diagnostics',async()=>{
 for(const message of ['authors_count is not a valid select field. secret=not-public https://private.invalid/query','Invalid query containing confidential words']){let requests=0;await assert.rejects(fetchOpenAlexWorks({search:query},{fetch:async()=>{requests++;return Response.json({message},{status:400});}}),problem=>{assert.equal(problem.transient,false);assert.equal(problem.status,502);assert.equal(problem.retryAfter,0);assert(!problem.message.includes('Try again later'));assert(!problem.message.includes('not-public'));assert(!problem.message.includes('private.invalid'));assert(!problem.message.includes('confidential'));assert.match(problem.message,/metadata|configuration/);return true;});assert.equal(requests,1);}
 await assert.rejects(fetchOpenAlexWorks({},{fetch:async()=>Response.json({private:'do not expose'},{status:429,headers:{'Retry-After':'17'}})}),problem=>problem.transient===true&&problem.retryAfter===17&&!problem.message.includes('do not expose'));
});
test('missing reported author count remains unknown while imported counts retain truncation evidence',()=>{
 const authorships=[{author:{id:'https://openalex.org/A1',display_name:'Observed author'},institutions:[]}],unknown={id:'https://openalex.org/W1',display_name:'Leadership development',authorships,referenced_works:[]},reported={...unknown,id:'https://openalex.org/W2',authors_count:10};const packet=evidenceDataset([unknown,reported],'pin',{},[],false);assert.equal(packet.articles[0].authors_count,undefined);assert.equal(packet.articles[0].retainedAuthorshipCount,1);assert.equal(packet.articles[1].authors_count,10);const coverage=evidenceCoverage(packet.articles);assert.equal(coverage.authorCountKnown,1);assert.equal(coverage.potentiallyTruncatedAuthorships,1);assert(coverage.warnings.some(warning=>warning.includes('cannot be checked')));
});
