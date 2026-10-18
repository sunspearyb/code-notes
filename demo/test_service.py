"""Isolated service tests. No real credentials, external requests, or user data."""
import base64
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from local_service import LocalService, ServiceError, extract_text


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.calls = []
        def fake_transport(url, payload, key, allow_local=False):
            self.calls.append((url, payload, key))
            if url.endswith('web-search'):
                return {'code': 200, 'data': {'webPages': {'value': []}}}
            return {'choices': [{'message': {'content': json.dumps({'notes': [{'unitId':'a37','question':'程序如何保障自由？','text':'测试候选，不作学术判断。','excerpt':'测试材料原文。','methods':['文义']}]})}}], 'usage': {'total_tokens': 10}}
        self.service = LocalService(Path(__file__).resolve().parent.parent, self.root/'data', fake_transport, export_dir=False)
        self.snapshot={'schemaVersion':2,'bookId':'cn-constitution','notes':[]}

    def tearDown(self):
        self.temp.cleanup()

    def configure(self):
        self.service.settings({'model':'test-model','apiKey':'test-secret','searchKey':'search-secret','backupDirectory':str(self.root/'cloud'),'backupMinutes':1})

    def test_revision_conflict_is_non_destructive(self):
        self.service.save_snapshot({'revision':0,'state':self.snapshot})
        with self.assertRaises(ServiceError) as e:
            self.service.save_snapshot({'revision':0,'state':{**self.snapshot,'notes':[{'text':'stale'}]}})
        self.assertEqual(e.exception.status,409)
        self.assertEqual(self.service.snapshot['state']['notes'],[])
        reopened=LocalService(self.service.project,self.root/'data',export_dir=False)
        self.assertEqual(reopened.snapshot['revision'],1)

    def test_notebook_changed_by_cloud_drive_is_reloaded(self):
        # Another computer saves notebook.json through a synced folder while this service runs.
        import os, time
        self.service.save_snapshot({'revision':0,'state':self.snapshot})
        other={'revision':5,'savedAt':'2026-10-18T00:00:00Z','state':{**self.snapshot,'notes':[{'text':'另一台电脑'}]}}
        path=self.root/'data'/'notebook.json'
        path.write_text(json.dumps(other,ensure_ascii=False),'utf-8')
        later=time.time()+5;os.utime(path,(later,later))
        current=self.service.current_snapshot()
        self.assertEqual(current['state']['notes'],[{'text':'另一台电脑'}])
        self.assertGreater(current['revision'],1)
        with self.assertRaises(ServiceError) as e:  # a page still at revision 1 must merge, not overwrite
            self.service.save_snapshot({'revision':1,'state':self.snapshot})
        self.assertEqual(e.exception.status,409)
        self.service.save_snapshot({'revision':current['revision'],'state':{**self.snapshot,'notes':[{'text':'合并后'}]}})
        self.assertEqual(json.loads(path.read_text('utf-8'))['state']['notes'],[{'text':'合并后'}])
        # Cloud-drive conflict copies are offered for merging, then set aside without deletion.
        copy=self.root/'data'/'notebook (冲突副本 2026-10-18).json'
        copy.write_text(json.dumps(other,ensure_ascii=False),'utf-8')
        self.assertEqual([c['name'] for c in self.service.conflict_copies()],[copy.name])
        self.service.conflict_done(copy.name)
        self.assertEqual(self.service.conflict_copies(),[])
        self.assertTrue(copy.with_name(copy.name+'.已合并').exists())
        with self.assertRaises(ServiceError):
            self.service.conflict_done('../notebook.json')

    def test_program_folder_keeps_readable_copies(self):
        import local_service
        self.service.export_dir = self.root
        self.service.save_snapshot({'revision':0,'state':self.snapshot,'markdown':'# 我的法典笔记'})
        self.assertEqual((self.root/'法典笔记.md').read_text('utf-8'),'# 我的法典笔记')
        saved=json.loads((self.root/'法典笔记数据.json').read_text('utf-8'))
        self.assertEqual(saved['notes'],[]);self.assertIn('exportedAt',saved)
        self.assertEqual(self.service.conflict_copies(),[])  # its own file is not offered back
        # A browser on another computer, syncing the same folder, changed the file.
        other={**self.snapshot,'notes':[{'text':'另一台电脑'}],'exportedAt':'2026-10-18T00:00:00Z'}
        (self.root/'法典笔记数据.json').write_text(json.dumps(other,ensure_ascii=False),'utf-8')
        (self.root/'法典笔记数据 (1).json').write_text(json.dumps(other,ensure_ascii=False),'utf-8')
        names=[c['name'] for c in self.service.conflict_copies()]
        self.assertEqual(sorted(names),['法典笔记数据 (1).json','法典笔记数据.json'])
        self.assertNotIn('exportedAt',self.service.conflict_copies()[0]['state'])
        for name in names:
            self.service.conflict_done(name)
        self.assertEqual(self.service.conflict_copies(),[])
        self.assertTrue((self.root/'法典笔记数据.json').exists())
        self.assertTrue((self.root/'法典笔记数据 (1).json.已合并').exists())

    def test_files_backup_restore_and_secrets(self):
        self.configure()
        file=self.service.upload({'name':'../../材料.md','content':base64.b64encode('测试材料原文。'.encode()).decode()})
        self.assertEqual(file['name'],'材料.md')
        self.assertEqual(self.service.upload({'name':'重复.md','content':base64.b64encode('测试材料原文。'.encode()).decode()})['id'],file['id'])
        self.service.save_snapshot({'revision':0,'state':self.snapshot})
        result=self.service.backup()
        package=self.root/'cloud'/result['name']
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(archive.read('attachments/'+file['id']),'测试材料原文。'.encode())
            for name in archive.namelist():
                self.assertNotIn(b'test-secret',archive.read(name))
        self.assertNotIn('test-secret',(self.root/'data/settings.json').read_text())
        restored=LocalService(self.service.project,self.root/'other',export_dir=False)
        restored.settings({'backupDirectory':str(self.root/'cloud')})
        self.assertEqual(restored.restore(result['name'])['state'],self.snapshot)
        self.assertEqual(restored.attachment(file['id'])[1],'测试材料原文。'.encode())
        self.assertFalse(restored.status()['aiConnected'])
        self.assertFalse(result['remoteVerified'])

    def test_ai_excerpt_and_ids_are_validated(self):
        self.configure()
        f=self.service.add_file('材料.txt','测试材料原文。'.encode())
        self.service.analyze({'attachmentId':f['id']})
        self.assertEqual(len(self.service.proposals),1)
        self.assertEqual(self.service.proposals[0]['status'],'pending')
        self.assertEqual(self.service.proposals[0]['attachmentId'],f['id'])
        self.assertEqual(self.service.snapshot['state'],None)
        self.service.analyze({'attachmentId':f['id']})
        self.assertEqual(len(self.service.proposals),1)
        with self.assertRaises(ServiceError):
            self.service.analyze({'text':'没有这一句。'})
        self.assertEqual(len(self.service.proposals),1)
        with self.assertRaises(ServiceError):
            self.service.resolve({'id':self.service.proposals[0]['id'],'status':'accepted'})
        self.assertEqual(self.service.proposals[0]['status'],'pending')
        self.service.resolve({'id':self.service.proposals[0]['id'],'status':'accepted','reviewed':True})
        self.assertEqual(self.service.proposals[0]['status'],'accepted')
        self.assertTrue(self.service.proposals[0]['reviewedAt'])

    def test_learning_context_and_optional_prompt(self):
        self.configure()
        learning={'question':'我的问题','thought':'尚待论证的理解','mode':'检验我的理由与反例','skipThinking':False}
        result=self.service.analyze({'text':'测试材料原文。','learning':learning})
        request=json.loads(self.calls[-1][1]['messages'][1]['content'])
        self.assertEqual(request['研读任务'],learning)
        self.assertEqual(result['proposals'][0]['learning'],learning)
        self.assertIn('不代替',self.calls[-1][1]['messages'][0]['content'].replace('不要代替','不代替'))
        self.service.analyze({'text':'测试材料原文。','learning':{**learning,'skipThinking':True}})
        skipped=json.loads(self.calls[-1][1]['messages'][1]['content'])['研读任务']
        self.assertTrue(skipped['skipThinking']);self.assertEqual(skipped['question'],'');self.assertEqual(skipped['thought'],'')
        before=len(self.calls)
        with self.assertRaises(ServiceError):
            self.service.analyze({'text':'测试材料原文。','learning':{**learning,'thought':'x'*6001}})
        self.assertEqual(len(self.calls),before)
        self.assertIsNone(self.service.snapshot['state'])

    def test_scheduler_and_provider_change(self):
        self.configure()
        self.service.save_snapshot({'revision':0,'state':self.snapshot})
        self.service.tick(self.service.last_backup_tick+61)
        self.assertEqual(len(self.service.backups()),1)
        self.service.settings({'searchHours':6})
        self.service.tick(self.service.last_search_tick+6*3600+1)
        self.assertTrue(self.service.activity['searchAt'])
        self.assertTrue(any(c[0].endswith('web-search') for c in self.calls))
        self.service.settings({'baseUrl':'http://127.0.0.1:9999/v1'})
        self.assertFalse(self.service.keys['ai'])
        with self.assertRaises(ServiceError):
            self.service.settings({'baseUrl':'http://untrusted.example'})

    def test_docx_and_limits(self):
        content=io.BytesIO()
        with zipfile.ZipFile(content,'w') as archive:
            archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>测试正文</w:t></w:r></w:p></w:body></w:document>')
        self.assertIn('测试正文',extract_text('材料.docx',content.getvalue())[0])
        with self.assertRaises(ServiceError):
            self.service.add_file('execute.html',b'<script>evil</script>')
        with self.assertRaises(ServiceError):
            self.service.add_file('fake.pdf',b'not a pdf')

    def test_pdf_without_text_is_not_reported_as_extracted(self):
        try:
            from pypdf import PdfWriter
        except ImportError:
            self.skipTest('pypdf unavailable in this runtime')
        writer=PdfWriter()
        writer.add_blank_page(width=100,height=100)
        raw=io.BytesIO()
        writer.write(raw)
        text,status=extract_text('blank.pdf',raw.getvalue())
        self.assertEqual(text,'')
        self.assertIn('补充',status)

    def test_scoped_ai_and_backup(self):
        self.configure()
        def scoped_transport(url, payload, key, allow_local=False):
            self.calls.append(payload)
            return {'choices':[{'message':{'content':json.dumps({'notes':[{'unitId':'','question':'范围测试','text':'整体材料理解','excerpt':'测试材料原文。','methods':['历史']}]})}}]}
        self.service.transport=scoped_transport
        file=self.service.add_file('整体材料.txt','测试材料原文。'.encode())
        for scope in [{'kind':'constitution','year':2018,'unitIds':[]},{'kind':'amendment','year':2004,'unitIds':[]}]:
            result=self.service.analyze({'attachmentId':file['id'],'scope':scope})
            self.assertEqual(result['proposals'][0]['scope'],scope)
            self.assertEqual(result['proposals'][0]['unitId'],'')
            self.assertEqual(result['proposals'][0]['year'],scope['year'])
        self.assertEqual(len(self.service.proposals),2)
        self.assertIn('本次修正案原文',self.calls[-1]['messages'][0]['content'])
        self.service.analyze({'attachmentId':file['id'],'scope':{'kind':'amendment','year':2004,'unitIds':[]}})
        self.assertEqual(len(self.service.proposals),2)
        self.service.save_snapshot({'revision':0,'state':{**self.snapshot,'materialRelations':[{'scope':{'kind':'constitution','year':2018,'unitIds':[]}}]}})
        package=self.service.backup()
        restored=LocalService(self.service.project,self.root/'scope-restore',export_dir=False)
        restored.settings({'backupDirectory':str(self.root/'cloud')})
        result=restored.restore(package['name'])
        self.assertEqual(len(restored.proposals),2)
        self.assertEqual(result['state']['materialRelations'][0]['scope']['kind'],'constitution')

    def test_ai_respects_selected_articles(self):
        self.configure()
        # Default fake provider returns a37; selecting a33 must reject it.
        with self.assertRaises(ServiceError):
            self.service.analyze({'text':'测试材料原文。','scope':{'kind':'articles','year':2018,'unitIds':['a33']}})
        self.assertEqual(len(self.service.proposals),0)
        result=self.service.analyze({'text':'测试材料原文。','scope':{'kind':'articles','year':2018,'unitIds':['a33','a37']}})
        self.assertEqual(result['proposals'][0]['scope']['unitIds'],['a37'])
        with self.assertRaises(ServiceError):
            self.service.analyze({'text':'测试材料原文。','scope':{'kind':'articles','year':1982,'unitIds':['a123']}})

    def test_ai_and_sync_settings_are_independent(self):
        self.configure()
        self.service.settings({'searchHours':24,'autoAnalyzeUploads':True})
        self.service.settings({'backupMinutes':5})
        self.assertEqual(self.service.config['searchHours'],24)
        self.assertTrue(self.service.config['autoAnalyzeUploads'])
        self.assertEqual(self.service.keys['ai'],'test-secret')
        backup_tick=self.service.last_backup_tick
        self.service.settings({'model':'other-test'})
        self.assertEqual(self.service.last_backup_tick,backup_tick)
        self.assertEqual(self.service.config['backupMinutes'],5)
        self.assertEqual(self.service.config['backupDirectory'],str((self.root/'cloud').resolve()))

if __name__=='__main__':
    unittest.main()
