import test from 'node:test';
import assert from 'node:assert/strict';
import {titleCase} from './label-case.mjs';

test('cluster titles capitalize major words and preserve separators', () => {
 assert.equal(titleCase('leadership in complex and changing environments'), 'Leadership in Complex and Changing Environments');
 assert.equal(titleCase('leadership without easy answers · leadership on the line'), 'Leadership Without Easy Answers · Leadership on the Line');
 assert.equal(titleCase('leadership: an overview of the field'), 'Leadership: An Overview of the Field');
 assert.equal(titleCase('SHARED LEADERSHIP IN TEAMS'), 'Shared Leadership in Teams');
});

test('scientific acronyms and established mixed case survive keyword formatting', () => {
 assert.equal(titleCase('ai and pls-sem in healthcare'), 'AI and PLS-SEM in Healthcare');
 assert.equal(titleCase('c-tf-idf with keybert and MiniLM'), 'c-TF-IDF With KeyBERT and MiniLM');
 assert.equal(titleCase('NHS leadership and COVID-19'), 'NHS Leadership and COVID-19');
});

test('hyphens, apostrophes, Unicode, blanks and repeated formatting are stable', () => {
 assert.equal(titleCase("state-of-the-art women's leadership"), "State-of-the-Art Women's Leadership");
 assert.equal(titleCase('éthique et leadership'), 'Éthique Et Leadership');
 const heading = 'AI and PLS-SEM in Healthcare';
 assert.equal(titleCase(titleCase(heading)), heading);
 assert.equal(titleCase(''), '');
 assert.equal(titleCase(null), '');
});
