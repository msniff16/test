/*
 * monitor.js: Core functionality for the Monitor object.
 *
 * (C) 2010 Nodejitsu Inc.
 * MIT LICENCE
 *
 */

var events = require('events'),
    fs = require('fs'),
    path = require('path'),
    child_process = require('child_process'),
    spawn = child_process.spawn,
    broadway = require('broadway'),
    psTree = require('ps-tree'),
    utile = require('utile'),
    common = require('./common'),
    plugins = require('./plugins');

//
// ### function Monitor (script, options)
// #### @script {string} Location of the target script to run.
// #### @options {Object} Configuration for this instance.
// Creates a new instance of forever with specified `options`.
//
var Monitor = exports.Monitor = function (script, options) {
  //
  // Simple bootstrapper for attaching logger
  // and watch plugins by default. Other plugins
  // can be attached through `monitor.use(plugin, options)`.
  //
  function bootstrap(monitor) {
    plugins.logger.attach.call(monitor, options);
    if (options.watch) {
      plugins.watch.attach.call(monitor, options);
    }
  }

  var self = this;

  //
  // Setup basic configuration options
  //
  options          = options || {};
  this.silent      = options.silent || false;
  this.killTree    = options.killTree !== false;
  this.uid         = options.uid || utile.randomString(4);
  this.pidFile     = options.pidFile;
  this.max         = options.max;
  this.killTTL     = options.killTTL;
  this.killSignal  = options.killSignal || 'SIGKILL';
  this.childExists = false;
  this.checkFile   = options.checkFile !== false;
  this.times       = 0;
  this.warn        = console.error;

  this.logFile     = options.logFile;
  this.outFile     = options.outFile;
  this.errFile     = options.errFile;
  this.append      = options.append;

  //
  // Setup restart timing. These options control how quickly forever restarts
  // a child process as well as when to kill a "spinning" process
  //
  this.minUptime     = typeof options.minUptime !== 'number' ? 0 : options.minUptime;
  this.spinSleepTime = options.spinSleepTime || null;

  //
  // Setup the command to spawn and the options to pass
  // to that command.
  //
  this.command   = options.command || process.execPath;
  this.args      = options.options || [];
  this.spawnWith = options.spawnWith || {};
  this.sourceDir = options.sourceDir;
  this.fork      = options.fork || false;
  this.cwd       = options.cwd || process.cwd();
  this.hideEnv   = options.hideEnv || [];
  this._env      = options.env || {};
  this._hideEnv  = {};

  //
  // Allow for custom stdio configuration of forked processes
  //
  this.stdio = options.stdio || null;

  //
  // Setup watch configuration options
  //
  this.watchIgnoreDotFiles = options.watchIgnoreDotFiles !== false;
  this.watchIgnorePatterns = options.watchIgnorePatterns || [];
  this.watchDirectory      = options.watchDirectory || this.sourceDir;

  //
  // Create a simple mapping of `this.hideEnv` to an easily indexable
  // object
  //
  this.hideEnv.forEach(function (key) {
    self._hideEnv[key] = true;
  });

  if (Array.isArray(script)) {
    this.command = script[0];
    this.args = script.slice(1);
  }
  else {
    this.args.unshift(script);
  }

  if (this.sourceDir) {
    this.args[0] = path.join(this.sourceDir, this.args[0]);
  }

  //
  // Bootstrap this instance now that options
  // have been set
  //
  broadway.App.call(this, { bootstrapper: { bootstrap: bootstrap } });
};

// Inherit from events.EventEmitter
utile.inherits(Monitor, broadway.App);

//
// ### function start ([restart])
// #### @restart {boolean} Value indicating whether this is a restart.
// Start the process that this instance is configured for
//
Monitor.prototype.start = function (restart) {
  var self = this,
      child;

  if (this.running && !restart) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot start process that is already running.'));
    });
    return this;
  }

  child = this.trySpawn();
  if (!child) {
    process.nextTick(function () {
      self.emit('error', new Error('Target script does not exist: ' + self.args[0]));
    });
    return this;
  }

  this.ctime = Date.now();
  this.child = child;
  this.running = true;
  process.nextTick(function () {
    self.emit(restart ? 'restart' : 'start', self, self.data);
  });

  function onMessage(msg) {
    self.emit('message', msg);
  }

  // Re-emit messages from the child process
  this.child.on('message', onMessage);

  child.on('exit', function (code, signal) {
    var spinning = Date.now() - self.ctime < self.minUptime;
    child.removeListener('message', onMessage);
    self.emit('exit:code', code, signal);

    function letChildDie() {
      self.running = false;
      self.forceStop = false;
      self.emit('exit', self, spinning);
    }

    function restartChild() {
      self.forceRestart = false;
      process.nextTick(function () {
        self.start(true);
      });
    }

    self.times++;

    if (self.forceStop || (self.times >= self.max && !self.forceRestart)
      || (spinning && typeof self.spinSleepTime !== 'number') && !self.forceRestart) {
      letChildDie();
    }
    else if (spinning) {
      setTimeout(restartChild, self.spinSleepTime);
    }
    else {
      restartChild();
    }
  });

  return this;
};

//
// ### function trySpawn()
// Tries to spawn the target Forever child process. Depending on
// configuration, it checks the first argument of the options
// to see if the file exists. This is useful is you are
// trying to execute a script with an env: e.g. node myfile.js
//
Monitor.prototype.trySpawn = function () {
  var command, cmdarr, stats, args;

  if (/[^\w]node$/.test(this.command) && this.checkFile && !this.childExists) {
    try {
      stats = fs.statSync(this.args[0]);
      this.childExists = true;
    }
    catch (ex) {
      return false;
    }
  }

  this.spawnWith.cwd = this.cwd || this.spawnWith.cwd;
  this.spawnWith.env = this._getEnv();

  if (this.stdio) {
    this.spawnWith.stdio = this.stdio;
  }

  cmdarr  = this.command.trim().split(/\s+/);
  command = this.command;
  args    = this.args;

  if (cmdarr.length > 1) {
    command = cmdarr[0];
    args = cmdarr.slice(1).concat(this.args);
  }

  if (this.fork) {
    if (!this.stdio) {
      this.spawnWith.stdio = [ 'pipe', 'pipe', 'pipe', 'ipc' ];
    }
    return spawn(command, args, this.spawnWith);
  }

  return spawn(command, args, this.spawnWith);
};

//
// ### @data {Object}
// Responds with the appropriate information about
// this `Monitor` instance and it's associated child process.
//
Monitor.prototype.__defineGetter__('data', function () {
  var self = this,
      childData;

  childData = {
    ctime: this.ctime,
    command: this.command,
    file: this.args[0],
    foreverPid: process.pid,
    logFile: this.logFile,
    options: this.args.slice(1),
    pid: this.child ? this.child.pid : undefined,
    silent: this.silent,
    uid: this.uid,
    spawnWith: this.spawnWith,
    running: this.running
  };

  ['pidFile', 'outFile', 'errFile', 'env', 'cwd'].forEach(function (key) {
    if (self[key]) {
      childData[key] = self[key];
    }
  });

  if (this.sourceDir) {
    childData.sourceDir = this.sourceDir;
    childData.file = childData.file.replace(this.sourceDir + '/', '');
  }

  this.childData = childData;
  return this.childData;

  //
  // Setup the forever process to listen to
  // SIGINT and SIGTERM events so that we can
  // clean up the *.pid file
  //
  // Remark: This should work, but the fd gets screwed up
  //         with the daemon process.
  //
  // process.on('SIGINT', function () {
  //   process.exit(0);
  // });
  //
  // process.on('SIGTERM', function () {
  //   process.exit(0);
  // });
  // process.on('exit', function () {
  //   fs.unlinkSync(childPath);
  // });
});

//
// ### function restart ()
// Restarts the target script associated with this instance.
//
Monitor.prototype.restart = function () {
  this.forceRestart = true;
  this.times = 0;
  return this.kill(false);
};

//
// ### function stop ()
// Stops the target script associated with this instance. Prevents it from auto-respawning
//
Monitor.prototype.stop = function () {
  return this.kill(true);
};

//
// ### function kill (forceStop)
// #### @forceStop {boolean} Value indicating whether short circuit forever auto-restart.
// Kills the ChildProcess object associated with this instance.
//
Monitor.prototype.kill = function (forceStop) {
  var child = this.child,
      self = this,
      toKill,
      timer;

  if (!child || (!this.running && !this.forceRestart)) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot stop process that is not running.'));
    });
  }
  else {
    //
    // Set an instance variable here to indicate this
    // stoppage is forced so that when `child.on('exit', ..)`
    // fires in `Monitor.prototype.start` we can short circuit
    // and prevent auto-restart
    //
    toKill = [this.child.pid];
    if (forceStop) {
      this.forceStop = true;
      //
      // If we have a time before we truly kill forcefully, set up a timer
      //
      if (this.killTTL) {
        timer = setTimeout(function () {
          toKill.forEach(function (pid) {
            try {
              process.kill(pid, 'SIGKILL');
            }
            catch (e) {
              //conditions for races may exist, this is most likely an ESRCH
              //these should be ignored, and then we should emit that it is dead
            }
          });

          self.emit('stop', this.childData);
        }, this.killTTL);

        child.on('exit', function () {
          clearTimeout(timer);
        });
      }
    }

    common.kill(this.child.pid, this.killTree, this.killSignal, function () {
      self.emit('stop', self.childData);
      if (self.forceRestart && !self.running) {
        self.start(true);
      }
    });
  }

  return this;
};

//
// ### function send ()
// Sends a message to a forked ChildProcess object associated with this instance.
// see http://nodejs.org/api/child_process.html#child_process_child_send_message_sendhandle
//
Monitor.prototype.send = function (msg) {
  var child = this.child,
      self = this;

  if (!child || !this.running) {
    process.nextTick(function () {
      self.emit('error', new Error('Cannot send to process that is not running.'));
    });
  }

  if (child.send) { child.send(msg) }
};

//
// ### function toString ()
// Override default toString behavior and just respond
// with JSON for this instance.
//
Monitor.prototype.toString = function () {
  return JSON.stringify(this);
};

//
// ### function inspect ()
// Set this to null so that `util.inspect` does not
// return `undefined`.'
//
Monitor.prototype.inspect = null;

//
// ### @private function _getEnv ()
// Returns the environment variables that should be passed along
// to the target process spawned by this instance.
//
Monitor.prototype._getEnv = function () {
  var self = this,
      merged = {};

  function addKey(key, source) {
    merged[key] = source[key];
  }

  //
  // Mixin the key:value pairs from `process.env` and the custom
  // environment variables in `this._env`.
  //
  Object.keys(process.env).forEach(function (key) {
    if (!self._hideEnv[key]) {
      addKey(key, process.env);
    }
  });

  Object.keys(this._env).forEach(function (key) {
    addKey(key, self._env);
  });

  return merged;
};
