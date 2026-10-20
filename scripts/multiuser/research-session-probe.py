"""Actual engine archives with explicit inference stubs; no model or database."""
import base64,copy,hashlib,io,json,sys,tempfile,uuid,zipfile
from pathlib import Path
from unittest.mock import patch
BNR=Path(__file__).resolve().parents[3]/'bibliometric-network-researcher';sys.path.insert(0,str(BNR/'src'))
from bnr.bibliomap_worker import execute
from bnr.bibliomap_exchange import pack
from bnr.contracts import canonical_bytes,ResearchError

def answer():return dict(summary='Synthetic bounded archive fixture',decision='finish',tool='none',arguments_json='{}',rationale='No scientific finding asserted.',alternatives=[],claims=[{'claim':'Fixture has no substantive evidence.','evidence_refs':['context']}],objections=[],limitations=['Explicit test stub.'],clarification='')
with tempfile.TemporaryDirectory(prefix='bm-rc-') as tmp:
 root=Path(tmp);config=root/'operator.json';config.write_bytes(canonical_bytes({'schema_version':'bnr.connector.v1','workspace_root':str(root/'w'),'snapshots':{},'research_provider':{'kind':'codex_exec','executable':sys.executable,'model':'test-stub'}}))
 cases=[]
 for mode in ['successful','known_rejected','not_started','interrupted']:
  scope={'project_id':mode,'user_id':'test-user'}
  create={'operation':'session_create','execution_id':str(uuid.uuid4()),'scope':scope,'arguments':{'question':'What can this bounded fixture establish?','exchange':{'schema_version':'bnr.bibliomap-exchange.v1','codec':'utf8-json-wire-v1','parent':{'evidence_id':'fixture','capped':True},**pack('records',[{'id':'W1'}]),**pack('settings',{})}}}
  initial=execute(root,create,research_config=config)
  request={'operation':'session_advance','execution_id':str(uuid.uuid4()),'scope':scope,'arguments':{'session_id':initial['result']['session_id']}}
  def infer(config,packet,role,folder,check):
   if mode=='not_started':raise ResearchError('unavailable','Explicit no-dispatch fixture',{'provider_dispatch':'not_started'})
   folder.mkdir();events=[{'type':'thread.started','thread_id':'stub-'+mode}]
   usage={'input_tokens':80,'output_tokens':20,'cached_input_tokens':40}
   if mode!='interrupted':events.append({'type':'turn.completed','usage':usage})
   (folder/'provider-stdout.txt').write_text('\n'.join(map(json.dumps,events)),encoding='utf-8')
   if mode!='successful':raise ResearchError('provider_contract','Retained test failure')
   return {'answer':answer(),'provenance':{'role':role,'thread_id':'stub-'+mode,'usage':usage}}
  with patch('bnr.research_provider.infer',infer):result=execute(root,request,research_config=config)
  wire=json.dumps(request,ensure_ascii=False);result['transport_request_sha256']=hashlib.sha256(wire.encode()).hexdigest()
  cases.append({'mode':mode,'binding':{'request':request,'transport_request_json':wire},'result':result})
 # Historical envelopes did not carry the new optional ID suggestion.
 legacy=copy.deepcopy(cases[0]);legacy['mode']='successful_legacy_display';legacy['result']['result'].pop('study_id_hint')
 archive=legacy['result']['exact_research_archive']
 with zipfile.ZipFile(io.BytesIO(base64.b64decode(archive['data_base64']))) as z:files={n:z.read(n) for n in z.namelist()}
 files['bridge-receipts/'+legacy['binding']['request']['execution_id']+'/observation.json']=canonical_bytes(legacy['result']['result'])
 output=io.BytesIO()
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for name,raw in files.items():z.writestr(name,raw)
 raw=output.getvalue();archive.update(data_base64=base64.b64encode(raw).decode(),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),decoded_bytes=sum(map(len,files.values())),files=[{'name':n,'bytes':len(v),'sha256':hashlib.sha256(v).hexdigest()} for n,v in files.items()])
 cases.append(legacy)
 print(json.dumps(cases,ensure_ascii=True))
