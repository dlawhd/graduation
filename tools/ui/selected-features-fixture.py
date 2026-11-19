"""승인한 보관함·초안 UI를 실제 React 빌드와 가짜 API로 검증하는 로컬 전용 도구다.
127.0.0.1:18962에만 바인딩하고 운영 DB·S3·메일·AI는 사용하지 않는다.
아래 API 응답은 시험 데이터이며 백엔드 기능 검증은 MariaDB 회귀 테스트로 별도 실행한다.
"""
from pathlib import Path
import json, re, base64
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs
root=Path(__file__).resolve().parents[2]
web=root/'build/selected-features/frontend'
user={'userId':900001,'name':'로컬 검증 계정','email':'fixture@example.invalid','provider':'LOCAL'}
rows=[dict(jarId=i,name=('우리의 봄 저금통' if i==900001 else '저금통 '+str(i)),description='로컬 검증용 추억을 모아요.',theme='LAVENDER',memberCount=2,maxMembers=5,openAt=('2031-08-15T17:45:00+09:00' if i%2==0 else '2026-08-13T18:35:00+09:00'),openMode='ALL_AT_ONCE',lockLevel='HIDDEN',isOpen=i%2==1,myRole='OWNER',updatedAt='2026-11-19T10:00:00+09:00',favorite=False,design=None,ownerId=900001,createdAt='2026-01-01T00:00:00+09:00') for i in range(900001,900013)]
notes={};uploads={};lost=set()
png=(root/'frontend/public/images/ai-styles/cute-2d.webp').read_bytes()
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(web),**kw)
 def log_message(self,*args):pass
 def out(self,data,status=200):
  b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  u=urlsplit(self.path);p=u.path;q=parse_qs(u.query);page=int(q.get('page',['0'])[0]);size=int(q.get('size',['9'])[0])
  if p=='/fixture-status':return self.out({'notes':len(notes),'uploads':len(uploads),'requestIds':list(notes)})
  if p=='/test-source/noteDraftStore.mjs':
   b=(root/'frontend/src/features/note/noteDraftStore.mjs').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(b);return
  if p=='/test-source/storage-tests.mjs':
   b=(root/'tools/ui/note-draft-storage.browser.mjs').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(b);return
  if p=='/draft-store-test':
   b='<meta charset="utf-8"><title>브라우저 초안 저장 검증</title><h1>로컬 IndexedDB 회귀 테스트</h1><button id="run">검증 시작</button><pre id="results">대기</pre><script type="module" src="/test-source/storage-tests.mjs"></script>'.encode();self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(b);return
  if p=='/fixture.png':self.send_response(200);self.send_header('Content-Type','image/webp');self.end_headers();self.wfile.write(png);return
  if p=='/api/v1/me':data=user
  elif p=='/api/v1/me/onboarding':data={'version':1,'items':[{'tutorialKey':k,'version':1,'status':'COMPLETED'} for k in ['WELCOME','JAR_LIST','JAR_CREATE','JAR_DETAIL','JAR_INVITE','DAILY_DRAW']]}
  elif p=='/api/v1/csrf':data={'headerName':'X-XSRF-TOKEN','token':'local-fixture-only'}
  elif p=='/api/v1/auth/session' or p=='/api/v1/session':data={'authenticated':True,'userId':900001,'accessTokenExpiresAt':'2035-01-01T00:00:00Z'}
  elif p=='/api/v1/jars':
   result=[r for r in rows if q.get('q',[''])[0].lower() in r['name'].lower() and (q.get('state',['ALL'])[0]=='ALL' or r['isOpen']==(q.get('state')[0]=='OPEN')) and (q.get('favoritesOnly',['false'])[0]!='true' or r['favorite'])]
   data={'items':result[page*size:(page+1)*size],'page':page,'size':size,'totalElements':len(result),'totalPages':(len(result)+size-1)//size}
  elif re.fullmatch('/api/v1/jars/\\d+',p):data=next(r for r in rows if r['jarId']==int(p.rsplit('/',1)[1]))
  elif p.endswith('/members'):data={'items':[{'userId':900001,'name':'로컬 검증 계정','role':'OWNER'},{'userId':900002,'name':'함께하는 멤버','role':'MEMBER'}]}
  elif p.endswith('/unread-count') or p.endswith('/unread'):data={'count':0,'unreadCount':0}
  elif p=='/api/v1/design-drafts':data={'items':[{'draftId':900001,'bodyStyle':'CAT','selectedDesignType':'ORIGINAL','updatedAt':'2026-11-19T10:00:00+09:00','expiresAt':'2030-11-20T10:00:00+09:00'}],'page':0,'hasNext':False}
  elif re.fullmatch('/api/v1/design-drafts/\\d+',p):data={'draftId':900001,'status':'ACTIVE','bodyStyle':'CAT','selectedDesignType':'ORIGINAL','selectedGenerationId':None,'photoFrame':{'x':0,'y':0,'width':1,'height':1,'fit':'cover'},'slotCenterX':0.5,'slotCenterY':0.17,'slotSizeRatio':0.18,'slotStyle':'CAPSULE','expiresAt':'2030-11-20T10:00:00+09:00','generations':[],'cutoutRegions':[],'cutoutPoints':[]}
  elif '/preview' in p:data={'previewUrl':'http://127.0.0.1:18962/fixture.png','expiresAt':'2030-11-20T10:00:00Z'}
  elif p.endswith('/notes') or p.endswith('/notes/mine'):data={'items':[],'page':page,'size':size,'totalElements':0,'totalPages':0}
  elif '/daily-draw' in p:data=None
  elif p.startswith('/api/'):data={'items':[],'page':0,'totalElements':0,'totalPages':0}
  elif p.startswith('/assets/') or p.startswith('/images/') or p.startswith('/fonts/') or '.' in p.rsplit('/',1)[1]:return super().do_GET()
  else:self.path='/index.html';return super().do_GET()
  self.out({'data':data})
 def do_PATCH(self):
  p=urlsplit(self.path).path;data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or '{}')
  if p.endswith('/favorite'):
   for r in rows:
    if r['jarId']==int(p.split('/')[-2]):r['favorite']=data['favorite']
  self.out({'data':None})
 def do_PUT(self):
  self.rfile.read(int(self.headers.get('Content-Length',0)));self.out({'data':None})
 def do_POST(self):
  p=urlsplit(self.path).path;data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or '{}')
  if p=='/api/v1/files/presign':
   key='notes/900001/'+str(len(uploads)+1);uploads[key]=data;return self.out({'data':{'s3Key':key,'uploadUrl':'http://127.0.0.1:18962/local-upload','publicUrl':'http://127.0.0.1:18962/fixture.png'}})
  if p=='/api/v1/files/complete':return self.out({'data':{'s3Key':data['s3Key'],'status':'COMPLETED'}})
  if p.endswith('/notes'):
   request=data['requestId'];notes.setdefault(request,data)
   if '응답유실' in data.get('content','') and request not in lost:
    lost.add(request);return self.out({'error':{'code':'SERVICE_UNAVAILABLE','message':'로컬 검증: 저장 후 응답 유실'}},503)
   return self.out({'data':{'noteId':900001,'jarId':900001}})
  return self.out({'data':{}})
ThreadingHTTPServer(('127.0.0.1',18962),Handler).serve_forever()
