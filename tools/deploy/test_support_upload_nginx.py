"""실제 운영을 바꾸지 않고 첨부 전용 설정의 범위·중복 적용·실패 복구를 검사한다."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('support_upload_nginx',Path(__file__).with_name('support-upload-nginx.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
ORIGINAL='server {\n    server_name api.esjh.shop;\n    location /ws { proxy_pass http://127.0.0.1:8080; }\n    location / { proxy_pass http://127.0.0.1:8080; }\n}\n'
SNIPPET=Path(__file__).with_name('nginx').joinpath('support-attachments.conf').read_bytes()


class SupportUploadNginxTest(unittest.TestCase):
    """수정은 정해진 API 서버 한 곳에만 허용하고 장애 시 원본을 되돌리는지 검사한다."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.site=self.root/'site.conf';self.site.write_text(ORIGINAL)
        self.old_include=module.INCLUDE;self.old_backup=module.BACKUP_ROOT
        module.INCLUDE=str(self.root/'snippet.conf');module.BACKUP_ROOT=self.root/'backups'
        self.addCleanup(lambda:setattr(module,'INCLUDE',self.old_include));self.addCleanup(lambda:setattr(module,'BACKUP_ROOT',self.old_backup))

    def test_render_adds_one_include_and_preserves_existing_root_and_websocket(self):
        result=module.render(ORIGINAL)
        self.assertIn('location /ws { proxy_pass http://127.0.0.1:8080; }',result)
        self.assertIn('location / { proxy_pass http://127.0.0.1:8080; }',result)
        self.assertEqual(result.count(module.MARKER),1);self.assertEqual(module.render(result),result)

    def test_refuses_unknown_server_ambiguous_root_and_duplicate_marker(self):
        for source in [ORIGINAL.replace('api.esjh.shop','other.invalid'),ORIGINAL+'\nlocation / { }',ORIGINAL+module.MARKER*2]:
            with self.subTest(source=source),self.assertRaises(module.ChangeError):module.render(source)

    def test_accepts_multiple_server_names_but_not_a_similar_domain(self):
        self.assertIn(module.MARKER,module.render(ORIGINAL.replace('server_name api.esjh.shop;','server_name esjh.shop api.esjh.shop;')))
        with self.assertRaises(module.ChangeError):module.render(ORIGINAL.replace('api.esjh.shop','notapi.esjh.shop'))

    def test_hash_change_aborts_before_writes_or_commands(self):
        calls=[]
        with self.assertRaises(module.ChangeError):module.apply(self.site,SNIPPET,'0'*64,calls.append)
        self.assertEqual(calls,[]);self.assertEqual(self.site.read_text(),ORIGINAL)

    def test_apply_validates_then_reloads_and_second_call_is_idempotent(self):
        calls=[];result=module.apply(self.site,SNIPPET,module.digest(self.site.read_bytes()),calls.append)
        self.assertTrue(result['changed']);self.assertEqual(calls,[['nginx','-t'],['nginx','-t'],['systemctl','reload','nginx']])
        self.assertEqual(Path(module.INCLUDE).read_bytes(),SNIPPET);self.assertEqual((Path(result['backup'])/'site.conf').read_text(),ORIGINAL)
        self.assertEqual(module.apply(self.site,SNIPPET,module.digest(self.site.read_bytes()),calls.append),{'changed':False})

    def test_failed_candidate_validation_restores_site_and_removes_new_snippet(self):
        calls=[]
        def command(args):
            calls.append(args)
            if len(calls)==2:raise RuntimeError('candidate rejected')
        with self.assertRaises(module.ChangeError):module.apply(self.site,SNIPPET,module.digest(self.site.read_bytes()),command)
        self.assertEqual(self.site.read_text(),ORIGINAL);self.assertFalse(Path(module.INCLUDE).exists())
        self.assertEqual(calls[-2:],[['nginx','-t'],['systemctl','reload','nginx']])

    def test_failed_reload_restores_preexisting_snippet(self):
        Path(module.INCLUDE).write_bytes(b'# previous snippet\n');calls=[]
        def command(args):
            calls.append(args)
            if len(calls)==3:raise RuntimeError('reload rejected')
        with self.assertRaises(module.ChangeError):module.apply(self.site,SNIPPET,module.digest(self.site.read_bytes()),command)
        self.assertEqual(self.site.read_text(),ORIGINAL);self.assertEqual(Path(module.INCLUDE).read_bytes(),b'# previous snippet\n')

    def test_policy_grants_only_attachment_object_actions(self):
        import json
        document=json.loads(Path(__file__).with_name('support-attachments-policy.template.json').read_text())
        statement=document['Statement'][0]
        self.assertEqual(set(statement['Action']),{'s3:PutObject','s3:GetObject','s3:DeleteObject'})
        self.assertEqual(statement['Resource'],'arn:aws:s3:::__BUCKET__/support-attachments/*')
        self.assertNotIn('Principal',statement)


if __name__=='__main__':unittest.main()
