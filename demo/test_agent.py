"""No network or real credentials: test assistant access and pending-only writes."""
import base64
import copy
from pathlib import Path
import tempfile
import unittest
from local_service import LocalService, ServiceError
from agent_bridge import handle


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = LocalService(Path(__file__).resolve().parent.parent, Path(self.tmp.name)/'data', export_dir=False)
        self.s.settings({'agentEnabled': True})
        self.body = {'action': 'propose', 'requestId': 'test-1', 'assistant': '测试助手', 'proposals': [
            {'kind': 'note', 'scope': {'kind': 'articles', 'year': 2018, 'unitIds': ['a37']},
             'title': '测试来源', 'sourceText': '可核对的原文。', 'excerpt': '可核对的原文。', 'question': '测试问题', 'text': '测试建议', 'methods': []}]}

    def tearDown(self):
        self.tmp.cleanup()

    def test_switch_and_history(self):
        self.s.settings({'agentEnabled': False})
        with self.assertRaises(ServiceError):handle(self.s, {'action': 'book'})
        self.s.settings({'agentEnabled': True})
        self.assertEqual(len(handle(self.s, {'action': 'catalogue'})['units']), 156)
        with self.assertRaises(ServiceError):handle(self.s, {'action': 'read', 'unitId': 'a123', 'year': 1982})
        self.assertEqual(handle(self.s, {'action': 'read', 'unitId': 'a37'})['unitId'], 'a37')

    def test_pending_and_idempotence(self):
        before=copy.deepcopy(self.s.snapshot)
        result=handle(self.s, self.body)
        self.assertEqual(result['proposals'][0]['status'], 'pending')
        self.assertEqual(self.s.snapshot, before)
        self.assertTrue(handle(self.s, self.body)['reused'])
        self.assertEqual(len(self.s.proposals), 1)
        self.body['proposals'][0]['text']='changed'
        with self.assertRaises(ServiceError):handle(self.s, self.body)
        self.assertEqual(len(self.s.proposals), 1)

    def test_batch_validation_is_atomic(self):
        bad=copy.deepcopy(self.body['proposals'][0]);bad['excerpt']='伪造的摘录'
        self.body['proposals'].append(bad)
        with self.assertRaises(ServiceError):handle(self.s, self.body)
        self.assertEqual(self.s.proposals, [])

    def test_link_scope_and_file_source(self):
        proposal=self.body['proposals'][0];proposal['kind']='link'
        with self.assertRaises(ServiceError):handle(self.s, self.body)
        proposal['scope']['unitIds']=['a37','a40']
        file=handle(self.s, {'action':'upload','name':'test.txt','content':base64.b64encode('真实附件原文。'.encode()).decode()})
        proposal['attachmentId']=file['id']
        with self.assertRaises(ServiceError):handle(self.s, self.body)
        proposal['excerpt']='真实附件原文。'
        result=handle(self.s, self.body)
        self.assertEqual(result['proposals'][0]['proposalKind'], 'link')
        self.assertEqual(len(handle(self.s, {'action':'files'})),1)
        self.assertEqual(handle(self.s, {'action':'file','id':file['id']})['text'],'真实附件原文。')
        self.assertTrue(handle(self.s, {'action':'search','query':'真实附件'}))

    def test_roundtrip_backup(self):
        handle(self.s,self.body)
        self.s.save_snapshot({'revision':0,'state':{'schemaVersion':2,'bookId':'cn-constitution','notes':[]}})
        self.s.settings({'backupDirectory':str(Path(self.tmp.name)/'backups')})
        archive=self.s.backup()
        self.assertEqual(self.s.restore(archive['name'])['state']['notes'],[])
        self.assertEqual(len(self.s.proposals),1)


if __name__ == '__main__':
    unittest.main()
