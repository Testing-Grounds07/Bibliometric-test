import test from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateWorks, duplicateReason, referenceMetadataCandidates} from './work-deduplication.mjs';
import {buildProjectGraph, evidenceDataset} from './workspace-projects-core.mjs';
import {mineProjectBundles} from './project-higher-orders.mjs';

const book = (id, year, title = 'Leadership Without Easy Answers') => ({id, display_name: title, publication_year: year, type: 'book', authorships: [{author: {display_name: 'Ronald A. Heifetz'}}]});

test('same book across years combines metadata while preserving IDs, years and raw inputs', () => {
 const records = [book('book-2009', 2009), book('book-1994', 1994, 'Leadership without easy answers!')];
 const original = structuredClone(records), result = deduplicateWorks(records);
 assert.equal(result.works.length, 1); assert.equal(result.works[0].id, 'book-1994');
 assert.deepEqual(result.works[0].years, [1994, 2009]); assert.equal(result.works[0].yearLabel, '1994 / 2009');
 assert.deepEqual(new Set(result.works[0].variants), new Set(records.map(work => work.id)));
 assert.deepEqual(records, original); assert.deepEqual(deduplicateWorks([...records].reverse()).aliases, result.aliases);
 assert.equal(deduplicateWorks(result.works, records).works[0].mergedRecords.length,2);
});

test('similar topic is insufficient; different authors, reviews, subtitles and numbered parts stay distinct', () => {
 const original = book('original', 1994);
 for (const other of [
  {...book('other', 1994), authorships: [{author: {display_name: 'Someone Else'}}]},
  {...book('review', 1994), type: 'review'},
  {...book('missing-author', 1994), authorships: []},
  book('different', 1994, 'Leadership Without Easy Answers: A Critical Review'),
  book('different', 1994, 'Leadership With Easy Answers')
 ]) assert.equal(duplicateReason(original, other), null);
 const long = book('first', 2020, 'A comprehensive investigation of leadership development and organisational change: part 1');
 assert.equal(duplicateReason(long, book('second', 2020, long.display_name.replace('organisational', 'organizational')))?.startsWith('Near-identical'), true);
 assert.equal(duplicateReason(long, book('second', 2020, long.display_name.replace('part 1', 'part 2'))), null);
});

test('same DOI matches formatting variants but fuzzy matches cannot chain into a different work', () => {
 assert.equal(duplicateReason({doi: 'https://doi.org/10.1/ABC'}, {doi: '10.1/abc'}), 'Same DOI');
 const title = 'A comprehensive investigation of leadership development and organisational change in schools';
 const result = deduplicateWorks([book('first', 2020, title), book('second', 2020, title.replace('organisational', 'organizational')), book('third', 2020, title.replace('organisational', 'organizational').replace('schools', 'schoolz').replace('leadership', 'leaderzhip'))]);
 assert.equal(result.works.length, 2);
});

test('canonical sources and references each count once and false three-way bundles disappear', () => {
 const metadata = [book('book-1994', 1994), book('book-2009', 2009), book('other', 2002, 'Leadership on the Line')];
 const works = Array.from({length: 5}, (_, position) => ({id: 'source-' + position, referenced_works: ['book-1994', 'book-2009', 'other']}));
 const graph = buildProjectGraph(works, metadata, {threshold: 1, support: 5});
 assert.equal(graph.nodes.length, 2); assert.equal(graph.links.length, 1); assert.equal(graph.links[0].count, 5);
 assert(graph.nodes.every(node => node.citations === 5)); assert.equal(mineProjectBundles(graph.nodes, 5).bundles.length, 0);
 const evidence = evidenceDataset(works, 'corpus', {}, metadata);
 assert(evidence.articles.every(article => article.references.length === 2));
 assert.deepEqual(evidenceDataset(works, 'corpus', {}, [], graph.deduplication).articles, evidence.articles);
 assert.equal(evidenceDataset(works, 'corpus', {}, [], false).articles[0].references.length, 3);
 const duplicateSources = [...works, {...works[0]}];
 assert.equal(buildProjectGraph(duplicateSources, metadata, {threshold: 1, support: 5}).links[0].count, 5);
});

test('source duplicates combine reference lists without inflating support, and operation is idempotent', () => {
 const first = {...book('source-a', 2000), type: 'article', referenced_works: ['reference-a']};
 const second = {...first, id: 'source-b', publication_year: 2001, referenced_works: ['reference-b']};
 const result = deduplicateWorks([first, second]);
 assert.equal(result.works.length, 1); assert.deepEqual(result.works[0].referenced_works, ['reference-a', 'reference-b']);
 assert.deepEqual(deduplicateWorks(result.works).works, result.works);
 assert.equal(deduplicateWorks([{id: 'unknown-1'}, {id: 'unknown-2'}]).works.length, 2);
});

test('metadata candidates include below-threshold references that can become eligible after merging', () => {
 const sources=Array.from({length:10},(_,position)=>({id:'source-'+position,referenced_works:['common',position<5?'version-a':'version-b']}));
 const candidates=referenceMetadataCandidates(sources,10);
 assert.deepEqual(candidates.ids,['common','version-a','version-b']);assert.equal(candidates.minimumFrequency,5);
 assert.equal(referenceMetadataCandidates(sources,10,1).candidates,3);
});

test('repeated article titles with different DOIs are not treated as the same publication',()=>{
 const first={...book('first',2007,'Shared leadership theory'),type:'article',doi:'10.1016/j.leaqua.2007.03.009'};
 assert.equal(duplicateReason(first,{...first,id:'second',publication_year:2008,doi:'10.1016/j.leaqua.2008.07.005'}),null);
 assert.equal(duplicateReason({...first,type:undefined,doi:null},{...first,type:undefined,id:'second',doi:null}),null);
});
