"""실제 sysctl·systemd 없이 임시 변경·자동 원복·다른 관리자 변경 보호를 검사한다."""
import importlib.util
import pathlib
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('swap_trial',pathlib.Path(__file__).with_name('temporary-swap-policy.py'))
trial=importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)
UNIT='memoryjar-swap-trial-20261021-150000'


class TrialTest(unittest.TestCase):
    """타이머 확인 전에 설정을 바꾸지 않고, 자신의 값만 원복하는지 확인한다."""
    def case(self,callback):
        with tempfile.TemporaryDirectory() as folder:
            path=pathlib.Path(folder)/'swappiness'
            path.write_text('60\n')
            calls=[]
            def run(args):
                calls.append(args)
                return 'not-found' if args[:2]==['systemctl','show'] and len(calls)==1 else 'active' if args[:2]==['systemctl','is-active'] else 'loaded'
            callback(trial.TemporarySwapPolicy(UNIT,run,path),path,calls)

    def test_apply_and_restore(self):
        def check(obj,path,calls):
            self.assertEqual(obj.apply()['status'],'APPLIED')
            self.assertEqual(obj.value(),10)
            self.assertEqual(calls[1][0],'systemd-run')
            self.assertIn('--on-active=12min',calls[1])
            self.assertEqual(obj.restore()['status'],'RESTORED')
            self.assertEqual(obj.value(),60)
        self.case(check)

    def test_timer_failure_never_changes_policy(self):
        def check(obj,path,calls):
            obj.run=lambda _: (_ for _ in ()).throw(RuntimeError('MOCK_TIMER_FAILED'))
            with self.assertRaises(RuntimeError):obj.apply()
            self.assertEqual(obj.value(),60)
        self.case(check)

    def test_inactive_timer_and_existing_unit_never_change_policy(self):
        for existing in (False,True):
            def check(obj,path,calls):
                def run(args):
                    if args[:2]==['systemctl','show']:
                        return 'loaded' if existing else 'not-found'
                    return 'inactive' if args[:2]==['systemctl','is-active'] else ''
                obj.run=run
                with self.assertRaises(ValueError):obj.apply()
                self.assertEqual(obj.value(),60)
            self.case(check)

    def test_change_between_timer_and_apply_is_not_overwritten(self):
        def check(obj,path,calls):
            def run(args):
                if args[:2]==['systemctl','show']:return 'not-found'
                if args[:2]==['systemctl','is-active']:
                    path.write_text('20\n')
                    return 'active'
                return ''
            obj.run=run
            with self.assertRaises(ValueError):obj.apply()
            self.assertEqual(obj.value(),20)
        self.case(check)

    def test_other_original_and_other_restore_value_refused(self):
        def check(obj,path,calls):
            path.write_text('20\n')
            with self.assertRaises(ValueError):obj.apply()
            with self.assertRaises(ValueError):obj.restore()
            self.assertEqual(obj.value(),20)
            self.assertEqual(calls,[])
        self.case(check)

    def test_auto_restore_payload_is_compare_before_write(self):
        with tempfile.TemporaryDirectory() as folder:
            path=pathlib.Path(folder)/'swappiness'
            source=trial.rollback_source().replace(repr(trial.SWAP_PATH),repr(str(path)))
            for start,expected in ((10,60),(60,60),(20,20)):
                path.write_text(str(start))
                exec(compile(source,'<rollback-test>','exec'),{})
                self.assertEqual(int(path.read_text()),expected)

    def test_only_explicit_values_and_unit_allowed(self):
        for pair in ((60,0),(10,60),(30,10)):
            with self.assertRaises(ValueError):trial.rollback_source(*pair)
        with self.assertRaises(ValueError):trial.TemporarySwapPolicy('other-service')


if __name__=='__main__':
    unittest.main()
