"""실제 HTTP·DB 없이 인증 프로브의 시간 제한·대상 검사·비밀값 비노출을 확인한다."""
import importlib.util
import json
import pathlib
import tempfile
import time
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('auth_probe',pathlib.Path(__file__).with_name('auth-flow-probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def fixture():
    return {'scope':'ec2-prepared','runId':'ltabcdef12','accounts':[
        {'userId':i+1,'loginId':'ltabcdef12'+str(i).zfill(2),'password':'not-a-real-password'} for i in range(10)]}


class Response:
    """본문을 출력하지 않는 고정 HTTP 응답 대역이다."""
    status = 200
    def __init__(self,data): self.data=data
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self): return json.dumps({'data':self.data}).encode()


class AuthFlowTest(unittest.TestCase):
    """정상 결과뿐 아니라 잘못된 사용자와 늦은 실패를 성공으로 기록하지 않는다."""
    def test_rejects_non_dedicated_or_duplicate_fixture(self):
        for change in ['scope','duplicate','login']:
            value=fixture()
            if change=='scope': value['scope']='production'
            if change=='duplicate': value['accounts'][1]['userId']=1
            if change=='login': value['accounts'][1]['loginId']='real-user'
            with self.assertRaises(ValueError): probe.AuthProbe(value,pathlib.Path('.'),pathlib.Path('.'))

    def case(self,data,phase='LOGIN',path='/api/v1/auth/login',fail=None):
        with tempfile.TemporaryDirectory() as folder:
            value=probe.AuthProbe(fixture(),pathlib.Path('.'),pathlib.Path(folder))
            value.pump=lambda *_:None
            value.last_received=time.monotonic()
            class Opener:
                def open(self,request,timeout):
                    self.timeout=timeout
                    if fail: raise TimeoutError('SECRET_SHOULD_NOT_BE_RECORDED')
                    return Response(data)
            opener=Opener()
            with patch('builtins.print'):
                if fail or data.get('userId')==99 or path=='/api/v1/paid' or (phase=='LOGOUT' and not data.get('ok')):
                    with self.assertRaises(Exception): value.call(opener,0,phase,path,expected_user=1 if phase=='LOGIN' else None)
                else:
                    value.call(opener,0,phase,path,expected_user=1 if phase=='LOGIN' else None)
            if path!='/api/v1/paid': self.assertEqual(opener.timeout,3)
            self.assertNotIn('SECRET_SHOULD_NOT_BE_RECORDED',json.dumps(value.phases))
            self.assertNotIn('not-a-real-password',json.dumps(value.phases))
            return value.phases

    def test_success_keeps_three_second_limit(self):
        self.assertTrue(self.case({'userId':1})[0]['passed'])

    def test_wrong_user_is_failure(self):
        self.assertFalse(self.case({'userId':99})[0]['passed'])

    def test_timeout_is_redacted(self):
        self.assertFalse(self.case({},fail=True)[0]['passed'])

    def test_paid_path_never_reaches_http(self):
        self.assertEqual(self.case({},path='/api/v1/paid'),[])

    def test_logout_must_be_confirmed(self):
        self.assertFalse(self.case({'ok':False},phase='LOGOUT',path='/api/v1/auth/logout')[0]['passed'])

    def test_failed_login_settles_before_cleanup_even_without_collector(self):
        with tempfile.TemporaryDirectory() as folder:
            value=probe.AuthProbe(fixture(),pathlib.Path('.'),pathlib.Path(folder))
            collector=Mock()
            collector.stdout=[]
            collector.poll.return_value=0
            value.pump=Mock()
            value.active=Mock(return_value=0)
            settled=[]
            def call(_,index,phase,*args):
                if phase=='INITIAL_CSRF': return {'token':'fake-token'}
                value.phases.append({'phase':'LOGIN','passed':False})
                raise TimeoutError()
            value.call=call
            def settle(pump):
                settled.append(True)
                return {'settleSeconds':30,'collectionFailures':1}
            def cleanup():
                self.assertTrue(settled,'cleanup must not race a late server completion')
                return 1
            value.cleanup=cleanup
            settings={'keyBuffer':8388608,'ariaCache':33554432,'innodbPool':134217728}
            with patch.object(probe.prep,'verify_runtime'), patch.object(probe.prep,'sql',return_value=json.dumps(settings)), \
                    patch.object(probe.subprocess,'Popen',return_value=collector), \
                    patch.object(probe.recovery,'settle_after_failure',side_effect=settle):
                result=value.run()
            self.assertEqual(result['status'],'STOPPED')
            self.assertEqual(result['cleanupRevoked'],1)
            self.assertEqual(result['recovery']['settleSeconds'],30)


if __name__=='__main__': unittest.main()
