(function(root){
  const version='core-presets-v1';
  const names={balanced:'Balanced Core',conservative:'Conservative / international citation core',inclusive:'Inclusive Scholarly'};
  const scholarlyTypes=new Set(['article','review','book-chapter','conference-paper']);
  function evaluate(work,preset='balanced',doiBenchmark=false){
    const source=work.primary_location?.source||null;
    const lists=Array.isArray(source?.listed_in)?source.listed_in:[];
    const cwts=typeof source?.is_core==='boolean'?source.is_core:(Array.isArray(source?.listed_in)?lists.includes('cwts-core'):null);
    const sourceType=source?.type||null;
    const references=Number.isFinite(work.referenced_works_count)?work.referenced_works_count:(Array.isArray(work.referenced_works)?work.referenced_works.length:null);
    const authors=Array.isArray(work.authorships)?work.authorships.length:null;
    const affiliations=Number.isFinite(work.institutions_distinct_count)?work.institutions_distinct_count:(Array.isArray(work.authorships)?work.authorships.reduce((n,a)=>n+(a.institutions?.length||0),0):null);
    const reasons=[],unknown=[],flags=[];
    const reject=(condition,reason)=>{if(condition)reasons.push(reason)};
    reject(work.is_retracted===true,'Retracted work');
    if(work.is_retracted==null)flags.push('Retraction status unavailable');
    reject(!scholarlyTypes.has(work.type),'Outside selected research work types');
    if(preset==='conservative'){
      reject(!['article','review'].includes(work.type),'Conservative mode uses articles and reviews');
      reject(sourceType!==null&&sourceType!=='journal','Conservative mode uses journals');
      if(!sourceType)unknown.push('Source type unavailable');
      reject(work.language!==null&&work.language!==undefined&&work.language!=='en','English metadata required');
      if(!work.language)unknown.push('Language unavailable');
      reject(affiliations===0,'No linked affiliation');
      if(affiliations===null)unknown.push('Affiliation data unavailable');
    }else{
      reject(sourceType!==null&&!['journal','book series',...(preset==='inclusive'?['conference']:[])].includes(sourceType),'Outside selected scholarly source types');
      if(!sourceType)unknown.push('Source type unavailable');
    }
    if(preset!=='inclusive'){
      reject(cwts===false,'Source outside CWTS Core');
      if(cwts===null)unknown.push('CWTS Core status unavailable');
      reject(references===0,'No indexed references');
      if(references===null)unknown.push('Reference data unavailable');
      reject(authors===0,'No indexed authors');
      if(authors===null)unknown.push('Authorship unavailable');
      if(preset==='balanced')reject(work.type==='conference-paper','Balanced mode excludes conference papers');
    }else if(references===0)flags.push('No indexed references; citation maps cannot use this work');
    if(doiBenchmark)reject(!work.doi,'DOI benchmark mode requires a DOI');
    if(!work.doi)flags.push('DOI unavailable');
    if(!work.abstract_inverted_index)flags.push('Abstract unavailable');
    if(affiliations===0)flags.push('Affiliation unavailable');
    return {status:reasons.length?'excluded':unknown.length?'unknown':'included',reasons,unknown,flags,provenance:{openalex_corpus:'core',cwts_core_source:cwts,source_type:sourceType,listed_in:lists,work_type:work.type||null,reference_count:references,language:work.language||null,has_affiliation:affiliations===null?null:affiliations>0,retracted:work.is_retracted??null,preset_version:version}};
  }
  root.BiblioMapCorpus={version,names,evaluate};
})(globalThis);
