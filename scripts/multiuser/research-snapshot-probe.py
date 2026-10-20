"""Actual tiny Parquet/cursor/selection worker archives, no model or database."""
import hashlib,json,sys,tempfile,uuid
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
BNR=Path(__file__).resolve().parents[3]/'bibliometric-network-researcher';sys.path.insert(0,str(BNR/'src'))
from bnr.bibliomap_worker import execute
from bnr.store import write_new
with tempfile.TemporaryDirectory(prefix='bm-snap-')as tmp:
 root=Path(tmp);source=root/'source';part=source/'data/parquet/works/test/part.parquet';part.parent.mkdir(parents=True)
 rows=[{'id':'W1','title':'Flood A','referenced_works':['W9']},{'id':'W1','title':'Flood A revision','referenced_works':['W8']},{'id':'W2','title':'Flood B','referenced_works':[]}];pq.write_table(pa.Table.from_pylist(rows),part,row_group_size=2)
 write_new(source/'manifest.json',{'entities':[{'entity':'works','record_count':4,'content_length':part.stat().st_size+10,'files':[{'url':'s3://openalex/data/parquet/works/test/part.parquet','meta':{'content_length':part.stat().st_size,'record_count':3}},{'url':'s3://openalex/data/parquet/works/missing.parquet','meta':{'content_length':10,'record_count':1}}]}]})
 operator=root/'operator.json';write_new(operator,{'schema_version':'bnr.connector.v1','workspace_root':str(root/'w'),'snapshots':{'fixture':{'root':str(source),'manifest':str(source/'manifest.json')}}})
 cases=[];scope={'project_id':'fixture','user_id':'owner'}
 def call(operation,arguments):
  request={'operation':'snapshot_'+operation,'execution_id':str(uuid.uuid4()),'scope':scope,'arguments':arguments};result=execute(root,request,research_config=operator);wire=json.dumps(request,ensure_ascii=False);result['transport_request_sha256']=hashlib.sha256(wire.encode()).hexdigest();cases.append({'binding':{'request':request,'transport_request_json':wire},'result':result});return result['result']
 catalog=call('catalog',{'snapshot_id':'fixture'});args={'catalog_id':catalog['id'],'query':{'title_phrase':'flood'},'limits':{'max_matches':1}}
 for _ in range(4):
  result=call('search',args)
  if result['continuation']is None:break
  args={**args,'continuation':result['continuation']}
 frozen=call('freeze',{'search_id':result['id'],'include_previous':True});assert json.loads(frozen['records_json'])==rows
 print(json.dumps(cases,ensure_ascii=True))
