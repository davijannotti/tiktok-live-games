# Usar no outro Linux

Instale **Node.js 22.19+**, Git, Python 3 e OBS com suporte a fonte Navegador e scripts Lua. A máquina de origem usa OBS 32.2.1.

```bash
git clone https://github.com/davijannotti/tiktok-live-games.git
cd tiktok-live-games
npm ci
```

Com o **OBS fechado**, instale a cena, o perfil e o script:

```bash
python3 scripts/obs/install.py
npm start
```

Abra o OBS. O perfil e a coleção **TikTok Live Games** estarão selecionados. Preencha a chave em **Configurações → Transmissão → Restream** (servidor já configurado como RTMP personalizado). A fonte Browser usa `http://localhost:3000/games/urna-battle/index.html?id=achadinhos_ttk_shop32421`. Troque o `id` na fonte se usar outra conta. Mantenha `npm start` aberto enquanto transmite.

A cena preserva o formato vertical 720×1280 a 30 FPS, x264 a 6000 kbps e áudio do navegador separado. Confira os medidores: os dispositivos de microfone e desktop variam entre PCs; silencie-os se quiser transmitir apenas o jogo. Não ligue os dois PCs à mesma chave ao mesmo tempo.

O script é copiado para a configuração do OBS, cadastrado na coleção e **ativado**: para após 20 minutos e tenta iniciar novamente 30 segundos depois. Só começa a contar quando você inicia a transmissão. Para desativar: **Ferramentas → Scripts → restart-live.lua**. Parar manualmente não reabre a transmissão. O instalador preserva as outras coleções/perfis e informa onde fez backup dos arquivos que substituiu.

## Restaurar chave e histórico pela cópia privada

Transfira a pasta privada exportada do primeiro PC por um meio privado. Ela contém a chave do Restream, `.env`, um snapshot consistente do SQLite e a configuração original do OBS. Não envie essa pasta ao GitHub.

Em vez da instalação sem credenciais, execute:

```bash
python3 scripts/obs/install.py --private-dir /caminho/da/pasta/20261016-211922
npm start
```

A opção restaura também `.env` e `data/rankings.sqlite`. Recusa substituir esses arquivos se já existirem: preserve-os antes. A configuração original completa está em `obs-studio/` dentro dessa pasta; ela não é copiada inteira para evitar levar cookies, dispositivos ou caminhos de outro computador. O instalador público usa apenas cena/perfil exportados, script e, opcionalmente, a chave privada.

## Limite do reinício

O script controla o envio do OBS. Ainda é preciso confirmar se o Restream/TikTok encerra a sessão quando o OBS para ou apenas reconecta a mesma live. Faça um teste pelo botão **Testar reinício agora** antes de deixar sozinho; ele interrompe a transmissão. Não há garantia de ganho de audiência. Cada jogo dura cinco minutos, mais a tela de resultado; o reinício pode cortar uma rodada.
