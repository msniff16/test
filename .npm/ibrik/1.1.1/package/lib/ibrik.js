// Generated by CoffeeScript 2.0.0-beta9-dev
void function () {
  var istanbul, key, value;
  istanbul = require('istanbul');
  for (key in istanbul) {
    if (!isOwn$(istanbul, key))
      continue;
    value = istanbul[key];
    exports[key] = value;
  }
  exports.Instrumenter = require('./instrumenter');
  exports.hook = require('./hook');
  exports.version = require('../package.json').version;
  function isOwn$(o, p) {
    return {}.hasOwnProperty.call(o, p);
  }
}.call(this);
