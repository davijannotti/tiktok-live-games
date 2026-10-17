obs = obslua

local INTERVAL = 20 * 60
local ACTION_TIMEOUT = 30
local enabled, phase, since = false, 'idle', 0
local offline_seconds = 30

local function now()
  return obs.os_gettime_ns() / 1000000000
end

local function log(message)
  obs.script_log(obs.LOG_INFO, '[Live reset] ' .. message)
end

local function set_phase(value)
  phase, since = value, now()
end

local function fail(message)
  set_phase('failed')
  obs.script_log(obs.LOG_WARNING, '[Live reset] ' .. message .. ' Desative e ative o script para tentar novamente.')
end

local function stop_for_restart()
  if not enabled or not obs.obs_frontend_streaming_active() then return false end
  set_phase('stopping')
  log('Encerrando o envio do OBS. Aguardando confirmação de parada.')
  obs.obs_frontend_streaming_stop()
  return true
end

function live_reset_event(event)
  if event == obs.OBS_FRONTEND_EVENT_STREAMING_STARTED then
    if enabled then
      set_phase('live')
      log('Transmissão iniciada. Próximo reinício em 20 minutos.')
    end
  elseif event == obs.OBS_FRONTEND_EVENT_STREAMING_STOPPING then
    if phase ~= 'stopping' then
      set_phase('idle')
      log('Parada manual: o script não vai reabrir a transmissão.')
    end
  elseif event == obs.OBS_FRONTEND_EVENT_STREAMING_STOPPED then
    if enabled and phase == 'stopping' then
      set_phase('waiting')
      log('OBS parado. Nova tentativa de transmissão em ' .. offline_seconds .. ' segundos.')
    else
      set_phase('idle')
    end
  elseif event == obs.OBS_FRONTEND_EVENT_SCRIPTING_SHUTDOWN
      or event == obs.OBS_FRONTEND_EVENT_EXIT
      or event == obs.OBS_FRONTEND_EVENT_PROFILE_CHANGING
      or event == obs.OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING then
    enabled = false
    set_phase('idle')
  end
end

function live_reset_tick()
  if not enabled then return end
  local elapsed = now() - since
  if phase == 'live' then
    if not obs.obs_frontend_streaming_active() then
      set_phase('idle')
    elseif elapsed >= INTERVAL then
      stop_for_restart()
    end
  elseif phase == 'waiting' and elapsed >= offline_seconds then
    if obs.obs_frontend_streaming_active() then
      set_phase('live')
    else
      set_phase('starting')
      log('Solicitando nova transmissão ao OBS.')
      obs.obs_frontend_streaming_start()
    end
  elseif phase == 'stopping' and elapsed >= ACTION_TIMEOUT then
    fail('O OBS não confirmou a parada. Nenhum novo comando será enviado.')
  elseif phase == 'starting' and elapsed >= ACTION_TIMEOUT then
    fail('O OBS não confirmou o início. Nenhum novo comando será enviado.')
  end
end

function script_description()
  return '<h3>Reinício de live a cada 20 minutos</h3>' ..
    '<p>Para o envio do OBS, aguarda a pausa configurada e inicia novamente. ' ..
    'Não precisa de WebSocket, senha ou serviço pago.</p>' ..
    '<p><b>Configure primeiro o Restream/TikTok para encerrar a live ao parar o OBS.</b> ' ..
    'Caso contrário, isto pode apenas reconectar a mesma live. O script não confirma uma nova sessão no TikTok.</p>' ..
    '<p>Desativar ou remover o script cancela o reinício pendente. Uma parada manual não reabre a transmissão. ' ..
    'O intervalo conta a partir de cada início confirmado (ou da ativação durante uma live). ' ..
    'O reinício de 20 minutos pode acontecer no meio de uma rodada do jogo.</p>'
end

function script_defaults(settings)
  obs.obs_data_set_default_bool(settings, 'enabled', false)
  obs.obs_data_set_default_int(settings, 'offline_seconds', 30)
end

function script_properties()
  local props = obs.obs_properties_create()
  obs.obs_properties_add_bool(props, 'enabled', 'Ativar reinício automático a cada 20 minutos')
  obs.obs_properties_add_int(props, 'offline_seconds', 'Pausa entre lives (segundos)', 10, 600, 5)
  obs.obs_properties_add_button(props, 'test', 'Testar reinício agora (interrompe a transmissão)', function()
    if not enabled then log('Ative o script antes de testar.'); return false end
    if phase ~= 'live' then log('Teste disponível apenas durante uma transmissão ativa.'); return false end
    stop_for_restart()
    return false
  end)
  return props
end

function script_update(settings)
  local next_enabled = obs.obs_data_get_bool(settings, 'enabled')
  offline_seconds = math.max(10, math.min(600, obs.obs_data_get_int(settings, 'offline_seconds')))
  if next_enabled ~= enabled or phase == 'failed' then
    enabled = next_enabled
    set_phase(enabled and obs.obs_frontend_streaming_active() and 'live' or 'idle')
    log(enabled and 'Automação ativada.' or 'Automação desativada; reinício pendente cancelado.')
  end
end

function script_load(settings)
  script_update(settings)
  obs.obs_frontend_add_event_callback(live_reset_event)
  obs.timer_add(live_reset_tick, 1000)
end

function script_unload()
  enabled = false
  set_phase('idle')
  obs.timer_remove(live_reset_tick)
  obs.obs_frontend_remove_event_callback(live_reset_event)
end
