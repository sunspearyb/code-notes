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

    def test_default_year_is_latest(self):
        self.assertEqual(handle(self.s, {'action': 'catalogue'})['year'], self.s.years[-1])

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

    def test_three_levels(self):
        note = {'id': 'n1', 'unitId': 'a33', 'year': 2018, 'text': '公开的笔记', 'question': '', 'methods': ['文义解释'], 'anchors': [], 'updatedAt': '2026-01-01T00:00:00Z'}
        self.s.snapshot = {'revision': 1, 'state': {'notes': [note, {**note, 'id': 'n2', 'text': '上锁的笔记', 'private': True}],
                           'links': [{'id': 'l1', 'from': [{'unitId': 'a33', 'year': 2018}], 'to': [{'unitId': 'a34', 'year': 2018}], 'reason': '平等'}]}}
        # 保险箱: nothing, not even the law text.
        self.s.settings({'aiAccess': 'vault'})
        for action in ('article', 'catalogue', 'notes', 'propose'):
            with self.assertRaises(ServiceError) as error:handle(self.s, {**self.body, 'action': action, 'ref': '第三十三条'})
            self.assertEqual(error.exception.status, 403)
        # 只读, notes not allowed: law text only.
        self.s.settings({'aiAccess': 'read', 'aiReadNotes': False})
        self.assertEqual(handle(self.s, {'action': 'article', 'ref': '宪法第三十三条'})['unitId'], 'a33')
        self.assertEqual(handle(self.s, {'action': 'context', 'ref': '33'})['linkedByReader'], [])
        self.assertEqual(handle(self.s, {'action': 'read', 'unitId': 'a33'})['notes'], [])
        self.assertEqual([r['kind'] for r in handle(self.s, {'action': 'search', 'query': '笔记'})], [])
        for action in ('notes', 'materials', 'book', 'files', 'propose', 'upload'):
            with self.assertRaises(ServiceError):handle(self.s, {**self.body, 'action': action, 'ref': '第三十三条'})
        # 只读 with notes: notes come, except the locked one; still no writing.
        self.s.settings({'aiReadNotes': True})
        notes = handle(self.s, {'action': 'notes', 'ref': '第三十三条'})['notes']
        self.assertEqual([(n['text'], n['origin']) for n in notes], [('公开的笔记', '本人')])
        self.assertEqual(len(handle(self.s, {'action': 'book'})['state']['notes']), 1)
        self.assertEqual(handle(self.s, {'action': 'context', 'ref': '第三十三条'})['linkedByReader'][0]['with'][0]['unitId'], 'a34')
        with self.assertRaises(ServiceError):handle(self.s, self.body)
        # 协作: suggestions may be submitted.
        self.s.settings({'aiAccess': 'collab'})
        self.assertEqual(len(handle(self.s, self.body)['proposals']), 1)
        self.assertTrue(self.s.config['agentEnabled'])

    def test_questions_by_method(self):
        self.s.settings({'aiAccess': 'read', 'aiReadNotes': False})
        article = handle(self.s, {'action': 'article', 'ref': '《中华人民共和国宪法》第三十三条第三款'})
        self.assertEqual((article['label'], len(article['paragraphs']), article['paragraphs'][2]['款']), ('第三十三条', 4, 3))
        self.assertEqual(handle(self.s, {'action': 'article', 'ref': '序言第七自然段'})['unitId'], 'p7')
        self.assertEqual(handle(self.s, {'action': 'article', 'ref': '第一百二十三条', 'year': 1982})['unitId'], 'a128')
        context = handle(self.s, {'action': 'context', 'ref': '第三十三条'})
        self.assertEqual((context['previous']['label'], context['next']['label']), ('第三十二条', '第三十四条'))
        self.assertIn('公民的基本权利和义务', context['position'][0]['name'])
        history = handle(self.s, {'action': 'history', 'ref': '第三十三条'})
        changed = [v for v in history['versions'] if v['changed']]
        self.assertEqual([v['year'] for v in changed], [2004])
        self.assertTrue(changed[0]['amendments'] and any(op['type'] == 'insert' for op in changed[0]['changes']))
        for bad in ('第九百九十九条', '乱写', ''):
            with self.assertRaises(ServiceError):handle(self.s, {'action': 'article', 'ref': bad})

    def test_between_codes(self):
        import cross_code, json
        other = Path(self.tmp.name) / 'others'
        self.s.other_home = lambda name: other / name
        (other / 'civil-code').mkdir(parents=True)
        relation = {'id': 'r1', 'category': 'crosscode', 'details': {'code': '宪法', 'article': '第十三条'}, 'text': '私有财产的保护',
                    'scope': {'kind': 'articles', 'year': 2020, 'unitIds': ['a207']}}
        notes = [{'id': 'n', 'unitId': 'a207', 'year': 2020, 'question': '物权平等保护', 'text': '与宪法第十三条对读'}]
        (other / 'civil-code/notebook.json').write_text(json.dumps({'state': {'materialRelations': [relation, {**relation, 'id': 'r2', 'details': {'code': '海商法', 'article': '第一条'}}], 'notes': notes}}), encoding='utf-8')
        back = cross_code.handle(self.s, {'action': 'back'})['records']
        self.assertEqual([(r['code'], r['unitId'], r['from'][0]['label'], r['text']) for r in back], [('民法典', 'a13', '第二百零七条', '私有财产的保护')])
        text = cross_code.handle(self.s, {'action': 'text', 'code': '民法典', 'ref': '第二百零七条'})
        self.assertEqual((text['code'], text['unitId'], text['here'], text['notes'][0]['question']), ('民法典', 'a207', False, '物权平等保护'))
        self.assertIn('平等保护', text['paragraphs'][0])
        self.assertEqual(cross_code.handle(self.s, {'action': 'text', 'code': '网络法典', 'ref': '个人信息保护法第十三条'})['unitId'], 'pi13')
        self.assertEqual(cross_code.handle(self.s, {'action': 'text', 'code': '个保法', 'ref': '第十三条'})['unitId'], 'pi13')
        self.assertEqual(cross_code.handle(self.s, {'action': 'text', 'code': 'civil-code', 'unitId': 'a8'})['label'], '第八条')
        with self.assertRaises(ServiceError):cross_code.handle(self.s, {'action': 'text', 'code': '海商法', 'ref': '第一条'})

    def test_device_settings_shared(self):
        self.assertEqual(self.s.device_settings(), {})
        self.assertEqual(self.s.save_device_settings({'tarot': True, 'lawScale': 1.15, 'bad': 'x', 'continuous': 'yes'}), {'tarot': True, 'lawScale': 1.15})
        self.assertEqual(self.s.save_device_settings({'appearance': 'dark'}), {'tarot': True, 'lawScale': 1.15, 'appearance': 'dark'})


if __name__ == '__main__':
    unittest.main()
