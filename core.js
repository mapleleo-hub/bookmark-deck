/*
 * 插件内核。
 *
 * 目标不是做成 VS Code 那种能动态安装扩展的运行时（MV3 禁止远程代码，所有插件必须随包分发），
 * 而是让功能之间只通过这个内核打交道：注册、事件、命令、挂载点。
 *
 * 约定：
 *   - 插件是一个对象：{ id, requires?, init(host) }
 *   - requires 是插件 id 数组，start() 会先初始化依赖
 *   - 插件不直接读写别人的内部状态，只通过 host 提供的能力与事件
 *   - 内核不碰 DOM，只负责顺序与解耦
 */
(function () {
  'use strict';

  var registry = new Map();
  var started = new Set();
  var listeners = new Map();
  var commands = new Map();
  var order = [];

  var host = {
    // 由 app.js 在启动时填入：state、store、bookmarks 读写、渲染、提示等
  };

  function on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, []);
    listeners.get(evt).push(fn);
    return function off() {
      var list = listeners.get(evt) || [];
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  function emit(evt, payload) {
    var list = listeners.get(evt) || [];
    list.slice().forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {
        console.error('[deck] plugin error in "' + evt + '":', e);
      }
    });
  }

  function register(plugin) {
    if (!plugin || !plugin.id) throw new Error('plugin needs an id');
    if (registry.has(plugin.id)) throw new Error('duplicate plugin: ' + plugin.id);
    registry.set(plugin.id, plugin);
    order.push(plugin.id);
    return plugin;
  }

  function initOne(id) {
    if (started.has(id)) return;
    var plugin = registry.get(id);
    if (!plugin) throw new Error('plugin not registered: ' + id);
    (plugin.requires || []).forEach(function (dep) {
      if (!registry.has(dep)) throw new Error('plugin "' + id + '" requires missing "' + dep + '"');
      initOne(dep);
    });
    started.add(id);
    if (typeof plugin.init === 'function') plugin.init(host);
  }

  function start() {
    order.forEach(initOne);
    emit('core:ready', { plugins: order.slice() });
  }

  function command(name, fn) {
    commands.set(name, fn);
  }

  function run(name) {
    var fn = commands.get(name);
    if (!fn) {
      console.warn('[deck] unknown command:', name);
      return undefined;
    }
    var args = Array.prototype.slice.call(arguments, 1);
    return fn.apply(null, args);
  }

  window.Deck = {
    version: '0.3.0',
    register: register,
    start: start,
    on: on,
    emit: emit,
    command: command,
    run: run,
    host: host,
    plugins: function () { return order.slice(); }
  };
})();
