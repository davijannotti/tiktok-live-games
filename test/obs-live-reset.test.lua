local clock, active, starts, stops = 0, false, 0, 0
local logs, buttons = {}, {}
obslua = {
  LOG_INFO=1, LOG_WARNING=2,
  OBS_FRONTEND_EVENT_STREAMING_STARTED=10, OBS_FRONTEND_EVENT_STREAMING_STOPPING=11,
  OBS_FRONTEND_EVENT_STREAMING_STOPPED=12, OBS_FRONTEND_EVENT_SCRIPTING_SHUTDOWN=13,
  OBS_FRONTEND_EVENT_EXIT=14, OBS_FRONTEND_EVENT_PROFILE_CHANGING=15,
  OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING=16,
  os_gettime_ns=function() return clock * 1000000000 end,
  script_log=function(_,message) table.insert(logs,message) end,
  obs_frontend_streaming_active=function() return active end,
  obs_frontend_streaming_stop=function() stops=stops+1 end,
  obs_frontend_streaming_start=function() starts=starts+1 end,
  obs_data_get_bool=function(settings,key) return settings[key] end,
  obs_data_get_int=function(settings,key) return settings[key] end,
  obs_data_set_default_bool=function(settings,key,value) settings[key]=value end,
  obs_data_set_default_int=function(settings,key,value) settings[key]=value end,
  obs_properties_create=function() return {} end,
  obs_properties_add_bool=function() end, obs_properties_add_int=function() end,
  obs_properties_add_button=function(_,key,_,callback) buttons[key]=callback end,
  obs_frontend_add_event_callback=function() end, obs_frontend_remove_event_callback=function() end,
  timer_add=function() end, timer_remove=function() end,
}
dofile('scripts/obs/restart-live.lua')
local settings={}
script_defaults(settings)
assert(settings.enabled == false and settings.offline_seconds == 30)
script_load(settings)
script_properties()
active=true
clock=1200; live_reset_tick(); assert(stops==0)
settings.enabled=true; script_update(settings)
clock=2399; live_reset_tick(); assert(stops==0)
clock=2400; live_reset_tick(); assert(stops==1)
clock=2405; live_reset_tick(); assert(starts==0 and stops==1)
active=false; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPED)
clock=2434; live_reset_tick(); assert(starts==0)
clock=2435; live_reset_tick(); assert(starts==1)
active=true; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STARTED)
clock=3634; live_reset_tick(); assert(stops==1)
clock=3635; live_reset_tick(); assert(stops==2)
active=false; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPED)
settings.enabled=false; script_update(settings)
clock=3700; live_reset_tick(); assert(starts==1)
settings.enabled=true; script_update(settings)
active=true; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STARTED)
live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPING)
active=false; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPED)
clock=6000; live_reset_tick(); assert(starts==1)
active=true; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STARTED)
buttons.test(); assert(stops==3)
clock=6030; live_reset_tick()
active=false; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPED)
clock=6100; live_reset_tick(); assert(starts==1)
settings.enabled=false; script_update(settings)
settings.enabled=true; script_update(settings)
active=true; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STARTED)
buttons.test(); active=false; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPED)
clock=6130; live_reset_tick(); assert(starts==2)
clock=6160; live_reset_tick()
clock=7000; live_reset_tick(); assert(starts==2)
settings.enabled=false; script_update(settings)
settings.enabled=true; script_update(settings)
active=true; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STARTED)
buttons.test(); active=false; live_reset_event(obslua.OBS_FRONTEND_EVENT_STREAMING_STOPPED)
script_unload()
clock=8000; live_reset_tick(); assert(starts==2)
print('OBS restart checks passed: timing, full-stop wait, manual stop, disable, timeouts, unload.')
