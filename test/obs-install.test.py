import importlib.util
import json
import shutil
import sqlite3
from unittest.mock import patch
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('obs_install', Path(__file__).resolve().parents[1] / 'scripts/obs/install.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallTest(unittest.TestCase):
    def test_scene_paths_profile_selection_backup_and_other_profiles(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'obs-studio'
            target.mkdir()
            (target / 'user.ini').write_text('[Basic]\nProfile=Old\n[Other]\nKeep=yes\n')
            other = target / 'basic/profiles/Existing'
            other.mkdir(parents=True)
            (other / 'basic.ini').write_text('untouched')
            module.install(target)
            scene = json.loads((target / 'basic/scenes/TikTok-Live-Games.json').read_text())
            script = scene['modules']['scripts-tool'][0]
            self.assertTrue(Path(script['path']).is_file())
            self.assertEqual(script['settings'], {'enabled': True, 'offline_seconds': 30})
            self.assertIn('ProfileDir = TikTok-Live-Games', (target / 'user.ini').read_text())
            self.assertIn('Keep = yes', (target / 'user.ini').read_text())
            self.assertEqual((other / 'basic.ini').read_text(), 'untouched')
            self.assertEqual(len(list(Path(folder).glob('obs-before-install-*'))), 1)
            service = json.loads((target / 'basic/profiles/TikTok-Live-Games/service.json').read_text())
            self.assertEqual(service['settings']['key'], '')
            self.assertNotIn('__HOME__', (target / 'basic/profiles/TikTok-Live-Games/basic.ini').read_text())

    def test_private_restore_keeps_key_and_ranking_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            root = base / 'repo'
            shutil.copytree(module.ROOT / 'obs', root / 'obs')
            shutil.copytree(module.ROOT / 'scripts/obs', root / 'scripts/obs')
            private = base / 'private'
            service = private / 'obs-studio/basic/profiles/Untitled/service.json'
            service.parent.mkdir(parents=True)
            service.write_text(json.dumps({'settings': {'key': 'test-only-private-key'}}))
            (private / '.env').write_text('PORT=3001\n')
            with sqlite3.connect(private / 'rankings.sqlite') as db:
                db.execute('CREATE TABLE example (score INTEGER)')
                db.execute('INSERT INTO example VALUES (13)')
            with patch.object(module, 'ROOT', root):
                module.install(base / 'config', private)
                self.assertEqual((root / '.env').read_text(), 'PORT=3001\n')
                with sqlite3.connect(root / 'data/rankings.sqlite') as db:
                    self.assertEqual(db.execute('SELECT score FROM example').fetchone(), (13,))
                installed = json.loads((base / 'config/basic/profiles/TikTok-Live-Games/service.json').read_text())
                self.assertEqual(installed['settings']['key'], 'test-only-private-key')
                with self.assertRaises(RuntimeError):
                    module.install(base / 'config', private)

    def test_missing_private_service_does_not_change_obs(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'obs-studio'
            with self.assertRaises(FileNotFoundError):
                module.install(target, Path(folder) / 'missing')
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
