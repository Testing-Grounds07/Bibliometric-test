import path from 'node:path';
import {realpath} from 'node:fs/promises';

export async function fixtureAssetRoot(value,disposable,workspace=process.cwd()){
 if(!value)return undefined;
 const expected=path.resolve(workspace,'.trials/improvement-program/preview-code/conservative-atlas'),target=path.resolve(value),equal=(first,second)=>process.platform==='win32'?first.toLowerCase()===second.toLowerCase():first===second;
 if(disposable!=='1'||!equal(target,expected))throw Error('Fixture assets must use the expected private preview-code directory and an explicit disposable test environment.');
 const resolved=await realpath(target);if(!equal(resolved,expected))throw Error('Fixture asset root must not redirect outside the private preview-code directory.');
 return resolved;
}
