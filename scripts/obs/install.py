#!/usr/bin/env python3
"""Install the exported OBS profile and scene collection on Linux, with OBS closed."""
import argparse
import configparser
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def install(config_dir, private_dir=None):
    scene = json.loads((ROOT / 'obs/scenes/TikTok-Live-Games.json').read_text())
    profile = (ROOT / 'obs/profiles/TikTok-Live-Games/basic.ini').read_text()
    service = ROOT / 'obs/profiles/TikTok-Live-Games/service.json'
    if private_dir:
        service = private_dir / 'obs-studio/basic/profiles/Untitled/service.json'
    # Read credentials before changing any destination files.
    service_data = json.loads(service.read_text())
    if private_dir:
        required = [private_dir / name for name in ('.env', 'rankings.sqlite')]
        for source in required:
            if source.exists():
                destination = ROOT / ('.env' if source.name == '.env' else 'data/rankings.sqlite')
                if destination.exists():
                    raise RuntimeError(f'{destination} ja existe. Preserve ou mova antes de restaurar a copia privada.')
    config_dir.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='obs-before-install-', dir=config_dir.parent))
    backup.chmod(0o700)
    for name in ['user.ini', 'basic/profiles/TikTok-Live-Games',
                 'basic/scenes/TikTok-Live-Games.json', 'scripts/restart-live.lua']:
        source = config_dir / name
        if source.exists():
            target = backup / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)
    script = config_dir / 'scripts/restart-live.lua'
    script.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'scripts/obs/restart-live.lua', script)
    scene['modules']['scripts-tool'][0]['path'] = str(script)
    scene_dir = config_dir / 'basic/scenes'
    profile_dir = config_dir / 'basic/profiles/TikTok-Live-Games'
    scene_dir.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)
    (scene_dir / 'TikTok-Live-Games.json').write_text(json.dumps(scene, ensure_ascii=False, indent=2))
    (profile_dir / 'basic.ini').write_text(profile.replace('__HOME__', str(Path.home())))
    service_path = profile_dir / 'service.json'
    service_path.write_text(json.dumps(service_data, indent=2))
    service_path.chmod(0o600)
    config = configparser.ConfigParser(interpolation=None)
    config.optionxform = str
    user = config_dir / 'user.ini'
    config.read(user)
    if not config.has_section('Basic'):
        config.add_section('Basic')
    config['Basic'].update(Profile='TikTok Live Games', ProfileDir='TikTok-Live-Games',
                           SceneCollection='TikTok Live Games', SceneCollectionFile='TikTok-Live-Games')
    with user.open('w') as handle:
        config.write(handle)
    if private_dir:
        for name in ['.env', 'rankings.sqlite']:
            source = private_dir / name
            if not source.exists():
                continue
            destination = ROOT / ('.env' if name == '.env' else 'data/rankings.sqlite')
            destination.parent.mkdir(parents=True, exist_ok=True)
            if name == 'rankings.sqlite':
                with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
                    src.backup(dst)
            else:
                shutil.copy2(source, destination)
            destination.chmod(0o600)
    print(f'Instalado em {config_dir}. Backup anterior: {backup}')
    print('Abra o OBS. O reinicio de 20 minutos esta ativado; a transmissao so comeca quando voce iniciar.')
    if not private_dir:
        print('Preencha a chave do Restream em Configuracoes > Transmissao.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-dir', type=Path, help='Pasta privada exportada do PC anterior')
    args = parser.parse_args()
    # Editing a running OBS collection loses changes when OBS saves its in-memory state.
    if subprocess.run(['pgrep', '-x', 'obs'], capture_output=True).returncode == 0:
        parser.exit(1, 'Feche o OBS antes de instalar. A live atual nao sera interrompida pelo instalador.\n')
    target = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config'))) / 'obs-studio'
    try:
        install(target, args.private_dir)
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as error:
        parser.exit(1, f'Falha na instalacao: {error}\n')
