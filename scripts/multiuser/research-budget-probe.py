"""Actual sealed budget-control envelope, inference stubs only."""
import hashlib,json,sys,tempfile,uuid
from pathlib import Path
from unittest.mock import patch
BNR=Path(__file__).resolve().parents[3]/'bibliometric-network-researcher';sys.path.insert(0,str(BNR/'src'))
from bnr.bibliomap_worker import execute
from bnr.bibliomap_exchange import pack
from bnr.contracts import canonical_bytes
with tempfile.TemporaryDirectory(prefix='bm-budget-')as tmp:
 root=Path(tmp);config=root/'operator.json';config.write_bytes(canonical_bytes({'schema_version':'bnr.connector.v1','workspace_root':str(root/'w'),'snapshots':{},'research_provider':{'kind':'codex_exec','executable':sys.executable,'model':'test-stub','max_session_steps':30,'max_session_tokens':600000}}))
 scope={'project_id':'budget-fixture','user_id':'owner-fixture'}
 create={'operation':'session_create','execution_id':str(uuid.uuid4()),'scope':scope,'arguments':{'max_tokens':40,'max_steps':25,'question':'What can this explicit bounded fixture establish?','exchange':{'schema_version':'bnr.bibliomap-exchange.v1','codec':'utf8-json-wire-v1','parent':{'evidence_id':'fixture','capped':True},**pack('records',[{'id':'W1'}]),**pack('settings',{})}}}
 initial=execute(root,create,research_config=config)
 request={'operation':'session_advance','execution_id':str(uuid.uuid4()),'scope':scope,'arguments':{'session_id':initial['result']['session_id']}}
 def infer(config,packet,role,folder,check):
  folder.mkdir();answer=dict(summary='Explicit test fixture only.',decision='finish',tool='none',arguments_json='{}',rationale='No substantive claim.',alternatives=[],claims=[{'claim':'Only a synthetic fixture.','evidence_refs':['context']}],objections=[],limitations=['Not a model call.'],clarification='')
  return {'answer':answer,'provenance':{'thread_id':'budget-stub','usage':{'input_tokens':80,'output_tokens':20}}}
 with patch('bnr.research_provider.infer',infer):old=execute(root,request,research_config=config)
 assert old['result']['state']=='budget_exhausted'
 revise={'operation':'session_budget_extend','execution_id':str(uuid.uuid4()),'scope':scope,'arguments':{'session_id':initial['result']['session_id'],'max_tokens':200,'max_steps':25,'reason':'Explicit bounded finalization fixture, preserve spent100tokens.'}}
 result=execute(root,revise,research_config=config);wire=json.dumps(revise,ensure_ascii=False);result['transport_request_sha256']=hashlib.sha256(wire.encode()).hexdigest()
 print(json.dumps({'result':result,'binding':{'request':revise,'transport_request_json':wire}}))
