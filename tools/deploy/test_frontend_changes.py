"""프론트 전용 푸시를 허용하되 누락된 비교와 백엔드 변경은 배포 전에 거절한다."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('api_deploy_changes', pathlib.Path(__file__).with_name('deploy-api.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FrontendChangesTest(unittest.TestCase):
    def comparison(self, files):
        return {'status': 'ahead', 'merge_base_commit': {'sha': 'a'*40}, 'files': files}

    def test_frontend_and_docs_do_not_cancel_pending_backend_release(self):
        self.assertTrue(module.frontend_only_comparison(self.comparison([{'filename':'frontend/src/App.jsx'}, {'filename':'docs/API.md'}]), 'a'*40))

    def test_backend_and_rename_and_truncated_and_diverged_are_rejected(self):
        cases = [[{'filename':'src/main/java/App.java'}], [{'filename':'frontend/App.java','previous_filename':'src/App.java'}], [{'filename':'frontend/a'}]*300]
        for files in cases:
            self.assertFalse(module.frontend_only_comparison(self.comparison(files), 'a'*40))
        data=self.comparison([]);data['status']='diverged'
        self.assertFalse(module.frontend_only_comparison(data,'a'*40))
        self.assertFalse(module.frontend_only_comparison({},'a'*40))
        self.assertFalse(module.frontend_only_comparison({'status':'ahead','merge_base_commit':{'sha':'a'*40}},'a'*40))

    def test_freshness_uses_explicit_backend_equivalence_without_changing_image_sha(self):
        calls=[]
        deployer=module.Deployer('.',{},'a'*40,'fixture/project',head=lambda repo:'b'*40,
            equivalent=lambda *args:calls.append(args) or True)
        deployer.fresh()
        self.assertEqual(calls,[('fixture/project','a'*40,'b'*40)])
        self.assertEqual(deployer.expected_sha,'a'*40)
