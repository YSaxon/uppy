(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = dragDrop

var flatten = require('flatten')
var parallel = require('run-parallel')

function dragDrop (elem, listeners) {
  if (typeof elem === 'string') {
    var selector = elem
    elem = window.document.querySelector(elem)
    if (!elem) {
      throw new Error('"' + selector + '" does not match any HTML elements')
    }
  }

  if (!elem) {
    throw new Error('"' + elem + '" is not a valid HTML element')
  }

  if (typeof listeners === 'function') {
    listeners = { onDrop: listeners }
  }

  var timeout

  elem.addEventListener('dragenter', onDragEnter, false)
  elem.addEventListener('dragover', onDragOver, false)
  elem.addEventListener('dragleave', onDragLeave, false)
  elem.addEventListener('drop', onDrop, false)

  // Function to remove drag-drop listeners
  return function remove () {
    removeDragClass()
    elem.removeEventListener('dragenter', onDragEnter, false)
    elem.removeEventListener('dragover', onDragOver, false)
    elem.removeEventListener('dragleave', onDragLeave, false)
    elem.removeEventListener('drop', onDrop, false)
  }

  function onDragEnter (e) {
    if (listeners.onDragEnter) {
      listeners.onDragEnter(e)
    }

    // Prevent event
    e.stopPropagation()
    e.preventDefault()
    return false
  }

  function onDragOver (e) {
    e.stopPropagation()
    e.preventDefault()
    if (e.dataTransfer.items) {
      // Only add "drag" class when `items` contains items that are able to be
      // handled by the registered listeners (files vs. text)
      var items = toArray(e.dataTransfer.items)
      var fileItems = items.filter(function (item) { return item.kind === 'file' })
      var textItems = items.filter(function (item) { return item.kind === 'string' })

      if (fileItems.length === 0 && !listeners.onDropText) return
      if (textItems.length === 0 && !listeners.onDrop) return
      if (fileItems.length === 0 && textItems.length === 0) return
    }

    elem.classList.add('drag')
    clearTimeout(timeout)

    if (listeners.onDragOver) {
      listeners.onDragOver(e)
    }

    e.dataTransfer.dropEffect = 'copy'
    return false
  }

  function onDragLeave (e) {
    e.stopPropagation()
    e.preventDefault()

    if (listeners.onDragLeave) {
      listeners.onDragLeave(e)
    }

    clearTimeout(timeout)
    timeout = setTimeout(removeDragClass, 50)

    return false
  }

  function onDrop (e) {
    e.stopPropagation()
    e.preventDefault()

    if (listeners.onDragLeave) {
      listeners.onDragLeave(e)
    }

    clearTimeout(timeout)
    removeDragClass()

    var pos = {
      x: e.clientX,
      y: e.clientY
    }

    // text drop support
    var text = e.dataTransfer.getData('text')
    if (text && listeners.onDropText) {
      listeners.onDropText(text, pos)
    }

    // file drop support
    if (e.dataTransfer.items) {
      // Handle directories in Chrome using the proprietary FileSystem API
      var items = toArray(e.dataTransfer.items).filter(function (item) {
        return item.kind === 'file'
      })

      if (items.length === 0) return

      parallel(items.map(function (item) {
        return function (cb) {
          processEntry(item.webkitGetAsEntry(), cb)
        }
      }), function (err, results) {
        // This catches permission errors with file:// in Chrome. This should never
        // throw in production code, so the user does not need to use try-catch.
        if (err) throw err
        if (listeners.onDrop) {
          listeners.onDrop(flatten(results), pos)
        }
      })
    } else {
      var files = toArray(e.dataTransfer.files)

      if (files.length === 0) return

      files.forEach(function (file) {
        file.fullPath = '/' + file.name
      })

      if (listeners.onDrop) {
        listeners.onDrop(files, pos)
      }
    }

    return false
  }

  function removeDragClass () {
    elem.classList.remove('drag')
  }
}

function processEntry (entry, cb) {
  var entries = []

  if (entry.isFile) {
    entry.file(function (file) {
      file.fullPath = entry.fullPath  // preserve pathing for consumer
      cb(null, file)
    }, function (err) {
      cb(err)
    })
  } else if (entry.isDirectory) {
    var reader = entry.createReader()
    readEntries()
  }

  function readEntries () {
    reader.readEntries(function (entries_) {
      if (entries_.length > 0) {
        entries = entries.concat(toArray(entries_))
        readEntries() // continue reading entries until `readEntries` returns no more
      } else {
        doneEntries()
      }
    })
  }

  function doneEntries () {
    parallel(entries.map(function (entry) {
      return function (cb) {
        processEntry(entry, cb)
      }
    }), cb)
  }
}

function toArray (list) {
  return Array.prototype.slice.call(list || [], 0)
}

},{"flatten":2,"run-parallel":3}],2:[function(require,module,exports){
module.exports = function flatten(list, depth) {
  depth = (typeof depth == 'number') ? depth : Infinity;

  if (!depth) {
    if (Array.isArray(list)) {
      return list.map(function(i) { return i; });
    }
    return list;
  }

  return _flatten(list, 1);

  function _flatten(list, d) {
    return list.reduce(function (acc, item) {
      if (Array.isArray(item) && d < depth) {
        return acc.concat(_flatten(item, d + 1));
      }
      else {
        return acc.concat(item);
      }
    }, []);
  }
};

},{}],3:[function(require,module,exports){
(function (process){
module.exports = function (tasks, cb) {
  var results, pending, keys
  var isSync = true

  if (Array.isArray(tasks)) {
    results = []
    pending = tasks.length
  } else {
    keys = Object.keys(tasks)
    results = {}
    pending = keys.length
  }

  function done (err) {
    function end () {
      if (cb) cb(err, results)
      cb = null
    }
    if (isSync) process.nextTick(end)
    else end()
  }

  function each (i, err, result) {
    results[i] = result
    if (--pending === 0 || err) {
      done(err)
    }
  }

  if (!pending) {
    // empty
    done(null)
  } else if (keys) {
    // object
    keys.forEach(function (key) {
      tasks[key](function (err, result) { each(key, err, result) })
    })
  } else {
    // array
    tasks.forEach(function (task, i) {
      task(function (err, result) { each(i, err, result) })
    })
  }

  isSync = false
}

}).call(this,require('_process'))

},{"_process":77}],4:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   3.2.1
 */

(function() {
    "use strict";
    function lib$es6$promise$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function lib$es6$promise$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function lib$es6$promise$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var lib$es6$promise$utils$$_isArray;
    if (!Array.isArray) {
      lib$es6$promise$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      lib$es6$promise$utils$$_isArray = Array.isArray;
    }

    var lib$es6$promise$utils$$isArray = lib$es6$promise$utils$$_isArray;
    var lib$es6$promise$asap$$len = 0;
    var lib$es6$promise$asap$$vertxNext;
    var lib$es6$promise$asap$$customSchedulerFn;

    var lib$es6$promise$asap$$asap = function asap(callback, arg) {
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len] = callback;
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len + 1] = arg;
      lib$es6$promise$asap$$len += 2;
      if (lib$es6$promise$asap$$len === 2) {
        // If len is 2, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        if (lib$es6$promise$asap$$customSchedulerFn) {
          lib$es6$promise$asap$$customSchedulerFn(lib$es6$promise$asap$$flush);
        } else {
          lib$es6$promise$asap$$scheduleFlush();
        }
      }
    }

    function lib$es6$promise$asap$$setScheduler(scheduleFn) {
      lib$es6$promise$asap$$customSchedulerFn = scheduleFn;
    }

    function lib$es6$promise$asap$$setAsap(asapFn) {
      lib$es6$promise$asap$$asap = asapFn;
    }

    var lib$es6$promise$asap$$browserWindow = (typeof window !== 'undefined') ? window : undefined;
    var lib$es6$promise$asap$$browserGlobal = lib$es6$promise$asap$$browserWindow || {};
    var lib$es6$promise$asap$$BrowserMutationObserver = lib$es6$promise$asap$$browserGlobal.MutationObserver || lib$es6$promise$asap$$browserGlobal.WebKitMutationObserver;
    var lib$es6$promise$asap$$isNode = typeof self === 'undefined' && typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

    // test for web worker but not in IE10
    var lib$es6$promise$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function lib$es6$promise$asap$$useNextTick() {
      // node version 0.10.x displays a deprecation warning when nextTick is used recursively
      // see https://github.com/cujojs/when/issues/410 for details
      return function() {
        process.nextTick(lib$es6$promise$asap$$flush);
      };
    }

    // vertx
    function lib$es6$promise$asap$$useVertxTimer() {
      return function() {
        lib$es6$promise$asap$$vertxNext(lib$es6$promise$asap$$flush);
      };
    }

    function lib$es6$promise$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new lib$es6$promise$asap$$BrowserMutationObserver(lib$es6$promise$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function lib$es6$promise$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = lib$es6$promise$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function lib$es6$promise$asap$$useSetTimeout() {
      return function() {
        setTimeout(lib$es6$promise$asap$$flush, 1);
      };
    }

    var lib$es6$promise$asap$$queue = new Array(1000);
    function lib$es6$promise$asap$$flush() {
      for (var i = 0; i < lib$es6$promise$asap$$len; i+=2) {
        var callback = lib$es6$promise$asap$$queue[i];
        var arg = lib$es6$promise$asap$$queue[i+1];

        callback(arg);

        lib$es6$promise$asap$$queue[i] = undefined;
        lib$es6$promise$asap$$queue[i+1] = undefined;
      }

      lib$es6$promise$asap$$len = 0;
    }

    function lib$es6$promise$asap$$attemptVertx() {
      try {
        var r = require;
        var vertx = r('vertx');
        lib$es6$promise$asap$$vertxNext = vertx.runOnLoop || vertx.runOnContext;
        return lib$es6$promise$asap$$useVertxTimer();
      } catch(e) {
        return lib$es6$promise$asap$$useSetTimeout();
      }
    }

    var lib$es6$promise$asap$$scheduleFlush;
    // Decide what async method to use to triggering processing of queued callbacks:
    if (lib$es6$promise$asap$$isNode) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useNextTick();
    } else if (lib$es6$promise$asap$$BrowserMutationObserver) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMutationObserver();
    } else if (lib$es6$promise$asap$$isWorker) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMessageChannel();
    } else if (lib$es6$promise$asap$$browserWindow === undefined && typeof require === 'function') {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$attemptVertx();
    } else {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useSetTimeout();
    }
    function lib$es6$promise$then$$then(onFulfillment, onRejection) {
      var parent = this;

      var child = new this.constructor(lib$es6$promise$$internal$$noop);

      if (child[lib$es6$promise$$internal$$PROMISE_ID] === undefined) {
        lib$es6$promise$$internal$$makePromise(child);
      }

      var state = parent._state;

      if (state) {
        var callback = arguments[state - 1];
        lib$es6$promise$asap$$asap(function(){
          lib$es6$promise$$internal$$invokeCallback(state, child, callback, parent._result);
        });
      } else {
        lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection);
      }

      return child;
    }
    var lib$es6$promise$then$$default = lib$es6$promise$then$$then;
    function lib$es6$promise$promise$resolve$$resolve(object) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$resolve(promise, object);
      return promise;
    }
    var lib$es6$promise$promise$resolve$$default = lib$es6$promise$promise$resolve$$resolve;
    var lib$es6$promise$$internal$$PROMISE_ID = Math.random().toString(36).substring(16);

    function lib$es6$promise$$internal$$noop() {}

    var lib$es6$promise$$internal$$PENDING   = void 0;
    var lib$es6$promise$$internal$$FULFILLED = 1;
    var lib$es6$promise$$internal$$REJECTED  = 2;

    var lib$es6$promise$$internal$$GET_THEN_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$selfFulfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function lib$es6$promise$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.');
    }

    function lib$es6$promise$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        lib$es6$promise$$internal$$GET_THEN_ERROR.error = error;
        return lib$es6$promise$$internal$$GET_THEN_ERROR;
      }
    }

    function lib$es6$promise$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function lib$es6$promise$$internal$$handleForeignThenable(promise, thenable, then) {
       lib$es6$promise$asap$$asap(function(promise) {
        var sealed = false;
        var error = lib$es6$promise$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            lib$es6$promise$$internal$$resolve(promise, value);
          } else {
            lib$es6$promise$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          lib$es6$promise$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          lib$es6$promise$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function lib$es6$promise$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, thenable._result);
      } else if (thenable._state === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, thenable._result);
      } else {
        lib$es6$promise$$internal$$subscribe(thenable, undefined, function(value) {
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      }
    }

    function lib$es6$promise$$internal$$handleMaybeThenable(promise, maybeThenable, then) {
      if (maybeThenable.constructor === promise.constructor &&
          then === lib$es6$promise$then$$default &&
          constructor.resolve === lib$es6$promise$promise$resolve$$default) {
        lib$es6$promise$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        if (then === lib$es6$promise$$internal$$GET_THEN_ERROR) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        } else if (lib$es6$promise$utils$$isFunction(then)) {
          lib$es6$promise$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function lib$es6$promise$$internal$$resolve(promise, value) {
      if (promise === value) {
        lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$selfFulfillment());
      } else if (lib$es6$promise$utils$$objectOrFunction(value)) {
        lib$es6$promise$$internal$$handleMaybeThenable(promise, value, lib$es6$promise$$internal$$getThen(value));
      } else {
        lib$es6$promise$$internal$$fulfill(promise, value);
      }
    }

    function lib$es6$promise$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      lib$es6$promise$$internal$$publish(promise);
    }

    function lib$es6$promise$$internal$$fulfill(promise, value) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = lib$es6$promise$$internal$$FULFILLED;

      if (promise._subscribers.length !== 0) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, promise);
      }
    }

    function lib$es6$promise$$internal$$reject(promise, reason) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }
      promise._state = lib$es6$promise$$internal$$REJECTED;
      promise._result = reason;

      lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publishRejection, promise);
    }

    function lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + lib$es6$promise$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + lib$es6$promise$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, parent);
      }
    }

    function lib$es6$promise$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          lib$es6$promise$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function lib$es6$promise$$internal$$ErrorObject() {
      this.error = null;
    }

    var lib$es6$promise$$internal$$TRY_CATCH_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        lib$es6$promise$$internal$$TRY_CATCH_ERROR.error = e;
        return lib$es6$promise$$internal$$TRY_CATCH_ERROR;
      }
    }

    function lib$es6$promise$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = lib$es6$promise$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = lib$es6$promise$$internal$$tryCatch(callback, detail);

        if (value === lib$es6$promise$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== lib$es6$promise$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        lib$es6$promise$$internal$$resolve(promise, value);
      } else if (failed) {
        lib$es6$promise$$internal$$reject(promise, error);
      } else if (settled === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, value);
      } else if (settled === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, value);
      }
    }

    function lib$es6$promise$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      } catch(e) {
        lib$es6$promise$$internal$$reject(promise, e);
      }
    }

    var lib$es6$promise$$internal$$id = 0;
    function lib$es6$promise$$internal$$nextId() {
      return lib$es6$promise$$internal$$id++;
    }

    function lib$es6$promise$$internal$$makePromise(promise) {
      promise[lib$es6$promise$$internal$$PROMISE_ID] = lib$es6$promise$$internal$$id++;
      promise._state = undefined;
      promise._result = undefined;
      promise._subscribers = [];
    }

    function lib$es6$promise$promise$all$$all(entries) {
      return new lib$es6$promise$enumerator$$default(this, entries).promise;
    }
    var lib$es6$promise$promise$all$$default = lib$es6$promise$promise$all$$all;
    function lib$es6$promise$promise$race$$race(entries) {
      /*jshint validthis:true */
      var Constructor = this;

      if (!lib$es6$promise$utils$$isArray(entries)) {
        return new Constructor(function(resolve, reject) {
          reject(new TypeError('You must pass an array to race.'));
        });
      } else {
        return new Constructor(function(resolve, reject) {
          var length = entries.length;
          for (var i = 0; i < length; i++) {
            Constructor.resolve(entries[i]).then(resolve, reject);
          }
        });
      }
    }
    var lib$es6$promise$promise$race$$default = lib$es6$promise$promise$race$$race;
    function lib$es6$promise$promise$reject$$reject(reason) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$reject(promise, reason);
      return promise;
    }
    var lib$es6$promise$promise$reject$$default = lib$es6$promise$promise$reject$$reject;


    function lib$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function lib$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var lib$es6$promise$promise$$default = lib$es6$promise$promise$$Promise;
    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise's eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function lib$es6$promise$promise$$Promise(resolver) {
      this[lib$es6$promise$$internal$$PROMISE_ID] = lib$es6$promise$$internal$$nextId();
      this._result = this._state = undefined;
      this._subscribers = [];

      if (lib$es6$promise$$internal$$noop !== resolver) {
        typeof resolver !== 'function' && lib$es6$promise$promise$$needsResolver();
        this instanceof lib$es6$promise$promise$$Promise ? lib$es6$promise$$internal$$initializePromise(this, resolver) : lib$es6$promise$promise$$needsNew();
      }
    }

    lib$es6$promise$promise$$Promise.all = lib$es6$promise$promise$all$$default;
    lib$es6$promise$promise$$Promise.race = lib$es6$promise$promise$race$$default;
    lib$es6$promise$promise$$Promise.resolve = lib$es6$promise$promise$resolve$$default;
    lib$es6$promise$promise$$Promise.reject = lib$es6$promise$promise$reject$$default;
    lib$es6$promise$promise$$Promise._setScheduler = lib$es6$promise$asap$$setScheduler;
    lib$es6$promise$promise$$Promise._setAsap = lib$es6$promise$asap$$setAsap;
    lib$es6$promise$promise$$Promise._asap = lib$es6$promise$asap$$asap;

    lib$es6$promise$promise$$Promise.prototype = {
      constructor: lib$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: lib$es6$promise$then$$default,

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };
    var lib$es6$promise$enumerator$$default = lib$es6$promise$enumerator$$Enumerator;
    function lib$es6$promise$enumerator$$Enumerator(Constructor, input) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (!this.promise[lib$es6$promise$$internal$$PROMISE_ID]) {
        lib$es6$promise$$internal$$makePromise(this.promise);
      }

      if (lib$es6$promise$utils$$isArray(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._result = new Array(this.length);

        if (this.length === 0) {
          lib$es6$promise$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            lib$es6$promise$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        lib$es6$promise$$internal$$reject(this.promise, lib$es6$promise$enumerator$$validationError());
      }
    }

    function lib$es6$promise$enumerator$$validationError() {
      return new Error('Array Methods must be provided an Array');
    }

    lib$es6$promise$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var input   = this._input;

      for (var i = 0; this._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      var resolve = c.resolve;

      if (resolve === lib$es6$promise$promise$resolve$$default) {
        var then = lib$es6$promise$$internal$$getThen(entry);

        if (then === lib$es6$promise$then$$default &&
            entry._state !== lib$es6$promise$$internal$$PENDING) {
          this._settledAt(entry._state, i, entry._result);
        } else if (typeof then !== 'function') {
          this._remaining--;
          this._result[i] = entry;
        } else if (c === lib$es6$promise$promise$$default) {
          var promise = new c(lib$es6$promise$$internal$$noop);
          lib$es6$promise$$internal$$handleMaybeThenable(promise, entry, then);
          this._willSettleAt(promise, i);
        } else {
          this._willSettleAt(new c(function(resolve) { resolve(entry); }), i);
        }
      } else {
        this._willSettleAt(resolve(entry), i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === lib$es6$promise$$internal$$PENDING) {
        this._remaining--;

        if (state === lib$es6$promise$$internal$$REJECTED) {
          lib$es6$promise$$internal$$reject(promise, value);
        } else {
          this._result[i] = value;
        }
      }

      if (this._remaining === 0) {
        lib$es6$promise$$internal$$fulfill(promise, this._result);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      lib$es6$promise$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt(lib$es6$promise$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt(lib$es6$promise$$internal$$REJECTED, i, reason);
      });
    };
    function lib$es6$promise$polyfill$$polyfill() {
      var local;

      if (typeof global !== 'undefined') {
          local = global;
      } else if (typeof self !== 'undefined') {
          local = self;
      } else {
          try {
              local = Function('return this')();
          } catch (e) {
              throw new Error('polyfill failed because global object is unavailable in this environment');
          }
      }

      var P = local.Promise;

      if (P && Object.prototype.toString.call(P.resolve()) === '[object Promise]' && !P.cast) {
        return;
      }

      local.Promise = lib$es6$promise$promise$$default;
    }
    var lib$es6$promise$polyfill$$default = lib$es6$promise$polyfill$$polyfill;

    var lib$es6$promise$umd$$ES6Promise = {
      'Promise': lib$es6$promise$promise$$default,
      'polyfill': lib$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return lib$es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = lib$es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = lib$es6$promise$umd$$ES6Promise;
    }

    lib$es6$promise$polyfill$$default();
}).call(this);


}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":77}],5:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => Logs the number of milliseconds it took for the deferred invocation.
 */
var now = function() {
  return root.Date.now();
};

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide `options` to indicate whether `func` should be invoked on the
 * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent
 * calls to the debounced function return the result of the last `func`
 * invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var lastArgs,
      lastThis,
      maxWait,
      result,
      timerId,
      lastCallTime,
      lastInvokeTime = 0,
      leading = false,
      maxing = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time) {
    var args = lastArgs,
        thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    lastInvokeTime = time;
    // Start the timer for the trailing edge.
    timerId = setTimeout(timerExpired, wait);
    // Invoke the leading edge.
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime,
        result = wait - timeSinceLastCall;

    return maxing ? nativeMin(result, maxWait - timeSinceLastInvoke) : result;
  }

  function shouldInvoke(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
      (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired() {
    var time = now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer.
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timerId = undefined;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(now());
  }

  function debounced() {
    var time = now(),
        isInvoking = shouldInvoke(time);

    lastArgs = arguments;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide `options` to indicate whether `func`
 * should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the throttled function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=true]
 *  Specify invoking on the leading edge of the timeout.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = throttle;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],6:[function(require,module,exports){
/**
* Create an event emitter with namespaces
* @name createNamespaceEmitter
* @example
* var emitter = require('./index')()
*
* emitter.on('*', function () {
*   console.log('all events emitted', this.event)
* })
*
* emitter.on('example', function () {
*   console.log('example event emitted')
* })
*/
module.exports = function createNamespaceEmitter () {
  var emitter = { _fns: {} }

  /**
  * Emit an event. Optionally namespace the event. Separate the namespace and event with a `:`
  * @name emit
  * @param {String} event – the name of the event, with optional namespace
  * @param {...*} data – data variables that will be passed as arguments to the event listener
  * @example
  * emitter.emit('example')
  * emitter.emit('demo:test')
  * emitter.emit('data', { example: true}, 'a string', 1)
  */
  emitter.emit = function emit (event) {
    var args = [].slice.call(arguments, 1)
    var namespaced = namespaces(event)
    if (this._fns[event]) emitAll(event, this._fns[event], args)
    if (namespaced) emitAll(event, namespaced, args)
  }

  /**
  * Create en event listener.
  * @name on
  * @param {String} event
  * @param {Function} fn
  * @example
  * emitter.on('example', function () {})
  * emitter.on('demo', function () {})
  */
  emitter.on = function on (event, fn) {
    if (typeof fn !== 'function') { throw new Error('callback required') }
    (this._fns[event] = this._fns[event] || []).push(fn)
  }

  /**
  * Create en event listener that fires once.
  * @name once
  * @param {String} event
  * @param {Function} fn
  * @example
  * emitter.once('example', function () {})
  * emitter.once('demo', function () {})
  */
  emitter.once = function once (event, fn) {
    function one () {
      fn.apply(this, arguments)
      emitter.off(event, one)
    }
    this.on(event, one)
  }

  /**
  * Stop listening to an event. Stop all listeners on an event by only passing the event name. Stop a single listener by passing that event handler as a callback.
  * You must be explicit about what will be unsubscribed: `emitter.off('demo')` will unsubscribe an `emitter.on('demo')` listener, 
  * `emitter.off('demo:example')` will unsubscribe an `emitter.on('demo:example')` listener
  * @name off
  * @param {String} event
  * @param {Function} [fn] – the specific handler
  * @example
  * emitter.off('example')
  * emitter.off('demo', function () {})
  */
  emitter.off = function off (event, fn) {
    var keep = []

    if (event && fn) {
      for (var i = 0; i < this._fns.length; i++) {
        if (this._fns[i] !== fn) {
          keep.push(this._fns[i])
        }
      }
    }

    keep.length ? this._fns[event] = keep : delete this._fns[event]
  }

  function namespaces (e) {
    var out = []
    var args = e.split(':')
    var fns = emitter._fns
    Object.keys(fns).forEach(function (key) {
      if (key === '*') out = out.concat(fns[key])
      if (args.length === 2 && args[0] === key) out = out.concat(fns[key])
    })
    return out
  }

  function emitAll (e, fns, args) {
    for (var i = 0; i < fns.length; i++) {
      if (!fns[i]) break
      fns[i].event = e
      fns[i].apply(fns[i], args)
    }
  }

  return emitter
}

},{}],7:[function(require,module,exports){
/* global MutationObserver */
var document = require('global/document')
var window = require('global/window')
var watch = Object.create(null)
var KEY_ID = 'onloadid' + (new Date() % 9e6).toString(36)
var KEY_ATTR = 'data-' + KEY_ID
var INDEX = 0

if (window && window.MutationObserver) {
  var observer = new MutationObserver(function (mutations) {
    if (Object.keys(watch).length < 1) return
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === KEY_ATTR) {
        eachAttr(mutations[i], turnon, turnoff)
        continue
      }
      eachMutation(mutations[i].removedNodes, turnoff)
      eachMutation(mutations[i].addedNodes, turnon)
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [KEY_ATTR]
  })
}

module.exports = function onload (el, on, off, caller) {
  on = on || function () {}
  off = off || function () {}
  el.setAttribute(KEY_ATTR, 'o' + INDEX)
  watch['o' + INDEX] = [on, off, 0, caller || onload.caller]
  INDEX += 1
  return el
}

function turnon (index, el) {
  if (watch[index][0] && watch[index][2] === 0) {
    watch[index][0](el)
    watch[index][2] = 1
  }
}

function turnoff (index, el) {
  if (watch[index][1] && watch[index][2] === 1) {
    watch[index][1](el)
    watch[index][2] = 0
  }
}

function eachAttr (mutation, on, off) {
  var newValue = mutation.target.getAttribute(KEY_ATTR)
  if (sameOrigin(mutation.oldValue, newValue)) {
    watch[newValue] = watch[mutation.oldValue]
    return
  }
  if (watch[mutation.oldValue]) {
    off(mutation.oldValue, mutation.target)
  }
  if (watch[newValue]) {
    on(newValue, mutation.target)
  }
}

function sameOrigin (oldValue, newValue) {
  if (!oldValue || !newValue) return false
  return watch[oldValue][3] === watch[newValue][3]
}

function eachMutation (nodes, fn) {
  var keys = Object.keys(watch)
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].getAttribute && nodes[i].getAttribute(KEY_ATTR)) {
      var onloadid = nodes[i].getAttribute(KEY_ATTR)
      keys.forEach(function (k) {
        if (onloadid === k) {
          fn(k, nodes[i])
        }
      })
    }
    if (nodes[i].childNodes.length > 0) {
      eachMutation(nodes[i].childNodes, fn)
    }
  }
}

},{"global/document":8,"global/window":9}],8:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":76}],9:[function(require,module,exports){
(function (global){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){
module.exports = prettierBytes

function prettierBytes (num) {
  if (typeof num !== 'number' || isNaN(num)) {
    throw new TypeError('Expected a number, got ' + typeof num)
  }

  var neg = num < 0
  var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  if (neg) {
    num = -num
  }

  if (num < 1) {
    return (neg ? '-' : '') + num + ' B'
  }

  var exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1)
  num = Number(num / Math.pow(1000, exponent))
  var unit = units[exponent]

  if (num >= 10 || num % 1 === 0) {
    // Do not show decimals when the number is two-digit, or if the number has no
    // decimal component.
    return (neg ? '-' : '') + num.toFixed(0) + ' ' + unit
  } else {
    return (neg ? '-' : '') + num.toFixed(1) + ' ' + unit
  }
}

},{}],11:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.encode = encode;
/* global: window */

var _window = window;
var btoa = _window.btoa;
function encode(data) {
  return btoa(unescape(encodeURIComponent(data)));
}

var isSupported = exports.isSupported = "btoa" in window;
},{}],12:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.newRequest = newRequest;
exports.resolveUrl = resolveUrl;

var _resolveUrl = require("resolve-url");

var _resolveUrl2 = _interopRequireDefault(_resolveUrl);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function newRequest() {
  return new window.XMLHttpRequest();
} /* global window */


function resolveUrl(origin, link) {
  return (0, _resolveUrl2.default)(origin, link);
}
},{"resolve-url":20}],13:[function(require,module,exports){
// Generated by Babel
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSource = getSource;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var FileSource = function () {
  function FileSource(file) {
    _classCallCheck(this, FileSource);

    this._file = file;
    this.size = file.size;
  }

  _createClass(FileSource, [{
    key: "slice",
    value: function slice(start, end) {
      return this._file.slice(start, end);
    }
  }, {
    key: "close",
    value: function close() {}
  }]);

  return FileSource;
}();

function getSource(input) {
  // Since we emulate the Blob type in our tests (not all target browsers
  // support it), we cannot use `instanceof` for testing whether the input value
  // can be handled. Instead, we simply check is the slice() function and the
  // size property are available.
  if (typeof input.slice === "function" && typeof input.size !== "undefined") {
    return new FileSource(input);
  }

  throw new Error("source object may only be an instance of File or Blob in this environment");
}
},{}],14:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setItem = setItem;
exports.getItem = getItem;
exports.removeItem = removeItem;
/* global window, localStorage */

var hasStorage = false;
try {
  hasStorage = "localStorage" in window;

  // Attempt to store and read entries from the local storage to detect Private
  // Mode on Safari on iOS (see #49)
  var key = "tusSupport";
  localStorage.setItem(key, localStorage.getItem(key));
} catch (e) {
  // If we try to access localStorage inside a sandboxed iframe, a SecurityError
  // is thrown. When in private mode on iOS Safari, a QuotaExceededError is
  // thrown (see #49)
  if (e.code === e.SECURITY_ERR || e.code === e.QUOTA_EXCEEDED_ERR) {
    hasStorage = false;
  } else {
    throw e;
  }
}

var canStoreURLs = exports.canStoreURLs = hasStorage;

function setItem(key, value) {
  if (!hasStorage) return;
  return localStorage.setItem(key, value);
}

function getItem(key) {
  if (!hasStorage) return;
  return localStorage.getItem(key);
}

function removeItem(key) {
  if (!hasStorage) return;
  return localStorage.removeItem(key);
}
},{}],15:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DetailedError = function (_Error) {
  _inherits(DetailedError, _Error);

  function DetailedError(error) {
    var causingErr = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
    var xhr = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

    _classCallCheck(this, DetailedError);

    var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(DetailedError).call(this, error.message));

    _this.originalRequest = xhr;
    _this.causingError = causingErr;

    var message = error.message;
    if (causingErr != null) {
      message += ", caused by " + causingErr.toString();
    }
    if (xhr != null) {
      message += ", originated from request (response code: " + xhr.status + ", response text: " + xhr.responseText + ")";
    }
    _this.message = message;
    return _this;
  }

  return DetailedError;
}(Error);

exports.default = DetailedError;
},{}],16:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = fingerprint;
/**
 * Generate a fingerprint for a file which will be used the store the endpoint
 *
 * @param {File} file
 * @return {String}
 */
function fingerprint(file) {
  return ["tus", file.name, file.type, file.size, file.lastModified].join("-");
}
},{}],17:[function(require,module,exports){
// Generated by Babel
"use strict";

var _upload = require("./upload");

var _upload2 = _interopRequireDefault(_upload);

var _storage = require("./node/storage");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* global window */
var defaultOptions = _upload2.default.defaultOptions;


if (typeof window !== "undefined") {
  // Browser environment using XMLHttpRequest
  var _window = window;
  var XMLHttpRequest = _window.XMLHttpRequest;
  var Blob = _window.Blob;


  var isSupported = XMLHttpRequest && Blob && typeof Blob.prototype.slice === "function";
} else {
  // Node.js environment using http module
  var isSupported = true;
}

// The usage of the commonjs exporting syntax instead of the new ECMAScript
// one is actually inteded and prevents weird behaviour if we are trying to
// import this module in another module using Babel.
module.exports = {
  Upload: _upload2.default,
  isSupported: isSupported,
  canStoreURLs: _storage.canStoreURLs,
  defaultOptions: defaultOptions
};
},{"./node/storage":14,"./upload":18}],18:[function(require,module,exports){
// Generated by Babel
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /* global window */


// We import the files used inside the Node environment which are rewritten
// for browsers using the rules defined in the package.json


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _fingerprint = require("./fingerprint");

var _fingerprint2 = _interopRequireDefault(_fingerprint);

var _error = require("./error");

var _error2 = _interopRequireDefault(_error);

var _extend = require("extend");

var _extend2 = _interopRequireDefault(_extend);

var _request = require("./node/request");

var _source = require("./node/source");

var _base = require("./node/base64");

var Base64 = _interopRequireWildcard(_base);

var _storage = require("./node/storage");

var Storage = _interopRequireWildcard(_storage);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var defaultOptions = {
  endpoint: "",
  fingerprint: _fingerprint2.default,
  resume: true,
  onProgress: null,
  onChunkComplete: null,
  onSuccess: null,
  onError: null,
  headers: {},
  chunkSize: Infinity,
  withCredentials: false,
  uploadUrl: null,
  uploadSize: null,
  overridePatchMethod: false,
  retryDelays: null
};

var Upload = function () {
  function Upload(file, options) {
    _classCallCheck(this, Upload);

    this.options = (0, _extend2.default)(true, {}, defaultOptions, options);

    // The underlying File/Blob object
    this.file = file;

    // The URL against which the file will be uploaded
    this.url = null;

    // The underlying XHR object for the current PATCH request
    this._xhr = null;

    // The fingerpinrt for the current file (set after start())
    this._fingerprint = null;

    // The offset used in the current PATCH request
    this._offset = null;

    // True if the current PATCH request has been aborted
    this._aborted = false;

    // The file's size in bytes
    this._size = null;

    // The Source object which will wrap around the given file and provides us
    // with a unified interface for getting its size and slice chunks from its
    // content allowing us to easily handle Files, Blobs, Buffers and Streams.
    this._source = null;

    // The current count of attempts which have been made. Null indicates none.
    this._retryAttempt = 0;

    // The timeout's ID which is used to delay the next retry
    this._retryTimeout = null;

    // The offset of the remote upload before the latest attempt was started.
    this._offsetBeforeRetry = 0;
  }

  _createClass(Upload, [{
    key: "start",
    value: function start() {
      var _this = this;

      var file = this.file;

      if (!file) {
        this._emitError(new Error("tus: no file or stream to upload provided"));
        return;
      }

      if (!this.options.endpoint) {
        this._emitError(new Error("tus: no endpoint provided"));
        return;
      }

      var source = this._source = (0, _source.getSource)(file, this.options.chunkSize);

      // Firstly, check if the caller has supplied a manual upload size or else
      // we will use the calculated size by the source object.
      if (this.options.uploadSize != null) {
        var size = +this.options.uploadSize;
        if (isNaN(size)) {
          throw new Error("tus: cannot convert `uploadSize` option into a number");
        }

        this._size = size;
      } else {
        var size = source.size;

        // The size property will be null if we cannot calculate the file's size,
        // for example if you handle a stream.
        if (size == null) {
          throw new Error("tus: cannot automatically derive upload's size from input and must be specified manually using the `uploadSize` option");
        }

        this._size = size;
      }

      var retryDelays = this.options.retryDelays;
      if (retryDelays != null) {
        if (Object.prototype.toString.call(retryDelays) !== "[object Array]") {
          throw new Error("tus: the `retryDelays` option must either be an array or null");
        } else {
          (function () {
            var errorCallback = _this.options.onError;
            _this.options.onError = function (err) {
              // Restore the original error callback which may have been set.
              _this.options.onError = errorCallback;

              // We will reset the attempt counter if
              // - we were already able to connect to the server (offset != null) and
              // - we were able to upload a small chunk of data to the server
              var shouldResetDelays = _this._offset != null && _this._offset > _this._offsetBeforeRetry;
              if (shouldResetDelays) {
                _this._retryAttempt = 0;
              }

              var isOnline = true;
              if (typeof window !== "undefined" && "navigator" in window && window.navigator.onLine === false) {
                isOnline = false;
              }

              // We only attempt a retry if
              // - we didn't exceed the maxium number of retries, yet, and
              // - this error was caused by a request or it's response and
              // - the browser does not indicate that we are offline
              var shouldRetry = _this._retryAttempt < retryDelays.length && err.originalRequest != null && isOnline;

              if (!shouldRetry) {
                _this._emitError(err);
                return;
              }

              var delay = retryDelays[_this._retryAttempt++];

              _this._offsetBeforeRetry = _this._offset;
              _this.options.uploadUrl = _this.url;

              _this._retryTimeout = setTimeout(function () {
                _this.start();
              }, delay);
            };
          })();
        }
      }

      // Reset the aborted flag when the upload is started or else the
      // _startUpload will stop before sending a request if the upload has been
      // aborted previously.
      this._aborted = false;

      // A URL has manually been specified, so we try to resume
      if (this.options.uploadUrl != null) {
        this.url = this.options.uploadUrl;
        this._resumeUpload();
        return;
      }

      // Try to find the endpoint for the file in the storage
      if (this.options.resume) {
        this._fingerprint = this.options.fingerprint(file);
        var resumedUrl = Storage.getItem(this._fingerprint);

        if (resumedUrl != null) {
          this.url = resumedUrl;
          this._resumeUpload();
          return;
        }
      }

      // An upload has not started for the file yet, so we start a new one
      this._createUpload();
    }
  }, {
    key: "abort",
    value: function abort() {
      if (this._xhr !== null) {
        this._xhr.abort();
        this._source.close();
        this._aborted = true;
      }

      if (this._retryTimeout != null) {
        clearTimeout(this._retryTimeout);
        this._retryTimeout = null;
      }
    }
  }, {
    key: "_emitXhrError",
    value: function _emitXhrError(xhr, err, causingErr) {
      this._emitError(new _error2.default(err, causingErr, xhr));
    }
  }, {
    key: "_emitError",
    value: function _emitError(err) {
      if (typeof this.options.onError === "function") {
        this.options.onError(err);
      } else {
        throw err;
      }
    }
  }, {
    key: "_emitSuccess",
    value: function _emitSuccess() {
      if (typeof this.options.onSuccess === "function") {
        this.options.onSuccess();
      }
    }

    /**
     * Publishes notification when data has been sent to the server. This
     * data may not have been accepted by the server yet.
     * @param  {number} bytesSent  Number of bytes sent to the server.
     * @param  {number} bytesTotal Total number of bytes to be sent to the server.
     */

  }, {
    key: "_emitProgress",
    value: function _emitProgress(bytesSent, bytesTotal) {
      if (typeof this.options.onProgress === "function") {
        this.options.onProgress(bytesSent, bytesTotal);
      }
    }

    /**
     * Publishes notification when a chunk of data has been sent to the server
     * and accepted by the server.
     * @param  {number} chunkSize  Size of the chunk that was accepted by the
     *                             server.
     * @param  {number} bytesAccepted Total number of bytes that have been
     *                                accepted by the server.
     * @param  {number} bytesTotal Total number of bytes to be sent to the server.
     */

  }, {
    key: "_emitChunkComplete",
    value: function _emitChunkComplete(chunkSize, bytesAccepted, bytesTotal) {
      if (typeof this.options.onChunkComplete === "function") {
        this.options.onChunkComplete(chunkSize, bytesAccepted, bytesTotal);
      }
    }

    /**
     * Set the headers used in the request and the withCredentials property
     * as defined in the options
     *
     * @param {XMLHttpRequest} xhr
     */

  }, {
    key: "_setupXHR",
    value: function _setupXHR(xhr) {
      xhr.setRequestHeader("Tus-Resumable", "1.0.0");
      var headers = this.options.headers;

      for (var name in headers) {
        xhr.setRequestHeader(name, headers[name]);
      }

      xhr.withCredentials = this.options.withCredentials;
    }

    /**
     * Create a new upload using the creation extension by sending a POST
     * request to the endpoint. After successful creation the file will be
     * uploaded
     *
     * @api private
     */

  }, {
    key: "_createUpload",
    value: function _createUpload() {
      var _this2 = this;

      var xhr = (0, _request.newRequest)();
      xhr.open("POST", this.options.endpoint, true);

      xhr.onload = function () {
        if (!(xhr.status >= 200 && xhr.status < 300)) {
          _this2._emitXhrError(xhr, new Error("tus: unexpected response while creating upload"));
          return;
        }

        _this2.url = (0, _request.resolveUrl)(_this2.options.endpoint, xhr.getResponseHeader("Location"));

        if (_this2.options.resume) {
          Storage.setItem(_this2._fingerprint, _this2.url);
        }

        _this2._offset = 0;
        _this2._startUpload();
      };

      xhr.onerror = function (err) {
        _this2._emitXhrError(xhr, new Error("tus: failed to create upload"), err);
      };

      this._setupXHR(xhr);
      xhr.setRequestHeader("Upload-Length", this._size);

      // Add metadata if values have been added
      var metadata = encodeMetadata(this.options.metadata);
      if (metadata !== "") {
        xhr.setRequestHeader("Upload-Metadata", metadata);
      }

      xhr.send(null);
    }

    /*
     * Try to resume an existing upload. First a HEAD request will be sent
     * to retrieve the offset. If the request fails a new upload will be
     * created. In the case of a successful response the file will be uploaded.
     *
     * @api private
     */

  }, {
    key: "_resumeUpload",
    value: function _resumeUpload() {
      var _this3 = this;

      var xhr = (0, _request.newRequest)();
      xhr.open("HEAD", this.url, true);

      xhr.onload = function () {
        if (!(xhr.status >= 200 && xhr.status < 300)) {
          if (_this3.options.resume) {
            // Remove stored fingerprint and corresponding endpoint,
            // since the file can not be found
            Storage.removeItem(_this3._fingerprint);
          }

          // If the upload is locked (indicated by the 423 Locked status code), we
          // emit an error instead of directly starting a new upload. This way the
          // retry logic can catch the error and will retry the upload. An upload
          // is usually locked for a short period of time and will be available
          // afterwards.
          if (xhr.status === 423) {
            _this3._emitXhrError(xhr, new Error("tus: upload is currently locked; retry later"));
            return;
          }

          // Try to create a new upload
          _this3.url = null;
          _this3._createUpload();
          return;
        }

        var offset = parseInt(xhr.getResponseHeader("Upload-Offset"), 10);
        if (isNaN(offset)) {
          _this3._emitXhrError(xhr, new Error("tus: invalid or missing offset value"));
          return;
        }

        var length = parseInt(xhr.getResponseHeader("Upload-Length"), 10);
        if (isNaN(length)) {
          _this3._emitXhrError(xhr, new Error("tus: invalid or missing length value"));
          return;
        }

        // Upload has already been completed and we do not need to send additional
        // data to the server
        if (offset === length) {
          _this3._emitProgress(length, length);
          _this3._emitSuccess();
          return;
        }

        _this3._offset = offset;
        _this3._startUpload();
      };

      xhr.onerror = function (err) {
        _this3._emitXhrError(xhr, new Error("tus: failed to resume upload"), err);
      };

      this._setupXHR(xhr);
      xhr.send(null);
    }

    /**
     * Start uploading the file using PATCH requests. The file will be divided
     * into chunks as specified in the chunkSize option. During the upload
     * the onProgress event handler may be invoked multiple times.
     *
     * @api private
     */

  }, {
    key: "_startUpload",
    value: function _startUpload() {
      var _this4 = this;

      // If the upload has been aborted, we will not send the next PATCH request.
      // This is important if the abort method was called during a callback, such
      // as onChunkComplete or onProgress.
      if (this._aborted) {
        return;
      }

      var xhr = this._xhr = (0, _request.newRequest)();

      // Some browser and servers may not support the PATCH method. For those
      // cases, you can tell tus-js-client to use a POST request with the
      // X-HTTP-Method-Override header for simulating a PATCH request.
      if (this.options.overridePatchMethod) {
        xhr.open("POST", this.url, true);
        xhr.setRequestHeader("X-HTTP-Method-Override", "PATCH");
      } else {
        xhr.open("PATCH", this.url, true);
      }

      xhr.onload = function () {
        if (!(xhr.status >= 200 && xhr.status < 300)) {
          _this4._emitXhrError(xhr, new Error("tus: unexpected response while uploading chunk"));
          return;
        }

        var offset = parseInt(xhr.getResponseHeader("Upload-Offset"), 10);
        if (isNaN(offset)) {
          _this4._emitXhrError(xhr, new Error("tus: invalid or missing offset value"));
          return;
        }

        _this4._emitProgress(offset, _this4._size);
        _this4._emitChunkComplete(offset - _this4._offset, offset, _this4._size);

        _this4._offset = offset;

        if (offset == _this4._size) {
          // Yay, finally done :)
          _this4._emitSuccess();
          _this4._source.close();
          return;
        }

        _this4._startUpload();
      };

      xhr.onerror = function (err) {
        // Don't emit an error if the upload was aborted manually
        if (_this4._aborted) {
          return;
        }

        _this4._emitXhrError(xhr, new Error("tus: failed to upload chunk at offset " + _this4._offset), err);
      };

      // Test support for progress events before attaching an event listener
      if ("upload" in xhr) {
        xhr.upload.onprogress = function (e) {
          if (!e.lengthComputable) {
            return;
          }

          _this4._emitProgress(start + e.loaded, _this4._size);
        };
      }

      this._setupXHR(xhr);

      xhr.setRequestHeader("Upload-Offset", this._offset);
      xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");

      var start = this._offset;
      var end = this._offset + this.options.chunkSize;

      // The specified chunkSize may be Infinity or the calcluated end position
      // may exceed the file's size. In both cases, we limit the end position to
      // the input's total size for simpler calculations and correctness.
      if (end === Infinity || end > this._size) {
        end = this._size;
      }

      xhr.send(this._source.slice(start, end));
    }
  }]);

  return Upload;
}();

function encodeMetadata(metadata) {
  if (!Base64.isSupported) {
    return "";
  }

  var encoded = [];

  for (var key in metadata) {
    encoded.push(key + " " + Base64.encode(metadata[key]));
  }

  return encoded.join(",");
}

Upload.defaultOptions = defaultOptions;

exports.default = Upload;
},{"./error":15,"./fingerprint":16,"./node/base64":11,"./node/request":12,"./node/source":13,"./node/storage":14,"extend":19}],19:[function(require,module,exports){
'use strict';

var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;

var isArray = function isArray(arr) {
	if (typeof Array.isArray === 'function') {
		return Array.isArray(arr);
	}

	return toStr.call(arr) === '[object Array]';
};

var isPlainObject = function isPlainObject(obj) {
	if (!obj || toStr.call(obj) !== '[object Object]') {
		return false;
	}

	var hasOwnConstructor = hasOwn.call(obj, 'constructor');
	var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) { /**/ }

	return typeof key === 'undefined' || hasOwn.call(obj, key);
};

module.exports = function extend() {
	var options, name, src, copy, copyIsArray, clone;
	var target = arguments[0];
	var i = 1;
	var length = arguments.length;
	var deep = false;

	// Handle a deep copy situation
	if (typeof target === 'boolean') {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}
	if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
		target = {};
	}

	for (; i < length; ++i) {
		options = arguments[i];
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target !== copy) {
					// Recurse if we're merging plain objects or arrays
					if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false;
							clone = src && isArray(src) ? src : [];
						} else {
							clone = src && isPlainObject(src) ? src : {};
						}

						// Never move original objects, clone them
						target[name] = extend(deep, clone, copy);

					// Don't bring in undefined values
					} else if (typeof copy !== 'undefined') {
						target[name] = copy;
					}
				}
			}
		}
	}

	// Return the modified object
	return target;
};

},{}],20:[function(require,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.resolveUrl = factory()
  }
}(this, function() {

  function resolveUrl(/* ...urls */) {
    var numUrls = arguments.length

    if (numUrls === 0) {
      throw new Error("resolveUrl requires at least one argument; got none.")
    }

    var base = document.createElement("base")
    base.href = arguments[0]

    if (numUrls === 1) {
      return base.href
    }

    var head = document.getElementsByTagName("head")[0]
    head.insertBefore(base, head.firstChild)

    var a = document.createElement("a")
    var resolved

    for (var index = 1; index < numUrls; index++) {
      a.href = arguments[index]
      resolved = a.href
      base.href = resolved
    }

    head.removeChild(base)

    return resolved
  }

  return resolveUrl

}));

},{}],21:[function(require,module,exports){
(function(self) {
  'use strict';

  if (self.fetch) {
    return
  }

  var support = {
    searchParams: 'URLSearchParams' in self,
    iterable: 'Symbol' in self && 'iterator' in Symbol,
    blob: 'FileReader' in self && 'Blob' in self && (function() {
      try {
        new Blob()
        return true
      } catch(e) {
        return false
      }
    })(),
    formData: 'FormData' in self,
    arrayBuffer: 'ArrayBuffer' in self
  }

  if (support.arrayBuffer) {
    var viewClasses = [
      '[object Int8Array]',
      '[object Uint8Array]',
      '[object Uint8ClampedArray]',
      '[object Int16Array]',
      '[object Uint16Array]',
      '[object Int32Array]',
      '[object Uint32Array]',
      '[object Float32Array]',
      '[object Float64Array]'
    ]

    var isDataView = function(obj) {
      return obj && DataView.prototype.isPrototypeOf(obj)
    }

    var isArrayBufferView = ArrayBuffer.isView || function(obj) {
      return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
    }
  }

  function normalizeName(name) {
    if (typeof name !== 'string') {
      name = String(name)
    }
    if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
      throw new TypeError('Invalid character in header field name')
    }
    return name.toLowerCase()
  }

  function normalizeValue(value) {
    if (typeof value !== 'string') {
      value = String(value)
    }
    return value
  }

  // Build a destructive iterator for the value list
  function iteratorFor(items) {
    var iterator = {
      next: function() {
        var value = items.shift()
        return {done: value === undefined, value: value}
      }
    }

    if (support.iterable) {
      iterator[Symbol.iterator] = function() {
        return iterator
      }
    }

    return iterator
  }

  function Headers(headers) {
    this.map = {}

    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        this.append(name, value)
      }, this)
    } else if (Array.isArray(headers)) {
      headers.forEach(function(header) {
        this.append(header[0], header[1])
      }, this)
    } else if (headers) {
      Object.getOwnPropertyNames(headers).forEach(function(name) {
        this.append(name, headers[name])
      }, this)
    }
  }

  Headers.prototype.append = function(name, value) {
    name = normalizeName(name)
    value = normalizeValue(value)
    var oldValue = this.map[name]
    this.map[name] = oldValue ? oldValue+','+value : value
  }

  Headers.prototype['delete'] = function(name) {
    delete this.map[normalizeName(name)]
  }

  Headers.prototype.get = function(name) {
    name = normalizeName(name)
    return this.has(name) ? this.map[name] : null
  }

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(normalizeName(name))
  }

  Headers.prototype.set = function(name, value) {
    this.map[normalizeName(name)] = normalizeValue(value)
  }

  Headers.prototype.forEach = function(callback, thisArg) {
    for (var name in this.map) {
      if (this.map.hasOwnProperty(name)) {
        callback.call(thisArg, this.map[name], name, this)
      }
    }
  }

  Headers.prototype.keys = function() {
    var items = []
    this.forEach(function(value, name) { items.push(name) })
    return iteratorFor(items)
  }

  Headers.prototype.values = function() {
    var items = []
    this.forEach(function(value) { items.push(value) })
    return iteratorFor(items)
  }

  Headers.prototype.entries = function() {
    var items = []
    this.forEach(function(value, name) { items.push([name, value]) })
    return iteratorFor(items)
  }

  if (support.iterable) {
    Headers.prototype[Symbol.iterator] = Headers.prototype.entries
  }

  function consumed(body) {
    if (body.bodyUsed) {
      return Promise.reject(new TypeError('Already read'))
    }
    body.bodyUsed = true
  }

  function fileReaderReady(reader) {
    return new Promise(function(resolve, reject) {
      reader.onload = function() {
        resolve(reader.result)
      }
      reader.onerror = function() {
        reject(reader.error)
      }
    })
  }

  function readBlobAsArrayBuffer(blob) {
    var reader = new FileReader()
    var promise = fileReaderReady(reader)
    reader.readAsArrayBuffer(blob)
    return promise
  }

  function readBlobAsText(blob) {
    var reader = new FileReader()
    var promise = fileReaderReady(reader)
    reader.readAsText(blob)
    return promise
  }

  function readArrayBufferAsText(buf) {
    var view = new Uint8Array(buf)
    var chars = new Array(view.length)

    for (var i = 0; i < view.length; i++) {
      chars[i] = String.fromCharCode(view[i])
    }
    return chars.join('')
  }

  function bufferClone(buf) {
    if (buf.slice) {
      return buf.slice(0)
    } else {
      var view = new Uint8Array(buf.byteLength)
      view.set(new Uint8Array(buf))
      return view.buffer
    }
  }

  function Body() {
    this.bodyUsed = false

    this._initBody = function(body) {
      this._bodyInit = body
      if (!body) {
        this._bodyText = ''
      } else if (typeof body === 'string') {
        this._bodyText = body
      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
        this._bodyBlob = body
      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
        this._bodyFormData = body
      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
        this._bodyText = body.toString()
      } else if (support.arrayBuffer && support.blob && isDataView(body)) {
        this._bodyArrayBuffer = bufferClone(body.buffer)
        // IE 10-11 can't handle a DataView body.
        this._bodyInit = new Blob([this._bodyArrayBuffer])
      } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
        this._bodyArrayBuffer = bufferClone(body)
      } else {
        throw new Error('unsupported BodyInit type')
      }

      if (!this.headers.get('content-type')) {
        if (typeof body === 'string') {
          this.headers.set('content-type', 'text/plain;charset=UTF-8')
        } else if (this._bodyBlob && this._bodyBlob.type) {
          this.headers.set('content-type', this._bodyBlob.type)
        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
        }
      }
    }

    if (support.blob) {
      this.blob = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return Promise.resolve(this._bodyBlob)
        } else if (this._bodyArrayBuffer) {
          return Promise.resolve(new Blob([this._bodyArrayBuffer]))
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      }

      this.arrayBuffer = function() {
        if (this._bodyArrayBuffer) {
          return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
        } else {
          return this.blob().then(readBlobAsArrayBuffer)
        }
      }
    }

    this.text = function() {
      var rejected = consumed(this)
      if (rejected) {
        return rejected
      }

      if (this._bodyBlob) {
        return readBlobAsText(this._bodyBlob)
      } else if (this._bodyArrayBuffer) {
        return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
      } else if (this._bodyFormData) {
        throw new Error('could not read FormData body as text')
      } else {
        return Promise.resolve(this._bodyText)
      }
    }

    if (support.formData) {
      this.formData = function() {
        return this.text().then(decode)
      }
    }

    this.json = function() {
      return this.text().then(JSON.parse)
    }

    return this
  }

  // HTTP methods whose capitalization should be normalized
  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

  function normalizeMethod(method) {
    var upcased = method.toUpperCase()
    return (methods.indexOf(upcased) > -1) ? upcased : method
  }

  function Request(input, options) {
    options = options || {}
    var body = options.body

    if (input instanceof Request) {
      if (input.bodyUsed) {
        throw new TypeError('Already read')
      }
      this.url = input.url
      this.credentials = input.credentials
      if (!options.headers) {
        this.headers = new Headers(input.headers)
      }
      this.method = input.method
      this.mode = input.mode
      if (!body && input._bodyInit != null) {
        body = input._bodyInit
        input.bodyUsed = true
      }
    } else {
      this.url = String(input)
    }

    this.credentials = options.credentials || this.credentials || 'omit'
    if (options.headers || !this.headers) {
      this.headers = new Headers(options.headers)
    }
    this.method = normalizeMethod(options.method || this.method || 'GET')
    this.mode = options.mode || this.mode || null
    this.referrer = null

    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(body)
  }

  Request.prototype.clone = function() {
    return new Request(this, { body: this._bodyInit })
  }

  function decode(body) {
    var form = new FormData()
    body.trim().split('&').forEach(function(bytes) {
      if (bytes) {
        var split = bytes.split('=')
        var name = split.shift().replace(/\+/g, ' ')
        var value = split.join('=').replace(/\+/g, ' ')
        form.append(decodeURIComponent(name), decodeURIComponent(value))
      }
    })
    return form
  }

  function parseHeaders(rawHeaders) {
    var headers = new Headers()
    rawHeaders.split(/\r?\n/).forEach(function(line) {
      var parts = line.split(':')
      var key = parts.shift().trim()
      if (key) {
        var value = parts.join(':').trim()
        headers.append(key, value)
      }
    })
    return headers
  }

  Body.call(Request.prototype)

  function Response(bodyInit, options) {
    if (!options) {
      options = {}
    }

    this.type = 'default'
    this.status = 'status' in options ? options.status : 200
    this.ok = this.status >= 200 && this.status < 300
    this.statusText = 'statusText' in options ? options.statusText : 'OK'
    this.headers = new Headers(options.headers)
    this.url = options.url || ''
    this._initBody(bodyInit)
  }

  Body.call(Response.prototype)

  Response.prototype.clone = function() {
    return new Response(this._bodyInit, {
      status: this.status,
      statusText: this.statusText,
      headers: new Headers(this.headers),
      url: this.url
    })
  }

  Response.error = function() {
    var response = new Response(null, {status: 0, statusText: ''})
    response.type = 'error'
    return response
  }

  var redirectStatuses = [301, 302, 303, 307, 308]

  Response.redirect = function(url, status) {
    if (redirectStatuses.indexOf(status) === -1) {
      throw new RangeError('Invalid status code')
    }

    return new Response(null, {status: status, headers: {location: url}})
  }

  self.Headers = Headers
  self.Request = Request
  self.Response = Response

  self.fetch = function(input, init) {
    return new Promise(function(resolve, reject) {
      var request = new Request(input, init)
      var xhr = new XMLHttpRequest()

      xhr.onload = function() {
        var options = {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseHeaders(xhr.getAllResponseHeaders() || '')
        }
        options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL')
        var body = 'response' in xhr ? xhr.response : xhr.responseText
        resolve(new Response(body, options))
      }

      xhr.onerror = function() {
        reject(new TypeError('Network request failed'))
      }

      xhr.ontimeout = function() {
        reject(new TypeError('Network request failed'))
      }

      xhr.open(request.method, request.url, true)

      if (request.credentials === 'include') {
        xhr.withCredentials = true
      }

      if ('responseType' in xhr && support.blob) {
        xhr.responseType = 'blob'
      }

      request.headers.forEach(function(value, name) {
        xhr.setRequestHeader(name, value)
      })

      xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit)
    })
  }
  self.fetch.polyfill = true
})(typeof self !== 'undefined' ? self : this);

},{}],22:[function(require,module,exports){
var bel = require('bel') // turns template tag into DOM elements
var morphdom = require('morphdom') // efficiently diffs + morphs two DOM elements
var defaultEvents = require('./update-events.js') // default events to be copied when dom elements update

module.exports = bel

// TODO move this + defaultEvents to a new module once we receive more feedback
module.exports.update = function (fromNode, toNode, opts) {
  if (!opts) opts = {}
  if (opts.events !== false) {
    if (!opts.onBeforeElUpdated) opts.onBeforeElUpdated = copier
  }

  return morphdom(fromNode, toNode, opts)

  // morphdom only copies attributes. we decided we also wanted to copy events
  // that can be set via attributes
  function copier (f, t) {
    // copy events:
    var events = opts.events || defaultEvents
    for (var i = 0; i < events.length; i++) {
      var ev = events[i]
      if (t[ev]) { // if new element has a whitelisted attribute
        f[ev] = t[ev] // update existing element
      } else if (f[ev]) { // if existing element has it and new one doesnt
        f[ev] = undefined // remove it from existing element
      }
    }
    var oldValue = f.value
    var newValue = t.value
    // copy values for form elements
    if ((f.nodeName === 'INPUT' && f.type !== 'file') || f.nodeName === 'SELECT') {
      if (!newValue) {
        t.value = f.value
      } else if (newValue !== oldValue) {
        f.value = newValue
      }
    } else if (f.nodeName === 'TEXTAREA') {
      if (t.getAttribute('value') === null) f.value = t.value
    }
  }
}

},{"./update-events.js":28,"bel":23,"morphdom":27}],23:[function(require,module,exports){
var document = require('global/document')
var hyperx = require('hyperx')
var onload = require('on-load')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var BOOL_PROPS = {
  autofocus: 1,
  checked: 1,
  defaultchecked: 1,
  disabled: 1,
  formnovalidate: 1,
  indeterminate: 1,
  readonly: 1,
  required: 1,
  selected: 1,
  willvalidate: 1
}
var COMMENT_TAG = '!--'
var SVG_TAGS = [
  'svg',
  'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
  'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence', 'filter', 'font', 'font-face',
  'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri',
  'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image', 'line',
  'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph', 'mpath',
  'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

function belCreateElement (tag, props, children) {
  var el

  // If an svg tag, it needs a namespace
  if (SVG_TAGS.indexOf(tag) !== -1) {
    props.namespace = SVGNS
  }

  // If we are using a namespace
  var ns = false
  if (props.namespace) {
    ns = props.namespace
    delete props.namespace
  }

  // Create the element
  if (ns) {
    el = document.createElementNS(ns, tag)
  } else if (tag === COMMENT_TAG) {
    return document.createComment(props.comment)
  } else {
    el = document.createElement(tag)
  }

  // If adding onload events
  if (props.onload || props.onunload) {
    var load = props.onload || function () {}
    var unload = props.onunload || function () {}
    onload(el, function belOnload () {
      load(el)
    }, function belOnunload () {
      unload(el)
    },
    // We have to use non-standard `caller` to find who invokes `belCreateElement`
    belCreateElement.caller.caller.caller)
    delete props.onload
    delete props.onunload
  }

  // Create the properties
  for (var p in props) {
    if (props.hasOwnProperty(p)) {
      var key = p.toLowerCase()
      var val = props[p]
      // Normalize className
      if (key === 'classname') {
        key = 'class'
        p = 'class'
      }
      // The for attribute gets transformed to htmlFor, but we just set as for
      if (p === 'htmlFor') {
        p = 'for'
      }
      // If a property is boolean, set itself to the key
      if (BOOL_PROPS[key]) {
        if (val === 'true') val = key
        else if (val === 'false') continue
      }
      // If a property prefers being set directly vs setAttribute
      if (key.slice(0, 2) === 'on') {
        el[p] = val
      } else {
        if (ns) {
          if (p === 'xlink:href') {
            el.setAttributeNS(XLINKNS, p, val)
          } else if (/^xmlns($|:)/i.test(p)) {
            // skip xmlns definitions
          } else {
            el.setAttributeNS(null, p, val)
          }
        } else {
          el.setAttribute(p, val)
        }
      }
    }
  }

  function appendChild (childs) {
    if (!Array.isArray(childs)) return
    for (var i = 0; i < childs.length; i++) {
      var node = childs[i]
      if (Array.isArray(node)) {
        appendChild(node)
        continue
      }

      if (typeof node === 'number' ||
        typeof node === 'boolean' ||
        typeof node === 'function' ||
        node instanceof Date ||
        node instanceof RegExp) {
        node = node.toString()
      }

      if (typeof node === 'string') {
        if (/^[\n\r\s]+$/.test(node)) continue
        if (el.lastChild && el.lastChild.nodeName === '#text') {
          el.lastChild.nodeValue += node
          continue
        }
        node = document.createTextNode(node)
      }

      if (node && node.nodeType) {
        el.appendChild(node)
      }
    }
  }
  appendChild(children)

  return el
}

module.exports = hyperx(belCreateElement, {comments: true})
module.exports.default = module.exports
module.exports.createElement = belCreateElement

},{"global/document":24,"hyperx":25,"on-load":7}],24:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":76}],25:[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12
var COMMENT = 13

module.exports = function (h, opts) {
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }
  if (opts.attrToProp !== false) {
    h = attrToProp(h)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        p.push([ VAR, xstate, arg ])
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else cur[1][key] = concat(cur[1][key], parts[i][1])
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else cur[1][key] = concat(cur[1][key], parts[i][2])
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state) && state !== COMMENT) {
          if (state === OPEN) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === COMMENT && /-$/.test(reg) && c === '-') {
          if (opts.comments) {
            res.push([ATTR_VALUE,reg.substr(0, reg.length - 1)],[CLOSE])
          }
          reg = ''
          state = TEXT
        } else if (state === OPEN && /^!--$/.test(reg)) {
          if (opts.comments) {
            res.push([OPEN, reg],[ATTR_KEY,'comment'],[ATTR_EQ])
          }
          reg = c
          state = COMMENT
        } else if (state === TEXT || state === COMMENT) {
          reg += c
        } else if (state === OPEN && /\s/.test(c)) {
          res.push([OPEN, reg])
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[^\s"'=/]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var hasOwn = Object.prototype.hasOwnProperty
function has (obj, key) { return hasOwn.call(obj, key) }

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr', '!--',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":26}],26:[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],27:[function(require,module,exports){
'use strict';

var range; // Create a range object for efficently rendering strings to elements.
var NS_XHTML = 'http://www.w3.org/1999/xhtml';

var doc = typeof document === 'undefined' ? undefined : document;

var testEl = doc ?
    doc.body || doc.createElement('div') :
    {};

// Fixes <https://github.com/patrick-steele-idem/morphdom/issues/32>
// (IE7+ support) <=IE7 does not support el.hasAttribute(name)
var actualHasAttributeNS;

if (testEl.hasAttributeNS) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttributeNS(namespaceURI, name);
    };
} else if (testEl.hasAttribute) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttribute(name);
    };
} else {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.getAttributeNode(namespaceURI, name) != null;
    };
}

var hasAttributeNS = actualHasAttributeNS;


function toElement(str) {
    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(str);
    } else {
        fragment = doc.createElement('body');
        fragment.innerHTML = str;
    }
    return fragment.childNodes[0];
}

/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */
function compareNodeNames(fromEl, toEl) {
    var fromNodeName = fromEl.nodeName;
    var toNodeName = toEl.nodeName;

    if (fromNodeName === toNodeName) {
        return true;
    }

    if (toEl.actualize &&
        fromNodeName.charCodeAt(0) < 91 && /* from tag name is upper case */
        toNodeName.charCodeAt(0) > 90 /* target tag name is lower case */) {
        // If the target element is a virtual DOM node then we may need to normalize the tag name
        // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
        // are converted to upper case
        return fromNodeName === toNodeName.toUpperCase();
    } else {
        return false;
    }
}

/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */
function createElementNS(name, namespaceURI) {
    return !namespaceURI || namespaceURI === NS_XHTML ?
        doc.createElement(name) :
        doc.createElementNS(namespaceURI, name);
}

/**
 * Copies the children of one DOM element to another DOM element
 */
function moveChildren(fromEl, toEl) {
    var curChild = fromEl.firstChild;
    while (curChild) {
        var nextChild = curChild.nextSibling;
        toEl.appendChild(curChild);
        curChild = nextChild;
    }
    return toEl;
}

function morphAttrs(fromNode, toNode) {
    var attrs = toNode.attributes;
    var i;
    var attr;
    var attrName;
    var attrNamespaceURI;
    var attrValue;
    var fromValue;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        attrName = attr.name;
        attrNamespaceURI = attr.namespaceURI;
        attrValue = attr.value;

        if (attrNamespaceURI) {
            attrName = attr.localName || attrName;
            fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
            }
        } else {
            fromValue = fromNode.getAttribute(attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttribute(attrName, attrValue);
            }
        }
    }

    // Remove any extra attributes found on the original DOM element that
    // weren't found on the target element.
    attrs = fromNode.attributes;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        if (attr.specified !== false) {
            attrName = attr.name;
            attrNamespaceURI = attr.namespaceURI;

            if (attrNamespaceURI) {
                attrName = attr.localName || attrName;

                if (!hasAttributeNS(toNode, attrNamespaceURI, attrName)) {
                    fromNode.removeAttributeNS(attrNamespaceURI, attrName);
                }
            } else {
                if (!hasAttributeNS(toNode, null, attrName)) {
                    fromNode.removeAttribute(attrName);
                }
            }
        }
    }
}

function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

var specialElHandlers = {
    /**
     * Needed for IE. Apparently IE doesn't think that "selected" is an
     * attribute when reading over the attributes using selectEl.attributes
     */
    OPTION: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'selected');
    },
    /**
     * The "value" attribute is special for the <input> element since it sets
     * the initial value. Changing the "value" attribute without changing the
     * "value" property will have no effect since it is only used to the set the
     * initial value.  Similar for the "checked" attribute, and "disabled".
     */
    INPUT: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'checked');
        syncBooleanAttrProp(fromEl, toEl, 'disabled');

        if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!hasAttributeNS(toEl, null, 'value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value !== newValue) {
            fromEl.value = newValue;
        }

        var firstChild = fromEl.firstChild;
        if (firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            var oldValue = firstChild.nodeValue;

            if (oldValue == newValue || (!newValue && oldValue == fromEl.placeholder)) {
                return;
            }

            firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!hasAttributeNS(toEl, null, 'multiple')) {
            var selectedIndex = -1;
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                var nodeName = curChild.nodeName;
                if (nodeName && nodeName.toUpperCase() === 'OPTION') {
                    if (hasAttributeNS(curChild, null, 'selected')) {
                        selectedIndex = i;
                        break;
                    }
                    i++;
                }
                curChild = curChild.nextSibling;
            }

            fromEl.selectedIndex = i;
        }
    }
};

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
    return node.id;
}

function morphdomFactory(morphAttrs) {

    return function morphdom(fromNode, toNode, options) {
        if (!options) {
            options = {};
        }

        if (typeof toNode === 'string') {
            if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
                var toNodeHtml = toNode;
                toNode = doc.createElement('html');
                toNode.innerHTML = toNodeHtml;
            } else {
                toNode = toElement(toNode);
            }
        }

        var getNodeKey = options.getNodeKey || defaultGetNodeKey;
        var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
        var onNodeAdded = options.onNodeAdded || noop;
        var onBeforeElUpdated = options.onBeforeElUpdated || noop;
        var onElUpdated = options.onElUpdated || noop;
        var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
        var onNodeDiscarded = options.onNodeDiscarded || noop;
        var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
        var childrenOnly = options.childrenOnly === true;

        // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
        var fromNodesLookup = {};
        var keyedRemovalList;

        function addKeyedRemoval(key) {
            if (keyedRemovalList) {
                keyedRemovalList.push(key);
            } else {
                keyedRemovalList = [key];
            }
        }

        function walkDiscardedChildNodes(node, skipKeyedNodes) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {

                    var key = undefined;

                    if (skipKeyedNodes && (key = getNodeKey(curChild))) {
                        // If we are skipping keyed nodes then we add the key
                        // to a list so that it can be handled at the very end.
                        addKeyedRemoval(key);
                    } else {
                        // Only report the node as discarded if it is not keyed. We do this because
                        // at the end we loop through all keyed elements that were unmatched
                        // and then discard them in one final pass.
                        onNodeDiscarded(curChild);
                        if (curChild.firstChild) {
                            walkDiscardedChildNodes(curChild, skipKeyedNodes);
                        }
                    }

                    curChild = curChild.nextSibling;
                }
            }
        }

        /**
         * Removes a DOM node out of the original DOM
         *
         * @param  {Node} node The node to remove
         * @param  {Node} parentNode The nodes parent
         * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
         * @return {undefined}
         */
        function removeNode(node, parentNode, skipKeyedNodes) {
            if (onBeforeNodeDiscarded(node) === false) {
                return;
            }

            if (parentNode) {
                parentNode.removeChild(node);
            }

            onNodeDiscarded(node);
            walkDiscardedChildNodes(node, skipKeyedNodes);
        }

        // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
        // function indexTree(root) {
        //     var treeWalker = document.createTreeWalker(
        //         root,
        //         NodeFilter.SHOW_ELEMENT);
        //
        //     var el;
        //     while((el = treeWalker.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
        //
        // function indexTree(node) {
        //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
        //     var el;
        //     while((el = nodeIterator.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        function indexTree(node) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {
                    var key = getNodeKey(curChild);
                    if (key) {
                        fromNodesLookup[key] = curChild;
                    }

                    // Walk recursively
                    indexTree(curChild);

                    curChild = curChild.nextSibling;
                }
            }
        }

        indexTree(fromNode);

        function handleNodeAdded(el) {
            onNodeAdded(el);

            var curChild = el.firstChild;
            while (curChild) {
                var nextSibling = curChild.nextSibling;

                var key = getNodeKey(curChild);
                if (key) {
                    var unmatchedFromEl = fromNodesLookup[key];
                    if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                        curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                        morphEl(unmatchedFromEl, curChild);
                    }
                }

                handleNodeAdded(curChild);
                curChild = nextSibling;
            }
        }

        function morphEl(fromEl, toEl, childrenOnly) {
            var toElKey = getNodeKey(toEl);
            var curFromNodeKey;

            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.isSameNode && toNode.isSameNode(fromNode)) {
                return;
            }

            if (!childrenOnly) {
                if (onBeforeElUpdated(fromEl, toEl) === false) {
                    return;
                }

                morphAttrs(fromEl, toEl);
                onElUpdated(fromEl);

                if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                    return;
                }
            }

            if (fromEl.nodeName !== 'TEXTAREA') {
                var curToNodeChild = toEl.firstChild;
                var curFromNodeChild = fromEl.firstChild;
                var curToNodeKey;

                var fromNextSibling;
                var toNextSibling;
                var matchingFromEl;

                outer: while (curToNodeChild) {
                    toNextSibling = curToNodeChild.nextSibling;
                    curToNodeKey = getNodeKey(curToNodeChild);

                    while (curFromNodeChild) {
                        fromNextSibling = curFromNodeChild.nextSibling;

                        if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        curFromNodeKey = getNodeKey(curFromNodeChild);

                        var curFromNodeType = curFromNodeChild.nodeType;

                        var isCompatible = undefined;

                        if (curFromNodeType === curToNodeChild.nodeType) {
                            if (curFromNodeType === ELEMENT_NODE) {
                                // Both nodes being compared are Element nodes

                                if (curToNodeKey) {
                                    // The target node has a key so we want to match it up with the correct element
                                    // in the original DOM tree
                                    if (curToNodeKey !== curFromNodeKey) {
                                        // The current element in the original DOM tree does not have a matching key so
                                        // let's check our lookup to see if there is a matching element in the original
                                        // DOM tree
                                        if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                            if (curFromNodeChild.nextSibling === matchingFromEl) {
                                                // Special case for single element removals. To avoid removing the original
                                                // DOM node out of the tree (since that can break CSS transitions, etc.),
                                                // we will instead discard the current node and wait until the next
                                                // iteration to properly match up the keyed target element with its matching
                                                // element in the original tree
                                                isCompatible = false;
                                            } else {
                                                // We found a matching keyed element somewhere in the original DOM tree.
                                                // Let's moving the original DOM node into the current position and morph
                                                // it.

                                                // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                                // the `removeNode()` function for the node that is being discarded so that
                                                // all lifecycle hooks are correctly invoked
                                                fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                                fromNextSibling = curFromNodeChild.nextSibling;

                                                if (curFromNodeKey) {
                                                    // Since the node is keyed it might be matched up later so we defer
                                                    // the actual removal to later
                                                    addKeyedRemoval(curFromNodeKey);
                                                } else {
                                                    // NOTE: we skip nested keyed nodes from being removed since there is
                                                    //       still a chance they will be matched up later
                                                    removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                                }

                                                curFromNodeChild = matchingFromEl;
                                            }
                                        } else {
                                            // The nodes are not compatible since the "to" node has a key and there
                                            // is no matching keyed node in the source tree
                                            isCompatible = false;
                                        }
                                    }
                                } else if (curFromNodeKey) {
                                    // The original has a key
                                    isCompatible = false;
                                }

                                isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                if (isCompatible) {
                                    // We found compatible DOM elements so transform
                                    // the current "from" node to match the current
                                    // target DOM node.
                                    morphEl(curFromNodeChild, curToNodeChild);
                                }

                            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                                // Both nodes being compared are Text or Comment nodes
                                isCompatible = true;
                                // Simply update nodeValue on the original node to
                                // change the text value
                                curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                            }
                        }

                        if (isCompatible) {
                            // Advance both the "to" child and the "from" child since we found a match
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        // No compatible match so remove the old node from the DOM and continue trying to find a
                        // match in the original DOM. However, we only do this if the from node is not keyed
                        // since it is possible that a keyed node might match up with a node somewhere else in the
                        // target tree and we don't want to discard it just yet since it still might find a
                        // home in the final DOM tree. After everything is done we will remove any keyed nodes
                        // that didn't find a home
                        if (curFromNodeKey) {
                            // Since the node is keyed it might be matched up later so we defer
                            // the actual removal to later
                            addKeyedRemoval(curFromNodeKey);
                        } else {
                            // NOTE: we skip nested keyed nodes from being removed since there is
                            //       still a chance they will be matched up later
                            removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                        }

                        curFromNodeChild = fromNextSibling;
                    }

                    // If we got this far then we did not find a candidate match for
                    // our "to node" and we exhausted all of the children "from"
                    // nodes. Therefore, we will just append the current "to" node
                    // to the end
                    if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                        fromEl.appendChild(matchingFromEl);
                        morphEl(matchingFromEl, curToNodeChild);
                    } else {
                        var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                        if (onBeforeNodeAddedResult !== false) {
                            if (onBeforeNodeAddedResult) {
                                curToNodeChild = onBeforeNodeAddedResult;
                            }

                            if (curToNodeChild.actualize) {
                                curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                            }
                            fromEl.appendChild(curToNodeChild);
                            handleNodeAdded(curToNodeChild);
                        }
                    }

                    curToNodeChild = toNextSibling;
                    curFromNodeChild = fromNextSibling;
                }

                // We have processed all of the "to nodes". If curFromNodeChild is
                // non-null then we still have some from nodes left over that need
                // to be removed
                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;
                    if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                    } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                    }
                    curFromNodeChild = fromNextSibling;
                }
            }

            var specialElHandler = specialElHandlers[fromEl.nodeName];
            if (specialElHandler) {
                specialElHandler(fromEl, toEl);
            }
        } // END: morphEl(...)

        var morphedNode = fromNode;
        var morphedNodeType = morphedNode.nodeType;
        var toNodeType = toNode.nodeType;

        if (!childrenOnly) {
            // Handle the case where we are given two DOM nodes that are not
            // compatible (e.g. <div> --> <span> or <div> --> TEXT)
            if (morphedNodeType === ELEMENT_NODE) {
                if (toNodeType === ELEMENT_NODE) {
                    if (!compareNodeNames(fromNode, toNode)) {
                        onNodeDiscarded(fromNode);
                        morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                    }
                } else {
                    // Going from an element node to a text node
                    morphedNode = toNode;
                }
            } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                if (toNodeType === morphedNodeType) {
                    morphedNode.nodeValue = toNode.nodeValue;
                    return morphedNode;
                } else {
                    // Text node to something else
                    morphedNode = toNode;
                }
            }
        }

        if (morphedNode === toNode) {
            // The "to node" was not compatible with the "from node" so we had to
            // toss out the "from node" and use the "to node"
            onNodeDiscarded(fromNode);
        } else {
            morphEl(morphedNode, toNode, childrenOnly);

            // We now need to loop over any keyed nodes that might need to be
            // removed. We only do the removal if we know that the keyed node
            // never found a match. When a keyed node is matched up we remove
            // it out of fromNodesLookup and we use fromNodesLookup to determine
            // if a keyed node has been matched up or not
            if (keyedRemovalList) {
                for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                    var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                    if (elToRemove) {
                        removeNode(elToRemove, elToRemove.parentNode, false);
                    }
                }
            }
        }

        if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
                morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
            }
            // If we had to swap out the from node with a new node because the old
            // node was not compatible with the target node then we need to
            // replace the old DOM node in the original DOM tree. This is only
            // possible if the original DOM node was part of a DOM tree which
            // we know is the case if it has a parent node.
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
        }

        return morphedNode;
    };
}

var morphdom = morphdomFactory(morphAttrs);

module.exports = morphdom;

},{}],28:[function(require,module,exports){
module.exports = [
  // attribute events (can be set with attributes)
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'ondragstart',
  'ondrag',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  'ondragend',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onunload',
  'onabort',
  'onerror',
  'onresize',
  'onscroll',
  'onselect',
  'onchange',
  'onsubmit',
  'onreset',
  'onfocus',
  'onblur',
  'oninput',
  // other common events
  'oncontextmenu',
  'onfocusin',
  'onfocusout'
]

},{}],29:[function(require,module,exports){
module.exports = function yoyoifyAppendChild (el, childs) {
  for (var i = 0; i < childs.length; i++) {
    var node = childs[i]
    if (Array.isArray(node)) {
      yoyoifyAppendChild(el, node)
      continue
    }
    if (typeof node === 'number' ||
      typeof node === 'boolean' ||
      node instanceof Date ||
      node instanceof RegExp) {
      node = node.toString()
    }
    if (typeof node === 'string') {
      if (el.lastChild && el.lastChild.nodeName === '#text') {
        el.lastChild.nodeValue += node
        continue
      }
      node = document.createTextNode(node)
    }
    if (node && node.nodeType) {
      el.appendChild(node)
    }
  }
}

},{}],30:[function(require,module,exports){
(function (global){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Utils = require('../core/Utils');
var Translator = require('../core/Translator');
var UppySocket = require('./UppySocket');
var ee = require('namespace-emitter');
var throttle = require('lodash.throttle');
// const en_US = require('../locales/en_US')
// const deepFreeze = require('deep-freeze-strict')

/**
 * Main Uppy core
 *
 * @param {object} opts general options, like locales, to show modal or not to show
 */

var Uppy = function () {
  function Uppy(opts) {
    _classCallCheck(this, Uppy);

    // set default options
    var defaultOptions = {
      // load English as the default locale
      // locale: en_US,
      autoProceed: true,
      debug: false
    };

    // Merge default options with the ones set by user
    this.opts = _extends({}, defaultOptions, opts);

    // // Dictates in what order different plugin types are ran:
    // this.types = [ 'presetter', 'orchestrator', 'progressindicator',
    //                 'acquirer', 'modifier', 'uploader', 'presenter', 'debugger']

    // Container for different types of plugins
    this.plugins = {};

    this.translator = new Translator({ locale: this.opts.locale });
    this.i18n = this.translator.translate.bind(this.translator);
    this.getState = this.getState.bind(this);
    this.updateMeta = this.updateMeta.bind(this);
    this.initSocket = this.initSocket.bind(this);
    this.log = this.log.bind(this);
    this.addFile = this.addFile.bind(this);
    this.calculateProgress = this.calculateProgress.bind(this);

    this.bus = this.emitter = ee();
    this.on = this.bus.on.bind(this.bus);
    this.emit = this.bus.emit.bind(this.bus);

    this.preProcessors = [];
    this.uploaders = [];
    this.postProcessors = [];

    this.state = {
      files: {},
      capabilities: {
        resumableUploads: false
      },
      totalProgress: 0
    };

    // for debugging and testing
    this.updateNum = 0;
    if (this.opts.debug) {
      global.UppyState = this.state;
      global.uppyLog = '';
      global.UppyAddFile = this.addFile.bind(this);
      global._Uppy = this;
    }
  }

  /**
   * Iterate on all plugins and run `update` on them. Called each time state changes
   *
   */


  Uppy.prototype.updateAll = function updateAll(state) {
    var _this = this;

    Object.keys(this.plugins).forEach(function (pluginType) {
      _this.plugins[pluginType].forEach(function (plugin) {
        plugin.update(state);
      });
    });
  };

  /**
   * Updates state
   *
   * @param {newState} object
   */


  Uppy.prototype.setState = function setState(stateUpdate) {
    var newState = _extends({}, this.state, stateUpdate);
    this.emit('core:state-update', this.state, newState, stateUpdate);

    this.state = newState;
    this.updateAll(this.state);
  };

  /**
   * Returns current state
   *
   */


  Uppy.prototype.getState = function getState() {
    // use deepFreeze for debugging
    // return deepFreeze(this.state)
    return this.state;
  };

  Uppy.prototype.addPreProcessor = function addPreProcessor(fn) {
    this.preProcessors.push(fn);
  };

  Uppy.prototype.removePreProcessor = function removePreProcessor(fn) {
    var i = this.preProcessors.indexOf(fn);
    if (i !== -1) {
      this.preProcessors.splice(i, 1);
    }
  };

  Uppy.prototype.addPostProcessor = function addPostProcessor(fn) {
    this.postProcessors.push(fn);
  };

  Uppy.prototype.removePostProcessor = function removePostProcessor(fn) {
    var i = this.postProcessors.indexOf(fn);
    if (i !== -1) {
      this.postProcessors.splice(i, 1);
    }
  };

  Uppy.prototype.addUploader = function addUploader(fn) {
    this.uploaders.push(fn);
  };

  Uppy.prototype.removeUploader = function removeUploader(fn) {
    var i = this.uploaders.indexOf(fn);
    if (i !== -1) {
      this.uploaders.splice(i, 1);
    }
  };

  Uppy.prototype.updateMeta = function updateMeta(data, fileID) {
    var updatedFiles = _extends({}, this.getState().files);
    var newMeta = _extends({}, updatedFiles[fileID].meta, data);
    updatedFiles[fileID] = _extends({}, updatedFiles[fileID], {
      meta: newMeta
    });
    this.setState({ files: updatedFiles });
  };

  Uppy.prototype.addFile = function addFile(file) {
    var updatedFiles = _extends({}, this.state.files);

    var fileName = file.name || 'noname';
    var fileType = Utils.getFileType(file);
    var fileTypeGeneral = fileType[0];
    var fileTypeSpecific = fileType[1];
    var fileExtension = Utils.getFileNameAndExtension(fileName)[1];
    var isRemote = file.isRemote || false;

    var fileID = Utils.generateFileID(fileName);

    var newFile = {
      source: file.source || '',
      id: fileID,
      name: fileName,
      extension: fileExtension || '',
      meta: {
        name: fileName
      },
      type: {
        general: fileTypeGeneral,
        specific: fileTypeSpecific
      },
      data: file.data,
      progress: {
        percentage: 0,
        uploadComplete: false,
        uploadStarted: false
      },
      size: file.data.size || 'N/A',
      isRemote: isRemote,
      remote: file.remote || '',
      preview: file.preview
    };

    updatedFiles[fileID] = newFile;
    this.setState({ files: updatedFiles });

    this.bus.emit('file-added', fileID);
    this.log('Added file: ' + fileName + ', ' + fileID + ', mime type: ' + fileType);

    if (fileTypeGeneral === 'image' && !isRemote) {
      this.addThumbnail(newFile.id);
    }

    if (this.opts.autoProceed) {
      this.upload().catch(function (err) {
        console.error(err.stack || err.message);
      });
      // this.bus.emit('core:upload')
    }
  };

  Uppy.prototype.removeFile = function removeFile(fileID) {
    var updatedFiles = _extends({}, this.getState().files);
    delete updatedFiles[fileID];
    this.setState({ files: updatedFiles });
    this.calculateTotalProgress();
    this.log('Removed file: ' + fileID);
  };

  Uppy.prototype.addThumbnail = function addThumbnail(fileID) {
    var _this2 = this;

    var file = this.getState().files[fileID];

    // const thumbnail = URL.createObjectURL(file.data)
    // const updatedFiles = Object.assign({}, this.getState().files)
    // const updatedFile = Object.assign({}, updatedFiles[fileID], {
    //   preview: thumbnail
    // })
    // updatedFiles[fileID] = updatedFile
    // this.setState({files: updatedFiles})

    Utils.readFile(file.data).then(function (imgDataURI) {
      return Utils.createImageThumbnail(imgDataURI, 200);
    }).then(function (thumbnail) {
      var updatedFiles = _extends({}, _this2.getState().files);
      var updatedFile = _extends({}, updatedFiles[fileID], {
        preview: thumbnail
      });
      updatedFiles[fileID] = updatedFile;
      _this2.setState({ files: updatedFiles });
    }).catch(function (err) {
      return _this2.log(err);
    });
  };

  Uppy.prototype.calculateProgress = function calculateProgress(data) {
    var fileID = data.id;
    var updatedFiles = _extends({}, this.getState().files);

    // skip progress event for a file that’s been removed
    if (!updatedFiles[fileID]) {
      this.log('Trying to set progress for a file that’s not with us anymore: ', fileID);
      return;
    }

    var updatedFile = _extends({}, updatedFiles[fileID], _extends({}, {
      progress: _extends({}, updatedFiles[fileID].progress, {
        bytesUploaded: data.bytesUploaded,
        bytesTotal: data.bytesTotal,
        percentage: Math.floor((data.bytesUploaded / data.bytesTotal * 100).toFixed(2))
      })
    }));
    updatedFiles[data.id] = updatedFile;

    this.setState({
      files: updatedFiles
    });

    this.calculateTotalProgress();
  };

  Uppy.prototype.calculateTotalProgress = function calculateTotalProgress() {
    // calculate total progress, using the number of files currently uploading,
    // multiplied by 100 and the summ of individual progress of each file
    var files = _extends({}, this.getState().files);

    var inProgress = Object.keys(files).filter(function (file) {
      return files[file].progress.uploadStarted;
    });
    var progressMax = inProgress.length * 100;
    var progressAll = 0;
    inProgress.forEach(function (file) {
      progressAll = progressAll + files[file].progress.percentage;
    });

    var totalProgress = Math.floor((progressAll * 100 / progressMax).toFixed(2));

    this.setState({
      totalProgress: totalProgress
    });

    // if (totalProgress === 100) {
    //   const completeFiles = Object.keys(updatedFiles).filter((file) => {
    //     // this should be `uploadComplete`
    //     return updatedFiles[file].progress.percentage === 100
    //   })
    //   this.emit('core:success', completeFiles.length)
    // }
  };

  /**
   * Registers listeners for all global actions, like:
   * `file-add`, `file-remove`, `upload-progress`, `reset`
   *
   */


  Uppy.prototype.actions = function actions() {
    var _this3 = this;

    // this.bus.on('*', (payload) => {
    //   console.log('emitted: ', this.event)
    //   console.log('with payload: ', payload)
    // })

    // stress-test re-rendering
    // setInterval(() => {
    //   this.setState({bla: 'bla'})
    // }, 20)

    this.on('core:file-add', function (data) {
      _this3.addFile(data);
    });

    // `remove-file` removes a file from `state.files`, for example when
    // a user decides not to upload particular file and clicks a button to remove it
    this.on('core:file-remove', function (fileID) {
      _this3.removeFile(fileID);
    });

    this.on('core:cancel-all', function () {
      var files = _this3.getState().files;
      Object.keys(files).forEach(function (file) {
        _this3.removeFile(files[file].id);
      });
    });

    this.on('core:upload-started', function (fileID, upload) {
      var updatedFiles = _extends({}, _this3.getState().files);
      var updatedFile = _extends({}, updatedFiles[fileID], _extends({}, {
        progress: _extends({}, updatedFiles[fileID].progress, {
          uploadStarted: Date.now()
        })
      }));
      updatedFiles[fileID] = updatedFile;

      _this3.setState({ files: updatedFiles });
    });

    // upload progress events can occur frequently, especially when you have a good
    // connection to the remote server. Therefore, we are throtteling them to
    // prevent accessive function calls.
    // see also: https://github.com/tus/tus-js-client/commit/9940f27b2361fd7e10ba58b09b60d82422183bbb
    var throttledCalculateProgress = throttle(this.calculateProgress, 100, { leading: true, trailing: false });

    this.on('core:upload-progress', function (data) {
      // this.calculateProgress(data)
      throttledCalculateProgress(data);
    });

    this.on('core:upload-success', function (fileID, uploadResp, uploadURL) {
      var updatedFiles = _extends({}, _this3.getState().files);
      var updatedFile = _extends({}, updatedFiles[fileID], {
        progress: _extends({}, updatedFiles[fileID].progress, {
          uploadComplete: true,
          // good or bad idea? setting the percentage to 100 if upload is successful,
          // so that if we lost some progress events on the way, its still marked “compete”?
          percentage: 100
        }),
        uploadURL: uploadURL
      });
      updatedFiles[fileID] = updatedFile;

      _this3.setState({
        files: updatedFiles
      });

      _this3.calculateTotalProgress();

      if (_this3.getState().totalProgress === 100) {
        var completeFiles = Object.keys(updatedFiles).filter(function (file) {
          return updatedFiles[file].progress.uploadComplete;
        });
        _this3.emit('core:upload-complete', completeFiles.length);
      }
    });

    this.on('core:update-meta', function (data, fileID) {
      _this3.updateMeta(data, fileID);
    });

    // show informer if offline
    if (typeof window !== 'undefined') {
      window.addEventListener('online', function () {
        return _this3.isOnline(true);
      });
      window.addEventListener('offline', function () {
        return _this3.isOnline(false);
      });
      setTimeout(function () {
        return _this3.isOnline();
      }, 3000);
    }
  };

  Uppy.prototype.isOnline = function isOnline(status) {
    var online = status || window.navigator.onLine;
    if (!online) {
      this.emit('is-offline');
      this.emit('informer', 'No internet connection', 'error', 0);
      this.wasOffline = true;
    } else {
      this.emit('is-online');
      if (this.wasOffline) {
        this.emit('back-online');
        this.emit('informer', 'Connected!', 'success', 3000);
        this.wasOffline = false;
      }
    }
  };

  /**
   * Registers a plugin with Core
   *
   * @param {Class} Plugin object
   * @param {Object} options object that will be passed to Plugin later
   * @return {Object} self for chaining
   */


  Uppy.prototype.use = function use(Plugin, opts) {
    // Instantiate
    var plugin = new Plugin(this, opts);
    var pluginName = plugin.id;
    this.plugins[plugin.type] = this.plugins[plugin.type] || [];

    if (!pluginName) {
      throw new Error('Your plugin must have a name');
    }

    if (!plugin.type) {
      throw new Error('Your plugin must have a type');
    }

    var existsPluginAlready = this.getPlugin(pluginName);
    if (existsPluginAlready) {
      var msg = 'Already found a plugin named \'' + existsPluginAlready.name + '\'.\n        Tried to use: \'' + pluginName + '\'.\n        Uppy is currently limited to running one of every plugin.\n        Share your use case with us over at\n        https://github.com/transloadit/uppy/issues/\n        if you want us to reconsider.';
      throw new Error(msg);
    }

    this.plugins[plugin.type].push(plugin);
    plugin.install();

    return this;
  };

  /**
   * Find one Plugin by name
   *
   * @param string name description
   */


  Uppy.prototype.getPlugin = function getPlugin(name) {
    var foundPlugin = false;
    this.iteratePlugins(function (plugin) {
      var pluginName = plugin.id;
      if (pluginName === name) {
        foundPlugin = plugin;
        return false;
      }
    });
    return foundPlugin;
  };

  /**
   * Iterate through all `use`d plugins
   *
   * @param function method description
   */


  Uppy.prototype.iteratePlugins = function iteratePlugins(method) {
    var _this4 = this;

    Object.keys(this.plugins).forEach(function (pluginType) {
      _this4.plugins[pluginType].forEach(method);
    });
  };

  /**
   * Uninstall and remove a plugin.
   *
   * @param {Plugin} instance The plugin instance to remove.
   */


  Uppy.prototype.removePlugin = function removePlugin(instance) {
    var list = this.plugins[instance.type];

    if (instance.uninstall) {
      instance.uninstall();
    }

    var index = list.indexOf(instance);
    if (index !== -1) {
      list.splice(index, 1);
    }
  };

  /**
   * Uninstall all plugins and close down this Uppy instance.
   */


  Uppy.prototype.close = function close() {
    this.iteratePlugins(function (plugin) {
      plugin.uninstall();
    });

    if (this.socket) {
      this.socket.close();
    }
  };

  /**
   * Logs stuff to console, only if `debug` is set to true. Silent in production.
   *
   * @return {String|Object} to log
   */


  Uppy.prototype.log = function log(msg, type) {
    if (!this.opts.debug) {
      return;
    }
    if (msg === '' + msg) {
      console.log('LOG: ' + msg);
    } else {
      console.dir(msg);
    }

    if (type === 'error') {
      console.error('LOG: ' + msg);
    }

    global.uppyLog = global.uppyLog + '\n' + 'DEBUG LOG: ' + msg;
  };

  Uppy.prototype.initSocket = function initSocket(opts) {
    if (!this.socket) {
      this.socket = new UppySocket(opts);
    }

    return this.socket;
  };

  // installAll () {
  //   Object.keys(this.plugins).forEach((pluginType) => {
  //     this.plugins[pluginType].forEach((plugin) => {
  //       plugin.install(this)
  //     })
  //   })
  // }

  /**
   * Initializes actions, installs all plugins (by iterating on them and calling `install`), sets options
   *
   */


  Uppy.prototype.run = function run() {
    this.log('Core is run, initializing actions...');

    this.actions();

    // Forse set `autoProceed` option to false if there are multiple selector Plugins active
    // if (this.plugins.acquirer && this.plugins.acquirer.length > 1) {
    //   this.opts.autoProceed = false
    // }

    // Install all plugins
    // this.installAll()

    return;
  };

  Uppy.prototype.upload = function upload() {
    var _this5 = this;

    var promise = Promise.resolve();

    this.emit('core:upload');[].concat(this.preProcessors, this.uploaders, this.postProcessors).forEach(function (fn) {
      promise = promise.then(function () {
        return fn();
      });
    });

    // Not returning the `catch`ed promise, because we still want to return a rejected
    // promise from this method if the upload failed.
    promise.catch(function (err) {
      _this5.emit('core:error', err);
    });

    return promise.then(function () {
      _this5.emit('core:success');
    });
  };

  return Uppy;
}();

module.exports = function (opts) {
  if (!(this instanceof Uppy)) {
    return new Uppy(opts);
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../core/Translator":31,"../core/Utils":33,"./UppySocket":32,"lodash.throttle":5,"namespace-emitter":6}],31:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Translates strings with interpolation & pluralization support.
 * Extensible with custom dictionaries and pluralization functions.
 *
 * Borrows heavily from and inspired by Polyglot https://github.com/airbnb/polyglot.js,
 * basically a stripped-down version of it. Differences: pluralization functions are not hardcoded
 * and can be easily added among with dictionaries, nested objects are used for pluralization
 * as opposed to `||||` delimeter
 *
 * Usage example: `translator.translate('files_chosen', {smart_count: 3})`
 *
 * @param {object} opts
 */
module.exports = function () {
  function Translator(opts) {
    _classCallCheck(this, Translator);

    var defaultOptions = {
      locale: {
        strings: {},
        pluralize: function pluralize(n) {
          if (n === 1) {
            return 0;
          }
          return 1;
        }
      }
    };

    this.opts = _extends({}, defaultOptions, opts);
    this.locale = _extends({}, defaultOptions.locale, opts.locale);

    // console.log(this.opts.locale)

    // this.locale.pluralize = this.locale ? this.locale.pluralize : defaultPluralize
    // this.locale.strings = Object.assign({}, en_US.strings, this.opts.locale.strings)
  }

  /**
   * Takes a string with placeholder variables like `%{smart_count} file selected`
   * and replaces it with values from options `{smart_count: 5}`
   *
   * @license https://github.com/airbnb/polyglot.js/blob/master/LICENSE
   * taken from https://github.com/airbnb/polyglot.js/blob/master/lib/polyglot.js#L299
   *
   * @param {string} phrase that needs interpolation, with placeholders
   * @param {object} options with values that will be used to replace placeholders
   * @return {string} interpolated
   */


  Translator.prototype.interpolate = function interpolate(phrase, options) {
    var replace = String.prototype.replace;
    var dollarRegex = /\$/g;
    var dollarBillsYall = '$$$$';

    for (var arg in options) {
      if (arg !== '_' && options.hasOwnProperty(arg)) {
        // Ensure replacement value is escaped to prevent special $-prefixed
        // regex replace tokens. the "$$$$" is needed because each "$" needs to
        // be escaped with "$" itself, and we need two in the resulting output.
        var replacement = options[arg];
        if (typeof replacement === 'string') {
          replacement = replace.call(options[arg], dollarRegex, dollarBillsYall);
        }
        // We create a new `RegExp` each time instead of using a more-efficient
        // string replace so that the same argument can be replaced multiple times
        // in the same phrase.
        phrase = replace.call(phrase, new RegExp('%\\{' + arg + '\\}', 'g'), replacement);
      }
    }
    return phrase;
  };

  /**
   * Public translate method
   *
   * @param {string} key
   * @param {object} options with values that will be used later to replace placeholders in string
   * @return {string} translated (and interpolated)
   */


  Translator.prototype.translate = function translate(key, options) {
    if (options && options.smart_count) {
      var plural = this.locale.pluralize(options.smart_count);
      return this.interpolate(this.opts.locale.strings[key][plural], options);
    }

    return this.interpolate(this.opts.locale.strings[key], options);
  };

  return Translator;
}();

},{}],32:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ee = require('namespace-emitter');

module.exports = function () {
  function UppySocket(opts) {
    var _this = this;

    _classCallCheck(this, UppySocket);

    this.queued = [];
    this.isOpen = false;
    this.socket = new WebSocket(opts.target);
    this.emitter = ee();

    this.socket.onopen = function (e) {
      _this.isOpen = true;

      while (_this.queued.length > 0 && _this.isOpen) {
        var first = _this.queued[0];
        _this.send(first.action, first.payload);
        _this.queued = _this.queued.slice(1);
      }
    };

    this.socket.onclose = function (e) {
      _this.isOpen = false;
    };

    this._handleMessage = this._handleMessage.bind(this);

    this.socket.onmessage = this._handleMessage;

    this.close = this.close.bind(this);
    this.emit = this.emit.bind(this);
    this.on = this.on.bind(this);
    this.once = this.once.bind(this);
    this.send = this.send.bind(this);
  }

  UppySocket.prototype.close = function close() {
    return this.socket.close();
  };

  UppySocket.prototype.send = function send(action, payload) {
    // attach uuid

    if (!this.isOpen) {
      this.queued.push({ action: action, payload: payload });
      return;
    }

    this.socket.send(JSON.stringify({
      action: action,
      payload: payload
    }));
  };

  UppySocket.prototype.on = function on(action, handler) {
    console.log(action);
    this.emitter.on(action, handler);
  };

  UppySocket.prototype.emit = function emit(action, payload) {
    console.log(action);
    this.emitter.emit(action, payload);
  };

  UppySocket.prototype.once = function once(action, handler) {
    this.emitter.once(action, handler);
  };

  UppySocket.prototype._handleMessage = function _handleMessage(e) {
    try {
      var message = JSON.parse(e.data);
      console.log(message);
      this.emit(message.action, message.payload);
    } catch (err) {
      console.log(err);
    }
  };

  return UppySocket;
}();

},{"namespace-emitter":6}],33:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _Promise = typeof Promise === 'undefined' ? require('es6-promise').Promise : Promise;

// import mime from 'mime-types'
// import pica from 'pica'

/**
 * A collection of small utility functions that help with dom manipulation, adding listeners,
 * promises and other good things.
 *
 * @module Utils
 */

/**
 * Shallow flatten nested arrays.
 */
function flatten(arr) {
  return [].concat.apply([], arr);
}

function isTouchDevice() {
  return 'ontouchstart' in window || // works on most browsers
  navigator.maxTouchPoints; // works on IE10/11 and Surface
}

// /**
//  * Shorter and fast way to select a single node in the DOM
//  * @param   { String } selector - unique dom selector
//  * @param   { Object } ctx - DOM node where the target of our search will is located
//  * @returns { Object } dom node found
//  */
// function $ (selector, ctx) {
//   return (ctx || document).querySelector(selector)
// }

// /**
//  * Shorter and fast way to select multiple nodes in the DOM
//  * @param   { String|Array } selector - DOM selector or nodes list
//  * @param   { Object } ctx - DOM node where the targets of our search will is located
//  * @returns { Object } dom nodes found
//  */
// function $$ (selector, ctx) {
//   var els
//   if (typeof selector === 'string') {
//     els = (ctx || document).querySelectorAll(selector)
//   } else {
//     els = selector
//     return Array.prototype.slice.call(els)
//   }
// }

function truncateString(str, length) {
  if (str.length > length) {
    return str.substr(0, length / 2) + '...' + str.substr(str.length - length / 4, str.length);
  }
  return str;

  // more precise version if needed
  // http://stackoverflow.com/a/831583
}

function secondsToTime(rawSeconds) {
  var hours = Math.floor(rawSeconds / 3600) % 24;
  var minutes = Math.floor(rawSeconds / 60) % 60;
  var seconds = Math.floor(rawSeconds % 60);

  return { hours: hours, minutes: minutes, seconds: seconds };
}

/**
 * Partition array by a grouping function.
 * @param  {[type]} array      Input array
 * @param  {[type]} groupingFn Grouping function
 * @return {[type]}            Array of arrays
 */
function groupBy(array, groupingFn) {
  return array.reduce(function (result, item) {
    var key = groupingFn(item);
    var xs = result.get(key) || [];
    xs.push(item);
    result.set(key, xs);
    return result;
  }, new Map());
}

/**
 * Tests if every array element passes predicate
 * @param  {Array}  array       Input array
 * @param  {Object} predicateFn Predicate
 * @return {bool}               Every element pass
 */
function every(array, predicateFn) {
  return array.reduce(function (result, item) {
    if (!result) {
      return false;
    }

    return predicateFn(item);
  }, true);
}

/**
 * Converts list into array
*/
function toArray(list) {
  return Array.prototype.slice.call(list || [], 0);
}

/**
 * Takes a fileName and turns it into fileID, by converting to lowercase,
 * removing extra characters and adding unix timestamp
 *
 * @param {String} fileName
 *
 */
function generateFileID(fileName) {
  var fileID = fileName.toLowerCase();
  fileID = fileID.replace(/[^A-Z0-9]/ig, '');
  fileID = fileID + Date.now();
  return fileID;
}

function extend() {
  for (var _len = arguments.length, objs = Array(_len), _key = 0; _key < _len; _key++) {
    objs[_key] = arguments[_key];
  }

  return Object.assign.apply(this, [{}].concat(objs));
}

/**
 * Takes function or class, returns its name.
 * Because IE doesn’t support `constructor.name`.
 * https://gist.github.com/dfkaye/6384439, http://stackoverflow.com/a/15714445
 *
 * @param {Object} fn — function
 *
 */
// function getFnName (fn) {
//   var f = typeof fn === 'function'
//   var s = f && ((fn.name && ['', fn.name]) || fn.toString().match(/function ([^\(]+)/))
//   return (!f && 'not a function') || (s && s[1] || 'anonymous')
// }

function getProportionalImageHeight(img, newWidth) {
  var aspect = img.width / img.height;
  var newHeight = Math.round(newWidth / aspect);
  return newHeight;
}

function getFileType(file) {
  return file.type ? file.type.split('/') : ['', ''];
  // return mime.lookup(file.name)
}

// TODO Check which types are actually supported in browsers. Chrome likes webm
// from my testing, but we may need more.
// We could use a library but they tend to contain dozens of KBs of mappings,
// most of which will go unused, so not sure if that's worth it.
var mimeToExtensions = {
  'video/ogg': 'ogv',
  'audio/ogg': 'ogg',
  'video/webm': 'webm',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/mp3': 'mp3'
};

function getFileTypeExtension(mimeType) {
  return mimeToExtensions[mimeType] || null;
}

// returns [fileName, fileExt]
function getFileNameAndExtension(fullFileName) {
  var re = /(?:\.([^.]+))?$/;
  var fileExt = re.exec(fullFileName)[1];
  var fileName = fullFileName.replace('.' + fileExt, '');
  return [fileName, fileExt];
}

/**
 * Reads file as data URI from file object,
 * the one you get from input[type=file] or drag & drop.
 *
 * @param {Object} file object
 * @return {Promise} dataURL of the file
 *
 */
function readFile(fileObj) {
  return new _Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.addEventListener('load', function (ev) {
      return resolve(ev.target.result);
    });
    reader.readAsDataURL(fileObj);

    // function workerScript () {
    //   self.addEventListener('message', (e) => {
    //     const file = e.data.file
    //     try {
    //       const reader = new FileReaderSync()
    //       postMessage({
    //         file: reader.readAsDataURL(file)
    //       })
    //     } catch (err) {
    //       console.log(err)
    //     }
    //   })
    // }
    //
    // const worker = makeWorker(workerScript)
    // worker.postMessage({file: fileObj})
    // worker.addEventListener('message', (e) => {
    //   const fileDataURL = e.data.file
    //   console.log('FILE _ DATA _ URL')
    //   return resolve(fileDataURL)
    // })
  });
}

/**
 * Resizes an image to specified width and proportional height, using canvas
 * See https://davidwalsh.name/resize-image-canvas,
 * http://babalan.com/resizing-images-with-javascript/
 * @TODO see if we need https://github.com/stomita/ios-imagefile-megapixel for iOS
 *
 * @param {String} Data URI of the original image
 * @param {String} width of the resulting image
 * @return {String} Data URI of the resized image
 */
function createImageThumbnail(imgDataURI, newWidth) {
  return new _Promise(function (resolve, reject) {
    var img = new Image();
    img.addEventListener('load', function () {
      var newImageWidth = newWidth;
      var newImageHeight = getProportionalImageHeight(img, newImageWidth);

      // create an off-screen canvas
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      // set its dimension to target size
      canvas.width = newImageWidth;
      canvas.height = newImageHeight;

      // draw source image into the off-screen canvas:
      // ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, newImageWidth, newImageHeight);

      // pica.resizeCanvas(img, canvas, (err) => {
      //   if (err) console.log(err)
      //   const thumbnail = canvas.toDataURL('image/png')
      //   return resolve(thumbnail)
      // })

      // encode image to data-uri with base64 version of compressed image
      // canvas.toDataURL('image/jpeg', quality);  // quality = [0.0, 1.0]
      var thumbnail = canvas.toDataURL('image/png');
      return resolve(thumbnail);
    });
    img.src = imgDataURI;
  });
}

function supportsMediaRecorder() {
  return typeof MediaRecorder === 'function' && !!MediaRecorder.prototype && typeof MediaRecorder.prototype.start === 'function';
}

function dataURItoBlob(dataURI, opts, toFile) {
  // get the base64 data
  var data = dataURI.split(',')[1];

  // user may provide mime type, if not get it from data URI
  var mimeType = opts.mimeType || dataURI.split(',')[0].split(':')[1].split(';')[0];

  // default to plain/text if data URI has no mimeType
  if (mimeType == null) {
    mimeType = 'plain/text';
  }

  var binary = atob(data);
  var array = [];
  for (var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }

  // Convert to a File?
  if (toFile) {
    return new File([new Uint8Array(array)], opts.name || '', { type: mimeType });
  }

  return new Blob([new Uint8Array(array)], { type: mimeType });
}

function dataURItoFile(dataURI, opts) {
  return dataURItoBlob(dataURI, opts, true);
}

/**
 * Copies text to clipboard by creating an almost invisible textarea,
 * adding text there, then running execCommand('copy').
 * Falls back to prompt() when the easy way fails (hello, Safari!)
 * From http://stackoverflow.com/a/30810322
 *
 * @param {String} textToCopy
 * @param {String} fallbackString
 * @return {Promise}
 */
function copyToClipboard(textToCopy, fallbackString) {
  fallbackString = fallbackString || 'Copy the URL below';

  return new _Promise(function (resolve, reject) {
    var textArea = document.createElement('textarea');
    textArea.setAttribute('style', {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '2em',
      height: '2em',
      padding: 0,
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      background: 'transparent'
    });

    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.select();

    var magicCopyFailed = function magicCopyFailed(err) {
      document.body.removeChild(textArea);
      window.prompt(fallbackString, textToCopy);
      return reject('Oops, unable to copy displayed fallback prompt: ' + err);
    };

    try {
      var successful = document.execCommand('copy');
      if (!successful) {
        return magicCopyFailed('copy command unavailable');
      }
      document.body.removeChild(textArea);
      return resolve();
    } catch (err) {
      document.body.removeChild(textArea);
      return magicCopyFailed(err);
    }
  });
}

// function createInlineWorker (workerFunction) {
//   let code = workerFunction.toString()
//   code = code.substring(code.indexOf('{') + 1, code.lastIndexOf('}'))
//
//   const blob = new Blob([code], {type: 'application/javascript'})
//   const worker = new Worker(URL.createObjectURL(blob))
//
//   return worker
// }

// function makeWorker (script) {
//   var URL = window.URL || window.webkitURL
//   var Blob = window.Blob
//   var Worker = window.Worker
//
//   if (!URL || !Blob || !Worker || !script) {
//     return null
//   }
//
//   let code = script.toString()
//   code = code.substring(code.indexOf('{') + 1, code.lastIndexOf('}'))
//
//   var blob = new Blob([code])
//   var worker = new Worker(URL.createObjectURL(blob))
//   return worker
// }

function getSpeed(fileProgress) {
  if (!fileProgress.bytesUploaded) return 0;

  var timeElapsed = new Date() - fileProgress.uploadStarted;
  var uploadSpeed = fileProgress.bytesUploaded / (timeElapsed / 1000);
  return uploadSpeed;
}

function getETA(fileProgress) {
  if (!fileProgress.bytesUploaded) return 0;

  var uploadSpeed = getSpeed(fileProgress);
  var bytesRemaining = fileProgress.bytesTotal - fileProgress.bytesUploaded;
  var secondsRemaining = Math.round(bytesRemaining / uploadSpeed * 10) / 10;

  return secondsRemaining;
}

function prettyETA(seconds) {
  var time = secondsToTime(seconds);

  // Only display hours and minutes if they are greater than 0 but always
  // display minutes if hours is being displayed
  // Display a leading zero if the there is a preceding unit: 1m 05s, but 5s
  var hoursStr = time.hours ? time.hours + 'h ' : '';
  var minutesVal = time.hours ? ('0' + time.minutes).substr(-2) : time.minutes;
  var minutesStr = minutesVal ? minutesVal + 'm ' : '';
  var secondsVal = minutesVal ? ('0' + time.seconds).substr(-2) : time.seconds;
  var secondsStr = secondsVal + 's';

  return '' + hoursStr + minutesStr + secondsStr;
}

// function makeCachingFunction () {
//   let cachedEl = null
//   let lastUpdate = Date.now()
//
//   return function cacheElement (el, time) {
//     if (Date.now() - lastUpdate < time) {
//       return cachedEl
//     }
//
//     cachedEl = el
//     lastUpdate = Date.now()
//
//     return el
//   }
// }

/**
 * Check if an object is a DOM element. Duck-typing based on `nodeType`.
 *
 * @param {*} obj
 */
function isDOMElement(obj) {
  return obj && (typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) === 'object' && obj.nodeType === Node.ELEMENT_NODE;
}

/**
 * Find a DOM element.
 *
 * @param {Node|string} element
 * @return {Node|null}
 */
function findDOMElement(element) {
  if (typeof element === 'string') {
    return document.querySelector(element);
  }

  if ((typeof element === 'undefined' ? 'undefined' : _typeof(element)) === 'object' && isDOMElement(element)) {
    return element;
  }
}

module.exports = {
  generateFileID: generateFileID,
  toArray: toArray,
  every: every,
  flatten: flatten,
  groupBy: groupBy,
  // $,
  // $$,
  extend: extend,
  readFile: readFile,
  createImageThumbnail: createImageThumbnail,
  getProportionalImageHeight: getProportionalImageHeight,
  supportsMediaRecorder: supportsMediaRecorder,
  isTouchDevice: isTouchDevice,
  getFileNameAndExtension: getFileNameAndExtension,
  truncateString: truncateString,
  getFileTypeExtension: getFileTypeExtension,
  getFileType: getFileType,
  secondsToTime: secondsToTime,
  dataURItoBlob: dataURItoBlob,
  dataURItoFile: dataURItoFile,
  getSpeed: getSpeed,
  getETA: getETA,
  // makeWorker,
  // makeCachingFunction,
  copyToClipboard: copyToClipboard,
  prettyETA: prettyETA,
  findDOMElement: findDOMElement
};

},{"es6-promise":4}],34:[function(require,module,exports){
'use strict';

var Core = require('./Core');
module.exports = Core;

},{"./Core":30}],35:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _uppyProviderAuthBtnDemo, _uppyProviderAuthTitleName, _br, _uppyProviderAuthTitle, _uppyProviderAuthBtn, _uppyProviderAuth;

  var demoLink = props.demo ? (_uppyProviderAuthBtnDemo = document.createElement('button'), _uppyProviderAuthBtnDemo.onclick = props.handleDemoAuth, _uppyProviderAuthBtnDemo.setAttribute('class', 'UppyProvider-authBtnDemo'), _uppyProviderAuthBtnDemo.textContent = 'Proceed with Demo Account', _uppyProviderAuthBtnDemo) : null;
  return _uppyProviderAuth = document.createElement('div'), _uppyProviderAuth.setAttribute('class', 'UppyProvider-auth'), _appendChild(_uppyProviderAuth, [' ', (_uppyProviderAuthTitle = document.createElement('h1'), _uppyProviderAuthTitle.setAttribute('class', 'UppyProvider-authTitle'), _appendChild(_uppyProviderAuthTitle, [' Please authenticate with ', (_uppyProviderAuthTitleName = document.createElement('span'), _uppyProviderAuthTitleName.setAttribute('class', 'UppyProvider-authTitleName'), _appendChild(_uppyProviderAuthTitleName, [props.pluginName]), _uppyProviderAuthTitleName), (_br = document.createElement('br'), _br), ' to select files ']), _uppyProviderAuthTitle), ' ', (_uppyProviderAuthBtn = document.createElement('button'), _uppyProviderAuthBtn.onclick = props.handleAuth, _uppyProviderAuthBtn.setAttribute('class', 'UppyProvider-authBtn'), _uppyProviderAuthBtn.textContent = 'Authenticate', _uppyProviderAuthBtn), ' ', demoLink, ' ']), _uppyProviderAuth;
};

},{"yo-yoify/lib/appendChild":29}],36:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _button, _li;

  return _li = document.createElement('li'), _appendChild(_li, [' ', (_button = document.createElement('button'), _button.onclick = props.getFolder, _appendChild(_button, [props.title]), _button), ' ']), _li;
};

},{"yo-yoify/lib/appendChild":29}],37:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var Breadcrumb = require('./Breadcrumb');

module.exports = function (props) {
  var _uppyProviderBreadcrumbs;

  return _uppyProviderBreadcrumbs = document.createElement('ul'), _uppyProviderBreadcrumbs.setAttribute('class', 'UppyProvider-breadcrumbs'), _appendChild(_uppyProviderBreadcrumbs, [' ', props.directories.map(function (directory) {
    return Breadcrumb({
      getFolder: function getFolder() {
        return props.getFolder(directory.id);
      },
      title: directory.title
    });
  }), ' ']), _uppyProviderBreadcrumbs;
};

},{"./Breadcrumb":36,"yo-yoify/lib/appendChild":29}],38:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var Breadcrumbs = require('./Breadcrumbs');
var Table = require('./Table');

module.exports = function (props) {
  var _browserSearch, _header, _browserUserLogout, _browserSubHeader, _browserContent, _browserBody, _browser;

  var filteredFolders = props.folders;
  var filteredFiles = props.files;

  if (props.filterInput !== '') {
    filteredFolders = props.filterItems(props.folders);
    filteredFiles = props.filterItems(props.files);
  }

  return _browser = document.createElement('div'), _browser.setAttribute('class', 'Browser'), _appendChild(_browser, [' ', (_header = document.createElement('header'), _appendChild(_header, [' ', (_browserSearch = document.createElement('input'), _browserSearch.setAttribute('type', 'text'), _browserSearch.setAttribute('placeholder', 'Search Drive'), _browserSearch.onkeyup = props.filterQuery, _browserSearch.setAttribute('value', '' + String(props.filterInput) + ''), _browserSearch.setAttribute('class', 'Browser-search'), _browserSearch), ' ']), _header), ' ', (_browserSubHeader = document.createElement('div'), _browserSubHeader.setAttribute('class', 'Browser-subHeader'), _appendChild(_browserSubHeader, [' ', Breadcrumbs({
    getFolder: props.getFolder,
    directories: props.directories
  }), ' ', (_browserUserLogout = document.createElement('button'), _browserUserLogout.onclick = props.logout, _browserUserLogout.setAttribute('class', 'Browser-userLogout'), _browserUserLogout.textContent = 'Log out', _browserUserLogout), ' ']), _browserSubHeader), ' ', (_browserBody = document.createElement('div'), _browserBody.setAttribute('class', 'Browser-body'), _appendChild(_browserBody, [' ', (_browserContent = document.createElement('main'), _browserContent.setAttribute('class', 'Browser-content'), _appendChild(_browserContent, [' ', Table({
    columns: [{
      name: 'Name',
      key: 'title'
    }],
    folders: filteredFolders,
    files: filteredFiles,
    activeRow: props.isActiveRow,
    sortByTitle: props.sortByTitle,
    sortByDate: props.sortByDate,
    handleRowClick: props.handleRowClick,
    handleFileDoubleClick: props.addFile,
    handleFolderDoubleClick: props.getNextFolder,
    getItemName: props.getItemName,
    getItemIcon: props.getItemIcon
  }), ' ']), _browserContent), ' ']), _browserBody), ' ']), _browser;
};

},{"./Breadcrumbs":37,"./Table":41,"yo-yoify/lib/appendChild":29}],39:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _span, _uppyProviderError;

  return _uppyProviderError = document.createElement('div'), _uppyProviderError.setAttribute('class', 'UppyProvider-error'), _appendChild(_uppyProviderError, [' ', (_span = document.createElement('span'), _appendChild(_span, [' Something went wrong. Probably our fault. ', props.error, ' ']), _span), ' ']), _uppyProviderError;
};

},{"yo-yoify/lib/appendChild":29}],40:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _span, _uppyProviderLoading;

  return _uppyProviderLoading = document.createElement('div'), _uppyProviderLoading.setAttribute('class', 'UppyProvider-loading'), _appendChild(_uppyProviderLoading, [' ', (_span = document.createElement('span'), _span.textContent = ' Loading ... ', _span), ' ']), _uppyProviderLoading;
};

},{"yo-yoify/lib/appendChild":29}],41:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var Row = require('./TableRow');

module.exports = function (props) {
  var _tr, _browserTableHeader, _tbody, _browserTable;

  var headers = props.columns.map(function (column) {
    var _browserTableHeaderColumn;

    return _browserTableHeaderColumn = document.createElement('th'), _browserTableHeaderColumn.onclick = props.sortByTitle, _browserTableHeaderColumn.setAttribute('class', 'BrowserTable-headerColumn BrowserTable-column'), _appendChild(_browserTableHeaderColumn, [' ', column.name, ' ']), _browserTableHeaderColumn;
  });

  return _browserTable = document.createElement('table'), _browserTable.setAttribute('class', 'BrowserTable'), _appendChild(_browserTable, [' ', (_browserTableHeader = document.createElement('thead'), _browserTableHeader.setAttribute('class', 'BrowserTable-header'), _appendChild(_browserTableHeader, [' ', (_tr = document.createElement('tr'), _appendChild(_tr, [' ', headers, ' ']), _tr), ' ']), _browserTableHeader), ' ', (_tbody = document.createElement('tbody'), _appendChild(_tbody, [' ', props.folders.map(function (folder) {
    return Row({
      title: props.getItemName(folder),
      active: props.activeRow(folder),
      getItemIcon: function getItemIcon() {
        return props.getItemIcon(folder);
      },
      handleClick: function handleClick() {
        return props.handleRowClick(folder);
      },
      handleDoubleClick: function handleDoubleClick() {
        return props.handleFolderDoubleClick(folder);
      },
      columns: props.columns
    });
  }), ' ', props.files.map(function (file) {
    return Row({
      title: props.getItemName(file),
      active: props.activeRow(file),
      getItemIcon: function getItemIcon() {
        return props.getItemIcon(file);
      },
      handleClick: function handleClick() {
        return props.handleRowClick(file);
      },
      handleDoubleClick: function handleDoubleClick() {
        return props.handleFileDoubleClick(file);
      },
      columns: props.columns
    });
  }), ' ']), _tbody), ' ']), _browserTable;
};

},{"./TableRow":43,"yo-yoify/lib/appendChild":29}],42:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _browserTableRowColumn;

  return _browserTableRowColumn = document.createElement('td'), _browserTableRowColumn.setAttribute('class', 'BrowserTable-rowColumn BrowserTable-column'), _appendChild(_browserTableRowColumn, [' ', props.getItemIcon(), ' ', props.value, ' ']), _browserTableRowColumn;
};

},{"yo-yoify/lib/appendChild":29}],43:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var Column = require('./TableColumn');

module.exports = function (props) {
  var _tr;

  var classes = props.active ? 'BrowserTable-row is-active' : 'BrowserTable-row';
  return _tr = document.createElement('tr'), _tr.onclick = props.handleClick, _tr.ondblclick = props.handleDoubleClick, _tr.setAttribute('class', '' + String(classes) + ''), _appendChild(_tr, [' ', Column({
    getItemIcon: props.getItemIcon,
    value: props.title
  }), ' ']), _tr;
};

},{"./TableColumn":42,"yo-yoify/lib/appendChild":29}],44:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AuthView = require('./AuthView');
var Browser = require('./Browser');
var ErrorView = require('./Error');
var LoaderView = require('./Loader');
var Utils = require('../core/Utils');

/**
 * Class to easily generate generic views for plugins
 *
 * This class expects the plugin using to have the following attributes
 *
 * stateId {String} object key of which the plugin state is stored
 *
 * This class also expects the plugin instance using it to have the following
 * accessor methods.
 * Each method takes the item whose property is to be accessed
 * as a param
 *
 * isFolder
 *    @return {Boolean} for if the item is a folder or not
 * getItemData
 *    @return {Object} that is format ready for uppy upload/download
 * getItemIcon
 *    @return {Object} html instance of the item's icon
 * getItemSubList
 *    @return {Array} sub-items in the item. e.g a folder may contain sub-items
 * getItemName
 *    @return {String} display friendly name of the item
 * getMimeType
 *    @return {String} mime type of the item
 * getItemId
 *    @return {String} unique id of the item
 * getItemRequestPath
 *    @return {String} unique request path of the item when making calls to uppy server
 * getItemModifiedDate
 *    @return {object} or {String} date of when last the item was modified
 */
module.exports = function () {
  /**
   * @param {object} instance of the plugin
   */
  function View(plugin) {
    _classCallCheck(this, View);

    this.plugin = plugin;
    this.Provider = plugin[plugin.id];

    // Logic
    this.addFile = this.addFile.bind(this);
    this.filterItems = this.filterItems.bind(this);
    this.filterQuery = this.filterQuery.bind(this);
    this.getFolder = this.getFolder.bind(this);
    this.getNextFolder = this.getNextFolder.bind(this);
    this.handleRowClick = this.handleRowClick.bind(this);
    this.logout = this.logout.bind(this);
    this.handleAuth = this.handleAuth.bind(this);
    this.handleDemoAuth = this.handleDemoAuth.bind(this);
    this.sortByTitle = this.sortByTitle.bind(this);
    this.sortByDate = this.sortByDate.bind(this);
    this.isActiveRow = this.isActiveRow.bind(this);
    this.handleError = this.handleError.bind(this);

    // Visual
    this.render = this.render.bind(this);
  }

  /**
   * Little shorthand to update the state with the plugin's state
   */


  View.prototype.updateState = function updateState(newState) {
    var _plugin$core$setState;

    var stateId = this.plugin.stateId;
    var state = this.plugin.core.state;


    this.plugin.core.setState((_plugin$core$setState = {}, _plugin$core$setState[stateId] = _extends({}, state[stateId], newState), _plugin$core$setState));
  };

  /**
   * Based on folder ID, fetch a new folder and update it to state
   * @param  {String} id Folder id
   * @return {Promise}   Folders/files in folder
   */


  View.prototype.getFolder = function getFolder(id, name) {
    var _this = this;

    return this._loaderWrapper(this.Provider.list(id), function (res) {
      var folders = [];
      var files = [];
      var updatedDirectories = void 0;

      var state = _this.plugin.core.getState()[_this.plugin.stateId];
      var index = state.directories.findIndex(function (dir) {
        return id === dir.id;
      });

      if (index !== -1) {
        updatedDirectories = state.directories.slice(0, index + 1);
      } else {
        updatedDirectories = state.directories.concat([{ id: id, title: name || _this.plugin.getItemName(res) }]);
      }

      _this.plugin.getItemSubList(res).forEach(function (item) {
        if (_this.plugin.isFolder(item)) {
          folders.push(item);
        } else {
          files.push(item);
        }
      });

      var data = { folders: folders, files: files, directories: updatedDirectories };
      _this.updateState(data);

      return data;
    }, this.handleError);
  };

  /**
   * Fetches new folder
   * @param  {Object} Folder
   * @param  {String} title Folder title
   */


  View.prototype.getNextFolder = function getNextFolder(folder) {
    var id = this.plugin.getItemRequestPath(folder);
    this.getFolder(id, this.plugin.getItemName(folder));
  };

  View.prototype.addFile = function addFile(file) {
    var tagFile = {
      source: this.plugin.id,
      data: this.plugin.getItemData(file),
      name: this.plugin.getItemName(file),
      type: this.plugin.getMimeType(file),
      isRemote: true,
      body: {
        fileId: this.plugin.getItemId(file)
      },
      remote: {
        host: this.plugin.opts.host,
        url: this.plugin.opts.host + '/' + this.Provider.id + '/get/' + this.plugin.getItemRequestPath(file),
        body: {
          fileId: this.plugin.getItemId(file)
        }
      }
    };

    if (Utils.getFileType(tagFile)[0] === 'image') {
      tagFile.preview = this.plugin.opts.host + '/' + this.Provider.id + '/thumbnail/' + this.plugin.getItemRequestPath(file);
    }
    console.log('adding file');
    this.plugin.core.emitter.emit('core:file-add', tagFile);
  };

  /**
   * Removes session token on client side.
   */


  View.prototype.logout = function logout() {
    var _this2 = this;

    this.Provider.logout(location.href).then(function (res) {
      return res.json();
    }).then(function (res) {
      if (res.ok) {
        var newState = {
          authenticated: false,
          files: [],
          folders: [],
          directories: []
        };
        _this2.updateState(newState);
      }
    }).catch(this.handleError);
  };

  /**
   * Used to set active file/folder.
   * @param  {Object} file   Active file/folder
   */


  View.prototype.handleRowClick = function handleRowClick(file) {
    var state = this.plugin.core.getState()[this.plugin.stateId];
    var newState = _extends({}, state, {
      activeRow: this.plugin.getItemId(file)
    });

    this.updateState(newState);
  };

  View.prototype.filterQuery = function filterQuery(e) {
    var state = this.plugin.core.getState()[this.plugin.stateId];
    this.updateState(_extends({}, state, {
      filterInput: e.target.value
    }));
  };

  View.prototype.filterItems = function filterItems(items) {
    var _this3 = this;

    var state = this.plugin.core.getState()[this.plugin.stateId];
    return items.filter(function (folder) {
      return _this3.plugin.getItemName(folder).toLowerCase().indexOf(state.filterInput.toLowerCase()) !== -1;
    });
  };

  View.prototype.sortByTitle = function sortByTitle() {
    var _this4 = this;

    var state = _extends({}, this.plugin.core.getState()[this.plugin.stateId]);
    var files = state.files,
        folders = state.folders,
        sorting = state.sorting;


    var sortedFiles = files.sort(function (fileA, fileB) {
      if (sorting === 'titleDescending') {
        return _this4.plugin.getItemName(fileB).localeCompare(_this4.plugin.getItemName(fileA));
      }
      return _this4.plugin.getItemName(fileA).localeCompare(_this4.plugin.getItemName(fileB));
    });

    var sortedFolders = folders.sort(function (folderA, folderB) {
      if (sorting === 'titleDescending') {
        return _this4.plugin.getItemName(folderB).localeCompare(_this4.plugin.getItemName(folderA));
      }
      return _this4.plugin.getItemName(folderA).localeCompare(_this4.plugin.getItemName(folderB));
    });

    this.updateState(_extends({}, state, {
      files: sortedFiles,
      folders: sortedFolders,
      sorting: sorting === 'titleDescending' ? 'titleAscending' : 'titleDescending'
    }));
  };

  View.prototype.sortByDate = function sortByDate() {
    var _this5 = this;

    var state = _extends({}, this.plugin.core.getState()[this.plugin.stateId]);
    var files = state.files,
        folders = state.folders,
        sorting = state.sorting;


    var sortedFiles = files.sort(function (fileA, fileB) {
      var a = new Date(_this5.plugin.getItemModifiedDate(fileA));
      var b = new Date(_this5.plugin.getItemModifiedDate(fileB));

      if (sorting === 'dateDescending') {
        return a > b ? -1 : a < b ? 1 : 0;
      }
      return a > b ? 1 : a < b ? -1 : 0;
    });

    var sortedFolders = folders.sort(function (folderA, folderB) {
      var a = new Date(_this5.plugin.getItemModifiedDate(folderA));
      var b = new Date(_this5.plugin.getItemModifiedDate(folderB));

      if (sorting === 'dateDescending') {
        return a > b ? -1 : a < b ? 1 : 0;
      }

      return a > b ? 1 : a < b ? -1 : 0;
    });

    this.updateState(_extends({}, state, {
      files: sortedFiles,
      folders: sortedFolders,
      sorting: sorting === 'dateDescending' ? 'dateAscending' : 'dateDescending'
    }));
  };

  View.prototype.isActiveRow = function isActiveRow(file) {
    return this.plugin.core.getState()[this.plugin.stateId].activeRow === this.plugin.getItemId(file);
  };

  View.prototype.handleDemoAuth = function handleDemoAuth() {
    var state = this.plugin.core.getState()[this.plugin.stateId];
    this.updateState({}, state, {
      authenticated: true
    });
  };

  View.prototype.handleAuth = function handleAuth() {
    var _this6 = this;

    var urlId = Math.floor(Math.random() * 999999) + 1;
    var redirect = '' + location.href + (location.search ? '&' : '?') + 'id=' + urlId;

    var authState = btoa(JSON.stringify({ redirect: redirect }));
    var link = this.plugin.opts.host + '/connect/' + this.Provider.authProvider + '?state=' + authState;

    var authWindow = window.open(link, '_blank');
    var checkAuth = function checkAuth() {
      var authWindowUrl = void 0;

      try {
        authWindowUrl = authWindow.location.href;
      } catch (e) {
        if (e instanceof DOMException || e instanceof TypeError) {
          return setTimeout(checkAuth, 100);
        } else throw e;
      }

      // split url because chrome adds '#' to redirects
      if (authWindowUrl.split('#')[0] === redirect) {
        authWindow.close();
        _this6._loaderWrapper(_this6.Provider.auth(), _this6.plugin.onAuth, _this6.handleError);
      } else {
        setTimeout(checkAuth, 100);
      }
    };

    checkAuth();
  };

  View.prototype.handleError = function handleError(error) {
    this.updateState({ error: error });
  };

  // displays loader view while asynchronous request is being made.


  View.prototype._loaderWrapper = function _loaderWrapper(promise, then, catch_) {
    var _this7 = this;

    promise.then(function (result) {
      _this7.updateState({ loading: false });
      then(result);
    }).catch(function (err) {
      _this7.updateState({ loading: false });
      catch_(err);
    });
    this.updateState({ loading: true });
  };

  View.prototype.render = function render(state) {
    var _state$plugin$stateId = state[this.plugin.stateId],
        authenticated = _state$plugin$stateId.authenticated,
        error = _state$plugin$stateId.error,
        loading = _state$plugin$stateId.loading;


    if (error) {
      this.updateState({ error: undefined });
      return ErrorView({ error: error });
    }

    if (loading) {
      return LoaderView();
    }

    if (!authenticated) {
      return AuthView({
        pluginName: this.plugin.title,
        demo: this.plugin.opts.demo,
        handleAuth: this.handleAuth,
        handleDemoAuth: this.handleDemoAuth
      });
    }

    var browserProps = _extends({}, state[this.plugin.stateId], {
      getNextFolder: this.getNextFolder,
      getFolder: this.getFolder,
      addFile: this.addFile,
      filterItems: this.filterItems,
      filterQuery: this.filterQuery,
      handleRowClick: this.handleRowClick,
      sortByTitle: this.sortByTitle,
      sortByDate: this.sortByDate,
      logout: this.logout,
      demo: this.plugin.opts.demo,
      isActiveRow: this.isActiveRow,
      getItemName: this.plugin.getItemName,
      getItemIcon: this.plugin.getItemIcon
    });

    return Browser(browserProps);
  };

  return View;
}();

},{"../core/Utils":33,"./AuthView":35,"./Browser":38,"./Error":39,"./Loader":40}],45:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _uppyDashboardInput, _uppyDashboardBrowse, _span;

  var input = (_uppyDashboardInput = document.createElement('input'), _uppyDashboardInput.setAttribute('type', 'file'), _uppyDashboardInput.setAttribute('name', 'files[]'), 'true' && _uppyDashboardInput.setAttribute('multiple', 'multiple'), _uppyDashboardInput.onchange = props.handleInputChange, _uppyDashboardInput.setAttribute('class', 'UppyDashboard-input'), _uppyDashboardInput);

  return _span = document.createElement('span'), _appendChild(_span, [' ', props.acquirers.length === 0 ? props.i18n('dropPaste') : props.i18n('dropPasteImport'), ' ', (_uppyDashboardBrowse = document.createElement('button'), _uppyDashboardBrowse.setAttribute('type', 'button'), _uppyDashboardBrowse.onclick = function (ev) {
    input.click();
  }, _uppyDashboardBrowse.setAttribute('class', 'UppyDashboard-browse'), _appendChild(_uppyDashboardBrowse, [props.i18n('browse')]), _uppyDashboardBrowse), ' ', input, ' ']), _span;
};

},{"yo-yoify/lib/appendChild":29}],46:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _onload = require('on-load');

var FileList = require('./FileList');
var Tabs = require('./Tabs');
var FileCard = require('./FileCard');
var UploadBtn = require('./UploadBtn');
var StatusBar = require('./StatusBar');

var _require = require('../../core/Utils'),
    isTouchDevice = _require.isTouchDevice,
    toArray = _require.toArray;

var _require2 = require('./icons'),
    closeIcon = _require2.closeIcon;

// http://dev.edenspiekermann.com/2016/02/11/introducing-accessible-modal-dialog

module.exports = function Dashboard(props) {
  var _uppyDashboardClose, _uppyDashboardOverlay, _uppyDashboardActions, _uppyDashboardFilesContainer, _uppyDashboardContentTitle, _uppyDashboardContentBack, _uppyDashboardContentBar, _uppyDashboardContentPanel, _uppyDashboardProgressindicators, _uppyDashboardInnerWrap, _uppyDashboardInner, _div;

  function handleInputChange(ev) {
    ev.preventDefault();
    var files = toArray(ev.target.files);

    files.forEach(function (file) {
      props.addFile({
        source: props.id,
        name: file.name,
        type: file.type,
        data: file
      });
    });
  }

  // @TODO Exprimental, work in progress
  // no names, weird API, Chrome-only http://stackoverflow.com/a/22940020
  function handlePaste(ev) {
    ev.preventDefault();

    var files = toArray(ev.clipboardData.items);
    files.forEach(function (file) {
      if (file.kind !== 'file') return;

      var blob = file.getAsFile();
      props.log('File pasted');
      props.addFile({
        source: props.id,
        name: file.name,
        type: file.type,
        data: blob
      });
    });
  }

  return _div = document.createElement('div'), _onload(_div, function () {
    return props.updateDashboardElWidth();
  }, null, 1), _div.setAttribute('aria-hidden', '' + String(props.inline ? 'false' : props.modal.isHidden) + ''), _div.setAttribute('aria-label', '' + String(!props.inline ? props.i18n('dashboardWindowTitle') : props.i18n('dashboardTitle')) + ''), _div.setAttribute('role', 'dialog'), _div.onpaste = handlePaste, _div.setAttribute('class', 'Uppy UppyTheme--default UppyDashboard\n                          ' + String(isTouchDevice() ? 'Uppy--isTouchDevice' : '') + '\n                          ' + String(props.semiTransparent ? 'UppyDashboard--semiTransparent' : '') + '\n                          ' + String(!props.inline ? 'UppyDashboard--modal' : '') + '\n                          ' + String(props.isWide ? 'UppyDashboard--wide' : '') + ''), _appendChild(_div, [' ', (_uppyDashboardClose = document.createElement('button'), _uppyDashboardClose.setAttribute('aria-label', '' + String(props.i18n('closeModal')) + ''), _uppyDashboardClose.setAttribute('title', '' + String(props.i18n('closeModal')) + ''), _uppyDashboardClose.onclick = props.hideModal, _uppyDashboardClose.setAttribute('class', 'UppyDashboard-close'), _appendChild(_uppyDashboardClose, [closeIcon()]), _uppyDashboardClose), ' ', (_uppyDashboardOverlay = document.createElement('div'), _uppyDashboardOverlay.onclick = props.hideModal, _uppyDashboardOverlay.setAttribute('class', 'UppyDashboard-overlay'), _uppyDashboardOverlay), ' ', (_uppyDashboardInner = document.createElement('div'), _uppyDashboardInner.setAttribute('tabindex', '0'), _uppyDashboardInner.setAttribute('style', '\n          ' + String(props.inline && props.maxWidth ? 'max-width: ' + props.maxWidth + 'px;' : '') + '\n          ' + String(props.inline && props.maxHeight ? 'max-height: ' + props.maxHeight + 'px;' : '') + '\n         '), _uppyDashboardInner.setAttribute('class', 'UppyDashboard-inner'), _appendChild(_uppyDashboardInner, [' ', (_uppyDashboardInnerWrap = document.createElement('div'), _uppyDashboardInnerWrap.setAttribute('class', 'UppyDashboard-innerWrap'), _appendChild(_uppyDashboardInnerWrap, [' ', Tabs({
    files: props.files,
    handleInputChange: handleInputChange,
    acquirers: props.acquirers,
    panelSelectorPrefix: props.panelSelectorPrefix,
    showPanel: props.showPanel,
    i18n: props.i18n
  }), ' ', FileCard({
    files: props.files,
    fileCardFor: props.fileCardFor,
    done: props.fileCardDone,
    metaFields: props.metaFields,
    log: props.log,
    i18n: props.i18n
  }), ' ', (_uppyDashboardFilesContainer = document.createElement('div'), _uppyDashboardFilesContainer.setAttribute('class', 'UppyDashboard-filesContainer'), _appendChild(_uppyDashboardFilesContainer, [' ', FileList({
    acquirers: props.acquirers,
    files: props.files,
    handleInputChange: handleInputChange,
    showFileCard: props.showFileCard,
    showProgressDetails: props.showProgressDetails,
    totalProgress: props.totalProgress,
    totalFileCount: props.totalFileCount,
    info: props.info,
    i18n: props.i18n,
    log: props.log,
    removeFile: props.removeFile,
    pauseAll: props.pauseAll,
    resumeAll: props.resumeAll,
    pauseUpload: props.pauseUpload,
    startUpload: props.startUpload,
    cancelUpload: props.cancelUpload,
    resumableUploads: props.resumableUploads,
    isWide: props.isWide
  }), ' ', (_uppyDashboardActions = document.createElement('div'), _uppyDashboardActions.setAttribute('class', 'UppyDashboard-actions'), _appendChild(_uppyDashboardActions, [' ', !props.autoProceed && props.newFiles.length > 0 ? UploadBtn({
    i18n: props.i18n,
    startUpload: props.startUpload,
    newFileCount: props.newFiles.length
  }) : null, ' ']), _uppyDashboardActions), ' ']), _uppyDashboardFilesContainer), ' ', (_uppyDashboardContentPanel = document.createElement('div'), _uppyDashboardContentPanel.setAttribute('role', 'tabpanel'), _uppyDashboardContentPanel.setAttribute('aria-hidden', '' + String(props.activePanel ? 'false' : 'true') + ''), _uppyDashboardContentPanel.setAttribute('class', 'UppyDashboardContent-panel'), _appendChild(_uppyDashboardContentPanel, [' ', (_uppyDashboardContentBar = document.createElement('div'), _uppyDashboardContentBar.setAttribute('class', 'UppyDashboardContent-bar'), _appendChild(_uppyDashboardContentBar, [' ', (_uppyDashboardContentTitle = document.createElement('h2'), _uppyDashboardContentTitle.setAttribute('class', 'UppyDashboardContent-title'), _appendChild(_uppyDashboardContentTitle, [' ', props.i18n('importFrom'), ' ', props.activePanel ? props.activePanel.name : null, ' ']), _uppyDashboardContentTitle), ' ', (_uppyDashboardContentBack = document.createElement('button'), _uppyDashboardContentBack.onclick = props.hideAllPanels, _uppyDashboardContentBack.setAttribute('class', 'UppyDashboardContent-back'), _appendChild(_uppyDashboardContentBack, [props.i18n('done')]), _uppyDashboardContentBack), ' ']), _uppyDashboardContentBar), ' ', props.activePanel ? props.activePanel.render(props.state) : '', ' ']), _uppyDashboardContentPanel), ' ', (_uppyDashboardProgressindicators = document.createElement('div'), _uppyDashboardProgressindicators.setAttribute('class', 'UppyDashboard-progressindicators'), _appendChild(_uppyDashboardProgressindicators, [' ', StatusBar({
    totalProgress: props.totalProgress,
    totalFileCount: props.totalFileCount,
    totalSize: props.totalSize,
    totalUploadedSize: props.totalUploadedSize,
    uploadStartedFiles: props.uploadStartedFiles,
    isAllComplete: props.isAllComplete,
    isAllPaused: props.isAllPaused,
    isUploadStarted: props.isUploadStarted,
    pauseAll: props.pauseAll,
    resumeAll: props.resumeAll,
    cancelAll: props.cancelAll,
    complete: props.completeFiles.length,
    inProgress: props.inProgress,
    totalSpeed: props.totalSpeed,
    totalETA: props.totalETA,
    startUpload: props.startUpload,
    newFileCount: props.newFiles.length,
    i18n: props.i18n,
    resumableUploads: props.resumableUploads
  }), ' ', props.progressindicators.map(function (target) {
    return target.render(props.state);
  }), ' ']), _uppyDashboardProgressindicators), ' ']), _uppyDashboardInnerWrap), ' ']), _uppyDashboardInner), ' ']), _div;
};

},{"../../core/Utils":33,"./FileCard":47,"./FileList":50,"./StatusBar":51,"./Tabs":52,"./UploadBtn":53,"./icons":55,"on-load":7,"yo-yoify/lib/appendChild":29}],47:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var getFileTypeIcon = require('./getFileTypeIcon');

var _require = require('./icons'),
    checkIcon = _require.checkIcon;

// function getIconByMime (fileTypeGeneral) {
//   switch (fileTypeGeneral) {
//     case 'text':
//       return iconText()
//     case 'audio':
//       return iconAudio()
//     default:
//       return iconFile()
//   }
// }

module.exports = function fileCard(props) {
  var _uppyDashboardContentTitleFile, _uppyDashboardContentTitle, _uppyDashboardContentBack, _uppyDashboardContentBar, _uppyButtonCircular, _uppyDashboardActions, _uppyDashboardFileCard, _uppyDashboardFileCardPreview, _uppyDashboardFileCardLabel2, _uppyDashboardFileCardInput2, _uppyDashboardFileCardFieldset2, _uppyDashboardFileCardInfo, _uppyDashboardFileCardInner, _img, _uppyDashboardItemPreviewIcon;

  var file = props.fileCardFor ? props.files[props.fileCardFor] : false;
  var meta = {};

  function tempStoreMeta(ev) {
    var value = ev.target.value;
    var name = ev.target.attributes.name.value;
    meta[name] = value;
  }

  function renderMetaFields(file) {
    var metaFields = props.metaFields || [];
    return metaFields.map(function (field) {
      var _uppyDashboardFileCardLabel, _uppyDashboardFileCardInput, _uppyDashboardFileCardFieldset;

      return _uppyDashboardFileCardFieldset = document.createElement('fieldset'), _uppyDashboardFileCardFieldset.setAttribute('class', 'UppyDashboardFileCard-fieldset'), _appendChild(_uppyDashboardFileCardFieldset, [' ', (_uppyDashboardFileCardLabel = document.createElement('label'), _uppyDashboardFileCardLabel.setAttribute('class', 'UppyDashboardFileCard-label'), _appendChild(_uppyDashboardFileCardLabel, [field.name]), _uppyDashboardFileCardLabel), ' ', (_uppyDashboardFileCardInput = document.createElement('input'), _uppyDashboardFileCardInput.setAttribute('name', '' + String(field.id) + ''), _uppyDashboardFileCardInput.setAttribute('type', 'text'), _uppyDashboardFileCardInput.setAttribute('value', '' + String(file.meta[field.id]) + ''), _uppyDashboardFileCardInput.setAttribute('placeholder', '' + String(field.placeholder || '') + ''), _uppyDashboardFileCardInput.onkeyup = tempStoreMeta, _uppyDashboardFileCardInput.setAttribute('class', 'UppyDashboardFileCard-input'), _uppyDashboardFileCardInput)]), _uppyDashboardFileCardFieldset;
    });
  }

  return _uppyDashboardFileCard = document.createElement('div'), _uppyDashboardFileCard.setAttribute('aria-hidden', '' + String(!props.fileCardFor) + ''), _uppyDashboardFileCard.setAttribute('class', 'UppyDashboardFileCard'), _appendChild(_uppyDashboardFileCard, [' ', (_uppyDashboardContentBar = document.createElement('div'), _uppyDashboardContentBar.setAttribute('class', 'UppyDashboardContent-bar'), _appendChild(_uppyDashboardContentBar, [' ', (_uppyDashboardContentTitle = document.createElement('h2'), _uppyDashboardContentTitle.setAttribute('class', 'UppyDashboardContent-title'), _appendChild(_uppyDashboardContentTitle, ['Editing ', (_uppyDashboardContentTitleFile = document.createElement('span'), _uppyDashboardContentTitleFile.setAttribute('class', 'UppyDashboardContent-titleFile'), _appendChild(_uppyDashboardContentTitleFile, [file.meta ? file.meta.name : file.name]), _uppyDashboardContentTitleFile)]), _uppyDashboardContentTitle), ' ', (_uppyDashboardContentBack = document.createElement('button'), _uppyDashboardContentBack.setAttribute('title', 'Finish editing file'), _uppyDashboardContentBack.onclick = function () {
    return props.done(meta, file.id);
  }, _uppyDashboardContentBack.setAttribute('class', 'UppyDashboardContent-back'), _uppyDashboardContentBack.textContent = 'Done', _uppyDashboardContentBack), ' ']), _uppyDashboardContentBar), ' ', props.fileCardFor ? (_uppyDashboardFileCardInner = document.createElement('div'), _uppyDashboardFileCardInner.setAttribute('class', 'UppyDashboardFileCard-inner'), _appendChild(_uppyDashboardFileCardInner, [' ', (_uppyDashboardFileCardPreview = document.createElement('div'), _uppyDashboardFileCardPreview.setAttribute('class', 'UppyDashboardFileCard-preview'), _appendChild(_uppyDashboardFileCardPreview, [' ', file.preview ? (_img = document.createElement('img'), _img.setAttribute('alt', '' + String(file.name) + ''), _img.setAttribute('src', '' + String(file.preview) + ''), _img) : (_uppyDashboardItemPreviewIcon = document.createElement('div'), _uppyDashboardItemPreviewIcon.setAttribute('style', 'color: ' + String(getFileTypeIcon(file.type.general, file.type.specific).color) + ''), _uppyDashboardItemPreviewIcon.setAttribute('class', 'UppyDashboardItem-previewIcon'), _appendChild(_uppyDashboardItemPreviewIcon, [' ', getFileTypeIcon(file.type.general, file.type.specific).icon, ' ']), _uppyDashboardItemPreviewIcon), ' ']), _uppyDashboardFileCardPreview), ' ', (_uppyDashboardFileCardInfo = document.createElement('div'), _uppyDashboardFileCardInfo.setAttribute('class', 'UppyDashboardFileCard-info'), _appendChild(_uppyDashboardFileCardInfo, [' ', (_uppyDashboardFileCardFieldset2 = document.createElement('fieldset'), _uppyDashboardFileCardFieldset2.setAttribute('class', 'UppyDashboardFileCard-fieldset'), _appendChild(_uppyDashboardFileCardFieldset2, [' ', (_uppyDashboardFileCardLabel2 = document.createElement('label'), _uppyDashboardFileCardLabel2.setAttribute('class', 'UppyDashboardFileCard-label'), _uppyDashboardFileCardLabel2.textContent = 'Name', _uppyDashboardFileCardLabel2), ' ', (_uppyDashboardFileCardInput2 = document.createElement('input'), _uppyDashboardFileCardInput2.setAttribute('name', 'name'), _uppyDashboardFileCardInput2.setAttribute('type', 'text'), _uppyDashboardFileCardInput2.setAttribute('value', '' + String(file.meta.name) + ''), _uppyDashboardFileCardInput2.onkeyup = tempStoreMeta, _uppyDashboardFileCardInput2.setAttribute('class', 'UppyDashboardFileCard-input'), _uppyDashboardFileCardInput2), ' ']), _uppyDashboardFileCardFieldset2), ' ', renderMetaFields(file), ' ']), _uppyDashboardFileCardInfo), ' ']), _uppyDashboardFileCardInner) : null, ' ', (_uppyDashboardActions = document.createElement('div'), _uppyDashboardActions.setAttribute('class', 'UppyDashboard-actions'), _appendChild(_uppyDashboardActions, [' ', (_uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', 'Finish editing file'), _uppyButtonCircular.onclick = function () {
    return props.done(meta, file.id);
  }, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular UppyButton--blue UppyDashboardFileCard-done'), _appendChild(_uppyButtonCircular, [checkIcon()]), _uppyButtonCircular), ' ']), _uppyDashboardActions), ' ']), _uppyDashboardFileCard;
};

},{"./getFileTypeIcon":54,"./icons":55,"yo-yoify/lib/appendChild":29}],48:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _svgNamespace = 'http://www.w3.org/2000/svg';

var _require = require('../../core/Utils'),
    getETA = _require.getETA,
    getSpeed = _require.getSpeed,
    prettyETA = _require.prettyETA,
    getFileNameAndExtension = _require.getFileNameAndExtension,
    truncateString = _require.truncateString,
    copyToClipboard = _require.copyToClipboard;

var prettyBytes = require('prettier-bytes');
var FileItemProgress = require('./FileItemProgress');
var getFileTypeIcon = require('./getFileTypeIcon');

var _require2 = require('./icons'),
    iconEdit = _require2.iconEdit,
    iconCopy = _require2.iconCopy;

module.exports = function fileItem(props) {
  var _uppyDashboardItemProgressBtn, _uppyDashboardItemProgress, _uppyDashboardItemPreview, _uppyDashboardItemName, _uppyDashboardItemStatusSize, _uppyDashboardItemStatus, _uppyDashboardItemInfo, _uppyDashboardItemAction, _li, _uppyDashboardItemSourceIcon, _img, _uppyDashboardItemPreviewIcon, _uppyDashboardItemProgressInfo, _span2, _a, _uppyDashboardItemEdit, _uppyDashboardItemCopyLink, _ellipse, _path, _uppyIcon, _uppyDashboardItemRemove;

  var file = props.file;
  var acquirers = props.acquirers;

  var isUploaded = file.progress.uploadComplete;
  var uploadInProgressOrComplete = file.progress.uploadStarted;
  var uploadInProgress = file.progress.uploadStarted && !file.progress.uploadComplete;
  var isPaused = file.isPaused || false;

  var fileName = getFileNameAndExtension(file.meta.name)[0];
  var truncatedFileName = props.isWide ? truncateString(fileName, 15) : fileName;

  return _li = document.createElement('li'), _li.setAttribute('id', 'uppy_' + String(file.id) + ''), _li.setAttribute('title', '' + String(file.meta.name) + ''), _li.setAttribute('class', 'UppyDashboardItem\n                        ' + String(uploadInProgress ? 'is-inprogress' : '') + '\n                        ' + String(isUploaded ? 'is-complete' : '') + '\n                        ' + String(isPaused ? 'is-paused' : '') + '\n                        ' + String(props.resumableUploads ? 'is-resumable' : '') + ''), _appendChild(_li, [' ', (_uppyDashboardItemPreview = document.createElement('div'), _uppyDashboardItemPreview.setAttribute('class', 'UppyDashboardItem-preview'), _appendChild(_uppyDashboardItemPreview, [' ', file.source ? (_uppyDashboardItemSourceIcon = document.createElement('div'), _uppyDashboardItemSourceIcon.setAttribute('class', 'UppyDashboardItem-sourceIcon'), _appendChild(_uppyDashboardItemSourceIcon, [' ', acquirers.map(function (acquirer) {
    var _span;

    if (acquirer.id === file.source) return _span = document.createElement('span'), _span.setAttribute('title', '' + String(acquirer.name) + ''), _appendChild(_span, [acquirer.icon()]), _span;
  }), ' ']), _uppyDashboardItemSourceIcon) : '', ' ', file.preview ? (_img = document.createElement('img'), _img.setAttribute('alt', '' + String(file.name) + ''), _img.setAttribute('src', '' + String(file.preview) + ''), _img) : (_uppyDashboardItemPreviewIcon = document.createElement('div'), _uppyDashboardItemPreviewIcon.setAttribute('style', 'color: ' + String(getFileTypeIcon(file.type.general, file.type.specific).color) + ''), _uppyDashboardItemPreviewIcon.setAttribute('class', 'UppyDashboardItem-previewIcon'), _appendChild(_uppyDashboardItemPreviewIcon, [' ', getFileTypeIcon(file.type.general, file.type.specific).icon, ' ']), _uppyDashboardItemPreviewIcon), ' ', (_uppyDashboardItemProgress = document.createElement('div'), _uppyDashboardItemProgress.setAttribute('class', 'UppyDashboardItem-progress'), _appendChild(_uppyDashboardItemProgress, [' ', (_uppyDashboardItemProgressBtn = document.createElement('button'), _uppyDashboardItemProgressBtn.setAttribute('title', '' + String(isUploaded ? 'upload complete' : props.resumableUploads ? file.isPaused ? 'resume upload' : 'pause upload' : 'cancel upload') + ''), _uppyDashboardItemProgressBtn.onclick = function (ev) {
    if (isUploaded) return;
    if (props.resumableUploads) {
      props.pauseUpload(file.id);
    } else {
      props.cancelUpload(file.id);
    }
  }, _uppyDashboardItemProgressBtn.setAttribute('class', 'UppyDashboardItem-progressBtn'), _appendChild(_uppyDashboardItemProgressBtn, [' ', FileItemProgress({
    progress: file.progress.percentage,
    fileID: file.id
  }), ' ']), _uppyDashboardItemProgressBtn), ' ', props.showProgressDetails ? (_uppyDashboardItemProgressInfo = document.createElement('div'), _uppyDashboardItemProgressInfo.setAttribute('title', '' + String(props.i18n('fileProgress')) + ''), _uppyDashboardItemProgressInfo.setAttribute('aria-label', '' + String(props.i18n('fileProgress')) + ''), _uppyDashboardItemProgressInfo.setAttribute('class', 'UppyDashboardItem-progressInfo'), _appendChild(_uppyDashboardItemProgressInfo, [' ', !file.isPaused && !isUploaded ? (_span2 = document.createElement('span'), _appendChild(_span2, [prettyETA(getETA(file.progress)), ' \u30FB \u2191 ', prettyBytes(getSpeed(file.progress)), '/s']), _span2) : null, ' ']), _uppyDashboardItemProgressInfo) : null, ' ']), _uppyDashboardItemProgress), ' ']), _uppyDashboardItemPreview), ' ', (_uppyDashboardItemInfo = document.createElement('div'), _uppyDashboardItemInfo.setAttribute('class', 'UppyDashboardItem-info'), _appendChild(_uppyDashboardItemInfo, [' ', (_uppyDashboardItemName = document.createElement('h4'), _uppyDashboardItemName.setAttribute('title', '' + String(fileName) + ''), _uppyDashboardItemName.setAttribute('class', 'UppyDashboardItem-name'), _appendChild(_uppyDashboardItemName, [' ', file.uploadURL ? (_a = document.createElement('a'), _a.setAttribute('href', '' + String(file.uploadURL) + ''), _a.setAttribute('target', '_blank'), _appendChild(_a, [' ', file.extension ? truncatedFileName + '.' + file.extension : truncatedFileName, ' ']), _a) : file.extension ? truncatedFileName + '.' + file.extension : truncatedFileName, ' ']), _uppyDashboardItemName), ' ', (_uppyDashboardItemStatus = document.createElement('div'), _uppyDashboardItemStatus.setAttribute('class', 'UppyDashboardItem-status'), _appendChild(_uppyDashboardItemStatus, [' ', (_uppyDashboardItemStatusSize = document.createElement('span'), _uppyDashboardItemStatusSize.setAttribute('class', 'UppyDashboardItem-statusSize'), _appendChild(_uppyDashboardItemStatusSize, [file.data.size ? prettyBytes(file.data.size) : '?']), _uppyDashboardItemStatusSize), ' ']), _uppyDashboardItemStatus), ' ', !uploadInProgressOrComplete ? (_uppyDashboardItemEdit = document.createElement('button'), _uppyDashboardItemEdit.setAttribute('aria-label', 'Edit file'), _uppyDashboardItemEdit.setAttribute('title', 'Edit file'), _uppyDashboardItemEdit.onclick = function (e) {
    return props.showFileCard(file.id);
  }, _uppyDashboardItemEdit.setAttribute('class', 'UppyDashboardItem-edit'), _appendChild(_uppyDashboardItemEdit, [' ', iconEdit()]), _uppyDashboardItemEdit) : null, ' ', file.uploadURL ? (_uppyDashboardItemCopyLink = document.createElement('button'), _uppyDashboardItemCopyLink.setAttribute('aria-label', 'Copy link'), _uppyDashboardItemCopyLink.setAttribute('title', 'Copy link'), _uppyDashboardItemCopyLink.onclick = function () {
    copyToClipboard(file.uploadURL, props.i18n('copyLinkToClipboardFallback')).then(function () {
      props.log('Link copied to clipboard.');
      props.info(props.i18n('copyLinkToClipboardSuccess'), 'info', 3000);
    }).catch(props.log);
  }, _uppyDashboardItemCopyLink.setAttribute('class', 'UppyDashboardItem-copyLink'), _appendChild(_uppyDashboardItemCopyLink, [iconCopy()]), _uppyDashboardItemCopyLink) : null, ' ']), _uppyDashboardItemInfo), ' ', (_uppyDashboardItemAction = document.createElement('div'), _uppyDashboardItemAction.setAttribute('class', 'UppyDashboardItem-action'), _appendChild(_uppyDashboardItemAction, [' ', !isUploaded ? (_uppyDashboardItemRemove = document.createElement('button'), _uppyDashboardItemRemove.setAttribute('aria-label', 'Remove file'), _uppyDashboardItemRemove.setAttribute('title', 'Remove file'), _uppyDashboardItemRemove.onclick = function () {
    return props.removeFile(file.id);
  }, _uppyDashboardItemRemove.setAttribute('class', 'UppyDashboardItem-remove'), _appendChild(_uppyDashboardItemRemove, [' ', (_uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '22'), _uppyIcon.setAttribute('height', '21'), _uppyIcon.setAttribute('viewBox', '0 0 18 17'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_ellipse = document.createElementNS(_svgNamespace, 'ellipse'), _ellipse.setAttribute('cx', '8.62'), _ellipse.setAttribute('cy', '8.383'), _ellipse.setAttribute('rx', '8.62'), _ellipse.setAttribute('ry', '8.383'), _ellipse), ' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('stroke', '#FFF'), _path.setAttribute('fill', '#FFF'), _path.setAttribute('d', 'M11 6.147L10.85 6 8.5 8.284 6.15 6 6 6.147 8.35 8.43 6 10.717l.15.146L8.5 8.578l2.35 2.284.15-.146L8.65 8.43z'), _path), ' ']), _uppyIcon), ' ']), _uppyDashboardItemRemove) : null, ' ']), _uppyDashboardItemAction), ' ']), _li;
};

},{"../../core/Utils":33,"./FileItemProgress":49,"./getFileTypeIcon":54,"./icons":55,"prettier-bytes":10,"yo-yoify/lib/appendChild":29}],49:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

// http://codepen.io/Harkko/pen/rVxvNM
// https://css-tricks.com/svg-line-animation-works/
// https://gist.github.com/eswak/ad4ea57bcd5ff7aa5d42

// circle length equals 2 * PI * R
var circleLength = 2 * Math.PI * 15;

// stroke-dashoffset is a percentage of the progress from circleLength,
// substracted from circleLength, because its an offset
module.exports = function (props) {
  var _bg, _progress, _progressGroup, _play, _rect, _rect2, _pause, _check, _cancel, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '70'), _uppyIcon.setAttribute('height', '70'), _uppyIcon.setAttribute('viewBox', '0 0 36 36'), _uppyIcon.setAttribute('class', 'UppyIcon UppyIcon-progressCircle'), _appendChild(_uppyIcon, [' ', (_progressGroup = document.createElementNS(_svgNamespace, 'g'), _progressGroup.setAttribute('class', 'progress-group'), _appendChild(_progressGroup, [' ', (_bg = document.createElementNS(_svgNamespace, 'circle'), _bg.setAttribute('r', '15'), _bg.setAttribute('cx', '18'), _bg.setAttribute('cy', '18'), _bg.setAttribute('stroke-width', '2'), _bg.setAttribute('fill', 'none'), _bg.setAttribute('class', 'bg'), _bg), ' ', (_progress = document.createElementNS(_svgNamespace, 'circle'), _progress.setAttribute('r', '15'), _progress.setAttribute('cx', '18'), _progress.setAttribute('cy', '18'), _progress.setAttribute('transform', 'rotate(-90, 18, 18)'), _progress.setAttribute('stroke-width', '2'), _progress.setAttribute('fill', 'none'), _progress.setAttribute('stroke-dasharray', '' + String(circleLength) + ''), _progress.setAttribute('stroke-dashoffset', '' + String(circleLength - circleLength / 100 * props.progress) + ''), _progress.setAttribute('class', 'progress'), _progress), ' ']), _progressGroup), ' ', (_play = document.createElementNS(_svgNamespace, 'polygon'), _play.setAttribute('transform', 'translate(3, 3)'), _play.setAttribute('points', '12 20 12 10 20 15'), _play.setAttribute('class', 'play'), _play), ' ', (_pause = document.createElementNS(_svgNamespace, 'g'), _pause.setAttribute('transform', 'translate(14.5, 13)'), _pause.setAttribute('class', 'pause'), _appendChild(_pause, [' ', (_rect = document.createElementNS(_svgNamespace, 'rect'), _rect.setAttribute('x', '0'), _rect.setAttribute('y', '0'), _rect.setAttribute('width', '2'), _rect.setAttribute('height', '10'), _rect.setAttribute('rx', '0'), _rect), ' ', (_rect2 = document.createElementNS(_svgNamespace, 'rect'), _rect2.setAttribute('x', '5'), _rect2.setAttribute('y', '0'), _rect2.setAttribute('width', '2'), _rect2.setAttribute('height', '10'), _rect2.setAttribute('rx', '0'), _rect2), ' ']), _pause), ' ', (_check = document.createElementNS(_svgNamespace, 'polygon'), _check.setAttribute('transform', 'translate(2, 3)'), _check.setAttribute('points', '14 22.5 7 15.2457065 8.99985857 13.1732815 14 18.3547104 22.9729883 9 25 11.1005634'), _check.setAttribute('class', 'check'), _check), ' ', (_cancel = document.createElementNS(_svgNamespace, 'polygon'), _cancel.setAttribute('transform', 'translate(2, 2)'), _cancel.setAttribute('points', '19.8856516 11.0625 16 14.9481516 12.1019737 11.0625 11.0625 12.1143484 14.9481516 16 11.0625 19.8980263 12.1019737 20.9375 16 17.0518484 19.8856516 20.9375 20.9375 19.8980263 17.0518484 16 20.9375 12'), _cancel.setAttribute('class', 'cancel'), _cancel)]), _uppyIcon;
};

},{"yo-yoify/lib/appendChild":29}],50:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var FileItem = require('./FileItem');
var ActionBrowseTagline = require('./ActionBrowseTagline');

var _require = require('./icons'),
    dashboardBgIcon = _require.dashboardBgIcon;

module.exports = function (props) {
  var _ul, _uppyDashboardDropFilesTitle, _uppyDashboardInput, _uppyDashboardBgIcon;

  return _ul = document.createElement('ul'), _ul.setAttribute('class', 'UppyDashboard-files\n                         ' + String(props.totalFileCount === 0 ? 'UppyDashboard-files--noFiles' : '') + ''), _appendChild(_ul, [' ', props.totalFileCount === 0 ? (_uppyDashboardBgIcon = document.createElement('div'), _uppyDashboardBgIcon.setAttribute('class', 'UppyDashboard-bgIcon'), _appendChild(_uppyDashboardBgIcon, [' ', dashboardBgIcon(), ' ', (_uppyDashboardDropFilesTitle = document.createElement('h3'), _uppyDashboardDropFilesTitle.setAttribute('class', 'UppyDashboard-dropFilesTitle'), _appendChild(_uppyDashboardDropFilesTitle, [' ', ActionBrowseTagline({
    acquirers: props.acquirers,
    handleInputChange: props.handleInputChange,
    i18n: props.i18n
  }), ' ']), _uppyDashboardDropFilesTitle), ' ', (_uppyDashboardInput = document.createElement('input'), _uppyDashboardInput.setAttribute('type', 'file'), _uppyDashboardInput.setAttribute('name', 'files[]'), 'true' && _uppyDashboardInput.setAttribute('multiple', 'multiple'), _uppyDashboardInput.onchange = props.handleInputChange, _uppyDashboardInput.setAttribute('class', 'UppyDashboard-input'), _uppyDashboardInput), ' ']), _uppyDashboardBgIcon) : null, ' ', Object.keys(props.files).map(function (fileID) {
    return FileItem({
      acquirers: props.acquirers,
      file: props.files[fileID],
      showFileCard: props.showFileCard,
      showProgressDetails: props.showProgressDetails,
      info: props.info,
      log: props.log,
      i18n: props.i18n,
      removeFile: props.removeFile,
      pauseUpload: props.pauseUpload,
      cancelUpload: props.cancelUpload,
      resumableUploads: props.resumableUploads,
      isWide: props.isWide
    });
  }), ' ']), _ul;
};

},{"./ActionBrowseTagline":45,"./FileItem":48,"./icons":55,"yo-yoify/lib/appendChild":29}],51:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _svgNamespace = 'http://www.w3.org/2000/svg';

var throttle = require('lodash.throttle');

function progressBarWidth(props) {
  return props.totalProgress;
}

function progressDetails(props) {
  var _span;

  // console.log(Date.now())
  return _span = document.createElement('span'), _appendChild(_span, [props.totalProgress || 0, '%\u30FB', props.complete, ' / ', props.inProgress, '\u30FB', props.totalUploadedSize, ' / ', props.totalSize, '\u30FB\u2191 ', props.totalSpeed, '/s\u30FB', props.totalETA]), _span;
}

var throttledProgressDetails = throttle(progressDetails, 1000, { leading: true, trailing: true });
// const throttledProgressBarWidth = throttle(progressBarWidth, 300, {leading: true, trailing: true})

module.exports = function (props) {
  var _progress, _uppyDashboardStatusBarProgress, _uppyDashboardStatusBarContent, _div, _span2, _span3, _path, _uppyDashboardStatusBarAction, _span4;

  props = props || {};

  var isHidden = props.totalFileCount === 0 || !props.isUploadStarted;

  return _div = document.createElement('div'), _div.setAttribute('aria-hidden', '' + String(isHidden) + ''), _div.setAttribute('title', ''), _div.setAttribute('class', 'UppyDashboard-statusBar\n                ' + String(props.isAllComplete ? 'is-complete' : '') + ''), _appendChild(_div, [' ', (_progress = document.createElement('progress'), _progress.setAttribute('style', 'display: none;'), _progress.setAttribute('min', '0'), _progress.setAttribute('max', '100'), _progress.setAttribute('value', '' + String(props.totalProgress) + ''), _progress), ' ', (_uppyDashboardStatusBarProgress = document.createElement('div'), _uppyDashboardStatusBarProgress.setAttribute('style', 'width: ' + String(progressBarWidth(props)) + '%'), _uppyDashboardStatusBarProgress.setAttribute('class', 'UppyDashboard-statusBarProgress'), _uppyDashboardStatusBarProgress), ' ', (_uppyDashboardStatusBarContent = document.createElement('div'), _uppyDashboardStatusBarContent.setAttribute('class', 'UppyDashboard-statusBarContent'), _appendChild(_uppyDashboardStatusBarContent, [' ', props.isUploadStarted && !props.isAllComplete ? !props.isAllPaused ? (_span2 = document.createElement('span'), _span2.setAttribute('title', 'Uploading'), _appendChild(_span2, [pauseResumeButtons(props), ' Uploading... ', throttledProgressDetails(props)]), _span2) : (_span3 = document.createElement('span'), _span3.setAttribute('title', 'Paused'), _appendChild(_span3, [pauseResumeButtons(props), ' Paused\u30FB', props.totalProgress, '%']), _span3) : null, ' ', props.isAllComplete ? (_span4 = document.createElement('span'), _span4.setAttribute('title', 'Complete'), _appendChild(_span4, [(_uppyDashboardStatusBarAction = document.createElementNS(_svgNamespace, 'svg'), _uppyDashboardStatusBarAction.setAttribute('width', '18'), _uppyDashboardStatusBarAction.setAttribute('height', '17'), _uppyDashboardStatusBarAction.setAttribute('viewBox', '0 0 23 17'), _uppyDashboardStatusBarAction.setAttribute('class', 'UppyDashboard-statusBarAction UppyIcon'), _appendChild(_uppyDashboardStatusBarAction, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M8.944 17L0 7.865l2.555-2.61 6.39 6.525L20.41 0 23 2.645z'), _path), ' ']), _uppyDashboardStatusBarAction), 'Upload complete\u30FB', props.totalProgress, '%']), _span4) : null, ' ']), _uppyDashboardStatusBarContent), ' ']), _div;
};

var pauseResumeButtons = function pauseResumeButtons(props) {
  var _uppyDashboardStatusBarAction2, _path2, _uppyIcon, _path3, _uppyIcon2, _path4, _uppyIcon3;

  var title = props.resumableUploads ? props.isAllPaused ? 'resume upload' : 'pause upload' : 'cancel upload';

  return _uppyDashboardStatusBarAction2 = document.createElement('button'), _uppyDashboardStatusBarAction2.setAttribute('title', '' + String(title) + ''), _uppyDashboardStatusBarAction2.setAttribute('type', 'button'), _uppyDashboardStatusBarAction2.onclick = function () {
    return togglePauseResume(props);
  }, _uppyDashboardStatusBarAction2.setAttribute('class', 'UppyDashboard-statusBarAction'), _appendChild(_uppyDashboardStatusBarAction2, [' ', props.resumableUploads ? props.isAllPaused ? (_uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '15'), _uppyIcon.setAttribute('height', '17'), _uppyIcon.setAttribute('viewBox', '0 0 11 13'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M1.26 12.534a.67.67 0 0 1-.674.012.67.67 0 0 1-.336-.583v-11C.25.724.38.5.586.382a.658.658 0 0 1 .673.012l9.165 5.5a.66.66 0 0 1 .325.57.66.66 0 0 1-.325.573l-9.166 5.5z'), _path2), ' ']), _uppyIcon) : (_uppyIcon2 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon2.setAttribute('width', '16'), _uppyIcon2.setAttribute('height', '17'), _uppyIcon2.setAttribute('viewBox', '0 0 12 13'), _uppyIcon2.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon2, [' ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M4.888.81v11.38c0 .446-.324.81-.722.81H2.722C2.324 13 2 12.636 2 12.19V.81c0-.446.324-.81.722-.81h1.444c.398 0 .722.364.722.81zM9.888.81v11.38c0 .446-.324.81-.722.81H7.722C7.324 13 7 12.636 7 12.19V.81c0-.446.324-.81.722-.81h1.444c.398 0 .722.364.722.81z'), _path3), ' ']), _uppyIcon2) : (_uppyIcon3 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon3.setAttribute('width', '16px'), _uppyIcon3.setAttribute('height', '16px'), _uppyIcon3.setAttribute('viewBox', '0 0 19 19'), _uppyIcon3.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon3, [' ', (_path4 = document.createElementNS(_svgNamespace, 'path'), _path4.setAttribute('d', 'M17.318 17.232L9.94 9.854 9.586 9.5l-.354.354-7.378 7.378h.707l-.62-.62v.706L9.318 9.94l.354-.354-.354-.354L1.94 1.854v.707l.62-.62h-.706l7.378 7.378.354.354.354-.354 7.378-7.378h-.707l.622.62v-.706L9.854 9.232l-.354.354.354.354 7.378 7.378.708-.707-7.38-7.378v.708l7.38-7.38.353-.353-.353-.353-.622-.622-.353-.353-.354.352-7.378 7.38h.708L2.56 1.23 2.208.88l-.353.353-.622.62-.353.355.352.353 7.38 7.38v-.708l-7.38 7.38-.353.353.352.353.622.622.353.353.354-.353 7.38-7.38h-.708l7.38 7.38z'), _path4), ' ']), _uppyIcon3), ' ']), _uppyDashboardStatusBarAction2;
};

var togglePauseResume = function togglePauseResume(props) {
  if (props.isAllComplete) return;

  if (!props.resumableUploads) {
    return props.cancelAll();
  }

  if (props.isAllPaused) {
    return props.resumeAll();
  }

  return props.pauseAll();
};

},{"lodash.throttle":5,"yo-yoify/lib/appendChild":29}],52:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var ActionBrowseTagline = require('./ActionBrowseTagline');

var _require = require('./icons'),
    localIcon = _require.localIcon;

module.exports = function (props) {
  var _uppyDashboardInput, _uppyDashboardTabName, _uppyDashboardTabBtn, _uppyDashboardTab, _uppyDashboardTabsList, _nav, _uppyDashboardTabs2;

  var isHidden = Object.keys(props.files).length === 0;

  if (props.acquirers.length === 0) {
    var _uppyDashboardTabsTitle, _uppyDashboardTabs;

    return _uppyDashboardTabs = document.createElement('div'), _uppyDashboardTabs.setAttribute('aria-hidden', '' + String(isHidden) + ''), _uppyDashboardTabs.setAttribute('class', 'UppyDashboardTabs'), _appendChild(_uppyDashboardTabs, [' ', (_uppyDashboardTabsTitle = document.createElement('h3'), _uppyDashboardTabsTitle.setAttribute('class', 'UppyDashboardTabs-title'), _appendChild(_uppyDashboardTabsTitle, [' ', ActionBrowseTagline({
      acquirers: props.acquirers,
      handleInputChange: props.handleInputChange,
      i18n: props.i18n
    }), ' ']), _uppyDashboardTabsTitle), ' ']), _uppyDashboardTabs;
  }

  var input = (_uppyDashboardInput = document.createElement('input'), _uppyDashboardInput.setAttribute('type', 'file'), _uppyDashboardInput.setAttribute('name', 'files[]'), 'true' && _uppyDashboardInput.setAttribute('multiple', 'multiple'), _uppyDashboardInput.onchange = props.handleInputChange, _uppyDashboardInput.setAttribute('class', 'UppyDashboard-input'), _uppyDashboardInput);

  return _uppyDashboardTabs2 = document.createElement('div'), _uppyDashboardTabs2.setAttribute('class', 'UppyDashboardTabs'), _appendChild(_uppyDashboardTabs2, [' ', (_nav = document.createElement('nav'), _appendChild(_nav, [' ', (_uppyDashboardTabsList = document.createElement('ul'), _uppyDashboardTabsList.setAttribute('role', 'tablist'), _uppyDashboardTabsList.setAttribute('class', 'UppyDashboardTabs-list'), _appendChild(_uppyDashboardTabsList, [' ', (_uppyDashboardTab = document.createElement('li'), _uppyDashboardTab.setAttribute('class', 'UppyDashboardTab'), _appendChild(_uppyDashboardTab, [' ', (_uppyDashboardTabBtn = document.createElement('button'), _uppyDashboardTabBtn.setAttribute('type', 'button'), _uppyDashboardTabBtn.setAttribute('role', 'tab'), _uppyDashboardTabBtn.setAttribute('tabindex', '0'), _uppyDashboardTabBtn.onclick = function (ev) {
    input.click();
  }, _uppyDashboardTabBtn.setAttribute('class', 'UppyDashboardTab-btn UppyDashboard-focus'), _appendChild(_uppyDashboardTabBtn, [' ', localIcon(), ' ', (_uppyDashboardTabName = document.createElement('h5'), _uppyDashboardTabName.setAttribute('class', 'UppyDashboardTab-name'), _appendChild(_uppyDashboardTabName, [props.i18n('localDisk')]), _uppyDashboardTabName), ' ']), _uppyDashboardTabBtn), ' ', input, ' ']), _uppyDashboardTab), ' ', props.acquirers.map(function (target) {
    var _uppyDashboardTabName2, _uppyDashboardTabBtn2, _uppyDashboardTab2;

    return _uppyDashboardTab2 = document.createElement('li'), _uppyDashboardTab2.setAttribute('class', 'UppyDashboardTab'), _appendChild(_uppyDashboardTab2, [' ', (_uppyDashboardTabBtn2 = document.createElement('button'), _uppyDashboardTabBtn2.setAttribute('role', 'tab'), _uppyDashboardTabBtn2.setAttribute('tabindex', '0'), _uppyDashboardTabBtn2.setAttribute('aria-controls', 'UppyDashboardContent-panel--' + String(target.id) + ''), _uppyDashboardTabBtn2.setAttribute('aria-selected', '' + String(target.isHidden ? 'false' : 'true') + ''), _uppyDashboardTabBtn2.onclick = function () {
      return props.showPanel(target.id);
    }, _uppyDashboardTabBtn2.setAttribute('class', 'UppyDashboardTab-btn'), _appendChild(_uppyDashboardTabBtn2, [' ', target.icon(), ' ', (_uppyDashboardTabName2 = document.createElement('h5'), _uppyDashboardTabName2.setAttribute('class', 'UppyDashboardTab-name'), _appendChild(_uppyDashboardTabName2, [target.name]), _uppyDashboardTabName2), ' ']), _uppyDashboardTabBtn2), ' ']), _uppyDashboardTab2;
  }), ' ']), _uppyDashboardTabsList), ' ']), _nav), ' ']), _uppyDashboardTabs2;
};

},{"./ActionBrowseTagline":45,"./icons":55,"yo-yoify/lib/appendChild":29}],53:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var _require = require('./icons'),
    uploadIcon = _require.uploadIcon;

module.exports = function (props) {
  var _uppyDashboardUploadCount, _uppyButtonCircular;

  props = props || {};

  return _uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', '' + String(props.i18n('uploadAllNewFiles')) + ''), _uppyButtonCircular.setAttribute('aria-label', '' + String(props.i18n('uploadAllNewFiles')) + ''), _uppyButtonCircular.onclick = props.startUpload, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular\n                   UppyButton--blue\n                   UppyDashboard-upload'), _appendChild(_uppyButtonCircular, [' ', uploadIcon(), ' ', (_uppyDashboardUploadCount = document.createElement('sup'), _uppyDashboardUploadCount.setAttribute('title', '' + String(props.i18n('numberOfSelectedFiles')) + ''), _uppyDashboardUploadCount.setAttribute('aria-label', '' + String(props.i18n('numberOfSelectedFiles')) + ''), _uppyDashboardUploadCount.setAttribute('class', 'UppyDashboard-uploadCount'), _appendChild(_uppyDashboardUploadCount, [' ', props.newFileCount]), _uppyDashboardUploadCount), ' ']), _uppyButtonCircular;
};

},{"./icons":55,"yo-yoify/lib/appendChild":29}],54:[function(require,module,exports){
'use strict';

var _require = require('./icons'),
    iconText = _require.iconText,
    iconFile = _require.iconFile,
    iconAudio = _require.iconAudio,
    iconVideo = _require.iconVideo,
    iconPDF = _require.iconPDF;

module.exports = function getIconByMime(fileTypeGeneral, fileTypeSpecific) {
  if (fileTypeGeneral === 'text') {
    return {
      color: '#000',
      icon: iconText()
    };
  }

  if (fileTypeGeneral === 'audio') {
    return {
      color: '#1abc9c',
      icon: iconAudio()
    };
  }

  if (fileTypeGeneral === 'video') {
    return {
      color: '#2980b9',
      icon: iconVideo()
    };
  }

  if (fileTypeGeneral === 'application' && fileTypeSpecific === 'pdf') {
    return {
      color: '#e74c3c',
      icon: iconPDF()
    };
  }

  return {
    color: '#000',
    icon: iconFile()
  };
};

},{"./icons":55}],55:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

// https://css-tricks.com/creating-svg-icon-system-react/

function defaultTabIcon() {
  var _path, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '30'), _uppyIcon.setAttribute('height', '30'), _uppyIcon.setAttribute('viewBox', '0 0 30 30'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M15 30c8.284 0 15-6.716 15-15 0-8.284-6.716-15-15-15C6.716 0 0 6.716 0 15c0 8.284 6.716 15 15 15zm4.258-12.676v6.846h-8.426v-6.846H5.204l9.82-12.364 9.82 12.364H19.26z'), _path), ' ']), _uppyIcon;
}

function iconCopy() {
  var _path2, _path3, _uppyIcon2;

  return _uppyIcon2 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon2.setAttribute('width', '51'), _uppyIcon2.setAttribute('height', '51'), _uppyIcon2.setAttribute('viewBox', '0 0 51 51'), _uppyIcon2.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon2, [' ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M17.21 45.765a5.394 5.394 0 0 1-7.62 0l-4.12-4.122a5.393 5.393 0 0 1 0-7.618l6.774-6.775-2.404-2.404-6.775 6.776c-3.424 3.427-3.424 9 0 12.426l4.12 4.123a8.766 8.766 0 0 0 6.216 2.57c2.25 0 4.5-.858 6.214-2.57l13.55-13.552a8.72 8.72 0 0 0 2.575-6.213 8.73 8.73 0 0 0-2.575-6.213l-4.123-4.12-2.404 2.404 4.123 4.12a5.352 5.352 0 0 1 1.58 3.81c0 1.438-.562 2.79-1.58 3.808l-13.55 13.55z'), _path2), ' ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M44.256 2.858A8.728 8.728 0 0 0 38.043.283h-.002a8.73 8.73 0 0 0-6.212 2.574l-13.55 13.55a8.725 8.725 0 0 0-2.575 6.214 8.73 8.73 0 0 0 2.574 6.216l4.12 4.12 2.405-2.403-4.12-4.12a5.357 5.357 0 0 1-1.58-3.812c0-1.437.562-2.79 1.58-3.808l13.55-13.55a5.348 5.348 0 0 1 3.81-1.58c1.44 0 2.792.562 3.81 1.58l4.12 4.12c2.1 2.1 2.1 5.518 0 7.617L39.2 23.775l2.404 2.404 6.775-6.777c3.426-3.427 3.426-9 0-12.426l-4.12-4.12z'), _path3), ' ']), _uppyIcon2;
}

function iconResume() {
  var _play, _uppyIcon3;

  return _uppyIcon3 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon3.setAttribute('width', '25'), _uppyIcon3.setAttribute('height', '25'), _uppyIcon3.setAttribute('viewBox', '0 0 44 44'), _uppyIcon3.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon3, [' ', (_play = document.createElementNS(_svgNamespace, 'polygon'), _play.setAttribute('transform', 'translate(6, 5.5)'), _play.setAttribute('points', '13 21.6666667 13 11 21 16.3333333'), _play.setAttribute('class', 'play'), _play), ' ']), _uppyIcon3;
}

function iconPause() {
  var _rect, _rect2, _pause, _uppyIcon4;

  return _uppyIcon4 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon4.setAttribute('width', '25px'), _uppyIcon4.setAttribute('height', '25px'), _uppyIcon4.setAttribute('viewBox', '0 0 44 44'), _uppyIcon4.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon4, [' ', (_pause = document.createElementNS(_svgNamespace, 'g'), _pause.setAttribute('transform', 'translate(18, 17)'), _pause.setAttribute('class', 'pause'), _appendChild(_pause, [' ', (_rect = document.createElementNS(_svgNamespace, 'rect'), _rect.setAttribute('x', '0'), _rect.setAttribute('y', '0'), _rect.setAttribute('width', '2'), _rect.setAttribute('height', '10'), _rect.setAttribute('rx', '0'), _rect), ' ', (_rect2 = document.createElementNS(_svgNamespace, 'rect'), _rect2.setAttribute('x', '6'), _rect2.setAttribute('y', '0'), _rect2.setAttribute('width', '2'), _rect2.setAttribute('height', '10'), _rect2.setAttribute('rx', '0'), _rect2), ' ']), _pause), ' ']), _uppyIcon4;
}

function iconEdit() {
  var _path4, _uppyIcon5;

  return _uppyIcon5 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon5.setAttribute('width', '28'), _uppyIcon5.setAttribute('height', '28'), _uppyIcon5.setAttribute('viewBox', '0 0 28 28'), _uppyIcon5.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon5, [' ', (_path4 = document.createElementNS(_svgNamespace, 'path'), _path4.setAttribute('d', 'M25.436 2.566a7.98 7.98 0 0 0-2.078-1.51C22.638.703 21.906.5 21.198.5a3 3 0 0 0-1.023.17 2.436 2.436 0 0 0-.893.562L2.292 18.217.5 27.5l9.28-1.796 16.99-16.99c.255-.254.444-.56.562-.888a3 3 0 0 0 .17-1.023c0-.708-.205-1.44-.555-2.16a8 8 0 0 0-1.51-2.077zM9.01 24.252l-4.313.834c0-.03.008-.06.012-.09.007-.944-.74-1.715-1.67-1.723-.04 0-.078.007-.118.01l.83-4.29L17.72 5.024l5.264 5.264L9.01 24.252zm16.84-16.96a.818.818 0 0 1-.194.31l-1.57 1.57-5.26-5.26 1.57-1.57a.82.82 0 0 1 .31-.194 1.45 1.45 0 0 1 .492-.074c.397 0 .917.126 1.468.397.55.27 1.13.678 1.656 1.21.53.53.94 1.11 1.208 1.655.272.55.397 1.07.393 1.468.004.193-.027.358-.074.488z'), _path4), ' ']), _uppyIcon5;
}

function localIcon() {
  var _path5, _path6, _uppyIcon6;

  return _uppyIcon6 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon6.setAttribute('width', '27'), _uppyIcon6.setAttribute('height', '25'), _uppyIcon6.setAttribute('viewBox', '0 0 27 25'), _uppyIcon6.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon6, [' ', (_path5 = document.createElementNS(_svgNamespace, 'path'), _path5.setAttribute('d', 'M5.586 9.288a.313.313 0 0 0 .282.176h4.84v3.922c0 1.514 1.25 2.24 2.792 2.24 1.54 0 2.79-.726 2.79-2.24V9.464h4.84c.122 0 .23-.068.284-.176a.304.304 0 0 0-.046-.324L13.735.106a.316.316 0 0 0-.472 0l-7.63 8.857a.302.302 0 0 0-.047.325z'), _path5), ' ', (_path6 = document.createElementNS(_svgNamespace, 'path'), _path6.setAttribute('d', 'M24.3 5.093c-.218-.76-.54-1.187-1.208-1.187h-4.856l1.018 1.18h3.948l2.043 11.038h-7.193v2.728H9.114v-2.725h-7.36l2.66-11.04h3.33l1.018-1.18H3.907c-.668 0-1.06.46-1.21 1.186L0 16.456v7.062C0 24.338.676 25 1.51 25h23.98c.833 0 1.51-.663 1.51-1.482v-7.062L24.3 5.093z'), _path6), ' ']), _uppyIcon6;
}

function closeIcon() {
  var _path7, _uppyIcon7;

  return _uppyIcon7 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon7.setAttribute('width', '14px'), _uppyIcon7.setAttribute('height', '14px'), _uppyIcon7.setAttribute('viewBox', '0 0 19 19'), _uppyIcon7.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon7, [' ', (_path7 = document.createElementNS(_svgNamespace, 'path'), _path7.setAttribute('d', 'M17.318 17.232L9.94 9.854 9.586 9.5l-.354.354-7.378 7.378h.707l-.62-.62v.706L9.318 9.94l.354-.354-.354-.354L1.94 1.854v.707l.62-.62h-.706l7.378 7.378.354.354.354-.354 7.378-7.378h-.707l.622.62v-.706L9.854 9.232l-.354.354.354.354 7.378 7.378.708-.707-7.38-7.378v.708l7.38-7.38.353-.353-.353-.353-.622-.622-.353-.353-.354.352-7.378 7.38h.708L2.56 1.23 2.208.88l-.353.353-.622.62-.353.355.352.353 7.38 7.38v-.708l-7.38 7.38-.353.353.352.353.622.622.353.353.354-.353 7.38-7.38h-.708l7.38 7.38z'), _path7), ' ']), _uppyIcon7;
}

function pluginIcon() {
  var _path8, _path9, _uppyIcon8;

  return _uppyIcon8 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon8.setAttribute('width', '16px'), _uppyIcon8.setAttribute('height', '16px'), _uppyIcon8.setAttribute('viewBox', '0 0 32 30'), _uppyIcon8.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon8, [' ', (_path8 = document.createElementNS(_svgNamespace, 'path'), _path8.setAttribute('d', 'M6.6209894,11.1451162 C6.6823051,11.2751669 6.81374248,11.3572188 6.95463813,11.3572188 L12.6925482,11.3572188 L12.6925482,16.0630427 C12.6925482,17.880509 14.1726048,18.75 16.0000083,18.75 C17.8261072,18.75 19.3074684,17.8801847 19.3074684,16.0630427 L19.3074684,11.3572188 L25.0437478,11.3572188 C25.1875787,11.3572188 25.3164069,11.2751669 25.3790272,11.1451162 C25.4370814,11.0173358 25.4171865,10.8642587 25.3252129,10.7562615 L16.278212,0.127131837 C16.2093949,0.0463771751 16.1069846,0 15.9996822,0 C15.8910751,0 15.7886648,0.0463771751 15.718217,0.127131837 L6.6761083,10.7559371 C6.58250402,10.8642587 6.56293518,11.0173358 6.6209894,11.1451162 L6.6209894,11.1451162 Z'), _path8), ' ', (_path9 = document.createElementNS(_svgNamespace, 'path'), _path9.setAttribute('d', 'M28.8008722,6.11142645 C28.5417891,5.19831555 28.1583331,4.6875 27.3684848,4.6875 L21.6124454,4.6875 L22.8190234,6.10307874 L27.4986725,6.10307874 L29.9195817,19.3486449 L21.3943891,19.3502502 L21.3943891,22.622552 L10.8023461,22.622552 L10.8023461,19.3524977 L2.07815702,19.3534609 L5.22979699,6.10307874 L9.17871529,6.10307874 L10.3840011,4.6875 L4.6308691,4.6875 C3.83940559,4.6875 3.37421888,5.2390909 3.19815864,6.11142645 L0,19.7470874 L0,28.2212959 C0,29.2043992 0.801477937,30 1.78870751,30 L30.2096773,30 C31.198199,30 32,29.2043992 32,28.2212959 L32,19.7470874 L28.8008722,6.11142645 L28.8008722,6.11142645 Z'), _path9), ' ']), _uppyIcon8;
}

function checkIcon() {
  var _polygon, _uppyIcon9;

  return _uppyIcon9 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon9.setAttribute('width', '13px'), _uppyIcon9.setAttribute('height', '9px'), _uppyIcon9.setAttribute('viewBox', '0 0 13 9'), _uppyIcon9.setAttribute('class', 'UppyIcon UppyIcon-check'), _appendChild(_uppyIcon9, [' ', (_polygon = document.createElementNS(_svgNamespace, 'polygon'), _polygon.setAttribute('points', '5 7.293 1.354 3.647 0.646 4.354 5 8.707 12.354 1.354 11.646 0.647'), _polygon)]), _uppyIcon9;
}

function iconAudio() {
  var _path10, _uppyIcon10;

  return _uppyIcon10 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon10.setAttribute('viewBox', '0 0 55 55'), _uppyIcon10.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon10, [' ', (_path10 = document.createElementNS(_svgNamespace, 'path'), _path10.setAttribute('d', 'M52.66.25c-.216-.19-.5-.276-.79-.242l-31 4.01a1 1 0 0 0-.87.992V40.622C18.174 38.428 15.273 37 12 37c-5.514 0-10 4.037-10 9s4.486 9 10 9 10-4.037 10-9c0-.232-.02-.46-.04-.687.014-.065.04-.124.04-.192V16.12l29-3.753v18.257C49.174 28.428 46.273 27 43 27c-5.514 0-10 4.037-10 9s4.486 9 10 9c5.464 0 9.913-3.966 9.993-8.867 0-.013.007-.024.007-.037V1a.998.998 0 0 0-.34-.75zM12 53c-4.41 0-8-3.14-8-7s3.59-7 8-7 8 3.14 8 7-3.59 7-8 7zm31-10c-4.41 0-8-3.14-8-7s3.59-7 8-7 8 3.14 8 7-3.59 7-8 7zM22 14.1V5.89l29-3.753v8.21l-29 3.754z'), _path10), ' ']), _uppyIcon10;
}

function iconVideo() {
  var _path11, _path12, _uppyIcon11;

  return _uppyIcon11 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon11.setAttribute('viewBox', '0 0 58 58'), _uppyIcon11.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon11, [' ', (_path11 = document.createElementNS(_svgNamespace, 'path'), _path11.setAttribute('d', 'M36.537 28.156l-11-7a1.005 1.005 0 0 0-1.02-.033C24.2 21.3 24 21.635 24 22v14a1 1 0 0 0 1.537.844l11-7a1.002 1.002 0 0 0 0-1.688zM26 34.18V23.82L34.137 29 26 34.18z'), _path11), (_path12 = document.createElementNS(_svgNamespace, 'path'), _path12.setAttribute('d', 'M57 6H1a1 1 0 0 0-1 1v44a1 1 0 0 0 1 1h56a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zM10 28H2v-9h8v9zm-8 2h8v9H2v-9zm10 10V8h34v42H12V40zm44-12h-8v-9h8v9zm-8 2h8v9h-8v-9zm8-22v9h-8V8h8zM2 8h8v9H2V8zm0 42v-9h8v9H2zm54 0h-8v-9h8v9z'), _path12), ' ']), _uppyIcon11;
}

function iconPDF() {
  var _path13, _uppyIcon12;

  return _uppyIcon12 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon12.setAttribute('viewBox', '0 0 342 335'), _uppyIcon12.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon12, [' ', (_path13 = document.createElementNS(_svgNamespace, 'path'), _path13.setAttribute('d', 'M329.337 227.84c-2.1 1.3-8.1 2.1-11.9 2.1-12.4 0-27.6-5.7-49.1-14.9 8.3-.6 15.8-.9 22.6-.9 12.4 0 16 0 28.2 3.1 12.1 3 12.2 9.3 10.2 10.6zm-215.1 1.9c4.8-8.4 9.7-17.3 14.7-26.8 12.2-23.1 20-41.3 25.7-56.2 11.5 20.9 25.8 38.6 42.5 52.8 2.1 1.8 4.3 3.5 6.7 5.3-34.1 6.8-63.6 15-89.6 24.9zm39.8-218.9c6.8 0 10.7 17.06 11 33.16.3 16-3.4 27.2-8.1 35.6-3.9-12.4-5.7-31.8-5.7-44.5 0 0-.3-24.26 2.8-24.26zm-133.4 307.2c3.9-10.5 19.1-31.3 41.6-49.8 1.4-1.1 4.9-4.4 8.1-7.4-23.5 37.6-39.3 52.5-49.7 57.2zm315.2-112.3c-6.8-6.7-22-10.2-45-10.5-15.6-.2-34.3 1.2-54.1 3.9-8.8-5.1-17.9-10.6-25.1-17.3-19.2-18-35.2-42.9-45.2-70.3.6-2.6 1.2-4.8 1.7-7.1 0 0 10.8-61.5 7.9-82.3-.4-2.9-.6-3.7-1.4-5.9l-.9-2.5c-2.9-6.76-8.7-13.96-17.8-13.57l-5.3-.17h-.1c-10.1 0-18.4 5.17-20.5 12.84-6.6 24.3.2 60.5 12.5 107.4l-3.2 7.7c-8.8 21.4-19.8 43-29.5 62l-1.3 2.5c-10.2 20-19.5 37-27.9 51.4l-8.7 4.6c-.6.4-15.5 8.2-19 10.3-29.6 17.7-49.28 37.8-52.54 53.8-1.04 5-.26 11.5 5.01 14.6l8.4 4.2c3.63 1.8 7.53 2.7 11.43 2.7 21.1 0 45.6-26.2 79.3-85.1 39-12.7 83.4-23.3 122.3-29.1 29.6 16.7 66 28.3 89 28.3 4.1 0 7.6-.4 10.5-1.2 4.4-1.1 8.1-3.6 10.4-7.1 4.4-6.7 5.4-15.9 4.1-25.4-.3-2.8-2.6-6.3-5-8.7z'), _path13), ' ']), _uppyIcon12;
}

function iconFile() {
  var _path14, _uppyIcon13;

  return _uppyIcon13 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon13.setAttribute('width', '44'), _uppyIcon13.setAttribute('height', '58'), _uppyIcon13.setAttribute('viewBox', '0 0 44 58'), _uppyIcon13.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon13, [' ', (_path14 = document.createElementNS(_svgNamespace, 'path'), _path14.setAttribute('d', 'M27.437.517a1 1 0 0 0-.094.03H4.25C2.037.548.217 2.368.217 4.58v48.405c0 2.212 1.82 4.03 4.03 4.03H39.03c2.21 0 4.03-1.818 4.03-4.03V15.61a1 1 0 0 0-.03-.28 1 1 0 0 0 0-.093 1 1 0 0 0-.03-.032 1 1 0 0 0 0-.03 1 1 0 0 0-.032-.063 1 1 0 0 0-.03-.063 1 1 0 0 0-.032 0 1 1 0 0 0-.03-.063 1 1 0 0 0-.032-.03 1 1 0 0 0-.03-.063 1 1 0 0 0-.063-.062l-14.593-14a1 1 0 0 0-.062-.062A1 1 0 0 0 28 .708a1 1 0 0 0-.374-.157 1 1 0 0 0-.156 0 1 1 0 0 0-.03-.03l-.003-.003zM4.25 2.547h22.218v9.97c0 2.21 1.82 4.03 4.03 4.03h10.564v36.438a2.02 2.02 0 0 1-2.032 2.032H4.25c-1.13 0-2.032-.9-2.032-2.032V4.58c0-1.13.902-2.032 2.03-2.032zm24.218 1.345l10.375 9.937.75.718H30.5c-1.13 0-2.032-.9-2.032-2.03V3.89z'), _path14), ' ']), _uppyIcon13;
}

function iconText() {
  var _path15, _path16, _uppyIcon14;

  return _uppyIcon14 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon14.setAttribute('viewBox', '0 0 64 64'), _uppyIcon14.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon14, [' ', (_path15 = document.createElementNS(_svgNamespace, 'path'), _path15.setAttribute('d', 'M8 64h48V0H22.586L8 14.586V64zm46-2H10V16h14V2h30v60zM11.414 14L22 3.414V14H11.414z'), _path15), ' ', (_path16 = document.createElementNS(_svgNamespace, 'path'), _path16.setAttribute('d', 'M32 13h14v2H32zM18 23h28v2H18zM18 33h28v2H18zM18 43h28v2H18zM18 53h28v2H18z'), _path16), ' ']), _uppyIcon14;
}

function uploadIcon() {
  var _path17, _path18, _uppyIcon15;

  return _uppyIcon15 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon15.setAttribute('width', '37'), _uppyIcon15.setAttribute('height', '33'), _uppyIcon15.setAttribute('viewBox', '0 0 37 33'), _uppyIcon15.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon15, [' ', (_path17 = document.createElementNS(_svgNamespace, 'path'), _path17.setAttribute('d', 'M29.107 24.5c4.07 0 7.393-3.355 7.393-7.442 0-3.994-3.105-7.307-7.012-7.502l.468.415C29.02 4.52 24.34.5 18.886.5c-4.348 0-8.27 2.522-10.138 6.506l.446-.288C4.394 6.782.5 10.758.5 15.608c0 4.924 3.906 8.892 8.76 8.892h4.872c.635 0 1.095-.467 1.095-1.104 0-.636-.46-1.103-1.095-1.103H9.26c-3.644 0-6.63-3.035-6.63-6.744 0-3.71 2.926-6.685 6.57-6.685h.964l.14-.28.177-.362c1.477-3.4 4.744-5.576 8.347-5.576 4.58 0 8.45 3.452 9.01 8.072l.06.536.05.446h1.101c2.87 0 5.204 2.37 5.204 5.295s-2.333 5.296-5.204 5.296h-6.062c-.634 0-1.094.467-1.094 1.103 0 .637.46 1.104 1.094 1.104h6.12z'), _path17), ' ', (_path18 = document.createElementNS(_svgNamespace, 'path'), _path18.setAttribute('d', 'M23.196 18.92l-4.828-5.258-.366-.4-.368.398-4.828 5.196a1.13 1.13 0 0 0 0 1.546c.428.46 1.11.46 1.537 0l3.45-3.71-.868-.34v15.03c0 .64.445 1.118 1.075 1.118.63 0 1.075-.48 1.075-1.12V16.35l-.867.34 3.45 3.712a1 1 0 0 0 .767.345 1 1 0 0 0 .77-.345c.416-.33.416-1.036 0-1.485v.003z'), _path18), ' ']), _uppyIcon15;
}

function dashboardBgIcon() {
  var _path19, _uppyIcon16;

  return _uppyIcon16 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon16.setAttribute('width', '48'), _uppyIcon16.setAttribute('height', '69'), _uppyIcon16.setAttribute('viewBox', '0 0 48 69'), _uppyIcon16.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon16, [' ', (_path19 = document.createElementNS(_svgNamespace, 'path'), _path19.setAttribute('d', 'M.5 1.5h5zM10.5 1.5h5zM20.5 1.5h5zM30.504 1.5h5zM45.5 11.5v5zM45.5 21.5v5zM45.5 31.5v5zM45.5 41.502v5zM45.5 51.502v5zM45.5 61.5v5zM45.5 66.502h-4.998zM35.503 66.502h-5zM25.5 66.502h-5zM15.5 66.502h-5zM5.5 66.502h-5zM.5 66.502v-5zM.5 56.502v-5zM.5 46.503V41.5zM.5 36.5v-5zM.5 26.5v-5zM.5 16.5v-5zM.5 6.5V1.498zM44.807 11H36V2.195z'), _path19), ' ']), _uppyIcon16;
}

module.exports = {
  defaultTabIcon: defaultTabIcon,
  iconCopy: iconCopy,
  iconResume: iconResume,
  iconPause: iconPause,
  iconEdit: iconEdit,
  localIcon: localIcon,
  closeIcon: closeIcon,
  pluginIcon: pluginIcon,
  checkIcon: checkIcon,
  iconAudio: iconAudio,
  iconVideo: iconVideo,
  iconPDF: iconPDF,
  iconFile: iconFile,
  iconText: iconText,
  uploadIcon: uploadIcon,
  dashboardBgIcon: dashboardBgIcon
};

},{"yo-yoify/lib/appendChild":29}],56:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('../Plugin');
var Translator = require('../../core/Translator');
var dragDrop = require('drag-drop');
var Dashboard = require('./Dashboard');

var _require = require('../../core/Utils'),
    getSpeed = _require.getSpeed;

var _require2 = require('../../core/Utils'),
    getETA = _require2.getETA;

var _require3 = require('../../core/Utils'),
    prettyETA = _require3.prettyETA;

var _require4 = require('../../core/Utils'),
    findDOMElement = _require4.findDOMElement;

var prettyBytes = require('prettier-bytes');

var _require5 = require('./icons'),
    defaultTabIcon = _require5.defaultTabIcon;

/**
 * Modal Dialog & Dashboard
 */


module.exports = function (_Plugin) {
  _inherits(DashboardUI, _Plugin);

  function DashboardUI(core, opts) {
    _classCallCheck(this, DashboardUI);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.id = 'DashboardUI';
    _this.title = 'Dashboard UI';
    _this.type = 'orchestrator';

    var defaultLocale = {
      strings: {
        selectToUpload: 'Select files to upload',
        closeModal: 'Close Modal',
        upload: 'Upload',
        importFrom: 'Import files from',
        dashboardWindowTitle: 'Uppy Dashboard Window (Press escape to close)',
        dashboardTitle: 'Uppy Dashboard',
        copyLinkToClipboardSuccess: 'Link copied to clipboard.',
        copyLinkToClipboardFallback: 'Copy the URL below',
        done: 'Done',
        localDisk: 'Local Disk',
        dropPasteImport: 'Drop files here, paste, import from one of the locations above or',
        dropPaste: 'Drop files here, paste or',
        browse: 'browse',
        fileProgress: 'File progress: upload speed and ETA',
        numberOfSelectedFiles: 'Number of selected files',
        uploadAllNewFiles: 'Upload all new files'
      }
    };

    // set default options
    var defaultOptions = {
      target: 'body',
      inline: false,
      width: 750,
      height: 550,
      semiTransparent: false,
      defaultTabIcon: defaultTabIcon(),
      showProgressDetails: false,
      locale: defaultLocale
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.locale = _extends({}, defaultLocale, _this.opts.locale);
    _this.locale.strings = _extends({}, defaultLocale.strings, _this.opts.locale.strings);

    _this.translator = new Translator({ locale: _this.locale });
    _this.containerWidth = _this.translator.translate.bind(_this.translator);

    _this.hideModal = _this.hideModal.bind(_this);
    _this.showModal = _this.showModal.bind(_this);

    _this.addTarget = _this.addTarget.bind(_this);
    _this.actions = _this.actions.bind(_this);
    _this.hideAllPanels = _this.hideAllPanels.bind(_this);
    _this.showPanel = _this.showPanel.bind(_this);
    _this.initEvents = _this.initEvents.bind(_this);
    _this.handleEscapeKeyPress = _this.handleEscapeKeyPress.bind(_this);
    _this.handleFileCard = _this.handleFileCard.bind(_this);
    _this.handleDrop = _this.handleDrop.bind(_this);
    _this.pauseAll = _this.pauseAll.bind(_this);
    _this.resumeAll = _this.resumeAll.bind(_this);
    _this.cancelAll = _this.cancelAll.bind(_this);
    _this.updateDashboardElWidth = _this.updateDashboardElWidth.bind(_this);
    _this.render = _this.render.bind(_this);
    _this.install = _this.install.bind(_this);
    return _this;
  }

  DashboardUI.prototype.addTarget = function addTarget(plugin) {
    var callerPluginId = plugin.id || plugin.constructor.name;
    var callerPluginName = plugin.title || callerPluginId;
    var callerPluginIcon = plugin.icon || this.opts.defaultTabIcon;
    var callerPluginType = plugin.type;

    if (callerPluginType !== 'acquirer' && callerPluginType !== 'progressindicator' && callerPluginType !== 'presenter') {
      var msg = 'Error: Modal can only be used by plugins of types: acquirer, progressindicator, presenter';
      this.core.log(msg);
      return;
    }

    var target = {
      id: callerPluginId,
      name: callerPluginName,
      icon: callerPluginIcon,
      type: callerPluginType,
      focus: plugin.focus,
      render: plugin.render,
      isHidden: true
    };

    var modal = this.core.getState().modal;
    var newTargets = modal.targets.slice();
    newTargets.push(target);

    this.core.setState({
      modal: _extends({}, modal, {
        targets: newTargets
      })
    });

    return this.target;
  };

  DashboardUI.prototype.hideAllPanels = function hideAllPanels() {
    var modal = this.core.getState().modal;

    this.core.setState({ modal: _extends({}, modal, {
        activePanel: false
      }) });
  };

  DashboardUI.prototype.showPanel = function showPanel(id) {
    var modal = this.core.getState().modal;

    var activePanel = modal.targets.filter(function (target) {
      return target.type === 'acquirer' && target.id === id;
    })[0];

    this.core.setState({ modal: _extends({}, modal, {
        activePanel: activePanel
      }) });
  };

  DashboardUI.prototype.hideModal = function hideModal() {
    var modal = this.core.getState().modal;

    this.core.setState({
      modal: _extends({}, modal, {
        isHidden: true
      })
    });

    document.body.classList.remove('is-UppyDashboard-open');
  };

  DashboardUI.prototype.showModal = function showModal() {
    var modal = this.core.getState().modal;

    this.core.setState({
      modal: _extends({}, modal, {
        isHidden: false
      })
    });

    // add class to body that sets position fixed
    document.body.classList.add('is-UppyDashboard-open');
    // focus on modal inner block
    this.target.querySelector('.UppyDashboard-inner').focus();

    this.updateDashboardElWidth();
    // to be sure, sometimes when the function runs, container size is still 0
    setTimeout(this.updateDashboardElWidth, 300);
  };

  // Close the Modal on esc key press


  DashboardUI.prototype.handleEscapeKeyPress = function handleEscapeKeyPress(event) {
    if (event.keyCode === 27) {
      this.hideModal();
    }
  };

  DashboardUI.prototype.initEvents = function initEvents() {
    var _this2 = this;

    // const dashboardEl = this.target.querySelector(`${this.opts.target} .UppyDashboard`)

    // Modal open button
    var showModalTrigger = findDOMElement(this.opts.trigger);
    if (!this.opts.inline && showModalTrigger) {
      showModalTrigger.addEventListener('click', this.showModal);
    } else {
      this.core.log('Modal trigger wasn’t found');
    }

    document.body.addEventListener('keyup', this.handleEscapeKeyPress);

    // Drag Drop
    this.removeDragDropListener = dragDrop(this.el, function (files) {
      _this2.handleDrop(files);
    });
  };

  DashboardUI.prototype.removeEvents = function removeEvents() {
    var showModalTrigger = findDOMElement(this.opts.trigger);
    if (!this.opts.inline && showModalTrigger) {
      showModalTrigger.removeEventListener('click', this.showModal);
    }

    this.removeDragDropListener();
    document.body.removeEventListener('keyup', this.handleEscapeKeyPress);
  };

  DashboardUI.prototype.actions = function actions() {
    var bus = this.core.bus;

    bus.on('core:file-add', this.hideAllPanels);
    bus.on('dashboard:file-card', this.handleFileCard);

    window.addEventListener('resize', this.updateDashboardElWidth);

    // bus.on('core:success', (uploadedCount) => {
    //   bus.emit(
    //     'informer',
    //     `${this.core.i18n('files', {'smart_count': uploadedCount})} successfully uploaded, Sir!`,
    //     'info',
    //     6000
    //   )
    // })
  };

  DashboardUI.prototype.removeActions = function removeActions() {
    var bus = this.core.bus;

    window.removeEventListener('resize', this.updateDashboardElWidth);

    bus.off('core:file-add', this.hideAllPanels);
    bus.off('dashboard:file-card', this.handleFileCard);
  };

  DashboardUI.prototype.updateDashboardElWidth = function updateDashboardElWidth() {
    var dashboardEl = this.target.querySelector('.UppyDashboard-inner');
    var containerWidth = dashboardEl.offsetWidth;
    console.log(containerWidth);

    var modal = this.core.getState().modal;
    this.core.setState({
      modal: _extends({}, modal, {
        containerWidth: dashboardEl.offsetWidth
      })
    });
  };

  DashboardUI.prototype.handleFileCard = function handleFileCard(fileId) {
    var modal = this.core.getState().modal;

    this.core.setState({
      modal: _extends({}, modal, {
        fileCardFor: fileId || false
      })
    });
  };

  DashboardUI.prototype.handleDrop = function handleDrop(files) {
    var _this3 = this;

    this.core.log('All right, someone dropped something...');

    files.forEach(function (file) {
      _this3.core.bus.emit('core:file-add', {
        source: _this3.id,
        name: file.name,
        type: file.type,
        data: file
      });
    });
  };

  DashboardUI.prototype.cancelAll = function cancelAll() {
    this.core.bus.emit('core:cancel-all');
  };

  DashboardUI.prototype.pauseAll = function pauseAll() {
    this.core.bus.emit('core:pause-all');
  };

  DashboardUI.prototype.resumeAll = function resumeAll() {
    this.core.bus.emit('core:resume-all');
  };

  DashboardUI.prototype.getTotalSpeed = function getTotalSpeed(files) {
    var totalSpeed = 0;
    files.forEach(function (file) {
      totalSpeed = totalSpeed + getSpeed(file.progress);
    });
    return totalSpeed;
  };

  DashboardUI.prototype.getTotalETA = function getTotalETA(files) {
    var totalSeconds = 0;

    files.forEach(function (file) {
      totalSeconds = totalSeconds + getETA(file.progress);
    });

    return totalSeconds;
  };

  DashboardUI.prototype.render = function render(state) {
    var _this4 = this;

    var files = state.files;

    var newFiles = Object.keys(files).filter(function (file) {
      return !files[file].progress.uploadStarted;
    });
    var uploadStartedFiles = Object.keys(files).filter(function (file) {
      return files[file].progress.uploadStarted;
    });
    var completeFiles = Object.keys(files).filter(function (file) {
      return files[file].progress.uploadComplete;
    });
    var inProgressFiles = Object.keys(files).filter(function (file) {
      return !files[file].progress.uploadComplete && files[file].progress.uploadStarted && !files[file].isPaused;
    });

    var inProgressFilesArray = [];
    inProgressFiles.forEach(function (file) {
      inProgressFilesArray.push(files[file]);
    });

    var totalSpeed = prettyBytes(this.getTotalSpeed(inProgressFilesArray));
    var totalETA = prettyETA(this.getTotalETA(inProgressFilesArray));

    // total size and uploaded size
    var totalSize = 0;
    var totalUploadedSize = 0;
    inProgressFilesArray.forEach(function (file) {
      totalSize = totalSize + (file.progress.bytesTotal || 0);
      totalUploadedSize = totalUploadedSize + (file.progress.bytesUploaded || 0);
    });
    totalSize = prettyBytes(totalSize);
    totalUploadedSize = prettyBytes(totalUploadedSize);

    var isAllComplete = state.totalProgress === 100;
    var isAllPaused = inProgressFiles.length === 0 && !isAllComplete && uploadStartedFiles.length > 0;
    var isUploadStarted = uploadStartedFiles.length > 0;

    var acquirers = state.modal.targets.filter(function (target) {
      return target.type === 'acquirer';
    });

    var progressindicators = state.modal.targets.filter(function (target) {
      return target.type === 'progressindicator';
    });

    var addFile = function addFile(file) {
      _this4.core.emitter.emit('core:file-add', file);
    };

    var removeFile = function removeFile(fileID) {
      _this4.core.emitter.emit('core:file-remove', fileID);
    };

    var startUpload = function startUpload(ev) {
      _this4.core.upload().catch(function (err) {
        // Log error.
        console.error(err.stack || err.message);
      });
    };

    var pauseUpload = function pauseUpload(fileID) {
      _this4.core.emitter.emit('core:upload-pause', fileID);
    };

    var cancelUpload = function cancelUpload(fileID) {
      _this4.core.emitter.emit('core:upload-cancel', fileID);
      _this4.core.emitter.emit('core:file-remove', fileID);
    };

    var showFileCard = function showFileCard(fileID) {
      _this4.core.emitter.emit('dashboard:file-card', fileID);
    };

    var fileCardDone = function fileCardDone(meta, fileID) {
      _this4.core.emitter.emit('core:update-meta', meta, fileID);
      _this4.core.emitter.emit('dashboard:file-card');
    };

    var info = function info(text, type, duration) {
      _this4.core.emitter.emit('informer', text, type, duration);
    };

    var resumableUploads = this.core.getState().capabilities.resumableUploads || false;

    return Dashboard({
      state: state,
      modal: state.modal,
      newFiles: newFiles,
      files: files,
      totalFileCount: Object.keys(files).length,
      isUploadStarted: isUploadStarted,
      inProgress: uploadStartedFiles.length,
      completeFiles: completeFiles,
      inProgressFiles: inProgressFiles,
      totalSpeed: totalSpeed,
      totalETA: totalETA,
      totalProgress: state.totalProgress,
      totalSize: totalSize,
      totalUploadedSize: totalUploadedSize,
      isAllComplete: isAllComplete,
      isAllPaused: isAllPaused,
      acquirers: acquirers,
      activePanel: state.modal.activePanel,
      progressindicators: progressindicators,
      autoProceed: this.core.opts.autoProceed,
      id: this.id,
      hideModal: this.hideModal,
      showProgressDetails: this.opts.showProgressDetails,
      inline: this.opts.inline,
      semiTransparent: this.opts.semiTransparent,
      onPaste: this.handlePaste,
      showPanel: this.showPanel,
      hideAllPanels: this.hideAllPanels,
      log: this.core.log,
      bus: this.core.emitter,
      i18n: this.containerWidth,
      pauseAll: this.pauseAll,
      resumeAll: this.resumeAll,
      cancelAll: this.cancelAll,
      addFile: addFile,
      removeFile: removeFile,
      info: info,
      metaFields: state.metaFields,
      resumableUploads: resumableUploads,
      startUpload: startUpload,
      pauseUpload: pauseUpload,
      cancelUpload: cancelUpload,
      fileCardFor: state.modal.fileCardFor,
      showFileCard: showFileCard,
      fileCardDone: fileCardDone,
      updateDashboardElWidth: this.updateDashboardElWidth,
      maxWidth: this.opts.maxWidth,
      maxHeight: this.opts.maxHeight,
      currentWidth: state.modal.containerWidth,
      isWide: state.modal.containerWidth > 400
    });
  };

  DashboardUI.prototype.install = function install() {
    // Set default state for Modal
    this.core.setState({ modal: {
        isHidden: true,
        showFileCard: false,
        activePanel: false,
        targets: []
      } });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);

    this.initEvents();
    this.actions();
  };

  DashboardUI.prototype.uninstall = function uninstall() {
    this.unmount();
    this.removeActions();
    this.removeEvents();
  };

  return DashboardUI;
}(Plugin);

},{"../../core/Translator":31,"../../core/Utils":33,"../Plugin":62,"./Dashboard":46,"./icons":55,"drag-drop":1,"prettier-bytes":10}],57:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

module.exports = {
  folder: function folder() {
    var _path, _uppyIcon;

    return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('style', 'width:16px;margin-right:3px'), _uppyIcon.setAttribute('viewBox', '0 0 276.157 276.157'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M273.08 101.378c-3.3-4.65-8.86-7.32-15.254-7.32h-24.34V67.59c0-10.2-8.3-18.5-18.5-18.5h-85.322c-3.63 0-9.295-2.875-11.436-5.805l-6.386-8.735c-4.982-6.814-15.104-11.954-23.546-11.954H58.73c-9.292 0-18.638 6.608-21.737 15.372l-2.033 5.752c-.958 2.71-4.72 5.37-7.596 5.37H18.5C8.3 49.09 0 57.39 0 67.59v167.07c0 .886.16 1.73.443 2.52.152 3.306 1.18 6.424 3.053 9.064 3.3 4.652 8.86 7.32 15.255 7.32h188.487c11.395 0 23.27-8.425 27.035-19.18l40.677-116.188c2.11-6.035 1.43-12.164-1.87-16.816zM18.5 64.088h8.864c9.295 0 18.64-6.607 21.738-15.37l2.032-5.75c.96-2.712 4.722-5.373 7.597-5.373h29.565c3.63 0 9.295 2.876 11.437 5.806l6.386 8.735c4.982 6.815 15.104 11.954 23.546 11.954h85.322c1.898 0 3.5 1.602 3.5 3.5v26.47H69.34c-11.395 0-23.27 8.423-27.035 19.178L15 191.23V67.59c0-1.898 1.603-3.5 3.5-3.5zm242.29 49.15l-40.676 116.188c-1.674 4.78-7.812 9.135-12.877 9.135H18.75c-1.447 0-2.576-.372-3.02-.997-.442-.625-.422-1.814.057-3.18l40.677-116.19c1.674-4.78 7.812-9.134 12.877-9.134h188.487c1.448 0 2.577.372 3.02.997.443.625.423 1.814-.056 3.18z'), _path), ' ']), _uppyIcon;
  },
  music: function music() {
    var _path2, _path3, _path4, _path5, _g, _uppyIcon2;

    return _uppyIcon2 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon2.setAttribute('width', '16.000000pt'), _uppyIcon2.setAttribute('height', '16.000000pt'), _uppyIcon2.setAttribute('viewBox', '0 0 48.000000 48.000000'), _uppyIcon2.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon2.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon2, [' ', (_g = document.createElementNS(_svgNamespace, 'g'), _g.setAttribute('transform', 'translate(0.000000,48.000000) scale(0.100000,-0.100000)'), _g.setAttribute('fill', '#525050'), _g.setAttribute('stroke', 'none'), _appendChild(_g, [' ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M209 473 c0 -5 0 -52 1 -106 1 -54 -2 -118 -6 -143 l-7 -46 -44 5\n    c-73 8 -133 -46 -133 -120 0 -17 -5 -35 -10 -38 -18 -11 0 -25 33 -24 30 1 30\n    1 7 8 -15 4 -20 10 -13 14 6 4 9 16 6 27 -9 34 7 70 40 90 17 11 39 20 47 20\n    8 0 -3 -9 -26 -19 -42 -19 -54 -36 -54 -75 0 -36 30 -56 84 -56 41 0 53 5 82\n    34 19 19 34 31 34 27 0 -4 -5 -12 -12 -19 -9 -9 -1 -12 39 -12 106 0 183 -21\n    121 -33 -17 -3 -14 -5 10 -6 25 -1 32 3 32 17 0 26 -20 42 -51 42 -39 0 -43\n    13 -10 38 56 41 76 124 45 185 -25 48 -72 105 -103 123 -15 9 -36 29 -47 45\n    -17 26 -63 41 -65 22z m56 -48 c16 -24 31 -42 34 -39 9 9 79 -69 74 -83 -3 -7\n    -2 -13 3 -12 18 3 25 -1 19 -12 -5 -7 -16 -2 -33 13 l-26 23 16 -25 c17 -27\n    29 -92 16 -84 -4 3 -8 -8 -8 -25 0 -16 4 -33 10 -36 5 -3 7 0 4 9 -3 9 3 20\n    15 28 13 8 21 24 22 43 1 18 3 23 6 12 3 -10 2 -29 -1 -43 -7 -26 -62 -94 -77\n    -94 -13 0 -11 17 4 32 21 19 4 88 -28 115 -14 13 -22 23 -16 23 5 0 21 -14 35\n    -31 14 -17 26 -25 26 -19 0 21 -60 72 -79 67 -16 -4 -17 -1 -8 34 6 24 14 36\n    21 32 6 -3 1 5 -11 18 -12 13 -22 29 -23 34 -1 6 -6 17 -12 25 -6 10 -7 -39\n    -4 -142 l6 -158 -26 10 c-33 13 -44 12 -21 -1 17 -10 24 -44 10 -52 -5 -3 -39\n    -8 -76 -12 -68 -7 -69 -7 -65 17 4 28 64 60 117 62 l36 1 0 157 c0 87 2 158 5\n    158 3 0 18 -20 35 -45z m15 -159 c0 -2 -7 -7 -16 -10 -8 -3 -12 -2 -9 4 6 10\n    25 14 25 6z m50 -92 c0 -13 -4 -26 -10 -29 -14 -9 -13 -48 2 -63 9 -9 6 -12\n    -15 -12 -22 0 -27 5 -27 24 0 14 -4 28 -10 31 -15 9 -13 102 3 108 18 7 57\n    -33 57 -59z m-139 -135 c-32 -26 -121 -25 -121 2 0 6 8 5 19 -1 26 -14 64 -13\n    55 1 -4 8 1 9 16 4 13 -4 20 -3 17 2 -3 5 4 10 16 10 22 2 22 2 -2 -18z'), _path2), ' ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M330 345 c19 -19 36 -35 39 -35 3 0 -10 16 -29 35 -19 19 -36 35 -39\n    35 -3 0 10 -16 29 -35z'), _path3), ' ', (_path4 = document.createElementNS(_svgNamespace, 'path'), _path4.setAttribute('d', 'M349 123 c-13 -16 -12 -17 4 -4 16 13 21 21 13 21 -2 0 -10 -8 -17\n    -17z'), _path4), ' ', (_path5 = document.createElementNS(_svgNamespace, 'path'), _path5.setAttribute('d', 'M243 13 c15 -2 39 -2 55 0 15 2 2 4 -28 4 -30 0 -43 -2 -27 -4z'), _path5), ' ']), _g), ' ']), _uppyIcon2;
  },
  page_white_picture: function page_white_picture() {
    var _path6, _path7, _path8, _path9, _path10, _path11, _path12, _path13, _path14, _g2, _uppyIcon3;

    return _uppyIcon3 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon3.setAttribute('width', '16.000000pt'), _uppyIcon3.setAttribute('height', '16.000000pt'), _uppyIcon3.setAttribute('viewBox', '0 0 48.000000 36.000000'), _uppyIcon3.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon3.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon3, [' ', (_g2 = document.createElementNS(_svgNamespace, 'g'), _g2.setAttribute('transform', 'translate(0.000000,36.000000) scale(0.100000,-0.100000)'), _g2.setAttribute('fill', '#565555'), _g2.setAttribute('stroke', 'none'), _appendChild(_g2, [' ', (_path6 = document.createElementNS(_svgNamespace, 'path'), _path6.setAttribute('d', 'M0 180 l0 -180 240 0 240 0 0 180 0 180 -240 0 -240 0 0 -180z m470\n    0 l0 -170 -230 0 -230 0 0 170 0 170 230 0 230 0 0 -170z'), _path6), ' ', (_path7 = document.createElementNS(_svgNamespace, 'path'), _path7.setAttribute('d', 'M40 185 l0 -135 200 0 200 0 0 135 0 135 -200 0 -200 0 0 -135z m390\n    59 l0 -65 -29 20 c-37 27 -45 26 -65 -4 -9 -14 -22 -25 -28 -25 -7 0 -24 -12\n    -39 -26 -26 -25 -28 -25 -53 -9 -17 11 -26 13 -26 6 0 -7 -4 -9 -10 -6 -5 3\n    -22 -2 -37 -12 l-28 -18 20 27 c11 15 26 25 33 23 6 -2 12 -1 12 4 0 10 -37\n    21 -65 20 -14 -1 -12 -3 7 -8 l28 -6 -50 -55 -49 -55 0 126 1 126 189 1 189 2\n    0 -66z m-16 -73 c11 -12 14 -21 8 -21 -6 0 -13 4 -17 10 -3 5 -12 7 -19 4 -8\n    -3 -16 2 -19 13 -3 11 -4 7 -4 -9 1 -19 6 -25 18 -23 19 4 46 -21 35 -32 -4\n    -4 -11 -1 -16 7 -6 8 -10 10 -10 4 0 -6 7 -17 15 -24 24 -20 11 -24 -76 -27\n    -69 -1 -83 1 -97 18 -9 10 -20 19 -25 19 -5 0 -4 -6 2 -14 14 -17 -5 -26 -55\n    -26 -36 0 -46 16 -17 27 10 4 22 13 27 22 8 13 10 12 17 -4 7 -17 8 -18 8 -2\n    1 23 11 22 55 -8 33 -22 35 -23 26 -5 -9 16 -8 20 5 20 8 0 15 5 15 11 0 5 -4\n    7 -10 4 -5 -3 -10 -4 -10 -1 0 4 59 36 67 36 2 0 1 -10 -2 -21 -5 -15 -4 -19\n    5 -14 6 4 9 17 6 28 -12 49 27 53 68 8z'), _path7), ' ', (_path8 = document.createElementNS(_svgNamespace, 'path'), _path8.setAttribute('d', 'M100 296 c0 -2 7 -7 16 -10 8 -3 12 -2 9 4 -6 10 -25 14 -25 6z'), _path8), ' ', (_path9 = document.createElementNS(_svgNamespace, 'path'), _path9.setAttribute('d', 'M243 293 c9 -2 23 -2 30 0 6 3 -1 5 -18 5 -16 0 -22 -2 -12 -5z'), _path9), ' ', (_path10 = document.createElementNS(_svgNamespace, 'path'), _path10.setAttribute('d', 'M65 280 c-3 -5 -2 -10 4 -10 5 0 13 5 16 10 3 6 2 10 -4 10 -5 0 -13\n    -4 -16 -10z'), _path10), ' ', (_path11 = document.createElementNS(_svgNamespace, 'path'), _path11.setAttribute('d', 'M155 270 c-3 -6 1 -7 9 -4 18 7 21 14 7 14 -6 0 -13 -4 -16 -10z'), _path11), ' ', (_path12 = document.createElementNS(_svgNamespace, 'path'), _path12.setAttribute('d', 'M233 252 c-13 -2 -23 -8 -23 -13 0 -7 -12 -8 -30 -4 -22 5 -30 3 -30\n    -7 0 -10 -2 -10 -9 1 -5 8 -19 12 -35 9 -14 -3 -27 -1 -30 4 -2 5 -4 4 -3 -3\n    2 -6 6 -10 10 -10 3 0 20 -4 37 -9 18 -5 32 -5 36 1 3 6 13 8 21 5 13 -5 113\n    21 113 30 0 3 -19 2 -57 -4z'), _path12), ' ', (_path13 = document.createElementNS(_svgNamespace, 'path'), _path13.setAttribute('d', 'M275 220 c-13 -6 -15 -9 -5 -9 8 0 22 4 30 9 18 12 2 12 -25 0z'), _path13), ' ', (_path14 = document.createElementNS(_svgNamespace, 'path'), _path14.setAttribute('d', 'M132 23 c59 -2 158 -2 220 0 62 1 14 3 -107 3 -121 0 -172 -2 -113\n    -3z'), _path14), ' ']), _g2), ' ']), _uppyIcon3;
  },
  word: function word() {
    var _path15, _path16, _path17, _path18, _path19, _path20, _path21, _g3, _uppyIcon4;

    return _uppyIcon4 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon4.setAttribute('width', '16.000000pt'), _uppyIcon4.setAttribute('height', '16.000000pt'), _uppyIcon4.setAttribute('viewBox', '0 0 48.000000 48.000000'), _uppyIcon4.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon4.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon4, [' ', (_g3 = document.createElementNS(_svgNamespace, 'g'), _g3.setAttribute('transform', 'translate(0.000000,48.000000) scale(0.100000,-0.100000)'), _g3.setAttribute('fill', '#423d3d'), _g3.setAttribute('stroke', 'none'), _appendChild(_g3, [' ', (_path15 = document.createElementNS(_svgNamespace, 'path'), _path15.setAttribute('d', 'M0 466 c0 -15 87 -26 213 -26 l77 0 0 -140 0 -140 -77 0 c-105 0\n    -213 -11 -213 -21 0 -5 15 -9 34 -9 25 0 33 -4 33 -17 0 -74 4 -113 13 -113 6\n    0 10 32 10 75 l0 75 105 0 105 0 0 150 0 150 -105 0 c-87 0 -105 3 -105 15 0\n    11 -12 15 -45 15 -31 0 -45 -4 -45 -14z'), _path15), ' ', (_path16 = document.createElementNS(_svgNamespace, 'path'), _path16.setAttribute('d', 'M123 468 c-2 -5 50 -8 116 -8 l121 0 0 -50 c0 -46 -2 -50 -23 -50\n    -14 0 -24 -6 -24 -15 0 -8 4 -15 9 -15 4 0 8 -20 8 -45 0 -25 -4 -45 -8 -45\n    -5 0 -9 -7 -9 -15 0 -9 10 -15 24 -15 22 0 23 3 23 75 l0 75 50 0 50 0 0 -170\n    0 -170 -175 0 -175 0 -2 63 c-2 59 -2 60 -5 13 -3 -27 -2 -60 2 -73 l5 -23\n    183 2 182 3 2 216 c3 275 19 254 -194 254 -85 0 -157 -3 -160 -7z m337 -85 c0\n    -2 -18 -3 -39 -3 -39 0 -39 0 -43 45 l-3 44 42 -41 c24 -23 43 -43 43 -45z\n    m-19 50 c19 -22 23 -29 9 -18 -36 30 -50 43 -50 49 0 11 6 6 41 -31z'), _path16), ' ', (_path17 = document.createElementNS(_svgNamespace, 'path'), _path17.setAttribute('d', 'M4 300 c0 -74 1 -105 3 -67 2 37 2 97 0 135 -2 37 -3 6 -3 -68z'), _path17), ' ', (_path18 = document.createElementNS(_svgNamespace, 'path'), _path18.setAttribute('d', 'M20 300 l0 -131 128 3 127 3 3 128 3 127 -131 0 -130 0 0 -130z m250\n    100 c0 -16 -7 -20 -33 -20 -31 0 -34 -2 -34 -31 0 -28 2 -30 13 -14 8 10 11\n    22 8 26 -3 5 1 9 9 9 11 0 9 -12 -12 -50 -14 -27 -32 -50 -39 -50 -15 0 -31\n    38 -26 63 2 10 -1 15 -8 11 -6 -4 -9 -1 -6 6 2 8 10 16 16 18 8 2 12 -10 12\n    -38 0 -38 2 -41 16 -29 9 7 12 15 7 16 -5 2 -7 17 -5 33 4 26 1 30 -20 30 -17\n    0 -29 -9 -39 -27 -20 -41 -22 -50 -6 -30 14 17 15 16 20 -5 4 -13 2 -40 -2\n    -60 -9 -37 -8 -38 20 -38 26 0 33 8 64 70 19 39 37 70 40 70 3 0 5 -40 5 -90\n    l0 -90 -120 0 -120 0 0 120 0 120 120 0 c113 0 120 -1 120 -20z'), _path18), ' ', (_path19 = document.createElementNS(_svgNamespace, 'path'), _path19.setAttribute('d', 'M40 371 c0 -6 5 -13 10 -16 6 -3 10 -35 10 -71 0 -57 2 -64 20 -64\n    13 0 27 14 40 40 25 49 25 63 0 30 -19 -25 -39 -23 -24 2 5 7 7 23 6 35 -2 11\n    2 24 7 28 23 13 9 25 -29 25 -22 0 -40 -4 -40 -9z m53 -9 c-6 -4 -13 -28 -15\n    -52 l-3 -45 -5 53 c-5 47 -3 52 15 52 13 0 16 -3 8 -8z'), _path19), ' ', (_path20 = document.createElementNS(_svgNamespace, 'path'), _path20.setAttribute('d', 'M313 165 c0 -9 10 -15 24 -15 14 0 23 6 23 15 0 9 -9 15 -23 15 -14\n    0 -24 -6 -24 -15z'), _path20), ' ', (_path21 = document.createElementNS(_svgNamespace, 'path'), _path21.setAttribute('d', 'M180 105 c0 -12 17 -15 90 -15 73 0 90 3 90 15 0 12 -17 15 -90 15\n    -73 0 -90 -3 -90 -15z'), _path21), ' ']), _g3), ' ']), _uppyIcon4;
  },
  powerpoint: function powerpoint() {
    var _path22, _path23, _path24, _path25, _path26, _path27, _path28, _path29, _path30, _path31, _path32, _path33, _path34, _path35, _path36, _path37, _path38, _path39, _g4, _uppyIcon5;

    return _uppyIcon5 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon5.setAttribute('width', '16.000000pt'), _uppyIcon5.setAttribute('height', '16.000000pt'), _uppyIcon5.setAttribute('viewBox', '0 0 16.000000 16.000000'), _uppyIcon5.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon5.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon5, [' ', (_g4 = document.createElementNS(_svgNamespace, 'g'), _g4.setAttribute('transform', 'translate(0.000000,144.000000) scale(0.100000,-0.100000)'), _g4.setAttribute('fill', '#494747'), _g4.setAttribute('stroke', 'none'), _appendChild(_g4, [' ', (_path22 = document.createElementNS(_svgNamespace, 'path'), _path22.setAttribute('d', 'M0 1390 l0 -50 93 0 c50 0 109 -3 130 -6 l37 -7 0 57 0 56 -130 0\n    -130 0 0 -50z'), _path22), ' ', (_path23 = document.createElementNS(_svgNamespace, 'path'), _path23.setAttribute('d', 'M870 1425 c0 -8 -12 -18 -27 -22 l-28 -6 30 -9 c17 -5 75 -10 130\n    -12 86 -2 100 -5 99 -19 0 -10 -1 -80 -2 -157 l-2 -140 -65 0 c-60 0 -80 -9\n    -55 -25 8 -5 7 -11 -1 -21 -17 -20 2 -25 112 -27 l94 -2 0 40 0 40 100 5 c55\n    3 104 3 108 -1 8 -6 11 -1008 4 -1016 -2 -2 -236 -4 -520 -6 -283 -1 -519 -5\n    -523 -9 -4 -4 -1 -14 6 -23 11 -13 82 -15 561 -15 l549 0 0 570 c0 543 -1 570\n    -18 570 -10 0 -56 39 -103 86 -46 47 -93 90 -104 95 -11 6 22 -31 73 -82 50\n    -50 92 -95 92 -99 0 -14 -23 -16 -136 -12 l-111 4 -6 124 c-6 119 -7 126 -32\n    145 -14 12 -23 25 -20 30 4 5 -38 9 -99 9 -87 0 -106 -3 -106 -15z'), _path23), ' ', (_path24 = document.createElementNS(_svgNamespace, 'path'), _path24.setAttribute('d', 'M1190 1429 c0 -14 225 -239 239 -239 7 0 11 30 11 85 0 77 -2 85 -19\n    85 -21 0 -61 44 -61 66 0 11 -20 14 -85 14 -55 0 -85 -4 -85 -11z'), _path24), ' ', (_path25 = document.createElementNS(_svgNamespace, 'path'), _path25.setAttribute('d', 'M281 1331 c-24 -16 7 -23 127 -31 100 -6 107 -7 47 -9 -38 -1 -142\n    -8 -229 -14 l-160 -12 -7 -28 c-10 -37 -16 -683 -6 -693 4 -4 10 -4 15 0 4 4\n    8 166 9 359 l2 352 358 -3 358 -2 5 -353 c3 -193 2 -356 -2 -361 -3 -4 -136\n    -8 -295 -7 -290 2 -423 -4 -423 -20 0 -5 33 -9 73 -9 39 0 90 -3 111 -7 l39\n    -6 -45 -18 c-26 -10 -90 -20 -151 -25 l-107 -7 0 -38 c0 -35 3 -39 24 -39 36\n    0 126 -48 128 -68 1 -9 2 -40 3 -69 2 -29 6 -91 10 -138 l7 -85 44 0 44 0 0\n    219 0 220 311 1 c172 0 314 2 318 4 5 4 6 301 2 759 l-1 137 -297 0 c-164 0\n    -304 -4 -312 -9z'), _path25), ' ', (_path26 = document.createElementNS(_svgNamespace, 'path'), _path26.setAttribute('d', 'M2 880 c-1 -276 2 -378 10 -360 12 30 11 657 -2 710 -5 21 -8 -121\n    -8 -350z'), _path26), ' ', (_path27 = document.createElementNS(_svgNamespace, 'path'), _path27.setAttribute('d', 'M145 1178 c-3 -8 -4 -141 -3 -298 l3 -285 295 0 295 0 0 295 0 295\n    -293 3 c-230 2 -294 0 -297 -10z m553 -27 c11 -6 13 -60 11 -260 -1 -139 -6\n    -254 -9 -256 -4 -3 -124 -6 -266 -7 l-259 -3 -3 255 c-1 140 0 260 3 267 3 10\n    62 13 257 13 139 0 259 -4 266 -9z'), _path27), ' ', (_path28 = document.createElementNS(_svgNamespace, 'path'), _path28.setAttribute('d', 'M445 1090 l-210 -5 -3 -37 -3 -38 225 0 226 0 0 34 c0 18 -6 37 -12\n    42 -7 5 -107 7 -223 4z'), _path28), ' ', (_path29 = document.createElementNS(_svgNamespace, 'path'), _path29.setAttribute('d', 'M295 940 c-3 -6 1 -12 9 -15 9 -3 23 -7 31 -10 10 -3 15 -18 15 -49\n    0 -25 3 -47 8 -49 15 -9 47 11 52 33 9 38 28 34 41 -8 10 -35 9 -43 -7 -66\n    -23 -31 -51 -34 -56 -4 -4 31 -26 34 -38 4 -5 -14 -12 -26 -16 -26 -4 0 -22\n    16 -41 36 -33 35 -34 40 -28 86 7 48 6 50 -16 46 -18 -2 -23 -9 -21 -23 2 -11\n    3 -49 3 -85 0 -72 6 -83 60 -111 57 -29 95 -25 144 15 37 31 46 34 83 29 40\n    -5 42 -5 42 21 0 24 -3 27 -27 24 -24 -3 -28 1 -31 25 -3 24 0 28 20 25 13 -2\n    23 2 23 7 0 6 -9 9 -20 8 -13 -2 -28 9 -44 32 -13 19 -31 35 -41 35 -10 0 -23\n    7 -30 15 -14 17 -105 21 -115 5z'), _path29), ' ', (_path30 = document.createElementNS(_svgNamespace, 'path'), _path30.setAttribute('d', 'M522 919 c-28 -11 -20 -29 14 -29 14 0 24 6 24 14 0 21 -11 25 -38\n    15z'), _path30), ' ', (_path31 = document.createElementNS(_svgNamespace, 'path'), _path31.setAttribute('d', 'M623 922 c-53 -5 -43 -32 12 -32 32 0 45 4 45 14 0 17 -16 22 -57 18z'), _path31), ' ', (_path32 = document.createElementNS(_svgNamespace, 'path'), _path32.setAttribute('d', 'M597 854 c-13 -14 6 -24 44 -24 28 0 39 4 39 15 0 11 -11 15 -38 15\n    -21 0 -42 -3 -45 -6z'), _path32), ' ', (_path33 = document.createElementNS(_svgNamespace, 'path'), _path33.setAttribute('d', 'M597 794 c-4 -4 -7 -18 -7 -31 0 -21 4 -23 46 -23 44 0 45 1 42 28\n    -3 23 -8 27 -38 30 -20 2 -39 0 -43 -4z'), _path33), ' ', (_path34 = document.createElementNS(_svgNamespace, 'path'), _path34.setAttribute('d', 'M989 883 c-34 -4 -37 -6 -37 -37 0 -32 2 -34 45 -40 25 -3 72 -6 104\n    -6 l59 0 0 45 0 45 -67 -2 c-38 -1 -84 -3 -104 -5z'), _path34), ' ', (_path35 = document.createElementNS(_svgNamespace, 'path'), _path35.setAttribute('d', 'M993 703 c-42 -4 -54 -15 -33 -28 8 -5 8 -11 0 -20 -16 -20 -3 -24\n    104 -31 l96 -7 0 47 0 46 -62 -2 c-35 -1 -82 -3 -105 -5z'), _path35), ' ', (_path36 = document.createElementNS(_svgNamespace, 'path'), _path36.setAttribute('d', 'M1005 523 c-50 -6 -59 -12 -46 -26 8 -10 7 -17 -1 -25 -6 -6 -9 -14\n    -6 -17 3 -3 51 -8 107 -12 l101 -6 0 46 0 47 -62 -1 c-35 -1 -76 -4 -93 -6z'), _path36), ' ', (_path37 = document.createElementNS(_svgNamespace, 'path'), _path37.setAttribute('d', 'M537 344 c-4 -4 -7 -25 -7 -46 l0 -38 46 0 45 0 -3 43 c-3 40 -4 42\n    -38 45 -20 2 -39 0 -43 -4z'), _path37), ' ', (_path38 = document.createElementNS(_svgNamespace, 'path'), _path38.setAttribute('d', 'M714 341 c-2 -2 -4 -22 -4 -43 l0 -38 225 0 225 0 0 45 0 46 -221 -3\n    c-121 -2 -222 -5 -225 -7z'), _path38), ' ', (_path39 = document.createElementNS(_svgNamespace, 'path'), _path39.setAttribute('d', 'M304 205 c0 -66 1 -92 3 -57 2 34 2 88 0 120 -2 31 -3 3 -3 -63z'), _path39), ' ']), _g4), ' ']), _uppyIcon5;
  },
  page_white: function page_white() {
    var _path40, _path41, _path42, _path43, _path44, _g5, _uppyIcon6;

    return _uppyIcon6 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon6.setAttribute('width', '16.000000pt'), _uppyIcon6.setAttribute('height', '16.000000pt'), _uppyIcon6.setAttribute('viewBox', '0 0 48.000000 48.000000'), _uppyIcon6.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon6.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon6, [' ', (_g5 = document.createElementNS(_svgNamespace, 'g'), _g5.setAttribute('transform', 'translate(0.000000,48.000000) scale(0.100000,-0.100000)'), _g5.setAttribute('fill', '#000000'), _g5.setAttribute('stroke', 'none'), _appendChild(_g5, [' ', (_path40 = document.createElementNS(_svgNamespace, 'path'), _path40.setAttribute('d', 'M20 240 c1 -202 3 -240 16 -240 12 0 14 38 14 240 0 208 -2 240 -15\n    240 -13 0 -15 -31 -15 -240z'), _path40), ' ', (_path41 = document.createElementNS(_svgNamespace, 'path'), _path41.setAttribute('d', 'M75 471 c-4 -8 32 -11 119 -11 l126 0 0 -50 0 -50 50 0 c28 0 50 5\n    50 10 0 6 -18 10 -40 10 l-40 0 0 42 0 42 43 -39 42 -40 -43 45 -42 45 -129 3\n    c-85 2 -131 0 -136 -7z'), _path41), ' ', (_path42 = document.createElementNS(_svgNamespace, 'path'), _path42.setAttribute('d', 'M398 437 l42 -43 0 -197 c0 -168 2 -197 15 -197 13 0 15 29 15 198\n    l0 198 -36 42 c-21 25 -44 42 -57 42 -18 0 -16 -6 21 -43z'), _path42), ' ', (_path43 = document.createElementNS(_svgNamespace, 'path'), _path43.setAttribute('d', 'M92 353 l2 -88 3 78 4 77 89 0 89 0 8 -42 c8 -43 9 -43 55 -46 44 -3\n    47 -5 51 -35 4 -31 4 -31 5 6 l2 37 -50 0 -50 0 0 50 0 50 -105 0 -105 0 2\n    -87z'), _path43), ' ', (_path44 = document.createElementNS(_svgNamespace, 'path'), _path44.setAttribute('d', 'M75 10 c8 -13 332 -13 340 0 4 7 -55 10 -170 10 -115 0 -174 -3 -170\n    -10z'), _path44), ' ']), _g5), ' ']), _uppyIcon6;
  }
};

},{"yo-yoify/lib/appendChild":29}],58:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('../Plugin');

var Provider = require('../../uppy-base/src/plugins/Provider');

var View = require('../../generic-provider-views/index');
var icons = require('./icons');

module.exports = function (_Plugin) {
  _inherits(Dropbox, _Plugin);

  function Dropbox(core, opts) {
    _classCallCheck(this, Dropbox);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'acquirer';
    _this.id = 'Dropbox';
    _this.title = 'Dropbox';
    _this.stateId = 'dropbox';
    _this.icon = function () {
      var _path, _path2, _path3, _uppyIcon;

      return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '128'), _uppyIcon.setAttribute('height', '118'), _uppyIcon.setAttribute('viewBox', '0 0 128 118'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M38.145.777L1.108 24.96l25.608 20.507 37.344-23.06z'), _path), ' ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M1.108 65.975l37.037 24.183L64.06 68.525l-37.343-23.06zM64.06 68.525l25.917 21.633 37.036-24.183-25.61-20.51z'), _path2), ' ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M127.014 24.96L89.977.776 64.06 22.407l37.345 23.06zM64.136 73.18l-25.99 21.567-11.122-7.262v8.142l37.112 22.256 37.114-22.256v-8.142l-11.12 7.262z'), _path3), ' ']), _uppyIcon;
    };

    // writing out the key explicitly for readability the key used to store
    // the provider instance must be equal to this.id.
    _this.Dropbox = new Provider({
      host: _this.opts.host,
      provider: 'dropbox'
    });

    _this.files = [];

    _this.onAuth = _this.onAuth.bind(_this);
    // Visual
    _this.render = _this.render.bind(_this);

    // set default options
    var defaultOptions = {};

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);
    return _this;
  }

  Dropbox.prototype.install = function install() {
    this.view = new View(this);
    // Set default state
    this.core.setState({
      // writing out the key explicitly for readability the key used to store
      // the plugin state must be equal to this.stateId.
      dropbox: {
        authenticated: false,
        files: [],
        folders: [],
        directories: [],
        activeRow: -1,
        filterInput: ''
      }
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);

    this[this.id].auth().then(this.onAuth).catch(this.view.handleError);

    return;
  };

  Dropbox.prototype.uninstall = function uninstall() {
    this.unmount();
  };

  Dropbox.prototype.onAuth = function onAuth(authenticated) {
    this.view.updateState({ authenticated: authenticated });
    if (authenticated) {
      this.view.getFolder();
    }
  };

  Dropbox.prototype.isFolder = function isFolder(item) {
    return item.is_dir;
  };

  Dropbox.prototype.getItemData = function getItemData(item) {
    return _extends({}, item, { size: item.bytes });
  };

  Dropbox.prototype.getItemIcon = function getItemIcon(item) {
    var icon = icons[item.icon];

    if (!icon) {
      if (item.icon.startsWith('folder')) {
        icon = icons['folder'];
      } else {
        icon = icons['page_white'];
      }
    }
    return icon();
  };

  Dropbox.prototype.getItemSubList = function getItemSubList(item) {
    return item.contents;
  };

  Dropbox.prototype.getItemName = function getItemName(item) {
    return item.path.length > 1 ? item.path.substring(1) : item.path;
  };

  Dropbox.prototype.getMimeType = function getMimeType(item) {
    return item.mime_type;
  };

  Dropbox.prototype.getItemId = function getItemId(item) {
    return item.rev;
  };

  Dropbox.prototype.getItemRequestPath = function getItemRequestPath(item) {
    return encodeURIComponent(this.getItemName(item));
  };

  Dropbox.prototype.getItemModifiedDate = function getItemModifiedDate(item) {
    return item.modified;
  };

  Dropbox.prototype.render = function render(state) {
    return this.view.render(state);
  };

  return Dropbox;
}(Plugin);

},{"../../generic-provider-views/index":44,"../../uppy-base/src/plugins/Provider":73,"../Plugin":62,"./icons":57,"yo-yoify/lib/appendChild":29}],59:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('../Plugin');

var Provider = require('../../uppy-base/src/plugins/Provider');

var View = require('../../generic-provider-views/index');

module.exports = function (_Plugin) {
  _inherits(Google, _Plugin);

  function Google(core, opts) {
    _classCallCheck(this, Google);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'acquirer';
    _this.id = 'GoogleDrive';
    _this.title = 'Google Drive';
    _this.stateId = 'googleDrive';
    _this.icon = function () {
      var _path, _uppyIcon;

      return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '28'), _uppyIcon.setAttribute('height', '28'), _uppyIcon.setAttribute('viewBox', '0 0 16 16'), _uppyIcon.setAttribute('class', 'UppyIcon UppyModalTab-icon'), _appendChild(_uppyIcon, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M2.955 14.93l2.667-4.62H16l-2.667 4.62H2.955zm2.378-4.62l-2.666 4.62L0 10.31l5.19-8.99 2.666 4.62-2.523 4.37zm10.523-.25h-5.333l-5.19-8.99h5.334l5.19 8.99z'), _path), ' ']), _uppyIcon;
    };

    // writing out the key explicitly for readability the key used to store
    // the provider instance must be equal to this.id.
    _this.GoogleDrive = new Provider({
      host: _this.opts.host,
      provider: 'drive',
      authProvider: 'google'
    });

    _this.files = [];

    _this.onAuth = _this.onAuth.bind(_this);
    // Visual
    _this.render = _this.render.bind(_this);

    // set default options
    var defaultOptions = {};

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);
    return _this;
  }

  Google.prototype.install = function install() {
    this.view = new View(this);
    // Set default state for Google Drive
    this.core.setState({
      // writing out the key explicitly for readability the key used to store
      // the plugin state must be equal to this.stateId.
      googleDrive: {
        authenticated: false,
        files: [],
        folders: [],
        directories: [],
        activeRow: -1,
        filterInput: ''
      }
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);

    // catch error here.
    this[this.id].auth().then(this.onAuth).catch(this.view.handleError);
    return;
  };

  Google.prototype.uninstall = function uninstall() {
    this.unmount();
  };

  Google.prototype.onAuth = function onAuth(authenticated) {
    this.view.updateState({ authenticated: authenticated });
    if (authenticated) {
      this.view.getFolder('root');
    }
  };

  Google.prototype.isFolder = function isFolder(item) {
    return item.mimeType === 'application/vnd.google-apps.folder';
  };

  Google.prototype.getItemData = function getItemData(item) {
    return _extends({}, item, { size: parseFloat(item.fileSize) });
  };

  Google.prototype.getItemIcon = function getItemIcon(item) {
    var _img;

    return _img = document.createElement('img'), _img.setAttribute('src', '' + String(item.iconLink) + ''), _img;
  };

  Google.prototype.getItemSubList = function getItemSubList(item) {
    return item.items;
  };

  Google.prototype.getItemName = function getItemName(item) {
    return item.title ? item.title : '/';
  };

  Google.prototype.getMimeType = function getMimeType(item) {
    return item.mimeType;
  };

  Google.prototype.getItemId = function getItemId(item) {
    return item.id;
  };

  Google.prototype.getItemRequestPath = function getItemRequestPath(item) {
    return this.getItemId(item);
  };

  Google.prototype.getItemModifiedDate = function getItemModifiedDate(item) {
    return item.modifiedByMeDate;
  };

  Google.prototype.render = function render(state) {
    return this.view.render(state);
  };

  return Google;
}(Plugin);

},{"../../generic-provider-views/index":44,"../../uppy-base/src/plugins/Provider":73,"../Plugin":62,"yo-yoify/lib/appendChild":29}],60:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('./Plugin');


/**
 * Informer
 * Shows rad message bubbles
 * used like this: `bus.emit('informer', 'hello world', 'info', 5000)`
 * or for errors: `bus.emit('informer', 'Error uploading img.jpg', 'error', 5000)`
 *
 */
module.exports = function (_Plugin) {
  _inherits(Informer, _Plugin);

  function Informer(core, opts) {
    _classCallCheck(this, Informer);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'progressindicator';
    _this.id = 'Informer';
    _this.title = 'Informer';
    _this.timeoutID = undefined;

    // set default options
    var defaultOptions = {
      typeColors: {
        info: {
          text: '#fff',
          bg: '#000'
        },
        warning: {
          text: '#fff',
          bg: '#F6A623'
        },
        error: {
          text: '#fff',
          bg: '#e74c3c'
        },
        success: {
          text: '#fff',
          bg: '#7ac824'
        }
      }
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.render = _this.render.bind(_this);
    return _this;
  }

  Informer.prototype.showInformer = function showInformer(msg, type, duration) {
    var _this2 = this;

    this.core.setState({
      informer: {
        isHidden: false,
        type: type,
        msg: msg
      }
    });

    window.clearTimeout(this.timeoutID);
    if (duration === 0) {
      this.timeoutID = undefined;
      return;
    }

    // hide the informer after `duration` milliseconds
    this.timeoutID = setTimeout(function () {
      var newInformer = _extends({}, _this2.core.getState().informer, {
        isHidden: true
      });
      _this2.core.setState({
        informer: newInformer
      });
    }, duration);
  };

  Informer.prototype.hideInformer = function hideInformer() {
    var newInformer = _extends({}, this.core.getState().informer, {
      isHidden: true
    });
    this.core.setState({
      informer: newInformer
    });
  };

  Informer.prototype.render = function render(state) {
    var _p, _uppy;

    var isHidden = state.informer.isHidden;
    var msg = state.informer.msg;
    var type = state.informer.type || 'info';
    var style = 'background-color: ' + this.opts.typeColors[type].bg + '; color: ' + this.opts.typeColors[type].text + ';';

    // @TODO add aria-live for screen-readers
    return _uppy = document.createElement('div'), _uppy.setAttribute('style', '' + String(style) + ''), _uppy.setAttribute('aria-hidden', '' + String(isHidden) + ''), _uppy.setAttribute('class', 'Uppy UppyTheme--default UppyInformer'), _appendChild(_uppy, [' ', (_p = document.createElement('p'), _appendChild(_p, [msg]), _p), ' ']), _uppy;
  };

  Informer.prototype.install = function install() {
    var _this3 = this;

    // Set default state for Google Drive
    this.core.setState({
      informer: {
        isHidden: true,
        type: '',
        msg: ''
      }
    });

    this.core.on('informer', function (msg, type, duration) {
      _this3.showInformer(msg, type, duration);
    });

    this.core.on('informer:hide', function () {
      _this3.hideInformer();
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);
  };

  Informer.prototype.uninstall = function uninstall() {
    this.unmount();
  };

  return Informer;
}(Plugin);

},{"./Plugin":62,"yo-yoify/lib/appendChild":29}],61:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('./Plugin');

/**
 * Meta Data
 * Adds metadata fields to Uppy
 *
 */
module.exports = function (_Plugin) {
  _inherits(MetaData, _Plugin);

  function MetaData(core, opts) {
    _classCallCheck(this, MetaData);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'modifier';
    _this.id = 'MetaData';
    _this.title = 'Meta Data';

    // set default options
    var defaultOptions = {};

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.handleFileAdded = _this.handleFileAdded.bind(_this);
    return _this;
  }

  MetaData.prototype.handleFileAdded = function handleFileAdded(fileID) {
    var _this2 = this;

    var metaFields = this.opts.fields;

    metaFields.forEach(function (item) {
      var obj = {};
      obj[item.id] = item.value;
      _this2.core.updateMeta(obj, fileID);
    });
  };

  MetaData.prototype.addInitialMeta = function addInitialMeta() {
    var metaFields = this.opts.fields;

    this.core.setState({
      metaFields: metaFields
    });

    this.core.emitter.on('file-added', this.handleFileAdded);
  };

  MetaData.prototype.install = function install() {
    this.addInitialMeta();
  };

  MetaData.prototype.uninstall = function uninstall() {
    this.core.emitter.off('file-added', this.handleFileAdded);
  };

  return MetaData;
}(Plugin);

},{"./Plugin":62}],62:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var yo = require('yo-yo');
// const nanoraf = require('nanoraf')

var _require = require('../core/Utils'),
    findDOMElement = _require.findDOMElement;

/**
 * Boilerplate that all Plugins share - and should not be used
 * directly. It also shows which methods final plugins should implement/override,
 * this deciding on structure.
 *
 * @param {object} main Uppy core object
 * @param {object} object with plugin options
 * @return {array | string} files or success/fail message
 */


module.exports = function () {
  function Plugin(core, opts) {
    _classCallCheck(this, Plugin);

    this.core = core;
    this.opts = opts || {};
    this.type = 'none';

    // clear everything inside the target selector
    this.opts.replaceTargetContent === this.opts.replaceTargetContent || true;

    this.update = this.update.bind(this);
    this.mount = this.mount.bind(this);
    this.focus = this.focus.bind(this);
    this.install = this.install.bind(this);
    this.uninstall = this.uninstall.bind(this);

    // this.frame = null
  }

  Plugin.prototype.update = function update(state) {
    if (typeof this.el === 'undefined') {
      return;
    }

    // const prev = {}
    // if (!this.frame) {
    //   console.log('creating frame')
    //   this.frame = nanoraf((state, prev) => {
    //     console.log('updating!', Date.now())
    //     const newEl = this.render(state)
    //     this.el = yo.update(this.el, newEl)
    //   })
    // }
    // console.log('attempting an update...', Date.now())
    // this.frame(state, prev)

    // this.core.log('update number: ' + this.core.updateNum++)

    var newEl = this.render(state);
    yo.update(this.el, newEl);

    // optimizes performance?
    // requestAnimationFrame(() => {
    //   const newEl = this.render(state)
    //   yo.update(this.el, newEl)
    // })
  };

  /**
   * Check if supplied `target` is a DOM element or an `object`.
   * If it’s an object — target is a plugin, and we search `plugins`
   * for a plugin with same name and return its target.
   *
   * @param {String|Object} target
   *
   */


  Plugin.prototype.mount = function mount(target, plugin) {
    var callerPluginName = plugin.id;

    var targetElement = findDOMElement(target);

    if (targetElement) {
      this.core.log('Installing ' + callerPluginName + ' to a DOM element');

      // clear everything inside the target container
      if (this.opts.replaceTargetContent) {
        targetElement.innerHTML = '';
      }

      this.el = plugin.render(this.core.state);
      targetElement.appendChild(this.el);

      return targetElement;
    } else {
      // TODO: is instantiating the plugin really the way to roll
      // just to get the plugin name?
      var Target = target;
      var targetPluginName = new Target().id;

      this.core.log('Installing ' + callerPluginName + ' to ' + targetPluginName);

      var targetPlugin = this.core.getPlugin(targetPluginName);
      var selectorTarget = targetPlugin.addTarget(plugin);

      return selectorTarget;
    }
  };

  Plugin.prototype.unmount = function unmount() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  };

  Plugin.prototype.focus = function focus() {
    return;
  };

  Plugin.prototype.install = function install() {
    return;
  };

  Plugin.prototype.uninstall = function uninstall() {
    return;
  };

  return Plugin;
}();

},{"../core/Utils":33,"yo-yo":22}],63:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _Promise = typeof Promise === 'undefined' ? require('es6-promise').Promise : Promise;

var Plugin = require('./Plugin');
var tus = require('tus-js-client');
var UppySocket = require('../core/UppySocket');
var throttle = require('lodash.throttle');
require('whatwg-fetch');

// Extracted from https://github.com/tus/tus-js-client/blob/master/lib/upload.js#L13
// excepted we removed 'fingerprint' key to avoid adding more dependencies
var tusDefaultOptions = {
  endpoint: '',
  resume: true,
  onProgress: null,
  onChunkComplete: null,
  onSuccess: null,
  onError: null,
  headers: {},
  chunkSize: Infinity,
  withCredentials: false,
  uploadUrl: null,
  uploadSize: null,
  overridePatchMethod: false,
  retryDelays: null
};

/**
 * Tus resumable file uploader
 *
 */
module.exports = function (_Plugin) {
  _inherits(Tus10, _Plugin);

  function Tus10(core, opts) {
    _classCallCheck(this, Tus10);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'uploader';
    _this.id = 'Tus';
    _this.title = 'Tus';

    // set default options
    var defaultOptions = {
      resume: true,
      allowPause: true,
      autoRetry: true
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.handlePauseAll = _this.handlePauseAll.bind(_this);
    _this.handleResumeAll = _this.handleResumeAll.bind(_this);
    _this.handleUpload = _this.handleUpload.bind(_this);
    return _this;
  }

  Tus10.prototype.pauseResume = function pauseResume(action, fileID) {
    var updatedFiles = _extends({}, this.core.getState().files);
    var inProgressUpdatedFiles = Object.keys(updatedFiles).filter(function (file) {
      return !updatedFiles[file].progress.uploadComplete && updatedFiles[file].progress.uploadStarted;
    });

    switch (action) {
      case 'toggle':
        if (updatedFiles[fileID].uploadComplete) return;

        var wasPaused = updatedFiles[fileID].isPaused || false;
        var isPaused = !wasPaused;
        var updatedFile = void 0;
        if (wasPaused) {
          updatedFile = _extends({}, updatedFiles[fileID], {
            isPaused: false
          });
        } else {
          updatedFile = _extends({}, updatedFiles[fileID], {
            isPaused: true
          });
        }
        updatedFiles[fileID] = updatedFile;
        this.core.setState({ files: updatedFiles });
        return isPaused;
      case 'pauseAll':
        inProgressUpdatedFiles.forEach(function (file) {
          var updatedFile = _extends({}, updatedFiles[file], {
            isPaused: true
          });
          updatedFiles[file] = updatedFile;
        });
        this.core.setState({ files: updatedFiles });
        return;
      case 'resumeAll':
        inProgressUpdatedFiles.forEach(function (file) {
          var updatedFile = _extends({}, updatedFiles[file], {
            isPaused: false
          });
          updatedFiles[file] = updatedFile;
        });
        this.core.setState({ files: updatedFiles });
        return;
    }
  };

  Tus10.prototype.handlePauseAll = function handlePauseAll() {
    this.pauseResume('pauseAll');
  };

  Tus10.prototype.handleResumeAll = function handleResumeAll() {
    this.pauseResume('resumeAll');
  };

  /**
   * Create a new Tus upload
   *
   * @param {object} file for use with upload
   * @param {integer} current file in a queue
   * @param {integer} total number of files in a queue
   * @returns {Promise}
   */


  Tus10.prototype.upload = function upload(file, current, total) {
    var _this2 = this;

    this.core.log('uploading ' + current + ' of ' + total);

    // Create a new tus upload
    return new _Promise(function (resolve, reject) {
      var optsTus = _extends({}, tusDefaultOptions, _this2.opts,
      // Install file-specific upload overrides.
      file.tus || {});

      optsTus.onError = function (err) {
        _this2.core.log(err);
        _this2.core.emitter.emit('core:upload-error', file.id, err);
        reject('Failed because: ' + err);
      };

      optsTus.onProgress = function (bytesUploaded, bytesTotal) {
        _this2.core.emitter.emit('core:upload-progress', {
          uploader: _this2,
          id: file.id,
          bytesUploaded: bytesUploaded,
          bytesTotal: bytesTotal
        });
      };

      optsTus.onSuccess = function () {
        _this2.core.emitter.emit('core:upload-success', file.id, upload, upload.url);

        if (upload.url) {
          _this2.core.log('Download ' + upload.file.name + ' from ' + upload.url);
        }

        resolve(upload);
      };
      optsTus.metadata = file.meta;

      var upload = new tus.Upload(file.data, optsTus);

      _this2.onFileRemove(file.id, function () {
        _this2.core.log('removing file:', file.id);
        upload.abort();
        resolve('upload ' + file.id + ' was removed');
      });

      _this2.onPause(file.id, function (isPaused) {
        isPaused ? upload.abort() : upload.start();
      });

      _this2.onPauseAll(file.id, function () {
        upload.abort();
      });

      _this2.onResumeAll(file.id, function () {
        upload.start();
      });

      _this2.core.on('core:retry-started', function () {
        var files = _this2.core.getState().files;
        if (files[file.id].progress.uploadComplete || !files[file.id].progress.uploadStarted || files[file.id].isPaused) {
          return;
        }
        upload.start();
      });

      upload.start();
      _this2.core.emitter.emit('core:upload-started', file.id, upload);
    });
  };

  Tus10.prototype.uploadRemote = function uploadRemote(file, current, total) {
    var _this3 = this;

    return new _Promise(function (resolve, reject) {
      _this3.core.log(file.remote.url);
      var endpoint = _this3.opts.endpoint;
      if (file.tus && file.tus.endpoint) {
        endpoint = file.tus.endpoint;
      }

      fetch(file.remote.url, {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(_extends({}, file.remote.body, {
          endpoint: endpoint,
          protocol: 'tus',
          size: file.data.size
          // TODO add `file.meta` as tus metadata here
        }))
      }).then(function (res) {
        if (res.status < 200 && res.status > 300) {
          return reject(res.statusText);
        }

        _this3.core.emitter.emit('core:upload-started', file.id);

        res.json().then(function (data) {
          // get the host domain
          // var regex = /^(?:https?:\/\/|\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^\/\n]+)/
          var regex = /^(?:https?:\/\/|\/\/)?(?:[^@\n]+@)?(?:www\.)?([^\n]+)/;
          var host = regex.exec(file.remote.host)[1];
          var socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws';

          var token = data.token;
          var socket = new UppySocket({
            target: socketProtocol + ('://' + host + '/api/' + token)
          });

          _this3.onFileRemove(file.id, function () {
            socket.send('pause', {});
            resolve('upload ' + file.id + ' was removed');
          });

          _this3.onPause(file.id, function (isPaused) {
            isPaused ? socket.send('pause', {}) : socket.send('resume', {});
          });

          _this3.onPauseAll(file.id, function () {
            socket.send('pause', {});
          });

          _this3.onResumeAll(file.id, function () {
            socket.send('resume', {});
          });

          var emitProgress = function emitProgress(progressData) {
            var progress = progressData.progress,
                bytesUploaded = progressData.bytesUploaded,
                bytesTotal = progressData.bytesTotal;


            if (progress) {
              _this3.core.log('Upload progress: ' + progress);
              console.log(file.id);

              _this3.core.emitter.emit('core:upload-progress', {
                uploader: _this3,
                id: file.id,
                bytesUploaded: bytesUploaded,
                bytesTotal: bytesTotal
              });
            }
          };

          var throttledEmitProgress = throttle(emitProgress, 300, { leading: true, trailing: true });
          socket.on('progress', throttledEmitProgress);

          socket.on('success', function (data) {
            _this3.core.emitter.emit('core:upload-success', file.id, data, data.url);
            socket.close();
            return resolve();
          });
        });
      });
    });
  };

  Tus10.prototype.onFileRemove = function onFileRemove(fileID, cb) {
    this.core.emitter.on('core:file-remove', function (targetFileID) {
      if (fileID === targetFileID) cb();
    });
  };

  Tus10.prototype.onPause = function onPause(fileID, cb) {
    var _this4 = this;

    this.core.emitter.on('core:upload-pause', function (targetFileID) {
      if (fileID === targetFileID) {
        var isPaused = _this4.pauseResume('toggle', fileID);
        cb(isPaused);
      }
    });
  };

  Tus10.prototype.onPauseAll = function onPauseAll(fileID, cb) {
    var _this5 = this;

    this.core.emitter.on('core:pause-all', function () {
      var files = _this5.core.getState().files;
      if (!files[fileID]) return;
      cb();
    });
  };

  Tus10.prototype.onResumeAll = function onResumeAll(fileID, cb) {
    var _this6 = this;

    this.core.emitter.on('core:resume-all', function () {
      var files = _this6.core.getState().files;
      if (!files[fileID]) return;
      cb();
    });
  };

  Tus10.prototype.uploadFiles = function uploadFiles(files) {
    var _this7 = this;

    if (Object.keys(files).length === 0) {
      this.core.log('no files to upload!');
      return;
    }

    files.forEach(function (file, index) {
      var current = parseInt(index, 10) + 1;
      var total = files.length;

      if (!file.isRemote) {
        _this7.upload(file, current, total);
      } else {
        _this7.uploadRemote(file, current, total);
      }
    });
  };

  Tus10.prototype.selectForUpload = function selectForUpload(files) {
    // TODO: replace files[file].isRemote with some logic
    //
    // filter files that are now yet being uploaded / haven’t been uploaded
    // and remote too
    var filesForUpload = Object.keys(files).filter(function (file) {
      if (!files[file].progress.uploadStarted || files[file].isRemote) {
        return true;
      }
      return false;
    }).map(function (file) {
      return files[file];
    });

    this.uploadFiles(filesForUpload);
  };

  Tus10.prototype.handleUpload = function handleUpload() {
    var _this8 = this;

    this.core.log('Tus is uploading...');
    var files = this.core.getState().files;

    this.selectForUpload(files);

    return new _Promise(function (resolve) {
      _this8.core.bus.once('core:upload-complete', resolve);
    });
  };

  Tus10.prototype.actions = function actions() {
    var _this9 = this;

    this.core.emitter.on('core:pause-all', this.handlePauseAll);
    this.core.emitter.on('core:resume-all', this.handleResumeAll);

    if (this.opts.autoRetry) {
      this.core.emitter.on('back-online', function () {
        _this9.core.emitter.emit('core:retry-started');
      });
    }
  };

  Tus10.prototype.addResumableUploadsCapabilityFlag = function addResumableUploadsCapabilityFlag() {
    var newCapabilities = _extends({}, this.core.getState().capabilities);
    newCapabilities.resumableUploads = true;
    this.core.setState({
      capabilities: newCapabilities
    });
  };

  Tus10.prototype.install = function install() {
    this.addResumableUploadsCapabilityFlag();
    this.core.addUploader(this.handleUpload);
    this.actions();
  };

  Tus10.prototype.uninstall = function uninstall() {
    this.core.removeUploader(this.handleUpload);
    this.core.emitter.off('core:pause-all', this.handlePauseAll);
    this.core.emitter.off('core:resume-all', this.handleResumeAll);
  };

  return Tus10;
}(Plugin);

},{"../core/UppySocket":32,"./Plugin":62,"es6-promise":4,"lodash.throttle":5,"tus-js-client":17,"whatwg-fetch":21}],64:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _path, _path2, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '100'), _uppyIcon.setAttribute('height', '77'), _uppyIcon.setAttribute('viewBox', '0 0 100 77'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M50 32c-7.168 0-13 5.832-13 13s5.832 13 13 13 13-5.832 13-13-5.832-13-13-13z'), _path), ' ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M87 13H72c0-7.18-5.82-13-13-13H41c-7.18 0-13 5.82-13 13H13C5.82 13 0 18.82 0 26v38c0 7.18 5.82 13 13 13h74c7.18 0 13-5.82 13-13V26c0-7.18-5.82-13-13-13zM50 68c-12.683 0-23-10.318-23-23s10.317-23 23-23 23 10.318 23 23-10.317 23-23 23z'), _path2), ' ']), _uppyIcon;
};

},{"yo-yoify/lib/appendChild":29}],65:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _onload = require('on-load');

var SnapshotButton = require('./SnapshotButton');
var RecordButton = require('./RecordButton');

function isModeAvailable(modes, mode) {
  return modes.indexOf(mode) !== -1;
}

module.exports = function (props) {
  var _uppyWebcamVideoContainer, _uppyWebcamButtonContainer, _uppyWebcamCanvas, _uppyWebcamContainer;

  var src = props.src || '';
  var video = void 0;

  if (props.useTheFlash) {
    video = props.getSWFHTML();
  } else {
    var _uppyWebcamVideo;

    video = (_uppyWebcamVideo = document.createElement('video'), _uppyWebcamVideo.setAttribute('autoplay', 'autoplay'), _uppyWebcamVideo.setAttribute('muted', 'muted'), _uppyWebcamVideo.setAttribute('src', '' + String(src) + ''), _uppyWebcamVideo.setAttribute('class', 'UppyWebcam-video'), _uppyWebcamVideo);
  }

  var shouldShowRecordButton = props.supportsRecording && (isModeAvailable(props.modes, 'video-only') || isModeAvailable(props.modes, 'audio-only') || isModeAvailable(props.modes, 'video-audio'));

  var shouldShowSnapshotButton = isModeAvailable(props.modes, 'picture');

  return _uppyWebcamContainer = document.createElement('div'), _onload(_uppyWebcamContainer, function (el) {
    props.onFocus();
    var recordButton = el.querySelector('.UppyWebcam-recordButton');
    if (recordButton) recordButton.focus();
  }, function (el) {
    props.onStop();
  }, 2), _uppyWebcamContainer.setAttribute('class', 'UppyWebcam-container'), _appendChild(_uppyWebcamContainer, [' ', (_uppyWebcamVideoContainer = document.createElement('div'), _uppyWebcamVideoContainer.setAttribute('class', 'UppyWebcam-videoContainer'), _appendChild(_uppyWebcamVideoContainer, [' ', video, ' ']), _uppyWebcamVideoContainer), ' ', (_uppyWebcamButtonContainer = document.createElement('div'), _uppyWebcamButtonContainer.setAttribute('class', 'UppyWebcam-buttonContainer'), _appendChild(_uppyWebcamButtonContainer, [' ', shouldShowRecordButton ? RecordButton(props) : null, ' ', shouldShowSnapshotButton ? SnapshotButton(props) : null, ' ']), _uppyWebcamButtonContainer), ' ', (_uppyWebcamCanvas = document.createElement('canvas'), _uppyWebcamCanvas.setAttribute('style', 'display: none;'), _uppyWebcamCanvas.setAttribute('class', 'UppyWebcam-canvas'), _uppyWebcamCanvas), ' ']), _uppyWebcamContainer;
};

},{"./RecordButton":67,"./SnapshotButton":70,"on-load":7,"yo-yoify/lib/appendChild":29}],66:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _h, _span, _div;

  return _div = document.createElement('div'), _appendChild(_div, [' ', (_h = document.createElement('h1'), _h.textContent = 'Please allow access to your camera', _h), ' ', (_span = document.createElement('span'), _span.textContent = 'You have been prompted to allow camera access from this site. In order to take pictures with your camera you must approve this request.', _span), ' ']), _div;
};

},{"yo-yoify/lib/appendChild":29}],67:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var RecordStartIcon = require('./RecordStartIcon');
var RecordStopIcon = require('./RecordStopIcon');

module.exports = function RecordButton(_ref) {
  var _uppyButtonCircular2;

  var recording = _ref.recording,
      onStartRecording = _ref.onStartRecording,
      onStopRecording = _ref.onStopRecording;

  if (recording) {
    var _uppyButtonCircular;

    return _uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', 'Stop Recording'), _uppyButtonCircular.setAttribute('aria-label', 'Stop Recording'), _uppyButtonCircular.onclick = onStopRecording, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular UppyButton--red UppyButton--sizeM UppyWebcam-recordButton'), _appendChild(_uppyButtonCircular, [' ', RecordStopIcon(), ' ']), _uppyButtonCircular;
  }

  return _uppyButtonCircular2 = document.createElement('button'), _uppyButtonCircular2.setAttribute('type', 'button'), _uppyButtonCircular2.setAttribute('title', 'Begin Recording'), _uppyButtonCircular2.setAttribute('aria-label', 'Begin Recording'), _uppyButtonCircular2.onclick = onStartRecording, _uppyButtonCircular2.setAttribute('class', 'UppyButton--circular UppyButton--red UppyButton--sizeM UppyWebcam-recordButton'), _appendChild(_uppyButtonCircular2, [' ', RecordStartIcon(), ' ']), _uppyButtonCircular2;
};

},{"./RecordStartIcon":68,"./RecordStopIcon":69,"yo-yoify/lib/appendChild":29}],68:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _circle, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '100'), _uppyIcon.setAttribute('height', '100'), _uppyIcon.setAttribute('viewBox', '0 0 100 100'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_circle = document.createElementNS(_svgNamespace, 'circle'), _circle.setAttribute('cx', '50'), _circle.setAttribute('cy', '50'), _circle.setAttribute('r', '40'), _circle), ' ']), _uppyIcon;
};

},{"yo-yoify/lib/appendChild":29}],69:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _rect, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '100'), _uppyIcon.setAttribute('height', '100'), _uppyIcon.setAttribute('viewBox', '0 0 100 100'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_rect = document.createElementNS(_svgNamespace, 'rect'), _rect.setAttribute('x', '15'), _rect.setAttribute('y', '15'), _rect.setAttribute('width', '70'), _rect.setAttribute('height', '70'), _rect), ' ']), _uppyIcon;
};

},{"yo-yoify/lib/appendChild":29}],70:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var CameraIcon = require('./CameraIcon');

module.exports = function SnapshotButton(_ref) {
  var _uppyButtonCircular;

  var onSnapshot = _ref.onSnapshot;

  return _uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', 'Take a snapshot'), _uppyButtonCircular.setAttribute('aria-label', 'Take a snapshot'), _uppyButtonCircular.onclick = onSnapshot, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular UppyButton--red UppyButton--sizeM UppyWebcam-recordButton'), _appendChild(_uppyButtonCircular, [' ', CameraIcon(), ' ']), _uppyButtonCircular;
};

},{"./CameraIcon":64,"yo-yoify/lib/appendChild":29}],71:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

module.exports = function (props) {
  var _path, _path2, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '18'), _uppyIcon.setAttribute('height', '21'), _uppyIcon.setAttribute('viewBox', '0 0 18 21'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, [' ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M14.8 16.9c1.9-1.7 3.2-4.1 3.2-6.9 0-5-4-9-9-9s-9 4-9 9c0 2.8 1.2 5.2 3.2 6.9C1.9 17.9.5 19.4 0 21h3c1-1.9 11-1.9 12 0h3c-.5-1.6-1.9-3.1-3.2-4.1zM9 4c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6z'), _path), ' ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M9 14c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zM8 8c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1c0-.5.4-1 1-1z'), _path2), ' ']), _uppyIcon;
};

},{"yo-yoify/lib/appendChild":29}],72:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _Promise = typeof Promise === 'undefined' ? require('es6-promise').Promise : Promise;

var Plugin = require('../Plugin');
var WebcamProvider = require('../../uppy-base/src/plugins/Webcam');

var _require = require('../../core/Utils'),
    extend = _require.extend,
    getFileTypeExtension = _require.getFileTypeExtension,
    supportsMediaRecorder = _require.supportsMediaRecorder;

var WebcamIcon = require('./WebcamIcon');
var CameraScreen = require('./CameraScreen');
var PermissionsScreen = require('./PermissionsScreen');

/**
 * Webcam
 */
module.exports = function (_Plugin) {
  _inherits(Webcam, _Plugin);

  function Webcam(core, opts) {
    _classCallCheck(this, Webcam);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.userMedia = true;
    _this.protocol = location.protocol.match(/https/i) ? 'https' : 'http';
    _this.type = 'acquirer';
    _this.id = 'Webcam';
    _this.title = 'Webcam';
    _this.icon = WebcamIcon;

    // set default options
    var defaultOptions = {
      enableFlash: true,
      modes: ['video-audio', 'video-only', 'audio-only', 'picture']
    };

    _this.params = {
      swfURL: 'webcam.swf',
      width: 400,
      height: 300,
      dest_width: 800, // size of captured image
      dest_height: 600, // these default to width/height
      image_format: 'jpeg', // image format (may be jpeg or png)
      jpeg_quality: 90, // jpeg image quality from 0 (worst) to 100 (best)
      enable_flash: true, // enable flash fallback,
      force_flash: false, // force flash mode,
      flip_horiz: false, // flip image horiz (mirror mode)
      fps: 30, // camera frames per second
      upload_name: 'webcam', // name of file in upload post data
      constraints: null, // custom user media constraints,
      flashNotDetectedText: 'ERROR: No Adobe Flash Player detected.  Webcam.js relies on Flash for browsers that do not support getUserMedia (like yours).',
      noInterfaceFoundText: 'No supported webcam interface found.',
      unfreeze_snap: true // Whether to unfreeze the camera after snap (defaults to true)
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.install = _this.install.bind(_this);
    _this.updateState = _this.updateState.bind(_this);

    _this.render = _this.render.bind(_this);

    // Camera controls
    _this.start = _this.start.bind(_this);
    _this.stop = _this.stop.bind(_this);
    _this.takeSnapshot = _this.takeSnapshot.bind(_this);
    _this.startRecording = _this.startRecording.bind(_this);
    _this.stopRecording = _this.stopRecording.bind(_this);

    _this.webcam = new WebcamProvider(_this.opts, _this.params);
    _this.webcamActive = false;
    return _this;
  }

  Webcam.prototype.start = function start() {
    var _this2 = this;

    this.webcamActive = true;

    this.webcam.start().then(function (stream) {
      _this2.stream = stream;
      _this2.updateState({
        // videoStream: stream,
        cameraReady: true
      });
    }).catch(function (err) {
      _this2.updateState({
        cameraError: err
      });
    });
  };

  Webcam.prototype.startRecording = function startRecording() {
    var _this3 = this;

    // TODO We can check here if any of the mime types listed in the
    // mimeToExtensions map in Utils.js are supported, and prefer to use one of
    // those.
    // Right now we let the browser pick a type that it deems appropriate.
    this.recorder = new MediaRecorder(this.stream);
    this.recordingChunks = [];
    this.recorder.addEventListener('dataavailable', function (event) {
      _this3.recordingChunks.push(event.data);
    });
    this.recorder.start();

    this.updateState({
      isRecording: true
    });
  };

  Webcam.prototype.stopRecording = function stopRecording() {
    var _this4 = this;

    return new _Promise(function (resolve, reject) {
      _this4.recorder.addEventListener('stop', function () {
        _this4.updateState({
          isRecording: false
        });

        var mimeType = _this4.recordingChunks[0].type;
        var fileExtension = getFileTypeExtension(mimeType);

        if (!fileExtension) {
          reject(new Error('Could not upload file: Unsupported media type "' + mimeType + '"'));
          return;
        }

        var file = {
          source: _this4.id,
          name: 'webcam-' + Date.now() + '.' + fileExtension,
          type: mimeType,
          data: new Blob(_this4.recordingChunks, { type: mimeType })
        };

        _this4.core.emitter.emit('core:file-add', file);

        _this4.recordingChunks = null;
        _this4.recorder = null;

        resolve();
      });

      _this4.recorder.stop();
    });
  };

  Webcam.prototype.stop = function stop() {
    this.stream.getAudioTracks().forEach(function (track) {
      track.stop();
    });
    this.stream.getVideoTracks().forEach(function (track) {
      track.stop();
    });
    this.webcamActive = false;
    this.stream = null;
    this.streamSrc = null;
  };

  Webcam.prototype.takeSnapshot = function takeSnapshot() {
    var opts = {
      name: 'webcam-' + Date.now() + '.jpg',
      mimeType: 'image/jpeg'
    };

    var video = this.target.querySelector('.UppyWebcam-video');

    var image = this.webcam.getImage(video, opts);

    var tagFile = {
      source: this.id,
      name: opts.name,
      data: image.data,
      type: opts.mimeType
    };

    this.core.emitter.emit('core:file-add', tagFile);
  };

  Webcam.prototype.render = function render(state) {
    if (!this.webcamActive) {
      this.start();
    }

    if (!state.webcam.cameraReady && !state.webcam.useTheFlash) {
      return PermissionsScreen(state.webcam);
    }

    if (!this.streamSrc) {
      this.streamSrc = this.stream ? URL.createObjectURL(this.stream) : null;
    }

    return CameraScreen(extend(state.webcam, {
      onSnapshot: this.takeSnapshot,
      onStartRecording: this.startRecording,
      onStopRecording: this.stopRecording,
      onFocus: this.focus,
      onStop: this.stop,
      modes: this.opts.modes,
      supportsRecording: supportsMediaRecorder(),
      recording: state.webcam.isRecording,
      getSWFHTML: this.webcam.getSWFHTML,
      src: this.streamSrc
    }));
  };

  Webcam.prototype.focus = function focus() {
    var _this5 = this;

    setTimeout(function () {
      _this5.core.emitter.emit('informer', 'Smile!', 'warning', 2000);
    }, 1000);
  };

  Webcam.prototype.install = function install() {
    this.webcam.init();
    this.core.setState({
      webcam: {
        cameraReady: false
      }
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);
  };

  Webcam.prototype.uninstall = function uninstall() {
    this.webcam.reset();
    this.unmount();
  };

  /**
   * Little shorthand to update the state with my new state
   */


  Webcam.prototype.updateState = function updateState(newState) {
    var state = this.core.state;

    var webcam = _extends({}, state.webcam, newState);

    this.core.setState({ webcam: webcam });
  };

  return Webcam;
}(Plugin);

},{"../../core/Utils":33,"../../uppy-base/src/plugins/Webcam":74,"../Plugin":62,"./CameraScreen":65,"./PermissionsScreen":66,"./WebcamIcon":71,"es6-promise":4}],73:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('whatwg-fetch');

var _getName = function _getName(id) {
  return id.split('-').map(function (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }).join(' ');
};

module.exports = function () {
  function Provider(opts) {
    _classCallCheck(this, Provider);

    this.opts = opts;
    this.provider = opts.provider;
    this.id = this.provider;
    this.authProvider = opts.authProvider || this.provider;
    this.name = this.opts.name || _getName(this.id);
  }

  _createClass(Provider, [{
    key: 'auth',
    value: function auth() {
      return fetch(this.opts.host + '/' + this.id + '/auth', {
        method: 'get',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application.json'
        }
      }).then(function (res) {
        return res.json().then(function (payload) {
          return payload.authenticated;
        });
      });
    }
  }, {
    key: 'list',
    value: function list(directory) {
      return fetch(this.opts.host + '/' + this.id + '/list/' + (directory || ''), {
        method: 'get',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then(function (res) {
        return res.json();
      });
    }
  }, {
    key: 'logout',
    value: function logout() {
      var redirect = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : location.href;

      return fetch(this.opts.host + '/' + this.id + '/logout?redirect=' + redirect, {
        method: 'get',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
    }
  }]);

  return Provider;
}();

},{"whatwg-fetch":21}],74:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var dataURItoFile = require('../utils/dataURItoFile');

/**
 * Webcam Plugin
 */
module.exports = function () {
  function Webcam() {
    var opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, Webcam);

    this._userMedia;
    this.userMedia = true;
    this.protocol = location.protocol.match(/https/i) ? 'https' : 'http';

    // set default options
    var defaultOptions = {
      enableFlash: true,
      modes: []
    };

    var defaultParams = {
      swfURL: 'webcam.swf',
      width: 400,
      height: 300,
      dest_width: 800, // size of captured image
      dest_height: 600, // these default to width/height
      image_format: 'jpeg', // image format (may be jpeg or png)
      jpeg_quality: 90, // jpeg image quality from 0 (worst) to 100 (best)
      enable_flash: true, // enable flash fallback,
      force_flash: false, // force flash mode,
      flip_horiz: false, // flip image horiz (mirror mode)
      fps: 30, // camera frames per second
      upload_name: 'webcam', // name of file in upload post data
      constraints: null, // custom user media constraints,
      flashNotDetectedText: 'ERROR: No Adobe Flash Player detected.  Webcam.js relies on Flash for browsers that do not support getUserMedia (like yours).',
      noInterfaceFoundText: 'No supported webcam interface found.',
      unfreeze_snap: true // Whether to unfreeze the camera after snap (defaults to true)
    };

    this.params = Object.assign({}, defaultParams, params);

    // merge default options with the ones set by user
    this.opts = Object.assign({}, defaultOptions, opts);

    // Camera controls
    this.start = this.start.bind(this);
    this.init = this.init.bind(this);
    this.stop = this.stop.bind(this);
    // this.startRecording = this.startRecording.bind(this)
    // this.stopRecording = this.stopRecording.bind(this)
    this.takeSnapshot = this.takeSnapshot.bind(this);
    this.getImage = this.getImage.bind(this);
    this.getSWFHTML = this.getSWFHTML.bind(this);
    this.detectFlash = this.detectFlash.bind(this);
    this.getUserMedia = this.getUserMedia.bind(this);
    this.getMediaDevices = this.getMediaDevices.bind(this);
  }

  /**
   * Checks for getUserMedia support
   */


  _createClass(Webcam, [{
    key: 'init',
    value: function init() {
      var _this = this;

      // initialize, check for getUserMedia support
      this.mediaDevices = this.getMediaDevices();

      this.userMedia = this.getUserMedia(this.mediaDevices);

      // Make sure media stream is closed when navigating away from page
      if (this.userMedia) {
        window.addEventListener('beforeunload', function (event) {
          _this.reset();
        });
      }

      return {
        mediaDevices: this.mediaDevices,
        userMedia: this.userMedia
      };
    }

    // Setup getUserMedia, with polyfill for older browsers
    // Adapted from: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

  }, {
    key: 'getMediaDevices',
    value: function getMediaDevices() {
      return navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices : navigator.mozGetUserMedia || navigator.webkitGetUserMedia ? {
        getUserMedia: function getUserMedia(opts) {
          return new Promise(function (resolve, reject) {
            (navigator.mozGetUserMedia || navigator.webkitGetUserMedia).call(navigator, opts, resolve, reject);
          });
        }
      } : null;
    }
  }, {
    key: 'getUserMedia',
    value: function getUserMedia(mediaDevices) {
      var userMedia = true;
      // Older versions of firefox (< 21) apparently claim support but user media does not actually work
      if (navigator.userAgent.match(/Firefox\D+(\d+)/)) {
        if (parseInt(RegExp.$1, 10) < 21) {
          return null;
        }
      }

      window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
      return userMedia && !!mediaDevices && !!window.URL;
    }
  }, {
    key: 'start',
    value: function start() {
      var _this2 = this;

      this.userMedia = this._userMedia === undefined ? this.userMedia : this._userMedia;
      return new Promise(function (resolve, reject) {
        if (_this2.userMedia) {
          var acceptsAudio = _this2.opts.modes.indexOf('video-audio') !== -1 || _this2.opts.modes.indexOf('audio-only') !== -1;
          var acceptsVideo = _this2.opts.modes.indexOf('video-audio') !== -1 || _this2.opts.modes.indexOf('video-only') !== -1 || _this2.opts.modes.indexOf('picture') !== -1;

          // ask user for access to their camera
          _this2.mediaDevices.getUserMedia({
            audio: acceptsAudio,
            video: acceptsVideo
          }).then(function (stream) {
            return resolve(stream);
          }).catch(function (err) {
            return reject(err);
          });
        }
      });
    }

    /**
     * Detects if browser supports flash
     * Code snippet borrowed from: https://github.com/swfobject/swfobject
     *
     * @return {bool} flash supported
     */

  }, {
    key: 'detectFlash',
    value: function detectFlash() {
      var SHOCKWAVE_FLASH = 'Shockwave Flash';
      var SHOCKWAVE_FLASH_AX = 'ShockwaveFlash.ShockwaveFlash';
      var FLASH_MIME_TYPE = 'application/x-shockwave-flash';
      var win = window;
      var nav = navigator;
      var hasFlash = false;

      if (typeof nav.plugins !== 'undefined' && _typeof(nav.plugins[SHOCKWAVE_FLASH]) === 'object') {
        var desc = nav.plugins[SHOCKWAVE_FLASH].description;
        if (desc && typeof nav.mimeTypes !== 'undefined' && nav.mimeTypes[FLASH_MIME_TYPE] && nav.mimeTypes[FLASH_MIME_TYPE].enabledPlugin) {
          hasFlash = true;
        }
      } else if (typeof win.ActiveXObject !== 'undefined') {
        try {
          var ax = new win.ActiveXObject(SHOCKWAVE_FLASH_AX);
          if (ax) {
            var ver = ax.GetVariable('$version');
            if (ver) hasFlash = true;
          }
        } catch (e) {}
      }

      return hasFlash;
    }
  }, {
    key: 'reset',
    value: function reset() {
      // shutdown camera, reset to potentially attach again
      if (this.preview_active) this.unfreeze();

      if (this.userMedia) {
        if (this.stream) {
          if (this.stream.getVideoTracks) {
            // get video track to call stop on it
            var tracks = this.stream.getVideoTracks();
            if (tracks && tracks[0] && tracks[0].stop) tracks[0].stop();
          } else if (this.stream.stop) {
            // deprecated, may be removed in future
            this.stream.stop();
          }
        }
        delete this.stream;
      }

      if (this.userMedia !== true) {
        // call for turn off camera in flash
        this.getMovie()._releaseCamera();
      }
    }
  }, {
    key: 'getSWFHTML',
    value: function getSWFHTML() {
      // Return HTML for embedding flash based webcam capture movie
      var swfURL = this.params.swfURL;

      // make sure we aren't running locally (flash doesn't work)
      if (location.protocol.match(/file/)) {
        return '<h3 style="color:red">ERROR: the Webcam.js Flash fallback does not work from local disk.  Please run it from a web server.</h3>';
      }

      // make sure we have flash
      if (!this.detectFlash()) {
        return '<h3 style="color:red">No flash</h3>';
      }

      // set default swfURL if not explicitly set
      if (!swfURL) {
        // find our script tag, and use that base URL
        var baseUrl = '';
        var scpts = document.getElementsByTagName('script');
        for (var idx = 0, len = scpts.length; idx < len; idx++) {
          var src = scpts[idx].getAttribute('src');
          if (src && src.match(/\/webcam(\.min)?\.js/)) {
            baseUrl = src.replace(/\/webcam(\.min)?\.js.*$/, '');
            idx = len;
          }
        }
        if (baseUrl) swfURL = baseUrl + '/webcam.swf';else swfURL = 'webcam.swf';
      }

      // // if this is the user's first visit, set flashvar so flash privacy settings panel is shown first
      // if (window.localStorage && !localStorage.getItem('visited')) {
      //   // this.params.new_user = 1
      //   localStorage.setItem('visited', 1)
      // }
      // this.params.new_user = 1
      // construct flashvars string
      var flashvars = '';
      for (var key in this.params) {
        if (flashvars) flashvars += '&';
        flashvars += key + '=' + escape(this.params[key]);
      }

      // construct object/embed tag

      return '<object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000" type="application/x-shockwave-flash" codebase="' + this.protocol + '://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=9,0,0,0" width="' + this.params.width + '" height="' + this.params.height + '" id="webcam_movie_obj" align="middle"><param name="wmode" value="opaque" /><param name="allowScriptAccess" value="always" /><param name="allowFullScreen" value="false" /><param name="movie" value="' + swfURL + '" /><param name="loop" value="false" /><param name="menu" value="false" /><param name="quality" value="best" /><param name="bgcolor" value="#ffffff" /><param name="flashvars" value="' + flashvars + '"/><embed id="webcam_movie_embed" src="' + swfURL + '" wmode="opaque" loop="false" menu="false" quality="best" bgcolor="#ffffff" width="' + this.params.width + '" height="' + this.params.height + '" name="webcam_movie_embed" align="middle" allowScriptAccess="always" allowFullScreen="false" type="application/x-shockwave-flash" pluginspage="http://www.macromedia.com/go/getflashplayer" flashvars="' + flashvars + '"></embed></object>';
    }
  }, {
    key: 'getMovie',
    value: function getMovie() {
      // get reference to movie object/embed in DOM
      var movie = document.getElementById('webcam_movie_obj');
      if (!movie || !movie._snap) movie = document.getElementById('webcam_movie_embed');
      if (!movie) console.log('getMovie error');
      return movie;
    }

    /**
     * Stops the webcam capture and video playback.
     */

  }, {
    key: 'stop',
    value: function stop() {
      var videoStream = this.videoStream;


      this.updateState({
        cameraReady: false
      });

      if (videoStream) {
        if (videoStream.stop) {
          videoStream.stop();
        } else if (videoStream.msStop) {
          videoStream.msStop();
        }

        videoStream.onended = null;
        videoStream = null;
      }
    }
  }, {
    key: 'flashNotify',
    value: function flashNotify(type, msg) {
      // receive notification from flash about event
      switch (type) {
        case 'flashLoadComplete':
          // movie loaded successfully
          break;

        case 'cameraLive':
          // camera is live and ready to snap
          this.live = true;
          break;

        case 'error':
          // Flash error
          console.log('There was a flash error', msg);
          break;

        default:
          // catch-all event, just in case
          console.log('webcam flash_notify: ' + type + ': ' + msg);
          break;
      }
    }
  }, {
    key: 'configure',
    value: function configure(panel) {
      // open flash configuration panel -- specify tab name:
      // 'camera', 'privacy', 'default', 'localStorage', 'microphone', 'settingsManager'
      if (!panel) panel = 'camera';
      this.getMovie()._configure(panel);
    }

    /**
     * Takes a snapshot and displays it in a canvas.
     */

  }, {
    key: 'getImage',
    value: function getImage(video, opts) {
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      var dataUrl = canvas.toDataURL(opts.mimeType);

      var file = dataURItoFile(dataUrl, {
        name: opts.name
      });

      return {
        dataUrl: dataUrl,
        data: file,
        type: opts.mimeType
      };
    }
  }, {
    key: 'takeSnapshot',
    value: function takeSnapshot(video, canvas) {
      var opts = {
        name: 'webcam-' + Date.now() + '.jpg',
        mimeType: 'image/jpeg'
      };

      var image = this.getImage(video, canvas, opts);

      var tagFile = {
        source: this.id,
        name: opts.name,
        data: image.data,
        type: opts.type
      };

      return tagFile;
    }
  }]);

  return Webcam;
}();

},{"../utils/dataURItoFile":75}],75:[function(require,module,exports){
'use strict';

function dataURItoBlob(dataURI, opts, toFile) {
  // get the base64 data
  var data = dataURI.split(',')[1];

  // user may provide mime type, if not get it from data URI
  var mimeType = opts.mimeType || dataURI.split(',')[0].split(':')[1].split(';')[0];

  // default to plain/text if data URI has no mimeType
  if (mimeType == null) {
    mimeType = 'plain/text';
  }

  var binary = atob(data);
  var array = [];
  for (var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }

  // Convert to a File?
  if (toFile) {
    return new File([new Uint8Array(array)], opts.name || '', { type: mimeType });
  }

  return new Blob([new Uint8Array(array)], { type: mimeType });
}

module.exports = function (dataURI, opts) {
  return dataURItoBlob(dataURI, opts, true);
};

},{}],76:[function(require,module,exports){

},{}],77:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],78:[function(require,module,exports){
'use strict';

var Uppy = require('../../../../src/core');
var Dashboard = require('../../../../src/plugins/Dashboard');
var GoogleDrive = require('../../../../src/plugins/GoogleDrive');
var Dropbox = require('../../../../src/plugins/Dropbox');
var Webcam = require('../../../../src/plugins/Webcam');
var Tus10 = require('../../../../src/plugins/Tus10');
var MetaData = require('../../../../src/plugins/MetaData');
var Informer = require('../../../../src/plugins/Informer');

var UPPY_SERVER = require('../env');

var PROTOCOL = location.protocol === 'https:' ? 'https' : 'http';
var TUS_ENDPOINT = PROTOCOL + '://master.tus.io/files/';

function uppyInit() {
  var opts = window.uppyOptions;
  var dashboardEl = document.querySelector('.UppyDashboard');
  if (dashboardEl) {
    var dashboardElParent = dashboardEl.parentNode;
    dashboardElParent.removeChild(dashboardEl);
  }

  var uppy = Uppy({ debug: true, autoProceed: opts.autoProceed });
  uppy.use(Dashboard, {
    trigger: '.UppyModalOpenerBtn',
    inline: opts.DashboardInline,
    target: opts.DashboardInline ? '.DashboardContainer' : 'body'
  });

  if (opts.GoogleDrive) {
    uppy.use(GoogleDrive, { target: Dashboard, host: UPPY_SERVER });
  }

  if (opts.Dropbox) {
    uppy.use(Dropbox, { target: Dashboard, host: UPPY_SERVER });
  }

  if (opts.Webcam) {
    uppy.use(Webcam, { target: Dashboard });
  }

  uppy.use(Tus10, { endpoint: TUS_ENDPOINT, resume: true });
  uppy.use(Informer, { target: Dashboard });
  uppy.use(MetaData, {
    fields: [{ id: 'resizeTo', name: 'Resize to', value: 1200, placeholder: 'specify future image size' }, { id: 'description', name: 'Description', value: 'none', placeholder: 'describe what the file is for' }]
  });
  uppy.run();

  uppy.on('core:success', function (fileCount) {
    console.log('Yo, uploaded: ' + fileCount);
  });
}

uppyInit();
window.uppyInit = uppyInit;

},{"../../../../src/core":34,"../../../../src/plugins/Dashboard":56,"../../../../src/plugins/Dropbox":58,"../../../../src/plugins/GoogleDrive":59,"../../../../src/plugins/Informer":60,"../../../../src/plugins/MetaData":61,"../../../../src/plugins/Tus10":63,"../../../../src/plugins/Webcam":72,"../env":79}],79:[function(require,module,exports){
'use strict';

var uppyServerEndpoint = 'http://localhost:3020';

if (location.hostname === 'uppy.io') {
  uppyServerEndpoint = '//server.uppy.io';
}

var UPPY_SERVER = uppyServerEndpoint;
module.exports = UPPY_SERVER;

},{}]},{},[78])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi9ub2RlX21vZHVsZXMvZHJhZy1kcm9wL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2RyYWctZHJvcC9ub2RlX21vZHVsZXMvZmxhdHRlbi9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9kcmFnLWRyb3Avbm9kZV9tb2R1bGVzL3J1bi1wYXJhbGxlbC9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9lczYtcHJvbWlzZS9kaXN0L2VzNi1wcm9taXNlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC50aHJvdHRsZS9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9uYW1lc3BhY2UtZW1pdHRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9vbi1sb2FkL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL29uLWxvYWQvbm9kZV9tb2R1bGVzL2dsb2JhbC9kb2N1bWVudC5qcyIsIi4uL25vZGVfbW9kdWxlcy9vbi1sb2FkL25vZGVfbW9kdWxlcy9nbG9iYWwvd2luZG93LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZXR0aWVyLWJ5dGVzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS9icm93c2VyL2Jhc2U2NC5qcyIsIi4uL25vZGVfbW9kdWxlcy90dXMtanMtY2xpZW50L2xpYi5lczUvYnJvd3Nlci9yZXF1ZXN0LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS9icm93c2VyL3NvdXJjZS5qcyIsIi4uL25vZGVfbW9kdWxlcy90dXMtanMtY2xpZW50L2xpYi5lczUvYnJvd3Nlci9zdG9yYWdlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS9lcnJvci5qcyIsIi4uL25vZGVfbW9kdWxlcy90dXMtanMtY2xpZW50L2xpYi5lczUvZmluZ2VycHJpbnQuanMiLCIuLi9ub2RlX21vZHVsZXMvdHVzLWpzLWNsaWVudC9saWIuZXM1L2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS91cGxvYWQuanMiLCIuLi9ub2RlX21vZHVsZXMvdHVzLWpzLWNsaWVudC9ub2RlX21vZHVsZXMvZXh0ZW5kL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbm9kZV9tb2R1bGVzL3Jlc29sdmUtdXJsL3Jlc29sdmUtdXJsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3doYXR3Zy1mZXRjaC9mZXRjaC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9ub2RlX21vZHVsZXMvYmVsL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3lvLXlvL25vZGVfbW9kdWxlcy9iZWwvbm9kZV9tb2R1bGVzL2dsb2JhbC9kb2N1bWVudC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9ub2RlX21vZHVsZXMvYmVsL25vZGVfbW9kdWxlcy9oeXBlcngvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMveW8teW8vbm9kZV9tb2R1bGVzL2JlbC9ub2RlX21vZHVsZXMvaHlwZXJ4L25vZGVfbW9kdWxlcy9oeXBlcnNjcmlwdC1hdHRyaWJ1dGUtdG8tcHJvcGVydHkvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMveW8teW8vbm9kZV9tb2R1bGVzL21vcnBoZG9tL2Rpc3QvbW9ycGhkb20uanMiLCIuLi9ub2RlX21vZHVsZXMveW8teW8vdXBkYXRlLWV2ZW50cy5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15b2lmeS9saWIvYXBwZW5kQ2hpbGQuanMiLCIuLi9zcmMvY29yZS9Db3JlLmpzIiwiLi4vc3JjL2NvcmUvVHJhbnNsYXRvci5qcyIsIi4uL3NyYy9jb3JlL1VwcHlTb2NrZXQuanMiLCIuLi9zcmMvY29yZS9VdGlscy5qcyIsIi4uL3NyYy9jb3JlL2luZGV4LmpzIiwiLi4vc3JjL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvQXV0aFZpZXcuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9CcmVhZGNydW1iLmpzIiwiLi4vc3JjL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvQnJlYWRjcnVtYnMuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9Ccm93c2VyLmpzIiwiLi4vc3JjL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvRXJyb3IuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9Mb2FkZXIuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9UYWJsZS5qcyIsIi4uL3NyYy9nZW5lcmljLXByb3ZpZGVyLXZpZXdzL1RhYmxlQ29sdW1uLmpzIiwiLi4vc3JjL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvVGFibGVSb3cuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9pbmRleC5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9BY3Rpb25Ccm93c2VUYWdsaW5lLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL0Rhc2hib2FyZC5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9GaWxlQ2FyZC5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9GaWxlSXRlbS5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9GaWxlSXRlbVByb2dyZXNzLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL0ZpbGVMaXN0LmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL1N0YXR1c0Jhci5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9UYWJzLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL1VwbG9hZEJ0bi5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9nZXRGaWxlVHlwZUljb24uanMiLCIuLi9zcmMvcGx1Z2lucy9EYXNoYm9hcmQvaWNvbnMuanMiLCIuLi9zcmMvcGx1Z2lucy9EYXNoYm9hcmQvaW5kZXguanMiLCIuLi9zcmMvcGx1Z2lucy9Ecm9wYm94L2ljb25zLmpzIiwiLi4vc3JjL3BsdWdpbnMvRHJvcGJveC9pbmRleC5qcyIsIi4uL3NyYy9wbHVnaW5zL0dvb2dsZURyaXZlL2luZGV4LmpzIiwiLi4vc3JjL3BsdWdpbnMvSW5mb3JtZXIuanMiLCIuLi9zcmMvcGx1Z2lucy9NZXRhRGF0YS5qcyIsIi4uL3NyYy9wbHVnaW5zL1BsdWdpbi5qcyIsIi4uL3NyYy9wbHVnaW5zL1R1czEwLmpzIiwiLi4vc3JjL3BsdWdpbnMvV2ViY2FtL0NhbWVyYUljb24uanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vQ2FtZXJhU2NyZWVuLmpzIiwiLi4vc3JjL3BsdWdpbnMvV2ViY2FtL1Blcm1pc3Npb25zU2NyZWVuLmpzIiwiLi4vc3JjL3BsdWdpbnMvV2ViY2FtL1JlY29yZEJ1dHRvbi5qcyIsIi4uL3NyYy9wbHVnaW5zL1dlYmNhbS9SZWNvcmRTdGFydEljb24uanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vUmVjb3JkU3RvcEljb24uanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vU25hcHNob3RCdXR0b24uanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vV2ViY2FtSWNvbi5qcyIsIi4uL3NyYy9wbHVnaW5zL1dlYmNhbS9pbmRleC5qcyIsIi4uL3NyYy91cHB5LWJhc2Uvc3JjL3BsdWdpbnMvUHJvdmlkZXIuanMiLCIuLi9zcmMvdXBweS1iYXNlL3NyYy9wbHVnaW5zL1dlYmNhbS5qcyIsIi4uL3NyYy91cHB5LWJhc2Uvc3JjL3V0aWxzL2RhdGFVUkl0b0ZpbGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsInNyYy9leGFtcGxlcy9kYXNoYm9hcmQvYXBwLmVzNiIsInNyYy9leGFtcGxlcy9lbnYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQy83QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3ZiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaGlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdjQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDMUpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FB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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4TEEsSUFBTSxPQUFPLFFBQVEsc0JBQVIsQ0FBYjtBQUNBLElBQU0sWUFBWSxRQUFRLG1DQUFSLENBQWxCO0FBQ0EsSUFBTSxjQUFjLFFBQVEscUNBQVIsQ0FBcEI7QUFDQSxJQUFNLFVBQVUsUUFBUSxpQ0FBUixDQUFoQjtBQUNBLElBQU0sU0FBUyxRQUFRLGdDQUFSLENBQWY7QUFDQSxJQUFNLFFBQVEsUUFBUSwrQkFBUixDQUFkO0FBQ0EsSUFBTSxXQUFXLFFBQVEsa0NBQVIsQ0FBakI7QUFDQSxJQUFNLFdBQVcsUUFBUSxrQ0FBUixDQUFqQjs7QUFFQSxJQUFNLGNBQWMsUUFBUSxRQUFSLENBQXBCOztBQUVBLElBQU0sV0FBVyxTQUFTLFFBQVQsS0FBc0IsUUFBdEIsR0FBaUMsT0FBakMsR0FBMkMsTUFBNUQ7QUFDQSxJQUFNLGVBQWUsV0FBVyx5QkFBaEM7O0FBRUEsU0FBUyxRQUFULEdBQXFCO0FBQ25CLE1BQU0sT0FBTyxPQUFPLFdBQXBCO0FBQ0EsTUFBTSxjQUFjLFNBQVMsYUFBVCxDQUF1QixnQkFBdkIsQ0FBcEI7QUFDQSxNQUFJLFdBQUosRUFBaUI7QUFDZixRQUFNLG9CQUFvQixZQUFZLFVBQXRDO0FBQ0Esc0JBQWtCLFdBQWxCLENBQThCLFdBQTlCO0FBQ0Q7O0FBRUQsTUFBTSxPQUFPLEtBQUssRUFBQyxPQUFPLElBQVIsRUFBYyxhQUFhLEtBQUssV0FBaEMsRUFBTCxDQUFiO0FBQ0EsT0FBSyxHQUFMLENBQVMsU0FBVCxFQUFvQjtBQUNsQixhQUFTLHFCQURTO0FBRWxCLFlBQVEsS0FBSyxlQUZLO0FBR2xCLFlBQVEsS0FBSyxlQUFMLEdBQXVCLHFCQUF2QixHQUErQztBQUhyQyxHQUFwQjs7QUFNQSxNQUFJLEtBQUssV0FBVCxFQUFzQjtBQUNwQixTQUFLLEdBQUwsQ0FBUyxXQUFULEVBQXNCLEVBQUMsUUFBUSxTQUFULEVBQW9CLE1BQU0sV0FBMUIsRUFBdEI7QUFDRDs7QUFFRCxNQUFJLEtBQUssT0FBVCxFQUFrQjtBQUNoQixTQUFLLEdBQUwsQ0FBUyxPQUFULEVBQWtCLEVBQUMsUUFBUSxTQUFULEVBQW9CLE1BQU0sV0FBMUIsRUFBbEI7QUFDRDs7QUFFRCxNQUFJLEtBQUssTUFBVCxFQUFpQjtBQUNmLFNBQUssR0FBTCxDQUFTLE1BQVQsRUFBaUIsRUFBQyxRQUFRLFNBQVQsRUFBakI7QUFDRDs7QUFFRCxPQUFLLEdBQUwsQ0FBUyxLQUFULEVBQWdCLEVBQUMsVUFBVSxZQUFYLEVBQXlCLFFBQVEsSUFBakMsRUFBaEI7QUFDQSxPQUFLLEdBQUwsQ0FBUyxRQUFULEVBQW1CLEVBQUMsUUFBUSxTQUFULEVBQW5CO0FBQ0EsT0FBSyxHQUFMLENBQVMsUUFBVCxFQUFtQjtBQUNqQixZQUFRLENBQ04sRUFBRSxJQUFJLFVBQU4sRUFBa0IsTUFBTSxXQUF4QixFQUFxQyxPQUFPLElBQTVDLEVBQWtELGFBQWEsMkJBQS9ELEVBRE0sRUFFTixFQUFFLElBQUksYUFBTixFQUFxQixNQUFNLGFBQTNCLEVBQTBDLE9BQU8sTUFBakQsRUFBeUQsYUFBYSwrQkFBdEUsRUFGTTtBQURTLEdBQW5CO0FBTUEsT0FBSyxHQUFMOztBQUVBLE9BQUssRUFBTCxDQUFRLGNBQVIsRUFBd0IsVUFBQyxTQUFELEVBQWU7QUFDckMsWUFBUSxHQUFSLENBQVksbUJBQW1CLFNBQS9CO0FBQ0QsR0FGRDtBQUdEOztBQUVEO0FBQ0EsT0FBTyxRQUFQLEdBQWtCLFFBQWxCOzs7OztBQ3pEQSxJQUFJLHFCQUFxQix1QkFBekI7O0FBRUEsSUFBSSxTQUFTLFFBQVQsS0FBc0IsU0FBMUIsRUFBcUM7QUFDbkMsdUJBQXFCLGtCQUFyQjtBQUNEOztBQUVELElBQU0sY0FBYyxrQkFBcEI7QUFDQSxPQUFPLE9BQVAsR0FBaUIsV0FBakIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHMgPSBkcmFnRHJvcFxuXG52YXIgZmxhdHRlbiA9IHJlcXVpcmUoJ2ZsYXR0ZW4nKVxudmFyIHBhcmFsbGVsID0gcmVxdWlyZSgncnVuLXBhcmFsbGVsJylcblxuZnVuY3Rpb24gZHJhZ0Ryb3AgKGVsZW0sIGxpc3RlbmVycykge1xuICBpZiAodHlwZW9mIGVsZW0gPT09ICdzdHJpbmcnKSB7XG4gICAgdmFyIHNlbGVjdG9yID0gZWxlbVxuICAgIGVsZW0gPSB3aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlbGVtKVxuICAgIGlmICghZWxlbSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdcIicgKyBzZWxlY3RvciArICdcIiBkb2VzIG5vdCBtYXRjaCBhbnkgSFRNTCBlbGVtZW50cycpXG4gICAgfVxuICB9XG5cbiAgaWYgKCFlbGVtKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdcIicgKyBlbGVtICsgJ1wiIGlzIG5vdCBhIHZhbGlkIEhUTUwgZWxlbWVudCcpXG4gIH1cblxuICBpZiAodHlwZW9mIGxpc3RlbmVycyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGxpc3RlbmVycyA9IHsgb25Ecm9wOiBsaXN0ZW5lcnMgfVxuICB9XG5cbiAgdmFyIHRpbWVvdXRcblxuICBlbGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdlbnRlcicsIG9uRHJhZ0VudGVyLCBmYWxzZSlcbiAgZWxlbS5hZGRFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIG9uRHJhZ092ZXIsIGZhbHNlKVxuICBlbGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdsZWF2ZScsIG9uRHJhZ0xlYXZlLCBmYWxzZSlcbiAgZWxlbS5hZGRFdmVudExpc3RlbmVyKCdkcm9wJywgb25Ecm9wLCBmYWxzZSlcblxuICAvLyBGdW5jdGlvbiB0byByZW1vdmUgZHJhZy1kcm9wIGxpc3RlbmVyc1xuICByZXR1cm4gZnVuY3Rpb24gcmVtb3ZlICgpIHtcbiAgICByZW1vdmVEcmFnQ2xhc3MoKVxuICAgIGVsZW0ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHJhZ2VudGVyJywgb25EcmFnRW50ZXIsIGZhbHNlKVxuICAgIGVsZW0ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHJhZ292ZXInLCBvbkRyYWdPdmVyLCBmYWxzZSlcbiAgICBlbGVtLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2RyYWdsZWF2ZScsIG9uRHJhZ0xlYXZlLCBmYWxzZSlcbiAgICBlbGVtLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Ryb3AnLCBvbkRyb3AsIGZhbHNlKVxuICB9XG5cbiAgZnVuY3Rpb24gb25EcmFnRW50ZXIgKGUpIHtcbiAgICBpZiAobGlzdGVuZXJzLm9uRHJhZ0VudGVyKSB7XG4gICAgICBsaXN0ZW5lcnMub25EcmFnRW50ZXIoZSlcbiAgICB9XG5cbiAgICAvLyBQcmV2ZW50IGV2ZW50XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gb25EcmFnT3ZlciAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIuaXRlbXMpIHtcbiAgICAgIC8vIE9ubHkgYWRkIFwiZHJhZ1wiIGNsYXNzIHdoZW4gYGl0ZW1zYCBjb250YWlucyBpdGVtcyB0aGF0IGFyZSBhYmxlIHRvIGJlXG4gICAgICAvLyBoYW5kbGVkIGJ5IHRoZSByZWdpc3RlcmVkIGxpc3RlbmVycyAoZmlsZXMgdnMuIHRleHQpXG4gICAgICB2YXIgaXRlbXMgPSB0b0FycmF5KGUuZGF0YVRyYW5zZmVyLml0ZW1zKVxuICAgICAgdmFyIGZpbGVJdGVtcyA9IGl0ZW1zLmZpbHRlcihmdW5jdGlvbiAoaXRlbSkgeyByZXR1cm4gaXRlbS5raW5kID09PSAnZmlsZScgfSlcbiAgICAgIHZhciB0ZXh0SXRlbXMgPSBpdGVtcy5maWx0ZXIoZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuIGl0ZW0ua2luZCA9PT0gJ3N0cmluZycgfSlcblxuICAgICAgaWYgKGZpbGVJdGVtcy5sZW5ndGggPT09IDAgJiYgIWxpc3RlbmVycy5vbkRyb3BUZXh0KSByZXR1cm5cbiAgICAgIGlmICh0ZXh0SXRlbXMubGVuZ3RoID09PSAwICYmICFsaXN0ZW5lcnMub25Ecm9wKSByZXR1cm5cbiAgICAgIGlmIChmaWxlSXRlbXMubGVuZ3RoID09PSAwICYmIHRleHRJdGVtcy5sZW5ndGggPT09IDApIHJldHVyblxuICAgIH1cblxuICAgIGVsZW0uY2xhc3NMaXN0LmFkZCgnZHJhZycpXG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpXG5cbiAgICBpZiAobGlzdGVuZXJzLm9uRHJhZ092ZXIpIHtcbiAgICAgIGxpc3RlbmVycy5vbkRyYWdPdmVyKGUpXG4gICAgfVxuXG4gICAgZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdjb3B5J1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gb25EcmFnTGVhdmUgKGUpIHtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICBpZiAobGlzdGVuZXJzLm9uRHJhZ0xlYXZlKSB7XG4gICAgICBsaXN0ZW5lcnMub25EcmFnTGVhdmUoZSlcbiAgICB9XG5cbiAgICBjbGVhclRpbWVvdXQodGltZW91dClcbiAgICB0aW1lb3V0ID0gc2V0VGltZW91dChyZW1vdmVEcmFnQ2xhc3MsIDUwKVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBvbkRyb3AgKGUpIHtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICBpZiAobGlzdGVuZXJzLm9uRHJhZ0xlYXZlKSB7XG4gICAgICBsaXN0ZW5lcnMub25EcmFnTGVhdmUoZSlcbiAgICB9XG5cbiAgICBjbGVhclRpbWVvdXQodGltZW91dClcbiAgICByZW1vdmVEcmFnQ2xhc3MoKVxuXG4gICAgdmFyIHBvcyA9IHtcbiAgICAgIHg6IGUuY2xpZW50WCxcbiAgICAgIHk6IGUuY2xpZW50WVxuICAgIH1cblxuICAgIC8vIHRleHQgZHJvcCBzdXBwb3J0XG4gICAgdmFyIHRleHQgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKCd0ZXh0JylcbiAgICBpZiAodGV4dCAmJiBsaXN0ZW5lcnMub25Ecm9wVGV4dCkge1xuICAgICAgbGlzdGVuZXJzLm9uRHJvcFRleHQodGV4dCwgcG9zKVxuICAgIH1cblxuICAgIC8vIGZpbGUgZHJvcCBzdXBwb3J0XG4gICAgaWYgKGUuZGF0YVRyYW5zZmVyLml0ZW1zKSB7XG4gICAgICAvLyBIYW5kbGUgZGlyZWN0b3JpZXMgaW4gQ2hyb21lIHVzaW5nIHRoZSBwcm9wcmlldGFyeSBGaWxlU3lzdGVtIEFQSVxuICAgICAgdmFyIGl0ZW1zID0gdG9BcnJheShlLmRhdGFUcmFuc2Zlci5pdGVtcykuZmlsdGVyKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgIHJldHVybiBpdGVtLmtpbmQgPT09ICdmaWxlJ1xuICAgICAgfSlcblxuICAgICAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgICAgIHBhcmFsbGVsKGl0ZW1zLm1hcChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgcHJvY2Vzc0VudHJ5KGl0ZW0ud2Via2l0R2V0QXNFbnRyeSgpLCBjYilcbiAgICAgICAgfVxuICAgICAgfSksIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgLy8gVGhpcyBjYXRjaGVzIHBlcm1pc3Npb24gZXJyb3JzIHdpdGggZmlsZTovLyBpbiBDaHJvbWUuIFRoaXMgc2hvdWxkIG5ldmVyXG4gICAgICAgIC8vIHRocm93IGluIHByb2R1Y3Rpb24gY29kZSwgc28gdGhlIHVzZXIgZG9lcyBub3QgbmVlZCB0byB1c2UgdHJ5LWNhdGNoLlxuICAgICAgICBpZiAoZXJyKSB0aHJvdyBlcnJcbiAgICAgICAgaWYgKGxpc3RlbmVycy5vbkRyb3ApIHtcbiAgICAgICAgICBsaXN0ZW5lcnMub25Ecm9wKGZsYXR0ZW4ocmVzdWx0cyksIHBvcylcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGZpbGVzID0gdG9BcnJheShlLmRhdGFUcmFuc2Zlci5maWxlcylcblxuICAgICAgaWYgKGZpbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgICAgIGZpbGVzLmZvckVhY2goZnVuY3Rpb24gKGZpbGUpIHtcbiAgICAgICAgZmlsZS5mdWxsUGF0aCA9ICcvJyArIGZpbGUubmFtZVxuICAgICAgfSlcblxuICAgICAgaWYgKGxpc3RlbmVycy5vbkRyb3ApIHtcbiAgICAgICAgbGlzdGVuZXJzLm9uRHJvcChmaWxlcywgcG9zKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlRHJhZ0NsYXNzICgpIHtcbiAgICBlbGVtLmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWcnKVxuICB9XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NFbnRyeSAoZW50cnksIGNiKSB7XG4gIHZhciBlbnRyaWVzID0gW11cblxuICBpZiAoZW50cnkuaXNGaWxlKSB7XG4gICAgZW50cnkuZmlsZShmdW5jdGlvbiAoZmlsZSkge1xuICAgICAgZmlsZS5mdWxsUGF0aCA9IGVudHJ5LmZ1bGxQYXRoICAvLyBwcmVzZXJ2ZSBwYXRoaW5nIGZvciBjb25zdW1lclxuICAgICAgY2IobnVsbCwgZmlsZSlcbiAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBjYihlcnIpXG4gICAgfSlcbiAgfSBlbHNlIGlmIChlbnRyeS5pc0RpcmVjdG9yeSkge1xuICAgIHZhciByZWFkZXIgPSBlbnRyeS5jcmVhdGVSZWFkZXIoKVxuICAgIHJlYWRFbnRyaWVzKClcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlYWRFbnRyaWVzICgpIHtcbiAgICByZWFkZXIucmVhZEVudHJpZXMoZnVuY3Rpb24gKGVudHJpZXNfKSB7XG4gICAgICBpZiAoZW50cmllc18ubGVuZ3RoID4gMCkge1xuICAgICAgICBlbnRyaWVzID0gZW50cmllcy5jb25jYXQodG9BcnJheShlbnRyaWVzXykpXG4gICAgICAgIHJlYWRFbnRyaWVzKCkgLy8gY29udGludWUgcmVhZGluZyBlbnRyaWVzIHVudGlsIGByZWFkRW50cmllc2AgcmV0dXJucyBubyBtb3JlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkb25lRW50cmllcygpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGRvbmVFbnRyaWVzICgpIHtcbiAgICBwYXJhbGxlbChlbnRyaWVzLm1hcChmdW5jdGlvbiAoZW50cnkpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgICAgcHJvY2Vzc0VudHJ5KGVudHJ5LCBjYilcbiAgICAgIH1cbiAgICB9KSwgY2IpXG4gIH1cbn1cblxuZnVuY3Rpb24gdG9BcnJheSAobGlzdCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwobGlzdCB8fCBbXSwgMClcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmxhdHRlbihsaXN0LCBkZXB0aCkge1xuICBkZXB0aCA9ICh0eXBlb2YgZGVwdGggPT0gJ251bWJlcicpID8gZGVwdGggOiBJbmZpbml0eTtcblxuICBpZiAoIWRlcHRoKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkobGlzdCkpIHtcbiAgICAgIHJldHVybiBsaXN0Lm1hcChmdW5jdGlvbihpKSB7IHJldHVybiBpOyB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGxpc3Q7XG4gIH1cblxuICByZXR1cm4gX2ZsYXR0ZW4obGlzdCwgMSk7XG5cbiAgZnVuY3Rpb24gX2ZsYXR0ZW4obGlzdCwgZCkge1xuICAgIHJldHVybiBsaXN0LnJlZHVjZShmdW5jdGlvbiAoYWNjLCBpdGVtKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShpdGVtKSAmJiBkIDwgZGVwdGgpIHtcbiAgICAgICAgcmV0dXJuIGFjYy5jb25jYXQoX2ZsYXR0ZW4oaXRlbSwgZCArIDEpKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gYWNjLmNvbmNhdChpdGVtKTtcbiAgICAgIH1cbiAgICB9LCBbXSk7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICh0YXNrcywgY2IpIHtcbiAgdmFyIHJlc3VsdHMsIHBlbmRpbmcsIGtleXNcbiAgdmFyIGlzU3luYyA9IHRydWVcblxuICBpZiAoQXJyYXkuaXNBcnJheSh0YXNrcykpIHtcbiAgICByZXN1bHRzID0gW11cbiAgICBwZW5kaW5nID0gdGFza3MubGVuZ3RoXG4gIH0gZWxzZSB7XG4gICAga2V5cyA9IE9iamVjdC5rZXlzKHRhc2tzKVxuICAgIHJlc3VsdHMgPSB7fVxuICAgIHBlbmRpbmcgPSBrZXlzLmxlbmd0aFxuICB9XG5cbiAgZnVuY3Rpb24gZG9uZSAoZXJyKSB7XG4gICAgZnVuY3Rpb24gZW5kICgpIHtcbiAgICAgIGlmIChjYikgY2IoZXJyLCByZXN1bHRzKVxuICAgICAgY2IgPSBudWxsXG4gICAgfVxuICAgIGlmIChpc1N5bmMpIHByb2Nlc3MubmV4dFRpY2soZW5kKVxuICAgIGVsc2UgZW5kKClcbiAgfVxuXG4gIGZ1bmN0aW9uIGVhY2ggKGksIGVyciwgcmVzdWx0KSB7XG4gICAgcmVzdWx0c1tpXSA9IHJlc3VsdFxuICAgIGlmICgtLXBlbmRpbmcgPT09IDAgfHwgZXJyKSB7XG4gICAgICBkb25lKGVycilcbiAgICB9XG4gIH1cblxuICBpZiAoIXBlbmRpbmcpIHtcbiAgICAvLyBlbXB0eVxuICAgIGRvbmUobnVsbClcbiAgfSBlbHNlIGlmIChrZXlzKSB7XG4gICAgLy8gb2JqZWN0XG4gICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHRhc2tzW2tleV0oZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7IGVhY2goa2V5LCBlcnIsIHJlc3VsdCkgfSlcbiAgICB9KVxuICB9IGVsc2Uge1xuICAgIC8vIGFycmF5XG4gICAgdGFza3MuZm9yRWFjaChmdW5jdGlvbiAodGFzaywgaSkge1xuICAgICAgdGFzayhmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHsgZWFjaChpLCBlcnIsIHJlc3VsdCkgfSlcbiAgICB9KVxuICB9XG5cbiAgaXNTeW5jID0gZmFsc2Vcbn1cbiIsIi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9qYWtlYXJjaGliYWxkL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDMuMi4xXG4gKi9cblxuKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgKHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNNYXliZVRoZW5hYmxlKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheSA9IGxpYiRlczYkcHJvbWlzZSR1dGlscyQkX2lzQXJyYXk7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPSAwO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkdmVydHhOZXh0O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm47XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAgPSBmdW5jdGlvbiBhc2FwKGNhbGxiYWNrLCBhcmcpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuXSA9IGNhbGxiYWNrO1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2xpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gKyAxXSA9IGFyZztcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gKz0gMjtcbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuID09PSAyKSB7XG4gICAgICAgIC8vIElmIGxlbiBpcyAyLCB0aGF0IG1lYW5zIHRoYXQgd2UgbmVlZCB0byBzY2hlZHVsZSBhbiBhc3luYyBmbHVzaC5cbiAgICAgICAgLy8gSWYgYWRkaXRpb25hbCBjYWxsYmFja3MgYXJlIHF1ZXVlZCBiZWZvcmUgdGhlIHF1ZXVlIGlzIGZsdXNoZWQsIHRoZXlcbiAgICAgICAgLy8gd2lsbCBiZSBwcm9jZXNzZWQgYnkgdGhpcyBmbHVzaCB0aGF0IHdlIGFyZSBzY2hlZHVsaW5nLlxuICAgICAgICBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2goKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRTY2hlZHVsZXIoc2NoZWR1bGVGbikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGN1c3RvbVNjaGVkdWxlckZuID0gc2NoZWR1bGVGbjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0QXNhcChhc2FwRm4pIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwID0gYXNhcEZuO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgPyB3aW5kb3cgOiB1bmRlZmluZWQ7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJXaW5kb3cgfHwge307XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRCcm93c2VyTXV0YXRpb25PYnNlcnZlciA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyR2xvYmFsLk11dGF0aW9uT2JzZXJ2ZXIgfHwgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwuV2ViS2l0TXV0YXRpb25PYnNlcnZlcjtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGlzTm9kZSA9IHR5cGVvZiBzZWxmID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYge30udG9TdHJpbmcuY2FsbChwcm9jZXNzKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuXG4gICAgLy8gdGVzdCBmb3Igd2ViIHdvcmtlciBidXQgbm90IGluIElFMTBcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGlzV29ya2VyID0gdHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgdHlwZW9mIGltcG9ydFNjcmlwdHMgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09ICd1bmRlZmluZWQnO1xuXG4gICAgLy8gbm9kZVxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpIHtcbiAgICAgIC8vIG5vZGUgdmVyc2lvbiAwLjEwLnggZGlzcGxheXMgYSBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gbmV4dFRpY2sgaXMgdXNlZCByZWN1cnNpdmVseVxuICAgICAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jdWpvanMvd2hlbi9pc3N1ZXMvNDEwIGZvciBkZXRhaWxzXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2sobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gdmVydHhcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dChsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTXV0YXRpb25PYnNlcnZlcigpIHtcbiAgICAgIHZhciBpdGVyYXRpb25zID0gMDtcbiAgICAgIHZhciBvYnNlcnZlciA9IG5ldyBsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgIHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbm9kZS5kYXRhID0gKGl0ZXJhdGlvbnMgPSArK2l0ZXJhdGlvbnMgJSAyKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gd2ViIHdvcmtlclxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNZXNzYWdlQ2hhbm5lbCgpIHtcbiAgICAgIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaDtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZXRUaW1lb3V0KGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCwgMSk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuOyBpKz0yKSB7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpXTtcbiAgICAgICAgdmFyIGFyZyA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpKzFdO1xuXG4gICAgICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2ldID0gdW5kZWZpbmVkO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaSsxXSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cblxuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9IDA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJGF0dGVtcHRWZXJ0eCgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhciByID0gcmVxdWlyZTtcbiAgICAgICAgdmFyIHZlcnR4ID0gcigndmVydHgnKTtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHZlcnR4TmV4dCA9IHZlcnR4LnJ1bk9uTG9vcCB8fCB2ZXJ0eC5ydW5PbkNvbnRleHQ7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlVmVydHhUaW1lcigpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaDtcbiAgICAvLyBEZWNpZGUgd2hhdCBhc3luYyBtZXRob2QgdG8gdXNlIHRvIHRyaWdnZXJpbmcgcHJvY2Vzc2luZyBvZiBxdWV1ZWQgY2FsbGJhY2tzOlxuICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VOZXh0VGljaygpO1xuICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNXb3JrZXIpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhdHRlbXB0VmVydHgoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlU2V0VGltZW91dCgpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkdGhlbiQkdGhlbihvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICAgICAgdmFyIHBhcmVudCA9IHRoaXM7XG5cbiAgICAgIHZhciBjaGlsZCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoY2hpbGRbbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRtYWtlUHJvbWlzZShjaGlsZCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBzdGF0ZSA9IHBhcmVudC5fc3RhdGU7XG5cbiAgICAgIGlmIChzdGF0ZSkge1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmd1bWVudHNbc3RhdGUgLSAxXTtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAoZnVuY3Rpb24oKXtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCBwYXJlbnQuX3Jlc3VsdCk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNoaWxkO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHRoZW4kJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkdGhlbiQkdGhlbjtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRyZXNvbHZlKG9iamVjdCkge1xuICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgICAgIGlmIChvYmplY3QgJiYgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0LmNvbnN0cnVjdG9yID09PSBDb25zdHJ1Y3Rvcikge1xuICAgICAgICByZXR1cm4gb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3RvcihsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgb2JqZWN0KTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJHJlc29sdmU7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSUQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMTYpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCgpIHt9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORyAgID0gdm9pZCAwO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQgPSAxO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCAgPSAyO1xuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SID0gbmV3IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCk7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzZWxmRnVsZmlsbG1lbnQoKSB7XG4gICAgICByZXR1cm4gbmV3IFR5cGVFcnJvcihcIllvdSBjYW5ub3QgcmVzb2x2ZSBhIHByb21pc2Ugd2l0aCBpdHNlbGZcIik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkY2Fubm90UmV0dXJuT3duKCkge1xuICAgICAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoJ0EgcHJvbWlzZXMgY2FsbGJhY2sgY2Fubm90IHJldHVybiB0aGF0IHNhbWUgcHJvbWlzZS4nKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKHByb21pc2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBwcm9taXNlLnRoZW47XG4gICAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SLmVycm9yID0gZXJyb3I7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlUaGVuKHRoZW4sIHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHRoZW4uY2FsbCh2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICByZXR1cm4gZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUsIHRoZW4pIHtcbiAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChmdW5jdGlvbihwcm9taXNlKSB7XG4gICAgICAgIHZhciBzZWFsZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGVycm9yID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5VGhlbih0aGVuLCB0aGVuYWJsZSwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBpZiAoc2VhbGVkKSB7IHJldHVybjsgfVxuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICAgICAgaWYgKHRoZW5hYmxlICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgaWYgKHNlYWxlZCkgeyByZXR1cm47IH1cbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuXG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0sICdTZXR0bGU6ICcgKyAocHJvbWlzZS5fbGFiZWwgfHwgJyB1bmtub3duIHByb21pc2UnKSk7XG5cbiAgICAgICAgaWYgKCFzZWFsZWQgJiYgZXJyb3IpIHtcbiAgICAgICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH0sIHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlKSB7XG4gICAgICBpZiAodGhlbmFibGUuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgICAgIH0gZWxzZSBpZiAodGhlbmFibGUuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUodGhlbmFibGUsIHVuZGVmaW5lZCwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbikge1xuICAgICAgaWYgKG1heWJlVGhlbmFibGUuY29uc3RydWN0b3IgPT09IHByb21pc2UuY29uc3RydWN0b3IgJiZcbiAgICAgICAgICB0aGVuID09PSBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCAmJlxuICAgICAgICAgIGNvbnN0cnVjdG9yLnJlc29sdmUgPT09IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodGhlbiA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoZW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKHRoZW4pKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKSB7XG4gICAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHNlbGZGdWxmaWxsbWVudCgpKTtcbiAgICAgIH0gZWxzZSBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRvYmplY3RPckZ1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIHZhbHVlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKHZhbHVlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgICAgIGlmIChwcm9taXNlLl9vbmVycm9yKSB7XG4gICAgICAgIHByb21pc2UuX29uZXJyb3IocHJvbWlzZS5fcmVzdWx0KTtcbiAgICAgIH1cblxuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaChwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKSB7XG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHsgcmV0dXJuOyB9XG5cbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHZhbHVlO1xuICAgICAgcHJvbWlzZS5fc3RhdGUgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQ7XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggIT09IDApIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaCwgcHJvbWlzZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbikge1xuICAgICAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HKSB7IHJldHVybjsgfVxuICAgICAgcHJvbWlzZS5fc3RhdGUgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRDtcbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHJlYXNvbjtcblxuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaFJlamVjdGlvbiwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gICAgICB2YXIgc3Vic2NyaWJlcnMgPSBwYXJlbnQuX3N1YnNjcmliZXJzO1xuICAgICAgdmFyIGxlbmd0aCA9IHN1YnNjcmliZXJzLmxlbmd0aDtcblxuICAgICAgcGFyZW50Ll9vbmVycm9yID0gbnVsbDtcblxuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoXSA9IGNoaWxkO1xuICAgICAgc3Vic2NyaWJlcnNbbGVuZ3RoICsgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVEXSA9IG9uRnVsZmlsbG1lbnQ7XG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGggKyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRF0gID0gb25SZWplY3Rpb247XG5cbiAgICAgIGlmIChsZW5ndGggPT09IDAgJiYgcGFyZW50Ll9zdGF0ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoLCBwYXJlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gocHJvbWlzZSkge1xuICAgICAgdmFyIHN1YnNjcmliZXJzID0gcHJvbWlzZS5fc3Vic2NyaWJlcnM7XG4gICAgICB2YXIgc2V0dGxlZCA9IHByb21pc2UuX3N0YXRlO1xuXG4gICAgICBpZiAoc3Vic2NyaWJlcnMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG4gICAgICB2YXIgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwgPSBwcm9taXNlLl9yZXN1bHQ7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3Vic2NyaWJlcnMubGVuZ3RoOyBpICs9IDMpIHtcbiAgICAgICAgY2hpbGQgPSBzdWJzY3JpYmVyc1tpXTtcbiAgICAgICAgY2FsbGJhY2sgPSBzdWJzY3JpYmVyc1tpICsgc2V0dGxlZF07XG5cbiAgICAgICAgaWYgKGNoaWxkKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoID0gMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpIHtcbiAgICAgIHRoaXMuZXJyb3IgPSBudWxsO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1IgPSBuZXcgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKTtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhkZXRhaWwpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUi5lcnJvciA9IGU7XG4gICAgICAgIHJldHVybiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRUUllfQ0FUQ0hfRVJST1I7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgcHJvbWlzZSwgY2FsbGJhY2ssIGRldGFpbCkge1xuICAgICAgdmFyIGhhc0NhbGxiYWNrID0gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0Z1bmN0aW9uKGNhbGxiYWNrKSxcbiAgICAgICAgICB2YWx1ZSwgZXJyb3IsIHN1Y2NlZWRlZCwgZmFpbGVkO1xuXG4gICAgICBpZiAoaGFzQ2FsbGJhY2spIHtcbiAgICAgICAgdmFsdWUgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKTtcblxuICAgICAgICBpZiAodmFsdWUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUikge1xuICAgICAgICAgIGZhaWxlZCA9IHRydWU7XG4gICAgICAgICAgZXJyb3IgPSB2YWx1ZS5lcnJvcjtcbiAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRjYW5ub3RSZXR1cm5Pd24oKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlID0gZGV0YWlsO1xuICAgICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmIChoYXNDYWxsYmFjayAmJiBzdWNjZWVkZWQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGZhaWxlZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UocHJvbWlzZSwgcmVzb2x2ZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmVyKGZ1bmN0aW9uIHJlc29sdmVQcm9taXNlKHZhbHVlKXtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSwgZnVuY3Rpb24gcmVqZWN0UHJvbWlzZShyZWFzb24pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpZCA9IDA7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbmV4dElkKCkge1xuICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGlkKys7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbWFrZVByb21pc2UocHJvbWlzZSkge1xuICAgICAgcHJvbWlzZVtsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGlkKys7XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgICAgIHByb21pc2UuX3Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgICAgIHByb21pc2UuX3N1YnNjcmliZXJzID0gW107XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRhbGwoZW50cmllcykge1xuICAgICAgcmV0dXJuIG5ldyBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkZGVmYXVsdCh0aGlzLCBlbnRyaWVzKS5wcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRhbGw7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkcmFjZShlbnRyaWVzKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICAgICAgaWYgKCFsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoZW50cmllcykpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICByZWplY3QobmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhbiBhcnJheSB0byByYWNlLicpKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgIHZhciBsZW5ndGggPSBlbnRyaWVzLmxlbmd0aDtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBDb25zdHJ1Y3Rvci5yZXNvbHZlKGVudHJpZXNbaV0pLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJhY2UkJHJhY2U7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRyZWplY3QocmVhc29uKSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkcmVqZWN0O1xuXG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNSZXNvbHZlcigpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYSByZXNvbHZlciBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIHByb21pc2UgY29uc3RydWN0b3InKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkbmVlZHNOZXcoKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnUHJvbWlzZSc6IFBsZWFzZSB1c2UgdGhlICduZXcnIG9wZXJhdG9yLCB0aGlzIG9iamVjdCBjb25zdHJ1Y3RvciBjYW5ub3QgYmUgY2FsbGVkIGFzIGEgZnVuY3Rpb24uXCIpO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlO1xuICAgIC8qKlxuICAgICAgUHJvbWlzZSBvYmplY3RzIHJlcHJlc2VudCB0aGUgZXZlbnR1YWwgcmVzdWx0IG9mIGFuIGFzeW5jaHJvbm91cyBvcGVyYXRpb24uIFRoZVxuICAgICAgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCwgd2hpY2hcbiAgICAgIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlIHJlYXNvblxuICAgICAgd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIFRlcm1pbm9sb2d5XG4gICAgICAtLS0tLS0tLS0tLVxuXG4gICAgICAtIGBwcm9taXNlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gd2l0aCBhIGB0aGVuYCBtZXRob2Qgd2hvc2UgYmVoYXZpb3IgY29uZm9ybXMgdG8gdGhpcyBzcGVjaWZpY2F0aW9uLlxuICAgICAgLSBgdGhlbmFibGVgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgYSBgdGhlbmAgbWV0aG9kLlxuICAgICAgLSBgdmFsdWVgIGlzIGFueSBsZWdhbCBKYXZhU2NyaXB0IHZhbHVlIChpbmNsdWRpbmcgdW5kZWZpbmVkLCBhIHRoZW5hYmxlLCBvciBhIHByb21pc2UpLlxuICAgICAgLSBgZXhjZXB0aW9uYCBpcyBhIHZhbHVlIHRoYXQgaXMgdGhyb3duIHVzaW5nIHRoZSB0aHJvdyBzdGF0ZW1lbnQuXG4gICAgICAtIGByZWFzb25gIGlzIGEgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2h5IGEgcHJvbWlzZSB3YXMgcmVqZWN0ZWQuXG4gICAgICAtIGBzZXR0bGVkYCB0aGUgZmluYWwgcmVzdGluZyBzdGF0ZSBvZiBhIHByb21pc2UsIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cblxuICAgICAgQSBwcm9taXNlIGNhbiBiZSBpbiBvbmUgb2YgdGhyZWUgc3RhdGVzOiBwZW5kaW5nLCBmdWxmaWxsZWQsIG9yIHJlamVjdGVkLlxuXG4gICAgICBQcm9taXNlcyB0aGF0IGFyZSBmdWxmaWxsZWQgaGF2ZSBhIGZ1bGZpbGxtZW50IHZhbHVlIGFuZCBhcmUgaW4gdGhlIGZ1bGZpbGxlZFxuICAgICAgc3RhdGUuICBQcm9taXNlcyB0aGF0IGFyZSByZWplY3RlZCBoYXZlIGEgcmVqZWN0aW9uIHJlYXNvbiBhbmQgYXJlIGluIHRoZVxuICAgICAgcmVqZWN0ZWQgc3RhdGUuICBBIGZ1bGZpbGxtZW50IHZhbHVlIGlzIG5ldmVyIGEgdGhlbmFibGUuXG5cbiAgICAgIFByb21pc2VzIGNhbiBhbHNvIGJlIHNhaWQgdG8gKnJlc29sdmUqIGEgdmFsdWUuICBJZiB0aGlzIHZhbHVlIGlzIGFsc28gYVxuICAgICAgcHJvbWlzZSwgdGhlbiB0aGUgb3JpZ2luYWwgcHJvbWlzZSdzIHNldHRsZWQgc3RhdGUgd2lsbCBtYXRjaCB0aGUgdmFsdWUnc1xuICAgICAgc2V0dGxlZCBzdGF0ZS4gIFNvIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aWxsXG4gICAgICBpdHNlbGYgcmVqZWN0LCBhbmQgYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCBmdWxmaWxscyB3aWxsXG4gICAgICBpdHNlbGYgZnVsZmlsbC5cblxuXG4gICAgICBCYXNpYyBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBgYGBqc1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgLy8gb24gc3VjY2Vzc1xuICAgICAgICByZXNvbHZlKHZhbHVlKTtcblxuICAgICAgICAvLyBvbiBmYWlsdXJlXG4gICAgICAgIHJlamVjdChyZWFzb24pO1xuICAgICAgfSk7XG5cbiAgICAgIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAvLyBvbiBmdWxmaWxsbWVudFxuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIC8vIG9uIHJlamVjdGlvblxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgVXNhZ2U6XG4gICAgICAtLS0tLS0tLS0tLS0tLS1cblxuICAgICAgUHJvbWlzZXMgc2hpbmUgd2hlbiBhYnN0cmFjdGluZyBhd2F5IGFzeW5jaHJvbm91cyBpbnRlcmFjdGlvbnMgc3VjaCBhc1xuICAgICAgYFhNTEh0dHBSZXF1ZXN0YHMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmdW5jdGlvbiBnZXRKU09OKHVybCkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICAgICAgICB4aHIub3BlbignR0VUJywgdXJsKTtcbiAgICAgICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gaGFuZGxlcjtcbiAgICAgICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgICAgICAgIHhoci5zZW5kKCk7XG5cbiAgICAgICAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gdGhpcy5ET05FKSB7XG4gICAgICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLnJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdnZXRKU09OOiBgJyArIHVybCArICdgIGZhaWxlZCB3aXRoIHN0YXR1czogWycgKyB0aGlzLnN0YXR1cyArICddJykpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGdldEpTT04oJy9wb3N0cy5qc29uJykudGhlbihmdW5jdGlvbihqc29uKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBVbmxpa2UgY2FsbGJhY2tzLCBwcm9taXNlcyBhcmUgZ3JlYXQgY29tcG9zYWJsZSBwcmltaXRpdmVzLlxuXG4gICAgICBgYGBqc1xuICAgICAgUHJvbWlzZS5hbGwoW1xuICAgICAgICBnZXRKU09OKCcvcG9zdHMnKSxcbiAgICAgICAgZ2V0SlNPTignL2NvbW1lbnRzJylcbiAgICAgIF0pLnRoZW4oZnVuY3Rpb24odmFsdWVzKXtcbiAgICAgICAgdmFsdWVzWzBdIC8vID0+IHBvc3RzSlNPTlxuICAgICAgICB2YWx1ZXNbMV0gLy8gPT4gY29tbWVudHNKU09OXG5cbiAgICAgICAgcmV0dXJuIHZhbHVlcztcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBjbGFzcyBQcm9taXNlXG4gICAgICBAcGFyYW0ge2Z1bmN0aW9ufSByZXNvbHZlclxuICAgICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgICAgQGNvbnN0cnVjdG9yXG4gICAgKi9cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZShyZXNvbHZlcikge1xuICAgICAgdGhpc1tsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5leHRJZCgpO1xuICAgICAgdGhpcy5fcmVzdWx0ID0gdGhpcy5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9zdWJzY3JpYmVycyA9IFtdO1xuXG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCAhPT0gcmVzb2x2ZXIpIHtcbiAgICAgICAgdHlwZW9mIHJlc29sdmVyICE9PSAnZnVuY3Rpb24nICYmIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc1Jlc29sdmVyKCk7XG4gICAgICAgIHRoaXMgaW5zdGFuY2VvZiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZSA/IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGluaXRpYWxpemVQcm9taXNlKHRoaXMsIHJlc29sdmVyKSA6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLmFsbCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJGFsbCQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yYWNlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZXNvbHZlID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5yZWplY3QgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJGRlZmF1bHQ7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldFNjaGVkdWxlciA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRTY2hlZHVsZXI7XG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuX3NldEFzYXAgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2V0QXNhcDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fYXNhcCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwO1xuXG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UucHJvdG90eXBlID0ge1xuICAgICAgY29uc3RydWN0b3I6IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLFxuXG4gICAgLyoqXG4gICAgICBUaGUgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCxcbiAgICAgIHdoaWNoIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlXG4gICAgICByZWFzb24gd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcil7XG4gICAgICAgIC8vIHVzZXIgaXMgYXZhaWxhYmxlXG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyB1c2VyIGlzIHVuYXZhaWxhYmxlLCBhbmQgeW91IGFyZSBnaXZlbiB0aGUgcmVhc29uIHdoeVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQ2hhaW5pbmdcbiAgICAgIC0tLS0tLS0tXG5cbiAgICAgIFRoZSByZXR1cm4gdmFsdWUgb2YgYHRoZW5gIGlzIGl0c2VsZiBhIHByb21pc2UuICBUaGlzIHNlY29uZCwgJ2Rvd25zdHJlYW0nXG4gICAgICBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZmlyc3QgcHJvbWlzZSdzIGZ1bGZpbGxtZW50XG4gICAgICBvciByZWplY3Rpb24gaGFuZGxlciwgb3IgcmVqZWN0ZWQgaWYgdGhlIGhhbmRsZXIgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICByZXR1cm4gdXNlci5uYW1lO1xuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICByZXR1cm4gJ2RlZmF1bHQgbmFtZSc7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh1c2VyTmFtZSkge1xuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHVzZXJOYW1lYCB3aWxsIGJlIHRoZSB1c2VyJ3MgbmFtZSwgb3RoZXJ3aXNlIGl0XG4gICAgICAgIC8vIHdpbGwgYmUgYCdkZWZhdWx0IG5hbWUnYFxuICAgICAgfSk7XG5cbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jyk7XG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBpZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHJlYXNvbmAgd2lsbCBiZSAnRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknLlxuICAgICAgICAvLyBJZiBgZmluZFVzZXJgIHJlamVjdGVkLCBgcmVhc29uYCB3aWxsIGJlICdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jy5cbiAgICAgIH0pO1xuICAgICAgYGBgXG4gICAgICBJZiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIGRvZXMgbm90IHNwZWNpZnkgYSByZWplY3Rpb24gaGFuZGxlciwgcmVqZWN0aW9uIHJlYXNvbnMgd2lsbCBiZSBwcm9wYWdhdGVkIGZ1cnRoZXIgZG93bnN0cmVhbS5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICB0aHJvdyBuZXcgUGVkYWdvZ2ljYWxFeGNlcHRpb24oJ1Vwc3RyZWFtIGVycm9yJyk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIFRoZSBgUGVkZ2Fnb2NpYWxFeGNlcHRpb25gIGlzIHByb3BhZ2F0ZWQgYWxsIHRoZSB3YXkgZG93biB0byBoZXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBc3NpbWlsYXRpb25cbiAgICAgIC0tLS0tLS0tLS0tLVxuXG4gICAgICBTb21ldGltZXMgdGhlIHZhbHVlIHlvdSB3YW50IHRvIHByb3BhZ2F0ZSB0byBhIGRvd25zdHJlYW0gcHJvbWlzZSBjYW4gb25seSBiZVxuICAgICAgcmV0cmlldmVkIGFzeW5jaHJvbm91c2x5LiBUaGlzIGNhbiBiZSBhY2hpZXZlZCBieSByZXR1cm5pbmcgYSBwcm9taXNlIGluIHRoZVxuICAgICAgZnVsZmlsbG1lbnQgb3IgcmVqZWN0aW9uIGhhbmRsZXIuIFRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCB0aGVuIGJlIHBlbmRpbmdcbiAgICAgIHVudGlsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlzIHNldHRsZWQuIFRoaXMgaXMgY2FsbGVkICphc3NpbWlsYXRpb24qLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIFRoZSB1c2VyJ3MgY29tbWVudHMgYXJlIG5vdyBhdmFpbGFibGVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIElmIHRoZSBhc3NpbWxpYXRlZCBwcm9taXNlIHJlamVjdHMsIHRoZW4gdGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIGFsc28gcmVqZWN0LlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgZnVsZmlsbHMsIHdlJ2xsIGhhdmUgdGhlIHZhbHVlIGhlcmVcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCByZWplY3RzLCB3ZSdsbCBoYXZlIHRoZSByZWFzb24gaGVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgU2ltcGxlIEV4YW1wbGVcbiAgICAgIC0tLS0tLS0tLS0tLS0tXG5cbiAgICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgdmFyIHJlc3VsdDtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzdWx0ID0gZmluZFJlc3VsdCgpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kUmVzdWx0KGZ1bmN0aW9uKHJlc3VsdCwgZXJyKXtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZFJlc3VsdCgpLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQWR2YW5jZWQgRXhhbXBsZVxuICAgICAgLS0tLS0tLS0tLS0tLS1cblxuICAgICAgU3luY2hyb25vdXMgRXhhbXBsZVxuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICB2YXIgYXV0aG9yLCBib29rcztcblxuICAgICAgdHJ5IHtcbiAgICAgICAgYXV0aG9yID0gZmluZEF1dGhvcigpO1xuICAgICAgICBib29rcyAgPSBmaW5kQm9va3NCeUF1dGhvcihhdXRob3IpO1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9XG4gICAgICBgYGBcblxuICAgICAgRXJyYmFjayBFeGFtcGxlXG5cbiAgICAgIGBgYGpzXG5cbiAgICAgIGZ1bmN0aW9uIGZvdW5kQm9va3MoYm9va3MpIHtcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBmYWlsdXJlKHJlYXNvbikge1xuXG4gICAgICB9XG5cbiAgICAgIGZpbmRBdXRob3IoZnVuY3Rpb24oYXV0aG9yLCBlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIC8vIGZhaWx1cmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZmluZEJvb29rc0J5QXV0aG9yKGF1dGhvciwgZnVuY3Rpb24oYm9va3MsIGVycikge1xuICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBmb3VuZEJvb2tzKGJvb2tzKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgZmFpbHVyZShyZWFzb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBzdWNjZXNzXG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFByb21pc2UgRXhhbXBsZTtcblxuICAgICAgYGBgamF2YXNjcmlwdFxuICAgICAgZmluZEF1dGhvcigpLlxuICAgICAgICB0aGVuKGZpbmRCb29rc0J5QXV0aG9yKS5cbiAgICAgICAgdGhlbihmdW5jdGlvbihib29rcyl7XG4gICAgICAgICAgLy8gZm91bmQgYm9va3NcbiAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBAbWV0aG9kIHRoZW5cbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uRnVsZmlsbGVkXG4gICAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICB0aGVuOiBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCxcblxuICAgIC8qKlxuICAgICAgYGNhdGNoYCBpcyBzaW1wbHkgc3VnYXIgZm9yIGB0aGVuKHVuZGVmaW5lZCwgb25SZWplY3Rpb24pYCB3aGljaCBtYWtlcyBpdCB0aGUgc2FtZVxuICAgICAgYXMgdGhlIGNhdGNoIGJsb2NrIG9mIGEgdHJ5L2NhdGNoIHN0YXRlbWVudC5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGZpbmRBdXRob3IoKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZG4ndCBmaW5kIHRoYXQgYXV0aG9yJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIHN5bmNocm9ub3VzXG4gICAgICB0cnkge1xuICAgICAgICBmaW5kQXV0aG9yKCk7XG4gICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfVxuXG4gICAgICAvLyBhc3luYyB3aXRoIHByb21pc2VzXG4gICAgICBmaW5kQXV0aG9yKCkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBtZXRob2QgY2F0Y2hcbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0aW9uXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAgICovXG4gICAgICAnY2F0Y2gnOiBmdW5jdGlvbihvblJlamVjdGlvbikge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0aW9uKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yKENvbnN0cnVjdG9yLCBpbnB1dCkge1xuICAgICAgdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICAgICAgdGhpcy5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuXG4gICAgICBpZiAoIXRoaXMucHJvbWlzZVtsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRtYWtlUHJvbWlzZSh0aGlzLnByb21pc2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAobGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0FycmF5KGlucHV0KSkge1xuICAgICAgICB0aGlzLl9pbnB1dCAgICAgPSBpbnB1dDtcbiAgICAgICAgdGhpcy5sZW5ndGggICAgID0gaW5wdXQubGVuZ3RoO1xuICAgICAgICB0aGlzLl9yZW1haW5pbmcgPSBpbnB1dC5sZW5ndGg7XG5cbiAgICAgICAgdGhpcy5fcmVzdWx0ID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcblxuICAgICAgICBpZiAodGhpcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmxlbmd0aCA9IHRoaXMubGVuZ3RoIHx8IDA7XG4gICAgICAgICAgdGhpcy5fZW51bWVyYXRlKCk7XG4gICAgICAgICAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QodGhpcy5wcm9taXNlLCBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkdmFsaWRhdGlvbkVycm9yKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCR2YWxpZGF0aW9uRXJyb3IoKSB7XG4gICAgICByZXR1cm4gbmV3IEVycm9yKCdBcnJheSBNZXRob2RzIG11c3QgYmUgcHJvdmlkZWQgYW4gQXJyYXknKTtcbiAgICB9XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VudW1lcmF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGxlbmd0aCAgPSB0aGlzLmxlbmd0aDtcbiAgICAgIHZhciBpbnB1dCAgID0gdGhpcy5faW5wdXQ7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyB0aGlzLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORyAmJiBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdGhpcy5fZWFjaEVudHJ5KGlucHV0W2ldLCBpKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9lYWNoRW50cnkgPSBmdW5jdGlvbihlbnRyeSwgaSkge1xuICAgICAgdmFyIGMgPSB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yO1xuICAgICAgdmFyIHJlc29sdmUgPSBjLnJlc29sdmU7XG5cbiAgICAgIGlmIChyZXNvbHZlID09PSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0KSB7XG4gICAgICAgIHZhciB0aGVuID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZ2V0VGhlbihlbnRyeSk7XG5cbiAgICAgICAgaWYgKHRoZW4gPT09IGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0ICYmXG4gICAgICAgICAgICBlbnRyeS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgICB0aGlzLl9zZXR0bGVkQXQoZW50cnkuX3N0YXRlLCBpLCBlbnRyeS5fcmVzdWx0KTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdGhlbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuICAgICAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IGVudHJ5O1xuICAgICAgICB9IGVsc2UgaWYgKGMgPT09IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0KSB7XG4gICAgICAgICAgdmFyIHByb21pc2UgPSBuZXcgYyhsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKTtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIGVudHJ5LCB0aGVuKTtcbiAgICAgICAgICB0aGlzLl93aWxsU2V0dGxlQXQocHJvbWlzZSwgaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KG5ldyBjKGZ1bmN0aW9uKHJlc29sdmUpIHsgcmVzb2x2ZShlbnRyeSk7IH0pLCBpKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KHJlc29sdmUoZW50cnkpLCBpKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl9zZXR0bGVkQXQgPSBmdW5jdGlvbihzdGF0ZSwgaSwgdmFsdWUpIHtcbiAgICAgIHZhciBwcm9taXNlID0gdGhpcy5wcm9taXNlO1xuXG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHtcbiAgICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG5cbiAgICAgICAgaWYgKHN0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRSRUpFQ1RFRCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fcmVzdWx0W2ldID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fd2lsbFNldHRsZUF0ID0gZnVuY3Rpb24ocHJvbWlzZSwgaSkge1xuICAgICAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocHJvbWlzZSwgdW5kZWZpbmVkLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRlVMRklMTEVELCBpLCB2YWx1ZSk7XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgZW51bWVyYXRvci5fc2V0dGxlZEF0KGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVELCBpLCByZWFzb24pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJHBvbHlmaWxsKCkge1xuICAgICAgdmFyIGxvY2FsO1xuXG4gICAgICBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBsb2NhbCA9IGdsb2JhbDtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgbG9jYWwgPSBzZWxmO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBsb2NhbCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG4gICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3BvbHlmaWxsIGZhaWxlZCBiZWNhdXNlIGdsb2JhbCBvYmplY3QgaXMgdW5hdmFpbGFibGUgaW4gdGhpcyBlbnZpcm9ubWVudCcpO1xuICAgICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdmFyIFAgPSBsb2NhbC5Qcm9taXNlO1xuXG4gICAgICBpZiAoUCAmJiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoUC5yZXNvbHZlKCkpID09PSAnW29iamVjdCBQcm9taXNlXScgJiYgIVAuY2FzdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGxvY2FsLlByb21pc2UgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdDtcbiAgICB9XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkcG9seWZpbGw7XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZSA9IHtcbiAgICAgICdQcm9taXNlJzogbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQsXG4gICAgICAncG9seWZpbGwnOiBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHRcbiAgICB9O1xuXG4gICAgLyogZ2xvYmFsIGRlZmluZTp0cnVlIG1vZHVsZTp0cnVlIHdpbmRvdzogdHJ1ZSAqL1xuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZVsnYW1kJ10pIHtcbiAgICAgIGRlZmluZShmdW5jdGlvbigpIHsgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSR1bWQkJEVTNlByb21pc2U7IH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlWydleHBvcnRzJ10pIHtcbiAgICAgIG1vZHVsZVsnZXhwb3J0cyddID0gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGlzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhpc1snRVM2UHJvbWlzZSddID0gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTtcbiAgICB9XG5cbiAgICBsaWIkZXM2JHByb21pc2UkcG9seWZpbGwkJGRlZmF1bHQoKTtcbn0pLmNhbGwodGhpcyk7XG5cbiIsIi8qKlxuICogbG9kYXNoIChDdXN0b20gQnVpbGQpIDxodHRwczovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgalF1ZXJ5IEZvdW5kYXRpb24gYW5kIG90aGVyIGNvbnRyaWJ1dG9ycyA8aHR0cHM6Ly9qcXVlcnkub3JnLz5cbiAqIFJlbGVhc2VkIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS44LjMgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqL1xuXG4vKiogVXNlZCBhcyB0aGUgYFR5cGVFcnJvcmAgbWVzc2FnZSBmb3IgXCJGdW5jdGlvbnNcIiBtZXRob2RzLiAqL1xudmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcblxuLyoqIFVzZWQgYXMgcmVmZXJlbmNlcyBmb3IgdmFyaW91cyBgTnVtYmVyYCBjb25zdGFudHMuICovXG52YXIgTkFOID0gMCAvIDA7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBzeW1ib2xUYWcgPSAnW29iamVjdCBTeW1ib2xdJztcblxuLyoqIFVzZWQgdG8gbWF0Y2ggbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZS4gKi9cbnZhciByZVRyaW0gPSAvXlxccyt8XFxzKyQvZztcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGJhZCBzaWduZWQgaGV4YWRlY2ltYWwgc3RyaW5nIHZhbHVlcy4gKi9cbnZhciByZUlzQmFkSGV4ID0gL15bLStdMHhbMC05YS1mXSskL2k7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBiaW5hcnkgc3RyaW5nIHZhbHVlcy4gKi9cbnZhciByZUlzQmluYXJ5ID0gL14wYlswMV0rJC9pO1xuXG4vKiogVXNlZCB0byBkZXRlY3Qgb2N0YWwgc3RyaW5nIHZhbHVlcy4gKi9cbnZhciByZUlzT2N0YWwgPSAvXjBvWzAtN10rJC9pO1xuXG4vKiogQnVpbHQtaW4gbWV0aG9kIHJlZmVyZW5jZXMgd2l0aG91dCBhIGRlcGVuZGVuY3kgb24gYHJvb3RgLiAqL1xudmFyIGZyZWVQYXJzZUludCA9IHBhcnNlSW50O1xuXG4vKiogRGV0ZWN0IGZyZWUgdmFyaWFibGUgYGdsb2JhbGAgZnJvbSBOb2RlLmpzLiAqL1xudmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbCAmJiBnbG9iYWwuT2JqZWN0ID09PSBPYmplY3QgJiYgZ2xvYmFsO1xuXG4vKiogRGV0ZWN0IGZyZWUgdmFyaWFibGUgYHNlbGZgLiAqL1xudmFyIGZyZWVTZWxmID0gdHlwZW9mIHNlbGYgPT0gJ29iamVjdCcgJiYgc2VsZiAmJiBzZWxmLk9iamVjdCA9PT0gT2JqZWN0ICYmIHNlbGY7XG5cbi8qKiBVc2VkIGFzIGEgcmVmZXJlbmNlIHRvIHRoZSBnbG9iYWwgb2JqZWN0LiAqL1xudmFyIHJvb3QgPSBmcmVlR2xvYmFsIHx8IGZyZWVTZWxmIHx8IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZVxuICogW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmplY3RUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiBCdWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlTWF4ID0gTWF0aC5tYXgsXG4gICAgbmF0aXZlTWluID0gTWF0aC5taW47XG5cbi8qKlxuICogR2V0cyB0aGUgdGltZXN0YW1wIG9mIHRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRoYXQgaGF2ZSBlbGFwc2VkIHNpbmNlXG4gKiB0aGUgVW5peCBlcG9jaCAoMSBKYW51YXJ5IDE5NzAgMDA6MDA6MDAgVVRDKS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDIuNC4wXG4gKiBAY2F0ZWdvcnkgRGF0ZVxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyB0aGUgdGltZXN0YW1wLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmRlZmVyKGZ1bmN0aW9uKHN0YW1wKSB7XG4gKiAgIGNvbnNvbGUubG9nKF8ubm93KCkgLSBzdGFtcCk7XG4gKiB9LCBfLm5vdygpKTtcbiAqIC8vID0+IExvZ3MgdGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgaXQgdG9vayBmb3IgdGhlIGRlZmVycmVkIGludm9jYXRpb24uXG4gKi9cbnZhciBub3cgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHJvb3QuRGF0ZS5ub3coKTtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIGRlYm91bmNlZCBmdW5jdGlvbiB0aGF0IGRlbGF5cyBpbnZva2luZyBgZnVuY2AgdW50aWwgYWZ0ZXIgYHdhaXRgXG4gKiBtaWxsaXNlY29uZHMgaGF2ZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHRpbWUgdGhlIGRlYm91bmNlZCBmdW5jdGlvbiB3YXNcbiAqIGludm9rZWQuIFRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gY29tZXMgd2l0aCBhIGBjYW5jZWxgIG1ldGhvZCB0byBjYW5jZWxcbiAqIGRlbGF5ZWQgYGZ1bmNgIGludm9jYXRpb25zIGFuZCBhIGBmbHVzaGAgbWV0aG9kIHRvIGltbWVkaWF0ZWx5IGludm9rZSB0aGVtLlxuICogUHJvdmlkZSBgb3B0aW9uc2AgdG8gaW5kaWNhdGUgd2hldGhlciBgZnVuY2Agc2hvdWxkIGJlIGludm9rZWQgb24gdGhlXG4gKiBsZWFkaW5nIGFuZC9vciB0cmFpbGluZyBlZGdlIG9mIHRoZSBgd2FpdGAgdGltZW91dC4gVGhlIGBmdW5jYCBpcyBpbnZva2VkXG4gKiB3aXRoIHRoZSBsYXN0IGFyZ3VtZW50cyBwcm92aWRlZCB0byB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uLiBTdWJzZXF1ZW50XG4gKiBjYWxscyB0byB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIHJldHVybiB0aGUgcmVzdWx0IG9mIHRoZSBsYXN0IGBmdW5jYFxuICogaW52b2NhdGlvbi5cbiAqXG4gKiAqKk5vdGU6KiogSWYgYGxlYWRpbmdgIGFuZCBgdHJhaWxpbmdgIG9wdGlvbnMgYXJlIGB0cnVlYCwgYGZ1bmNgIGlzXG4gKiBpbnZva2VkIG9uIHRoZSB0cmFpbGluZyBlZGdlIG9mIHRoZSB0aW1lb3V0IG9ubHkgaWYgdGhlIGRlYm91bmNlZCBmdW5jdGlvblxuICogaXMgaW52b2tlZCBtb3JlIHRoYW4gb25jZSBkdXJpbmcgdGhlIGB3YWl0YCB0aW1lb3V0LlxuICpcbiAqIElmIGB3YWl0YCBpcyBgMGAgYW5kIGBsZWFkaW5nYCBpcyBgZmFsc2VgLCBgZnVuY2AgaW52b2NhdGlvbiBpcyBkZWZlcnJlZFxuICogdW50aWwgdG8gdGhlIG5leHQgdGljaywgc2ltaWxhciB0byBgc2V0VGltZW91dGAgd2l0aCBhIHRpbWVvdXQgb2YgYDBgLlxuICpcbiAqIFNlZSBbRGF2aWQgQ29yYmFjaG8ncyBhcnRpY2xlXShodHRwczovL2Nzcy10cmlja3MuY29tL2RlYm91bmNpbmctdGhyb3R0bGluZy1leHBsYWluZWQtZXhhbXBsZXMvKVxuICogZm9yIGRldGFpbHMgb3ZlciB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiBgXy5kZWJvdW5jZWAgYW5kIGBfLnRocm90dGxlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDAuMS4wXG4gKiBAY2F0ZWdvcnkgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGRlYm91bmNlLlxuICogQHBhcmFtIHtudW1iZXJ9IFt3YWl0PTBdIFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIGRlbGF5LlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zPXt9XSBUaGUgb3B0aW9ucyBvYmplY3QuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmxlYWRpbmc9ZmFsc2VdXG4gKiAgU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgbGVhZGluZyBlZGdlIG9mIHRoZSB0aW1lb3V0LlxuICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLm1heFdhaXRdXG4gKiAgVGhlIG1heGltdW0gdGltZSBgZnVuY2AgaXMgYWxsb3dlZCB0byBiZSBkZWxheWVkIGJlZm9yZSBpdCdzIGludm9rZWQuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnRyYWlsaW5nPXRydWVdXG4gKiAgU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgdHJhaWxpbmcgZWRnZSBvZiB0aGUgdGltZW91dC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGRlYm91bmNlZCBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogLy8gQXZvaWQgY29zdGx5IGNhbGN1bGF0aW9ucyB3aGlsZSB0aGUgd2luZG93IHNpemUgaXMgaW4gZmx1eC5cbiAqIGpRdWVyeSh3aW5kb3cpLm9uKCdyZXNpemUnLCBfLmRlYm91bmNlKGNhbGN1bGF0ZUxheW91dCwgMTUwKSk7XG4gKlxuICogLy8gSW52b2tlIGBzZW5kTWFpbGAgd2hlbiBjbGlja2VkLCBkZWJvdW5jaW5nIHN1YnNlcXVlbnQgY2FsbHMuXG4gKiBqUXVlcnkoZWxlbWVudCkub24oJ2NsaWNrJywgXy5kZWJvdW5jZShzZW5kTWFpbCwgMzAwLCB7XG4gKiAgICdsZWFkaW5nJzogdHJ1ZSxcbiAqICAgJ3RyYWlsaW5nJzogZmFsc2VcbiAqIH0pKTtcbiAqXG4gKiAvLyBFbnN1cmUgYGJhdGNoTG9nYCBpcyBpbnZva2VkIG9uY2UgYWZ0ZXIgMSBzZWNvbmQgb2YgZGVib3VuY2VkIGNhbGxzLlxuICogdmFyIGRlYm91bmNlZCA9IF8uZGVib3VuY2UoYmF0Y2hMb2csIDI1MCwgeyAnbWF4V2FpdCc6IDEwMDAgfSk7XG4gKiB2YXIgc291cmNlID0gbmV3IEV2ZW50U291cmNlKCcvc3RyZWFtJyk7XG4gKiBqUXVlcnkoc291cmNlKS5vbignbWVzc2FnZScsIGRlYm91bmNlZCk7XG4gKlxuICogLy8gQ2FuY2VsIHRoZSB0cmFpbGluZyBkZWJvdW5jZWQgaW52b2NhdGlvbi5cbiAqIGpRdWVyeSh3aW5kb3cpLm9uKCdwb3BzdGF0ZScsIGRlYm91bmNlZC5jYW5jZWwpO1xuICovXG5mdW5jdGlvbiBkZWJvdW5jZShmdW5jLCB3YWl0LCBvcHRpb25zKSB7XG4gIHZhciBsYXN0QXJncyxcbiAgICAgIGxhc3RUaGlzLFxuICAgICAgbWF4V2FpdCxcbiAgICAgIHJlc3VsdCxcbiAgICAgIHRpbWVySWQsXG4gICAgICBsYXN0Q2FsbFRpbWUsXG4gICAgICBsYXN0SW52b2tlVGltZSA9IDAsXG4gICAgICBsZWFkaW5nID0gZmFsc2UsXG4gICAgICBtYXhpbmcgPSBmYWxzZSxcbiAgICAgIHRyYWlsaW5nID0gdHJ1ZTtcblxuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRlVOQ19FUlJPUl9URVhUKTtcbiAgfVxuICB3YWl0ID0gdG9OdW1iZXIod2FpdCkgfHwgMDtcbiAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgbGVhZGluZyA9ICEhb3B0aW9ucy5sZWFkaW5nO1xuICAgIG1heGluZyA9ICdtYXhXYWl0JyBpbiBvcHRpb25zO1xuICAgIG1heFdhaXQgPSBtYXhpbmcgPyBuYXRpdmVNYXgodG9OdW1iZXIob3B0aW9ucy5tYXhXYWl0KSB8fCAwLCB3YWl0KSA6IG1heFdhaXQ7XG4gICAgdHJhaWxpbmcgPSAndHJhaWxpbmcnIGluIG9wdGlvbnMgPyAhIW9wdGlvbnMudHJhaWxpbmcgOiB0cmFpbGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGludm9rZUZ1bmModGltZSkge1xuICAgIHZhciBhcmdzID0gbGFzdEFyZ3MsXG4gICAgICAgIHRoaXNBcmcgPSBsYXN0VGhpcztcblxuICAgIGxhc3RBcmdzID0gbGFzdFRoaXMgPSB1bmRlZmluZWQ7XG4gICAgbGFzdEludm9rZVRpbWUgPSB0aW1lO1xuICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGxlYWRpbmdFZGdlKHRpbWUpIHtcbiAgICAvLyBSZXNldCBhbnkgYG1heFdhaXRgIHRpbWVyLlxuICAgIGxhc3RJbnZva2VUaW1lID0gdGltZTtcbiAgICAvLyBTdGFydCB0aGUgdGltZXIgZm9yIHRoZSB0cmFpbGluZyBlZGdlLlxuICAgIHRpbWVySWQgPSBzZXRUaW1lb3V0KHRpbWVyRXhwaXJlZCwgd2FpdCk7XG4gICAgLy8gSW52b2tlIHRoZSBsZWFkaW5nIGVkZ2UuXG4gICAgcmV0dXJuIGxlYWRpbmcgPyBpbnZva2VGdW5jKHRpbWUpIDogcmVzdWx0O1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtYWluaW5nV2FpdCh0aW1lKSB7XG4gICAgdmFyIHRpbWVTaW5jZUxhc3RDYWxsID0gdGltZSAtIGxhc3RDYWxsVGltZSxcbiAgICAgICAgdGltZVNpbmNlTGFzdEludm9rZSA9IHRpbWUgLSBsYXN0SW52b2tlVGltZSxcbiAgICAgICAgcmVzdWx0ID0gd2FpdCAtIHRpbWVTaW5jZUxhc3RDYWxsO1xuXG4gICAgcmV0dXJuIG1heGluZyA/IG5hdGl2ZU1pbihyZXN1bHQsIG1heFdhaXQgLSB0aW1lU2luY2VMYXN0SW52b2tlKSA6IHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNob3VsZEludm9rZSh0aW1lKSB7XG4gICAgdmFyIHRpbWVTaW5jZUxhc3RDYWxsID0gdGltZSAtIGxhc3RDYWxsVGltZSxcbiAgICAgICAgdGltZVNpbmNlTGFzdEludm9rZSA9IHRpbWUgLSBsYXN0SW52b2tlVGltZTtcblxuICAgIC8vIEVpdGhlciB0aGlzIGlzIHRoZSBmaXJzdCBjYWxsLCBhY3Rpdml0eSBoYXMgc3RvcHBlZCBhbmQgd2UncmUgYXQgdGhlXG4gICAgLy8gdHJhaWxpbmcgZWRnZSwgdGhlIHN5c3RlbSB0aW1lIGhhcyBnb25lIGJhY2t3YXJkcyBhbmQgd2UncmUgdHJlYXRpbmdcbiAgICAvLyBpdCBhcyB0aGUgdHJhaWxpbmcgZWRnZSwgb3Igd2UndmUgaGl0IHRoZSBgbWF4V2FpdGAgbGltaXQuXG4gICAgcmV0dXJuIChsYXN0Q2FsbFRpbWUgPT09IHVuZGVmaW5lZCB8fCAodGltZVNpbmNlTGFzdENhbGwgPj0gd2FpdCkgfHxcbiAgICAgICh0aW1lU2luY2VMYXN0Q2FsbCA8IDApIHx8IChtYXhpbmcgJiYgdGltZVNpbmNlTGFzdEludm9rZSA+PSBtYXhXYWl0KSk7XG4gIH1cblxuICBmdW5jdGlvbiB0aW1lckV4cGlyZWQoKSB7XG4gICAgdmFyIHRpbWUgPSBub3coKTtcbiAgICBpZiAoc2hvdWxkSW52b2tlKHRpbWUpKSB7XG4gICAgICByZXR1cm4gdHJhaWxpbmdFZGdlKHRpbWUpO1xuICAgIH1cbiAgICAvLyBSZXN0YXJ0IHRoZSB0aW1lci5cbiAgICB0aW1lcklkID0gc2V0VGltZW91dCh0aW1lckV4cGlyZWQsIHJlbWFpbmluZ1dhaXQodGltZSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJhaWxpbmdFZGdlKHRpbWUpIHtcbiAgICB0aW1lcklkID0gdW5kZWZpbmVkO1xuXG4gICAgLy8gT25seSBpbnZva2UgaWYgd2UgaGF2ZSBgbGFzdEFyZ3NgIHdoaWNoIG1lYW5zIGBmdW5jYCBoYXMgYmVlblxuICAgIC8vIGRlYm91bmNlZCBhdCBsZWFzdCBvbmNlLlxuICAgIGlmICh0cmFpbGluZyAmJiBsYXN0QXJncykge1xuICAgICAgcmV0dXJuIGludm9rZUZ1bmModGltZSk7XG4gICAgfVxuICAgIGxhc3RBcmdzID0gbGFzdFRoaXMgPSB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbmNlbCgpIHtcbiAgICBpZiAodGltZXJJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjbGVhclRpbWVvdXQodGltZXJJZCk7XG4gICAgfVxuICAgIGxhc3RJbnZva2VUaW1lID0gMDtcbiAgICBsYXN0QXJncyA9IGxhc3RDYWxsVGltZSA9IGxhc3RUaGlzID0gdGltZXJJZCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGZsdXNoKCkge1xuICAgIHJldHVybiB0aW1lcklkID09PSB1bmRlZmluZWQgPyByZXN1bHQgOiB0cmFpbGluZ0VkZ2Uobm93KCkpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVib3VuY2VkKCkge1xuICAgIHZhciB0aW1lID0gbm93KCksXG4gICAgICAgIGlzSW52b2tpbmcgPSBzaG91bGRJbnZva2UodGltZSk7XG5cbiAgICBsYXN0QXJncyA9IGFyZ3VtZW50cztcbiAgICBsYXN0VGhpcyA9IHRoaXM7XG4gICAgbGFzdENhbGxUaW1lID0gdGltZTtcblxuICAgIGlmIChpc0ludm9raW5nKSB7XG4gICAgICBpZiAodGltZXJJZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBsZWFkaW5nRWRnZShsYXN0Q2FsbFRpbWUpO1xuICAgICAgfVxuICAgICAgaWYgKG1heGluZykge1xuICAgICAgICAvLyBIYW5kbGUgaW52b2NhdGlvbnMgaW4gYSB0aWdodCBsb29wLlxuICAgICAgICB0aW1lcklkID0gc2V0VGltZW91dCh0aW1lckV4cGlyZWQsIHdhaXQpO1xuICAgICAgICByZXR1cm4gaW52b2tlRnVuYyhsYXN0Q2FsbFRpbWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGltZXJJZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aW1lcklkID0gc2V0VGltZW91dCh0aW1lckV4cGlyZWQsIHdhaXQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIGRlYm91bmNlZC5jYW5jZWwgPSBjYW5jZWw7XG4gIGRlYm91bmNlZC5mbHVzaCA9IGZsdXNoO1xuICByZXR1cm4gZGVib3VuY2VkO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSB0aHJvdHRsZWQgZnVuY3Rpb24gdGhhdCBvbmx5IGludm9rZXMgYGZ1bmNgIGF0IG1vc3Qgb25jZSBwZXJcbiAqIGV2ZXJ5IGB3YWl0YCBtaWxsaXNlY29uZHMuIFRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gY29tZXMgd2l0aCBhIGBjYW5jZWxgXG4gKiBtZXRob2QgdG8gY2FuY2VsIGRlbGF5ZWQgYGZ1bmNgIGludm9jYXRpb25zIGFuZCBhIGBmbHVzaGAgbWV0aG9kIHRvXG4gKiBpbW1lZGlhdGVseSBpbnZva2UgdGhlbS4gUHJvdmlkZSBgb3B0aW9uc2AgdG8gaW5kaWNhdGUgd2hldGhlciBgZnVuY2BcbiAqIHNob3VsZCBiZSBpbnZva2VkIG9uIHRoZSBsZWFkaW5nIGFuZC9vciB0cmFpbGluZyBlZGdlIG9mIHRoZSBgd2FpdGBcbiAqIHRpbWVvdXQuIFRoZSBgZnVuY2AgaXMgaW52b2tlZCB3aXRoIHRoZSBsYXN0IGFyZ3VtZW50cyBwcm92aWRlZCB0byB0aGVcbiAqIHRocm90dGxlZCBmdW5jdGlvbi4gU3Vic2VxdWVudCBjYWxscyB0byB0aGUgdGhyb3R0bGVkIGZ1bmN0aW9uIHJldHVybiB0aGVcbiAqIHJlc3VsdCBvZiB0aGUgbGFzdCBgZnVuY2AgaW52b2NhdGlvbi5cbiAqXG4gKiAqKk5vdGU6KiogSWYgYGxlYWRpbmdgIGFuZCBgdHJhaWxpbmdgIG9wdGlvbnMgYXJlIGB0cnVlYCwgYGZ1bmNgIGlzXG4gKiBpbnZva2VkIG9uIHRoZSB0cmFpbGluZyBlZGdlIG9mIHRoZSB0aW1lb3V0IG9ubHkgaWYgdGhlIHRocm90dGxlZCBmdW5jdGlvblxuICogaXMgaW52b2tlZCBtb3JlIHRoYW4gb25jZSBkdXJpbmcgdGhlIGB3YWl0YCB0aW1lb3V0LlxuICpcbiAqIElmIGB3YWl0YCBpcyBgMGAgYW5kIGBsZWFkaW5nYCBpcyBgZmFsc2VgLCBgZnVuY2AgaW52b2NhdGlvbiBpcyBkZWZlcnJlZFxuICogdW50aWwgdG8gdGhlIG5leHQgdGljaywgc2ltaWxhciB0byBgc2V0VGltZW91dGAgd2l0aCBhIHRpbWVvdXQgb2YgYDBgLlxuICpcbiAqIFNlZSBbRGF2aWQgQ29yYmFjaG8ncyBhcnRpY2xlXShodHRwczovL2Nzcy10cmlja3MuY29tL2RlYm91bmNpbmctdGhyb3R0bGluZy1leHBsYWluZWQtZXhhbXBsZXMvKVxuICogZm9yIGRldGFpbHMgb3ZlciB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiBgXy50aHJvdHRsZWAgYW5kIGBfLmRlYm91bmNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDAuMS4wXG4gKiBAY2F0ZWdvcnkgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHRocm90dGxlLlxuICogQHBhcmFtIHtudW1iZXJ9IFt3YWl0PTBdIFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHRocm90dGxlIGludm9jYXRpb25zIHRvLlxuICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zPXt9XSBUaGUgb3B0aW9ucyBvYmplY3QuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLmxlYWRpbmc9dHJ1ZV1cbiAqICBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSBsZWFkaW5nIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnRyYWlsaW5nPXRydWVdXG4gKiAgU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgdHJhaWxpbmcgZWRnZSBvZiB0aGUgdGltZW91dC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IHRocm90dGxlZCBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogLy8gQXZvaWQgZXhjZXNzaXZlbHkgdXBkYXRpbmcgdGhlIHBvc2l0aW9uIHdoaWxlIHNjcm9sbGluZy5cbiAqIGpRdWVyeSh3aW5kb3cpLm9uKCdzY3JvbGwnLCBfLnRocm90dGxlKHVwZGF0ZVBvc2l0aW9uLCAxMDApKTtcbiAqXG4gKiAvLyBJbnZva2UgYHJlbmV3VG9rZW5gIHdoZW4gdGhlIGNsaWNrIGV2ZW50IGlzIGZpcmVkLCBidXQgbm90IG1vcmUgdGhhbiBvbmNlIGV2ZXJ5IDUgbWludXRlcy5cbiAqIHZhciB0aHJvdHRsZWQgPSBfLnRocm90dGxlKHJlbmV3VG9rZW4sIDMwMDAwMCwgeyAndHJhaWxpbmcnOiBmYWxzZSB9KTtcbiAqIGpRdWVyeShlbGVtZW50KS5vbignY2xpY2snLCB0aHJvdHRsZWQpO1xuICpcbiAqIC8vIENhbmNlbCB0aGUgdHJhaWxpbmcgdGhyb3R0bGVkIGludm9jYXRpb24uXG4gKiBqUXVlcnkod2luZG93KS5vbigncG9wc3RhdGUnLCB0aHJvdHRsZWQuY2FuY2VsKTtcbiAqL1xuZnVuY3Rpb24gdGhyb3R0bGUoZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICB2YXIgbGVhZGluZyA9IHRydWUsXG4gICAgICB0cmFpbGluZyA9IHRydWU7XG5cbiAgaWYgKHR5cGVvZiBmdW5jICE9ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKEZVTkNfRVJST1JfVEVYVCk7XG4gIH1cbiAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgbGVhZGluZyA9ICdsZWFkaW5nJyBpbiBvcHRpb25zID8gISFvcHRpb25zLmxlYWRpbmcgOiBsZWFkaW5nO1xuICAgIHRyYWlsaW5nID0gJ3RyYWlsaW5nJyBpbiBvcHRpb25zID8gISFvcHRpb25zLnRyYWlsaW5nIDogdHJhaWxpbmc7XG4gIH1cbiAgcmV0dXJuIGRlYm91bmNlKGZ1bmMsIHdhaXQsIHtcbiAgICAnbGVhZGluZyc6IGxlYWRpbmcsXG4gICAgJ21heFdhaXQnOiB3YWl0LFxuICAgICd0cmFpbGluZyc6IHRyYWlsaW5nXG4gIH0pO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZVxuICogW2xhbmd1YWdlIHR5cGVdKGh0dHA6Ly93d3cuZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi83LjAvI3NlYy1lY21hc2NyaXB0LWxhbmd1YWdlLXR5cGVzKVxuICogb2YgYE9iamVjdGAuIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMC4xLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFuIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0KHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChfLm5vb3ApO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QobnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgcmV0dXJuICEhdmFsdWUgJiYgKHR5cGUgPT0gJ29iamVjdCcgfHwgdHlwZSA9PSAnZnVuY3Rpb24nKTtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZS4gQSB2YWx1ZSBpcyBvYmplY3QtbGlrZSBpZiBpdCdzIG5vdCBgbnVsbGBcbiAqIGFuZCBoYXMgYSBgdHlwZW9mYCByZXN1bHQgb2YgXCJvYmplY3RcIi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBvYmplY3QtbGlrZSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZSh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdExpa2UoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShfLm5vb3ApO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gISF2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBTeW1ib2xgIHByaW1pdGl2ZSBvciBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSA0LjAuMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBzeW1ib2wsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1N5bWJvbChTeW1ib2wuaXRlcmF0b3IpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNTeW1ib2woJ2FiYycpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNTeW1ib2wodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnc3ltYm9sJyB8fFxuICAgIChpc09iamVjdExpa2UodmFsdWUpICYmIG9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpID09IHN5bWJvbFRhZyk7XG59XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhIG51bWJlci5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgdGhlIG51bWJlci5cbiAqIEBleGFtcGxlXG4gKlxuICogXy50b051bWJlcigzLjIpO1xuICogLy8gPT4gMy4yXG4gKlxuICogXy50b051bWJlcihOdW1iZXIuTUlOX1ZBTFVFKTtcbiAqIC8vID0+IDVlLTMyNFxuICpcbiAqIF8udG9OdW1iZXIoSW5maW5pdHkpO1xuICogLy8gPT4gSW5maW5pdHlcbiAqXG4gKiBfLnRvTnVtYmVyKCczLjInKTtcbiAqIC8vID0+IDMuMlxuICovXG5mdW5jdGlvbiB0b051bWJlcih2YWx1ZSkge1xuICBpZiAodHlwZW9mIHZhbHVlID09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmIChpc1N5bWJvbCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gTkFOO1xuICB9XG4gIGlmIChpc09iamVjdCh2YWx1ZSkpIHtcbiAgICB2YXIgb3RoZXIgPSB0eXBlb2YgdmFsdWUudmFsdWVPZiA9PSAnZnVuY3Rpb24nID8gdmFsdWUudmFsdWVPZigpIDogdmFsdWU7XG4gICAgdmFsdWUgPSBpc09iamVjdChvdGhlcikgPyAob3RoZXIgKyAnJykgOiBvdGhlcjtcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlICE9ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlID09PSAwID8gdmFsdWUgOiArdmFsdWU7XG4gIH1cbiAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKHJlVHJpbSwgJycpO1xuICB2YXIgaXNCaW5hcnkgPSByZUlzQmluYXJ5LnRlc3QodmFsdWUpO1xuICByZXR1cm4gKGlzQmluYXJ5IHx8IHJlSXNPY3RhbC50ZXN0KHZhbHVlKSlcbiAgICA/IGZyZWVQYXJzZUludCh2YWx1ZS5zbGljZSgyKSwgaXNCaW5hcnkgPyAyIDogOClcbiAgICA6IChyZUlzQmFkSGV4LnRlc3QodmFsdWUpID8gTkFOIDogK3ZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0aHJvdHRsZTtcbiIsIi8qKlxuKiBDcmVhdGUgYW4gZXZlbnQgZW1pdHRlciB3aXRoIG5hbWVzcGFjZXNcbiogQG5hbWUgY3JlYXRlTmFtZXNwYWNlRW1pdHRlclxuKiBAZXhhbXBsZVxuKiB2YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vaW5kZXgnKSgpXG4qXG4qIGVtaXR0ZXIub24oJyonLCBmdW5jdGlvbiAoKSB7XG4qICAgY29uc29sZS5sb2coJ2FsbCBldmVudHMgZW1pdHRlZCcsIHRoaXMuZXZlbnQpXG4qIH0pXG4qXG4qIGVtaXR0ZXIub24oJ2V4YW1wbGUnLCBmdW5jdGlvbiAoKSB7XG4qICAgY29uc29sZS5sb2coJ2V4YW1wbGUgZXZlbnQgZW1pdHRlZCcpXG4qIH0pXG4qL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBjcmVhdGVOYW1lc3BhY2VFbWl0dGVyICgpIHtcbiAgdmFyIGVtaXR0ZXIgPSB7IF9mbnM6IHt9IH1cblxuICAvKipcbiAgKiBFbWl0IGFuIGV2ZW50LiBPcHRpb25hbGx5IG5hbWVzcGFjZSB0aGUgZXZlbnQuIFNlcGFyYXRlIHRoZSBuYW1lc3BhY2UgYW5kIGV2ZW50IHdpdGggYSBgOmBcbiAgKiBAbmFtZSBlbWl0XG4gICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IOKAkyB0aGUgbmFtZSBvZiB0aGUgZXZlbnQsIHdpdGggb3B0aW9uYWwgbmFtZXNwYWNlXG4gICogQHBhcmFtIHsuLi4qfSBkYXRhIOKAkyBkYXRhIHZhcmlhYmxlcyB0aGF0IHdpbGwgYmUgcGFzc2VkIGFzIGFyZ3VtZW50cyB0byB0aGUgZXZlbnQgbGlzdGVuZXJcbiAgKiBAZXhhbXBsZVxuICAqIGVtaXR0ZXIuZW1pdCgnZXhhbXBsZScpXG4gICogZW1pdHRlci5lbWl0KCdkZW1vOnRlc3QnKVxuICAqIGVtaXR0ZXIuZW1pdCgnZGF0YScsIHsgZXhhbXBsZTogdHJ1ZX0sICdhIHN0cmluZycsIDEpXG4gICovXG4gIGVtaXR0ZXIuZW1pdCA9IGZ1bmN0aW9uIGVtaXQgKGV2ZW50KSB7XG4gICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSlcbiAgICB2YXIgbmFtZXNwYWNlZCA9IG5hbWVzcGFjZXMoZXZlbnQpXG4gICAgaWYgKHRoaXMuX2Zuc1tldmVudF0pIGVtaXRBbGwoZXZlbnQsIHRoaXMuX2Zuc1tldmVudF0sIGFyZ3MpXG4gICAgaWYgKG5hbWVzcGFjZWQpIGVtaXRBbGwoZXZlbnQsIG5hbWVzcGFjZWQsIGFyZ3MpXG4gIH1cblxuICAvKipcbiAgKiBDcmVhdGUgZW4gZXZlbnQgbGlzdGVuZXIuXG4gICogQG5hbWUgb25cbiAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICAqIEBleGFtcGxlXG4gICogZW1pdHRlci5vbignZXhhbXBsZScsIGZ1bmN0aW9uICgpIHt9KVxuICAqIGVtaXR0ZXIub24oJ2RlbW8nLCBmdW5jdGlvbiAoKSB7fSlcbiAgKi9cbiAgZW1pdHRlci5vbiA9IGZ1bmN0aW9uIG9uIChldmVudCwgZm4pIHtcbiAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7IHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgcmVxdWlyZWQnKSB9XG4gICAgKHRoaXMuX2Zuc1tldmVudF0gPSB0aGlzLl9mbnNbZXZlbnRdIHx8IFtdKS5wdXNoKGZuKVxuICB9XG5cbiAgLyoqXG4gICogQ3JlYXRlIGVuIGV2ZW50IGxpc3RlbmVyIHRoYXQgZmlyZXMgb25jZS5cbiAgKiBAbmFtZSBvbmNlXG4gICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAgKiBAZXhhbXBsZVxuICAqIGVtaXR0ZXIub25jZSgnZXhhbXBsZScsIGZ1bmN0aW9uICgpIHt9KVxuICAqIGVtaXR0ZXIub25jZSgnZGVtbycsIGZ1bmN0aW9uICgpIHt9KVxuICAqL1xuICBlbWl0dGVyLm9uY2UgPSBmdW5jdGlvbiBvbmNlIChldmVudCwgZm4pIHtcbiAgICBmdW5jdGlvbiBvbmUgKCkge1xuICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgICAgZW1pdHRlci5vZmYoZXZlbnQsIG9uZSlcbiAgICB9XG4gICAgdGhpcy5vbihldmVudCwgb25lKVxuICB9XG5cbiAgLyoqXG4gICogU3RvcCBsaXN0ZW5pbmcgdG8gYW4gZXZlbnQuIFN0b3AgYWxsIGxpc3RlbmVycyBvbiBhbiBldmVudCBieSBvbmx5IHBhc3NpbmcgdGhlIGV2ZW50IG5hbWUuIFN0b3AgYSBzaW5nbGUgbGlzdGVuZXIgYnkgcGFzc2luZyB0aGF0IGV2ZW50IGhhbmRsZXIgYXMgYSBjYWxsYmFjay5cbiAgKiBZb3UgbXVzdCBiZSBleHBsaWNpdCBhYm91dCB3aGF0IHdpbGwgYmUgdW5zdWJzY3JpYmVkOiBgZW1pdHRlci5vZmYoJ2RlbW8nKWAgd2lsbCB1bnN1YnNjcmliZSBhbiBgZW1pdHRlci5vbignZGVtbycpYCBsaXN0ZW5lciwgXG4gICogYGVtaXR0ZXIub2ZmKCdkZW1vOmV4YW1wbGUnKWAgd2lsbCB1bnN1YnNjcmliZSBhbiBgZW1pdHRlci5vbignZGVtbzpleGFtcGxlJylgIGxpc3RlbmVyXG4gICogQG5hbWUgb2ZmXG4gICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gICogQHBhcmFtIHtGdW5jdGlvbn0gW2ZuXSDigJMgdGhlIHNwZWNpZmljIGhhbmRsZXJcbiAgKiBAZXhhbXBsZVxuICAqIGVtaXR0ZXIub2ZmKCdleGFtcGxlJylcbiAgKiBlbWl0dGVyLm9mZignZGVtbycsIGZ1bmN0aW9uICgpIHt9KVxuICAqL1xuICBlbWl0dGVyLm9mZiA9IGZ1bmN0aW9uIG9mZiAoZXZlbnQsIGZuKSB7XG4gICAgdmFyIGtlZXAgPSBbXVxuXG4gICAgaWYgKGV2ZW50ICYmIGZuKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuX2Zucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodGhpcy5fZm5zW2ldICE9PSBmbikge1xuICAgICAgICAgIGtlZXAucHVzaCh0aGlzLl9mbnNbaV0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBrZWVwLmxlbmd0aCA/IHRoaXMuX2Zuc1tldmVudF0gPSBrZWVwIDogZGVsZXRlIHRoaXMuX2Zuc1tldmVudF1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5hbWVzcGFjZXMgKGUpIHtcbiAgICB2YXIgb3V0ID0gW11cbiAgICB2YXIgYXJncyA9IGUuc3BsaXQoJzonKVxuICAgIHZhciBmbnMgPSBlbWl0dGVyLl9mbnNcbiAgICBPYmplY3Qua2V5cyhmbnMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgaWYgKGtleSA9PT0gJyonKSBvdXQgPSBvdXQuY29uY2F0KGZuc1trZXldKVxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAyICYmIGFyZ3NbMF0gPT09IGtleSkgb3V0ID0gb3V0LmNvbmNhdChmbnNba2V5XSlcbiAgICB9KVxuICAgIHJldHVybiBvdXRcbiAgfVxuXG4gIGZ1bmN0aW9uIGVtaXRBbGwgKGUsIGZucywgYXJncykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIWZuc1tpXSkgYnJlYWtcbiAgICAgIGZuc1tpXS5ldmVudCA9IGVcbiAgICAgIGZuc1tpXS5hcHBseShmbnNbaV0sIGFyZ3MpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGVtaXR0ZXJcbn1cbiIsIi8qIGdsb2JhbCBNdXRhdGlvbk9ic2VydmVyICovXG52YXIgZG9jdW1lbnQgPSByZXF1aXJlKCdnbG9iYWwvZG9jdW1lbnQnKVxudmFyIHdpbmRvdyA9IHJlcXVpcmUoJ2dsb2JhbC93aW5kb3cnKVxudmFyIHdhdGNoID0gT2JqZWN0LmNyZWF0ZShudWxsKVxudmFyIEtFWV9JRCA9ICdvbmxvYWRpZCcgKyAobmV3IERhdGUoKSAlIDllNikudG9TdHJpbmcoMzYpXG52YXIgS0VZX0FUVFIgPSAnZGF0YS0nICsgS0VZX0lEXG52YXIgSU5ERVggPSAwXG5cbmlmICh3aW5kb3cgJiYgd2luZG93Lk11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgdmFyIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24gKG11dGF0aW9ucykge1xuICAgIGlmIChPYmplY3Qua2V5cyh3YXRjaCkubGVuZ3RoIDwgMSkgcmV0dXJuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtdXRhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChtdXRhdGlvbnNbaV0uYXR0cmlidXRlTmFtZSA9PT0gS0VZX0FUVFIpIHtcbiAgICAgICAgZWFjaEF0dHIobXV0YXRpb25zW2ldLCB0dXJub24sIHR1cm5vZmYpXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBlYWNoTXV0YXRpb24obXV0YXRpb25zW2ldLnJlbW92ZWROb2RlcywgdHVybm9mZilcbiAgICAgIGVhY2hNdXRhdGlvbihtdXRhdGlvbnNbaV0uYWRkZWROb2RlcywgdHVybm9uKVxuICAgIH1cbiAgfSlcbiAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7XG4gICAgY2hpbGRMaXN0OiB0cnVlLFxuICAgIHN1YnRyZWU6IHRydWUsXG4gICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICBhdHRyaWJ1dGVPbGRWYWx1ZTogdHJ1ZSxcbiAgICBhdHRyaWJ1dGVGaWx0ZXI6IFtLRVlfQVRUUl1cbiAgfSlcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBvbmxvYWQgKGVsLCBvbiwgb2ZmLCBjYWxsZXIpIHtcbiAgb24gPSBvbiB8fCBmdW5jdGlvbiAoKSB7fVxuICBvZmYgPSBvZmYgfHwgZnVuY3Rpb24gKCkge31cbiAgZWwuc2V0QXR0cmlidXRlKEtFWV9BVFRSLCAnbycgKyBJTkRFWClcbiAgd2F0Y2hbJ28nICsgSU5ERVhdID0gW29uLCBvZmYsIDAsIGNhbGxlciB8fCBvbmxvYWQuY2FsbGVyXVxuICBJTkRFWCArPSAxXG4gIHJldHVybiBlbFxufVxuXG5mdW5jdGlvbiB0dXJub24gKGluZGV4LCBlbCkge1xuICBpZiAod2F0Y2hbaW5kZXhdWzBdICYmIHdhdGNoW2luZGV4XVsyXSA9PT0gMCkge1xuICAgIHdhdGNoW2luZGV4XVswXShlbClcbiAgICB3YXRjaFtpbmRleF1bMl0gPSAxXG4gIH1cbn1cblxuZnVuY3Rpb24gdHVybm9mZiAoaW5kZXgsIGVsKSB7XG4gIGlmICh3YXRjaFtpbmRleF1bMV0gJiYgd2F0Y2hbaW5kZXhdWzJdID09PSAxKSB7XG4gICAgd2F0Y2hbaW5kZXhdWzFdKGVsKVxuICAgIHdhdGNoW2luZGV4XVsyXSA9IDBcbiAgfVxufVxuXG5mdW5jdGlvbiBlYWNoQXR0ciAobXV0YXRpb24sIG9uLCBvZmYpIHtcbiAgdmFyIG5ld1ZhbHVlID0gbXV0YXRpb24udGFyZ2V0LmdldEF0dHJpYnV0ZShLRVlfQVRUUilcbiAgaWYgKHNhbWVPcmlnaW4obXV0YXRpb24ub2xkVmFsdWUsIG5ld1ZhbHVlKSkge1xuICAgIHdhdGNoW25ld1ZhbHVlXSA9IHdhdGNoW211dGF0aW9uLm9sZFZhbHVlXVxuICAgIHJldHVyblxuICB9XG4gIGlmICh3YXRjaFttdXRhdGlvbi5vbGRWYWx1ZV0pIHtcbiAgICBvZmYobXV0YXRpb24ub2xkVmFsdWUsIG11dGF0aW9uLnRhcmdldClcbiAgfVxuICBpZiAod2F0Y2hbbmV3VmFsdWVdKSB7XG4gICAgb24obmV3VmFsdWUsIG11dGF0aW9uLnRhcmdldClcbiAgfVxufVxuXG5mdW5jdGlvbiBzYW1lT3JpZ2luIChvbGRWYWx1ZSwgbmV3VmFsdWUpIHtcbiAgaWYgKCFvbGRWYWx1ZSB8fCAhbmV3VmFsdWUpIHJldHVybiBmYWxzZVxuICByZXR1cm4gd2F0Y2hbb2xkVmFsdWVdWzNdID09PSB3YXRjaFtuZXdWYWx1ZV1bM11cbn1cblxuZnVuY3Rpb24gZWFjaE11dGF0aW9uIChub2RlcywgZm4pIHtcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh3YXRjaClcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgIGlmIChub2Rlc1tpXSAmJiBub2Rlc1tpXS5nZXRBdHRyaWJ1dGUgJiYgbm9kZXNbaV0uZ2V0QXR0cmlidXRlKEtFWV9BVFRSKSkge1xuICAgICAgdmFyIG9ubG9hZGlkID0gbm9kZXNbaV0uZ2V0QXR0cmlidXRlKEtFWV9BVFRSKVxuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIChrKSB7XG4gICAgICAgIGlmIChvbmxvYWRpZCA9PT0gaykge1xuICAgICAgICAgIGZuKGssIG5vZGVzW2ldKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgICBpZiAobm9kZXNbaV0uY2hpbGROb2Rlcy5sZW5ndGggPiAwKSB7XG4gICAgICBlYWNoTXV0YXRpb24obm9kZXNbaV0uY2hpbGROb2RlcywgZm4pXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgdG9wTGV2ZWwgPSB0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbCA6XG4gICAgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB7fVxudmFyIG1pbkRvYyA9IHJlcXVpcmUoJ21pbi1kb2N1bWVudCcpO1xuXG52YXIgZG9jY3k7XG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZG9jY3kgPSBkb2N1bWVudDtcbn0gZWxzZSB7XG4gICAgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddO1xuXG4gICAgaWYgKCFkb2NjeSkge1xuICAgICAgICBkb2NjeSA9IHRvcExldmVsWydfX0dMT0JBTF9ET0NVTUVOVF9DQUNIRUA0J10gPSBtaW5Eb2M7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRvY2N5O1xuIiwidmFyIHdpbjtcblxuaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB3aW4gPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB3aW4gPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICB3aW4gPSBzZWxmO1xufSBlbHNlIHtcbiAgICB3aW4gPSB7fTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB3aW47XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHByZXR0aWVyQnl0ZXNcblxuZnVuY3Rpb24gcHJldHRpZXJCeXRlcyAobnVtKSB7XG4gIGlmICh0eXBlb2YgbnVtICE9PSAnbnVtYmVyJyB8fCBpc05hTihudW0pKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignRXhwZWN0ZWQgYSBudW1iZXIsIGdvdCAnICsgdHlwZW9mIG51bSlcbiAgfVxuXG4gIHZhciBuZWcgPSBudW0gPCAwXG4gIHZhciB1bml0cyA9IFsnQicsICdLQicsICdNQicsICdHQicsICdUQicsICdQQicsICdFQicsICdaQicsICdZQiddXG5cbiAgaWYgKG5lZykge1xuICAgIG51bSA9IC1udW1cbiAgfVxuXG4gIGlmIChudW0gPCAxKSB7XG4gICAgcmV0dXJuIChuZWcgPyAnLScgOiAnJykgKyBudW0gKyAnIEInXG4gIH1cblxuICB2YXIgZXhwb25lbnQgPSBNYXRoLm1pbihNYXRoLmZsb29yKE1hdGgubG9nKG51bSkgLyBNYXRoLmxvZygxMDAwKSksIHVuaXRzLmxlbmd0aCAtIDEpXG4gIG51bSA9IE51bWJlcihudW0gLyBNYXRoLnBvdygxMDAwLCBleHBvbmVudCkpXG4gIHZhciB1bml0ID0gdW5pdHNbZXhwb25lbnRdXG5cbiAgaWYgKG51bSA+PSAxMCB8fCBudW0gJSAxID09PSAwKSB7XG4gICAgLy8gRG8gbm90IHNob3cgZGVjaW1hbHMgd2hlbiB0aGUgbnVtYmVyIGlzIHR3by1kaWdpdCwgb3IgaWYgdGhlIG51bWJlciBoYXMgbm9cbiAgICAvLyBkZWNpbWFsIGNvbXBvbmVudC5cbiAgICByZXR1cm4gKG5lZyA/ICctJyA6ICcnKSArIG51bS50b0ZpeGVkKDApICsgJyAnICsgdW5pdFxuICB9IGVsc2Uge1xuICAgIHJldHVybiAobmVnID8gJy0nIDogJycpICsgbnVtLnRvRml4ZWQoMSkgKyAnICcgKyB1bml0XG4gIH1cbn1cbiIsIi8vIEdlbmVyYXRlZCBieSBCYWJlbFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmVuY29kZSA9IGVuY29kZTtcbi8qIGdsb2JhbDogd2luZG93ICovXG5cbnZhciBfd2luZG93ID0gd2luZG93O1xudmFyIGJ0b2EgPSBfd2luZG93LmJ0b2E7XG5mdW5jdGlvbiBlbmNvZGUoZGF0YSkge1xuICByZXR1cm4gYnRvYSh1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoZGF0YSkpKTtcbn1cblxudmFyIGlzU3VwcG9ydGVkID0gZXhwb3J0cy5pc1N1cHBvcnRlZCA9IFwiYnRvYVwiIGluIHdpbmRvdzsiLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5uZXdSZXF1ZXN0ID0gbmV3UmVxdWVzdDtcbmV4cG9ydHMucmVzb2x2ZVVybCA9IHJlc29sdmVVcmw7XG5cbnZhciBfcmVzb2x2ZVVybCA9IHJlcXVpcmUoXCJyZXNvbHZlLXVybFwiKTtcblxudmFyIF9yZXNvbHZlVXJsMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX3Jlc29sdmVVcmwpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBuZXdSZXF1ZXN0KCkge1xuICByZXR1cm4gbmV3IHdpbmRvdy5YTUxIdHRwUmVxdWVzdCgpO1xufSAvKiBnbG9iYWwgd2luZG93ICovXG5cblxuZnVuY3Rpb24gcmVzb2x2ZVVybChvcmlnaW4sIGxpbmspIHtcbiAgcmV0dXJuICgwLCBfcmVzb2x2ZVVybDIuZGVmYXVsdCkob3JpZ2luLCBsaW5rKTtcbn0iLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG52YXIgX2NyZWF0ZUNsYXNzID0gZnVuY3Rpb24gKCkgeyBmdW5jdGlvbiBkZWZpbmVQcm9wZXJ0aWVzKHRhcmdldCwgcHJvcHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wcy5sZW5ndGg7IGkrKykgeyB2YXIgZGVzY3JpcHRvciA9IHByb3BzW2ldOyBkZXNjcmlwdG9yLmVudW1lcmFibGUgPSBkZXNjcmlwdG9yLmVudW1lcmFibGUgfHwgZmFsc2U7IGRlc2NyaXB0b3IuY29uZmlndXJhYmxlID0gdHJ1ZTsgaWYgKFwidmFsdWVcIiBpbiBkZXNjcmlwdG9yKSBkZXNjcmlwdG9yLndyaXRhYmxlID0gdHJ1ZTsgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgZGVzY3JpcHRvci5rZXksIGRlc2NyaXB0b3IpOyB9IH0gcmV0dXJuIGZ1bmN0aW9uIChDb25zdHJ1Y3RvciwgcHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHsgaWYgKHByb3RvUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IucHJvdG90eXBlLCBwcm90b1Byb3BzKTsgaWYgKHN0YXRpY1Byb3BzKSBkZWZpbmVQcm9wZXJ0aWVzKENvbnN0cnVjdG9yLCBzdGF0aWNQcm9wcyk7IHJldHVybiBDb25zdHJ1Y3RvcjsgfTsgfSgpO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5nZXRTb3VyY2UgPSBnZXRTb3VyY2U7XG5cbmZ1bmN0aW9uIF9jbGFzc0NhbGxDaGVjayhpbnN0YW5jZSwgQ29uc3RydWN0b3IpIHsgaWYgKCEoaW5zdGFuY2UgaW5zdGFuY2VvZiBDb25zdHJ1Y3RvcikpIHsgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCBjYWxsIGEgY2xhc3MgYXMgYSBmdW5jdGlvblwiKTsgfSB9XG5cbnZhciBGaWxlU291cmNlID0gZnVuY3Rpb24gKCkge1xuICBmdW5jdGlvbiBGaWxlU291cmNlKGZpbGUpIHtcbiAgICBfY2xhc3NDYWxsQ2hlY2sodGhpcywgRmlsZVNvdXJjZSk7XG5cbiAgICB0aGlzLl9maWxlID0gZmlsZTtcbiAgICB0aGlzLnNpemUgPSBmaWxlLnNpemU7XG4gIH1cblxuICBfY3JlYXRlQ2xhc3MoRmlsZVNvdXJjZSwgW3tcbiAgICBrZXk6IFwic2xpY2VcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gc2xpY2Uoc3RhcnQsIGVuZCkge1xuICAgICAgcmV0dXJuIHRoaXMuX2ZpbGUuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgfVxuICB9LCB7XG4gICAga2V5OiBcImNsb3NlXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIGNsb3NlKCkge31cbiAgfV0pO1xuXG4gIHJldHVybiBGaWxlU291cmNlO1xufSgpO1xuXG5mdW5jdGlvbiBnZXRTb3VyY2UoaW5wdXQpIHtcbiAgLy8gU2luY2Ugd2UgZW11bGF0ZSB0aGUgQmxvYiB0eXBlIGluIG91ciB0ZXN0cyAobm90IGFsbCB0YXJnZXQgYnJvd3NlcnNcbiAgLy8gc3VwcG9ydCBpdCksIHdlIGNhbm5vdCB1c2UgYGluc3RhbmNlb2ZgIGZvciB0ZXN0aW5nIHdoZXRoZXIgdGhlIGlucHV0IHZhbHVlXG4gIC8vIGNhbiBiZSBoYW5kbGVkLiBJbnN0ZWFkLCB3ZSBzaW1wbHkgY2hlY2sgaXMgdGhlIHNsaWNlKCkgZnVuY3Rpb24gYW5kIHRoZVxuICAvLyBzaXplIHByb3BlcnR5IGFyZSBhdmFpbGFibGUuXG4gIGlmICh0eXBlb2YgaW5wdXQuc2xpY2UgPT09IFwiZnVuY3Rpb25cIiAmJiB0eXBlb2YgaW5wdXQuc2l6ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHJldHVybiBuZXcgRmlsZVNvdXJjZShpbnB1dCk7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXCJzb3VyY2Ugb2JqZWN0IG1heSBvbmx5IGJlIGFuIGluc3RhbmNlIG9mIEZpbGUgb3IgQmxvYiBpbiB0aGlzIGVudmlyb25tZW50XCIpO1xufSIsIi8vIEdlbmVyYXRlZCBieSBCYWJlbFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLnNldEl0ZW0gPSBzZXRJdGVtO1xuZXhwb3J0cy5nZXRJdGVtID0gZ2V0SXRlbTtcbmV4cG9ydHMucmVtb3ZlSXRlbSA9IHJlbW92ZUl0ZW07XG4vKiBnbG9iYWwgd2luZG93LCBsb2NhbFN0b3JhZ2UgKi9cblxudmFyIGhhc1N0b3JhZ2UgPSBmYWxzZTtcbnRyeSB7XG4gIGhhc1N0b3JhZ2UgPSBcImxvY2FsU3RvcmFnZVwiIGluIHdpbmRvdztcblxuICAvLyBBdHRlbXB0IHRvIHN0b3JlIGFuZCByZWFkIGVudHJpZXMgZnJvbSB0aGUgbG9jYWwgc3RvcmFnZSB0byBkZXRlY3QgUHJpdmF0ZVxuICAvLyBNb2RlIG9uIFNhZmFyaSBvbiBpT1MgKHNlZSAjNDkpXG4gIHZhciBrZXkgPSBcInR1c1N1cHBvcnRcIjtcbiAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpKTtcbn0gY2F0Y2ggKGUpIHtcbiAgLy8gSWYgd2UgdHJ5IHRvIGFjY2VzcyBsb2NhbFN0b3JhZ2UgaW5zaWRlIGEgc2FuZGJveGVkIGlmcmFtZSwgYSBTZWN1cml0eUVycm9yXG4gIC8vIGlzIHRocm93bi4gV2hlbiBpbiBwcml2YXRlIG1vZGUgb24gaU9TIFNhZmFyaSwgYSBRdW90YUV4Y2VlZGVkRXJyb3IgaXNcbiAgLy8gdGhyb3duIChzZWUgIzQ5KVxuICBpZiAoZS5jb2RlID09PSBlLlNFQ1VSSVRZX0VSUiB8fCBlLmNvZGUgPT09IGUuUVVPVEFfRVhDRUVERURfRVJSKSB7XG4gICAgaGFzU3RvcmFnZSA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHRocm93IGU7XG4gIH1cbn1cblxudmFyIGNhblN0b3JlVVJMcyA9IGV4cG9ydHMuY2FuU3RvcmVVUkxzID0gaGFzU3RvcmFnZTtcblxuZnVuY3Rpb24gc2V0SXRlbShrZXksIHZhbHVlKSB7XG4gIGlmICghaGFzU3RvcmFnZSkgcmV0dXJuO1xuICByZXR1cm4gbG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCB2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIGdldEl0ZW0oa2V5KSB7XG4gIGlmICghaGFzU3RvcmFnZSkgcmV0dXJuO1xuICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlSXRlbShrZXkpIHtcbiAgaWYgKCFoYXNTdG9yYWdlKSByZXR1cm47XG4gIHJldHVybiBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xufSIsIi8vIEdlbmVyYXRlZCBieSBCYWJlbFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbmZ1bmN0aW9uIF9jbGFzc0NhbGxDaGVjayhpbnN0YW5jZSwgQ29uc3RydWN0b3IpIHsgaWYgKCEoaW5zdGFuY2UgaW5zdGFuY2VvZiBDb25zdHJ1Y3RvcikpIHsgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCBjYWxsIGEgY2xhc3MgYXMgYSBmdW5jdGlvblwiKTsgfSB9XG5cbmZ1bmN0aW9uIF9wb3NzaWJsZUNvbnN0cnVjdG9yUmV0dXJuKHNlbGYsIGNhbGwpIHsgaWYgKCFzZWxmKSB7IHRocm93IG5ldyBSZWZlcmVuY2VFcnJvcihcInRoaXMgaGFzbid0IGJlZW4gaW5pdGlhbGlzZWQgLSBzdXBlcigpIGhhc24ndCBiZWVuIGNhbGxlZFwiKTsgfSByZXR1cm4gY2FsbCAmJiAodHlwZW9mIGNhbGwgPT09IFwib2JqZWN0XCIgfHwgdHlwZW9mIGNhbGwgPT09IFwiZnVuY3Rpb25cIikgPyBjYWxsIDogc2VsZjsgfVxuXG5mdW5jdGlvbiBfaW5oZXJpdHMoc3ViQ2xhc3MsIHN1cGVyQ2xhc3MpIHsgaWYgKHR5cGVvZiBzdXBlckNsYXNzICE9PSBcImZ1bmN0aW9uXCIgJiYgc3VwZXJDbGFzcyAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgVHlwZUVycm9yKFwiU3VwZXIgZXhwcmVzc2lvbiBtdXN0IGVpdGhlciBiZSBudWxsIG9yIGEgZnVuY3Rpb24sIG5vdCBcIiArIHR5cGVvZiBzdXBlckNsYXNzKTsgfSBzdWJDbGFzcy5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ2xhc3MgJiYgc3VwZXJDbGFzcy5wcm90b3R5cGUsIHsgY29uc3RydWN0b3I6IHsgdmFsdWU6IHN1YkNsYXNzLCBlbnVtZXJhYmxlOiBmYWxzZSwgd3JpdGFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSB9IH0pOyBpZiAoc3VwZXJDbGFzcykgT2JqZWN0LnNldFByb3RvdHlwZU9mID8gT2JqZWN0LnNldFByb3RvdHlwZU9mKHN1YkNsYXNzLCBzdXBlckNsYXNzKSA6IHN1YkNsYXNzLl9fcHJvdG9fXyA9IHN1cGVyQ2xhc3M7IH1cblxudmFyIERldGFpbGVkRXJyb3IgPSBmdW5jdGlvbiAoX0Vycm9yKSB7XG4gIF9pbmhlcml0cyhEZXRhaWxlZEVycm9yLCBfRXJyb3IpO1xuXG4gIGZ1bmN0aW9uIERldGFpbGVkRXJyb3IoZXJyb3IpIHtcbiAgICB2YXIgY2F1c2luZ0VyciA9IGFyZ3VtZW50cy5sZW5ndGggPD0gMSB8fCBhcmd1bWVudHNbMV0gPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhcmd1bWVudHNbMV07XG4gICAgdmFyIHhociA9IGFyZ3VtZW50cy5sZW5ndGggPD0gMiB8fCBhcmd1bWVudHNbMl0gPT09IHVuZGVmaW5lZCA/IG51bGwgOiBhcmd1bWVudHNbMl07XG5cbiAgICBfY2xhc3NDYWxsQ2hlY2sodGhpcywgRGV0YWlsZWRFcnJvcik7XG5cbiAgICB2YXIgX3RoaXMgPSBfcG9zc2libGVDb25zdHJ1Y3RvclJldHVybih0aGlzLCBPYmplY3QuZ2V0UHJvdG90eXBlT2YoRGV0YWlsZWRFcnJvcikuY2FsbCh0aGlzLCBlcnJvci5tZXNzYWdlKSk7XG5cbiAgICBfdGhpcy5vcmlnaW5hbFJlcXVlc3QgPSB4aHI7XG4gICAgX3RoaXMuY2F1c2luZ0Vycm9yID0gY2F1c2luZ0VycjtcblxuICAgIHZhciBtZXNzYWdlID0gZXJyb3IubWVzc2FnZTtcbiAgICBpZiAoY2F1c2luZ0VyciAhPSBudWxsKSB7XG4gICAgICBtZXNzYWdlICs9IFwiLCBjYXVzZWQgYnkgXCIgKyBjYXVzaW5nRXJyLnRvU3RyaW5nKCk7XG4gICAgfVxuICAgIGlmICh4aHIgIT0gbnVsbCkge1xuICAgICAgbWVzc2FnZSArPSBcIiwgb3JpZ2luYXRlZCBmcm9tIHJlcXVlc3QgKHJlc3BvbnNlIGNvZGU6IFwiICsgeGhyLnN0YXR1cyArIFwiLCByZXNwb25zZSB0ZXh0OiBcIiArIHhoci5yZXNwb25zZVRleHQgKyBcIilcIjtcbiAgICB9XG4gICAgX3RoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgcmV0dXJuIF90aGlzO1xuICB9XG5cbiAgcmV0dXJuIERldGFpbGVkRXJyb3I7XG59KEVycm9yKTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gRGV0YWlsZWRFcnJvcjsiLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gZmluZ2VycHJpbnQ7XG4vKipcbiAqIEdlbmVyYXRlIGEgZmluZ2VycHJpbnQgZm9yIGEgZmlsZSB3aGljaCB3aWxsIGJlIHVzZWQgdGhlIHN0b3JlIHRoZSBlbmRwb2ludFxuICpcbiAqIEBwYXJhbSB7RmlsZX0gZmlsZVxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBmaW5nZXJwcmludChmaWxlKSB7XG4gIHJldHVybiBbXCJ0dXNcIiwgZmlsZS5uYW1lLCBmaWxlLnR5cGUsIGZpbGUuc2l6ZSwgZmlsZS5sYXN0TW9kaWZpZWRdLmpvaW4oXCItXCIpO1xufSIsIi8vIEdlbmVyYXRlZCBieSBCYWJlbFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBfdXBsb2FkID0gcmVxdWlyZShcIi4vdXBsb2FkXCIpO1xuXG52YXIgX3VwbG9hZDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF91cGxvYWQpO1xuXG52YXIgX3N0b3JhZ2UgPSByZXF1aXJlKFwiLi9ub2RlL3N0b3JhZ2VcIik7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbi8qIGdsb2JhbCB3aW5kb3cgKi9cbnZhciBkZWZhdWx0T3B0aW9ucyA9IF91cGxvYWQyLmRlZmF1bHQuZGVmYXVsdE9wdGlvbnM7XG5cblxuaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgLy8gQnJvd3NlciBlbnZpcm9ubWVudCB1c2luZyBYTUxIdHRwUmVxdWVzdFxuICB2YXIgX3dpbmRvdyA9IHdpbmRvdztcbiAgdmFyIFhNTEh0dHBSZXF1ZXN0ID0gX3dpbmRvdy5YTUxIdHRwUmVxdWVzdDtcbiAgdmFyIEJsb2IgPSBfd2luZG93LkJsb2I7XG5cblxuICB2YXIgaXNTdXBwb3J0ZWQgPSBYTUxIdHRwUmVxdWVzdCAmJiBCbG9iICYmIHR5cGVvZiBCbG9iLnByb3RvdHlwZS5zbGljZSA9PT0gXCJmdW5jdGlvblwiO1xufSBlbHNlIHtcbiAgLy8gTm9kZS5qcyBlbnZpcm9ubWVudCB1c2luZyBodHRwIG1vZHVsZVxuICB2YXIgaXNTdXBwb3J0ZWQgPSB0cnVlO1xufVxuXG4vLyBUaGUgdXNhZ2Ugb2YgdGhlIGNvbW1vbmpzIGV4cG9ydGluZyBzeW50YXggaW5zdGVhZCBvZiB0aGUgbmV3IEVDTUFTY3JpcHRcbi8vIG9uZSBpcyBhY3R1YWxseSBpbnRlZGVkIGFuZCBwcmV2ZW50cyB3ZWlyZCBiZWhhdmlvdXIgaWYgd2UgYXJlIHRyeWluZyB0b1xuLy8gaW1wb3J0IHRoaXMgbW9kdWxlIGluIGFub3RoZXIgbW9kdWxlIHVzaW5nIEJhYmVsLlxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIFVwbG9hZDogX3VwbG9hZDIuZGVmYXVsdCxcbiAgaXNTdXBwb3J0ZWQ6IGlzU3VwcG9ydGVkLFxuICBjYW5TdG9yZVVSTHM6IF9zdG9yYWdlLmNhblN0b3JlVVJMcyxcbiAgZGVmYXVsdE9wdGlvbnM6IGRlZmF1bHRPcHRpb25zXG59OyIsIi8vIEdlbmVyYXRlZCBieSBCYWJlbFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBfY3JlYXRlQ2xhc3MgPSBmdW5jdGlvbiAoKSB7IGZ1bmN0aW9uIGRlZmluZVByb3BlcnRpZXModGFyZ2V0LCBwcm9wcykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgaSsrKSB7IHZhciBkZXNjcmlwdG9yID0gcHJvcHNbaV07IGRlc2NyaXB0b3IuZW51bWVyYWJsZSA9IGRlc2NyaXB0b3IuZW51bWVyYWJsZSB8fCBmYWxzZTsgZGVzY3JpcHRvci5jb25maWd1cmFibGUgPSB0cnVlOyBpZiAoXCJ2YWx1ZVwiIGluIGRlc2NyaXB0b3IpIGRlc2NyaXB0b3Iud3JpdGFibGUgPSB0cnVlOyBPYmplY3QuZGVmaW5lUHJvcGVydHkodGFyZ2V0LCBkZXNjcmlwdG9yLmtleSwgZGVzY3JpcHRvcik7IH0gfSByZXR1cm4gZnVuY3Rpb24gKENvbnN0cnVjdG9yLCBwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykgeyBpZiAocHJvdG9Qcm9wcykgZGVmaW5lUHJvcGVydGllcyhDb25zdHJ1Y3Rvci5wcm90b3R5cGUsIHByb3RvUHJvcHMpOyBpZiAoc3RhdGljUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IsIHN0YXRpY1Byb3BzKTsgcmV0dXJuIENvbnN0cnVjdG9yOyB9OyB9KCk7IC8qIGdsb2JhbCB3aW5kb3cgKi9cblxuXG4vLyBXZSBpbXBvcnQgdGhlIGZpbGVzIHVzZWQgaW5zaWRlIHRoZSBOb2RlIGVudmlyb25tZW50IHdoaWNoIGFyZSByZXdyaXR0ZW5cbi8vIGZvciBicm93c2VycyB1c2luZyB0aGUgcnVsZXMgZGVmaW5lZCBpbiB0aGUgcGFja2FnZS5qc29uXG5cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcblxudmFyIF9maW5nZXJwcmludCA9IHJlcXVpcmUoXCIuL2ZpbmdlcnByaW50XCIpO1xuXG52YXIgX2ZpbmdlcnByaW50MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2ZpbmdlcnByaW50KTtcblxudmFyIF9lcnJvciA9IHJlcXVpcmUoXCIuL2Vycm9yXCIpO1xuXG52YXIgX2Vycm9yMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Vycm9yKTtcblxudmFyIF9leHRlbmQgPSByZXF1aXJlKFwiZXh0ZW5kXCIpO1xuXG52YXIgX2V4dGVuZDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9leHRlbmQpO1xuXG52YXIgX3JlcXVlc3QgPSByZXF1aXJlKFwiLi9ub2RlL3JlcXVlc3RcIik7XG5cbnZhciBfc291cmNlID0gcmVxdWlyZShcIi4vbm9kZS9zb3VyY2VcIik7XG5cbnZhciBfYmFzZSA9IHJlcXVpcmUoXCIuL25vZGUvYmFzZTY0XCIpO1xuXG52YXIgQmFzZTY0ID0gX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQoX2Jhc2UpO1xuXG52YXIgX3N0b3JhZ2UgPSByZXF1aXJlKFwiLi9ub2RlL3N0b3JhZ2VcIik7XG5cbnZhciBTdG9yYWdlID0gX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQoX3N0b3JhZ2UpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZChvYmopIHsgaWYgKG9iaiAmJiBvYmouX19lc01vZHVsZSkgeyByZXR1cm4gb2JqOyB9IGVsc2UgeyB2YXIgbmV3T2JqID0ge307IGlmIChvYmogIT0gbnVsbCkgeyBmb3IgKHZhciBrZXkgaW4gb2JqKSB7IGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSBuZXdPYmpba2V5XSA9IG9ialtrZXldOyB9IH0gbmV3T2JqLmRlZmF1bHQgPSBvYmo7IHJldHVybiBuZXdPYmo7IH0gfVxuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBfY2xhc3NDYWxsQ2hlY2soaW5zdGFuY2UsIENvbnN0cnVjdG9yKSB7IGlmICghKGluc3RhbmNlIGluc3RhbmNlb2YgQ29uc3RydWN0b3IpKSB7IHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgY2FsbCBhIGNsYXNzIGFzIGEgZnVuY3Rpb25cIik7IH0gfVxuXG52YXIgZGVmYXVsdE9wdGlvbnMgPSB7XG4gIGVuZHBvaW50OiBcIlwiLFxuICBmaW5nZXJwcmludDogX2ZpbmdlcnByaW50Mi5kZWZhdWx0LFxuICByZXN1bWU6IHRydWUsXG4gIG9uUHJvZ3Jlc3M6IG51bGwsXG4gIG9uQ2h1bmtDb21wbGV0ZTogbnVsbCxcbiAgb25TdWNjZXNzOiBudWxsLFxuICBvbkVycm9yOiBudWxsLFxuICBoZWFkZXJzOiB7fSxcbiAgY2h1bmtTaXplOiBJbmZpbml0eSxcbiAgd2l0aENyZWRlbnRpYWxzOiBmYWxzZSxcbiAgdXBsb2FkVXJsOiBudWxsLFxuICB1cGxvYWRTaXplOiBudWxsLFxuICBvdmVycmlkZVBhdGNoTWV0aG9kOiBmYWxzZSxcbiAgcmV0cnlEZWxheXM6IG51bGxcbn07XG5cbnZhciBVcGxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gIGZ1bmN0aW9uIFVwbG9hZChmaWxlLCBvcHRpb25zKSB7XG4gICAgX2NsYXNzQ2FsbENoZWNrKHRoaXMsIFVwbG9hZCk7XG5cbiAgICB0aGlzLm9wdGlvbnMgPSAoMCwgX2V4dGVuZDIuZGVmYXVsdCkodHJ1ZSwge30sIGRlZmF1bHRPcHRpb25zLCBvcHRpb25zKTtcblxuICAgIC8vIFRoZSB1bmRlcmx5aW5nIEZpbGUvQmxvYiBvYmplY3RcbiAgICB0aGlzLmZpbGUgPSBmaWxlO1xuXG4gICAgLy8gVGhlIFVSTCBhZ2FpbnN0IHdoaWNoIHRoZSBmaWxlIHdpbGwgYmUgdXBsb2FkZWRcbiAgICB0aGlzLnVybCA9IG51bGw7XG5cbiAgICAvLyBUaGUgdW5kZXJseWluZyBYSFIgb2JqZWN0IGZvciB0aGUgY3VycmVudCBQQVRDSCByZXF1ZXN0XG4gICAgdGhpcy5feGhyID0gbnVsbDtcblxuICAgIC8vIFRoZSBmaW5nZXJwaW5ydCBmb3IgdGhlIGN1cnJlbnQgZmlsZSAoc2V0IGFmdGVyIHN0YXJ0KCkpXG4gICAgdGhpcy5fZmluZ2VycHJpbnQgPSBudWxsO1xuXG4gICAgLy8gVGhlIG9mZnNldCB1c2VkIGluIHRoZSBjdXJyZW50IFBBVENIIHJlcXVlc3RcbiAgICB0aGlzLl9vZmZzZXQgPSBudWxsO1xuXG4gICAgLy8gVHJ1ZSBpZiB0aGUgY3VycmVudCBQQVRDSCByZXF1ZXN0IGhhcyBiZWVuIGFib3J0ZWRcbiAgICB0aGlzLl9hYm9ydGVkID0gZmFsc2U7XG5cbiAgICAvLyBUaGUgZmlsZSdzIHNpemUgaW4gYnl0ZXNcbiAgICB0aGlzLl9zaXplID0gbnVsbDtcblxuICAgIC8vIFRoZSBTb3VyY2Ugb2JqZWN0IHdoaWNoIHdpbGwgd3JhcCBhcm91bmQgdGhlIGdpdmVuIGZpbGUgYW5kIHByb3ZpZGVzIHVzXG4gICAgLy8gd2l0aCBhIHVuaWZpZWQgaW50ZXJmYWNlIGZvciBnZXR0aW5nIGl0cyBzaXplIGFuZCBzbGljZSBjaHVua3MgZnJvbSBpdHNcbiAgICAvLyBjb250ZW50IGFsbG93aW5nIHVzIHRvIGVhc2lseSBoYW5kbGUgRmlsZXMsIEJsb2JzLCBCdWZmZXJzIGFuZCBTdHJlYW1zLlxuICAgIHRoaXMuX3NvdXJjZSA9IG51bGw7XG5cbiAgICAvLyBUaGUgY3VycmVudCBjb3VudCBvZiBhdHRlbXB0cyB3aGljaCBoYXZlIGJlZW4gbWFkZS4gTnVsbCBpbmRpY2F0ZXMgbm9uZS5cbiAgICB0aGlzLl9yZXRyeUF0dGVtcHQgPSAwO1xuXG4gICAgLy8gVGhlIHRpbWVvdXQncyBJRCB3aGljaCBpcyB1c2VkIHRvIGRlbGF5IHRoZSBuZXh0IHJldHJ5XG4gICAgdGhpcy5fcmV0cnlUaW1lb3V0ID0gbnVsbDtcblxuICAgIC8vIFRoZSBvZmZzZXQgb2YgdGhlIHJlbW90ZSB1cGxvYWQgYmVmb3JlIHRoZSBsYXRlc3QgYXR0ZW1wdCB3YXMgc3RhcnRlZC5cbiAgICB0aGlzLl9vZmZzZXRCZWZvcmVSZXRyeSA9IDA7XG4gIH1cblxuICBfY3JlYXRlQ2xhc3MoVXBsb2FkLCBbe1xuICAgIGtleTogXCJzdGFydFwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBzdGFydCgpIHtcbiAgICAgIHZhciBfdGhpcyA9IHRoaXM7XG5cbiAgICAgIHZhciBmaWxlID0gdGhpcy5maWxlO1xuXG4gICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgdGhpcy5fZW1pdEVycm9yKG5ldyBFcnJvcihcInR1czogbm8gZmlsZSBvciBzdHJlYW0gdG8gdXBsb2FkIHByb3ZpZGVkXCIpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXRoaXMub3B0aW9ucy5lbmRwb2ludCkge1xuICAgICAgICB0aGlzLl9lbWl0RXJyb3IobmV3IEVycm9yKFwidHVzOiBubyBlbmRwb2ludCBwcm92aWRlZFwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdmFyIHNvdXJjZSA9IHRoaXMuX3NvdXJjZSA9ICgwLCBfc291cmNlLmdldFNvdXJjZSkoZmlsZSwgdGhpcy5vcHRpb25zLmNodW5rU2l6ZSk7XG5cbiAgICAgIC8vIEZpcnN0bHksIGNoZWNrIGlmIHRoZSBjYWxsZXIgaGFzIHN1cHBsaWVkIGEgbWFudWFsIHVwbG9hZCBzaXplIG9yIGVsc2VcbiAgICAgIC8vIHdlIHdpbGwgdXNlIHRoZSBjYWxjdWxhdGVkIHNpemUgYnkgdGhlIHNvdXJjZSBvYmplY3QuXG4gICAgICBpZiAodGhpcy5vcHRpb25zLnVwbG9hZFNpemUgIT0gbnVsbCkge1xuICAgICAgICB2YXIgc2l6ZSA9ICt0aGlzLm9wdGlvbnMudXBsb2FkU2l6ZTtcbiAgICAgICAgaWYgKGlzTmFOKHNpemUpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidHVzOiBjYW5ub3QgY29udmVydCBgdXBsb2FkU2l6ZWAgb3B0aW9uIGludG8gYSBudW1iZXJcIik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaXplID0gc2l6ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBzaXplID0gc291cmNlLnNpemU7XG5cbiAgICAgICAgLy8gVGhlIHNpemUgcHJvcGVydHkgd2lsbCBiZSBudWxsIGlmIHdlIGNhbm5vdCBjYWxjdWxhdGUgdGhlIGZpbGUncyBzaXplLFxuICAgICAgICAvLyBmb3IgZXhhbXBsZSBpZiB5b3UgaGFuZGxlIGEgc3RyZWFtLlxuICAgICAgICBpZiAoc2l6ZSA9PSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidHVzOiBjYW5ub3QgYXV0b21hdGljYWxseSBkZXJpdmUgdXBsb2FkJ3Mgc2l6ZSBmcm9tIGlucHV0IGFuZCBtdXN0IGJlIHNwZWNpZmllZCBtYW51YWxseSB1c2luZyB0aGUgYHVwbG9hZFNpemVgIG9wdGlvblwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3NpemUgPSBzaXplO1xuICAgICAgfVxuXG4gICAgICB2YXIgcmV0cnlEZWxheXMgPSB0aGlzLm9wdGlvbnMucmV0cnlEZWxheXM7XG4gICAgICBpZiAocmV0cnlEZWxheXMgIT0gbnVsbCkge1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHJldHJ5RGVsYXlzKSAhPT0gXCJbb2JqZWN0IEFycmF5XVwiKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidHVzOiB0aGUgYHJldHJ5RGVsYXlzYCBvcHRpb24gbXVzdCBlaXRoZXIgYmUgYW4gYXJyYXkgb3IgbnVsbFwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGVycm9yQ2FsbGJhY2sgPSBfdGhpcy5vcHRpb25zLm9uRXJyb3I7XG4gICAgICAgICAgICBfdGhpcy5vcHRpb25zLm9uRXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgIC8vIFJlc3RvcmUgdGhlIG9yaWdpbmFsIGVycm9yIGNhbGxiYWNrIHdoaWNoIG1heSBoYXZlIGJlZW4gc2V0LlxuICAgICAgICAgICAgICBfdGhpcy5vcHRpb25zLm9uRXJyb3IgPSBlcnJvckNhbGxiYWNrO1xuXG4gICAgICAgICAgICAgIC8vIFdlIHdpbGwgcmVzZXQgdGhlIGF0dGVtcHQgY291bnRlciBpZlxuICAgICAgICAgICAgICAvLyAtIHdlIHdlcmUgYWxyZWFkeSBhYmxlIHRvIGNvbm5lY3QgdG8gdGhlIHNlcnZlciAob2Zmc2V0ICE9IG51bGwpIGFuZFxuICAgICAgICAgICAgICAvLyAtIHdlIHdlcmUgYWJsZSB0byB1cGxvYWQgYSBzbWFsbCBjaHVuayBvZiBkYXRhIHRvIHRoZSBzZXJ2ZXJcbiAgICAgICAgICAgICAgdmFyIHNob3VsZFJlc2V0RGVsYXlzID0gX3RoaXMuX29mZnNldCAhPSBudWxsICYmIF90aGlzLl9vZmZzZXQgPiBfdGhpcy5fb2Zmc2V0QmVmb3JlUmV0cnk7XG4gICAgICAgICAgICAgIGlmIChzaG91bGRSZXNldERlbGF5cykge1xuICAgICAgICAgICAgICAgIF90aGlzLl9yZXRyeUF0dGVtcHQgPSAwO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIGlzT25saW5lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgXCJuYXZpZ2F0b3JcIiBpbiB3aW5kb3cgJiYgd2luZG93Lm5hdmlnYXRvci5vbkxpbmUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgaXNPbmxpbmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIFdlIG9ubHkgYXR0ZW1wdCBhIHJldHJ5IGlmXG4gICAgICAgICAgICAgIC8vIC0gd2UgZGlkbid0IGV4Y2VlZCB0aGUgbWF4aXVtIG51bWJlciBvZiByZXRyaWVzLCB5ZXQsIGFuZFxuICAgICAgICAgICAgICAvLyAtIHRoaXMgZXJyb3Igd2FzIGNhdXNlZCBieSBhIHJlcXVlc3Qgb3IgaXQncyByZXNwb25zZSBhbmRcbiAgICAgICAgICAgICAgLy8gLSB0aGUgYnJvd3NlciBkb2VzIG5vdCBpbmRpY2F0ZSB0aGF0IHdlIGFyZSBvZmZsaW5lXG4gICAgICAgICAgICAgIHZhciBzaG91bGRSZXRyeSA9IF90aGlzLl9yZXRyeUF0dGVtcHQgPCByZXRyeURlbGF5cy5sZW5ndGggJiYgZXJyLm9yaWdpbmFsUmVxdWVzdCAhPSBudWxsICYmIGlzT25saW5lO1xuXG4gICAgICAgICAgICAgIGlmICghc2hvdWxkUmV0cnkpIHtcbiAgICAgICAgICAgICAgICBfdGhpcy5fZW1pdEVycm9yKGVycik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIGRlbGF5ID0gcmV0cnlEZWxheXNbX3RoaXMuX3JldHJ5QXR0ZW1wdCsrXTtcblxuICAgICAgICAgICAgICBfdGhpcy5fb2Zmc2V0QmVmb3JlUmV0cnkgPSBfdGhpcy5fb2Zmc2V0O1xuICAgICAgICAgICAgICBfdGhpcy5vcHRpb25zLnVwbG9hZFVybCA9IF90aGlzLnVybDtcblxuICAgICAgICAgICAgICBfdGhpcy5fcmV0cnlUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgX3RoaXMuc3RhcnQoKTtcbiAgICAgICAgICAgICAgfSwgZGVsYXkpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KSgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFJlc2V0IHRoZSBhYm9ydGVkIGZsYWcgd2hlbiB0aGUgdXBsb2FkIGlzIHN0YXJ0ZWQgb3IgZWxzZSB0aGVcbiAgICAgIC8vIF9zdGFydFVwbG9hZCB3aWxsIHN0b3AgYmVmb3JlIHNlbmRpbmcgYSByZXF1ZXN0IGlmIHRoZSB1cGxvYWQgaGFzIGJlZW5cbiAgICAgIC8vIGFib3J0ZWQgcHJldmlvdXNseS5cbiAgICAgIHRoaXMuX2Fib3J0ZWQgPSBmYWxzZTtcblxuICAgICAgLy8gQSBVUkwgaGFzIG1hbnVhbGx5IGJlZW4gc3BlY2lmaWVkLCBzbyB3ZSB0cnkgdG8gcmVzdW1lXG4gICAgICBpZiAodGhpcy5vcHRpb25zLnVwbG9hZFVybCAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMudXJsID0gdGhpcy5vcHRpb25zLnVwbG9hZFVybDtcbiAgICAgICAgdGhpcy5fcmVzdW1lVXBsb2FkKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGVuZHBvaW50IGZvciB0aGUgZmlsZSBpbiB0aGUgc3RvcmFnZVxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5yZXN1bWUpIHtcbiAgICAgICAgdGhpcy5fZmluZ2VycHJpbnQgPSB0aGlzLm9wdGlvbnMuZmluZ2VycHJpbnQoZmlsZSk7XG4gICAgICAgIHZhciByZXN1bWVkVXJsID0gU3RvcmFnZS5nZXRJdGVtKHRoaXMuX2ZpbmdlcnByaW50KTtcblxuICAgICAgICBpZiAocmVzdW1lZFVybCAhPSBudWxsKSB7XG4gICAgICAgICAgdGhpcy51cmwgPSByZXN1bWVkVXJsO1xuICAgICAgICAgIHRoaXMuX3Jlc3VtZVVwbG9hZCgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBBbiB1cGxvYWQgaGFzIG5vdCBzdGFydGVkIGZvciB0aGUgZmlsZSB5ZXQsIHNvIHdlIHN0YXJ0IGEgbmV3IG9uZVxuICAgICAgdGhpcy5fY3JlYXRlVXBsb2FkKCk7XG4gICAgfVxuICB9LCB7XG4gICAga2V5OiBcImFib3J0XCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIGFib3J0KCkge1xuICAgICAgaWYgKHRoaXMuX3hociAhPT0gbnVsbCkge1xuICAgICAgICB0aGlzLl94aHIuYWJvcnQoKTtcbiAgICAgICAgdGhpcy5fc291cmNlLmNsb3NlKCk7XG4gICAgICAgIHRoaXMuX2Fib3J0ZWQgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fcmV0cnlUaW1lb3V0ICE9IG51bGwpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX3JldHJ5VGltZW91dCk7XG4gICAgICAgIHRoaXMuX3JldHJ5VGltZW91dCA9IG51bGw7XG4gICAgICB9XG4gICAgfVxuICB9LCB7XG4gICAga2V5OiBcIl9lbWl0WGhyRXJyb3JcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX2VtaXRYaHJFcnJvcih4aHIsIGVyciwgY2F1c2luZ0Vycikge1xuICAgICAgdGhpcy5fZW1pdEVycm9yKG5ldyBfZXJyb3IyLmRlZmF1bHQoZXJyLCBjYXVzaW5nRXJyLCB4aHIpKTtcbiAgICB9XG4gIH0sIHtcbiAgICBrZXk6IFwiX2VtaXRFcnJvclwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBfZW1pdEVycm9yKGVycikge1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLm9wdGlvbnMub25FcnJvciA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5vbkVycm9yKGVycik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG4gICAgfVxuICB9LCB7XG4gICAga2V5OiBcIl9lbWl0U3VjY2Vzc1wiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBfZW1pdFN1Y2Nlc3MoKSB7XG4gICAgICBpZiAodHlwZW9mIHRoaXMub3B0aW9ucy5vblN1Y2Nlc3MgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aGlzLm9wdGlvbnMub25TdWNjZXNzKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHVibGlzaGVzIG5vdGlmaWNhdGlvbiB3aGVuIGRhdGEgaGFzIGJlZW4gc2VudCB0byB0aGUgc2VydmVyLiBUaGlzXG4gICAgICogZGF0YSBtYXkgbm90IGhhdmUgYmVlbiBhY2NlcHRlZCBieSB0aGUgc2VydmVyIHlldC5cbiAgICAgKiBAcGFyYW0gIHtudW1iZXJ9IGJ5dGVzU2VudCAgTnVtYmVyIG9mIGJ5dGVzIHNlbnQgdG8gdGhlIHNlcnZlci5cbiAgICAgKiBAcGFyYW0gIHtudW1iZXJ9IGJ5dGVzVG90YWwgVG90YWwgbnVtYmVyIG9mIGJ5dGVzIHRvIGJlIHNlbnQgdG8gdGhlIHNlcnZlci5cbiAgICAgKi9cblxuICB9LCB7XG4gICAga2V5OiBcIl9lbWl0UHJvZ3Jlc3NcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX2VtaXRQcm9ncmVzcyhieXRlc1NlbnQsIGJ5dGVzVG90YWwpIHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLm9uUHJvZ3Jlc3MgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aGlzLm9wdGlvbnMub25Qcm9ncmVzcyhieXRlc1NlbnQsIGJ5dGVzVG90YWwpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFB1Ymxpc2hlcyBub3RpZmljYXRpb24gd2hlbiBhIGNodW5rIG9mIGRhdGEgaGFzIGJlZW4gc2VudCB0byB0aGUgc2VydmVyXG4gICAgICogYW5kIGFjY2VwdGVkIGJ5IHRoZSBzZXJ2ZXIuXG4gICAgICogQHBhcmFtICB7bnVtYmVyfSBjaHVua1NpemUgIFNpemUgb2YgdGhlIGNodW5rIHRoYXQgd2FzIGFjY2VwdGVkIGJ5IHRoZVxuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXJ2ZXIuXG4gICAgICogQHBhcmFtICB7bnVtYmVyfSBieXRlc0FjY2VwdGVkIFRvdGFsIG51bWJlciBvZiBieXRlcyB0aGF0IGhhdmUgYmVlblxuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY2NlcHRlZCBieSB0aGUgc2VydmVyLlxuICAgICAqIEBwYXJhbSAge251bWJlcn0gYnl0ZXNUb3RhbCBUb3RhbCBudW1iZXIgb2YgYnl0ZXMgdG8gYmUgc2VudCB0byB0aGUgc2VydmVyLlxuICAgICAqL1xuXG4gIH0sIHtcbiAgICBrZXk6IFwiX2VtaXRDaHVua0NvbXBsZXRlXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIF9lbWl0Q2h1bmtDb21wbGV0ZShjaHVua1NpemUsIGJ5dGVzQWNjZXB0ZWQsIGJ5dGVzVG90YWwpIHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLm9uQ2h1bmtDb21wbGV0ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5vbkNodW5rQ29tcGxldGUoY2h1bmtTaXplLCBieXRlc0FjY2VwdGVkLCBieXRlc1RvdGFsKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIGhlYWRlcnMgdXNlZCBpbiB0aGUgcmVxdWVzdCBhbmQgdGhlIHdpdGhDcmVkZW50aWFscyBwcm9wZXJ0eVxuICAgICAqIGFzIGRlZmluZWQgaW4gdGhlIG9wdGlvbnNcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7WE1MSHR0cFJlcXVlc3R9IHhoclxuICAgICAqL1xuXG4gIH0sIHtcbiAgICBrZXk6IFwiX3NldHVwWEhSXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIF9zZXR1cFhIUih4aHIpIHtcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiVHVzLVJlc3VtYWJsZVwiLCBcIjEuMC4wXCIpO1xuICAgICAgdmFyIGhlYWRlcnMgPSB0aGlzLm9wdGlvbnMuaGVhZGVycztcblxuICAgICAgZm9yICh2YXIgbmFtZSBpbiBoZWFkZXJzKSB7XG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKG5hbWUsIGhlYWRlcnNbbmFtZV0pO1xuICAgICAgfVxuXG4gICAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gdGhpcy5vcHRpb25zLndpdGhDcmVkZW50aWFscztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgdXBsb2FkIHVzaW5nIHRoZSBjcmVhdGlvbiBleHRlbnNpb24gYnkgc2VuZGluZyBhIFBPU1RcbiAgICAgKiByZXF1ZXN0IHRvIHRoZSBlbmRwb2ludC4gQWZ0ZXIgc3VjY2Vzc2Z1bCBjcmVhdGlvbiB0aGUgZmlsZSB3aWxsIGJlXG4gICAgICogdXBsb2FkZWRcbiAgICAgKlxuICAgICAqIEBhcGkgcHJpdmF0ZVxuICAgICAqL1xuXG4gIH0sIHtcbiAgICBrZXk6IFwiX2NyZWF0ZVVwbG9hZFwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBfY3JlYXRlVXBsb2FkKCkge1xuICAgICAgdmFyIF90aGlzMiA9IHRoaXM7XG5cbiAgICAgIHZhciB4aHIgPSAoMCwgX3JlcXVlc3QubmV3UmVxdWVzdCkoKTtcbiAgICAgIHhoci5vcGVuKFwiUE9TVFwiLCB0aGlzLm9wdGlvbnMuZW5kcG9pbnQsIHRydWUpO1xuXG4gICAgICB4aHIub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoISh4aHIuc3RhdHVzID49IDIwMCAmJiB4aHIuc3RhdHVzIDwgMzAwKSkge1xuICAgICAgICAgIF90aGlzMi5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiB1bmV4cGVjdGVkIHJlc3BvbnNlIHdoaWxlIGNyZWF0aW5nIHVwbG9hZFwiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgX3RoaXMyLnVybCA9ICgwLCBfcmVxdWVzdC5yZXNvbHZlVXJsKShfdGhpczIub3B0aW9ucy5lbmRwb2ludCwgeGhyLmdldFJlc3BvbnNlSGVhZGVyKFwiTG9jYXRpb25cIikpO1xuXG4gICAgICAgIGlmIChfdGhpczIub3B0aW9ucy5yZXN1bWUpIHtcbiAgICAgICAgICBTdG9yYWdlLnNldEl0ZW0oX3RoaXMyLl9maW5nZXJwcmludCwgX3RoaXMyLnVybCk7XG4gICAgICAgIH1cblxuICAgICAgICBfdGhpczIuX29mZnNldCA9IDA7XG4gICAgICAgIF90aGlzMi5fc3RhcnRVcGxvYWQoKTtcbiAgICAgIH07XG5cbiAgICAgIHhoci5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICBfdGhpczIuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogZmFpbGVkIHRvIGNyZWF0ZSB1cGxvYWRcIiksIGVycik7XG4gICAgICB9O1xuXG4gICAgICB0aGlzLl9zZXR1cFhIUih4aHIpO1xuICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoXCJVcGxvYWQtTGVuZ3RoXCIsIHRoaXMuX3NpemUpO1xuXG4gICAgICAvLyBBZGQgbWV0YWRhdGEgaWYgdmFsdWVzIGhhdmUgYmVlbiBhZGRlZFxuICAgICAgdmFyIG1ldGFkYXRhID0gZW5jb2RlTWV0YWRhdGEodGhpcy5vcHRpb25zLm1ldGFkYXRhKTtcbiAgICAgIGlmIChtZXRhZGF0YSAhPT0gXCJcIikge1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlVwbG9hZC1NZXRhZGF0YVwiLCBtZXRhZGF0YSk7XG4gICAgICB9XG5cbiAgICAgIHhoci5zZW5kKG51bGwpO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogVHJ5IHRvIHJlc3VtZSBhbiBleGlzdGluZyB1cGxvYWQuIEZpcnN0IGEgSEVBRCByZXF1ZXN0IHdpbGwgYmUgc2VudFxuICAgICAqIHRvIHJldHJpZXZlIHRoZSBvZmZzZXQuIElmIHRoZSByZXF1ZXN0IGZhaWxzIGEgbmV3IHVwbG9hZCB3aWxsIGJlXG4gICAgICogY3JlYXRlZC4gSW4gdGhlIGNhc2Ugb2YgYSBzdWNjZXNzZnVsIHJlc3BvbnNlIHRoZSBmaWxlIHdpbGwgYmUgdXBsb2FkZWQuXG4gICAgICpcbiAgICAgKiBAYXBpIHByaXZhdGVcbiAgICAgKi9cblxuICB9LCB7XG4gICAga2V5OiBcIl9yZXN1bWVVcGxvYWRcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX3Jlc3VtZVVwbG9hZCgpIHtcbiAgICAgIHZhciBfdGhpczMgPSB0aGlzO1xuXG4gICAgICB2YXIgeGhyID0gKDAsIF9yZXF1ZXN0Lm5ld1JlcXVlc3QpKCk7XG4gICAgICB4aHIub3BlbihcIkhFQURcIiwgdGhpcy51cmwsIHRydWUpO1xuXG4gICAgICB4aHIub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoISh4aHIuc3RhdHVzID49IDIwMCAmJiB4aHIuc3RhdHVzIDwgMzAwKSkge1xuICAgICAgICAgIGlmIChfdGhpczMub3B0aW9ucy5yZXN1bWUpIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSBzdG9yZWQgZmluZ2VycHJpbnQgYW5kIGNvcnJlc3BvbmRpbmcgZW5kcG9pbnQsXG4gICAgICAgICAgICAvLyBzaW5jZSB0aGUgZmlsZSBjYW4gbm90IGJlIGZvdW5kXG4gICAgICAgICAgICBTdG9yYWdlLnJlbW92ZUl0ZW0oX3RoaXMzLl9maW5nZXJwcmludCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgdGhlIHVwbG9hZCBpcyBsb2NrZWQgKGluZGljYXRlZCBieSB0aGUgNDIzIExvY2tlZCBzdGF0dXMgY29kZSksIHdlXG4gICAgICAgICAgLy8gZW1pdCBhbiBlcnJvciBpbnN0ZWFkIG9mIGRpcmVjdGx5IHN0YXJ0aW5nIGEgbmV3IHVwbG9hZC4gVGhpcyB3YXkgdGhlXG4gICAgICAgICAgLy8gcmV0cnkgbG9naWMgY2FuIGNhdGNoIHRoZSBlcnJvciBhbmQgd2lsbCByZXRyeSB0aGUgdXBsb2FkLiBBbiB1cGxvYWRcbiAgICAgICAgICAvLyBpcyB1c3VhbGx5IGxvY2tlZCBmb3IgYSBzaG9ydCBwZXJpb2Qgb2YgdGltZSBhbmQgd2lsbCBiZSBhdmFpbGFibGVcbiAgICAgICAgICAvLyBhZnRlcndhcmRzLlxuICAgICAgICAgIGlmICh4aHIuc3RhdHVzID09PSA0MjMpIHtcbiAgICAgICAgICAgIF90aGlzMy5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiB1cGxvYWQgaXMgY3VycmVudGx5IGxvY2tlZDsgcmV0cnkgbGF0ZXJcIikpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFRyeSB0byBjcmVhdGUgYSBuZXcgdXBsb2FkXG4gICAgICAgICAgX3RoaXMzLnVybCA9IG51bGw7XG4gICAgICAgICAgX3RoaXMzLl9jcmVhdGVVcGxvYWQoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb2Zmc2V0ID0gcGFyc2VJbnQoeGhyLmdldFJlc3BvbnNlSGVhZGVyKFwiVXBsb2FkLU9mZnNldFwiKSwgMTApO1xuICAgICAgICBpZiAoaXNOYU4ob2Zmc2V0KSkge1xuICAgICAgICAgIF90aGlzMy5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiBpbnZhbGlkIG9yIG1pc3Npbmcgb2Zmc2V0IHZhbHVlXCIpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVuZ3RoID0gcGFyc2VJbnQoeGhyLmdldFJlc3BvbnNlSGVhZGVyKFwiVXBsb2FkLUxlbmd0aFwiKSwgMTApO1xuICAgICAgICBpZiAoaXNOYU4obGVuZ3RoKSkge1xuICAgICAgICAgIF90aGlzMy5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiBpbnZhbGlkIG9yIG1pc3NpbmcgbGVuZ3RoIHZhbHVlXCIpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVcGxvYWQgaGFzIGFscmVhZHkgYmVlbiBjb21wbGV0ZWQgYW5kIHdlIGRvIG5vdCBuZWVkIHRvIHNlbmQgYWRkaXRpb25hbFxuICAgICAgICAvLyBkYXRhIHRvIHRoZSBzZXJ2ZXJcbiAgICAgICAgaWYgKG9mZnNldCA9PT0gbGVuZ3RoKSB7XG4gICAgICAgICAgX3RoaXMzLl9lbWl0UHJvZ3Jlc3MobGVuZ3RoLCBsZW5ndGgpO1xuICAgICAgICAgIF90aGlzMy5fZW1pdFN1Y2Nlc3MoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBfdGhpczMuX29mZnNldCA9IG9mZnNldDtcbiAgICAgICAgX3RoaXMzLl9zdGFydFVwbG9hZCgpO1xuICAgICAgfTtcblxuICAgICAgeGhyLm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIF90aGlzMy5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiBmYWlsZWQgdG8gcmVzdW1lIHVwbG9hZFwiKSwgZXJyKTtcbiAgICAgIH07XG5cbiAgICAgIHRoaXMuX3NldHVwWEhSKHhocik7XG4gICAgICB4aHIuc2VuZChudWxsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydCB1cGxvYWRpbmcgdGhlIGZpbGUgdXNpbmcgUEFUQ0ggcmVxdWVzdHMuIFRoZSBmaWxlIHdpbGwgYmUgZGl2aWRlZFxuICAgICAqIGludG8gY2h1bmtzIGFzIHNwZWNpZmllZCBpbiB0aGUgY2h1bmtTaXplIG9wdGlvbi4gRHVyaW5nIHRoZSB1cGxvYWRcbiAgICAgKiB0aGUgb25Qcm9ncmVzcyBldmVudCBoYW5kbGVyIG1heSBiZSBpbnZva2VkIG11bHRpcGxlIHRpbWVzLlxuICAgICAqXG4gICAgICogQGFwaSBwcml2YXRlXG4gICAgICovXG5cbiAgfSwge1xuICAgIGtleTogXCJfc3RhcnRVcGxvYWRcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX3N0YXJ0VXBsb2FkKCkge1xuICAgICAgdmFyIF90aGlzNCA9IHRoaXM7XG5cbiAgICAgIC8vIElmIHRoZSB1cGxvYWQgaGFzIGJlZW4gYWJvcnRlZCwgd2Ugd2lsbCBub3Qgc2VuZCB0aGUgbmV4dCBQQVRDSCByZXF1ZXN0LlxuICAgICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgaWYgdGhlIGFib3J0IG1ldGhvZCB3YXMgY2FsbGVkIGR1cmluZyBhIGNhbGxiYWNrLCBzdWNoXG4gICAgICAvLyBhcyBvbkNodW5rQ29tcGxldGUgb3Igb25Qcm9ncmVzcy5cbiAgICAgIGlmICh0aGlzLl9hYm9ydGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdmFyIHhociA9IHRoaXMuX3hociA9ICgwLCBfcmVxdWVzdC5uZXdSZXF1ZXN0KSgpO1xuXG4gICAgICAvLyBTb21lIGJyb3dzZXIgYW5kIHNlcnZlcnMgbWF5IG5vdCBzdXBwb3J0IHRoZSBQQVRDSCBtZXRob2QuIEZvciB0aG9zZVxuICAgICAgLy8gY2FzZXMsIHlvdSBjYW4gdGVsbCB0dXMtanMtY2xpZW50IHRvIHVzZSBhIFBPU1QgcmVxdWVzdCB3aXRoIHRoZVxuICAgICAgLy8gWC1IVFRQLU1ldGhvZC1PdmVycmlkZSBoZWFkZXIgZm9yIHNpbXVsYXRpbmcgYSBQQVRDSCByZXF1ZXN0LlxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5vdmVycmlkZVBhdGNoTWV0aG9kKSB7XG4gICAgICAgIHhoci5vcGVuKFwiUE9TVFwiLCB0aGlzLnVybCwgdHJ1ZSk7XG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiWC1IVFRQLU1ldGhvZC1PdmVycmlkZVwiLCBcIlBBVENIXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgeGhyLm9wZW4oXCJQQVRDSFwiLCB0aGlzLnVybCwgdHJ1ZSk7XG4gICAgICB9XG5cbiAgICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghKHhoci5zdGF0dXMgPj0gMjAwICYmIHhoci5zdGF0dXMgPCAzMDApKSB7XG4gICAgICAgICAgX3RoaXM0Ll9lbWl0WGhyRXJyb3IoeGhyLCBuZXcgRXJyb3IoXCJ0dXM6IHVuZXhwZWN0ZWQgcmVzcG9uc2Ugd2hpbGUgdXBsb2FkaW5nIGNodW5rXCIpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb2Zmc2V0ID0gcGFyc2VJbnQoeGhyLmdldFJlc3BvbnNlSGVhZGVyKFwiVXBsb2FkLU9mZnNldFwiKSwgMTApO1xuICAgICAgICBpZiAoaXNOYU4ob2Zmc2V0KSkge1xuICAgICAgICAgIF90aGlzNC5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiBpbnZhbGlkIG9yIG1pc3Npbmcgb2Zmc2V0IHZhbHVlXCIpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBfdGhpczQuX2VtaXRQcm9ncmVzcyhvZmZzZXQsIF90aGlzNC5fc2l6ZSk7XG4gICAgICAgIF90aGlzNC5fZW1pdENodW5rQ29tcGxldGUob2Zmc2V0IC0gX3RoaXM0Ll9vZmZzZXQsIG9mZnNldCwgX3RoaXM0Ll9zaXplKTtcblxuICAgICAgICBfdGhpczQuX29mZnNldCA9IG9mZnNldDtcblxuICAgICAgICBpZiAob2Zmc2V0ID09IF90aGlzNC5fc2l6ZSkge1xuICAgICAgICAgIC8vIFlheSwgZmluYWxseSBkb25lIDopXG4gICAgICAgICAgX3RoaXM0Ll9lbWl0U3VjY2VzcygpO1xuICAgICAgICAgIF90aGlzNC5fc291cmNlLmNsb3NlKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgX3RoaXM0Ll9zdGFydFVwbG9hZCgpO1xuICAgICAgfTtcblxuICAgICAgeGhyLm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIC8vIERvbid0IGVtaXQgYW4gZXJyb3IgaWYgdGhlIHVwbG9hZCB3YXMgYWJvcnRlZCBtYW51YWxseVxuICAgICAgICBpZiAoX3RoaXM0Ll9hYm9ydGVkKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgX3RoaXM0Ll9lbWl0WGhyRXJyb3IoeGhyLCBuZXcgRXJyb3IoXCJ0dXM6IGZhaWxlZCB0byB1cGxvYWQgY2h1bmsgYXQgb2Zmc2V0IFwiICsgX3RoaXM0Ll9vZmZzZXQpLCBlcnIpO1xuICAgICAgfTtcblxuICAgICAgLy8gVGVzdCBzdXBwb3J0IGZvciBwcm9ncmVzcyBldmVudHMgYmVmb3JlIGF0dGFjaGluZyBhbiBldmVudCBsaXN0ZW5lclxuICAgICAgaWYgKFwidXBsb2FkXCIgaW4geGhyKSB7XG4gICAgICAgIHhoci51cGxvYWQub25wcm9ncmVzcyA9IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgaWYgKCFlLmxlbmd0aENvbXB1dGFibGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBfdGhpczQuX2VtaXRQcm9ncmVzcyhzdGFydCArIGUubG9hZGVkLCBfdGhpczQuX3NpemUpO1xuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICB0aGlzLl9zZXR1cFhIUih4aHIpO1xuXG4gICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlVwbG9hZC1PZmZzZXRcIiwgdGhpcy5fb2Zmc2V0KTtcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vb2Zmc2V0K29jdGV0LXN0cmVhbVwiKTtcblxuICAgICAgdmFyIHN0YXJ0ID0gdGhpcy5fb2Zmc2V0O1xuICAgICAgdmFyIGVuZCA9IHRoaXMuX29mZnNldCArIHRoaXMub3B0aW9ucy5jaHVua1NpemU7XG5cbiAgICAgIC8vIFRoZSBzcGVjaWZpZWQgY2h1bmtTaXplIG1heSBiZSBJbmZpbml0eSBvciB0aGUgY2FsY2x1YXRlZCBlbmQgcG9zaXRpb25cbiAgICAgIC8vIG1heSBleGNlZWQgdGhlIGZpbGUncyBzaXplLiBJbiBib3RoIGNhc2VzLCB3ZSBsaW1pdCB0aGUgZW5kIHBvc2l0aW9uIHRvXG4gICAgICAvLyB0aGUgaW5wdXQncyB0b3RhbCBzaXplIGZvciBzaW1wbGVyIGNhbGN1bGF0aW9ucyBhbmQgY29ycmVjdG5lc3MuXG4gICAgICBpZiAoZW5kID09PSBJbmZpbml0eSB8fCBlbmQgPiB0aGlzLl9zaXplKSB7XG4gICAgICAgIGVuZCA9IHRoaXMuX3NpemU7XG4gICAgICB9XG5cbiAgICAgIHhoci5zZW5kKHRoaXMuX3NvdXJjZS5zbGljZShzdGFydCwgZW5kKSk7XG4gICAgfVxuICB9XSk7XG5cbiAgcmV0dXJuIFVwbG9hZDtcbn0oKTtcblxuZnVuY3Rpb24gZW5jb2RlTWV0YWRhdGEobWV0YWRhdGEpIHtcbiAgaWYgKCFCYXNlNjQuaXNTdXBwb3J0ZWQpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIHZhciBlbmNvZGVkID0gW107XG5cbiAgZm9yICh2YXIga2V5IGluIG1ldGFkYXRhKSB7XG4gICAgZW5jb2RlZC5wdXNoKGtleSArIFwiIFwiICsgQmFzZTY0LmVuY29kZShtZXRhZGF0YVtrZXldKSk7XG4gIH1cblxuICByZXR1cm4gZW5jb2RlZC5qb2luKFwiLFwiKTtcbn1cblxuVXBsb2FkLmRlZmF1bHRPcHRpb25zID0gZGVmYXVsdE9wdGlvbnM7XG5cbmV4cG9ydHMuZGVmYXVsdCA9IFVwbG9hZDsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xudmFyIHRvU3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxudmFyIGlzQXJyYXkgPSBmdW5jdGlvbiBpc0FycmF5KGFycikge1xuXHRpZiAodHlwZW9mIEFycmF5LmlzQXJyYXkgPT09ICdmdW5jdGlvbicpIHtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShhcnIpO1xuXHR9XG5cblx0cmV0dXJuIHRvU3RyLmNhbGwoYXJyKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbnZhciBpc1BsYWluT2JqZWN0ID0gZnVuY3Rpb24gaXNQbGFpbk9iamVjdChvYmopIHtcblx0aWYgKCFvYmogfHwgdG9TdHIuY2FsbChvYmopICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHZhciBoYXNPd25Db25zdHJ1Y3RvciA9IGhhc093bi5jYWxsKG9iaiwgJ2NvbnN0cnVjdG9yJyk7XG5cdHZhciBoYXNJc1Byb3RvdHlwZU9mID0gb2JqLmNvbnN0cnVjdG9yICYmIG9iai5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgJiYgaGFzT3duLmNhbGwob2JqLmNvbnN0cnVjdG9yLnByb3RvdHlwZSwgJ2lzUHJvdG90eXBlT2YnKTtcblx0Ly8gTm90IG93biBjb25zdHJ1Y3RvciBwcm9wZXJ0eSBtdXN0IGJlIE9iamVjdFxuXHRpZiAob2JqLmNvbnN0cnVjdG9yICYmICFoYXNPd25Db25zdHJ1Y3RvciAmJiAhaGFzSXNQcm90b3R5cGVPZikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIE93biBwcm9wZXJ0aWVzIGFyZSBlbnVtZXJhdGVkIGZpcnN0bHksIHNvIHRvIHNwZWVkIHVwLFxuXHQvLyBpZiBsYXN0IG9uZSBpcyBvd24sIHRoZW4gYWxsIHByb3BlcnRpZXMgYXJlIG93bi5cblx0dmFyIGtleTtcblx0Zm9yIChrZXkgaW4gb2JqKSB7IC8qKi8gfVxuXG5cdHJldHVybiB0eXBlb2Yga2V5ID09PSAndW5kZWZpbmVkJyB8fCBoYXNPd24uY2FsbChvYmosIGtleSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGV4dGVuZCgpIHtcblx0dmFyIG9wdGlvbnMsIG5hbWUsIHNyYywgY29weSwgY29weUlzQXJyYXksIGNsb25lO1xuXHR2YXIgdGFyZ2V0ID0gYXJndW1lbnRzWzBdO1xuXHR2YXIgaSA9IDE7XG5cdHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xuXHR2YXIgZGVlcCA9IGZhbHNlO1xuXG5cdC8vIEhhbmRsZSBhIGRlZXAgY29weSBzaXR1YXRpb25cblx0aWYgKHR5cGVvZiB0YXJnZXQgPT09ICdib29sZWFuJykge1xuXHRcdGRlZXAgPSB0YXJnZXQ7XG5cdFx0dGFyZ2V0ID0gYXJndW1lbnRzWzFdIHx8IHt9O1xuXHRcdC8vIHNraXAgdGhlIGJvb2xlYW4gYW5kIHRoZSB0YXJnZXRcblx0XHRpID0gMjtcblx0fVxuXHRpZiAodGFyZ2V0ID09IG51bGwgfHwgKHR5cGVvZiB0YXJnZXQgIT09ICdvYmplY3QnICYmIHR5cGVvZiB0YXJnZXQgIT09ICdmdW5jdGlvbicpKSB7XG5cdFx0dGFyZ2V0ID0ge307XG5cdH1cblxuXHRmb3IgKDsgaSA8IGxlbmd0aDsgKytpKSB7XG5cdFx0b3B0aW9ucyA9IGFyZ3VtZW50c1tpXTtcblx0XHQvLyBPbmx5IGRlYWwgd2l0aCBub24tbnVsbC91bmRlZmluZWQgdmFsdWVzXG5cdFx0aWYgKG9wdGlvbnMgIT0gbnVsbCkge1xuXHRcdFx0Ly8gRXh0ZW5kIHRoZSBiYXNlIG9iamVjdFxuXHRcdFx0Zm9yIChuYW1lIGluIG9wdGlvbnMpIHtcblx0XHRcdFx0c3JjID0gdGFyZ2V0W25hbWVdO1xuXHRcdFx0XHRjb3B5ID0gb3B0aW9uc1tuYW1lXTtcblxuXHRcdFx0XHQvLyBQcmV2ZW50IG5ldmVyLWVuZGluZyBsb29wXG5cdFx0XHRcdGlmICh0YXJnZXQgIT09IGNvcHkpIHtcblx0XHRcdFx0XHQvLyBSZWN1cnNlIGlmIHdlJ3JlIG1lcmdpbmcgcGxhaW4gb2JqZWN0cyBvciBhcnJheXNcblx0XHRcdFx0XHRpZiAoZGVlcCAmJiBjb3B5ICYmIChpc1BsYWluT2JqZWN0KGNvcHkpIHx8IChjb3B5SXNBcnJheSA9IGlzQXJyYXkoY29weSkpKSkge1xuXHRcdFx0XHRcdFx0aWYgKGNvcHlJc0FycmF5KSB7XG5cdFx0XHRcdFx0XHRcdGNvcHlJc0FycmF5ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGNsb25lID0gc3JjICYmIGlzQXJyYXkoc3JjKSA/IHNyYyA6IFtdO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y2xvbmUgPSBzcmMgJiYgaXNQbGFpbk9iamVjdChzcmMpID8gc3JjIDoge307XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIE5ldmVyIG1vdmUgb3JpZ2luYWwgb2JqZWN0cywgY2xvbmUgdGhlbVxuXHRcdFx0XHRcdFx0dGFyZ2V0W25hbWVdID0gZXh0ZW5kKGRlZXAsIGNsb25lLCBjb3B5KTtcblxuXHRcdFx0XHRcdC8vIERvbid0IGJyaW5nIGluIHVuZGVmaW5lZCB2YWx1ZXNcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBjb3B5ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0dGFyZ2V0W25hbWVdID0gY29weTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBSZXR1cm4gdGhlIG1vZGlmaWVkIG9iamVjdFxuXHRyZXR1cm4gdGFyZ2V0O1xufTtcbiIsIi8vIENvcHlyaWdodCAyMDE0IFNpbW9uIEx5ZGVsbFxyXG4vLyBYMTEgKOKAnE1JVOKAnSkgTGljZW5zZWQuIChTZWUgTElDRU5TRS4pXHJcblxyXG52b2lkIChmdW5jdGlvbihyb290LCBmYWN0b3J5KSB7XHJcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICBkZWZpbmUoZmFjdG9yeSlcclxuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKVxyXG4gIH0gZWxzZSB7XHJcbiAgICByb290LnJlc29sdmVVcmwgPSBmYWN0b3J5KClcclxuICB9XHJcbn0odGhpcywgZnVuY3Rpb24oKSB7XHJcblxyXG4gIGZ1bmN0aW9uIHJlc29sdmVVcmwoLyogLi4udXJscyAqLykge1xyXG4gICAgdmFyIG51bVVybHMgPSBhcmd1bWVudHMubGVuZ3RoXHJcblxyXG4gICAgaWYgKG51bVVybHMgPT09IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwicmVzb2x2ZVVybCByZXF1aXJlcyBhdCBsZWFzdCBvbmUgYXJndW1lbnQ7IGdvdCBub25lLlwiKVxyXG4gICAgfVxyXG5cclxuICAgIHZhciBiYXNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJhc2VcIilcclxuICAgIGJhc2UuaHJlZiA9IGFyZ3VtZW50c1swXVxyXG5cclxuICAgIGlmIChudW1VcmxzID09PSAxKSB7XHJcbiAgICAgIHJldHVybiBiYXNlLmhyZWZcclxuICAgIH1cclxuXHJcbiAgICB2YXIgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiaGVhZFwiKVswXVxyXG4gICAgaGVhZC5pbnNlcnRCZWZvcmUoYmFzZSwgaGVhZC5maXJzdENoaWxkKVxyXG5cclxuICAgIHZhciBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIilcclxuICAgIHZhciByZXNvbHZlZFxyXG5cclxuICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBudW1VcmxzOyBpbmRleCsrKSB7XHJcbiAgICAgIGEuaHJlZiA9IGFyZ3VtZW50c1tpbmRleF1cclxuICAgICAgcmVzb2x2ZWQgPSBhLmhyZWZcclxuICAgICAgYmFzZS5ocmVmID0gcmVzb2x2ZWRcclxuICAgIH1cclxuXHJcbiAgICBoZWFkLnJlbW92ZUNoaWxkKGJhc2UpXHJcblxyXG4gICAgcmV0dXJuIHJlc29sdmVkXHJcbiAgfVxyXG5cclxuICByZXR1cm4gcmVzb2x2ZVVybFxyXG5cclxufSkpO1xyXG4iLCIoZnVuY3Rpb24oc2VsZikge1xuICAndXNlIHN0cmljdCc7XG5cbiAgaWYgKHNlbGYuZmV0Y2gpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIHZhciBzdXBwb3J0ID0ge1xuICAgIHNlYXJjaFBhcmFtczogJ1VSTFNlYXJjaFBhcmFtcycgaW4gc2VsZixcbiAgICBpdGVyYWJsZTogJ1N5bWJvbCcgaW4gc2VsZiAmJiAnaXRlcmF0b3InIGluIFN5bWJvbCxcbiAgICBibG9iOiAnRmlsZVJlYWRlcicgaW4gc2VsZiAmJiAnQmxvYicgaW4gc2VsZiAmJiAoZnVuY3Rpb24oKSB7XG4gICAgICB0cnkge1xuICAgICAgICBuZXcgQmxvYigpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG4gICAgfSkoKSxcbiAgICBmb3JtRGF0YTogJ0Zvcm1EYXRhJyBpbiBzZWxmLFxuICAgIGFycmF5QnVmZmVyOiAnQXJyYXlCdWZmZXInIGluIHNlbGZcbiAgfVxuXG4gIGlmIChzdXBwb3J0LmFycmF5QnVmZmVyKSB7XG4gICAgdmFyIHZpZXdDbGFzc2VzID0gW1xuICAgICAgJ1tvYmplY3QgSW50OEFycmF5XScsXG4gICAgICAnW29iamVjdCBVaW50OEFycmF5XScsXG4gICAgICAnW29iamVjdCBVaW50OENsYW1wZWRBcnJheV0nLFxuICAgICAgJ1tvYmplY3QgSW50MTZBcnJheV0nLFxuICAgICAgJ1tvYmplY3QgVWludDE2QXJyYXldJyxcbiAgICAgICdbb2JqZWN0IEludDMyQXJyYXldJyxcbiAgICAgICdbb2JqZWN0IFVpbnQzMkFycmF5XScsXG4gICAgICAnW29iamVjdCBGbG9hdDMyQXJyYXldJyxcbiAgICAgICdbb2JqZWN0IEZsb2F0NjRBcnJheV0nXG4gICAgXVxuXG4gICAgdmFyIGlzRGF0YVZpZXcgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogJiYgRGF0YVZpZXcucHJvdG90eXBlLmlzUHJvdG90eXBlT2Yob2JqKVxuICAgIH1cblxuICAgIHZhciBpc0FycmF5QnVmZmVyVmlldyA9IEFycmF5QnVmZmVyLmlzVmlldyB8fCBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogJiYgdmlld0NsYXNzZXMuaW5kZXhPZihPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKSkgPiAtMVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZU5hbWUobmFtZSkge1xuICAgIGlmICh0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIG5hbWUgPSBTdHJpbmcobmFtZSlcbiAgICB9XG4gICAgaWYgKC9bXmEtejAtOVxcLSMkJSYnKisuXFxeX2B8fl0vaS50ZXN0KG5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGNoYXJhY3RlciBpbiBoZWFkZXIgZmllbGQgbmFtZScpXG4gICAgfVxuICAgIHJldHVybiBuYW1lLnRvTG93ZXJDYXNlKClcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHZhbHVlID0gU3RyaW5nKHZhbHVlKVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWVcbiAgfVxuXG4gIC8vIEJ1aWxkIGEgZGVzdHJ1Y3RpdmUgaXRlcmF0b3IgZm9yIHRoZSB2YWx1ZSBsaXN0XG4gIGZ1bmN0aW9uIGl0ZXJhdG9yRm9yKGl0ZW1zKSB7XG4gICAgdmFyIGl0ZXJhdG9yID0ge1xuICAgICAgbmV4dDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGl0ZW1zLnNoaWZ0KClcbiAgICAgICAgcmV0dXJuIHtkb25lOiB2YWx1ZSA9PT0gdW5kZWZpbmVkLCB2YWx1ZTogdmFsdWV9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN1cHBvcnQuaXRlcmFibGUpIHtcbiAgICAgIGl0ZXJhdG9yW1N5bWJvbC5pdGVyYXRvcl0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGl0ZXJhdG9yXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGl0ZXJhdG9yXG4gIH1cblxuICBmdW5jdGlvbiBIZWFkZXJzKGhlYWRlcnMpIHtcbiAgICB0aGlzLm1hcCA9IHt9XG5cbiAgICBpZiAoaGVhZGVycyBpbnN0YW5jZW9mIEhlYWRlcnMpIHtcbiAgICAgIGhlYWRlcnMuZm9yRWFjaChmdW5jdGlvbih2YWx1ZSwgbmFtZSkge1xuICAgICAgICB0aGlzLmFwcGVuZChuYW1lLCB2YWx1ZSlcbiAgICAgIH0sIHRoaXMpXG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGhlYWRlcnMpKSB7XG4gICAgICBoZWFkZXJzLmZvckVhY2goZnVuY3Rpb24oaGVhZGVyKSB7XG4gICAgICAgIHRoaXMuYXBwZW5kKGhlYWRlclswXSwgaGVhZGVyWzFdKVxuICAgICAgfSwgdGhpcylcbiAgICB9IGVsc2UgaWYgKGhlYWRlcnMpIHtcbiAgICAgIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGhlYWRlcnMpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICB0aGlzLmFwcGVuZChuYW1lLCBoZWFkZXJzW25hbWVdKVxuICAgICAgfSwgdGhpcylcbiAgICB9XG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuICAgIG5hbWUgPSBub3JtYWxpemVOYW1lKG5hbWUpXG4gICAgdmFsdWUgPSBub3JtYWxpemVWYWx1ZSh2YWx1ZSlcbiAgICB2YXIgb2xkVmFsdWUgPSB0aGlzLm1hcFtuYW1lXVxuICAgIHRoaXMubWFwW25hbWVdID0gb2xkVmFsdWUgPyBvbGRWYWx1ZSsnLCcrdmFsdWUgOiB2YWx1ZVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGVbJ2RlbGV0ZSddID0gZnVuY3Rpb24obmFtZSkge1xuICAgIGRlbGV0ZSB0aGlzLm1hcFtub3JtYWxpemVOYW1lKG5hbWUpXVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24obmFtZSkge1xuICAgIG5hbWUgPSBub3JtYWxpemVOYW1lKG5hbWUpXG4gICAgcmV0dXJuIHRoaXMuaGFzKG5hbWUpID8gdGhpcy5tYXBbbmFtZV0gOiBudWxsXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMubWFwLmhhc093blByb3BlcnR5KG5vcm1hbGl6ZU5hbWUobmFtZSkpXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuICAgIHRoaXMubWFwW25vcm1hbGl6ZU5hbWUobmFtZSldID0gbm9ybWFsaXplVmFsdWUodmFsdWUpXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5mb3JFYWNoID0gZnVuY3Rpb24oY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgICBmb3IgKHZhciBuYW1lIGluIHRoaXMubWFwKSB7XG4gICAgICBpZiAodGhpcy5tYXAuaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzQXJnLCB0aGlzLm1hcFtuYW1lXSwgbmFtZSwgdGhpcylcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5rZXlzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGl0ZW1zID0gW11cbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24odmFsdWUsIG5hbWUpIHsgaXRlbXMucHVzaChuYW1lKSB9KVxuICAgIHJldHVybiBpdGVyYXRvckZvcihpdGVtcylcbiAgfVxuXG4gIEhlYWRlcnMucHJvdG90eXBlLnZhbHVlcyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpdGVtcyA9IFtdXG4gICAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uKHZhbHVlKSB7IGl0ZW1zLnB1c2godmFsdWUpIH0pXG4gICAgcmV0dXJuIGl0ZXJhdG9yRm9yKGl0ZW1zKVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGUuZW50cmllcyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpdGVtcyA9IFtdXG4gICAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uKHZhbHVlLCBuYW1lKSB7IGl0ZW1zLnB1c2goW25hbWUsIHZhbHVlXSkgfSlcbiAgICByZXR1cm4gaXRlcmF0b3JGb3IoaXRlbXMpXG4gIH1cblxuICBpZiAoc3VwcG9ydC5pdGVyYWJsZSkge1xuICAgIEhlYWRlcnMucHJvdG90eXBlW1N5bWJvbC5pdGVyYXRvcl0gPSBIZWFkZXJzLnByb3RvdHlwZS5lbnRyaWVzXG4gIH1cblxuICBmdW5jdGlvbiBjb25zdW1lZChib2R5KSB7XG4gICAgaWYgKGJvZHkuYm9keVVzZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgVHlwZUVycm9yKCdBbHJlYWR5IHJlYWQnKSlcbiAgICB9XG4gICAgYm9keS5ib2R5VXNlZCA9IHRydWVcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbGVSZWFkZXJSZWFkeShyZWFkZXIpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZWFkZXIub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUocmVhZGVyLnJlc3VsdClcbiAgICAgIH1cbiAgICAgIHJlYWRlci5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChyZWFkZXIuZXJyb3IpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihibG9iKSB7XG4gICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKClcbiAgICB2YXIgcHJvbWlzZSA9IGZpbGVSZWFkZXJSZWFkeShyZWFkZXIpXG4gICAgcmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpXG4gICAgcmV0dXJuIHByb21pc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlYWRCbG9iQXNUZXh0KGJsb2IpIHtcbiAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKVxuICAgIHZhciBwcm9taXNlID0gZmlsZVJlYWRlclJlYWR5KHJlYWRlcilcbiAgICByZWFkZXIucmVhZEFzVGV4dChibG9iKVxuICAgIHJldHVybiBwcm9taXNlXG4gIH1cblxuICBmdW5jdGlvbiByZWFkQXJyYXlCdWZmZXJBc1RleHQoYnVmKSB7XG4gICAgdmFyIHZpZXcgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgdmFyIGNoYXJzID0gbmV3IEFycmF5KHZpZXcubGVuZ3RoKVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBjaGFyc1tpXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUodmlld1tpXSlcbiAgICB9XG4gICAgcmV0dXJuIGNoYXJzLmpvaW4oJycpXG4gIH1cblxuICBmdW5jdGlvbiBidWZmZXJDbG9uZShidWYpIHtcbiAgICBpZiAoYnVmLnNsaWNlKSB7XG4gICAgICByZXR1cm4gYnVmLnNsaWNlKDApXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciB2aWV3ID0gbmV3IFVpbnQ4QXJyYXkoYnVmLmJ5dGVMZW5ndGgpXG4gICAgICB2aWV3LnNldChuZXcgVWludDhBcnJheShidWYpKVxuICAgICAgcmV0dXJuIHZpZXcuYnVmZmVyXG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gQm9keSgpIHtcbiAgICB0aGlzLmJvZHlVc2VkID0gZmFsc2VcblxuICAgIHRoaXMuX2luaXRCb2R5ID0gZnVuY3Rpb24oYm9keSkge1xuICAgICAgdGhpcy5fYm9keUluaXQgPSBib2R5XG4gICAgICBpZiAoIWJvZHkpIHtcbiAgICAgICAgdGhpcy5fYm9keVRleHQgPSAnJ1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhpcy5fYm9keVRleHQgPSBib2R5XG4gICAgICB9IGVsc2UgaWYgKHN1cHBvcnQuYmxvYiAmJiBCbG9iLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpKSB7XG4gICAgICAgIHRoaXMuX2JvZHlCbG9iID0gYm9keVxuICAgICAgfSBlbHNlIGlmIChzdXBwb3J0LmZvcm1EYXRhICYmIEZvcm1EYXRhLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpKSB7XG4gICAgICAgIHRoaXMuX2JvZHlGb3JtRGF0YSA9IGJvZHlcbiAgICAgIH0gZWxzZSBpZiAoc3VwcG9ydC5zZWFyY2hQYXJhbXMgJiYgVVJMU2VhcmNoUGFyYW1zLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpKSB7XG4gICAgICAgIHRoaXMuX2JvZHlUZXh0ID0gYm9keS50b1N0cmluZygpXG4gICAgICB9IGVsc2UgaWYgKHN1cHBvcnQuYXJyYXlCdWZmZXIgJiYgc3VwcG9ydC5ibG9iICYmIGlzRGF0YVZpZXcoYm9keSkpIHtcbiAgICAgICAgdGhpcy5fYm9keUFycmF5QnVmZmVyID0gYnVmZmVyQ2xvbmUoYm9keS5idWZmZXIpXG4gICAgICAgIC8vIElFIDEwLTExIGNhbid0IGhhbmRsZSBhIERhdGFWaWV3IGJvZHkuXG4gICAgICAgIHRoaXMuX2JvZHlJbml0ID0gbmV3IEJsb2IoW3RoaXMuX2JvZHlBcnJheUJ1ZmZlcl0pXG4gICAgICB9IGVsc2UgaWYgKHN1cHBvcnQuYXJyYXlCdWZmZXIgJiYgKEFycmF5QnVmZmVyLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpIHx8IGlzQXJyYXlCdWZmZXJWaWV3KGJvZHkpKSkge1xuICAgICAgICB0aGlzLl9ib2R5QXJyYXlCdWZmZXIgPSBidWZmZXJDbG9uZShib2R5KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBCb2R5SW5pdCB0eXBlJylcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSkge1xuICAgICAgICBpZiAodHlwZW9mIGJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhpcy5oZWFkZXJzLnNldCgnY29udGVudC10eXBlJywgJ3RleHQvcGxhaW47Y2hhcnNldD1VVEYtOCcpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYm9keUJsb2IgJiYgdGhpcy5fYm9keUJsb2IudHlwZSkge1xuICAgICAgICAgIHRoaXMuaGVhZGVycy5zZXQoJ2NvbnRlbnQtdHlwZScsIHRoaXMuX2JvZHlCbG9iLnR5cGUpXG4gICAgICAgIH0gZWxzZSBpZiAoc3VwcG9ydC5zZWFyY2hQYXJhbXMgJiYgVVJMU2VhcmNoUGFyYW1zLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpKSB7XG4gICAgICAgICAgdGhpcy5oZWFkZXJzLnNldCgnY29udGVudC10eXBlJywgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDtjaGFyc2V0PVVURi04JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdXBwb3J0LmJsb2IpIHtcbiAgICAgIHRoaXMuYmxvYiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcmVqZWN0ZWQgPSBjb25zdW1lZCh0aGlzKVxuICAgICAgICBpZiAocmVqZWN0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0ZWRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9ib2R5QmxvYikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fYm9keUJsb2IpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYm9keUFycmF5QnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuZXcgQmxvYihbdGhpcy5fYm9keUFycmF5QnVmZmVyXSkpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYm9keUZvcm1EYXRhKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZCBub3QgcmVhZCBGb3JtRGF0YSBib2R5IGFzIGJsb2InKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEJsb2IoW3RoaXMuX2JvZHlUZXh0XSkpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5hcnJheUJ1ZmZlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fYm9keUFycmF5QnVmZmVyKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbnN1bWVkKHRoaXMpIHx8IFByb21pc2UucmVzb2x2ZSh0aGlzLl9ib2R5QXJyYXlCdWZmZXIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuYmxvYigpLnRoZW4ocmVhZEJsb2JBc0FycmF5QnVmZmVyKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy50ZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcmVqZWN0ZWQgPSBjb25zdW1lZCh0aGlzKVxuICAgICAgaWYgKHJlamVjdGVkKSB7XG4gICAgICAgIHJldHVybiByZWplY3RlZFxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fYm9keUJsb2IpIHtcbiAgICAgICAgcmV0dXJuIHJlYWRCbG9iQXNUZXh0KHRoaXMuX2JvZHlCbG9iKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLl9ib2R5QXJyYXlCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZWFkQXJyYXlCdWZmZXJBc1RleHQodGhpcy5fYm9keUFycmF5QnVmZmVyKSlcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fYm9keUZvcm1EYXRhKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignY291bGQgbm90IHJlYWQgRm9ybURhdGEgYm9keSBhcyB0ZXh0JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fYm9keVRleHQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN1cHBvcnQuZm9ybURhdGEpIHtcbiAgICAgIHRoaXMuZm9ybURhdGEgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGV4dCgpLnRoZW4oZGVjb2RlKVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuanNvbiA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMudGV4dCgpLnRoZW4oSlNPTi5wYXJzZSlcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgLy8gSFRUUCBtZXRob2RzIHdob3NlIGNhcGl0YWxpemF0aW9uIHNob3VsZCBiZSBub3JtYWxpemVkXG4gIHZhciBtZXRob2RzID0gWydERUxFVEUnLCAnR0VUJywgJ0hFQUQnLCAnT1BUSU9OUycsICdQT1NUJywgJ1BVVCddXG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplTWV0aG9kKG1ldGhvZCkge1xuICAgIHZhciB1cGNhc2VkID0gbWV0aG9kLnRvVXBwZXJDYXNlKClcbiAgICByZXR1cm4gKG1ldGhvZHMuaW5kZXhPZih1cGNhc2VkKSA+IC0xKSA/IHVwY2FzZWQgOiBtZXRob2RcbiAgfVxuXG4gIGZ1bmN0aW9uIFJlcXVlc3QoaW5wdXQsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIHZhciBib2R5ID0gb3B0aW9ucy5ib2R5XG5cbiAgICBpZiAoaW5wdXQgaW5zdGFuY2VvZiBSZXF1ZXN0KSB7XG4gICAgICBpZiAoaW5wdXQuYm9keVVzZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQWxyZWFkeSByZWFkJylcbiAgICAgIH1cbiAgICAgIHRoaXMudXJsID0gaW5wdXQudXJsXG4gICAgICB0aGlzLmNyZWRlbnRpYWxzID0gaW5wdXQuY3JlZGVudGlhbHNcbiAgICAgIGlmICghb3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRoaXMuaGVhZGVycyA9IG5ldyBIZWFkZXJzKGlucHV0LmhlYWRlcnMpXG4gICAgICB9XG4gICAgICB0aGlzLm1ldGhvZCA9IGlucHV0Lm1ldGhvZFxuICAgICAgdGhpcy5tb2RlID0gaW5wdXQubW9kZVxuICAgICAgaWYgKCFib2R5ICYmIGlucHV0Ll9ib2R5SW5pdCAhPSBudWxsKSB7XG4gICAgICAgIGJvZHkgPSBpbnB1dC5fYm9keUluaXRcbiAgICAgICAgaW5wdXQuYm9keVVzZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXJsID0gU3RyaW5nKGlucHV0KVxuICAgIH1cblxuICAgIHRoaXMuY3JlZGVudGlhbHMgPSBvcHRpb25zLmNyZWRlbnRpYWxzIHx8IHRoaXMuY3JlZGVudGlhbHMgfHwgJ29taXQnXG4gICAgaWYgKG9wdGlvbnMuaGVhZGVycyB8fCAhdGhpcy5oZWFkZXJzKSB7XG4gICAgICB0aGlzLmhlYWRlcnMgPSBuZXcgSGVhZGVycyhvcHRpb25zLmhlYWRlcnMpXG4gICAgfVxuICAgIHRoaXMubWV0aG9kID0gbm9ybWFsaXplTWV0aG9kKG9wdGlvbnMubWV0aG9kIHx8IHRoaXMubWV0aG9kIHx8ICdHRVQnKVxuICAgIHRoaXMubW9kZSA9IG9wdGlvbnMubW9kZSB8fCB0aGlzLm1vZGUgfHwgbnVsbFxuICAgIHRoaXMucmVmZXJyZXIgPSBudWxsXG5cbiAgICBpZiAoKHRoaXMubWV0aG9kID09PSAnR0VUJyB8fCB0aGlzLm1ldGhvZCA9PT0gJ0hFQUQnKSAmJiBib2R5KSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdCb2R5IG5vdCBhbGxvd2VkIGZvciBHRVQgb3IgSEVBRCByZXF1ZXN0cycpXG4gICAgfVxuICAgIHRoaXMuX2luaXRCb2R5KGJvZHkpXG4gIH1cblxuICBSZXF1ZXN0LnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgUmVxdWVzdCh0aGlzLCB7IGJvZHk6IHRoaXMuX2JvZHlJbml0IH0pXG4gIH1cblxuICBmdW5jdGlvbiBkZWNvZGUoYm9keSkge1xuICAgIHZhciBmb3JtID0gbmV3IEZvcm1EYXRhKClcbiAgICBib2R5LnRyaW0oKS5zcGxpdCgnJicpLmZvckVhY2goZnVuY3Rpb24oYnl0ZXMpIHtcbiAgICAgIGlmIChieXRlcykge1xuICAgICAgICB2YXIgc3BsaXQgPSBieXRlcy5zcGxpdCgnPScpXG4gICAgICAgIHZhciBuYW1lID0gc3BsaXQuc2hpZnQoKS5yZXBsYWNlKC9cXCsvZywgJyAnKVxuICAgICAgICB2YXIgdmFsdWUgPSBzcGxpdC5qb2luKCc9JykucmVwbGFjZSgvXFwrL2csICcgJylcbiAgICAgICAgZm9ybS5hcHBlbmQoZGVjb2RlVVJJQ29tcG9uZW50KG5hbWUpLCBkZWNvZGVVUklDb21wb25lbnQodmFsdWUpKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmV0dXJuIGZvcm1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlSGVhZGVycyhyYXdIZWFkZXJzKSB7XG4gICAgdmFyIGhlYWRlcnMgPSBuZXcgSGVhZGVycygpXG4gICAgcmF3SGVhZGVycy5zcGxpdCgvXFxyP1xcbi8pLmZvckVhY2goZnVuY3Rpb24obGluZSkge1xuICAgICAgdmFyIHBhcnRzID0gbGluZS5zcGxpdCgnOicpXG4gICAgICB2YXIga2V5ID0gcGFydHMuc2hpZnQoKS50cmltKClcbiAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gcGFydHMuam9pbignOicpLnRyaW0oKVxuICAgICAgICBoZWFkZXJzLmFwcGVuZChrZXksIHZhbHVlKVxuICAgICAgfVxuICAgIH0pXG4gICAgcmV0dXJuIGhlYWRlcnNcbiAgfVxuXG4gIEJvZHkuY2FsbChSZXF1ZXN0LnByb3RvdHlwZSlcblxuICBmdW5jdGlvbiBSZXNwb25zZShib2R5SW5pdCwgb3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IHt9XG4gICAgfVxuXG4gICAgdGhpcy50eXBlID0gJ2RlZmF1bHQnXG4gICAgdGhpcy5zdGF0dXMgPSAnc3RhdHVzJyBpbiBvcHRpb25zID8gb3B0aW9ucy5zdGF0dXMgOiAyMDBcbiAgICB0aGlzLm9rID0gdGhpcy5zdGF0dXMgPj0gMjAwICYmIHRoaXMuc3RhdHVzIDwgMzAwXG4gICAgdGhpcy5zdGF0dXNUZXh0ID0gJ3N0YXR1c1RleHQnIGluIG9wdGlvbnMgPyBvcHRpb25zLnN0YXR1c1RleHQgOiAnT0snXG4gICAgdGhpcy5oZWFkZXJzID0gbmV3IEhlYWRlcnMob3B0aW9ucy5oZWFkZXJzKVxuICAgIHRoaXMudXJsID0gb3B0aW9ucy51cmwgfHwgJydcbiAgICB0aGlzLl9pbml0Qm9keShib2R5SW5pdClcbiAgfVxuXG4gIEJvZHkuY2FsbChSZXNwb25zZS5wcm90b3R5cGUpXG5cbiAgUmVzcG9uc2UucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZSh0aGlzLl9ib2R5SW5pdCwge1xuICAgICAgc3RhdHVzOiB0aGlzLnN0YXR1cyxcbiAgICAgIHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCxcbiAgICAgIGhlYWRlcnM6IG5ldyBIZWFkZXJzKHRoaXMuaGVhZGVycyksXG4gICAgICB1cmw6IHRoaXMudXJsXG4gICAgfSlcbiAgfVxuXG4gIFJlc3BvbnNlLmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlc3BvbnNlID0gbmV3IFJlc3BvbnNlKG51bGwsIHtzdGF0dXM6IDAsIHN0YXR1c1RleHQ6ICcnfSlcbiAgICByZXNwb25zZS50eXBlID0gJ2Vycm9yJ1xuICAgIHJldHVybiByZXNwb25zZVxuICB9XG5cbiAgdmFyIHJlZGlyZWN0U3RhdHVzZXMgPSBbMzAxLCAzMDIsIDMwMywgMzA3LCAzMDhdXG5cbiAgUmVzcG9uc2UucmVkaXJlY3QgPSBmdW5jdGlvbih1cmwsIHN0YXR1cykge1xuICAgIGlmIChyZWRpcmVjdFN0YXR1c2VzLmluZGV4T2Yoc3RhdHVzKSA9PT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHN0YXR1cyBjb2RlJylcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHtzdGF0dXM6IHN0YXR1cywgaGVhZGVyczoge2xvY2F0aW9uOiB1cmx9fSlcbiAgfVxuXG4gIHNlbGYuSGVhZGVycyA9IEhlYWRlcnNcbiAgc2VsZi5SZXF1ZXN0ID0gUmVxdWVzdFxuICBzZWxmLlJlc3BvbnNlID0gUmVzcG9uc2VcblxuICBzZWxmLmZldGNoID0gZnVuY3Rpb24oaW5wdXQsIGluaXQpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICB2YXIgcmVxdWVzdCA9IG5ldyBSZXF1ZXN0KGlucHV0LCBpbml0KVxuICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpXG5cbiAgICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgc3RhdHVzOiB4aHIuc3RhdHVzLFxuICAgICAgICAgIHN0YXR1c1RleHQ6IHhoci5zdGF0dXNUZXh0LFxuICAgICAgICAgIGhlYWRlcnM6IHBhcnNlSGVhZGVycyh4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkgfHwgJycpXG4gICAgICAgIH1cbiAgICAgICAgb3B0aW9ucy51cmwgPSAncmVzcG9uc2VVUkwnIGluIHhociA/IHhoci5yZXNwb25zZVVSTCA6IG9wdGlvbnMuaGVhZGVycy5nZXQoJ1gtUmVxdWVzdC1VUkwnKVxuICAgICAgICB2YXIgYm9keSA9ICdyZXNwb25zZScgaW4geGhyID8geGhyLnJlc3BvbnNlIDogeGhyLnJlc3BvbnNlVGV4dFxuICAgICAgICByZXNvbHZlKG5ldyBSZXNwb25zZShib2R5LCBvcHRpb25zKSlcbiAgICAgIH1cblxuICAgICAgeGhyLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBUeXBlRXJyb3IoJ05ldHdvcmsgcmVxdWVzdCBmYWlsZWQnKSlcbiAgICAgIH1cblxuICAgICAgeGhyLm9udGltZW91dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QobmV3IFR5cGVFcnJvcignTmV0d29yayByZXF1ZXN0IGZhaWxlZCcpKVxuICAgICAgfVxuXG4gICAgICB4aHIub3BlbihyZXF1ZXN0Lm1ldGhvZCwgcmVxdWVzdC51cmwsIHRydWUpXG5cbiAgICAgIGlmIChyZXF1ZXN0LmNyZWRlbnRpYWxzID09PSAnaW5jbHVkZScpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKCdyZXNwb25zZVR5cGUnIGluIHhociAmJiBzdXBwb3J0LmJsb2IpIHtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdibG9iJ1xuICAgICAgfVxuXG4gICAgICByZXF1ZXN0LmhlYWRlcnMuZm9yRWFjaChmdW5jdGlvbih2YWx1ZSwgbmFtZSkge1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihuYW1lLCB2YWx1ZSlcbiAgICAgIH0pXG5cbiAgICAgIHhoci5zZW5kKHR5cGVvZiByZXF1ZXN0Ll9ib2R5SW5pdCA9PT0gJ3VuZGVmaW5lZCcgPyBudWxsIDogcmVxdWVzdC5fYm9keUluaXQpXG4gICAgfSlcbiAgfVxuICBzZWxmLmZldGNoLnBvbHlmaWxsID0gdHJ1ZVxufSkodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnID8gc2VsZiA6IHRoaXMpO1xuIiwidmFyIGJlbCA9IHJlcXVpcmUoJ2JlbCcpIC8vIHR1cm5zIHRlbXBsYXRlIHRhZyBpbnRvIERPTSBlbGVtZW50c1xudmFyIG1vcnBoZG9tID0gcmVxdWlyZSgnbW9ycGhkb20nKSAvLyBlZmZpY2llbnRseSBkaWZmcyArIG1vcnBocyB0d28gRE9NIGVsZW1lbnRzXG52YXIgZGVmYXVsdEV2ZW50cyA9IHJlcXVpcmUoJy4vdXBkYXRlLWV2ZW50cy5qcycpIC8vIGRlZmF1bHQgZXZlbnRzIHRvIGJlIGNvcGllZCB3aGVuIGRvbSBlbGVtZW50cyB1cGRhdGVcblxubW9kdWxlLmV4cG9ydHMgPSBiZWxcblxuLy8gVE9ETyBtb3ZlIHRoaXMgKyBkZWZhdWx0RXZlbnRzIHRvIGEgbmV3IG1vZHVsZSBvbmNlIHdlIHJlY2VpdmUgbW9yZSBmZWVkYmFja1xubW9kdWxlLmV4cG9ydHMudXBkYXRlID0gZnVuY3Rpb24gKGZyb21Ob2RlLCB0b05vZGUsIG9wdHMpIHtcbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cbiAgaWYgKG9wdHMuZXZlbnRzICE9PSBmYWxzZSkge1xuICAgIGlmICghb3B0cy5vbkJlZm9yZUVsVXBkYXRlZCkgb3B0cy5vbkJlZm9yZUVsVXBkYXRlZCA9IGNvcGllclxuICB9XG5cbiAgcmV0dXJuIG1vcnBoZG9tKGZyb21Ob2RlLCB0b05vZGUsIG9wdHMpXG5cbiAgLy8gbW9ycGhkb20gb25seSBjb3BpZXMgYXR0cmlidXRlcy4gd2UgZGVjaWRlZCB3ZSBhbHNvIHdhbnRlZCB0byBjb3B5IGV2ZW50c1xuICAvLyB0aGF0IGNhbiBiZSBzZXQgdmlhIGF0dHJpYnV0ZXNcbiAgZnVuY3Rpb24gY29waWVyIChmLCB0KSB7XG4gICAgLy8gY29weSBldmVudHM6XG4gICAgdmFyIGV2ZW50cyA9IG9wdHMuZXZlbnRzIHx8IGRlZmF1bHRFdmVudHNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGV2ID0gZXZlbnRzW2ldXG4gICAgICBpZiAodFtldl0pIHsgLy8gaWYgbmV3IGVsZW1lbnQgaGFzIGEgd2hpdGVsaXN0ZWQgYXR0cmlidXRlXG4gICAgICAgIGZbZXZdID0gdFtldl0gLy8gdXBkYXRlIGV4aXN0aW5nIGVsZW1lbnRcbiAgICAgIH0gZWxzZSBpZiAoZltldl0pIHsgLy8gaWYgZXhpc3RpbmcgZWxlbWVudCBoYXMgaXQgYW5kIG5ldyBvbmUgZG9lc250XG4gICAgICAgIGZbZXZdID0gdW5kZWZpbmVkIC8vIHJlbW92ZSBpdCBmcm9tIGV4aXN0aW5nIGVsZW1lbnRcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIG9sZFZhbHVlID0gZi52YWx1ZVxuICAgIHZhciBuZXdWYWx1ZSA9IHQudmFsdWVcbiAgICAvLyBjb3B5IHZhbHVlcyBmb3IgZm9ybSBlbGVtZW50c1xuICAgIGlmICgoZi5ub2RlTmFtZSA9PT0gJ0lOUFVUJyAmJiBmLnR5cGUgIT09ICdmaWxlJykgfHwgZi5ub2RlTmFtZSA9PT0gJ1NFTEVDVCcpIHtcbiAgICAgIGlmICghbmV3VmFsdWUpIHtcbiAgICAgICAgdC52YWx1ZSA9IGYudmFsdWVcbiAgICAgIH0gZWxzZSBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XG4gICAgICAgIGYudmFsdWUgPSBuZXdWYWx1ZVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZi5ub2RlTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgICAgaWYgKHQuZ2V0QXR0cmlidXRlKCd2YWx1ZScpID09PSBudWxsKSBmLnZhbHVlID0gdC52YWx1ZVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGRvY3VtZW50ID0gcmVxdWlyZSgnZ2xvYmFsL2RvY3VtZW50JylcbnZhciBoeXBlcnggPSByZXF1aXJlKCdoeXBlcngnKVxudmFyIG9ubG9hZCA9IHJlcXVpcmUoJ29uLWxvYWQnKVxuXG52YXIgU1ZHTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnXG52YXIgWExJTktOUyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJ1xuXG52YXIgQk9PTF9QUk9QUyA9IHtcbiAgYXV0b2ZvY3VzOiAxLFxuICBjaGVja2VkOiAxLFxuICBkZWZhdWx0Y2hlY2tlZDogMSxcbiAgZGlzYWJsZWQ6IDEsXG4gIGZvcm1ub3ZhbGlkYXRlOiAxLFxuICBpbmRldGVybWluYXRlOiAxLFxuICByZWFkb25seTogMSxcbiAgcmVxdWlyZWQ6IDEsXG4gIHNlbGVjdGVkOiAxLFxuICB3aWxsdmFsaWRhdGU6IDFcbn1cbnZhciBDT01NRU5UX1RBRyA9ICchLS0nXG52YXIgU1ZHX1RBR1MgPSBbXG4gICdzdmcnLFxuICAnYWx0R2x5cGgnLCAnYWx0R2x5cGhEZWYnLCAnYWx0R2x5cGhJdGVtJywgJ2FuaW1hdGUnLCAnYW5pbWF0ZUNvbG9yJyxcbiAgJ2FuaW1hdGVNb3Rpb24nLCAnYW5pbWF0ZVRyYW5zZm9ybScsICdjaXJjbGUnLCAnY2xpcFBhdGgnLCAnY29sb3ItcHJvZmlsZScsXG4gICdjdXJzb3InLCAnZGVmcycsICdkZXNjJywgJ2VsbGlwc2UnLCAnZmVCbGVuZCcsICdmZUNvbG9yTWF0cml4JyxcbiAgJ2ZlQ29tcG9uZW50VHJhbnNmZXInLCAnZmVDb21wb3NpdGUnLCAnZmVDb252b2x2ZU1hdHJpeCcsICdmZURpZmZ1c2VMaWdodGluZycsXG4gICdmZURpc3BsYWNlbWVudE1hcCcsICdmZURpc3RhbnRMaWdodCcsICdmZUZsb29kJywgJ2ZlRnVuY0EnLCAnZmVGdW5jQicsXG4gICdmZUZ1bmNHJywgJ2ZlRnVuY1InLCAnZmVHYXVzc2lhbkJsdXInLCAnZmVJbWFnZScsICdmZU1lcmdlJywgJ2ZlTWVyZ2VOb2RlJyxcbiAgJ2ZlTW9ycGhvbG9neScsICdmZU9mZnNldCcsICdmZVBvaW50TGlnaHQnLCAnZmVTcGVjdWxhckxpZ2h0aW5nJyxcbiAgJ2ZlU3BvdExpZ2h0JywgJ2ZlVGlsZScsICdmZVR1cmJ1bGVuY2UnLCAnZmlsdGVyJywgJ2ZvbnQnLCAnZm9udC1mYWNlJyxcbiAgJ2ZvbnQtZmFjZS1mb3JtYXQnLCAnZm9udC1mYWNlLW5hbWUnLCAnZm9udC1mYWNlLXNyYycsICdmb250LWZhY2UtdXJpJyxcbiAgJ2ZvcmVpZ25PYmplY3QnLCAnZycsICdnbHlwaCcsICdnbHlwaFJlZicsICdoa2VybicsICdpbWFnZScsICdsaW5lJyxcbiAgJ2xpbmVhckdyYWRpZW50JywgJ21hcmtlcicsICdtYXNrJywgJ21ldGFkYXRhJywgJ21pc3NpbmctZ2x5cGgnLCAnbXBhdGgnLFxuICAncGF0aCcsICdwYXR0ZXJuJywgJ3BvbHlnb24nLCAncG9seWxpbmUnLCAncmFkaWFsR3JhZGllbnQnLCAncmVjdCcsXG4gICdzZXQnLCAnc3RvcCcsICdzd2l0Y2gnLCAnc3ltYm9sJywgJ3RleHQnLCAndGV4dFBhdGgnLCAndGl0bGUnLCAndHJlZicsXG4gICd0c3BhbicsICd1c2UnLCAndmlldycsICd2a2Vybidcbl1cblxuZnVuY3Rpb24gYmVsQ3JlYXRlRWxlbWVudCAodGFnLCBwcm9wcywgY2hpbGRyZW4pIHtcbiAgdmFyIGVsXG5cbiAgLy8gSWYgYW4gc3ZnIHRhZywgaXQgbmVlZHMgYSBuYW1lc3BhY2VcbiAgaWYgKFNWR19UQUdTLmluZGV4T2YodGFnKSAhPT0gLTEpIHtcbiAgICBwcm9wcy5uYW1lc3BhY2UgPSBTVkdOU1xuICB9XG5cbiAgLy8gSWYgd2UgYXJlIHVzaW5nIGEgbmFtZXNwYWNlXG4gIHZhciBucyA9IGZhbHNlXG4gIGlmIChwcm9wcy5uYW1lc3BhY2UpIHtcbiAgICBucyA9IHByb3BzLm5hbWVzcGFjZVxuICAgIGRlbGV0ZSBwcm9wcy5uYW1lc3BhY2VcbiAgfVxuXG4gIC8vIENyZWF0ZSB0aGUgZWxlbWVudFxuICBpZiAobnMpIHtcbiAgICBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhucywgdGFnKVxuICB9IGVsc2UgaWYgKHRhZyA9PT0gQ09NTUVOVF9UQUcpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudChwcm9wcy5jb21tZW50KVxuICB9IGVsc2Uge1xuICAgIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpXG4gIH1cblxuICAvLyBJZiBhZGRpbmcgb25sb2FkIGV2ZW50c1xuICBpZiAocHJvcHMub25sb2FkIHx8IHByb3BzLm9udW5sb2FkKSB7XG4gICAgdmFyIGxvYWQgPSBwcm9wcy5vbmxvYWQgfHwgZnVuY3Rpb24gKCkge31cbiAgICB2YXIgdW5sb2FkID0gcHJvcHMub251bmxvYWQgfHwgZnVuY3Rpb24gKCkge31cbiAgICBvbmxvYWQoZWwsIGZ1bmN0aW9uIGJlbE9ubG9hZCAoKSB7XG4gICAgICBsb2FkKGVsKVxuICAgIH0sIGZ1bmN0aW9uIGJlbE9udW5sb2FkICgpIHtcbiAgICAgIHVubG9hZChlbClcbiAgICB9LFxuICAgIC8vIFdlIGhhdmUgdG8gdXNlIG5vbi1zdGFuZGFyZCBgY2FsbGVyYCB0byBmaW5kIHdobyBpbnZva2VzIGBiZWxDcmVhdGVFbGVtZW50YFxuICAgIGJlbENyZWF0ZUVsZW1lbnQuY2FsbGVyLmNhbGxlci5jYWxsZXIpXG4gICAgZGVsZXRlIHByb3BzLm9ubG9hZFxuICAgIGRlbGV0ZSBwcm9wcy5vbnVubG9hZFxuICB9XG5cbiAgLy8gQ3JlYXRlIHRoZSBwcm9wZXJ0aWVzXG4gIGZvciAodmFyIHAgaW4gcHJvcHMpIHtcbiAgICBpZiAocHJvcHMuaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgIHZhciBrZXkgPSBwLnRvTG93ZXJDYXNlKClcbiAgICAgIHZhciB2YWwgPSBwcm9wc1twXVxuICAgICAgLy8gTm9ybWFsaXplIGNsYXNzTmFtZVxuICAgICAgaWYgKGtleSA9PT0gJ2NsYXNzbmFtZScpIHtcbiAgICAgICAga2V5ID0gJ2NsYXNzJ1xuICAgICAgICBwID0gJ2NsYXNzJ1xuICAgICAgfVxuICAgICAgLy8gVGhlIGZvciBhdHRyaWJ1dGUgZ2V0cyB0cmFuc2Zvcm1lZCB0byBodG1sRm9yLCBidXQgd2UganVzdCBzZXQgYXMgZm9yXG4gICAgICBpZiAocCA9PT0gJ2h0bWxGb3InKSB7XG4gICAgICAgIHAgPSAnZm9yJ1xuICAgICAgfVxuICAgICAgLy8gSWYgYSBwcm9wZXJ0eSBpcyBib29sZWFuLCBzZXQgaXRzZWxmIHRvIHRoZSBrZXlcbiAgICAgIGlmIChCT09MX1BST1BTW2tleV0pIHtcbiAgICAgICAgaWYgKHZhbCA9PT0gJ3RydWUnKSB2YWwgPSBrZXlcbiAgICAgICAgZWxzZSBpZiAodmFsID09PSAnZmFsc2UnKSBjb250aW51ZVxuICAgICAgfVxuICAgICAgLy8gSWYgYSBwcm9wZXJ0eSBwcmVmZXJzIGJlaW5nIHNldCBkaXJlY3RseSB2cyBzZXRBdHRyaWJ1dGVcbiAgICAgIGlmIChrZXkuc2xpY2UoMCwgMikgPT09ICdvbicpIHtcbiAgICAgICAgZWxbcF0gPSB2YWxcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChucykge1xuICAgICAgICAgIGlmIChwID09PSAneGxpbms6aHJlZicpIHtcbiAgICAgICAgICAgIGVsLnNldEF0dHJpYnV0ZU5TKFhMSU5LTlMsIHAsIHZhbClcbiAgICAgICAgICB9IGVsc2UgaWYgKC9eeG1sbnMoJHw6KS9pLnRlc3QocCkpIHtcbiAgICAgICAgICAgIC8vIHNraXAgeG1sbnMgZGVmaW5pdGlvbnNcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwuc2V0QXR0cmlidXRlTlMobnVsbCwgcCwgdmFsKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBlbC5zZXRBdHRyaWJ1dGUocCwgdmFsKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYXBwZW5kQ2hpbGQgKGNoaWxkcykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShjaGlsZHMpKSByZXR1cm5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG5vZGUgPSBjaGlsZHNbaV1cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUpKSB7XG4gICAgICAgIGFwcGVuZENoaWxkKG5vZGUpXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2Ygbm9kZSA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgdHlwZW9mIG5vZGUgPT09ICdib29sZWFuJyB8fFxuICAgICAgICB0eXBlb2Ygbm9kZSA9PT0gJ2Z1bmN0aW9uJyB8fFxuICAgICAgICBub2RlIGluc3RhbmNlb2YgRGF0ZSB8fFxuICAgICAgICBub2RlIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgIG5vZGUgPSBub2RlLnRvU3RyaW5nKClcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoL15bXFxuXFxyXFxzXSskLy50ZXN0KG5vZGUpKSBjb250aW51ZVxuICAgICAgICBpZiAoZWwubGFzdENoaWxkICYmIGVsLmxhc3RDaGlsZC5ub2RlTmFtZSA9PT0gJyN0ZXh0Jykge1xuICAgICAgICAgIGVsLmxhc3RDaGlsZC5ub2RlVmFsdWUgKz0gbm9kZVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG5vZGUpXG4gICAgICB9XG5cbiAgICAgIGlmIChub2RlICYmIG5vZGUubm9kZVR5cGUpIHtcbiAgICAgICAgZWwuYXBwZW5kQ2hpbGQobm9kZSlcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgYXBwZW5kQ2hpbGQoY2hpbGRyZW4pXG5cbiAgcmV0dXJuIGVsXG59XG5cbm1vZHVsZS5leHBvcnRzID0gaHlwZXJ4KGJlbENyZWF0ZUVsZW1lbnQsIHtjb21tZW50czogdHJ1ZX0pXG5tb2R1bGUuZXhwb3J0cy5kZWZhdWx0ID0gbW9kdWxlLmV4cG9ydHNcbm1vZHVsZS5leHBvcnRzLmNyZWF0ZUVsZW1lbnQgPSBiZWxDcmVhdGVFbGVtZW50XG4iLCJ2YXIgdG9wTGV2ZWwgPSB0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJyA/IGdsb2JhbCA6XG4gICAgdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB7fVxudmFyIG1pbkRvYyA9IHJlcXVpcmUoJ21pbi1kb2N1bWVudCcpO1xuXG52YXIgZG9jY3k7XG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZG9jY3kgPSBkb2N1bWVudDtcbn0gZWxzZSB7XG4gICAgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddO1xuXG4gICAgaWYgKCFkb2NjeSkge1xuICAgICAgICBkb2NjeSA9IHRvcExldmVsWydfX0dMT0JBTF9ET0NVTUVOVF9DQUNIRUA0J10gPSBtaW5Eb2M7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRvY2N5O1xuIiwidmFyIGF0dHJUb1Byb3AgPSByZXF1aXJlKCdoeXBlcnNjcmlwdC1hdHRyaWJ1dGUtdG8tcHJvcGVydHknKVxuXG52YXIgVkFSID0gMCwgVEVYVCA9IDEsIE9QRU4gPSAyLCBDTE9TRSA9IDMsIEFUVFIgPSA0XG52YXIgQVRUUl9LRVkgPSA1LCBBVFRSX0tFWV9XID0gNlxudmFyIEFUVFJfVkFMVUVfVyA9IDcsIEFUVFJfVkFMVUUgPSA4XG52YXIgQVRUUl9WQUxVRV9TUSA9IDksIEFUVFJfVkFMVUVfRFEgPSAxMFxudmFyIEFUVFJfRVEgPSAxMSwgQVRUUl9CUkVBSyA9IDEyXG52YXIgQ09NTUVOVCA9IDEzXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGgsIG9wdHMpIHtcbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cbiAgdmFyIGNvbmNhdCA9IG9wdHMuY29uY2F0IHx8IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgcmV0dXJuIFN0cmluZyhhKSArIFN0cmluZyhiKVxuICB9XG4gIGlmIChvcHRzLmF0dHJUb1Byb3AgIT09IGZhbHNlKSB7XG4gICAgaCA9IGF0dHJUb1Byb3AoaClcbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbiAoc3RyaW5ncykge1xuICAgIHZhciBzdGF0ZSA9IFRFWFQsIHJlZyA9ICcnXG4gICAgdmFyIGFyZ2xlbiA9IGFyZ3VtZW50cy5sZW5ndGhcbiAgICB2YXIgcGFydHMgPSBbXVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHJpbmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoaSA8IGFyZ2xlbiAtIDEpIHtcbiAgICAgICAgdmFyIGFyZyA9IGFyZ3VtZW50c1tpKzFdXG4gICAgICAgIHZhciBwID0gcGFyc2Uoc3RyaW5nc1tpXSlcbiAgICAgICAgdmFyIHhzdGF0ZSA9IHN0YXRlXG4gICAgICAgIGlmICh4c3RhdGUgPT09IEFUVFJfVkFMVUVfRFEpIHhzdGF0ZSA9IEFUVFJfVkFMVUVcbiAgICAgICAgaWYgKHhzdGF0ZSA9PT0gQVRUUl9WQUxVRV9TUSkgeHN0YXRlID0gQVRUUl9WQUxVRVxuICAgICAgICBpZiAoeHN0YXRlID09PSBBVFRSX1ZBTFVFX1cpIHhzdGF0ZSA9IEFUVFJfVkFMVUVcbiAgICAgICAgaWYgKHhzdGF0ZSA9PT0gQVRUUikgeHN0YXRlID0gQVRUUl9LRVlcbiAgICAgICAgcC5wdXNoKFsgVkFSLCB4c3RhdGUsIGFyZyBdKVxuICAgICAgICBwYXJ0cy5wdXNoLmFwcGx5KHBhcnRzLCBwKVxuICAgICAgfSBlbHNlIHBhcnRzLnB1c2guYXBwbHkocGFydHMsIHBhcnNlKHN0cmluZ3NbaV0pKVxuICAgIH1cblxuICAgIHZhciB0cmVlID0gW251bGwse30sW11dXG4gICAgdmFyIHN0YWNrID0gW1t0cmVlLC0xXV1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgY3VyID0gc3RhY2tbc3RhY2subGVuZ3RoLTFdWzBdXG4gICAgICB2YXIgcCA9IHBhcnRzW2ldLCBzID0gcFswXVxuICAgICAgaWYgKHMgPT09IE9QRU4gJiYgL15cXC8vLnRlc3QocFsxXSkpIHtcbiAgICAgICAgdmFyIGl4ID0gc3RhY2tbc3RhY2subGVuZ3RoLTFdWzFdXG4gICAgICAgIGlmIChzdGFjay5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgc3RhY2sucG9wKClcbiAgICAgICAgICBzdGFja1tzdGFjay5sZW5ndGgtMV1bMF1bMl1baXhdID0gaChcbiAgICAgICAgICAgIGN1clswXSwgY3VyWzFdLCBjdXJbMl0ubGVuZ3RoID8gY3VyWzJdIDogdW5kZWZpbmVkXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHMgPT09IE9QRU4pIHtcbiAgICAgICAgdmFyIGMgPSBbcFsxXSx7fSxbXV1cbiAgICAgICAgY3VyWzJdLnB1c2goYylcbiAgICAgICAgc3RhY2sucHVzaChbYyxjdXJbMl0ubGVuZ3RoLTFdKVxuICAgICAgfSBlbHNlIGlmIChzID09PSBBVFRSX0tFWSB8fCAocyA9PT0gVkFSICYmIHBbMV0gPT09IEFUVFJfS0VZKSkge1xuICAgICAgICB2YXIga2V5ID0gJydcbiAgICAgICAgdmFyIGNvcHlLZXlcbiAgICAgICAgZm9yICg7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmIChwYXJ0c1tpXVswXSA9PT0gQVRUUl9LRVkpIHtcbiAgICAgICAgICAgIGtleSA9IGNvbmNhdChrZXksIHBhcnRzW2ldWzFdKVxuICAgICAgICAgIH0gZWxzZSBpZiAocGFydHNbaV1bMF0gPT09IFZBUiAmJiBwYXJ0c1tpXVsxXSA9PT0gQVRUUl9LRVkpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcGFydHNbaV1bMl0gPT09ICdvYmplY3QnICYmICFrZXkpIHtcbiAgICAgICAgICAgICAgZm9yIChjb3B5S2V5IGluIHBhcnRzW2ldWzJdKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBhcnRzW2ldWzJdLmhhc093blByb3BlcnR5KGNvcHlLZXkpICYmICFjdXJbMV1bY29weUtleV0pIHtcbiAgICAgICAgICAgICAgICAgIGN1clsxXVtjb3B5S2V5XSA9IHBhcnRzW2ldWzJdW2NvcHlLZXldXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBrZXkgPSBjb25jYXQoa2V5LCBwYXJ0c1tpXVsyXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgYnJlYWtcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFydHNbaV1bMF0gPT09IEFUVFJfRVEpIGkrK1xuICAgICAgICB2YXIgaiA9IGlcbiAgICAgICAgZm9yICg7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmIChwYXJ0c1tpXVswXSA9PT0gQVRUUl9WQUxVRSB8fCBwYXJ0c1tpXVswXSA9PT0gQVRUUl9LRVkpIHtcbiAgICAgICAgICAgIGlmICghY3VyWzFdW2tleV0pIGN1clsxXVtrZXldID0gc3RyZm4ocGFydHNbaV1bMV0pXG4gICAgICAgICAgICBlbHNlIGN1clsxXVtrZXldID0gY29uY2F0KGN1clsxXVtrZXldLCBwYXJ0c1tpXVsxXSlcbiAgICAgICAgICB9IGVsc2UgaWYgKHBhcnRzW2ldWzBdID09PSBWQVJcbiAgICAgICAgICAmJiAocGFydHNbaV1bMV0gPT09IEFUVFJfVkFMVUUgfHwgcGFydHNbaV1bMV0gPT09IEFUVFJfS0VZKSkge1xuICAgICAgICAgICAgaWYgKCFjdXJbMV1ba2V5XSkgY3VyWzFdW2tleV0gPSBzdHJmbihwYXJ0c1tpXVsyXSlcbiAgICAgICAgICAgIGVsc2UgY3VyWzFdW2tleV0gPSBjb25jYXQoY3VyWzFdW2tleV0sIHBhcnRzW2ldWzJdKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoa2V5Lmxlbmd0aCAmJiAhY3VyWzFdW2tleV0gJiYgaSA9PT0galxuICAgICAgICAgICAgJiYgKHBhcnRzW2ldWzBdID09PSBDTE9TRSB8fCBwYXJ0c1tpXVswXSA9PT0gQVRUUl9CUkVBSykpIHtcbiAgICAgICAgICAgICAgLy8gaHR0cHM6Ly9odG1sLnNwZWMud2hhdHdnLm9yZy9tdWx0aXBhZ2UvaW5mcmFzdHJ1Y3R1cmUuaHRtbCNib29sZWFuLWF0dHJpYnV0ZXNcbiAgICAgICAgICAgICAgLy8gZW1wdHkgc3RyaW5nIGlzIGZhbHN5LCBub3Qgd2VsbCBiZWhhdmVkIHZhbHVlIGluIGJyb3dzZXJcbiAgICAgICAgICAgICAgY3VyWzFdW2tleV0gPSBrZXkudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gQVRUUl9LRVkpIHtcbiAgICAgICAgY3VyWzFdW3BbMV1dID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChzID09PSBWQVIgJiYgcFsxXSA9PT0gQVRUUl9LRVkpIHtcbiAgICAgICAgY3VyWzFdW3BbMl1dID0gdHJ1ZVxuICAgICAgfSBlbHNlIGlmIChzID09PSBDTE9TRSkge1xuICAgICAgICBpZiAoc2VsZkNsb3NpbmcoY3VyWzBdKSAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICB2YXIgaXggPSBzdGFja1tzdGFjay5sZW5ndGgtMV1bMV1cbiAgICAgICAgICBzdGFjay5wb3AoKVxuICAgICAgICAgIHN0YWNrW3N0YWNrLmxlbmd0aC0xXVswXVsyXVtpeF0gPSBoKFxuICAgICAgICAgICAgY3VyWzBdLCBjdXJbMV0sIGN1clsyXS5sZW5ndGggPyBjdXJbMl0gOiB1bmRlZmluZWRcbiAgICAgICAgICApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gVkFSICYmIHBbMV0gPT09IFRFWFQpIHtcbiAgICAgICAgaWYgKHBbMl0gPT09IHVuZGVmaW5lZCB8fCBwWzJdID09PSBudWxsKSBwWzJdID0gJydcbiAgICAgICAgZWxzZSBpZiAoIXBbMl0pIHBbMl0gPSBjb25jYXQoJycsIHBbMl0pXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBbMl1bMF0pKSB7XG4gICAgICAgICAgY3VyWzJdLnB1c2guYXBwbHkoY3VyWzJdLCBwWzJdKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGN1clsyXS5wdXNoKHBbMl0pXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gVEVYVCkge1xuICAgICAgICBjdXJbMl0ucHVzaChwWzFdKVxuICAgICAgfSBlbHNlIGlmIChzID09PSBBVFRSX0VRIHx8IHMgPT09IEFUVFJfQlJFQUspIHtcbiAgICAgICAgLy8gbm8tb3BcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigndW5oYW5kbGVkOiAnICsgcylcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHJlZVsyXS5sZW5ndGggPiAxICYmIC9eXFxzKiQvLnRlc3QodHJlZVsyXVswXSkpIHtcbiAgICAgIHRyZWVbMl0uc2hpZnQoKVxuICAgIH1cblxuICAgIGlmICh0cmVlWzJdLmxlbmd0aCA+IDJcbiAgICB8fCAodHJlZVsyXS5sZW5ndGggPT09IDIgJiYgL1xcUy8udGVzdCh0cmVlWzJdWzFdKSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ211bHRpcGxlIHJvb3QgZWxlbWVudHMgbXVzdCBiZSB3cmFwcGVkIGluIGFuIGVuY2xvc2luZyB0YWcnXG4gICAgICApXG4gICAgfVxuICAgIGlmIChBcnJheS5pc0FycmF5KHRyZWVbMl1bMF0pICYmIHR5cGVvZiB0cmVlWzJdWzBdWzBdID09PSAnc3RyaW5nJ1xuICAgICYmIEFycmF5LmlzQXJyYXkodHJlZVsyXVswXVsyXSkpIHtcbiAgICAgIHRyZWVbMl1bMF0gPSBoKHRyZWVbMl1bMF1bMF0sIHRyZWVbMl1bMF1bMV0sIHRyZWVbMl1bMF1bMl0pXG4gICAgfVxuICAgIHJldHVybiB0cmVlWzJdWzBdXG5cbiAgICBmdW5jdGlvbiBwYXJzZSAoc3RyKSB7XG4gICAgICB2YXIgcmVzID0gW11cbiAgICAgIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9XKSBzdGF0ZSA9IEFUVFJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjID0gc3RyLmNoYXJBdChpKVxuICAgICAgICBpZiAoc3RhdGUgPT09IFRFWFQgJiYgYyA9PT0gJzwnKSB7XG4gICAgICAgICAgaWYgKHJlZy5sZW5ndGgpIHJlcy5wdXNoKFtURVhULCByZWddKVxuICAgICAgICAgIHJlZyA9ICcnXG4gICAgICAgICAgc3RhdGUgPSBPUEVOXG4gICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gJz4nICYmICFxdW90KHN0YXRlKSAmJiBzdGF0ZSAhPT0gQ09NTUVOVCkge1xuICAgICAgICAgIGlmIChzdGF0ZSA9PT0gT1BFTikge1xuICAgICAgICAgICAgcmVzLnB1c2goW09QRU4scmVnXSlcbiAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX0tFWSkge1xuICAgICAgICAgICAgcmVzLnB1c2goW0FUVFJfS0VZLHJlZ10pXG4gICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRSAmJiByZWcubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXMucHVzaChbQVRUUl9WQUxVRSxyZWddKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXMucHVzaChbQ0xPU0VdKVxuICAgICAgICAgIHJlZyA9ICcnXG4gICAgICAgICAgc3RhdGUgPSBURVhUXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IENPTU1FTlQgJiYgLy0kLy50ZXN0KHJlZykgJiYgYyA9PT0gJy0nKSB7XG4gICAgICAgICAgaWYgKG9wdHMuY29tbWVudHMpIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX1ZBTFVFLHJlZy5zdWJzdHIoMCwgcmVnLmxlbmd0aCAtIDEpXSxbQ0xPU0VdKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gVEVYVFxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBPUEVOICYmIC9eIS0tJC8udGVzdChyZWcpKSB7XG4gICAgICAgICAgaWYgKG9wdHMuY29tbWVudHMpIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKFtPUEVOLCByZWddLFtBVFRSX0tFWSwnY29tbWVudCddLFtBVFRSX0VRXSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVnID0gY1xuICAgICAgICAgIHN0YXRlID0gQ09NTUVOVFxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBURVhUIHx8IHN0YXRlID09PSBDT01NRU5UKSB7XG4gICAgICAgICAgcmVnICs9IGNcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gT1BFTiAmJiAvXFxzLy50ZXN0KGMpKSB7XG4gICAgICAgICAgcmVzLnB1c2goW09QRU4sIHJlZ10pXG4gICAgICAgICAgcmVnID0gJydcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gT1BFTikge1xuICAgICAgICAgIHJlZyArPSBjXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFIgJiYgL1teXFxzXCInPS9dLy50ZXN0KGMpKSB7XG4gICAgICAgICAgc3RhdGUgPSBBVFRSX0tFWVxuICAgICAgICAgIHJlZyA9IGNcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUiAmJiAvXFxzLy50ZXN0KGMpKSB7XG4gICAgICAgICAgaWYgKHJlZy5sZW5ndGgpIHJlcy5wdXNoKFtBVFRSX0tFWSxyZWddKVxuICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX0JSRUFLXSlcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9LRVkgJiYgL1xccy8udGVzdChjKSkge1xuICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX0tFWSxyZWddKVxuICAgICAgICAgIHJlZyA9ICcnXG4gICAgICAgICAgc3RhdGUgPSBBVFRSX0tFWV9XXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfS0VZICYmIGMgPT09ICc9Jykge1xuICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX0tFWSxyZWddLFtBVFRSX0VRXSlcbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gQVRUUl9WQUxVRV9XXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfS0VZKSB7XG4gICAgICAgICAgcmVnICs9IGNcbiAgICAgICAgfSBlbHNlIGlmICgoc3RhdGUgPT09IEFUVFJfS0VZX1cgfHwgc3RhdGUgPT09IEFUVFIpICYmIGMgPT09ICc9Jykge1xuICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX0VRXSlcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJfVkFMVUVfV1xuICAgICAgICB9IGVsc2UgaWYgKChzdGF0ZSA9PT0gQVRUUl9LRVlfVyB8fCBzdGF0ZSA9PT0gQVRUUikgJiYgIS9cXHMvLnRlc3QoYykpIHtcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9CUkVBS10pXG4gICAgICAgICAgaWYgKC9bXFx3LV0vLnRlc3QoYykpIHtcbiAgICAgICAgICAgIHJlZyArPSBjXG4gICAgICAgICAgICBzdGF0ZSA9IEFUVFJfS0VZXG4gICAgICAgICAgfSBlbHNlIHN0YXRlID0gQVRUUlxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFX1cgJiYgYyA9PT0gJ1wiJykge1xuICAgICAgICAgIHN0YXRlID0gQVRUUl9WQUxVRV9EUVxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFX1cgJiYgYyA9PT0gXCInXCIpIHtcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJfVkFMVUVfU1FcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9EUSAmJiBjID09PSAnXCInKSB7XG4gICAgICAgICAgcmVzLnB1c2goW0FUVFJfVkFMVUUscmVnXSxbQVRUUl9CUkVBS10pXG4gICAgICAgICAgcmVnID0gJydcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9TUSAmJiBjID09PSBcIidcIikge1xuICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX1ZBTFVFLHJlZ10sW0FUVFJfQlJFQUtdKVxuICAgICAgICAgIHJlZyA9ICcnXG4gICAgICAgICAgc3RhdGUgPSBBVFRSXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUVfVyAmJiAhL1xccy8udGVzdChjKSkge1xuICAgICAgICAgIHN0YXRlID0gQVRUUl9WQUxVRVxuICAgICAgICAgIGktLVxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFICYmIC9cXHMvLnRlc3QoYykpIHtcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9WQUxVRSxyZWddLFtBVFRSX0JSRUFLXSlcbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gQVRUUlxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFIHx8IHN0YXRlID09PSBBVFRSX1ZBTFVFX1NRXG4gICAgICAgIHx8IHN0YXRlID09PSBBVFRSX1ZBTFVFX0RRKSB7XG4gICAgICAgICAgcmVnICs9IGNcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YXRlID09PSBURVhUICYmIHJlZy5sZW5ndGgpIHtcbiAgICAgICAgcmVzLnB1c2goW1RFWFQscmVnXSlcbiAgICAgICAgcmVnID0gJydcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUUgJiYgcmVnLmxlbmd0aCkge1xuICAgICAgICByZXMucHVzaChbQVRUUl9WQUxVRSxyZWddKVxuICAgICAgICByZWcgPSAnJ1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9EUSAmJiByZWcubGVuZ3RoKSB7XG4gICAgICAgIHJlcy5wdXNoKFtBVFRSX1ZBTFVFLHJlZ10pXG4gICAgICAgIHJlZyA9ICcnXG4gICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFX1NRICYmIHJlZy5sZW5ndGgpIHtcbiAgICAgICAgcmVzLnB1c2goW0FUVFJfVkFMVUUscmVnXSlcbiAgICAgICAgcmVnID0gJydcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfS0VZKSB7XG4gICAgICAgIHJlcy5wdXNoKFtBVFRSX0tFWSxyZWddKVxuICAgICAgICByZWcgPSAnJ1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0cmZuICh4KSB7XG4gICAgaWYgKHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nKSByZXR1cm4geFxuICAgIGVsc2UgaWYgKHR5cGVvZiB4ID09PSAnc3RyaW5nJykgcmV0dXJuIHhcbiAgICBlbHNlIGlmICh4ICYmIHR5cGVvZiB4ID09PSAnb2JqZWN0JykgcmV0dXJuIHhcbiAgICBlbHNlIHJldHVybiBjb25jYXQoJycsIHgpXG4gIH1cbn1cblxuZnVuY3Rpb24gcXVvdCAoc3RhdGUpIHtcbiAgcmV0dXJuIHN0YXRlID09PSBBVFRSX1ZBTFVFX1NRIHx8IHN0YXRlID09PSBBVFRSX1ZBTFVFX0RRXG59XG5cbnZhciBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5XG5mdW5jdGlvbiBoYXMgKG9iaiwga2V5KSB7IHJldHVybiBoYXNPd24uY2FsbChvYmosIGtleSkgfVxuXG52YXIgY2xvc2VSRSA9IFJlZ0V4cCgnXignICsgW1xuICAnYXJlYScsICdiYXNlJywgJ2Jhc2Vmb250JywgJ2Jnc291bmQnLCAnYnInLCAnY29sJywgJ2NvbW1hbmQnLCAnZW1iZWQnLFxuICAnZnJhbWUnLCAnaHInLCAnaW1nJywgJ2lucHV0JywgJ2lzaW5kZXgnLCAna2V5Z2VuJywgJ2xpbmsnLCAnbWV0YScsICdwYXJhbScsXG4gICdzb3VyY2UnLCAndHJhY2snLCAnd2JyJywgJyEtLScsXG4gIC8vIFNWRyBUQUdTXG4gICdhbmltYXRlJywgJ2FuaW1hdGVUcmFuc2Zvcm0nLCAnY2lyY2xlJywgJ2N1cnNvcicsICdkZXNjJywgJ2VsbGlwc2UnLFxuICAnZmVCbGVuZCcsICdmZUNvbG9yTWF0cml4JywgJ2ZlQ29tcG9zaXRlJyxcbiAgJ2ZlQ29udm9sdmVNYXRyaXgnLCAnZmVEaWZmdXNlTGlnaHRpbmcnLCAnZmVEaXNwbGFjZW1lbnRNYXAnLFxuICAnZmVEaXN0YW50TGlnaHQnLCAnZmVGbG9vZCcsICdmZUZ1bmNBJywgJ2ZlRnVuY0InLCAnZmVGdW5jRycsICdmZUZ1bmNSJyxcbiAgJ2ZlR2F1c3NpYW5CbHVyJywgJ2ZlSW1hZ2UnLCAnZmVNZXJnZU5vZGUnLCAnZmVNb3JwaG9sb2d5JyxcbiAgJ2ZlT2Zmc2V0JywgJ2ZlUG9pbnRMaWdodCcsICdmZVNwZWN1bGFyTGlnaHRpbmcnLCAnZmVTcG90TGlnaHQnLCAnZmVUaWxlJyxcbiAgJ2ZlVHVyYnVsZW5jZScsICdmb250LWZhY2UtZm9ybWF0JywgJ2ZvbnQtZmFjZS1uYW1lJywgJ2ZvbnQtZmFjZS11cmknLFxuICAnZ2x5cGgnLCAnZ2x5cGhSZWYnLCAnaGtlcm4nLCAnaW1hZ2UnLCAnbGluZScsICdtaXNzaW5nLWdseXBoJywgJ21wYXRoJyxcbiAgJ3BhdGgnLCAncG9seWdvbicsICdwb2x5bGluZScsICdyZWN0JywgJ3NldCcsICdzdG9wJywgJ3RyZWYnLCAndXNlJywgJ3ZpZXcnLFxuICAndmtlcm4nXG5dLmpvaW4oJ3wnKSArICcpKD86W1xcLiNdW2EtekEtWjAtOVxcdTAwN0YtXFx1RkZGRl86LV0rKSokJylcbmZ1bmN0aW9uIHNlbGZDbG9zaW5nICh0YWcpIHsgcmV0dXJuIGNsb3NlUkUudGVzdCh0YWcpIH1cbiIsIm1vZHVsZS5leHBvcnRzID0gYXR0cmlidXRlVG9Qcm9wZXJ0eVxuXG52YXIgdHJhbnNmb3JtID0ge1xuICAnY2xhc3MnOiAnY2xhc3NOYW1lJyxcbiAgJ2Zvcic6ICdodG1sRm9yJyxcbiAgJ2h0dHAtZXF1aXYnOiAnaHR0cEVxdWl2J1xufVxuXG5mdW5jdGlvbiBhdHRyaWJ1dGVUb1Byb3BlcnR5IChoKSB7XG4gIHJldHVybiBmdW5jdGlvbiAodGFnTmFtZSwgYXR0cnMsIGNoaWxkcmVuKSB7XG4gICAgZm9yICh2YXIgYXR0ciBpbiBhdHRycykge1xuICAgICAgaWYgKGF0dHIgaW4gdHJhbnNmb3JtKSB7XG4gICAgICAgIGF0dHJzW3RyYW5zZm9ybVthdHRyXV0gPSBhdHRyc1thdHRyXVxuICAgICAgICBkZWxldGUgYXR0cnNbYXR0cl1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGgodGFnTmFtZSwgYXR0cnMsIGNoaWxkcmVuKVxuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciByYW5nZTsgLy8gQ3JlYXRlIGEgcmFuZ2Ugb2JqZWN0IGZvciBlZmZpY2VudGx5IHJlbmRlcmluZyBzdHJpbmdzIHRvIGVsZW1lbnRzLlxudmFyIE5TX1hIVE1MID0gJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwnO1xuXG52YXIgZG9jID0gdHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IGRvY3VtZW50O1xuXG52YXIgdGVzdEVsID0gZG9jID9cbiAgICBkb2MuYm9keSB8fCBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JykgOlxuICAgIHt9O1xuXG4vLyBGaXhlcyA8aHR0cHM6Ly9naXRodWIuY29tL3BhdHJpY2stc3RlZWxlLWlkZW0vbW9ycGhkb20vaXNzdWVzLzMyPlxuLy8gKElFNysgc3VwcG9ydCkgPD1JRTcgZG9lcyBub3Qgc3VwcG9ydCBlbC5oYXNBdHRyaWJ1dGUobmFtZSlcbnZhciBhY3R1YWxIYXNBdHRyaWJ1dGVOUztcblxuaWYgKHRlc3RFbC5oYXNBdHRyaWJ1dGVOUykge1xuICAgIGFjdHVhbEhhc0F0dHJpYnV0ZU5TID0gZnVuY3Rpb24oZWwsIG5hbWVzcGFjZVVSSSwgbmFtZSkge1xuICAgICAgICByZXR1cm4gZWwuaGFzQXR0cmlidXRlTlMobmFtZXNwYWNlVVJJLCBuYW1lKTtcbiAgICB9O1xufSBlbHNlIGlmICh0ZXN0RWwuaGFzQXR0cmlidXRlKSB7XG4gICAgYWN0dWFsSGFzQXR0cmlidXRlTlMgPSBmdW5jdGlvbihlbCwgbmFtZXNwYWNlVVJJLCBuYW1lKSB7XG4gICAgICAgIHJldHVybiBlbC5oYXNBdHRyaWJ1dGUobmFtZSk7XG4gICAgfTtcbn0gZWxzZSB7XG4gICAgYWN0dWFsSGFzQXR0cmlidXRlTlMgPSBmdW5jdGlvbihlbCwgbmFtZXNwYWNlVVJJLCBuYW1lKSB7XG4gICAgICAgIHJldHVybiBlbC5nZXRBdHRyaWJ1dGVOb2RlKG5hbWVzcGFjZVVSSSwgbmFtZSkgIT0gbnVsbDtcbiAgICB9O1xufVxuXG52YXIgaGFzQXR0cmlidXRlTlMgPSBhY3R1YWxIYXNBdHRyaWJ1dGVOUztcblxuXG5mdW5jdGlvbiB0b0VsZW1lbnQoc3RyKSB7XG4gICAgaWYgKCFyYW5nZSAmJiBkb2MuY3JlYXRlUmFuZ2UpIHtcbiAgICAgICAgcmFuZ2UgPSBkb2MuY3JlYXRlUmFuZ2UoKTtcbiAgICAgICAgcmFuZ2Uuc2VsZWN0Tm9kZShkb2MuYm9keSk7XG4gICAgfVxuXG4gICAgdmFyIGZyYWdtZW50O1xuICAgIGlmIChyYW5nZSAmJiByYW5nZS5jcmVhdGVDb250ZXh0dWFsRnJhZ21lbnQpIHtcbiAgICAgICAgZnJhZ21lbnQgPSByYW5nZS5jcmVhdGVDb250ZXh0dWFsRnJhZ21lbnQoc3RyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmcmFnbWVudCA9IGRvYy5jcmVhdGVFbGVtZW50KCdib2R5Jyk7XG4gICAgICAgIGZyYWdtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICB9XG4gICAgcmV0dXJuIGZyYWdtZW50LmNoaWxkTm9kZXNbMF07XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHR3byBub2RlJ3MgbmFtZXMgYXJlIHRoZSBzYW1lLlxuICpcbiAqIE5PVEU6IFdlIGRvbid0IGJvdGhlciBjaGVja2luZyBgbmFtZXNwYWNlVVJJYCBiZWNhdXNlIHlvdSB3aWxsIG5ldmVyIGZpbmQgdHdvIEhUTUwgZWxlbWVudHMgd2l0aCB0aGUgc2FtZVxuICogICAgICAgbm9kZU5hbWUgYW5kIGRpZmZlcmVudCBuYW1lc3BhY2UgVVJJcy5cbiAqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGFcbiAqIEBwYXJhbSB7RWxlbWVudH0gYiBUaGUgdGFyZ2V0IGVsZW1lbnRcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGNvbXBhcmVOb2RlTmFtZXMoZnJvbUVsLCB0b0VsKSB7XG4gICAgdmFyIGZyb21Ob2RlTmFtZSA9IGZyb21FbC5ub2RlTmFtZTtcbiAgICB2YXIgdG9Ob2RlTmFtZSA9IHRvRWwubm9kZU5hbWU7XG5cbiAgICBpZiAoZnJvbU5vZGVOYW1lID09PSB0b05vZGVOYW1lKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0b0VsLmFjdHVhbGl6ZSAmJlxuICAgICAgICBmcm9tTm9kZU5hbWUuY2hhckNvZGVBdCgwKSA8IDkxICYmIC8qIGZyb20gdGFnIG5hbWUgaXMgdXBwZXIgY2FzZSAqL1xuICAgICAgICB0b05vZGVOYW1lLmNoYXJDb2RlQXQoMCkgPiA5MCAvKiB0YXJnZXQgdGFnIG5hbWUgaXMgbG93ZXIgY2FzZSAqLykge1xuICAgICAgICAvLyBJZiB0aGUgdGFyZ2V0IGVsZW1lbnQgaXMgYSB2aXJ0dWFsIERPTSBub2RlIHRoZW4gd2UgbWF5IG5lZWQgdG8gbm9ybWFsaXplIHRoZSB0YWcgbmFtZVxuICAgICAgICAvLyBiZWZvcmUgY29tcGFyaW5nLiBOb3JtYWwgSFRNTCBlbGVtZW50cyB0aGF0IGFyZSBpbiB0aGUgXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCJcbiAgICAgICAgLy8gYXJlIGNvbnZlcnRlZCB0byB1cHBlciBjYXNlXG4gICAgICAgIHJldHVybiBmcm9tTm9kZU5hbWUgPT09IHRvTm9kZU5hbWUudG9VcHBlckNhc2UoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBhbiBlbGVtZW50LCBvcHRpb25hbGx5IHdpdGggYSBrbm93biBuYW1lc3BhY2UgVVJJLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIHRoZSBlbGVtZW50IG5hbWUsIGUuZy4gJ2Rpdicgb3IgJ3N2ZydcbiAqIEBwYXJhbSB7c3RyaW5nfSBbbmFtZXNwYWNlVVJJXSB0aGUgZWxlbWVudCdzIG5hbWVzcGFjZSBVUkksIGkuZS4gdGhlIHZhbHVlIG9mXG4gKiBpdHMgYHhtbG5zYCBhdHRyaWJ1dGUgb3IgaXRzIGluZmVycmVkIG5hbWVzcGFjZS5cbiAqXG4gKiBAcmV0dXJuIHtFbGVtZW50fVxuICovXG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50TlMobmFtZSwgbmFtZXNwYWNlVVJJKSB7XG4gICAgcmV0dXJuICFuYW1lc3BhY2VVUkkgfHwgbmFtZXNwYWNlVVJJID09PSBOU19YSFRNTCA/XG4gICAgICAgIGRvYy5jcmVhdGVFbGVtZW50KG5hbWUpIDpcbiAgICAgICAgZG9jLmNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2VVUkksIG5hbWUpO1xufVxuXG4vKipcbiAqIENvcGllcyB0aGUgY2hpbGRyZW4gb2Ygb25lIERPTSBlbGVtZW50IHRvIGFub3RoZXIgRE9NIGVsZW1lbnRcbiAqL1xuZnVuY3Rpb24gbW92ZUNoaWxkcmVuKGZyb21FbCwgdG9FbCkge1xuICAgIHZhciBjdXJDaGlsZCA9IGZyb21FbC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChjdXJDaGlsZCkge1xuICAgICAgICB2YXIgbmV4dENoaWxkID0gY3VyQ2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgIHRvRWwuYXBwZW5kQ2hpbGQoY3VyQ2hpbGQpO1xuICAgICAgICBjdXJDaGlsZCA9IG5leHRDaGlsZDtcbiAgICB9XG4gICAgcmV0dXJuIHRvRWw7XG59XG5cbmZ1bmN0aW9uIG1vcnBoQXR0cnMoZnJvbU5vZGUsIHRvTm9kZSkge1xuICAgIHZhciBhdHRycyA9IHRvTm9kZS5hdHRyaWJ1dGVzO1xuICAgIHZhciBpO1xuICAgIHZhciBhdHRyO1xuICAgIHZhciBhdHRyTmFtZTtcbiAgICB2YXIgYXR0ck5hbWVzcGFjZVVSSTtcbiAgICB2YXIgYXR0clZhbHVlO1xuICAgIHZhciBmcm9tVmFsdWU7XG5cbiAgICBmb3IgKGkgPSBhdHRycy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICBhdHRyID0gYXR0cnNbaV07XG4gICAgICAgIGF0dHJOYW1lID0gYXR0ci5uYW1lO1xuICAgICAgICBhdHRyTmFtZXNwYWNlVVJJID0gYXR0ci5uYW1lc3BhY2VVUkk7XG4gICAgICAgIGF0dHJWYWx1ZSA9IGF0dHIudmFsdWU7XG5cbiAgICAgICAgaWYgKGF0dHJOYW1lc3BhY2VVUkkpIHtcbiAgICAgICAgICAgIGF0dHJOYW1lID0gYXR0ci5sb2NhbE5hbWUgfHwgYXR0ck5hbWU7XG4gICAgICAgICAgICBmcm9tVmFsdWUgPSBmcm9tTm9kZS5nZXRBdHRyaWJ1dGVOUyhhdHRyTmFtZXNwYWNlVVJJLCBhdHRyTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgIT09IGF0dHJWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGZyb21Ob2RlLnNldEF0dHJpYnV0ZU5TKGF0dHJOYW1lc3BhY2VVUkksIGF0dHJOYW1lLCBhdHRyVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZnJvbVZhbHVlID0gZnJvbU5vZGUuZ2V0QXR0cmlidXRlKGF0dHJOYW1lKTtcblxuICAgICAgICAgICAgaWYgKGZyb21WYWx1ZSAhPT0gYXR0clZhbHVlKSB7XG4gICAgICAgICAgICAgICAgZnJvbU5vZGUuc2V0QXR0cmlidXRlKGF0dHJOYW1lLCBhdHRyVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGFueSBleHRyYSBhdHRyaWJ1dGVzIGZvdW5kIG9uIHRoZSBvcmlnaW5hbCBET00gZWxlbWVudCB0aGF0XG4gICAgLy8gd2VyZW4ndCBmb3VuZCBvbiB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgYXR0cnMgPSBmcm9tTm9kZS5hdHRyaWJ1dGVzO1xuXG4gICAgZm9yIChpID0gYXR0cnMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgYXR0ciA9IGF0dHJzW2ldO1xuICAgICAgICBpZiAoYXR0ci5zcGVjaWZpZWQgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICBhdHRyTmFtZSA9IGF0dHIubmFtZTtcbiAgICAgICAgICAgIGF0dHJOYW1lc3BhY2VVUkkgPSBhdHRyLm5hbWVzcGFjZVVSSTtcblxuICAgICAgICAgICAgaWYgKGF0dHJOYW1lc3BhY2VVUkkpIHtcbiAgICAgICAgICAgICAgICBhdHRyTmFtZSA9IGF0dHIubG9jYWxOYW1lIHx8IGF0dHJOYW1lO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFoYXNBdHRyaWJ1dGVOUyh0b05vZGUsIGF0dHJOYW1lc3BhY2VVUkksIGF0dHJOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICBmcm9tTm9kZS5yZW1vdmVBdHRyaWJ1dGVOUyhhdHRyTmFtZXNwYWNlVVJJLCBhdHRyTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIWhhc0F0dHJpYnV0ZU5TKHRvTm9kZSwgbnVsbCwgYXR0ck5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZyb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZShhdHRyTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzeW5jQm9vbGVhbkF0dHJQcm9wKGZyb21FbCwgdG9FbCwgbmFtZSkge1xuICAgIGlmIChmcm9tRWxbbmFtZV0gIT09IHRvRWxbbmFtZV0pIHtcbiAgICAgICAgZnJvbUVsW25hbWVdID0gdG9FbFtuYW1lXTtcbiAgICAgICAgaWYgKGZyb21FbFtuYW1lXSkge1xuICAgICAgICAgICAgZnJvbUVsLnNldEF0dHJpYnV0ZShuYW1lLCAnJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcm9tRWwucmVtb3ZlQXR0cmlidXRlKG5hbWUsICcnKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxudmFyIHNwZWNpYWxFbEhhbmRsZXJzID0ge1xuICAgIC8qKlxuICAgICAqIE5lZWRlZCBmb3IgSUUuIEFwcGFyZW50bHkgSUUgZG9lc24ndCB0aGluayB0aGF0IFwic2VsZWN0ZWRcIiBpcyBhblxuICAgICAqIGF0dHJpYnV0ZSB3aGVuIHJlYWRpbmcgb3ZlciB0aGUgYXR0cmlidXRlcyB1c2luZyBzZWxlY3RFbC5hdHRyaWJ1dGVzXG4gICAgICovXG4gICAgT1BUSU9OOiBmdW5jdGlvbihmcm9tRWwsIHRvRWwpIHtcbiAgICAgICAgc3luY0Jvb2xlYW5BdHRyUHJvcChmcm9tRWwsIHRvRWwsICdzZWxlY3RlZCcpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogVGhlIFwidmFsdWVcIiBhdHRyaWJ1dGUgaXMgc3BlY2lhbCBmb3IgdGhlIDxpbnB1dD4gZWxlbWVudCBzaW5jZSBpdCBzZXRzXG4gICAgICogdGhlIGluaXRpYWwgdmFsdWUuIENoYW5naW5nIHRoZSBcInZhbHVlXCIgYXR0cmlidXRlIHdpdGhvdXQgY2hhbmdpbmcgdGhlXG4gICAgICogXCJ2YWx1ZVwiIHByb3BlcnR5IHdpbGwgaGF2ZSBubyBlZmZlY3Qgc2luY2UgaXQgaXMgb25seSB1c2VkIHRvIHRoZSBzZXQgdGhlXG4gICAgICogaW5pdGlhbCB2YWx1ZS4gIFNpbWlsYXIgZm9yIHRoZSBcImNoZWNrZWRcIiBhdHRyaWJ1dGUsIGFuZCBcImRpc2FibGVkXCIuXG4gICAgICovXG4gICAgSU5QVVQ6IGZ1bmN0aW9uKGZyb21FbCwgdG9FbCkge1xuICAgICAgICBzeW5jQm9vbGVhbkF0dHJQcm9wKGZyb21FbCwgdG9FbCwgJ2NoZWNrZWQnKTtcbiAgICAgICAgc3luY0Jvb2xlYW5BdHRyUHJvcChmcm9tRWwsIHRvRWwsICdkaXNhYmxlZCcpO1xuXG4gICAgICAgIGlmIChmcm9tRWwudmFsdWUgIT09IHRvRWwudmFsdWUpIHtcbiAgICAgICAgICAgIGZyb21FbC52YWx1ZSA9IHRvRWwudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWhhc0F0dHJpYnV0ZU5TKHRvRWwsIG51bGwsICd2YWx1ZScpKSB7XG4gICAgICAgICAgICBmcm9tRWwucmVtb3ZlQXR0cmlidXRlKCd2YWx1ZScpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIFRFWFRBUkVBOiBmdW5jdGlvbihmcm9tRWwsIHRvRWwpIHtcbiAgICAgICAgdmFyIG5ld1ZhbHVlID0gdG9FbC52YWx1ZTtcbiAgICAgICAgaWYgKGZyb21FbC52YWx1ZSAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGZyb21FbC52YWx1ZSA9IG5ld1ZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZpcnN0Q2hpbGQgPSBmcm9tRWwuZmlyc3RDaGlsZDtcbiAgICAgICAgaWYgKGZpcnN0Q2hpbGQpIHtcbiAgICAgICAgICAgIC8vIE5lZWRlZCBmb3IgSUUuIEFwcGFyZW50bHkgSUUgc2V0cyB0aGUgcGxhY2Vob2xkZXIgYXMgdGhlXG4gICAgICAgICAgICAvLyBub2RlIHZhbHVlIGFuZCB2aXNlIHZlcnNhLiBUaGlzIGlnbm9yZXMgYW4gZW1wdHkgdXBkYXRlLlxuICAgICAgICAgICAgdmFyIG9sZFZhbHVlID0gZmlyc3RDaGlsZC5ub2RlVmFsdWU7XG5cbiAgICAgICAgICAgIGlmIChvbGRWYWx1ZSA9PSBuZXdWYWx1ZSB8fCAoIW5ld1ZhbHVlICYmIG9sZFZhbHVlID09IGZyb21FbC5wbGFjZWhvbGRlcikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZpcnN0Q2hpbGQubm9kZVZhbHVlID0gbmV3VmFsdWU7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIFNFTEVDVDogZnVuY3Rpb24oZnJvbUVsLCB0b0VsKSB7XG4gICAgICAgIGlmICghaGFzQXR0cmlidXRlTlModG9FbCwgbnVsbCwgJ211bHRpcGxlJykpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZEluZGV4ID0gLTE7XG4gICAgICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgICAgICB2YXIgY3VyQ2hpbGQgPSB0b0VsLmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICB3aGlsZShjdXJDaGlsZCkge1xuICAgICAgICAgICAgICAgIHZhciBub2RlTmFtZSA9IGN1ckNoaWxkLm5vZGVOYW1lO1xuICAgICAgICAgICAgICAgIGlmIChub2RlTmFtZSAmJiBub2RlTmFtZS50b1VwcGVyQ2FzZSgpID09PSAnT1BUSU9OJykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaGFzQXR0cmlidXRlTlMoY3VyQ2hpbGQsIG51bGwsICdzZWxlY3RlZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZEluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY3VyQ2hpbGQgPSBjdXJDaGlsZC5uZXh0U2libGluZztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnJvbUVsLnNlbGVjdGVkSW5kZXggPSBpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxudmFyIEVMRU1FTlRfTk9ERSA9IDE7XG52YXIgVEVYVF9OT0RFID0gMztcbnZhciBDT01NRU5UX05PREUgPSA4O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxuZnVuY3Rpb24gZGVmYXVsdEdldE5vZGVLZXkobm9kZSkge1xuICAgIHJldHVybiBub2RlLmlkO1xufVxuXG5mdW5jdGlvbiBtb3JwaGRvbUZhY3RvcnkobW9ycGhBdHRycykge1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG1vcnBoZG9tKGZyb21Ob2RlLCB0b05vZGUsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25zID0ge307XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIHRvTm9kZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGlmIChmcm9tTm9kZS5ub2RlTmFtZSA9PT0gJyNkb2N1bWVudCcgfHwgZnJvbU5vZGUubm9kZU5hbWUgPT09ICdIVE1MJykge1xuICAgICAgICAgICAgICAgIHZhciB0b05vZGVIdG1sID0gdG9Ob2RlO1xuICAgICAgICAgICAgICAgIHRvTm9kZSA9IGRvYy5jcmVhdGVFbGVtZW50KCdodG1sJyk7XG4gICAgICAgICAgICAgICAgdG9Ob2RlLmlubmVySFRNTCA9IHRvTm9kZUh0bWw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRvTm9kZSA9IHRvRWxlbWVudCh0b05vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGdldE5vZGVLZXkgPSBvcHRpb25zLmdldE5vZGVLZXkgfHwgZGVmYXVsdEdldE5vZGVLZXk7XG4gICAgICAgIHZhciBvbkJlZm9yZU5vZGVBZGRlZCA9IG9wdGlvbnMub25CZWZvcmVOb2RlQWRkZWQgfHwgbm9vcDtcbiAgICAgICAgdmFyIG9uTm9kZUFkZGVkID0gb3B0aW9ucy5vbk5vZGVBZGRlZCB8fCBub29wO1xuICAgICAgICB2YXIgb25CZWZvcmVFbFVwZGF0ZWQgPSBvcHRpb25zLm9uQmVmb3JlRWxVcGRhdGVkIHx8IG5vb3A7XG4gICAgICAgIHZhciBvbkVsVXBkYXRlZCA9IG9wdGlvbnMub25FbFVwZGF0ZWQgfHwgbm9vcDtcbiAgICAgICAgdmFyIG9uQmVmb3JlTm9kZURpc2NhcmRlZCA9IG9wdGlvbnMub25CZWZvcmVOb2RlRGlzY2FyZGVkIHx8IG5vb3A7XG4gICAgICAgIHZhciBvbk5vZGVEaXNjYXJkZWQgPSBvcHRpb25zLm9uTm9kZURpc2NhcmRlZCB8fCBub29wO1xuICAgICAgICB2YXIgb25CZWZvcmVFbENoaWxkcmVuVXBkYXRlZCA9IG9wdGlvbnMub25CZWZvcmVFbENoaWxkcmVuVXBkYXRlZCB8fCBub29wO1xuICAgICAgICB2YXIgY2hpbGRyZW5Pbmx5ID0gb3B0aW9ucy5jaGlsZHJlbk9ubHkgPT09IHRydWU7XG5cbiAgICAgICAgLy8gVGhpcyBvYmplY3QgaXMgdXNlZCBhcyBhIGxvb2t1cCB0byBxdWlja2x5IGZpbmQgYWxsIGtleWVkIGVsZW1lbnRzIGluIHRoZSBvcmlnaW5hbCBET00gdHJlZS5cbiAgICAgICAgdmFyIGZyb21Ob2Rlc0xvb2t1cCA9IHt9O1xuICAgICAgICB2YXIga2V5ZWRSZW1vdmFsTGlzdDtcblxuICAgICAgICBmdW5jdGlvbiBhZGRLZXllZFJlbW92YWwoa2V5KSB7XG4gICAgICAgICAgICBpZiAoa2V5ZWRSZW1vdmFsTGlzdCkge1xuICAgICAgICAgICAgICAgIGtleWVkUmVtb3ZhbExpc3QucHVzaChrZXkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBrZXllZFJlbW92YWxMaXN0ID0gW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB3YWxrRGlzY2FyZGVkQ2hpbGROb2Rlcyhub2RlLCBza2lwS2V5ZWROb2Rlcykge1xuICAgICAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IEVMRU1FTlRfTk9ERSkge1xuICAgICAgICAgICAgICAgIHZhciBjdXJDaGlsZCA9IG5vZGUuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY3VyQ2hpbGQpIHtcblxuICAgICAgICAgICAgICAgICAgICB2YXIga2V5ID0gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChza2lwS2V5ZWROb2RlcyAmJiAoa2V5ID0gZ2V0Tm9kZUtleShjdXJDaGlsZCkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSBhcmUgc2tpcHBpbmcga2V5ZWQgbm9kZXMgdGhlbiB3ZSBhZGQgdGhlIGtleVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdG8gYSBsaXN0IHNvIHRoYXQgaXQgY2FuIGJlIGhhbmRsZWQgYXQgdGhlIHZlcnkgZW5kLlxuICAgICAgICAgICAgICAgICAgICAgICAgYWRkS2V5ZWRSZW1vdmFsKGtleSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IHJlcG9ydCB0aGUgbm9kZSBhcyBkaXNjYXJkZWQgaWYgaXQgaXMgbm90IGtleWVkLiBXZSBkbyB0aGlzIGJlY2F1c2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGF0IHRoZSBlbmQgd2UgbG9vcCB0aHJvdWdoIGFsbCBrZXllZCBlbGVtZW50cyB0aGF0IHdlcmUgdW5tYXRjaGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhbmQgdGhlbiBkaXNjYXJkIHRoZW0gaW4gb25lIGZpbmFsIHBhc3MuXG4gICAgICAgICAgICAgICAgICAgICAgICBvbk5vZGVEaXNjYXJkZWQoY3VyQ2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ckNoaWxkLmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YWxrRGlzY2FyZGVkQ2hpbGROb2RlcyhjdXJDaGlsZCwgc2tpcEtleWVkTm9kZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY3VyQ2hpbGQgPSBjdXJDaGlsZC5uZXh0U2libGluZztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlcyBhIERPTSBub2RlIG91dCBvZiB0aGUgb3JpZ2luYWwgRE9NXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSAge05vZGV9IG5vZGUgVGhlIG5vZGUgdG8gcmVtb3ZlXG4gICAgICAgICAqIEBwYXJhbSAge05vZGV9IHBhcmVudE5vZGUgVGhlIG5vZGVzIHBhcmVudFxuICAgICAgICAgKiBAcGFyYW0gIHtCb29sZWFufSBza2lwS2V5ZWROb2RlcyBJZiB0cnVlIHRoZW4gZWxlbWVudHMgd2l0aCBrZXlzIHdpbGwgYmUgc2tpcHBlZCBhbmQgbm90IGRpc2NhcmRlZC5cbiAgICAgICAgICogQHJldHVybiB7dW5kZWZpbmVkfVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gcmVtb3ZlTm9kZShub2RlLCBwYXJlbnROb2RlLCBza2lwS2V5ZWROb2Rlcykge1xuICAgICAgICAgICAgaWYgKG9uQmVmb3JlTm9kZURpc2NhcmRlZChub2RlKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAgICAgcGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgb25Ob2RlRGlzY2FyZGVkKG5vZGUpO1xuICAgICAgICAgICAgd2Fsa0Rpc2NhcmRlZENoaWxkTm9kZXMobm9kZSwgc2tpcEtleWVkTm9kZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gLy8gVHJlZVdhbGtlciBpbXBsZW1lbnRhdGlvbiBpcyBubyBmYXN0ZXIsIGJ1dCBrZWVwaW5nIHRoaXMgYXJvdW5kIGluIGNhc2UgdGhpcyBjaGFuZ2VzIGluIHRoZSBmdXR1cmVcbiAgICAgICAgLy8gZnVuY3Rpb24gaW5kZXhUcmVlKHJvb3QpIHtcbiAgICAgICAgLy8gICAgIHZhciB0cmVlV2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihcbiAgICAgICAgLy8gICAgICAgICByb290LFxuICAgICAgICAvLyAgICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UKTtcbiAgICAgICAgLy9cbiAgICAgICAgLy8gICAgIHZhciBlbDtcbiAgICAgICAgLy8gICAgIHdoaWxlKChlbCA9IHRyZWVXYWxrZXIubmV4dE5vZGUoKSkpIHtcbiAgICAgICAgLy8gICAgICAgICB2YXIga2V5ID0gZ2V0Tm9kZUtleShlbCk7XG4gICAgICAgIC8vICAgICAgICAgaWYgKGtleSkge1xuICAgICAgICAvLyAgICAgICAgICAgICBmcm9tTm9kZXNMb29rdXBba2V5XSA9IGVsO1xuICAgICAgICAvLyAgICAgICAgIH1cbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gfVxuXG4gICAgICAgIC8vIC8vIE5vZGVJdGVyYXRvciBpbXBsZW1lbnRhdGlvbiBpcyBubyBmYXN0ZXIsIGJ1dCBrZWVwaW5nIHRoaXMgYXJvdW5kIGluIGNhc2UgdGhpcyBjaGFuZ2VzIGluIHRoZSBmdXR1cmVcbiAgICAgICAgLy9cbiAgICAgICAgLy8gZnVuY3Rpb24gaW5kZXhUcmVlKG5vZGUpIHtcbiAgICAgICAgLy8gICAgIHZhciBub2RlSXRlcmF0b3IgPSBkb2N1bWVudC5jcmVhdGVOb2RlSXRlcmF0b3Iobm9kZSwgTm9kZUZpbHRlci5TSE9XX0VMRU1FTlQpO1xuICAgICAgICAvLyAgICAgdmFyIGVsO1xuICAgICAgICAvLyAgICAgd2hpbGUoKGVsID0gbm9kZUl0ZXJhdG9yLm5leHROb2RlKCkpKSB7XG4gICAgICAgIC8vICAgICAgICAgdmFyIGtleSA9IGdldE5vZGVLZXkoZWwpO1xuICAgICAgICAvLyAgICAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgLy8gICAgICAgICAgICAgZnJvbU5vZGVzTG9va3VwW2tleV0gPSBlbDtcbiAgICAgICAgLy8gICAgICAgICB9XG4gICAgICAgIC8vICAgICB9XG4gICAgICAgIC8vIH1cblxuICAgICAgICBmdW5jdGlvbiBpbmRleFRyZWUobm9kZSkge1xuICAgICAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IEVMRU1FTlRfTk9ERSkge1xuICAgICAgICAgICAgICAgIHZhciBjdXJDaGlsZCA9IG5vZGUuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY3VyQ2hpbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9IGdldE5vZGVLZXkoY3VyQ2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmcm9tTm9kZXNMb29rdXBba2V5XSA9IGN1ckNoaWxkO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gV2FsayByZWN1cnNpdmVseVxuICAgICAgICAgICAgICAgICAgICBpbmRleFRyZWUoY3VyQ2hpbGQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGN1ckNoaWxkID0gY3VyQ2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaW5kZXhUcmVlKGZyb21Ob2RlKTtcblxuICAgICAgICBmdW5jdGlvbiBoYW5kbGVOb2RlQWRkZWQoZWwpIHtcbiAgICAgICAgICAgIG9uTm9kZUFkZGVkKGVsKTtcblxuICAgICAgICAgICAgdmFyIGN1ckNoaWxkID0gZWwuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgIHdoaWxlIChjdXJDaGlsZCkge1xuICAgICAgICAgICAgICAgIHZhciBuZXh0U2libGluZyA9IGN1ckNoaWxkLm5leHRTaWJsaW5nO1xuXG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IGdldE5vZGVLZXkoY3VyQ2hpbGQpO1xuICAgICAgICAgICAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHVubWF0Y2hlZEZyb21FbCA9IGZyb21Ob2Rlc0xvb2t1cFtrZXldO1xuICAgICAgICAgICAgICAgICAgICBpZiAodW5tYXRjaGVkRnJvbUVsICYmIGNvbXBhcmVOb2RlTmFtZXMoY3VyQ2hpbGQsIHVubWF0Y2hlZEZyb21FbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1ckNoaWxkLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKHVubWF0Y2hlZEZyb21FbCwgY3VyQ2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9ycGhFbCh1bm1hdGNoZWRGcm9tRWwsIGN1ckNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGhhbmRsZU5vZGVBZGRlZChjdXJDaGlsZCk7XG4gICAgICAgICAgICAgICAgY3VyQ2hpbGQgPSBuZXh0U2libGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vcnBoRWwoZnJvbUVsLCB0b0VsLCBjaGlsZHJlbk9ubHkpIHtcbiAgICAgICAgICAgIHZhciB0b0VsS2V5ID0gZ2V0Tm9kZUtleSh0b0VsKTtcbiAgICAgICAgICAgIHZhciBjdXJGcm9tTm9kZUtleTtcblxuICAgICAgICAgICAgaWYgKHRvRWxLZXkpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiBhbiBlbGVtZW50IHdpdGggYW4gSUQgaXMgYmVpbmcgbW9ycGhlZCB0aGVuIGl0IGlzIHdpbGwgYmUgaW4gdGhlIGZpbmFsXG4gICAgICAgICAgICAgICAgLy8gRE9NIHNvIGNsZWFyIGl0IG91dCBvZiB0aGUgc2F2ZWQgZWxlbWVudHMgY29sbGVjdGlvblxuICAgICAgICAgICAgICAgIGRlbGV0ZSBmcm9tTm9kZXNMb29rdXBbdG9FbEtleV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0b05vZGUuaXNTYW1lTm9kZSAmJiB0b05vZGUuaXNTYW1lTm9kZShmcm9tTm9kZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghY2hpbGRyZW5Pbmx5KSB7XG4gICAgICAgICAgICAgICAgaWYgKG9uQmVmb3JlRWxVcGRhdGVkKGZyb21FbCwgdG9FbCkgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtb3JwaEF0dHJzKGZyb21FbCwgdG9FbCk7XG4gICAgICAgICAgICAgICAgb25FbFVwZGF0ZWQoZnJvbUVsKTtcblxuICAgICAgICAgICAgICAgIGlmIChvbkJlZm9yZUVsQ2hpbGRyZW5VcGRhdGVkKGZyb21FbCwgdG9FbCkgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChmcm9tRWwubm9kZU5hbWUgIT09ICdURVhUQVJFQScpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3VyVG9Ob2RlQ2hpbGQgPSB0b0VsLmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICAgICAgdmFyIGN1ckZyb21Ob2RlQ2hpbGQgPSBmcm9tRWwuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgICAgICB2YXIgY3VyVG9Ob2RlS2V5O1xuXG4gICAgICAgICAgICAgICAgdmFyIGZyb21OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICB2YXIgdG9OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2hpbmdGcm9tRWw7XG5cbiAgICAgICAgICAgICAgICBvdXRlcjogd2hpbGUgKGN1clRvTm9kZUNoaWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvTmV4dFNpYmxpbmcgPSBjdXJUb05vZGVDaGlsZC5uZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgY3VyVG9Ob2RlS2V5ID0gZ2V0Tm9kZUtleShjdXJUb05vZGVDaGlsZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGN1ckZyb21Ob2RlQ2hpbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyb21OZXh0U2libGluZyA9IGN1ckZyb21Ob2RlQ2hpbGQubmV4dFNpYmxpbmc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJUb05vZGVDaGlsZC5pc1NhbWVOb2RlICYmIGN1clRvTm9kZUNoaWxkLmlzU2FtZU5vZGUoY3VyRnJvbU5vZGVDaGlsZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJUb05vZGVDaGlsZCA9IHRvTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyRnJvbU5vZGVDaGlsZCA9IGZyb21OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZSBvdXRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgY3VyRnJvbU5vZGVLZXkgPSBnZXROb2RlS2V5KGN1ckZyb21Ob2RlQ2hpbGQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY3VyRnJvbU5vZGVUeXBlID0gY3VyRnJvbU5vZGVDaGlsZC5ub2RlVHlwZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGlzQ29tcGF0aWJsZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ckZyb21Ob2RlVHlwZSA9PT0gY3VyVG9Ob2RlQ2hpbGQubm9kZVR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyRnJvbU5vZGVUeXBlID09PSBFTEVNRU5UX05PREUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQm90aCBub2RlcyBiZWluZyBjb21wYXJlZCBhcmUgRWxlbWVudCBub2Rlc1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJUb05vZGVLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSB0YXJnZXQgbm9kZSBoYXMgYSBrZXkgc28gd2Ugd2FudCB0byBtYXRjaCBpdCB1cCB3aXRoIHRoZSBjb3JyZWN0IGVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluIHRoZSBvcmlnaW5hbCBET00gdHJlZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1clRvTm9kZUtleSAhPT0gY3VyRnJvbU5vZGVLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgY3VycmVudCBlbGVtZW50IGluIHRoZSBvcmlnaW5hbCBET00gdHJlZSBkb2VzIG5vdCBoYXZlIGEgbWF0Y2hpbmcga2V5IHNvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGV0J3MgY2hlY2sgb3VyIGxvb2t1cCB0byBzZWUgaWYgdGhlcmUgaXMgYSBtYXRjaGluZyBlbGVtZW50IGluIHRoZSBvcmlnaW5hbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIERPTSB0cmVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKChtYXRjaGluZ0Zyb21FbCA9IGZyb21Ob2Rlc0xvb2t1cFtjdXJUb05vZGVLZXldKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyRnJvbU5vZGVDaGlsZC5uZXh0U2libGluZyA9PT0gbWF0Y2hpbmdGcm9tRWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNwZWNpYWwgY2FzZSBmb3Igc2luZ2xlIGVsZW1lbnQgcmVtb3ZhbHMuIFRvIGF2b2lkIHJlbW92aW5nIHRoZSBvcmlnaW5hbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRE9NIG5vZGUgb3V0IG9mIHRoZSB0cmVlIChzaW5jZSB0aGF0IGNhbiBicmVhayBDU1MgdHJhbnNpdGlvbnMsIGV0Yy4pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2Ugd2lsbCBpbnN0ZWFkIGRpc2NhcmQgdGhlIGN1cnJlbnQgbm9kZSBhbmQgd2FpdCB1bnRpbCB0aGUgbmV4dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXRlcmF0aW9uIHRvIHByb3Blcmx5IG1hdGNoIHVwIHRoZSBrZXllZCB0YXJnZXQgZWxlbWVudCB3aXRoIGl0cyBtYXRjaGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZWxlbWVudCBpbiB0aGUgb3JpZ2luYWwgdHJlZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNDb21wYXRpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBmb3VuZCBhIG1hdGNoaW5nIGtleWVkIGVsZW1lbnQgc29tZXdoZXJlIGluIHRoZSBvcmlnaW5hbCBET00gdHJlZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIExldCdzIG1vdmluZyB0aGUgb3JpZ2luYWwgRE9NIG5vZGUgaW50byB0aGUgY3VycmVudCBwb3NpdGlvbiBhbmQgbW9ycGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGl0LlxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiBXZSB1c2UgaW5zZXJ0QmVmb3JlIGluc3RlYWQgb2YgcmVwbGFjZUNoaWxkIGJlY2F1c2Ugd2Ugd2FudCB0byBnbyB0aHJvdWdoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgYHJlbW92ZU5vZGUoKWAgZnVuY3Rpb24gZm9yIHRoZSBub2RlIHRoYXQgaXMgYmVpbmcgZGlzY2FyZGVkIHNvIHRoYXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFsbCBsaWZlY3ljbGUgaG9va3MgYXJlIGNvcnJlY3RseSBpbnZva2VkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tRWwuaW5zZXJ0QmVmb3JlKG1hdGNoaW5nRnJvbUVsLCBjdXJGcm9tTm9kZUNoaWxkKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbU5leHRTaWJsaW5nID0gY3VyRnJvbU5vZGVDaGlsZC5uZXh0U2libGluZztcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ckZyb21Ob2RlS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2luY2UgdGhlIG5vZGUgaXMga2V5ZWQgaXQgbWlnaHQgYmUgbWF0Y2hlZCB1cCBsYXRlciBzbyB3ZSBkZWZlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBhY3R1YWwgcmVtb3ZhbCB0byBsYXRlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFkZEtleWVkUmVtb3ZhbChjdXJGcm9tTm9kZUtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5PVEU6IHdlIHNraXAgbmVzdGVkIGtleWVkIG5vZGVzIGZyb20gYmVpbmcgcmVtb3ZlZCBzaW5jZSB0aGVyZSBpc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICAgIHN0aWxsIGEgY2hhbmNlIHRoZXkgd2lsbCBiZSBtYXRjaGVkIHVwIGxhdGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlTm9kZShjdXJGcm9tTm9kZUNoaWxkLCBmcm9tRWwsIHRydWUgLyogc2tpcCBrZXllZCBub2RlcyAqLyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlQ2hpbGQgPSBtYXRjaGluZ0Zyb21FbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBub2RlcyBhcmUgbm90IGNvbXBhdGlibGUgc2luY2UgdGhlIFwidG9cIiBub2RlIGhhcyBhIGtleSBhbmQgdGhlcmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXMgbm8gbWF0Y2hpbmcga2V5ZWQgbm9kZSBpbiB0aGUgc291cmNlIHRyZWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNDb21wYXRpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGN1ckZyb21Ob2RlS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgb3JpZ2luYWwgaGFzIGEga2V5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0NvbXBhdGlibGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzQ29tcGF0aWJsZSA9IGlzQ29tcGF0aWJsZSAhPT0gZmFsc2UgJiYgY29tcGFyZU5vZGVOYW1lcyhjdXJGcm9tTm9kZUNoaWxkLCBjdXJUb05vZGVDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0NvbXBhdGlibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIGZvdW5kIGNvbXBhdGlibGUgRE9NIGVsZW1lbnRzIHNvIHRyYW5zZm9ybVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGN1cnJlbnQgXCJmcm9tXCIgbm9kZSB0byBtYXRjaCB0aGUgY3VycmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGFyZ2V0IERPTSBub2RlLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9ycGhFbChjdXJGcm9tTm9kZUNoaWxkLCBjdXJUb05vZGVDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3VyRnJvbU5vZGVUeXBlID09PSBURVhUX05PREUgfHwgY3VyRnJvbU5vZGVUeXBlID09IENPTU1FTlRfTk9ERSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBCb3RoIG5vZGVzIGJlaW5nIGNvbXBhcmVkIGFyZSBUZXh0IG9yIENvbW1lbnQgbm9kZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNDb21wYXRpYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2ltcGx5IHVwZGF0ZSBub2RlVmFsdWUgb24gdGhlIG9yaWdpbmFsIG5vZGUgdG9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hhbmdlIHRoZSB0ZXh0IHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlQ2hpbGQubm9kZVZhbHVlID0gY3VyVG9Ob2RlQ2hpbGQubm9kZVZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ29tcGF0aWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFkdmFuY2UgYm90aCB0aGUgXCJ0b1wiIGNoaWxkIGFuZCB0aGUgXCJmcm9tXCIgY2hpbGQgc2luY2Ugd2UgZm91bmQgYSBtYXRjaFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1clRvTm9kZUNoaWxkID0gdG9OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJGcm9tTm9kZUNoaWxkID0gZnJvbU5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlIG91dGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBObyBjb21wYXRpYmxlIG1hdGNoIHNvIHJlbW92ZSB0aGUgb2xkIG5vZGUgZnJvbSB0aGUgRE9NIGFuZCBjb250aW51ZSB0cnlpbmcgdG8gZmluZCBhXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBtYXRjaCBpbiB0aGUgb3JpZ2luYWwgRE9NLiBIb3dldmVyLCB3ZSBvbmx5IGRvIHRoaXMgaWYgdGhlIGZyb20gbm9kZSBpcyBub3Qga2V5ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNpbmNlIGl0IGlzIHBvc3NpYmxlIHRoYXQgYSBrZXllZCBub2RlIG1pZ2h0IG1hdGNoIHVwIHdpdGggYSBub2RlIHNvbWV3aGVyZSBlbHNlIGluIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGFyZ2V0IHRyZWUgYW5kIHdlIGRvbid0IHdhbnQgdG8gZGlzY2FyZCBpdCBqdXN0IHlldCBzaW5jZSBpdCBzdGlsbCBtaWdodCBmaW5kIGFcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhvbWUgaW4gdGhlIGZpbmFsIERPTSB0cmVlLiBBZnRlciBldmVyeXRoaW5nIGlzIGRvbmUgd2Ugd2lsbCByZW1vdmUgYW55IGtleWVkIG5vZGVzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGF0IGRpZG4ndCBmaW5kIGEgaG9tZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ckZyb21Ob2RlS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2luY2UgdGhlIG5vZGUgaXMga2V5ZWQgaXQgbWlnaHQgYmUgbWF0Y2hlZCB1cCBsYXRlciBzbyB3ZSBkZWZlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBhY3R1YWwgcmVtb3ZhbCB0byBsYXRlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFkZEtleWVkUmVtb3ZhbChjdXJGcm9tTm9kZUtleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5PVEU6IHdlIHNraXAgbmVzdGVkIGtleWVkIG5vZGVzIGZyb20gYmVpbmcgcmVtb3ZlZCBzaW5jZSB0aGVyZSBpc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICAgIHN0aWxsIGEgY2hhbmNlIHRoZXkgd2lsbCBiZSBtYXRjaGVkIHVwIGxhdGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlTm9kZShjdXJGcm9tTm9kZUNoaWxkLCBmcm9tRWwsIHRydWUgLyogc2tpcCBrZXllZCBub2RlcyAqLyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlQ2hpbGQgPSBmcm9tTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSBnb3QgdGhpcyBmYXIgdGhlbiB3ZSBkaWQgbm90IGZpbmQgYSBjYW5kaWRhdGUgbWF0Y2ggZm9yXG4gICAgICAgICAgICAgICAgICAgIC8vIG91ciBcInRvIG5vZGVcIiBhbmQgd2UgZXhoYXVzdGVkIGFsbCBvZiB0aGUgY2hpbGRyZW4gXCJmcm9tXCJcbiAgICAgICAgICAgICAgICAgICAgLy8gbm9kZXMuIFRoZXJlZm9yZSwgd2Ugd2lsbCBqdXN0IGFwcGVuZCB0aGUgY3VycmVudCBcInRvXCIgbm9kZVxuICAgICAgICAgICAgICAgICAgICAvLyB0byB0aGUgZW5kXG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJUb05vZGVLZXkgJiYgKG1hdGNoaW5nRnJvbUVsID0gZnJvbU5vZGVzTG9va3VwW2N1clRvTm9kZUtleV0pICYmIGNvbXBhcmVOb2RlTmFtZXMobWF0Y2hpbmdGcm9tRWwsIGN1clRvTm9kZUNoaWxkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZnJvbUVsLmFwcGVuZENoaWxkKG1hdGNoaW5nRnJvbUVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vcnBoRWwobWF0Y2hpbmdGcm9tRWwsIGN1clRvTm9kZUNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBvbkJlZm9yZU5vZGVBZGRlZFJlc3VsdCA9IG9uQmVmb3JlTm9kZUFkZGVkKGN1clRvTm9kZUNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvbkJlZm9yZU5vZGVBZGRlZFJlc3VsdCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob25CZWZvcmVOb2RlQWRkZWRSZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyVG9Ob2RlQ2hpbGQgPSBvbkJlZm9yZU5vZGVBZGRlZFJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyVG9Ob2RlQ2hpbGQuYWN0dWFsaXplKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1clRvTm9kZUNoaWxkID0gY3VyVG9Ob2RlQ2hpbGQuYWN0dWFsaXplKGZyb21FbC5vd25lckRvY3VtZW50IHx8IGRvYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb21FbC5hcHBlbmRDaGlsZChjdXJUb05vZGVDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlTm9kZUFkZGVkKGN1clRvTm9kZUNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGN1clRvTm9kZUNoaWxkID0gdG9OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgY3VyRnJvbU5vZGVDaGlsZCA9IGZyb21OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBXZSBoYXZlIHByb2Nlc3NlZCBhbGwgb2YgdGhlIFwidG8gbm9kZXNcIi4gSWYgY3VyRnJvbU5vZGVDaGlsZCBpc1xuICAgICAgICAgICAgICAgIC8vIG5vbi1udWxsIHRoZW4gd2Ugc3RpbGwgaGF2ZSBzb21lIGZyb20gbm9kZXMgbGVmdCBvdmVyIHRoYXQgbmVlZFxuICAgICAgICAgICAgICAgIC8vIHRvIGJlIHJlbW92ZWRcbiAgICAgICAgICAgICAgICB3aGlsZSAoY3VyRnJvbU5vZGVDaGlsZCkge1xuICAgICAgICAgICAgICAgICAgICBmcm9tTmV4dFNpYmxpbmcgPSBjdXJGcm9tTm9kZUNoaWxkLm5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGN1ckZyb21Ob2RlS2V5ID0gZ2V0Tm9kZUtleShjdXJGcm9tTm9kZUNoaWxkKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbmNlIHRoZSBub2RlIGlzIGtleWVkIGl0IG1pZ2h0IGJlIG1hdGNoZWQgdXAgbGF0ZXIgc28gd2UgZGVmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBhY3R1YWwgcmVtb3ZhbCB0byBsYXRlclxuICAgICAgICAgICAgICAgICAgICAgICAgYWRkS2V5ZWRSZW1vdmFsKGN1ckZyb21Ob2RlS2V5KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5PVEU6IHdlIHNraXAgbmVzdGVkIGtleWVkIG5vZGVzIGZyb20gYmVpbmcgcmVtb3ZlZCBzaW5jZSB0aGVyZSBpc1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgICAgc3RpbGwgYSBjaGFuY2UgdGhleSB3aWxsIGJlIG1hdGNoZWQgdXAgbGF0ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZU5vZGUoY3VyRnJvbU5vZGVDaGlsZCwgZnJvbUVsLCB0cnVlIC8qIHNraXAga2V5ZWQgbm9kZXMgKi8pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlQ2hpbGQgPSBmcm9tTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc3BlY2lhbEVsSGFuZGxlciA9IHNwZWNpYWxFbEhhbmRsZXJzW2Zyb21FbC5ub2RlTmFtZV07XG4gICAgICAgICAgICBpZiAoc3BlY2lhbEVsSGFuZGxlcikge1xuICAgICAgICAgICAgICAgIHNwZWNpYWxFbEhhbmRsZXIoZnJvbUVsLCB0b0VsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSAvLyBFTkQ6IG1vcnBoRWwoLi4uKVxuXG4gICAgICAgIHZhciBtb3JwaGVkTm9kZSA9IGZyb21Ob2RlO1xuICAgICAgICB2YXIgbW9ycGhlZE5vZGVUeXBlID0gbW9ycGhlZE5vZGUubm9kZVR5cGU7XG4gICAgICAgIHZhciB0b05vZGVUeXBlID0gdG9Ob2RlLm5vZGVUeXBlO1xuXG4gICAgICAgIGlmICghY2hpbGRyZW5Pbmx5KSB7XG4gICAgICAgICAgICAvLyBIYW5kbGUgdGhlIGNhc2Ugd2hlcmUgd2UgYXJlIGdpdmVuIHR3byBET00gbm9kZXMgdGhhdCBhcmUgbm90XG4gICAgICAgICAgICAvLyBjb21wYXRpYmxlIChlLmcuIDxkaXY+IC0tPiA8c3Bhbj4gb3IgPGRpdj4gLS0+IFRFWFQpXG4gICAgICAgICAgICBpZiAobW9ycGhlZE5vZGVUeXBlID09PSBFTEVNRU5UX05PREUpIHtcbiAgICAgICAgICAgICAgICBpZiAodG9Ob2RlVHlwZSA9PT0gRUxFTUVOVF9OT0RFKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29tcGFyZU5vZGVOYW1lcyhmcm9tTm9kZSwgdG9Ob2RlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb25Ob2RlRGlzY2FyZGVkKGZyb21Ob2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vcnBoZWROb2RlID0gbW92ZUNoaWxkcmVuKGZyb21Ob2RlLCBjcmVhdGVFbGVtZW50TlModG9Ob2RlLm5vZGVOYW1lLCB0b05vZGUubmFtZXNwYWNlVVJJKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBHb2luZyBmcm9tIGFuIGVsZW1lbnQgbm9kZSB0byBhIHRleHQgbm9kZVxuICAgICAgICAgICAgICAgICAgICBtb3JwaGVkTm9kZSA9IHRvTm9kZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1vcnBoZWROb2RlVHlwZSA9PT0gVEVYVF9OT0RFIHx8IG1vcnBoZWROb2RlVHlwZSA9PT0gQ09NTUVOVF9OT0RFKSB7IC8vIFRleHQgb3IgY29tbWVudCBub2RlXG4gICAgICAgICAgICAgICAgaWYgKHRvTm9kZVR5cGUgPT09IG1vcnBoZWROb2RlVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICBtb3JwaGVkTm9kZS5ub2RlVmFsdWUgPSB0b05vZGUubm9kZVZhbHVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbW9ycGhlZE5vZGU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGV4dCBub2RlIHRvIHNvbWV0aGluZyBlbHNlXG4gICAgICAgICAgICAgICAgICAgIG1vcnBoZWROb2RlID0gdG9Ob2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtb3JwaGVkTm9kZSA9PT0gdG9Ob2RlKSB7XG4gICAgICAgICAgICAvLyBUaGUgXCJ0byBub2RlXCIgd2FzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIFwiZnJvbSBub2RlXCIgc28gd2UgaGFkIHRvXG4gICAgICAgICAgICAvLyB0b3NzIG91dCB0aGUgXCJmcm9tIG5vZGVcIiBhbmQgdXNlIHRoZSBcInRvIG5vZGVcIlxuICAgICAgICAgICAgb25Ob2RlRGlzY2FyZGVkKGZyb21Ob2RlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG1vcnBoRWwobW9ycGhlZE5vZGUsIHRvTm9kZSwgY2hpbGRyZW5Pbmx5KTtcblxuICAgICAgICAgICAgLy8gV2Ugbm93IG5lZWQgdG8gbG9vcCBvdmVyIGFueSBrZXllZCBub2RlcyB0aGF0IG1pZ2h0IG5lZWQgdG8gYmVcbiAgICAgICAgICAgIC8vIHJlbW92ZWQuIFdlIG9ubHkgZG8gdGhlIHJlbW92YWwgaWYgd2Uga25vdyB0aGF0IHRoZSBrZXllZCBub2RlXG4gICAgICAgICAgICAvLyBuZXZlciBmb3VuZCBhIG1hdGNoLiBXaGVuIGEga2V5ZWQgbm9kZSBpcyBtYXRjaGVkIHVwIHdlIHJlbW92ZVxuICAgICAgICAgICAgLy8gaXQgb3V0IG9mIGZyb21Ob2Rlc0xvb2t1cCBhbmQgd2UgdXNlIGZyb21Ob2Rlc0xvb2t1cCB0byBkZXRlcm1pbmVcbiAgICAgICAgICAgIC8vIGlmIGEga2V5ZWQgbm9kZSBoYXMgYmVlbiBtYXRjaGVkIHVwIG9yIG5vdFxuICAgICAgICAgICAgaWYgKGtleWVkUmVtb3ZhbExpc3QpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTAsIGxlbj1rZXllZFJlbW92YWxMaXN0Lmxlbmd0aDsgaTxsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZWxUb1JlbW92ZSA9IGZyb21Ob2Rlc0xvb2t1cFtrZXllZFJlbW92YWxMaXN0W2ldXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsVG9SZW1vdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZU5vZGUoZWxUb1JlbW92ZSwgZWxUb1JlbW92ZS5wYXJlbnROb2RlLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNoaWxkcmVuT25seSAmJiBtb3JwaGVkTm9kZSAhPT0gZnJvbU5vZGUgJiYgZnJvbU5vZGUucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgaWYgKG1vcnBoZWROb2RlLmFjdHVhbGl6ZSkge1xuICAgICAgICAgICAgICAgIG1vcnBoZWROb2RlID0gbW9ycGhlZE5vZGUuYWN0dWFsaXplKGZyb21Ob2RlLm93bmVyRG9jdW1lbnQgfHwgZG9jKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIElmIHdlIGhhZCB0byBzd2FwIG91dCB0aGUgZnJvbSBub2RlIHdpdGggYSBuZXcgbm9kZSBiZWNhdXNlIHRoZSBvbGRcbiAgICAgICAgICAgIC8vIG5vZGUgd2FzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIHRhcmdldCBub2RlIHRoZW4gd2UgbmVlZCB0b1xuICAgICAgICAgICAgLy8gcmVwbGFjZSB0aGUgb2xkIERPTSBub2RlIGluIHRoZSBvcmlnaW5hbCBET00gdHJlZS4gVGhpcyBpcyBvbmx5XG4gICAgICAgICAgICAvLyBwb3NzaWJsZSBpZiB0aGUgb3JpZ2luYWwgRE9NIG5vZGUgd2FzIHBhcnQgb2YgYSBET00gdHJlZSB3aGljaFxuICAgICAgICAgICAgLy8gd2Uga25vdyBpcyB0aGUgY2FzZSBpZiBpdCBoYXMgYSBwYXJlbnQgbm9kZS5cbiAgICAgICAgICAgIGZyb21Ob2RlLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKG1vcnBoZWROb2RlLCBmcm9tTm9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbW9ycGhlZE5vZGU7XG4gICAgfTtcbn1cblxudmFyIG1vcnBoZG9tID0gbW9ycGhkb21GYWN0b3J5KG1vcnBoQXR0cnMpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1vcnBoZG9tO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBbXG4gIC8vIGF0dHJpYnV0ZSBldmVudHMgKGNhbiBiZSBzZXQgd2l0aCBhdHRyaWJ1dGVzKVxuICAnb25jbGljaycsXG4gICdvbmRibGNsaWNrJyxcbiAgJ29ubW91c2Vkb3duJyxcbiAgJ29ubW91c2V1cCcsXG4gICdvbm1vdXNlb3ZlcicsXG4gICdvbm1vdXNlbW92ZScsXG4gICdvbm1vdXNlb3V0JyxcbiAgJ29uZHJhZ3N0YXJ0JyxcbiAgJ29uZHJhZycsXG4gICdvbmRyYWdlbnRlcicsXG4gICdvbmRyYWdsZWF2ZScsXG4gICdvbmRyYWdvdmVyJyxcbiAgJ29uZHJvcCcsXG4gICdvbmRyYWdlbmQnLFxuICAnb25rZXlkb3duJyxcbiAgJ29ua2V5cHJlc3MnLFxuICAnb25rZXl1cCcsXG4gICdvbnVubG9hZCcsXG4gICdvbmFib3J0JyxcbiAgJ29uZXJyb3InLFxuICAnb25yZXNpemUnLFxuICAnb25zY3JvbGwnLFxuICAnb25zZWxlY3QnLFxuICAnb25jaGFuZ2UnLFxuICAnb25zdWJtaXQnLFxuICAnb25yZXNldCcsXG4gICdvbmZvY3VzJyxcbiAgJ29uYmx1cicsXG4gICdvbmlucHV0JyxcbiAgLy8gb3RoZXIgY29tbW9uIGV2ZW50c1xuICAnb25jb250ZXh0bWVudScsXG4gICdvbmZvY3VzaW4nLFxuICAnb25mb2N1c291dCdcbl1cbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24geW95b2lmeUFwcGVuZENoaWxkIChlbCwgY2hpbGRzKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIG5vZGUgPSBjaGlsZHNbaV1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShub2RlKSkge1xuICAgICAgeW95b2lmeUFwcGVuZENoaWxkKGVsLCBub2RlKVxuICAgICAgY29udGludWVcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBub2RlID09PSAnbnVtYmVyJyB8fFxuICAgICAgdHlwZW9mIG5vZGUgPT09ICdib29sZWFuJyB8fFxuICAgICAgbm9kZSBpbnN0YW5jZW9mIERhdGUgfHxcbiAgICAgIG5vZGUgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgIG5vZGUgPSBub2RlLnRvU3RyaW5nKClcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJykge1xuICAgICAgaWYgKGVsLmxhc3RDaGlsZCAmJiBlbC5sYXN0Q2hpbGQubm9kZU5hbWUgPT09ICcjdGV4dCcpIHtcbiAgICAgICAgZWwubGFzdENoaWxkLm5vZGVWYWx1ZSArPSBub2RlXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZSlcbiAgICB9XG4gICAgaWYgKG5vZGUgJiYgbm9kZS5ub2RlVHlwZSkge1xuICAgICAgZWwuYXBwZW5kQ2hpbGQobm9kZSlcbiAgICB9XG4gIH1cbn1cbiIsImNvbnN0IFV0aWxzID0gcmVxdWlyZSgnLi4vY29yZS9VdGlscycpXG5jb25zdCBUcmFuc2xhdG9yID0gcmVxdWlyZSgnLi4vY29yZS9UcmFuc2xhdG9yJylcbmNvbnN0IFVwcHlTb2NrZXQgPSByZXF1aXJlKCcuL1VwcHlTb2NrZXQnKVxuY29uc3QgZWUgPSByZXF1aXJlKCduYW1lc3BhY2UtZW1pdHRlcicpXG5jb25zdCB0aHJvdHRsZSA9IHJlcXVpcmUoJ2xvZGFzaC50aHJvdHRsZScpXG4vLyBjb25zdCBlbl9VUyA9IHJlcXVpcmUoJy4uL2xvY2FsZXMvZW5fVVMnKVxuLy8gY29uc3QgZGVlcEZyZWV6ZSA9IHJlcXVpcmUoJ2RlZXAtZnJlZXplLXN0cmljdCcpXG5cbi8qKlxuICogTWFpbiBVcHB5IGNvcmVcbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gb3B0cyBnZW5lcmFsIG9wdGlvbnMsIGxpa2UgbG9jYWxlcywgdG8gc2hvdyBtb2RhbCBvciBub3QgdG8gc2hvd1xuICovXG5jbGFzcyBVcHB5IHtcbiAgY29uc3RydWN0b3IgKG9wdHMpIHtcbiAgICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAvLyBsb2FkIEVuZ2xpc2ggYXMgdGhlIGRlZmF1bHQgbG9jYWxlXG4gICAgICAvLyBsb2NhbGU6IGVuX1VTLFxuICAgICAgYXV0b1Byb2NlZWQ6IHRydWUsXG4gICAgICBkZWJ1ZzogZmFsc2VcbiAgICB9XG5cbiAgICAvLyBNZXJnZSBkZWZhdWx0IG9wdGlvbnMgd2l0aCB0aGUgb25lcyBzZXQgYnkgdXNlclxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuXG4gICAgLy8gLy8gRGljdGF0ZXMgaW4gd2hhdCBvcmRlciBkaWZmZXJlbnQgcGx1Z2luIHR5cGVzIGFyZSByYW46XG4gICAgLy8gdGhpcy50eXBlcyA9IFsgJ3ByZXNldHRlcicsICdvcmNoZXN0cmF0b3InLCAncHJvZ3Jlc3NpbmRpY2F0b3InLFxuICAgIC8vICAgICAgICAgICAgICAgICAnYWNxdWlyZXInLCAnbW9kaWZpZXInLCAndXBsb2FkZXInLCAncHJlc2VudGVyJywgJ2RlYnVnZ2VyJ11cblxuICAgIC8vIENvbnRhaW5lciBmb3IgZGlmZmVyZW50IHR5cGVzIG9mIHBsdWdpbnNcbiAgICB0aGlzLnBsdWdpbnMgPSB7fVxuXG4gICAgdGhpcy50cmFuc2xhdG9yID0gbmV3IFRyYW5zbGF0b3Ioe2xvY2FsZTogdGhpcy5vcHRzLmxvY2FsZX0pXG4gICAgdGhpcy5pMThuID0gdGhpcy50cmFuc2xhdG9yLnRyYW5zbGF0ZS5iaW5kKHRoaXMudHJhbnNsYXRvcilcbiAgICB0aGlzLmdldFN0YXRlID0gdGhpcy5nZXRTdGF0ZS5iaW5kKHRoaXMpXG4gICAgdGhpcy51cGRhdGVNZXRhID0gdGhpcy51cGRhdGVNZXRhLmJpbmQodGhpcylcbiAgICB0aGlzLmluaXRTb2NrZXQgPSB0aGlzLmluaXRTb2NrZXQuYmluZCh0aGlzKVxuICAgIHRoaXMubG9nID0gdGhpcy5sb2cuYmluZCh0aGlzKVxuICAgIHRoaXMuYWRkRmlsZSA9IHRoaXMuYWRkRmlsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9ncmVzcyA9IHRoaXMuY2FsY3VsYXRlUHJvZ3Jlc3MuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5idXMgPSB0aGlzLmVtaXR0ZXIgPSBlZSgpXG4gICAgdGhpcy5vbiA9IHRoaXMuYnVzLm9uLmJpbmQodGhpcy5idXMpXG4gICAgdGhpcy5lbWl0ID0gdGhpcy5idXMuZW1pdC5iaW5kKHRoaXMuYnVzKVxuXG4gICAgdGhpcy5wcmVQcm9jZXNzb3JzID0gW11cbiAgICB0aGlzLnVwbG9hZGVycyA9IFtdXG4gICAgdGhpcy5wb3N0UHJvY2Vzc29ycyA9IFtdXG5cbiAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgZmlsZXM6IHt9LFxuICAgICAgY2FwYWJpbGl0aWVzOiB7XG4gICAgICAgIHJlc3VtYWJsZVVwbG9hZHM6IGZhbHNlXG4gICAgICB9LFxuICAgICAgdG90YWxQcm9ncmVzczogMFxuICAgIH1cblxuICAgIC8vIGZvciBkZWJ1Z2dpbmcgYW5kIHRlc3RpbmdcbiAgICB0aGlzLnVwZGF0ZU51bSA9IDBcbiAgICBpZiAodGhpcy5vcHRzLmRlYnVnKSB7XG4gICAgICBnbG9iYWwuVXBweVN0YXRlID0gdGhpcy5zdGF0ZVxuICAgICAgZ2xvYmFsLnVwcHlMb2cgPSAnJ1xuICAgICAgZ2xvYmFsLlVwcHlBZGRGaWxlID0gdGhpcy5hZGRGaWxlLmJpbmQodGhpcylcbiAgICAgIGdsb2JhbC5fVXBweSA9IHRoaXNcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSXRlcmF0ZSBvbiBhbGwgcGx1Z2lucyBhbmQgcnVuIGB1cGRhdGVgIG9uIHRoZW0uIENhbGxlZCBlYWNoIHRpbWUgc3RhdGUgY2hhbmdlc1xuICAgKlxuICAgKi9cbiAgdXBkYXRlQWxsIChzdGF0ZSkge1xuICAgIE9iamVjdC5rZXlzKHRoaXMucGx1Z2lucykuZm9yRWFjaCgocGx1Z2luVHlwZSkgPT4ge1xuICAgICAgdGhpcy5wbHVnaW5zW3BsdWdpblR5cGVdLmZvckVhY2goKHBsdWdpbikgPT4ge1xuICAgICAgICBwbHVnaW4udXBkYXRlKHN0YXRlKVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZXMgc3RhdGVcbiAgICpcbiAgICogQHBhcmFtIHtuZXdTdGF0ZX0gb2JqZWN0XG4gICAqL1xuICBzZXRTdGF0ZSAoc3RhdGVVcGRhdGUpIHtcbiAgICBjb25zdCBuZXdTdGF0ZSA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuc3RhdGUsIHN0YXRlVXBkYXRlKVxuICAgIHRoaXMuZW1pdCgnY29yZTpzdGF0ZS11cGRhdGUnLCB0aGlzLnN0YXRlLCBuZXdTdGF0ZSwgc3RhdGVVcGRhdGUpXG5cbiAgICB0aGlzLnN0YXRlID0gbmV3U3RhdGVcbiAgICB0aGlzLnVwZGF0ZUFsbCh0aGlzLnN0YXRlKVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgY3VycmVudCBzdGF0ZVxuICAgKlxuICAgKi9cbiAgZ2V0U3RhdGUgKCkge1xuICAgIC8vIHVzZSBkZWVwRnJlZXplIGZvciBkZWJ1Z2dpbmdcbiAgICAvLyByZXR1cm4gZGVlcEZyZWV6ZSh0aGlzLnN0YXRlKVxuICAgIHJldHVybiB0aGlzLnN0YXRlXG4gIH1cblxuICBhZGRQcmVQcm9jZXNzb3IgKGZuKSB7XG4gICAgdGhpcy5wcmVQcm9jZXNzb3JzLnB1c2goZm4pXG4gIH1cblxuICByZW1vdmVQcmVQcm9jZXNzb3IgKGZuKSB7XG4gICAgY29uc3QgaSA9IHRoaXMucHJlUHJvY2Vzc29ycy5pbmRleE9mKGZuKVxuICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgdGhpcy5wcmVQcm9jZXNzb3JzLnNwbGljZShpLCAxKVxuICAgIH1cbiAgfVxuXG4gIGFkZFBvc3RQcm9jZXNzb3IgKGZuKSB7XG4gICAgdGhpcy5wb3N0UHJvY2Vzc29ycy5wdXNoKGZuKVxuICB9XG5cbiAgcmVtb3ZlUG9zdFByb2Nlc3NvciAoZm4pIHtcbiAgICBjb25zdCBpID0gdGhpcy5wb3N0UHJvY2Vzc29ycy5pbmRleE9mKGZuKVxuICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgdGhpcy5wb3N0UHJvY2Vzc29ycy5zcGxpY2UoaSwgMSlcbiAgICB9XG4gIH1cblxuICBhZGRVcGxvYWRlciAoZm4pIHtcbiAgICB0aGlzLnVwbG9hZGVycy5wdXNoKGZuKVxuICB9XG5cbiAgcmVtb3ZlVXBsb2FkZXIgKGZuKSB7XG4gICAgY29uc3QgaSA9IHRoaXMudXBsb2FkZXJzLmluZGV4T2YoZm4pXG4gICAgaWYgKGkgIT09IC0xKSB7XG4gICAgICB0aGlzLnVwbG9hZGVycy5zcGxpY2UoaSwgMSlcbiAgICB9XG4gIH1cblxuICB1cGRhdGVNZXRhIChkYXRhLCBmaWxlSUQpIHtcbiAgICBjb25zdCB1cGRhdGVkRmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgY29uc3QgbmV3TWV0YSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLm1ldGEsIGRhdGEpXG4gICAgdXBkYXRlZEZpbGVzW2ZpbGVJRF0gPSBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXSwge1xuICAgICAgbWV0YTogbmV3TWV0YVxuICAgIH0pXG4gICAgdGhpcy5zZXRTdGF0ZSh7ZmlsZXM6IHVwZGF0ZWRGaWxlc30pXG4gIH1cblxuICBhZGRGaWxlIChmaWxlKSB7XG4gICAgY29uc3QgdXBkYXRlZEZpbGVzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5zdGF0ZS5maWxlcylcblxuICAgIGNvbnN0IGZpbGVOYW1lID0gZmlsZS5uYW1lIHx8ICdub25hbWUnXG4gICAgY29uc3QgZmlsZVR5cGUgPSBVdGlscy5nZXRGaWxlVHlwZShmaWxlKVxuICAgIGNvbnN0IGZpbGVUeXBlR2VuZXJhbCA9IGZpbGVUeXBlWzBdXG4gICAgY29uc3QgZmlsZVR5cGVTcGVjaWZpYyA9IGZpbGVUeXBlWzFdXG4gICAgY29uc3QgZmlsZUV4dGVuc2lvbiA9IFV0aWxzLmdldEZpbGVOYW1lQW5kRXh0ZW5zaW9uKGZpbGVOYW1lKVsxXVxuICAgIGNvbnN0IGlzUmVtb3RlID0gZmlsZS5pc1JlbW90ZSB8fCBmYWxzZVxuXG4gICAgY29uc3QgZmlsZUlEID0gVXRpbHMuZ2VuZXJhdGVGaWxlSUQoZmlsZU5hbWUpXG5cbiAgICBjb25zdCBuZXdGaWxlID0ge1xuICAgICAgc291cmNlOiBmaWxlLnNvdXJjZSB8fCAnJyxcbiAgICAgIGlkOiBmaWxlSUQsXG4gICAgICBuYW1lOiBmaWxlTmFtZSxcbiAgICAgIGV4dGVuc2lvbjogZmlsZUV4dGVuc2lvbiB8fCAnJyxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgbmFtZTogZmlsZU5hbWVcbiAgICAgIH0sXG4gICAgICB0eXBlOiB7XG4gICAgICAgIGdlbmVyYWw6IGZpbGVUeXBlR2VuZXJhbCxcbiAgICAgICAgc3BlY2lmaWM6IGZpbGVUeXBlU3BlY2lmaWNcbiAgICAgIH0sXG4gICAgICBkYXRhOiBmaWxlLmRhdGEsXG4gICAgICBwcm9ncmVzczoge1xuICAgICAgICBwZXJjZW50YWdlOiAwLFxuICAgICAgICB1cGxvYWRDb21wbGV0ZTogZmFsc2UsXG4gICAgICAgIHVwbG9hZFN0YXJ0ZWQ6IGZhbHNlXG4gICAgICB9LFxuICAgICAgc2l6ZTogZmlsZS5kYXRhLnNpemUgfHwgJ04vQScsXG4gICAgICBpc1JlbW90ZTogaXNSZW1vdGUsXG4gICAgICByZW1vdGU6IGZpbGUucmVtb3RlIHx8ICcnLFxuICAgICAgcHJldmlldzogZmlsZS5wcmV2aWV3XG4gICAgfVxuXG4gICAgdXBkYXRlZEZpbGVzW2ZpbGVJRF0gPSBuZXdGaWxlXG4gICAgdGhpcy5zZXRTdGF0ZSh7ZmlsZXM6IHVwZGF0ZWRGaWxlc30pXG5cbiAgICB0aGlzLmJ1cy5lbWl0KCdmaWxlLWFkZGVkJywgZmlsZUlEKVxuICAgIHRoaXMubG9nKGBBZGRlZCBmaWxlOiAke2ZpbGVOYW1lfSwgJHtmaWxlSUR9LCBtaW1lIHR5cGU6ICR7ZmlsZVR5cGV9YClcblxuICAgIGlmIChmaWxlVHlwZUdlbmVyYWwgPT09ICdpbWFnZScgJiYgIWlzUmVtb3RlKSB7XG4gICAgICB0aGlzLmFkZFRodW1ibmFpbChuZXdGaWxlLmlkKVxuICAgIH1cblxuICAgIGlmICh0aGlzLm9wdHMuYXV0b1Byb2NlZWQpIHtcbiAgICAgIHRoaXMudXBsb2FkKClcbiAgICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIubWVzc2FnZSlcbiAgICAgICAgfSlcbiAgICAgIC8vIHRoaXMuYnVzLmVtaXQoJ2NvcmU6dXBsb2FkJylcbiAgICB9XG4gIH1cblxuICByZW1vdmVGaWxlIChmaWxlSUQpIHtcbiAgICBjb25zdCB1cGRhdGVkRmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgZGVsZXRlIHVwZGF0ZWRGaWxlc1tmaWxlSURdXG4gICAgdGhpcy5zZXRTdGF0ZSh7ZmlsZXM6IHVwZGF0ZWRGaWxlc30pXG4gICAgdGhpcy5jYWxjdWxhdGVUb3RhbFByb2dyZXNzKClcbiAgICB0aGlzLmxvZyhgUmVtb3ZlZCBmaWxlOiAke2ZpbGVJRH1gKVxuICB9XG5cbiAgYWRkVGh1bWJuYWlsIChmaWxlSUQpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRTdGF0ZSgpLmZpbGVzW2ZpbGVJRF1cblxuICAgIC8vIGNvbnN0IHRodW1ibmFpbCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoZmlsZS5kYXRhKVxuICAgIC8vIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcbiAgICAvLyBjb25zdCB1cGRhdGVkRmlsZSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLCB7XG4gICAgLy8gICBwcmV2aWV3OiB0aHVtYm5haWxcbiAgICAvLyB9KVxuICAgIC8vIHVwZGF0ZWRGaWxlc1tmaWxlSURdID0gdXBkYXRlZEZpbGVcbiAgICAvLyB0aGlzLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcblxuICAgIFV0aWxzLnJlYWRGaWxlKGZpbGUuZGF0YSlcbiAgICAgIC50aGVuKChpbWdEYXRhVVJJKSA9PiBVdGlscy5jcmVhdGVJbWFnZVRodW1ibmFpbChpbWdEYXRhVVJJLCAyMDApKVxuICAgICAgLnRoZW4oKHRodW1ibmFpbCkgPT4ge1xuICAgICAgICBjb25zdCB1cGRhdGVkRmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgICAgIGNvbnN0IHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0sIHtcbiAgICAgICAgICBwcmV2aWV3OiB0aHVtYm5haWxcbiAgICAgICAgfSlcbiAgICAgICAgdXBkYXRlZEZpbGVzW2ZpbGVJRF0gPSB1cGRhdGVkRmlsZVxuICAgICAgICB0aGlzLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKGVycikgPT4gdGhpcy5sb2coZXJyKSlcbiAgfVxuXG4gIGNhbGN1bGF0ZVByb2dyZXNzIChkYXRhKSB7XG4gICAgY29uc3QgZmlsZUlEID0gZGF0YS5pZFxuICAgIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcblxuICAgIC8vIHNraXAgcHJvZ3Jlc3MgZXZlbnQgZm9yIGEgZmlsZSB0aGF04oCZcyBiZWVuIHJlbW92ZWRcbiAgICBpZiAoIXVwZGF0ZWRGaWxlc1tmaWxlSURdKSB7XG4gICAgICB0aGlzLmxvZygnVHJ5aW5nIHRvIHNldCBwcm9ncmVzcyBmb3IgYSBmaWxlIHRoYXTigJlzIG5vdCB3aXRoIHVzIGFueW1vcmU6ICcsIGZpbGVJRClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0sXG4gICAgICBPYmplY3QuYXNzaWduKHt9LCB7XG4gICAgICAgIHByb2dyZXNzOiBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXS5wcm9ncmVzcywge1xuICAgICAgICAgIGJ5dGVzVXBsb2FkZWQ6IGRhdGEuYnl0ZXNVcGxvYWRlZCxcbiAgICAgICAgICBieXRlc1RvdGFsOiBkYXRhLmJ5dGVzVG90YWwsXG4gICAgICAgICAgcGVyY2VudGFnZTogTWF0aC5mbG9vcigoZGF0YS5ieXRlc1VwbG9hZGVkIC8gZGF0YS5ieXRlc1RvdGFsICogMTAwKS50b0ZpeGVkKDIpKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICkpXG4gICAgdXBkYXRlZEZpbGVzW2RhdGEuaWRdID0gdXBkYXRlZEZpbGVcblxuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgZmlsZXM6IHVwZGF0ZWRGaWxlc1xuICAgIH0pXG5cbiAgICB0aGlzLmNhbGN1bGF0ZVRvdGFsUHJvZ3Jlc3MoKVxuICB9XG5cbiAgY2FsY3VsYXRlVG90YWxQcm9ncmVzcyAoKSB7XG4gICAgLy8gY2FsY3VsYXRlIHRvdGFsIHByb2dyZXNzLCB1c2luZyB0aGUgbnVtYmVyIG9mIGZpbGVzIGN1cnJlbnRseSB1cGxvYWRpbmcsXG4gICAgLy8gbXVsdGlwbGllZCBieSAxMDAgYW5kIHRoZSBzdW1tIG9mIGluZGl2aWR1YWwgcHJvZ3Jlc3Mgb2YgZWFjaCBmaWxlXG4gICAgY29uc3QgZmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG5cbiAgICBjb25zdCBpblByb2dyZXNzID0gT2JqZWN0LmtleXMoZmlsZXMpLmZpbHRlcigoZmlsZSkgPT4ge1xuICAgICAgcmV0dXJuIGZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgICB9KVxuICAgIGNvbnN0IHByb2dyZXNzTWF4ID0gaW5Qcm9ncmVzcy5sZW5ndGggKiAxMDBcbiAgICBsZXQgcHJvZ3Jlc3NBbGwgPSAwXG4gICAgaW5Qcm9ncmVzcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICBwcm9ncmVzc0FsbCA9IHByb2dyZXNzQWxsICsgZmlsZXNbZmlsZV0ucHJvZ3Jlc3MucGVyY2VudGFnZVxuICAgIH0pXG5cbiAgICBjb25zdCB0b3RhbFByb2dyZXNzID0gTWF0aC5mbG9vcigocHJvZ3Jlc3NBbGwgKiAxMDAgLyBwcm9ncmVzc01heCkudG9GaXhlZCgyKSlcblxuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgdG90YWxQcm9ncmVzczogdG90YWxQcm9ncmVzc1xuICAgIH0pXG5cbiAgICAvLyBpZiAodG90YWxQcm9ncmVzcyA9PT0gMTAwKSB7XG4gICAgLy8gICBjb25zdCBjb21wbGV0ZUZpbGVzID0gT2JqZWN0LmtleXModXBkYXRlZEZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAvLyAgICAgLy8gdGhpcyBzaG91bGQgYmUgYHVwbG9hZENvbXBsZXRlYFxuICAgIC8vICAgICByZXR1cm4gdXBkYXRlZEZpbGVzW2ZpbGVdLnByb2dyZXNzLnBlcmNlbnRhZ2UgPT09IDEwMFxuICAgIC8vICAgfSlcbiAgICAvLyAgIHRoaXMuZW1pdCgnY29yZTpzdWNjZXNzJywgY29tcGxldGVGaWxlcy5sZW5ndGgpXG4gICAgLy8gfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVycyBsaXN0ZW5lcnMgZm9yIGFsbCBnbG9iYWwgYWN0aW9ucywgbGlrZTpcbiAgICogYGZpbGUtYWRkYCwgYGZpbGUtcmVtb3ZlYCwgYHVwbG9hZC1wcm9ncmVzc2AsIGByZXNldGBcbiAgICpcbiAgICovXG4gIGFjdGlvbnMgKCkge1xuICAgIC8vIHRoaXMuYnVzLm9uKCcqJywgKHBheWxvYWQpID0+IHtcbiAgICAvLyAgIGNvbnNvbGUubG9nKCdlbWl0dGVkOiAnLCB0aGlzLmV2ZW50KVxuICAgIC8vICAgY29uc29sZS5sb2coJ3dpdGggcGF5bG9hZDogJywgcGF5bG9hZClcbiAgICAvLyB9KVxuXG4gICAgLy8gc3RyZXNzLXRlc3QgcmUtcmVuZGVyaW5nXG4gICAgLy8gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIC8vICAgdGhpcy5zZXRTdGF0ZSh7YmxhOiAnYmxhJ30pXG4gICAgLy8gfSwgMjApXG5cbiAgICB0aGlzLm9uKCdjb3JlOmZpbGUtYWRkJywgKGRhdGEpID0+IHtcbiAgICAgIHRoaXMuYWRkRmlsZShkYXRhKVxuICAgIH0pXG5cbiAgICAvLyBgcmVtb3ZlLWZpbGVgIHJlbW92ZXMgYSBmaWxlIGZyb20gYHN0YXRlLmZpbGVzYCwgZm9yIGV4YW1wbGUgd2hlblxuICAgIC8vIGEgdXNlciBkZWNpZGVzIG5vdCB0byB1cGxvYWQgcGFydGljdWxhciBmaWxlIGFuZCBjbGlja3MgYSBidXR0b24gdG8gcmVtb3ZlIGl0XG4gICAgdGhpcy5vbignY29yZTpmaWxlLXJlbW92ZScsIChmaWxlSUQpID0+IHtcbiAgICAgIHRoaXMucmVtb3ZlRmlsZShmaWxlSUQpXG4gICAgfSlcblxuICAgIHRoaXMub24oJ2NvcmU6Y2FuY2VsLWFsbCcsICgpID0+IHtcbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5nZXRTdGF0ZSgpLmZpbGVzXG4gICAgICBPYmplY3Qua2V5cyhmaWxlcykuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICB0aGlzLnJlbW92ZUZpbGUoZmlsZXNbZmlsZV0uaWQpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0aGlzLm9uKCdjb3JlOnVwbG9hZC1zdGFydGVkJywgKGZpbGVJRCwgdXBsb2FkKSA9PiB7XG4gICAgICBjb25zdCB1cGRhdGVkRmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgICBjb25zdCB1cGRhdGVkRmlsZSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLFxuICAgICAgICBPYmplY3QuYXNzaWduKHt9LCB7XG4gICAgICAgICAgcHJvZ3Jlc3M6IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLnByb2dyZXNzLCB7XG4gICAgICAgICAgICB1cGxvYWRTdGFydGVkOiBEYXRlLm5vdygpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgKSlcbiAgICAgIHVwZGF0ZWRGaWxlc1tmaWxlSURdID0gdXBkYXRlZEZpbGVcblxuICAgICAgdGhpcy5zZXRTdGF0ZSh7ZmlsZXM6IHVwZGF0ZWRGaWxlc30pXG4gICAgfSlcblxuICAgIC8vIHVwbG9hZCBwcm9ncmVzcyBldmVudHMgY2FuIG9jY3VyIGZyZXF1ZW50bHksIGVzcGVjaWFsbHkgd2hlbiB5b3UgaGF2ZSBhIGdvb2RcbiAgICAvLyBjb25uZWN0aW9uIHRvIHRoZSByZW1vdGUgc2VydmVyLiBUaGVyZWZvcmUsIHdlIGFyZSB0aHJvdHRlbGluZyB0aGVtIHRvXG4gICAgLy8gcHJldmVudCBhY2Nlc3NpdmUgZnVuY3Rpb24gY2FsbHMuXG4gICAgLy8gc2VlIGFsc286IGh0dHBzOi8vZ2l0aHViLmNvbS90dXMvdHVzLWpzLWNsaWVudC9jb21taXQvOTk0MGYyN2IyMzYxZmQ3ZTEwYmE1OGIwOWI2MGQ4MjQyMjE4M2JiYlxuICAgIGNvbnN0IHRocm90dGxlZENhbGN1bGF0ZVByb2dyZXNzID0gdGhyb3R0bGUodGhpcy5jYWxjdWxhdGVQcm9ncmVzcywgMTAwLCB7bGVhZGluZzogdHJ1ZSwgdHJhaWxpbmc6IGZhbHNlfSlcblxuICAgIHRoaXMub24oJ2NvcmU6dXBsb2FkLXByb2dyZXNzJywgKGRhdGEpID0+IHtcbiAgICAgIC8vIHRoaXMuY2FsY3VsYXRlUHJvZ3Jlc3MoZGF0YSlcbiAgICAgIHRocm90dGxlZENhbGN1bGF0ZVByb2dyZXNzKGRhdGEpXG4gICAgfSlcblxuICAgIHRoaXMub24oJ2NvcmU6dXBsb2FkLXN1Y2Nlc3MnLCAoZmlsZUlELCB1cGxvYWRSZXNwLCB1cGxvYWRVUkwpID0+IHtcbiAgICAgIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcbiAgICAgIGNvbnN0IHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0sIHtcbiAgICAgICAgcHJvZ3Jlc3M6IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLnByb2dyZXNzLCB7XG4gICAgICAgICAgdXBsb2FkQ29tcGxldGU6IHRydWUsXG4gICAgICAgICAgLy8gZ29vZCBvciBiYWQgaWRlYT8gc2V0dGluZyB0aGUgcGVyY2VudGFnZSB0byAxMDAgaWYgdXBsb2FkIGlzIHN1Y2Nlc3NmdWwsXG4gICAgICAgICAgLy8gc28gdGhhdCBpZiB3ZSBsb3N0IHNvbWUgcHJvZ3Jlc3MgZXZlbnRzIG9uIHRoZSB3YXksIGl0cyBzdGlsbCBtYXJrZWQg4oCcY29tcGV0ZeKAnT9cbiAgICAgICAgICBwZXJjZW50YWdlOiAxMDBcbiAgICAgICAgfSksXG4gICAgICAgIHVwbG9hZFVSTDogdXBsb2FkVVJMXG4gICAgICB9KVxuICAgICAgdXBkYXRlZEZpbGVzW2ZpbGVJRF0gPSB1cGRhdGVkRmlsZVxuXG4gICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgZmlsZXM6IHVwZGF0ZWRGaWxlc1xuICAgICAgfSlcblxuICAgICAgdGhpcy5jYWxjdWxhdGVUb3RhbFByb2dyZXNzKClcblxuICAgICAgaWYgKHRoaXMuZ2V0U3RhdGUoKS50b3RhbFByb2dyZXNzID09PSAxMDApIHtcbiAgICAgICAgY29uc3QgY29tcGxldGVGaWxlcyA9IE9iamVjdC5rZXlzKHVwZGF0ZWRGaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHVwZGF0ZWRGaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRDb21wbGV0ZVxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmVtaXQoJ2NvcmU6dXBsb2FkLWNvbXBsZXRlJywgY29tcGxldGVGaWxlcy5sZW5ndGgpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMub24oJ2NvcmU6dXBkYXRlLW1ldGEnLCAoZGF0YSwgZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLnVwZGF0ZU1ldGEoZGF0YSwgZmlsZUlEKVxuICAgIH0pXG5cbiAgICAvLyBzaG93IGluZm9ybWVyIGlmIG9mZmxpbmVcbiAgICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvbmxpbmUnLCAoKSA9PiB0aGlzLmlzT25saW5lKHRydWUpKVxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ29mZmxpbmUnLCAoKSA9PiB0aGlzLmlzT25saW5lKGZhbHNlKSlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5pc09ubGluZSgpLCAzMDAwKVxuICAgIH1cbiAgfVxuXG4gIGlzT25saW5lIChzdGF0dXMpIHtcbiAgICBjb25zdCBvbmxpbmUgPSBzdGF0dXMgfHwgd2luZG93Lm5hdmlnYXRvci5vbkxpbmVcbiAgICBpZiAoIW9ubGluZSkge1xuICAgICAgdGhpcy5lbWl0KCdpcy1vZmZsaW5lJylcbiAgICAgIHRoaXMuZW1pdCgnaW5mb3JtZXInLCAnTm8gaW50ZXJuZXQgY29ubmVjdGlvbicsICdlcnJvcicsIDApXG4gICAgICB0aGlzLndhc09mZmxpbmUgPSB0cnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZW1pdCgnaXMtb25saW5lJylcbiAgICAgIGlmICh0aGlzLndhc09mZmxpbmUpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdiYWNrLW9ubGluZScpXG4gICAgICAgIHRoaXMuZW1pdCgnaW5mb3JtZXInLCAnQ29ubmVjdGVkIScsICdzdWNjZXNzJywgMzAwMClcbiAgICAgICAgdGhpcy53YXNPZmZsaW5lID0gZmFsc2VcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBwbHVnaW4gd2l0aCBDb3JlXG4gKlxuICogQHBhcmFtIHtDbGFzc30gUGx1Z2luIG9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgb2JqZWN0IHRoYXQgd2lsbCBiZSBwYXNzZWQgdG8gUGx1Z2luIGxhdGVyXG4gKiBAcmV0dXJuIHtPYmplY3R9IHNlbGYgZm9yIGNoYWluaW5nXG4gKi9cbiAgdXNlIChQbHVnaW4sIG9wdHMpIHtcbiAgICAvLyBJbnN0YW50aWF0ZVxuICAgIGNvbnN0IHBsdWdpbiA9IG5ldyBQbHVnaW4odGhpcywgb3B0cylcbiAgICBjb25zdCBwbHVnaW5OYW1lID0gcGx1Z2luLmlkXG4gICAgdGhpcy5wbHVnaW5zW3BsdWdpbi50eXBlXSA9IHRoaXMucGx1Z2luc1twbHVnaW4udHlwZV0gfHwgW11cblxuICAgIGlmICghcGx1Z2luTmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3VyIHBsdWdpbiBtdXN0IGhhdmUgYSBuYW1lJylcbiAgICB9XG5cbiAgICBpZiAoIXBsdWdpbi50eXBlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdXIgcGx1Z2luIG11c3QgaGF2ZSBhIHR5cGUnKVxuICAgIH1cblxuICAgIGxldCBleGlzdHNQbHVnaW5BbHJlYWR5ID0gdGhpcy5nZXRQbHVnaW4ocGx1Z2luTmFtZSlcbiAgICBpZiAoZXhpc3RzUGx1Z2luQWxyZWFkeSkge1xuICAgICAgbGV0IG1zZyA9IGBBbHJlYWR5IGZvdW5kIGEgcGx1Z2luIG5hbWVkICcke2V4aXN0c1BsdWdpbkFscmVhZHkubmFtZX0nLlxuICAgICAgICBUcmllZCB0byB1c2U6ICcke3BsdWdpbk5hbWV9Jy5cbiAgICAgICAgVXBweSBpcyBjdXJyZW50bHkgbGltaXRlZCB0byBydW5uaW5nIG9uZSBvZiBldmVyeSBwbHVnaW4uXG4gICAgICAgIFNoYXJlIHlvdXIgdXNlIGNhc2Ugd2l0aCB1cyBvdmVyIGF0XG4gICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS90cmFuc2xvYWRpdC91cHB5L2lzc3Vlcy9cbiAgICAgICAgaWYgeW91IHdhbnQgdXMgdG8gcmVjb25zaWRlci5gXG4gICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKVxuICAgIH1cblxuICAgIHRoaXMucGx1Z2luc1twbHVnaW4udHlwZV0ucHVzaChwbHVnaW4pXG4gICAgcGx1Z2luLmluc3RhbGwoKVxuXG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4vKipcbiAqIEZpbmQgb25lIFBsdWdpbiBieSBuYW1lXG4gKlxuICogQHBhcmFtIHN0cmluZyBuYW1lIGRlc2NyaXB0aW9uXG4gKi9cbiAgZ2V0UGx1Z2luIChuYW1lKSB7XG4gICAgbGV0IGZvdW5kUGx1Z2luID0gZmFsc2VcbiAgICB0aGlzLml0ZXJhdGVQbHVnaW5zKChwbHVnaW4pID0+IHtcbiAgICAgIGNvbnN0IHBsdWdpbk5hbWUgPSBwbHVnaW4uaWRcbiAgICAgIGlmIChwbHVnaW5OYW1lID09PSBuYW1lKSB7XG4gICAgICAgIGZvdW5kUGx1Z2luID0gcGx1Z2luXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuICAgIH0pXG4gICAgcmV0dXJuIGZvdW5kUGx1Z2luXG4gIH1cblxuLyoqXG4gKiBJdGVyYXRlIHRocm91Z2ggYWxsIGB1c2VgZCBwbHVnaW5zXG4gKlxuICogQHBhcmFtIGZ1bmN0aW9uIG1ldGhvZCBkZXNjcmlwdGlvblxuICovXG4gIGl0ZXJhdGVQbHVnaW5zIChtZXRob2QpIHtcbiAgICBPYmplY3Qua2V5cyh0aGlzLnBsdWdpbnMpLmZvckVhY2goKHBsdWdpblR5cGUpID0+IHtcbiAgICAgIHRoaXMucGx1Z2luc1twbHVnaW5UeXBlXS5mb3JFYWNoKG1ldGhvZClcbiAgICB9KVxuICB9XG5cbiAgLyoqXG4gICAqIFVuaW5zdGFsbCBhbmQgcmVtb3ZlIGEgcGx1Z2luLlxuICAgKlxuICAgKiBAcGFyYW0ge1BsdWdpbn0gaW5zdGFuY2UgVGhlIHBsdWdpbiBpbnN0YW5jZSB0byByZW1vdmUuXG4gICAqL1xuICByZW1vdmVQbHVnaW4gKGluc3RhbmNlKSB7XG4gICAgY29uc3QgbGlzdCA9IHRoaXMucGx1Z2luc1tpbnN0YW5jZS50eXBlXVxuXG4gICAgaWYgKGluc3RhbmNlLnVuaW5zdGFsbCkge1xuICAgICAgaW5zdGFuY2UudW5pbnN0YWxsKClcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleCA9IGxpc3QuaW5kZXhPZihpbnN0YW5jZSlcbiAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICBsaXN0LnNwbGljZShpbmRleCwgMSlcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVW5pbnN0YWxsIGFsbCBwbHVnaW5zIGFuZCBjbG9zZSBkb3duIHRoaXMgVXBweSBpbnN0YW5jZS5cbiAgICovXG4gIGNsb3NlICgpIHtcbiAgICB0aGlzLml0ZXJhdGVQbHVnaW5zKChwbHVnaW4pID0+IHtcbiAgICAgIHBsdWdpbi51bmluc3RhbGwoKVxuICAgIH0pXG5cbiAgICBpZiAodGhpcy5zb2NrZXQpIHtcbiAgICAgIHRoaXMuc29ja2V0LmNsb3NlKClcbiAgICB9XG4gIH1cblxuLyoqXG4gKiBMb2dzIHN0dWZmIHRvIGNvbnNvbGUsIG9ubHkgaWYgYGRlYnVnYCBpcyBzZXQgdG8gdHJ1ZS4gU2lsZW50IGluIHByb2R1Y3Rpb24uXG4gKlxuICogQHJldHVybiB7U3RyaW5nfE9iamVjdH0gdG8gbG9nXG4gKi9cbiAgbG9nIChtc2csIHR5cGUpIHtcbiAgICBpZiAoIXRoaXMub3B0cy5kZWJ1Zykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChtc2cgPT09IGAke21zZ31gKSB7XG4gICAgICBjb25zb2xlLmxvZyhgTE9HOiAke21zZ31gKVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmRpcihtc2cpXG4gICAgfVxuXG4gICAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYExPRzogJHttc2d9YClcbiAgICB9XG5cbiAgICBnbG9iYWwudXBweUxvZyA9IGdsb2JhbC51cHB5TG9nICsgJ1xcbicgKyAnREVCVUcgTE9HOiAnICsgbXNnXG4gIH1cblxuICBpbml0U29ja2V0IChvcHRzKSB7XG4gICAgaWYgKCF0aGlzLnNvY2tldCkge1xuICAgICAgdGhpcy5zb2NrZXQgPSBuZXcgVXBweVNvY2tldChvcHRzKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNvY2tldFxuICB9XG5cbiAgLy8gaW5zdGFsbEFsbCAoKSB7XG4gIC8vICAgT2JqZWN0LmtleXModGhpcy5wbHVnaW5zKS5mb3JFYWNoKChwbHVnaW5UeXBlKSA9PiB7XG4gIC8vICAgICB0aGlzLnBsdWdpbnNbcGx1Z2luVHlwZV0uZm9yRWFjaCgocGx1Z2luKSA9PiB7XG4gIC8vICAgICAgIHBsdWdpbi5pbnN0YWxsKHRoaXMpXG4gIC8vICAgICB9KVxuICAvLyAgIH0pXG4gIC8vIH1cblxuLyoqXG4gKiBJbml0aWFsaXplcyBhY3Rpb25zLCBpbnN0YWxscyBhbGwgcGx1Z2lucyAoYnkgaXRlcmF0aW5nIG9uIHRoZW0gYW5kIGNhbGxpbmcgYGluc3RhbGxgKSwgc2V0cyBvcHRpb25zXG4gKlxuICovXG4gIHJ1biAoKSB7XG4gICAgdGhpcy5sb2coJ0NvcmUgaXMgcnVuLCBpbml0aWFsaXppbmcgYWN0aW9ucy4uLicpXG5cbiAgICB0aGlzLmFjdGlvbnMoKVxuXG4gICAgLy8gRm9yc2Ugc2V0IGBhdXRvUHJvY2VlZGAgb3B0aW9uIHRvIGZhbHNlIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBzZWxlY3RvciBQbHVnaW5zIGFjdGl2ZVxuICAgIC8vIGlmICh0aGlzLnBsdWdpbnMuYWNxdWlyZXIgJiYgdGhpcy5wbHVnaW5zLmFjcXVpcmVyLmxlbmd0aCA+IDEpIHtcbiAgICAvLyAgIHRoaXMub3B0cy5hdXRvUHJvY2VlZCA9IGZhbHNlXG4gICAgLy8gfVxuXG4gICAgLy8gSW5zdGFsbCBhbGwgcGx1Z2luc1xuICAgIC8vIHRoaXMuaW5zdGFsbEFsbCgpXG5cbiAgICByZXR1cm5cbiAgfVxuXG4gIHVwbG9hZCAoKSB7XG4gICAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKVxuXG4gICAgdGhpcy5lbWl0KCdjb3JlOnVwbG9hZCcpXG5cbiAgICA7W10uY29uY2F0KFxuICAgICAgdGhpcy5wcmVQcm9jZXNzb3JzLFxuICAgICAgdGhpcy51cGxvYWRlcnMsXG4gICAgICB0aGlzLnBvc3RQcm9jZXNzb3JzXG4gICAgKS5mb3JFYWNoKChmbikgPT4ge1xuICAgICAgcHJvbWlzZSA9IHByb21pc2UudGhlbigoKSA9PiBmbigpKVxuICAgIH0pXG5cbiAgICAvLyBOb3QgcmV0dXJuaW5nIHRoZSBgY2F0Y2hgZWQgcHJvbWlzZSwgYmVjYXVzZSB3ZSBzdGlsbCB3YW50IHRvIHJldHVybiBhIHJlamVjdGVkXG4gICAgLy8gcHJvbWlzZSBmcm9tIHRoaXMgbWV0aG9kIGlmIHRoZSB1cGxvYWQgZmFpbGVkLlxuICAgIHByb21pc2UuY2F0Y2goKGVycikgPT4ge1xuICAgICAgdGhpcy5lbWl0KCdjb3JlOmVycm9yJywgZXJyKVxuICAgIH0pXG5cbiAgICByZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgIHRoaXMuZW1pdCgnY29yZTpzdWNjZXNzJylcbiAgICB9KVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9wdHMpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFVwcHkpKSB7XG4gICAgcmV0dXJuIG5ldyBVcHB5KG9wdHMpXG4gIH1cbn1cbiIsIi8qKlxuICogVHJhbnNsYXRlcyBzdHJpbmdzIHdpdGggaW50ZXJwb2xhdGlvbiAmIHBsdXJhbGl6YXRpb24gc3VwcG9ydC5cbiAqIEV4dGVuc2libGUgd2l0aCBjdXN0b20gZGljdGlvbmFyaWVzIGFuZCBwbHVyYWxpemF0aW9uIGZ1bmN0aW9ucy5cbiAqXG4gKiBCb3Jyb3dzIGhlYXZpbHkgZnJvbSBhbmQgaW5zcGlyZWQgYnkgUG9seWdsb3QgaHR0cHM6Ly9naXRodWIuY29tL2FpcmJuYi9wb2x5Z2xvdC5qcyxcbiAqIGJhc2ljYWxseSBhIHN0cmlwcGVkLWRvd24gdmVyc2lvbiBvZiBpdC4gRGlmZmVyZW5jZXM6IHBsdXJhbGl6YXRpb24gZnVuY3Rpb25zIGFyZSBub3QgaGFyZGNvZGVkXG4gKiBhbmQgY2FuIGJlIGVhc2lseSBhZGRlZCBhbW9uZyB3aXRoIGRpY3Rpb25hcmllcywgbmVzdGVkIG9iamVjdHMgYXJlIHVzZWQgZm9yIHBsdXJhbGl6YXRpb25cbiAqIGFzIG9wcG9zZWQgdG8gYHx8fHxgIGRlbGltZXRlclxuICpcbiAqIFVzYWdlIGV4YW1wbGU6IGB0cmFuc2xhdG9yLnRyYW5zbGF0ZSgnZmlsZXNfY2hvc2VuJywge3NtYXJ0X2NvdW50OiAzfSlgXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IG9wdHNcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBUcmFuc2xhdG9yIHtcbiAgY29uc3RydWN0b3IgKG9wdHMpIHtcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIGxvY2FsZToge1xuICAgICAgICBzdHJpbmdzOiB7fSxcbiAgICAgICAgcGx1cmFsaXplOiBmdW5jdGlvbiAobikge1xuICAgICAgICAgIGlmIChuID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gMFxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gMVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5vcHRzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdE9wdGlvbnMsIG9wdHMpXG4gICAgdGhpcy5sb2NhbGUgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucy5sb2NhbGUsIG9wdHMubG9jYWxlKVxuXG4gICAgLy8gY29uc29sZS5sb2codGhpcy5vcHRzLmxvY2FsZSlcblxuICAgIC8vIHRoaXMubG9jYWxlLnBsdXJhbGl6ZSA9IHRoaXMubG9jYWxlID8gdGhpcy5sb2NhbGUucGx1cmFsaXplIDogZGVmYXVsdFBsdXJhbGl6ZVxuICAgIC8vIHRoaXMubG9jYWxlLnN0cmluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBlbl9VUy5zdHJpbmdzLCB0aGlzLm9wdHMubG9jYWxlLnN0cmluZ3MpXG4gIH1cblxuLyoqXG4gKiBUYWtlcyBhIHN0cmluZyB3aXRoIHBsYWNlaG9sZGVyIHZhcmlhYmxlcyBsaWtlIGAle3NtYXJ0X2NvdW50fSBmaWxlIHNlbGVjdGVkYFxuICogYW5kIHJlcGxhY2VzIGl0IHdpdGggdmFsdWVzIGZyb20gb3B0aW9ucyBge3NtYXJ0X2NvdW50OiA1fWBcbiAqXG4gKiBAbGljZW5zZSBodHRwczovL2dpdGh1Yi5jb20vYWlyYm5iL3BvbHlnbG90LmpzL2Jsb2IvbWFzdGVyL0xJQ0VOU0VcbiAqIHRha2VuIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2FpcmJuYi9wb2x5Z2xvdC5qcy9ibG9iL21hc3Rlci9saWIvcG9seWdsb3QuanMjTDI5OVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBwaHJhc2UgdGhhdCBuZWVkcyBpbnRlcnBvbGF0aW9uLCB3aXRoIHBsYWNlaG9sZGVyc1xuICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgd2l0aCB2YWx1ZXMgdGhhdCB3aWxsIGJlIHVzZWQgdG8gcmVwbGFjZSBwbGFjZWhvbGRlcnNcbiAqIEByZXR1cm4ge3N0cmluZ30gaW50ZXJwb2xhdGVkXG4gKi9cbiAgaW50ZXJwb2xhdGUgKHBocmFzZSwgb3B0aW9ucykge1xuICAgIGNvbnN0IHJlcGxhY2UgPSBTdHJpbmcucHJvdG90eXBlLnJlcGxhY2VcbiAgICBjb25zdCBkb2xsYXJSZWdleCA9IC9cXCQvZ1xuICAgIGNvbnN0IGRvbGxhckJpbGxzWWFsbCA9ICckJCQkJ1xuXG4gICAgZm9yIChsZXQgYXJnIGluIG9wdGlvbnMpIHtcbiAgICAgIGlmIChhcmcgIT09ICdfJyAmJiBvcHRpb25zLmhhc093blByb3BlcnR5KGFyZykpIHtcbiAgICAgICAgLy8gRW5zdXJlIHJlcGxhY2VtZW50IHZhbHVlIGlzIGVzY2FwZWQgdG8gcHJldmVudCBzcGVjaWFsICQtcHJlZml4ZWRcbiAgICAgICAgLy8gcmVnZXggcmVwbGFjZSB0b2tlbnMuIHRoZSBcIiQkJCRcIiBpcyBuZWVkZWQgYmVjYXVzZSBlYWNoIFwiJFwiIG5lZWRzIHRvXG4gICAgICAgIC8vIGJlIGVzY2FwZWQgd2l0aCBcIiRcIiBpdHNlbGYsIGFuZCB3ZSBuZWVkIHR3byBpbiB0aGUgcmVzdWx0aW5nIG91dHB1dC5cbiAgICAgICAgdmFyIHJlcGxhY2VtZW50ID0gb3B0aW9uc1thcmddXG4gICAgICAgIGlmICh0eXBlb2YgcmVwbGFjZW1lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgcmVwbGFjZW1lbnQgPSByZXBsYWNlLmNhbGwob3B0aW9uc1thcmddLCBkb2xsYXJSZWdleCwgZG9sbGFyQmlsbHNZYWxsKVxuICAgICAgICB9XG4gICAgICAgIC8vIFdlIGNyZWF0ZSBhIG5ldyBgUmVnRXhwYCBlYWNoIHRpbWUgaW5zdGVhZCBvZiB1c2luZyBhIG1vcmUtZWZmaWNpZW50XG4gICAgICAgIC8vIHN0cmluZyByZXBsYWNlIHNvIHRoYXQgdGhlIHNhbWUgYXJndW1lbnQgY2FuIGJlIHJlcGxhY2VkIG11bHRpcGxlIHRpbWVzXG4gICAgICAgIC8vIGluIHRoZSBzYW1lIHBocmFzZS5cbiAgICAgICAgcGhyYXNlID0gcmVwbGFjZS5jYWxsKHBocmFzZSwgbmV3IFJlZ0V4cCgnJVxcXFx7JyArIGFyZyArICdcXFxcfScsICdnJyksIHJlcGxhY2VtZW50KVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGhyYXNlXG4gIH1cblxuLyoqXG4gKiBQdWJsaWMgdHJhbnNsYXRlIG1ldGhvZFxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXlcbiAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIHdpdGggdmFsdWVzIHRoYXQgd2lsbCBiZSB1c2VkIGxhdGVyIHRvIHJlcGxhY2UgcGxhY2Vob2xkZXJzIGluIHN0cmluZ1xuICogQHJldHVybiB7c3RyaW5nfSB0cmFuc2xhdGVkIChhbmQgaW50ZXJwb2xhdGVkKVxuICovXG4gIHRyYW5zbGF0ZSAoa2V5LCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5zbWFydF9jb3VudCkge1xuICAgICAgdmFyIHBsdXJhbCA9IHRoaXMubG9jYWxlLnBsdXJhbGl6ZShvcHRpb25zLnNtYXJ0X2NvdW50KVxuICAgICAgcmV0dXJuIHRoaXMuaW50ZXJwb2xhdGUodGhpcy5vcHRzLmxvY2FsZS5zdHJpbmdzW2tleV1bcGx1cmFsXSwgb3B0aW9ucylcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5pbnRlcnBvbGF0ZSh0aGlzLm9wdHMubG9jYWxlLnN0cmluZ3Nba2V5XSwgb3B0aW9ucylcbiAgfVxufVxuIiwiY29uc3QgZWUgPSByZXF1aXJlKCduYW1lc3BhY2UtZW1pdHRlcicpXG5cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgVXBweVNvY2tldCB7XG4gIGNvbnN0cnVjdG9yIChvcHRzKSB7XG4gICAgdGhpcy5xdWV1ZWQgPSBbXVxuICAgIHRoaXMuaXNPcGVuID0gZmFsc2VcbiAgICB0aGlzLnNvY2tldCA9IG5ldyBXZWJTb2NrZXQob3B0cy50YXJnZXQpXG4gICAgdGhpcy5lbWl0dGVyID0gZWUoKVxuXG4gICAgdGhpcy5zb2NrZXQub25vcGVuID0gKGUpID0+IHtcbiAgICAgIHRoaXMuaXNPcGVuID0gdHJ1ZVxuXG4gICAgICB3aGlsZSAodGhpcy5xdWV1ZWQubGVuZ3RoID4gMCAmJiB0aGlzLmlzT3Blbikge1xuICAgICAgICBjb25zdCBmaXJzdCA9IHRoaXMucXVldWVkWzBdXG4gICAgICAgIHRoaXMuc2VuZChmaXJzdC5hY3Rpb24sIGZpcnN0LnBheWxvYWQpXG4gICAgICAgIHRoaXMucXVldWVkID0gdGhpcy5xdWV1ZWQuc2xpY2UoMSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnNvY2tldC5vbmNsb3NlID0gKGUpID0+IHtcbiAgICAgIHRoaXMuaXNPcGVuID0gZmFsc2VcbiAgICB9XG5cbiAgICB0aGlzLl9oYW5kbGVNZXNzYWdlID0gdGhpcy5faGFuZGxlTWVzc2FnZS5iaW5kKHRoaXMpXG5cbiAgICB0aGlzLnNvY2tldC5vbm1lc3NhZ2UgPSB0aGlzLl9oYW5kbGVNZXNzYWdlXG5cbiAgICB0aGlzLmNsb3NlID0gdGhpcy5jbG9zZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5lbWl0ID0gdGhpcy5lbWl0LmJpbmQodGhpcylcbiAgICB0aGlzLm9uID0gdGhpcy5vbi5iaW5kKHRoaXMpXG4gICAgdGhpcy5vbmNlID0gdGhpcy5vbmNlLmJpbmQodGhpcylcbiAgICB0aGlzLnNlbmQgPSB0aGlzLnNlbmQuYmluZCh0aGlzKVxuICB9XG5cbiAgY2xvc2UgKCkge1xuICAgIHJldHVybiB0aGlzLnNvY2tldC5jbG9zZSgpXG4gIH1cblxuICBzZW5kIChhY3Rpb24sIHBheWxvYWQpIHtcbiAgICAvLyBhdHRhY2ggdXVpZFxuXG4gICAgaWYgKCF0aGlzLmlzT3Blbikge1xuICAgICAgdGhpcy5xdWV1ZWQucHVzaCh7YWN0aW9uLCBwYXlsb2FkfSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMuc29ja2V0LnNlbmQoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgYWN0aW9uLFxuICAgICAgcGF5bG9hZFxuICAgIH0pKVxuICB9XG5cbiAgb24gKGFjdGlvbiwgaGFuZGxlcikge1xuICAgIGNvbnNvbGUubG9nKGFjdGlvbilcbiAgICB0aGlzLmVtaXR0ZXIub24oYWN0aW9uLCBoYW5kbGVyKVxuICB9XG5cbiAgZW1pdCAoYWN0aW9uLCBwYXlsb2FkKSB7XG4gICAgY29uc29sZS5sb2coYWN0aW9uKVxuICAgIHRoaXMuZW1pdHRlci5lbWl0KGFjdGlvbiwgcGF5bG9hZClcbiAgfVxuXG4gIG9uY2UgKGFjdGlvbiwgaGFuZGxlcikge1xuICAgIHRoaXMuZW1pdHRlci5vbmNlKGFjdGlvbiwgaGFuZGxlcilcbiAgfVxuXG4gIF9oYW5kbGVNZXNzYWdlIChlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBKU09OLnBhcnNlKGUuZGF0YSlcbiAgICAgIGNvbnNvbGUubG9nKG1lc3NhZ2UpXG4gICAgICB0aGlzLmVtaXQobWVzc2FnZS5hY3Rpb24sIG1lc3NhZ2UucGF5bG9hZClcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNvbnNvbGUubG9nKGVycilcbiAgICB9XG4gIH1cbn1cbiIsIi8vIGltcG9ydCBtaW1lIGZyb20gJ21pbWUtdHlwZXMnXG4vLyBpbXBvcnQgcGljYSBmcm9tICdwaWNhJ1xuXG4vKipcbiAqIEEgY29sbGVjdGlvbiBvZiBzbWFsbCB1dGlsaXR5IGZ1bmN0aW9ucyB0aGF0IGhlbHAgd2l0aCBkb20gbWFuaXB1bGF0aW9uLCBhZGRpbmcgbGlzdGVuZXJzLFxuICogcHJvbWlzZXMgYW5kIG90aGVyIGdvb2QgdGhpbmdzLlxuICpcbiAqIEBtb2R1bGUgVXRpbHNcbiAqL1xuXG4vKipcbiAqIFNoYWxsb3cgZmxhdHRlbiBuZXN0ZWQgYXJyYXlzLlxuICovXG5mdW5jdGlvbiBmbGF0dGVuIChhcnIpIHtcbiAgcmV0dXJuIFtdLmNvbmNhdC5hcHBseShbXSwgYXJyKVxufVxuXG5mdW5jdGlvbiBpc1RvdWNoRGV2aWNlICgpIHtcbiAgcmV0dXJuICdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdyB8fCAvLyB3b3JrcyBvbiBtb3N0IGJyb3dzZXJzXG4gICAgICAgICAgbmF2aWdhdG9yLm1heFRvdWNoUG9pbnRzICAgLy8gd29ya3Mgb24gSUUxMC8xMSBhbmQgU3VyZmFjZVxufVxuXG4vLyAvKipcbi8vICAqIFNob3J0ZXIgYW5kIGZhc3Qgd2F5IHRvIHNlbGVjdCBhIHNpbmdsZSBub2RlIGluIHRoZSBET01cbi8vICAqIEBwYXJhbSAgIHsgU3RyaW5nIH0gc2VsZWN0b3IgLSB1bmlxdWUgZG9tIHNlbGVjdG9yXG4vLyAgKiBAcGFyYW0gICB7IE9iamVjdCB9IGN0eCAtIERPTSBub2RlIHdoZXJlIHRoZSB0YXJnZXQgb2Ygb3VyIHNlYXJjaCB3aWxsIGlzIGxvY2F0ZWRcbi8vICAqIEByZXR1cm5zIHsgT2JqZWN0IH0gZG9tIG5vZGUgZm91bmRcbi8vICAqL1xuLy8gZnVuY3Rpb24gJCAoc2VsZWN0b3IsIGN0eCkge1xuLy8gICByZXR1cm4gKGN0eCB8fCBkb2N1bWVudCkucXVlcnlTZWxlY3RvcihzZWxlY3Rvcilcbi8vIH1cblxuLy8gLyoqXG4vLyAgKiBTaG9ydGVyIGFuZCBmYXN0IHdheSB0byBzZWxlY3QgbXVsdGlwbGUgbm9kZXMgaW4gdGhlIERPTVxuLy8gICogQHBhcmFtICAgeyBTdHJpbmd8QXJyYXkgfSBzZWxlY3RvciAtIERPTSBzZWxlY3RvciBvciBub2RlcyBsaXN0XG4vLyAgKiBAcGFyYW0gICB7IE9iamVjdCB9IGN0eCAtIERPTSBub2RlIHdoZXJlIHRoZSB0YXJnZXRzIG9mIG91ciBzZWFyY2ggd2lsbCBpcyBsb2NhdGVkXG4vLyAgKiBAcmV0dXJucyB7IE9iamVjdCB9IGRvbSBub2RlcyBmb3VuZFxuLy8gICovXG4vLyBmdW5jdGlvbiAkJCAoc2VsZWN0b3IsIGN0eCkge1xuLy8gICB2YXIgZWxzXG4vLyAgIGlmICh0eXBlb2Ygc2VsZWN0b3IgPT09ICdzdHJpbmcnKSB7XG4vLyAgICAgZWxzID0gKGN0eCB8fCBkb2N1bWVudCkucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcilcbi8vICAgfSBlbHNlIHtcbi8vICAgICBlbHMgPSBzZWxlY3RvclxuLy8gICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChlbHMpXG4vLyAgIH1cbi8vIH1cblxuZnVuY3Rpb24gdHJ1bmNhdGVTdHJpbmcgKHN0ciwgbGVuZ3RoKSB7XG4gIGlmIChzdHIubGVuZ3RoID4gbGVuZ3RoKSB7XG4gICAgcmV0dXJuIHN0ci5zdWJzdHIoMCwgbGVuZ3RoIC8gMikgKyAnLi4uJyArIHN0ci5zdWJzdHIoc3RyLmxlbmd0aCAtIGxlbmd0aCAvIDQsIHN0ci5sZW5ndGgpXG4gIH1cbiAgcmV0dXJuIHN0clxuXG4gIC8vIG1vcmUgcHJlY2lzZSB2ZXJzaW9uIGlmIG5lZWRlZFxuICAvLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS84MzE1ODNcbn1cblxuZnVuY3Rpb24gc2Vjb25kc1RvVGltZSAocmF3U2Vjb25kcykge1xuICBjb25zdCBob3VycyA9IE1hdGguZmxvb3IocmF3U2Vjb25kcyAvIDM2MDApICUgMjRcbiAgY29uc3QgbWludXRlcyA9IE1hdGguZmxvb3IocmF3U2Vjb25kcyAvIDYwKSAlIDYwXG4gIGNvbnN0IHNlY29uZHMgPSBNYXRoLmZsb29yKHJhd1NlY29uZHMgJSA2MClcblxuICByZXR1cm4geyBob3VycywgbWludXRlcywgc2Vjb25kcyB9XG59XG5cbi8qKlxuICogUGFydGl0aW9uIGFycmF5IGJ5IGEgZ3JvdXBpbmcgZnVuY3Rpb24uXG4gKiBAcGFyYW0gIHtbdHlwZV19IGFycmF5ICAgICAgSW5wdXQgYXJyYXlcbiAqIEBwYXJhbSAge1t0eXBlXX0gZ3JvdXBpbmdGbiBHcm91cGluZyBmdW5jdGlvblxuICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgICAgIEFycmF5IG9mIGFycmF5c1xuICovXG5mdW5jdGlvbiBncm91cEJ5IChhcnJheSwgZ3JvdXBpbmdGbikge1xuICByZXR1cm4gYXJyYXkucmVkdWNlKChyZXN1bHQsIGl0ZW0pID0+IHtcbiAgICBsZXQga2V5ID0gZ3JvdXBpbmdGbihpdGVtKVxuICAgIGxldCB4cyA9IHJlc3VsdC5nZXQoa2V5KSB8fCBbXVxuICAgIHhzLnB1c2goaXRlbSlcbiAgICByZXN1bHQuc2V0KGtleSwgeHMpXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9LCBuZXcgTWFwKCkpXG59XG5cbi8qKlxuICogVGVzdHMgaWYgZXZlcnkgYXJyYXkgZWxlbWVudCBwYXNzZXMgcHJlZGljYXRlXG4gKiBAcGFyYW0gIHtBcnJheX0gIGFycmF5ICAgICAgIElucHV0IGFycmF5XG4gKiBAcGFyYW0gIHtPYmplY3R9IHByZWRpY2F0ZUZuIFByZWRpY2F0ZVxuICogQHJldHVybiB7Ym9vbH0gICAgICAgICAgICAgICBFdmVyeSBlbGVtZW50IHBhc3NcbiAqL1xuZnVuY3Rpb24gZXZlcnkgKGFycmF5LCBwcmVkaWNhdGVGbikge1xuICByZXR1cm4gYXJyYXkucmVkdWNlKChyZXN1bHQsIGl0ZW0pID0+IHtcbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgcmV0dXJuIHByZWRpY2F0ZUZuKGl0ZW0pXG4gIH0sIHRydWUpXG59XG5cbi8qKlxuICogQ29udmVydHMgbGlzdCBpbnRvIGFycmF5XG4qL1xuZnVuY3Rpb24gdG9BcnJheSAobGlzdCkge1xuICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwobGlzdCB8fCBbXSwgMClcbn1cblxuLyoqXG4gKiBUYWtlcyBhIGZpbGVOYW1lIGFuZCB0dXJucyBpdCBpbnRvIGZpbGVJRCwgYnkgY29udmVydGluZyB0byBsb3dlcmNhc2UsXG4gKiByZW1vdmluZyBleHRyYSBjaGFyYWN0ZXJzIGFuZCBhZGRpbmcgdW5peCB0aW1lc3RhbXBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZU5hbWVcbiAqXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlRmlsZUlEIChmaWxlTmFtZSkge1xuICBsZXQgZmlsZUlEID0gZmlsZU5hbWUudG9Mb3dlckNhc2UoKVxuICBmaWxlSUQgPSBmaWxlSUQucmVwbGFjZSgvW15BLVowLTldL2lnLCAnJylcbiAgZmlsZUlEID0gZmlsZUlEICsgRGF0ZS5ub3coKVxuICByZXR1cm4gZmlsZUlEXG59XG5cbmZ1bmN0aW9uIGV4dGVuZCAoLi4ub2Jqcykge1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbi5hcHBseSh0aGlzLCBbe31dLmNvbmNhdChvYmpzKSlcbn1cblxuLyoqXG4gKiBUYWtlcyBmdW5jdGlvbiBvciBjbGFzcywgcmV0dXJucyBpdHMgbmFtZS5cbiAqIEJlY2F1c2UgSUUgZG9lc27igJl0IHN1cHBvcnQgYGNvbnN0cnVjdG9yLm5hbWVgLlxuICogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vZGZrYXllLzYzODQ0MzksIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE1NzE0NDQ1XG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGZuIOKAlCBmdW5jdGlvblxuICpcbiAqL1xuLy8gZnVuY3Rpb24gZ2V0Rm5OYW1lIChmbikge1xuLy8gICB2YXIgZiA9IHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJ1xuLy8gICB2YXIgcyA9IGYgJiYgKChmbi5uYW1lICYmIFsnJywgZm4ubmFtZV0pIHx8IGZuLnRvU3RyaW5nKCkubWF0Y2goL2Z1bmN0aW9uIChbXlxcKF0rKS8pKVxuLy8gICByZXR1cm4gKCFmICYmICdub3QgYSBmdW5jdGlvbicpIHx8IChzICYmIHNbMV0gfHwgJ2Fub255bW91cycpXG4vLyB9XG5cbmZ1bmN0aW9uIGdldFByb3BvcnRpb25hbEltYWdlSGVpZ2h0IChpbWcsIG5ld1dpZHRoKSB7XG4gIHZhciBhc3BlY3QgPSBpbWcud2lkdGggLyBpbWcuaGVpZ2h0XG4gIHZhciBuZXdIZWlnaHQgPSBNYXRoLnJvdW5kKG5ld1dpZHRoIC8gYXNwZWN0KVxuICByZXR1cm4gbmV3SGVpZ2h0XG59XG5cbmZ1bmN0aW9uIGdldEZpbGVUeXBlIChmaWxlKSB7XG4gIHJldHVybiBmaWxlLnR5cGUgPyBmaWxlLnR5cGUuc3BsaXQoJy8nKSA6IFsnJywgJyddXG4gIC8vIHJldHVybiBtaW1lLmxvb2t1cChmaWxlLm5hbWUpXG59XG5cbi8vIFRPRE8gQ2hlY2sgd2hpY2ggdHlwZXMgYXJlIGFjdHVhbGx5IHN1cHBvcnRlZCBpbiBicm93c2Vycy4gQ2hyb21lIGxpa2VzIHdlYm1cbi8vIGZyb20gbXkgdGVzdGluZywgYnV0IHdlIG1heSBuZWVkIG1vcmUuXG4vLyBXZSBjb3VsZCB1c2UgYSBsaWJyYXJ5IGJ1dCB0aGV5IHRlbmQgdG8gY29udGFpbiBkb3plbnMgb2YgS0JzIG9mIG1hcHBpbmdzLFxuLy8gbW9zdCBvZiB3aGljaCB3aWxsIGdvIHVudXNlZCwgc28gbm90IHN1cmUgaWYgdGhhdCdzIHdvcnRoIGl0LlxuY29uc3QgbWltZVRvRXh0ZW5zaW9ucyA9IHtcbiAgJ3ZpZGVvL29nZyc6ICdvZ3YnLFxuICAnYXVkaW8vb2dnJzogJ29nZycsXG4gICd2aWRlby93ZWJtJzogJ3dlYm0nLFxuICAnYXVkaW8vd2VibSc6ICd3ZWJtJyxcbiAgJ3ZpZGVvL21wNCc6ICdtcDQnLFxuICAnYXVkaW8vbXAzJzogJ21wMydcbn1cblxuZnVuY3Rpb24gZ2V0RmlsZVR5cGVFeHRlbnNpb24gKG1pbWVUeXBlKSB7XG4gIHJldHVybiBtaW1lVG9FeHRlbnNpb25zW21pbWVUeXBlXSB8fCBudWxsXG59XG5cbi8vIHJldHVybnMgW2ZpbGVOYW1lLCBmaWxlRXh0XVxuZnVuY3Rpb24gZ2V0RmlsZU5hbWVBbmRFeHRlbnNpb24gKGZ1bGxGaWxlTmFtZSkge1xuICB2YXIgcmUgPSAvKD86XFwuKFteLl0rKSk/JC9cbiAgdmFyIGZpbGVFeHQgPSByZS5leGVjKGZ1bGxGaWxlTmFtZSlbMV1cbiAgdmFyIGZpbGVOYW1lID0gZnVsbEZpbGVOYW1lLnJlcGxhY2UoJy4nICsgZmlsZUV4dCwgJycpXG4gIHJldHVybiBbZmlsZU5hbWUsIGZpbGVFeHRdXG59XG5cbi8qKlxuICogUmVhZHMgZmlsZSBhcyBkYXRhIFVSSSBmcm9tIGZpbGUgb2JqZWN0LFxuICogdGhlIG9uZSB5b3UgZ2V0IGZyb20gaW5wdXRbdHlwZT1maWxlXSBvciBkcmFnICYgZHJvcC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gZmlsZSBvYmplY3RcbiAqIEByZXR1cm4ge1Byb21pc2V9IGRhdGFVUkwgb2YgdGhlIGZpbGVcbiAqXG4gKi9cbmZ1bmN0aW9uIHJlYWRGaWxlIChmaWxlT2JqKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKVxuICAgIHJlYWRlci5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZShldi50YXJnZXQucmVzdWx0KVxuICAgIH0pXG4gICAgcmVhZGVyLnJlYWRBc0RhdGFVUkwoZmlsZU9iailcblxuICAgIC8vIGZ1bmN0aW9uIHdvcmtlclNjcmlwdCAoKSB7XG4gICAgLy8gICBzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZSkgPT4ge1xuICAgIC8vICAgICBjb25zdCBmaWxlID0gZS5kYXRhLmZpbGVcbiAgICAvLyAgICAgdHJ5IHtcbiAgICAvLyAgICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlclN5bmMoKVxuICAgIC8vICAgICAgIHBvc3RNZXNzYWdlKHtcbiAgICAvLyAgICAgICAgIGZpbGU6IHJlYWRlci5yZWFkQXNEYXRhVVJMKGZpbGUpXG4gICAgLy8gICAgICAgfSlcbiAgICAvLyAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gICAgICAgY29uc29sZS5sb2coZXJyKVxuICAgIC8vICAgICB9XG4gICAgLy8gICB9KVxuICAgIC8vIH1cbiAgICAvL1xuICAgIC8vIGNvbnN0IHdvcmtlciA9IG1ha2VXb3JrZXIod29ya2VyU2NyaXB0KVxuICAgIC8vIHdvcmtlci5wb3N0TWVzc2FnZSh7ZmlsZTogZmlsZU9ian0pXG4gICAgLy8gd29ya2VyLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZSkgPT4ge1xuICAgIC8vICAgY29uc3QgZmlsZURhdGFVUkwgPSBlLmRhdGEuZmlsZVxuICAgIC8vICAgY29uc29sZS5sb2coJ0ZJTEUgXyBEQVRBIF8gVVJMJylcbiAgICAvLyAgIHJldHVybiByZXNvbHZlKGZpbGVEYXRhVVJMKVxuICAgIC8vIH0pXG4gIH0pXG59XG5cbi8qKlxuICogUmVzaXplcyBhbiBpbWFnZSB0byBzcGVjaWZpZWQgd2lkdGggYW5kIHByb3BvcnRpb25hbCBoZWlnaHQsIHVzaW5nIGNhbnZhc1xuICogU2VlIGh0dHBzOi8vZGF2aWR3YWxzaC5uYW1lL3Jlc2l6ZS1pbWFnZS1jYW52YXMsXG4gKiBodHRwOi8vYmFiYWxhbi5jb20vcmVzaXppbmctaW1hZ2VzLXdpdGgtamF2YXNjcmlwdC9cbiAqIEBUT0RPIHNlZSBpZiB3ZSBuZWVkIGh0dHBzOi8vZ2l0aHViLmNvbS9zdG9taXRhL2lvcy1pbWFnZWZpbGUtbWVnYXBpeGVsIGZvciBpT1NcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gRGF0YSBVUkkgb2YgdGhlIG9yaWdpbmFsIGltYWdlXG4gKiBAcGFyYW0ge1N0cmluZ30gd2lkdGggb2YgdGhlIHJlc3VsdGluZyBpbWFnZVxuICogQHJldHVybiB7U3RyaW5nfSBEYXRhIFVSSSBvZiB0aGUgcmVzaXplZCBpbWFnZVxuICovXG5mdW5jdGlvbiBjcmVhdGVJbWFnZVRodW1ibmFpbCAoaW1nRGF0YVVSSSwgbmV3V2lkdGgpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKVxuICAgIGltZy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgKCkgPT4ge1xuICAgICAgY29uc3QgbmV3SW1hZ2VXaWR0aCA9IG5ld1dpZHRoXG4gICAgICBjb25zdCBuZXdJbWFnZUhlaWdodCA9IGdldFByb3BvcnRpb25hbEltYWdlSGVpZ2h0KGltZywgbmV3SW1hZ2VXaWR0aClcblxuICAgICAgLy8gY3JlYXRlIGFuIG9mZi1zY3JlZW4gY2FudmFzXG4gICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKVxuICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJylcblxuICAgICAgLy8gc2V0IGl0cyBkaW1lbnNpb24gdG8gdGFyZ2V0IHNpemVcbiAgICAgIGNhbnZhcy53aWR0aCA9IG5ld0ltYWdlV2lkdGhcbiAgICAgIGNhbnZhcy5oZWlnaHQgPSBuZXdJbWFnZUhlaWdodFxuXG4gICAgICAvLyBkcmF3IHNvdXJjZSBpbWFnZSBpbnRvIHRoZSBvZmYtc2NyZWVuIGNhbnZhczpcbiAgICAgIC8vIGN0eC5jbGVhclJlY3QoMCwgMCwgd2lkdGgsIGhlaWdodClcbiAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCAwLCAwLCBuZXdJbWFnZVdpZHRoLCBuZXdJbWFnZUhlaWdodClcblxuICAgICAgLy8gcGljYS5yZXNpemVDYW52YXMoaW1nLCBjYW52YXMsIChlcnIpID0+IHtcbiAgICAgIC8vICAgaWYgKGVycikgY29uc29sZS5sb2coZXJyKVxuICAgICAgLy8gICBjb25zdCB0aHVtYm5haWwgPSBjYW52YXMudG9EYXRhVVJMKCdpbWFnZS9wbmcnKVxuICAgICAgLy8gICByZXR1cm4gcmVzb2x2ZSh0aHVtYm5haWwpXG4gICAgICAvLyB9KVxuXG4gICAgICAvLyBlbmNvZGUgaW1hZ2UgdG8gZGF0YS11cmkgd2l0aCBiYXNlNjQgdmVyc2lvbiBvZiBjb21wcmVzc2VkIGltYWdlXG4gICAgICAvLyBjYW52YXMudG9EYXRhVVJMKCdpbWFnZS9qcGVnJywgcXVhbGl0eSk7ICAvLyBxdWFsaXR5ID0gWzAuMCwgMS4wXVxuICAgICAgY29uc3QgdGh1bWJuYWlsID0gY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvcG5nJylcbiAgICAgIHJldHVybiByZXNvbHZlKHRodW1ibmFpbClcbiAgICB9KVxuICAgIGltZy5zcmMgPSBpbWdEYXRhVVJJXG4gIH0pXG59XG5cbmZ1bmN0aW9uIHN1cHBvcnRzTWVkaWFSZWNvcmRlciAoKSB7XG4gIHJldHVybiB0eXBlb2YgTWVkaWFSZWNvcmRlciA9PT0gJ2Z1bmN0aW9uJyAmJiAhIU1lZGlhUmVjb3JkZXIucHJvdG90eXBlICYmXG4gICAgdHlwZW9mIE1lZGlhUmVjb3JkZXIucHJvdG90eXBlLnN0YXJ0ID09PSAnZnVuY3Rpb24nXG59XG5cbmZ1bmN0aW9uIGRhdGFVUkl0b0Jsb2IgKGRhdGFVUkksIG9wdHMsIHRvRmlsZSkge1xuICAvLyBnZXQgdGhlIGJhc2U2NCBkYXRhXG4gIHZhciBkYXRhID0gZGF0YVVSSS5zcGxpdCgnLCcpWzFdXG5cbiAgLy8gdXNlciBtYXkgcHJvdmlkZSBtaW1lIHR5cGUsIGlmIG5vdCBnZXQgaXQgZnJvbSBkYXRhIFVSSVxuICB2YXIgbWltZVR5cGUgPSBvcHRzLm1pbWVUeXBlIHx8IGRhdGFVUkkuc3BsaXQoJywnKVswXS5zcGxpdCgnOicpWzFdLnNwbGl0KCc7JylbMF1cblxuICAvLyBkZWZhdWx0IHRvIHBsYWluL3RleHQgaWYgZGF0YSBVUkkgaGFzIG5vIG1pbWVUeXBlXG4gIGlmIChtaW1lVHlwZSA9PSBudWxsKSB7XG4gICAgbWltZVR5cGUgPSAncGxhaW4vdGV4dCdcbiAgfVxuXG4gIHZhciBiaW5hcnkgPSBhdG9iKGRhdGEpXG4gIHZhciBhcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYmluYXJ5Lmxlbmd0aDsgaSsrKSB7XG4gICAgYXJyYXkucHVzaChiaW5hcnkuY2hhckNvZGVBdChpKSlcbiAgfVxuXG4gIC8vIENvbnZlcnQgdG8gYSBGaWxlP1xuICBpZiAodG9GaWxlKSB7XG4gICAgcmV0dXJuIG5ldyBGaWxlKFtuZXcgVWludDhBcnJheShhcnJheSldLCBvcHRzLm5hbWUgfHwgJycsIHt0eXBlOiBtaW1lVHlwZX0pXG4gIH1cblxuICByZXR1cm4gbmV3IEJsb2IoW25ldyBVaW50OEFycmF5KGFycmF5KV0sIHt0eXBlOiBtaW1lVHlwZX0pXG59XG5cbmZ1bmN0aW9uIGRhdGFVUkl0b0ZpbGUgKGRhdGFVUkksIG9wdHMpIHtcbiAgcmV0dXJuIGRhdGFVUkl0b0Jsb2IoZGF0YVVSSSwgb3B0cywgdHJ1ZSlcbn1cblxuLyoqXG4gKiBDb3BpZXMgdGV4dCB0byBjbGlwYm9hcmQgYnkgY3JlYXRpbmcgYW4gYWxtb3N0IGludmlzaWJsZSB0ZXh0YXJlYSxcbiAqIGFkZGluZyB0ZXh0IHRoZXJlLCB0aGVuIHJ1bm5pbmcgZXhlY0NvbW1hbmQoJ2NvcHknKS5cbiAqIEZhbGxzIGJhY2sgdG8gcHJvbXB0KCkgd2hlbiB0aGUgZWFzeSB3YXkgZmFpbHMgKGhlbGxvLCBTYWZhcmkhKVxuICogRnJvbSBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zMDgxMDMyMlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0VG9Db3B5XG4gKiBAcGFyYW0ge1N0cmluZ30gZmFsbGJhY2tTdHJpbmdcbiAqIEByZXR1cm4ge1Byb21pc2V9XG4gKi9cbmZ1bmN0aW9uIGNvcHlUb0NsaXBib2FyZCAodGV4dFRvQ29weSwgZmFsbGJhY2tTdHJpbmcpIHtcbiAgZmFsbGJhY2tTdHJpbmcgPSBmYWxsYmFja1N0cmluZyB8fCAnQ29weSB0aGUgVVJMIGJlbG93J1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdGV4dEFyZWEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZXh0YXJlYScpXG4gICAgdGV4dEFyZWEuc2V0QXR0cmlidXRlKCdzdHlsZScsIHtcbiAgICAgIHBvc2l0aW9uOiAnZml4ZWQnLFxuICAgICAgdG9wOiAwLFxuICAgICAgbGVmdDogMCxcbiAgICAgIHdpZHRoOiAnMmVtJyxcbiAgICAgIGhlaWdodDogJzJlbScsXG4gICAgICBwYWRkaW5nOiAwLFxuICAgICAgYm9yZGVyOiAnbm9uZScsXG4gICAgICBvdXRsaW5lOiAnbm9uZScsXG4gICAgICBib3hTaGFkb3c6ICdub25lJyxcbiAgICAgIGJhY2tncm91bmQ6ICd0cmFuc3BhcmVudCdcbiAgICB9KVxuXG4gICAgdGV4dEFyZWEudmFsdWUgPSB0ZXh0VG9Db3B5XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0ZXh0QXJlYSlcbiAgICB0ZXh0QXJlYS5zZWxlY3QoKVxuXG4gICAgY29uc3QgbWFnaWNDb3B5RmFpbGVkID0gKGVycikgPT4ge1xuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0ZXh0QXJlYSlcbiAgICAgIHdpbmRvdy5wcm9tcHQoZmFsbGJhY2tTdHJpbmcsIHRleHRUb0NvcHkpXG4gICAgICByZXR1cm4gcmVqZWN0KCdPb3BzLCB1bmFibGUgdG8gY29weSBkaXNwbGF5ZWQgZmFsbGJhY2sgcHJvbXB0OiAnICsgZXJyKVxuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzdWNjZXNzZnVsID0gZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2NvcHknKVxuICAgICAgaWYgKCFzdWNjZXNzZnVsKSB7XG4gICAgICAgIHJldHVybiBtYWdpY0NvcHlGYWlsZWQoJ2NvcHkgY29tbWFuZCB1bmF2YWlsYWJsZScpXG4gICAgICB9XG4gICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRleHRBcmVhKVxuICAgICAgcmV0dXJuIHJlc29sdmUoKVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0ZXh0QXJlYSlcbiAgICAgIHJldHVybiBtYWdpY0NvcHlGYWlsZWQoZXJyKVxuICAgIH1cbiAgfSlcbn1cblxuLy8gZnVuY3Rpb24gY3JlYXRlSW5saW5lV29ya2VyICh3b3JrZXJGdW5jdGlvbikge1xuLy8gICBsZXQgY29kZSA9IHdvcmtlckZ1bmN0aW9uLnRvU3RyaW5nKClcbi8vICAgY29kZSA9IGNvZGUuc3Vic3RyaW5nKGNvZGUuaW5kZXhPZigneycpICsgMSwgY29kZS5sYXN0SW5kZXhPZignfScpKVxuLy9cbi8vICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtjb2RlXSwge3R5cGU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0J30pXG4vLyAgIGNvbnN0IHdvcmtlciA9IG5ldyBXb3JrZXIoVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKSlcbi8vXG4vLyAgIHJldHVybiB3b3JrZXJcbi8vIH1cblxuLy8gZnVuY3Rpb24gbWFrZVdvcmtlciAoc2NyaXB0KSB7XG4vLyAgIHZhciBVUkwgPSB3aW5kb3cuVVJMIHx8IHdpbmRvdy53ZWJraXRVUkxcbi8vICAgdmFyIEJsb2IgPSB3aW5kb3cuQmxvYlxuLy8gICB2YXIgV29ya2VyID0gd2luZG93LldvcmtlclxuLy9cbi8vICAgaWYgKCFVUkwgfHwgIUJsb2IgfHwgIVdvcmtlciB8fCAhc2NyaXB0KSB7XG4vLyAgICAgcmV0dXJuIG51bGxcbi8vICAgfVxuLy9cbi8vICAgbGV0IGNvZGUgPSBzY3JpcHQudG9TdHJpbmcoKVxuLy8gICBjb2RlID0gY29kZS5zdWJzdHJpbmcoY29kZS5pbmRleE9mKCd7JykgKyAxLCBjb2RlLmxhc3RJbmRleE9mKCd9JykpXG4vL1xuLy8gICB2YXIgYmxvYiA9IG5ldyBCbG9iKFtjb2RlXSlcbi8vICAgdmFyIHdvcmtlciA9IG5ldyBXb3JrZXIoVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKSlcbi8vICAgcmV0dXJuIHdvcmtlclxuLy8gfVxuXG5mdW5jdGlvbiBnZXRTcGVlZCAoZmlsZVByb2dyZXNzKSB7XG4gIGlmICghZmlsZVByb2dyZXNzLmJ5dGVzVXBsb2FkZWQpIHJldHVybiAwXG5cbiAgY29uc3QgdGltZUVsYXBzZWQgPSAobmV3IERhdGUoKSkgLSBmaWxlUHJvZ3Jlc3MudXBsb2FkU3RhcnRlZFxuICBjb25zdCB1cGxvYWRTcGVlZCA9IGZpbGVQcm9ncmVzcy5ieXRlc1VwbG9hZGVkIC8gKHRpbWVFbGFwc2VkIC8gMTAwMClcbiAgcmV0dXJuIHVwbG9hZFNwZWVkXG59XG5cbmZ1bmN0aW9uIGdldEVUQSAoZmlsZVByb2dyZXNzKSB7XG4gIGlmICghZmlsZVByb2dyZXNzLmJ5dGVzVXBsb2FkZWQpIHJldHVybiAwXG5cbiAgY29uc3QgdXBsb2FkU3BlZWQgPSBnZXRTcGVlZChmaWxlUHJvZ3Jlc3MpXG4gIGNvbnN0IGJ5dGVzUmVtYWluaW5nID0gZmlsZVByb2dyZXNzLmJ5dGVzVG90YWwgLSBmaWxlUHJvZ3Jlc3MuYnl0ZXNVcGxvYWRlZFxuICBjb25zdCBzZWNvbmRzUmVtYWluaW5nID0gTWF0aC5yb3VuZChieXRlc1JlbWFpbmluZyAvIHVwbG9hZFNwZWVkICogMTApIC8gMTBcblxuICByZXR1cm4gc2Vjb25kc1JlbWFpbmluZ1xufVxuXG5mdW5jdGlvbiBwcmV0dHlFVEEgKHNlY29uZHMpIHtcbiAgY29uc3QgdGltZSA9IHNlY29uZHNUb1RpbWUoc2Vjb25kcylcblxuICAvLyBPbmx5IGRpc3BsYXkgaG91cnMgYW5kIG1pbnV0ZXMgaWYgdGhleSBhcmUgZ3JlYXRlciB0aGFuIDAgYnV0IGFsd2F5c1xuICAvLyBkaXNwbGF5IG1pbnV0ZXMgaWYgaG91cnMgaXMgYmVpbmcgZGlzcGxheWVkXG4gIC8vIERpc3BsYXkgYSBsZWFkaW5nIHplcm8gaWYgdGhlIHRoZXJlIGlzIGEgcHJlY2VkaW5nIHVuaXQ6IDFtIDA1cywgYnV0IDVzXG4gIGNvbnN0IGhvdXJzU3RyID0gdGltZS5ob3VycyA/IHRpbWUuaG91cnMgKyAnaCAnIDogJydcbiAgY29uc3QgbWludXRlc1ZhbCA9IHRpbWUuaG91cnMgPyAoJzAnICsgdGltZS5taW51dGVzKS5zdWJzdHIoLTIpIDogdGltZS5taW51dGVzXG4gIGNvbnN0IG1pbnV0ZXNTdHIgPSBtaW51dGVzVmFsID8gbWludXRlc1ZhbCArICdtICcgOiAnJ1xuICBjb25zdCBzZWNvbmRzVmFsID0gbWludXRlc1ZhbCA/ICgnMCcgKyB0aW1lLnNlY29uZHMpLnN1YnN0cigtMikgOiB0aW1lLnNlY29uZHNcbiAgY29uc3Qgc2Vjb25kc1N0ciA9IHNlY29uZHNWYWwgKyAncydcblxuICByZXR1cm4gYCR7aG91cnNTdHJ9JHttaW51dGVzU3RyfSR7c2Vjb25kc1N0cn1gXG59XG5cbi8vIGZ1bmN0aW9uIG1ha2VDYWNoaW5nRnVuY3Rpb24gKCkge1xuLy8gICBsZXQgY2FjaGVkRWwgPSBudWxsXG4vLyAgIGxldCBsYXN0VXBkYXRlID0gRGF0ZS5ub3coKVxuLy9cbi8vICAgcmV0dXJuIGZ1bmN0aW9uIGNhY2hlRWxlbWVudCAoZWwsIHRpbWUpIHtcbi8vICAgICBpZiAoRGF0ZS5ub3coKSAtIGxhc3RVcGRhdGUgPCB0aW1lKSB7XG4vLyAgICAgICByZXR1cm4gY2FjaGVkRWxcbi8vICAgICB9XG4vL1xuLy8gICAgIGNhY2hlZEVsID0gZWxcbi8vICAgICBsYXN0VXBkYXRlID0gRGF0ZS5ub3coKVxuLy9cbi8vICAgICByZXR1cm4gZWxcbi8vICAgfVxuLy8gfVxuXG4vKipcbiAqIENoZWNrIGlmIGFuIG9iamVjdCBpcyBhIERPTSBlbGVtZW50LiBEdWNrLXR5cGluZyBiYXNlZCBvbiBgbm9kZVR5cGVgLlxuICpcbiAqIEBwYXJhbSB7Kn0gb2JqXG4gKi9cbmZ1bmN0aW9uIGlzRE9NRWxlbWVudCAob2JqKSB7XG4gIHJldHVybiBvYmogJiYgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgb2JqLm5vZGVUeXBlID09PSBOb2RlLkVMRU1FTlRfTk9ERVxufVxuXG4vKipcbiAqIEZpbmQgYSBET00gZWxlbWVudC5cbiAqXG4gKiBAcGFyYW0ge05vZGV8c3RyaW5nfSBlbGVtZW50XG4gKiBAcmV0dXJuIHtOb2RlfG51bGx9XG4gKi9cbmZ1bmN0aW9uIGZpbmRET01FbGVtZW50IChlbGVtZW50KSB7XG4gIGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihlbGVtZW50KVxuICB9XG5cbiAgaWYgKHR5cGVvZiBlbGVtZW50ID09PSAnb2JqZWN0JyAmJiBpc0RPTUVsZW1lbnQoZWxlbWVudCkpIHtcbiAgICByZXR1cm4gZWxlbWVudFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBnZW5lcmF0ZUZpbGVJRCxcbiAgdG9BcnJheSxcbiAgZXZlcnksXG4gIGZsYXR0ZW4sXG4gIGdyb3VwQnksXG4gIC8vICQsXG4gIC8vICQkLFxuICBleHRlbmQsXG4gIHJlYWRGaWxlLFxuICBjcmVhdGVJbWFnZVRodW1ibmFpbCxcbiAgZ2V0UHJvcG9ydGlvbmFsSW1hZ2VIZWlnaHQsXG4gIHN1cHBvcnRzTWVkaWFSZWNvcmRlcixcbiAgaXNUb3VjaERldmljZSxcbiAgZ2V0RmlsZU5hbWVBbmRFeHRlbnNpb24sXG4gIHRydW5jYXRlU3RyaW5nLFxuICBnZXRGaWxlVHlwZUV4dGVuc2lvbixcbiAgZ2V0RmlsZVR5cGUsXG4gIHNlY29uZHNUb1RpbWUsXG4gIGRhdGFVUkl0b0Jsb2IsXG4gIGRhdGFVUkl0b0ZpbGUsXG4gIGdldFNwZWVkLFxuICBnZXRFVEEsXG4gIC8vIG1ha2VXb3JrZXIsXG4gIC8vIG1ha2VDYWNoaW5nRnVuY3Rpb24sXG4gIGNvcHlUb0NsaXBib2FyZCxcbiAgcHJldHR5RVRBLFxuICBmaW5kRE9NRWxlbWVudFxufVxuIiwiY29uc3QgQ29yZSA9IHJlcXVpcmUoJy4vQ29yZScpXG5tb2R1bGUuZXhwb3J0cyA9IENvcmVcbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IGRlbW9MaW5rID0gcHJvcHMuZGVtbyA/IGh0bWxgPGJ1dHRvbiBjbGFzcz1cIlVwcHlQcm92aWRlci1hdXRoQnRuRGVtb1wiIG9uY2xpY2s9JHtwcm9wcy5oYW5kbGVEZW1vQXV0aH0+UHJvY2VlZCB3aXRoIERlbW8gQWNjb3VudDwvYnV0dG9uPmAgOiBudWxsXG4gIHJldHVybiBodG1sYFxuICAgIDxkaXYgY2xhc3M9XCJVcHB5UHJvdmlkZXItYXV0aFwiPlxuICAgICAgPGgxIGNsYXNzPVwiVXBweVByb3ZpZGVyLWF1dGhUaXRsZVwiPlxuICAgICAgICBQbGVhc2UgYXV0aGVudGljYXRlIHdpdGggPHNwYW4gY2xhc3M9XCJVcHB5UHJvdmlkZXItYXV0aFRpdGxlTmFtZVwiPiR7cHJvcHMucGx1Z2luTmFtZX08L3NwYW4+PGJyPiB0byBzZWxlY3QgZmlsZXNcbiAgICAgIDwvaDE+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwiVXBweVByb3ZpZGVyLWF1dGhCdG5cIiBvbmNsaWNrPSR7cHJvcHMuaGFuZGxlQXV0aH0+QXV0aGVudGljYXRlPC9idXR0b24+XG4gICAgICAke2RlbW9MaW5rfVxuICAgIDwvZGl2PlxuICBgXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGBcbiAgICA8bGk+XG4gICAgICA8YnV0dG9uIG9uY2xpY2s9JHtwcm9wcy5nZXRGb2xkZXJ9PiR7cHJvcHMudGl0bGV9PC9idXR0b24+XG4gICAgPC9saT5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IEJyZWFkY3J1bWIgPSByZXF1aXJlKCcuL0JyZWFkY3J1bWInKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGBcbiAgICA8dWwgY2xhc3M9XCJVcHB5UHJvdmlkZXItYnJlYWRjcnVtYnNcIj5cbiAgICAgICR7XG4gICAgICAgIHByb3BzLmRpcmVjdG9yaWVzLm1hcCgoZGlyZWN0b3J5KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIEJyZWFkY3J1bWIoe1xuICAgICAgICAgICAgZ2V0Rm9sZGVyOiAoKSA9PiBwcm9wcy5nZXRGb2xkZXIoZGlyZWN0b3J5LmlkKSxcbiAgICAgICAgICAgIHRpdGxlOiBkaXJlY3RvcnkudGl0bGVcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIDwvdWw+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBCcmVhZGNydW1icyA9IHJlcXVpcmUoJy4vQnJlYWRjcnVtYnMnKVxuY29uc3QgVGFibGUgPSByZXF1aXJlKCcuL1RhYmxlJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgbGV0IGZpbHRlcmVkRm9sZGVycyA9IHByb3BzLmZvbGRlcnNcbiAgbGV0IGZpbHRlcmVkRmlsZXMgPSBwcm9wcy5maWxlc1xuXG4gIGlmIChwcm9wcy5maWx0ZXJJbnB1dCAhPT0gJycpIHtcbiAgICBmaWx0ZXJlZEZvbGRlcnMgPSBwcm9wcy5maWx0ZXJJdGVtcyhwcm9wcy5mb2xkZXJzKVxuICAgIGZpbHRlcmVkRmlsZXMgPSBwcm9wcy5maWx0ZXJJdGVtcyhwcm9wcy5maWxlcylcbiAgfVxuXG4gIHJldHVybiBodG1sYFxuICAgIDxkaXYgY2xhc3M9XCJCcm93c2VyXCI+XG4gICAgICA8aGVhZGVyPlxuICAgICAgICA8aW5wdXRcbiAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgY2xhc3M9XCJCcm93c2VyLXNlYXJjaFwiXG4gICAgICAgICAgcGxhY2Vob2xkZXI9XCJTZWFyY2ggRHJpdmVcIlxuICAgICAgICAgIG9ua2V5dXA9JHtwcm9wcy5maWx0ZXJRdWVyeX1cbiAgICAgICAgICB2YWx1ZT0ke3Byb3BzLmZpbHRlcklucHV0fS8+XG4gICAgICA8L2hlYWRlcj5cbiAgICAgIDxkaXYgY2xhc3M9XCJCcm93c2VyLXN1YkhlYWRlclwiPlxuICAgICAgICAke0JyZWFkY3J1bWJzKHtcbiAgICAgICAgICBnZXRGb2xkZXI6IHByb3BzLmdldEZvbGRlcixcbiAgICAgICAgICBkaXJlY3RvcmllczogcHJvcHMuZGlyZWN0b3JpZXNcbiAgICAgICAgfSl9XG4gICAgICAgIDxidXR0b24gb25jbGljaz0ke3Byb3BzLmxvZ291dH0gY2xhc3M9XCJCcm93c2VyLXVzZXJMb2dvdXRcIj5Mb2cgb3V0PC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJCcm93c2VyLWJvZHlcIj5cbiAgICAgICAgPG1haW4gY2xhc3M9XCJCcm93c2VyLWNvbnRlbnRcIj5cbiAgICAgICAgICAke1RhYmxlKHtcbiAgICAgICAgICAgIGNvbHVtbnM6IFt7XG4gICAgICAgICAgICAgIG5hbWU6ICdOYW1lJyxcbiAgICAgICAgICAgICAga2V5OiAndGl0bGUnXG4gICAgICAgICAgICB9XSxcbiAgICAgICAgICAgIGZvbGRlcnM6IGZpbHRlcmVkRm9sZGVycyxcbiAgICAgICAgICAgIGZpbGVzOiBmaWx0ZXJlZEZpbGVzLFxuICAgICAgICAgICAgYWN0aXZlUm93OiBwcm9wcy5pc0FjdGl2ZVJvdyxcbiAgICAgICAgICAgIHNvcnRCeVRpdGxlOiBwcm9wcy5zb3J0QnlUaXRsZSxcbiAgICAgICAgICAgIHNvcnRCeURhdGU6IHByb3BzLnNvcnRCeURhdGUsXG4gICAgICAgICAgICBoYW5kbGVSb3dDbGljazogcHJvcHMuaGFuZGxlUm93Q2xpY2ssXG4gICAgICAgICAgICBoYW5kbGVGaWxlRG91YmxlQ2xpY2s6IHByb3BzLmFkZEZpbGUsXG4gICAgICAgICAgICBoYW5kbGVGb2xkZXJEb3VibGVDbGljazogcHJvcHMuZ2V0TmV4dEZvbGRlcixcbiAgICAgICAgICAgIGdldEl0ZW1OYW1lOiBwcm9wcy5nZXRJdGVtTmFtZSxcbiAgICAgICAgICAgIGdldEl0ZW1JY29uOiBwcm9wcy5nZXRJdGVtSWNvblxuICAgICAgICAgIH0pfVxuICAgICAgICA8L21haW4+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPGRpdiBjbGFzcz1cIlVwcHlQcm92aWRlci1lcnJvclwiPlxuICAgICAgPHNwYW4+XG4gICAgICAgIFNvbWV0aGluZyB3ZW50IHdyb25nLiAgUHJvYmFibHkgb3VyIGZhdWx0LiAke3Byb3BzLmVycm9yfVxuICAgICAgPC9zcGFuPlxuICAgIDwvZGl2PlxuICBgXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGBcbiAgICA8ZGl2IGNsYXNzPVwiVXBweVByb3ZpZGVyLWxvYWRpbmdcIj5cbiAgICAgIDxzcGFuPlxuICAgICAgICBMb2FkaW5nIC4uLlxuICAgICAgPC9zcGFuPlxuICAgIDwvZGl2PlxuICBgXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgUm93ID0gcmVxdWlyZSgnLi9UYWJsZVJvdycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IGhlYWRlcnMgPSBwcm9wcy5jb2x1bW5zLm1hcCgoY29sdW1uKSA9PiB7XG4gICAgcmV0dXJuIGh0bWxgXG4gICAgICA8dGggY2xhc3M9XCJCcm93c2VyVGFibGUtaGVhZGVyQ29sdW1uIEJyb3dzZXJUYWJsZS1jb2x1bW5cIiBvbmNsaWNrPSR7cHJvcHMuc29ydEJ5VGl0bGV9PlxuICAgICAgICAke2NvbHVtbi5uYW1lfVxuICAgICAgPC90aD5cbiAgICBgXG4gIH0pXG5cbiAgcmV0dXJuIGh0bWxgXG4gICAgPHRhYmxlIGNsYXNzPVwiQnJvd3NlclRhYmxlXCI+XG4gICAgICA8dGhlYWQgY2xhc3M9XCJCcm93c2VyVGFibGUtaGVhZGVyXCI+XG4gICAgICAgIDx0cj5cbiAgICAgICAgICAke2hlYWRlcnN9XG4gICAgICAgIDwvdHI+XG4gICAgICA8L3RoZWFkPlxuICAgICAgPHRib2R5PlxuICAgICAgICAke3Byb3BzLmZvbGRlcnMubWFwKChmb2xkZXIpID0+IHtcbiAgICAgICAgICByZXR1cm4gUm93KHtcbiAgICAgICAgICAgIHRpdGxlOiBwcm9wcy5nZXRJdGVtTmFtZShmb2xkZXIpLFxuICAgICAgICAgICAgYWN0aXZlOiBwcm9wcy5hY3RpdmVSb3coZm9sZGVyKSxcbiAgICAgICAgICAgIGdldEl0ZW1JY29uOiAoKSA9PiBwcm9wcy5nZXRJdGVtSWNvbihmb2xkZXIpLFxuICAgICAgICAgICAgaGFuZGxlQ2xpY2s6ICgpID0+IHByb3BzLmhhbmRsZVJvd0NsaWNrKGZvbGRlciksXG4gICAgICAgICAgICBoYW5kbGVEb3VibGVDbGljazogKCkgPT4gcHJvcHMuaGFuZGxlRm9sZGVyRG91YmxlQ2xpY2soZm9sZGVyKSxcbiAgICAgICAgICAgIGNvbHVtbnM6IHByb3BzLmNvbHVtbnNcbiAgICAgICAgICB9KVxuICAgICAgICB9KX1cbiAgICAgICAgJHtwcm9wcy5maWxlcy5tYXAoKGZpbGUpID0+IHtcbiAgICAgICAgICByZXR1cm4gUm93KHtcbiAgICAgICAgICAgIHRpdGxlOiBwcm9wcy5nZXRJdGVtTmFtZShmaWxlKSxcbiAgICAgICAgICAgIGFjdGl2ZTogcHJvcHMuYWN0aXZlUm93KGZpbGUpLFxuICAgICAgICAgICAgZ2V0SXRlbUljb246ICgpID0+IHByb3BzLmdldEl0ZW1JY29uKGZpbGUpLFxuICAgICAgICAgICAgaGFuZGxlQ2xpY2s6ICgpID0+IHByb3BzLmhhbmRsZVJvd0NsaWNrKGZpbGUpLFxuICAgICAgICAgICAgaGFuZGxlRG91YmxlQ2xpY2s6ICgpID0+IHByb3BzLmhhbmRsZUZpbGVEb3VibGVDbGljayhmaWxlKSxcbiAgICAgICAgICAgIGNvbHVtbnM6IHByb3BzLmNvbHVtbnNcbiAgICAgICAgICB9KVxuICAgICAgICB9KX1cbiAgICAgIDwvdGJvZHk+XG4gICAgPC90YWJsZT5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPHRkIGNsYXNzPVwiQnJvd3NlclRhYmxlLXJvd0NvbHVtbiBCcm93c2VyVGFibGUtY29sdW1uXCI+XG4gICAgICAke3Byb3BzLmdldEl0ZW1JY29uKCl9ICR7cHJvcHMudmFsdWV9XG4gICAgPC90ZD5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IENvbHVtbiA9IHJlcXVpcmUoJy4vVGFibGVDb2x1bW4nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBjb25zdCBjbGFzc2VzID0gcHJvcHMuYWN0aXZlID8gJ0Jyb3dzZXJUYWJsZS1yb3cgaXMtYWN0aXZlJyA6ICdCcm93c2VyVGFibGUtcm93J1xuICByZXR1cm4gaHRtbGBcbiAgICA8dHIgb25jbGljaz0ke3Byb3BzLmhhbmRsZUNsaWNrfSBvbmRibGNsaWNrPSR7cHJvcHMuaGFuZGxlRG91YmxlQ2xpY2t9IGNsYXNzPSR7Y2xhc3Nlc30+XG4gICAgICAke0NvbHVtbih7XG4gICAgICAgIGdldEl0ZW1JY29uOiBwcm9wcy5nZXRJdGVtSWNvbixcbiAgICAgICAgdmFsdWU6IHByb3BzLnRpdGxlXG4gICAgICB9KX1cbiAgICA8L3RyPlxuICBgXG59XG4iLCJjb25zdCBBdXRoVmlldyA9IHJlcXVpcmUoJy4vQXV0aFZpZXcnKVxuY29uc3QgQnJvd3NlciA9IHJlcXVpcmUoJy4vQnJvd3NlcicpXG5jb25zdCBFcnJvclZpZXcgPSByZXF1aXJlKCcuL0Vycm9yJylcbmNvbnN0IExvYWRlclZpZXcgPSByZXF1aXJlKCcuL0xvYWRlcicpXG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uL2NvcmUvVXRpbHMnKVxuXG4vKipcbiAqIENsYXNzIHRvIGVhc2lseSBnZW5lcmF0ZSBnZW5lcmljIHZpZXdzIGZvciBwbHVnaW5zXG4gKlxuICogVGhpcyBjbGFzcyBleHBlY3RzIHRoZSBwbHVnaW4gdXNpbmcgdG8gaGF2ZSB0aGUgZm9sbG93aW5nIGF0dHJpYnV0ZXNcbiAqXG4gKiBzdGF0ZUlkIHtTdHJpbmd9IG9iamVjdCBrZXkgb2Ygd2hpY2ggdGhlIHBsdWdpbiBzdGF0ZSBpcyBzdG9yZWRcbiAqXG4gKiBUaGlzIGNsYXNzIGFsc28gZXhwZWN0cyB0aGUgcGx1Z2luIGluc3RhbmNlIHVzaW5nIGl0IHRvIGhhdmUgdGhlIGZvbGxvd2luZ1xuICogYWNjZXNzb3IgbWV0aG9kcy5cbiAqIEVhY2ggbWV0aG9kIHRha2VzIHRoZSBpdGVtIHdob3NlIHByb3BlcnR5IGlzIHRvIGJlIGFjY2Vzc2VkXG4gKiBhcyBhIHBhcmFtXG4gKlxuICogaXNGb2xkZXJcbiAqICAgIEByZXR1cm4ge0Jvb2xlYW59IGZvciBpZiB0aGUgaXRlbSBpcyBhIGZvbGRlciBvciBub3RcbiAqIGdldEl0ZW1EYXRhXG4gKiAgICBAcmV0dXJuIHtPYmplY3R9IHRoYXQgaXMgZm9ybWF0IHJlYWR5IGZvciB1cHB5IHVwbG9hZC9kb3dubG9hZFxuICogZ2V0SXRlbUljb25cbiAqICAgIEByZXR1cm4ge09iamVjdH0gaHRtbCBpbnN0YW5jZSBvZiB0aGUgaXRlbSdzIGljb25cbiAqIGdldEl0ZW1TdWJMaXN0XG4gKiAgICBAcmV0dXJuIHtBcnJheX0gc3ViLWl0ZW1zIGluIHRoZSBpdGVtLiBlLmcgYSBmb2xkZXIgbWF5IGNvbnRhaW4gc3ViLWl0ZW1zXG4gKiBnZXRJdGVtTmFtZVxuICogICAgQHJldHVybiB7U3RyaW5nfSBkaXNwbGF5IGZyaWVuZGx5IG5hbWUgb2YgdGhlIGl0ZW1cbiAqIGdldE1pbWVUeXBlXG4gKiAgICBAcmV0dXJuIHtTdHJpbmd9IG1pbWUgdHlwZSBvZiB0aGUgaXRlbVxuICogZ2V0SXRlbUlkXG4gKiAgICBAcmV0dXJuIHtTdHJpbmd9IHVuaXF1ZSBpZCBvZiB0aGUgaXRlbVxuICogZ2V0SXRlbVJlcXVlc3RQYXRoXG4gKiAgICBAcmV0dXJuIHtTdHJpbmd9IHVuaXF1ZSByZXF1ZXN0IHBhdGggb2YgdGhlIGl0ZW0gd2hlbiBtYWtpbmcgY2FsbHMgdG8gdXBweSBzZXJ2ZXJcbiAqIGdldEl0ZW1Nb2RpZmllZERhdGVcbiAqICAgIEByZXR1cm4ge29iamVjdH0gb3Ige1N0cmluZ30gZGF0ZSBvZiB3aGVuIGxhc3QgdGhlIGl0ZW0gd2FzIG1vZGlmaWVkXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgVmlldyB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge29iamVjdH0gaW5zdGFuY2Ugb2YgdGhlIHBsdWdpblxuICAgKi9cbiAgY29uc3RydWN0b3IgKHBsdWdpbikge1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luXG4gICAgdGhpcy5Qcm92aWRlciA9IHBsdWdpbltwbHVnaW4uaWRdXG5cbiAgICAvLyBMb2dpY1xuICAgIHRoaXMuYWRkRmlsZSA9IHRoaXMuYWRkRmlsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5maWx0ZXJJdGVtcyA9IHRoaXMuZmlsdGVySXRlbXMuYmluZCh0aGlzKVxuICAgIHRoaXMuZmlsdGVyUXVlcnkgPSB0aGlzLmZpbHRlclF1ZXJ5LmJpbmQodGhpcylcbiAgICB0aGlzLmdldEZvbGRlciA9IHRoaXMuZ2V0Rm9sZGVyLmJpbmQodGhpcylcbiAgICB0aGlzLmdldE5leHRGb2xkZXIgPSB0aGlzLmdldE5leHRGb2xkZXIuYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlUm93Q2xpY2sgPSB0aGlzLmhhbmRsZVJvd0NsaWNrLmJpbmQodGhpcylcbiAgICB0aGlzLmxvZ291dCA9IHRoaXMubG9nb3V0LmJpbmQodGhpcylcbiAgICB0aGlzLmhhbmRsZUF1dGggPSB0aGlzLmhhbmRsZUF1dGguYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlRGVtb0F1dGggPSB0aGlzLmhhbmRsZURlbW9BdXRoLmJpbmQodGhpcylcbiAgICB0aGlzLnNvcnRCeVRpdGxlID0gdGhpcy5zb3J0QnlUaXRsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5zb3J0QnlEYXRlID0gdGhpcy5zb3J0QnlEYXRlLmJpbmQodGhpcylcbiAgICB0aGlzLmlzQWN0aXZlUm93ID0gdGhpcy5pc0FjdGl2ZVJvdy5iaW5kKHRoaXMpXG4gICAgdGhpcy5oYW5kbGVFcnJvciA9IHRoaXMuaGFuZGxlRXJyb3IuYmluZCh0aGlzKVxuXG4gICAgLy8gVmlzdWFsXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG4gIH1cblxuICAvKipcbiAgICogTGl0dGxlIHNob3J0aGFuZCB0byB1cGRhdGUgdGhlIHN0YXRlIHdpdGggdGhlIHBsdWdpbidzIHN0YXRlXG4gICAqL1xuICB1cGRhdGVTdGF0ZSAobmV3U3RhdGUpIHtcbiAgICBsZXQgc3RhdGVJZCA9IHRoaXMucGx1Z2luLnN0YXRlSWRcbiAgICBjb25zdCB7c3RhdGV9ID0gdGhpcy5wbHVnaW4uY29yZVxuXG4gICAgdGhpcy5wbHVnaW4uY29yZS5zZXRTdGF0ZSh7W3N0YXRlSWRdOiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZVtzdGF0ZUlkXSwgbmV3U3RhdGUpfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBCYXNlZCBvbiBmb2xkZXIgSUQsIGZldGNoIGEgbmV3IGZvbGRlciBhbmQgdXBkYXRlIGl0IHRvIHN0YXRlXG4gICAqIEBwYXJhbSAge1N0cmluZ30gaWQgRm9sZGVyIGlkXG4gICAqIEByZXR1cm4ge1Byb21pc2V9ICAgRm9sZGVycy9maWxlcyBpbiBmb2xkZXJcbiAgICovXG4gIGdldEZvbGRlciAoaWQsIG5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5fbG9hZGVyV3JhcHBlcihcbiAgICAgIHRoaXMuUHJvdmlkZXIubGlzdChpZCksXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBmb2xkZXJzID0gW11cbiAgICAgICAgbGV0IGZpbGVzID0gW11cbiAgICAgICAgbGV0IHVwZGF0ZWREaXJlY3Rvcmllc1xuXG4gICAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdXG4gICAgICAgIGNvbnN0IGluZGV4ID0gc3RhdGUuZGlyZWN0b3JpZXMuZmluZEluZGV4KChkaXIpID0+IGlkID09PSBkaXIuaWQpXG5cbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICAgIHVwZGF0ZWREaXJlY3RvcmllcyA9IHN0YXRlLmRpcmVjdG9yaWVzLnNsaWNlKDAsIGluZGV4ICsgMSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVkRGlyZWN0b3JpZXMgPSBzdGF0ZS5kaXJlY3Rvcmllcy5jb25jYXQoW3tpZCwgdGl0bGU6IG5hbWUgfHwgdGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUocmVzKX1dKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wbHVnaW4uZ2V0SXRlbVN1Ykxpc3QocmVzKS5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLmlzRm9sZGVyKGl0ZW0pKSB7XG4gICAgICAgICAgICBmb2xkZXJzLnB1c2goaXRlbSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmlsZXMucHVzaChpdGVtKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcblxuICAgICAgICBsZXQgZGF0YSA9IHtmb2xkZXJzLCBmaWxlcywgZGlyZWN0b3JpZXM6IHVwZGF0ZWREaXJlY3Rvcmllc31cbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZShkYXRhKVxuXG4gICAgICAgIHJldHVybiBkYXRhXG4gICAgICB9LFxuICAgICAgdGhpcy5oYW5kbGVFcnJvcilcbiAgfVxuXG4gIC8qKlxuICAgKiBGZXRjaGVzIG5ldyBmb2xkZXJcbiAgICogQHBhcmFtICB7T2JqZWN0fSBGb2xkZXJcbiAgICogQHBhcmFtICB7U3RyaW5nfSB0aXRsZSBGb2xkZXIgdGl0bGVcbiAgICovXG4gIGdldE5leHRGb2xkZXIgKGZvbGRlcikge1xuICAgIGxldCBpZCA9IHRoaXMucGx1Z2luLmdldEl0ZW1SZXF1ZXN0UGF0aChmb2xkZXIpXG4gICAgdGhpcy5nZXRGb2xkZXIoaWQsIHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZvbGRlcikpXG4gIH1cblxuICBhZGRGaWxlIChmaWxlKSB7XG4gICAgY29uc3QgdGFnRmlsZSA9IHtcbiAgICAgIHNvdXJjZTogdGhpcy5wbHVnaW4uaWQsXG4gICAgICBkYXRhOiB0aGlzLnBsdWdpbi5nZXRJdGVtRGF0YShmaWxlKSxcbiAgICAgIG5hbWU6IHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZpbGUpLFxuICAgICAgdHlwZTogdGhpcy5wbHVnaW4uZ2V0TWltZVR5cGUoZmlsZSksXG4gICAgICBpc1JlbW90ZTogdHJ1ZSxcbiAgICAgIGJvZHk6IHtcbiAgICAgICAgZmlsZUlkOiB0aGlzLnBsdWdpbi5nZXRJdGVtSWQoZmlsZSlcbiAgICAgIH0sXG4gICAgICByZW1vdGU6IHtcbiAgICAgICAgaG9zdDogdGhpcy5wbHVnaW4ub3B0cy5ob3N0LFxuICAgICAgICB1cmw6IGAke3RoaXMucGx1Z2luLm9wdHMuaG9zdH0vJHt0aGlzLlByb3ZpZGVyLmlkfS9nZXQvJHt0aGlzLnBsdWdpbi5nZXRJdGVtUmVxdWVzdFBhdGgoZmlsZSl9YCxcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGZpbGVJZDogdGhpcy5wbHVnaW4uZ2V0SXRlbUlkKGZpbGUpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoVXRpbHMuZ2V0RmlsZVR5cGUodGFnRmlsZSlbMF0gPT09ICdpbWFnZScpIHtcbiAgICAgIHRhZ0ZpbGUucHJldmlldyA9IGAke3RoaXMucGx1Z2luLm9wdHMuaG9zdH0vJHt0aGlzLlByb3ZpZGVyLmlkfS90aHVtYm5haWwvJHt0aGlzLnBsdWdpbi5nZXRJdGVtUmVxdWVzdFBhdGgoZmlsZSl9YFxuICAgIH1cbiAgICBjb25zb2xlLmxvZygnYWRkaW5nIGZpbGUnKVxuICAgIHRoaXMucGx1Z2luLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOmZpbGUtYWRkJywgdGFnRmlsZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHNlc3Npb24gdG9rZW4gb24gY2xpZW50IHNpZGUuXG4gICAqL1xuICBsb2dvdXQgKCkge1xuICAgIHRoaXMuUHJvdmlkZXIubG9nb3V0KGxvY2F0aW9uLmhyZWYpXG4gICAgICAudGhlbigocmVzKSA9PiByZXMuanNvbigpKVxuICAgICAgLnRoZW4oKHJlcykgPT4ge1xuICAgICAgICBpZiAocmVzLm9rKSB7XG4gICAgICAgICAgY29uc3QgbmV3U3RhdGUgPSB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGVkOiBmYWxzZSxcbiAgICAgICAgICAgIGZpbGVzOiBbXSxcbiAgICAgICAgICAgIGZvbGRlcnM6IFtdLFxuICAgICAgICAgICAgZGlyZWN0b3JpZXM6IFtdXG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMudXBkYXRlU3RhdGUobmV3U3RhdGUpXG4gICAgICAgIH1cbiAgICAgIH0pLmNhdGNoKHRoaXMuaGFuZGxlRXJyb3IpXG4gIH1cblxuICAvKipcbiAgICogVXNlZCB0byBzZXQgYWN0aXZlIGZpbGUvZm9sZGVyLlxuICAgKiBAcGFyYW0gIHtPYmplY3R9IGZpbGUgICBBY3RpdmUgZmlsZS9mb2xkZXJcbiAgICovXG4gIGhhbmRsZVJvd0NsaWNrIChmaWxlKSB7XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLnBsdWdpbi5jb3JlLmdldFN0YXRlKClbdGhpcy5wbHVnaW4uc3RhdGVJZF1cbiAgICBjb25zdCBuZXdTdGF0ZSA9IE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICBhY3RpdmVSb3c6IHRoaXMucGx1Z2luLmdldEl0ZW1JZChmaWxlKVxuICAgIH0pXG5cbiAgICB0aGlzLnVwZGF0ZVN0YXRlKG5ld1N0YXRlKVxuICB9XG5cbiAgZmlsdGVyUXVlcnkgKGUpIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMucGx1Z2luLmNvcmUuZ2V0U3RhdGUoKVt0aGlzLnBsdWdpbi5zdGF0ZUlkXVxuICAgIHRoaXMudXBkYXRlU3RhdGUoT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtcbiAgICAgIGZpbHRlcklucHV0OiBlLnRhcmdldC52YWx1ZVxuICAgIH0pKVxuICB9XG5cbiAgZmlsdGVySXRlbXMgKGl0ZW1zKSB7XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLnBsdWdpbi5jb3JlLmdldFN0YXRlKClbdGhpcy5wbHVnaW4uc3RhdGVJZF1cbiAgICByZXR1cm4gaXRlbXMuZmlsdGVyKChmb2xkZXIpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmb2xkZXIpLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzdGF0ZS5maWx0ZXJJbnB1dC50b0xvd2VyQ2FzZSgpKSAhPT0gLTFcbiAgICB9KVxuICB9XG5cbiAgc29ydEJ5VGl0bGUgKCkge1xuICAgIGNvbnN0IHN0YXRlID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdKVxuICAgIGNvbnN0IHtmaWxlcywgZm9sZGVycywgc29ydGluZ30gPSBzdGF0ZVxuXG4gICAgbGV0IHNvcnRlZEZpbGVzID0gZmlsZXMuc29ydCgoZmlsZUEsIGZpbGVCKSA9PiB7XG4gICAgICBpZiAoc29ydGluZyA9PT0gJ3RpdGxlRGVzY2VuZGluZycpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZpbGVCKS5sb2NhbGVDb21wYXJlKHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZpbGVBKSlcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmaWxlQSkubG9jYWxlQ29tcGFyZSh0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmaWxlQikpXG4gICAgfSlcblxuICAgIGxldCBzb3J0ZWRGb2xkZXJzID0gZm9sZGVycy5zb3J0KChmb2xkZXJBLCBmb2xkZXJCKSA9PiB7XG4gICAgICBpZiAoc29ydGluZyA9PT0gJ3RpdGxlRGVzY2VuZGluZycpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZvbGRlckIpLmxvY2FsZUNvbXBhcmUodGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUoZm9sZGVyQSkpXG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUoZm9sZGVyQSkubG9jYWxlQ29tcGFyZSh0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmb2xkZXJCKSlcbiAgICB9KVxuXG4gICAgdGhpcy51cGRhdGVTdGF0ZShPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgZmlsZXM6IHNvcnRlZEZpbGVzLFxuICAgICAgZm9sZGVyczogc29ydGVkRm9sZGVycyxcbiAgICAgIHNvcnRpbmc6IChzb3J0aW5nID09PSAndGl0bGVEZXNjZW5kaW5nJykgPyAndGl0bGVBc2NlbmRpbmcnIDogJ3RpdGxlRGVzY2VuZGluZydcbiAgICB9KSlcbiAgfVxuXG4gIHNvcnRCeURhdGUgKCkge1xuICAgIGNvbnN0IHN0YXRlID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdKVxuICAgIGNvbnN0IHtmaWxlcywgZm9sZGVycywgc29ydGluZ30gPSBzdGF0ZVxuXG4gICAgbGV0IHNvcnRlZEZpbGVzID0gZmlsZXMuc29ydCgoZmlsZUEsIGZpbGVCKSA9PiB7XG4gICAgICBsZXQgYSA9IG5ldyBEYXRlKHRoaXMucGx1Z2luLmdldEl0ZW1Nb2RpZmllZERhdGUoZmlsZUEpKVxuICAgICAgbGV0IGIgPSBuZXcgRGF0ZSh0aGlzLnBsdWdpbi5nZXRJdGVtTW9kaWZpZWREYXRlKGZpbGVCKSlcblxuICAgICAgaWYgKHNvcnRpbmcgPT09ICdkYXRlRGVzY2VuZGluZycpIHtcbiAgICAgICAgcmV0dXJuIGEgPiBiID8gLTEgOiBhIDwgYiA/IDEgOiAwXG4gICAgICB9XG4gICAgICByZXR1cm4gYSA+IGIgPyAxIDogYSA8IGIgPyAtMSA6IDBcbiAgICB9KVxuXG4gICAgbGV0IHNvcnRlZEZvbGRlcnMgPSBmb2xkZXJzLnNvcnQoKGZvbGRlckEsIGZvbGRlckIpID0+IHtcbiAgICAgIGxldCBhID0gbmV3IERhdGUodGhpcy5wbHVnaW4uZ2V0SXRlbU1vZGlmaWVkRGF0ZShmb2xkZXJBKSlcbiAgICAgIGxldCBiID0gbmV3IERhdGUodGhpcy5wbHVnaW4uZ2V0SXRlbU1vZGlmaWVkRGF0ZShmb2xkZXJCKSlcblxuICAgICAgaWYgKHNvcnRpbmcgPT09ICdkYXRlRGVzY2VuZGluZycpIHtcbiAgICAgICAgcmV0dXJuIGEgPiBiID8gLTEgOiBhIDwgYiA/IDEgOiAwXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhID4gYiA/IDEgOiBhIDwgYiA/IC0xIDogMFxuICAgIH0pXG5cbiAgICB0aGlzLnVwZGF0ZVN0YXRlKE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICBmaWxlczogc29ydGVkRmlsZXMsXG4gICAgICBmb2xkZXJzOiBzb3J0ZWRGb2xkZXJzLFxuICAgICAgc29ydGluZzogKHNvcnRpbmcgPT09ICdkYXRlRGVzY2VuZGluZycpID8gJ2RhdGVBc2NlbmRpbmcnIDogJ2RhdGVEZXNjZW5kaW5nJ1xuICAgIH0pKVxuICB9XG5cbiAgaXNBY3RpdmVSb3cgKGZpbGUpIHtcbiAgICByZXR1cm4gdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdLmFjdGl2ZVJvdyA9PT0gdGhpcy5wbHVnaW4uZ2V0SXRlbUlkKGZpbGUpXG4gIH1cblxuICBoYW5kbGVEZW1vQXV0aCAoKSB7XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLnBsdWdpbi5jb3JlLmdldFN0YXRlKClbdGhpcy5wbHVnaW4uc3RhdGVJZF1cbiAgICB0aGlzLnVwZGF0ZVN0YXRlKHt9LCBzdGF0ZSwge1xuICAgICAgYXV0aGVudGljYXRlZDogdHJ1ZVxuICAgIH0pXG4gIH1cblxuICBoYW5kbGVBdXRoICgpIHtcbiAgICBjb25zdCB1cmxJZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDk5OTk5OSkgKyAxXG4gICAgY29uc3QgcmVkaXJlY3QgPSBgJHtsb2NhdGlvbi5ocmVmfSR7bG9jYXRpb24uc2VhcmNoID8gJyYnIDogJz8nfWlkPSR7dXJsSWR9YFxuXG4gICAgY29uc3QgYXV0aFN0YXRlID0gYnRvYShKU09OLnN0cmluZ2lmeSh7IHJlZGlyZWN0IH0pKVxuICAgIGNvbnN0IGxpbmsgPSBgJHt0aGlzLnBsdWdpbi5vcHRzLmhvc3R9L2Nvbm5lY3QvJHt0aGlzLlByb3ZpZGVyLmF1dGhQcm92aWRlcn0/c3RhdGU9JHthdXRoU3RhdGV9YFxuXG4gICAgY29uc3QgYXV0aFdpbmRvdyA9IHdpbmRvdy5vcGVuKGxpbmssICdfYmxhbmsnKVxuICAgIGNvbnN0IGNoZWNrQXV0aCA9ICgpID0+IHtcbiAgICAgIGxldCBhdXRoV2luZG93VXJsXG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF1dGhXaW5kb3dVcmwgPSBhdXRoV2luZG93LmxvY2F0aW9uLmhyZWZcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGUgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gfHwgZSBpbnN0YW5jZW9mIFR5cGVFcnJvcikge1xuICAgICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGNoZWNrQXV0aCwgMTAwKVxuICAgICAgICB9IGVsc2UgdGhyb3cgZVxuICAgICAgfVxuXG4gICAgICAvLyBzcGxpdCB1cmwgYmVjYXVzZSBjaHJvbWUgYWRkcyAnIycgdG8gcmVkaXJlY3RzXG4gICAgICBpZiAoYXV0aFdpbmRvd1VybC5zcGxpdCgnIycpWzBdID09PSByZWRpcmVjdCkge1xuICAgICAgICBhdXRoV2luZG93LmNsb3NlKClcbiAgICAgICAgdGhpcy5fbG9hZGVyV3JhcHBlcih0aGlzLlByb3ZpZGVyLmF1dGgoKSwgdGhpcy5wbHVnaW4ub25BdXRoLCB0aGlzLmhhbmRsZUVycm9yKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VGltZW91dChjaGVja0F1dGgsIDEwMClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjaGVja0F1dGgoKVxuICB9XG5cbiAgaGFuZGxlRXJyb3IgKGVycm9yKSB7XG4gICAgdGhpcy51cGRhdGVTdGF0ZSh7IGVycm9yIH0pXG4gIH1cblxuICAvLyBkaXNwbGF5cyBsb2FkZXIgdmlldyB3aGlsZSBhc3luY2hyb25vdXMgcmVxdWVzdCBpcyBiZWluZyBtYWRlLlxuICBfbG9hZGVyV3JhcHBlciAocHJvbWlzZSwgdGhlbiwgY2F0Y2hfKSB7XG4gICAgcHJvbWlzZVxuICAgICAgLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICB0aGlzLnVwZGF0ZVN0YXRlKHsgbG9hZGluZzogZmFsc2UgfSlcbiAgICAgICAgdGhlbihyZXN1bHQpXG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZSh7IGxvYWRpbmc6IGZhbHNlIH0pXG4gICAgICAgIGNhdGNoXyhlcnIpXG4gICAgICB9KVxuICAgIHRoaXMudXBkYXRlU3RhdGUoeyBsb2FkaW5nOiB0cnVlIH0pXG4gIH1cblxuICByZW5kZXIgKHN0YXRlKSB7XG4gICAgY29uc3QgeyBhdXRoZW50aWNhdGVkLCBlcnJvciwgbG9hZGluZyB9ID0gc3RhdGVbdGhpcy5wbHVnaW4uc3RhdGVJZF1cblxuICAgIGlmIChlcnJvcikge1xuICAgICAgdGhpcy51cGRhdGVTdGF0ZSh7IGVycm9yOiB1bmRlZmluZWQgfSlcbiAgICAgIHJldHVybiBFcnJvclZpZXcoeyBlcnJvcjogZXJyb3IgfSlcbiAgICB9XG5cbiAgICBpZiAobG9hZGluZykge1xuICAgICAgcmV0dXJuIExvYWRlclZpZXcoKVxuICAgIH1cblxuICAgIGlmICghYXV0aGVudGljYXRlZCkge1xuICAgICAgcmV0dXJuIEF1dGhWaWV3KHtcbiAgICAgICAgcGx1Z2luTmFtZTogdGhpcy5wbHVnaW4udGl0bGUsXG4gICAgICAgIGRlbW86IHRoaXMucGx1Z2luLm9wdHMuZGVtbyxcbiAgICAgICAgaGFuZGxlQXV0aDogdGhpcy5oYW5kbGVBdXRoLFxuICAgICAgICBoYW5kbGVEZW1vQXV0aDogdGhpcy5oYW5kbGVEZW1vQXV0aFxuICAgICAgfSlcbiAgICB9XG5cbiAgICBjb25zdCBicm93c2VyUHJvcHMgPSBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZVt0aGlzLnBsdWdpbi5zdGF0ZUlkXSwge1xuICAgICAgZ2V0TmV4dEZvbGRlcjogdGhpcy5nZXROZXh0Rm9sZGVyLFxuICAgICAgZ2V0Rm9sZGVyOiB0aGlzLmdldEZvbGRlcixcbiAgICAgIGFkZEZpbGU6IHRoaXMuYWRkRmlsZSxcbiAgICAgIGZpbHRlckl0ZW1zOiB0aGlzLmZpbHRlckl0ZW1zLFxuICAgICAgZmlsdGVyUXVlcnk6IHRoaXMuZmlsdGVyUXVlcnksXG4gICAgICBoYW5kbGVSb3dDbGljazogdGhpcy5oYW5kbGVSb3dDbGljayxcbiAgICAgIHNvcnRCeVRpdGxlOiB0aGlzLnNvcnRCeVRpdGxlLFxuICAgICAgc29ydEJ5RGF0ZTogdGhpcy5zb3J0QnlEYXRlLFxuICAgICAgbG9nb3V0OiB0aGlzLmxvZ291dCxcbiAgICAgIGRlbW86IHRoaXMucGx1Z2luLm9wdHMuZGVtbyxcbiAgICAgIGlzQWN0aXZlUm93OiB0aGlzLmlzQWN0aXZlUm93LFxuICAgICAgZ2V0SXRlbU5hbWU6IHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lLFxuICAgICAgZ2V0SXRlbUljb246IHRoaXMucGx1Z2luLmdldEl0ZW1JY29uXG4gICAgfSlcblxuICAgIHJldHVybiBCcm93c2VyKGJyb3dzZXJQcm9wcylcbiAgfVxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgY29uc3QgaW5wdXQgPSBodG1sYFxuICAgIDxpbnB1dCBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtaW5wdXRcIiB0eXBlPVwiZmlsZVwiIG5hbWU9XCJmaWxlc1tdXCIgbXVsdGlwbGU9XCJ0cnVlXCJcbiAgICAgICAgICAgb25jaGFuZ2U9JHtwcm9wcy5oYW5kbGVJbnB1dENoYW5nZX0gLz5cbiAgYFxuXG4gIHJldHVybiBodG1sYFxuICAgIDxzcGFuPlxuICAgICAgJHtwcm9wcy5hY3F1aXJlcnMubGVuZ3RoID09PSAwXG4gICAgICAgID8gcHJvcHMuaTE4bignZHJvcFBhc3RlJylcbiAgICAgICAgOiBwcm9wcy5pMThuKCdkcm9wUGFzdGVJbXBvcnQnKVxuICAgICAgfVxuICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCJcbiAgICAgICAgICAgICAgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWJyb3dzZVwiXG4gICAgICAgICAgICAgIG9uY2xpY2s9JHsoZXYpID0+IHtcbiAgICAgICAgICAgICAgICBpbnB1dC5jbGljaygpXG4gICAgICAgICAgICAgIH19PiR7cHJvcHMuaTE4bignYnJvd3NlJyl9PC9idXR0b24+XG4gICAgICAke2lucHV0fVxuICAgIDwvc3Bhbj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IEZpbGVMaXN0ID0gcmVxdWlyZSgnLi9GaWxlTGlzdCcpXG5jb25zdCBUYWJzID0gcmVxdWlyZSgnLi9UYWJzJylcbmNvbnN0IEZpbGVDYXJkID0gcmVxdWlyZSgnLi9GaWxlQ2FyZCcpXG5jb25zdCBVcGxvYWRCdG4gPSByZXF1aXJlKCcuL1VwbG9hZEJ0bicpXG5jb25zdCBTdGF0dXNCYXIgPSByZXF1aXJlKCcuL1N0YXR1c0JhcicpXG5jb25zdCB7IGlzVG91Y2hEZXZpY2UsIHRvQXJyYXkgfSA9IHJlcXVpcmUoJy4uLy4uL2NvcmUvVXRpbHMnKVxuY29uc3QgeyBjbG9zZUljb24gfSA9IHJlcXVpcmUoJy4vaWNvbnMnKVxuXG4vLyBodHRwOi8vZGV2LmVkZW5zcGlla2VybWFubi5jb20vMjAxNi8wMi8xMS9pbnRyb2R1Y2luZy1hY2Nlc3NpYmxlLW1vZGFsLWRpYWxvZ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIERhc2hib2FyZCAocHJvcHMpIHtcbiAgZnVuY3Rpb24gaGFuZGxlSW5wdXRDaGFuZ2UgKGV2KSB7XG4gICAgZXYucHJldmVudERlZmF1bHQoKVxuICAgIGNvbnN0IGZpbGVzID0gdG9BcnJheShldi50YXJnZXQuZmlsZXMpXG5cbiAgICBmaWxlcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICBwcm9wcy5hZGRGaWxlKHtcbiAgICAgICAgc291cmNlOiBwcm9wcy5pZCxcbiAgICAgICAgbmFtZTogZmlsZS5uYW1lLFxuICAgICAgICB0eXBlOiBmaWxlLnR5cGUsXG4gICAgICAgIGRhdGE6IGZpbGVcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIC8vIEBUT0RPIEV4cHJpbWVudGFsLCB3b3JrIGluIHByb2dyZXNzXG4gIC8vIG5vIG5hbWVzLCB3ZWlyZCBBUEksIENocm9tZS1vbmx5IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzIyOTQwMDIwXG4gIGZ1bmN0aW9uIGhhbmRsZVBhc3RlIChldikge1xuICAgIGV2LnByZXZlbnREZWZhdWx0KClcblxuICAgIGNvbnN0IGZpbGVzID0gdG9BcnJheShldi5jbGlwYm9hcmREYXRhLml0ZW1zKVxuICAgIGZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIGlmIChmaWxlLmtpbmQgIT09ICdmaWxlJykgcmV0dXJuXG5cbiAgICAgIGNvbnN0IGJsb2IgPSBmaWxlLmdldEFzRmlsZSgpXG4gICAgICBwcm9wcy5sb2coJ0ZpbGUgcGFzdGVkJylcbiAgICAgIHByb3BzLmFkZEZpbGUoe1xuICAgICAgICBzb3VyY2U6IHByb3BzLmlkLFxuICAgICAgICBuYW1lOiBmaWxlLm5hbWUsXG4gICAgICAgIHR5cGU6IGZpbGUudHlwZSxcbiAgICAgICAgZGF0YTogYmxvYlxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIGh0bWxgXG4gICAgPGRpdiBjbGFzcz1cIlVwcHkgVXBweVRoZW1lLS1kZWZhdWx0IFVwcHlEYXNoYm9hcmRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJHtpc1RvdWNoRGV2aWNlKCkgPyAnVXBweS0taXNUb3VjaERldmljZScgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgJHtwcm9wcy5zZW1pVHJhbnNwYXJlbnQgPyAnVXBweURhc2hib2FyZC0tc2VtaVRyYW5zcGFyZW50JyA6ICcnfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAkeyFwcm9wcy5pbmxpbmUgPyAnVXBweURhc2hib2FyZC0tbW9kYWwnIDogJyd9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICR7cHJvcHMuaXNXaWRlID8gJ1VwcHlEYXNoYm9hcmQtLXdpZGUnIDogJyd9XCJcbiAgICAgICAgICBhcmlhLWhpZGRlbj1cIiR7cHJvcHMuaW5saW5lID8gJ2ZhbHNlJyA6IHByb3BzLm1vZGFsLmlzSGlkZGVufVwiXG4gICAgICAgICAgYXJpYS1sYWJlbD1cIiR7IXByb3BzLmlubGluZVxuICAgICAgICAgICAgICAgICAgICAgICA/IHByb3BzLmkxOG4oJ2Rhc2hib2FyZFdpbmRvd1RpdGxlJylcbiAgICAgICAgICAgICAgICAgICAgICAgOiBwcm9wcy5pMThuKCdkYXNoYm9hcmRUaXRsZScpfVwiXG4gICAgICAgICAgcm9sZT1cImRpYWxvZ1wiXG4gICAgICAgICAgb25wYXN0ZT0ke2hhbmRsZVBhc3RlfVxuICAgICAgICAgIG9ubG9hZD0keygpID0+IHByb3BzLnVwZGF0ZURhc2hib2FyZEVsV2lkdGgoKX0+XG5cbiAgICA8YnV0dG9uIGNsYXNzPVwiVXBweURhc2hib2FyZC1jbG9zZVwiXG4gICAgICAgICAgICBhcmlhLWxhYmVsPVwiJHtwcm9wcy5pMThuKCdjbG9zZU1vZGFsJyl9XCJcbiAgICAgICAgICAgIHRpdGxlPVwiJHtwcm9wcy5pMThuKCdjbG9zZU1vZGFsJyl9XCJcbiAgICAgICAgICAgIG9uY2xpY2s9JHtwcm9wcy5oaWRlTW9kYWx9PiR7Y2xvc2VJY29uKCl9PC9idXR0b24+XG5cbiAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1vdmVybGF5XCIgb25jbGljaz0ke3Byb3BzLmhpZGVNb2RhbH0+PC9kaXY+XG5cbiAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1pbm5lclwiXG4gICAgICAgICB0YWJpbmRleD1cIjBcIlxuICAgICAgICAgc3R5bGU9XCJcbiAgICAgICAgICAke3Byb3BzLmlubGluZSAmJiBwcm9wcy5tYXhXaWR0aCA/IGBtYXgtd2lkdGg6ICR7cHJvcHMubWF4V2lkdGh9cHg7YCA6ICcnfVxuICAgICAgICAgICR7cHJvcHMuaW5saW5lICYmIHByb3BzLm1heEhlaWdodCA/IGBtYXgtaGVpZ2h0OiAke3Byb3BzLm1heEhlaWdodH1weDtgIDogJyd9XG4gICAgICAgICBcIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWlubmVyV3JhcFwiPlxuXG4gICAgICAgICR7VGFicyh7XG4gICAgICAgICAgZmlsZXM6IHByb3BzLmZpbGVzLFxuICAgICAgICAgIGhhbmRsZUlucHV0Q2hhbmdlOiBoYW5kbGVJbnB1dENoYW5nZSxcbiAgICAgICAgICBhY3F1aXJlcnM6IHByb3BzLmFjcXVpcmVycyxcbiAgICAgICAgICBwYW5lbFNlbGVjdG9yUHJlZml4OiBwcm9wcy5wYW5lbFNlbGVjdG9yUHJlZml4LFxuICAgICAgICAgIHNob3dQYW5lbDogcHJvcHMuc2hvd1BhbmVsLFxuICAgICAgICAgIGkxOG46IHByb3BzLmkxOG5cbiAgICAgICAgfSl9XG5cbiAgICAgICAgJHtGaWxlQ2FyZCh7XG4gICAgICAgICAgZmlsZXM6IHByb3BzLmZpbGVzLFxuICAgICAgICAgIGZpbGVDYXJkRm9yOiBwcm9wcy5maWxlQ2FyZEZvcixcbiAgICAgICAgICBkb25lOiBwcm9wcy5maWxlQ2FyZERvbmUsXG4gICAgICAgICAgbWV0YUZpZWxkczogcHJvcHMubWV0YUZpZWxkcyxcbiAgICAgICAgICBsb2c6IHByb3BzLmxvZyxcbiAgICAgICAgICBpMThuOiBwcm9wcy5pMThuXG4gICAgICAgIH0pfVxuXG4gICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWZpbGVzQ29udGFpbmVyXCI+XG5cbiAgICAgICAgICAke0ZpbGVMaXN0KHtcbiAgICAgICAgICAgIGFjcXVpcmVyczogcHJvcHMuYWNxdWlyZXJzLFxuICAgICAgICAgICAgZmlsZXM6IHByb3BzLmZpbGVzLFxuICAgICAgICAgICAgaGFuZGxlSW5wdXRDaGFuZ2U6IGhhbmRsZUlucHV0Q2hhbmdlLFxuICAgICAgICAgICAgc2hvd0ZpbGVDYXJkOiBwcm9wcy5zaG93RmlsZUNhcmQsXG4gICAgICAgICAgICBzaG93UHJvZ3Jlc3NEZXRhaWxzOiBwcm9wcy5zaG93UHJvZ3Jlc3NEZXRhaWxzLFxuICAgICAgICAgICAgdG90YWxQcm9ncmVzczogcHJvcHMudG90YWxQcm9ncmVzcyxcbiAgICAgICAgICAgIHRvdGFsRmlsZUNvdW50OiBwcm9wcy50b3RhbEZpbGVDb3VudCxcbiAgICAgICAgICAgIGluZm86IHByb3BzLmluZm8sXG4gICAgICAgICAgICBpMThuOiBwcm9wcy5pMThuLFxuICAgICAgICAgICAgbG9nOiBwcm9wcy5sb2csXG4gICAgICAgICAgICByZW1vdmVGaWxlOiBwcm9wcy5yZW1vdmVGaWxlLFxuICAgICAgICAgICAgcGF1c2VBbGw6IHByb3BzLnBhdXNlQWxsLFxuICAgICAgICAgICAgcmVzdW1lQWxsOiBwcm9wcy5yZXN1bWVBbGwsXG4gICAgICAgICAgICBwYXVzZVVwbG9hZDogcHJvcHMucGF1c2VVcGxvYWQsXG4gICAgICAgICAgICBzdGFydFVwbG9hZDogcHJvcHMuc3RhcnRVcGxvYWQsXG4gICAgICAgICAgICBjYW5jZWxVcGxvYWQ6IHByb3BzLmNhbmNlbFVwbG9hZCxcbiAgICAgICAgICAgIHJlc3VtYWJsZVVwbG9hZHM6IHByb3BzLnJlc3VtYWJsZVVwbG9hZHMsXG4gICAgICAgICAgICBpc1dpZGU6IHByb3BzLmlzV2lkZVxuICAgICAgICAgIH0pfVxuXG4gICAgICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtYWN0aW9uc1wiPlxuICAgICAgICAgICAgJHshcHJvcHMuYXV0b1Byb2NlZWQgJiYgcHJvcHMubmV3RmlsZXMubGVuZ3RoID4gMFxuICAgICAgICAgICAgICA/IFVwbG9hZEJ0bih7XG4gICAgICAgICAgICAgICAgaTE4bjogcHJvcHMuaTE4bixcbiAgICAgICAgICAgICAgICBzdGFydFVwbG9hZDogcHJvcHMuc3RhcnRVcGxvYWQsXG4gICAgICAgICAgICAgICAgbmV3RmlsZUNvdW50OiBwcm9wcy5uZXdGaWxlcy5sZW5ndGhcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgOiBudWxsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LXBhbmVsXCJcbiAgICAgICAgICAgICByb2xlPVwidGFicGFuZWxcIlxuICAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwiJHtwcm9wcy5hY3RpdmVQYW5lbCA/ICdmYWxzZScgOiAndHJ1ZSd9XCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LWJhclwiPlxuICAgICAgICAgICAgPGgyIGNsYXNzPVwiVXBweURhc2hib2FyZENvbnRlbnQtdGl0bGVcIj5cbiAgICAgICAgICAgICAgJHtwcm9wcy5pMThuKCdpbXBvcnRGcm9tJyl9ICR7cHJvcHMuYWN0aXZlUGFuZWwgPyBwcm9wcy5hY3RpdmVQYW5lbC5uYW1lIDogbnVsbH1cbiAgICAgICAgICAgIDwvaDI+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiVXBweURhc2hib2FyZENvbnRlbnQtYmFja1wiXG4gICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9JHtwcm9wcy5oaWRlQWxsUGFuZWxzfT4ke3Byb3BzLmkxOG4oJ2RvbmUnKX08L2J1dHRvbj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAke3Byb3BzLmFjdGl2ZVBhbmVsID8gcHJvcHMuYWN0aXZlUGFuZWwucmVuZGVyKHByb3BzLnN0YXRlKSA6ICcnfVxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1wcm9ncmVzc2luZGljYXRvcnNcIj5cbiAgICAgICAgICAke1N0YXR1c0Jhcih7XG4gICAgICAgICAgICB0b3RhbFByb2dyZXNzOiBwcm9wcy50b3RhbFByb2dyZXNzLFxuICAgICAgICAgICAgdG90YWxGaWxlQ291bnQ6IHByb3BzLnRvdGFsRmlsZUNvdW50LFxuICAgICAgICAgICAgdG90YWxTaXplOiBwcm9wcy50b3RhbFNpemUsXG4gICAgICAgICAgICB0b3RhbFVwbG9hZGVkU2l6ZTogcHJvcHMudG90YWxVcGxvYWRlZFNpemUsXG4gICAgICAgICAgICB1cGxvYWRTdGFydGVkRmlsZXM6IHByb3BzLnVwbG9hZFN0YXJ0ZWRGaWxlcyxcbiAgICAgICAgICAgIGlzQWxsQ29tcGxldGU6IHByb3BzLmlzQWxsQ29tcGxldGUsXG4gICAgICAgICAgICBpc0FsbFBhdXNlZDogcHJvcHMuaXNBbGxQYXVzZWQsXG4gICAgICAgICAgICBpc1VwbG9hZFN0YXJ0ZWQ6IHByb3BzLmlzVXBsb2FkU3RhcnRlZCxcbiAgICAgICAgICAgIHBhdXNlQWxsOiBwcm9wcy5wYXVzZUFsbCxcbiAgICAgICAgICAgIHJlc3VtZUFsbDogcHJvcHMucmVzdW1lQWxsLFxuICAgICAgICAgICAgY2FuY2VsQWxsOiBwcm9wcy5jYW5jZWxBbGwsXG4gICAgICAgICAgICBjb21wbGV0ZTogcHJvcHMuY29tcGxldGVGaWxlcy5sZW5ndGgsXG4gICAgICAgICAgICBpblByb2dyZXNzOiBwcm9wcy5pblByb2dyZXNzLFxuICAgICAgICAgICAgdG90YWxTcGVlZDogcHJvcHMudG90YWxTcGVlZCxcbiAgICAgICAgICAgIHRvdGFsRVRBOiBwcm9wcy50b3RhbEVUQSxcbiAgICAgICAgICAgIHN0YXJ0VXBsb2FkOiBwcm9wcy5zdGFydFVwbG9hZCxcbiAgICAgICAgICAgIG5ld0ZpbGVDb3VudDogcHJvcHMubmV3RmlsZXMubGVuZ3RoLFxuICAgICAgICAgICAgaTE4bjogcHJvcHMuaTE4bixcbiAgICAgICAgICAgIHJlc3VtYWJsZVVwbG9hZHM6IHByb3BzLnJlc3VtYWJsZVVwbG9hZHNcbiAgICAgICAgICB9KX1cblxuICAgICAgICAgICR7cHJvcHMucHJvZ3Jlc3NpbmRpY2F0b3JzLm1hcCgodGFyZ2V0KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0LnJlbmRlcihwcm9wcy5zdGF0ZSlcbiAgICAgICAgICB9KX1cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IGdldEZpbGVUeXBlSWNvbiA9IHJlcXVpcmUoJy4vZ2V0RmlsZVR5cGVJY29uJylcbmNvbnN0IHsgY2hlY2tJY29uIH0gPSByZXF1aXJlKCcuL2ljb25zJylcblxuLy8gZnVuY3Rpb24gZ2V0SWNvbkJ5TWltZSAoZmlsZVR5cGVHZW5lcmFsKSB7XG4vLyAgIHN3aXRjaCAoZmlsZVR5cGVHZW5lcmFsKSB7XG4vLyAgICAgY2FzZSAndGV4dCc6XG4vLyAgICAgICByZXR1cm4gaWNvblRleHQoKVxuLy8gICAgIGNhc2UgJ2F1ZGlvJzpcbi8vICAgICAgIHJldHVybiBpY29uQXVkaW8oKVxuLy8gICAgIGRlZmF1bHQ6XG4vLyAgICAgICByZXR1cm4gaWNvbkZpbGUoKVxuLy8gICB9XG4vLyB9XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmlsZUNhcmQgKHByb3BzKSB7XG4gIGNvbnN0IGZpbGUgPSBwcm9wcy5maWxlQ2FyZEZvciA/IHByb3BzLmZpbGVzW3Byb3BzLmZpbGVDYXJkRm9yXSA6IGZhbHNlXG4gIGNvbnN0IG1ldGEgPSB7fVxuXG4gIGZ1bmN0aW9uIHRlbXBTdG9yZU1ldGEgKGV2KSB7XG4gICAgY29uc3QgdmFsdWUgPSBldi50YXJnZXQudmFsdWVcbiAgICBjb25zdCBuYW1lID0gZXYudGFyZ2V0LmF0dHJpYnV0ZXMubmFtZS52YWx1ZVxuICAgIG1ldGFbbmFtZV0gPSB2YWx1ZVxuICB9XG5cbiAgZnVuY3Rpb24gcmVuZGVyTWV0YUZpZWxkcyAoZmlsZSkge1xuICAgIGNvbnN0IG1ldGFGaWVsZHMgPSBwcm9wcy5tZXRhRmllbGRzIHx8IFtdXG4gICAgcmV0dXJuIG1ldGFGaWVsZHMubWFwKChmaWVsZCkgPT4ge1xuICAgICAgcmV0dXJuIGh0bWxgPGZpZWxkc2V0IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkLWZpZWxkc2V0XCI+XG4gICAgICAgIDxsYWJlbCBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZC1sYWJlbFwiPiR7ZmllbGQubmFtZX08L2xhYmVsPlxuICAgICAgICA8aW5wdXQgY2xhc3M9XCJVcHB5RGFzaGJvYXJkRmlsZUNhcmQtaW5wdXRcIlxuICAgICAgICAgICAgICAgbmFtZT1cIiR7ZmllbGQuaWR9XCJcbiAgICAgICAgICAgICAgIHR5cGU9XCJ0ZXh0XCJcbiAgICAgICAgICAgICAgIHZhbHVlPVwiJHtmaWxlLm1ldGFbZmllbGQuaWRdfVwiXG4gICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIiR7ZmllbGQucGxhY2Vob2xkZXIgfHwgJyd9XCJcbiAgICAgICAgICAgICAgIG9ua2V5dXA9JHt0ZW1wU3RvcmVNZXRhfSAvPjwvZmllbGRzZXQ+YFxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gaHRtbGA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkXCIgYXJpYS1oaWRkZW49XCIkeyFwcm9wcy5maWxlQ2FyZEZvcn1cIj5cbiAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZENvbnRlbnQtYmFyXCI+XG4gICAgICA8aDIgY2xhc3M9XCJVcHB5RGFzaGJvYXJkQ29udGVudC10aXRsZVwiPkVkaXRpbmcgPHNwYW4gY2xhc3M9XCJVcHB5RGFzaGJvYXJkQ29udGVudC10aXRsZUZpbGVcIj4ke2ZpbGUubWV0YSA/IGZpbGUubWV0YS5uYW1lIDogZmlsZS5uYW1lfTwvc3Bhbj48L2gyPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LWJhY2tcIiB0aXRsZT1cIkZpbmlzaCBlZGl0aW5nIGZpbGVcIlxuICAgICAgICAgICAgICBvbmNsaWNrPSR7KCkgPT4gcHJvcHMuZG9uZShtZXRhLCBmaWxlLmlkKX0+RG9uZTwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICAgICR7cHJvcHMuZmlsZUNhcmRGb3JcbiAgICAgID8gaHRtbGA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkLWlubmVyXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZC1wcmV2aWV3XCI+XG4gICAgICAgICAgICAke2ZpbGUucHJldmlld1xuICAgICAgICAgICAgICA/IGh0bWxgPGltZyBhbHQ9XCIke2ZpbGUubmFtZX1cIiBzcmM9XCIke2ZpbGUucHJldmlld31cIj5gXG4gICAgICAgICAgICAgIDogaHRtbGA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEl0ZW0tcHJldmlld0ljb25cIiBzdHlsZT1cImNvbG9yOiAke2dldEZpbGVUeXBlSWNvbihmaWxlLnR5cGUuZ2VuZXJhbCwgZmlsZS50eXBlLnNwZWNpZmljKS5jb2xvcn1cIj5cbiAgICAgICAgICAgICAgICAgICR7Z2V0RmlsZVR5cGVJY29uKGZpbGUudHlwZS5nZW5lcmFsLCBmaWxlLnR5cGUuc3BlY2lmaWMpLmljb259XG4gICAgICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkRmlsZUNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgPGZpZWxkc2V0IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkLWZpZWxkc2V0XCI+XG4gICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZC1sYWJlbFwiPk5hbWU8L2xhYmVsPlxuICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJVcHB5RGFzaGJvYXJkRmlsZUNhcmQtaW5wdXRcIiBuYW1lPVwibmFtZVwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke2ZpbGUubWV0YS5uYW1lfVwiXG4gICAgICAgICAgICAgICAgICAgICBvbmtleXVwPSR7dGVtcFN0b3JlTWV0YX0gLz5cbiAgICAgICAgICAgIDwvZmllbGRzZXQ+XG4gICAgICAgICAgICAke3JlbmRlck1ldGFGaWVsZHMoZmlsZSl9XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PmBcbiAgICAgIDogbnVsbFxuICAgIH1cbiAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1hY3Rpb25zXCI+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwiVXBweUJ1dHRvbi0tY2lyY3VsYXIgVXBweUJ1dHRvbi0tYmx1ZSBVcHB5RGFzaGJvYXJkRmlsZUNhcmQtZG9uZVwiXG4gICAgICAgICAgICAgIHR5cGU9XCJidXR0b25cIlxuICAgICAgICAgICAgICB0aXRsZT1cIkZpbmlzaCBlZGl0aW5nIGZpbGVcIlxuICAgICAgICAgICAgICBvbmNsaWNrPSR7KCkgPT4gcHJvcHMuZG9uZShtZXRhLCBmaWxlLmlkKX0+JHtjaGVja0ljb24oKX08L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgICA8L2Rpdj5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgeyBnZXRFVEEsXG4gICAgICAgICBnZXRTcGVlZCxcbiAgICAgICAgIHByZXR0eUVUQSxcbiAgICAgICAgIGdldEZpbGVOYW1lQW5kRXh0ZW5zaW9uLFxuICAgICAgICAgdHJ1bmNhdGVTdHJpbmcsXG4gICAgICAgICBjb3B5VG9DbGlwYm9hcmQgfSA9IHJlcXVpcmUoJy4uLy4uL2NvcmUvVXRpbHMnKVxuY29uc3QgcHJldHR5Qnl0ZXMgPSByZXF1aXJlKCdwcmV0dGllci1ieXRlcycpXG5jb25zdCBGaWxlSXRlbVByb2dyZXNzID0gcmVxdWlyZSgnLi9GaWxlSXRlbVByb2dyZXNzJylcbmNvbnN0IGdldEZpbGVUeXBlSWNvbiA9IHJlcXVpcmUoJy4vZ2V0RmlsZVR5cGVJY29uJylcbmNvbnN0IHsgaWNvbkVkaXQsIGljb25Db3B5IH0gPSByZXF1aXJlKCcuL2ljb25zJylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmaWxlSXRlbSAocHJvcHMpIHtcbiAgY29uc3QgZmlsZSA9IHByb3BzLmZpbGVcbiAgY29uc3QgYWNxdWlyZXJzID0gcHJvcHMuYWNxdWlyZXJzXG5cbiAgY29uc3QgaXNVcGxvYWRlZCA9IGZpbGUucHJvZ3Jlc3MudXBsb2FkQ29tcGxldGVcbiAgY29uc3QgdXBsb2FkSW5Qcm9ncmVzc09yQ29tcGxldGUgPSBmaWxlLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgY29uc3QgdXBsb2FkSW5Qcm9ncmVzcyA9IGZpbGUucHJvZ3Jlc3MudXBsb2FkU3RhcnRlZCAmJiAhZmlsZS5wcm9ncmVzcy51cGxvYWRDb21wbGV0ZVxuICBjb25zdCBpc1BhdXNlZCA9IGZpbGUuaXNQYXVzZWQgfHwgZmFsc2VcblxuICBjb25zdCBmaWxlTmFtZSA9IGdldEZpbGVOYW1lQW5kRXh0ZW5zaW9uKGZpbGUubWV0YS5uYW1lKVswXVxuICBjb25zdCB0cnVuY2F0ZWRGaWxlTmFtZSA9IHByb3BzLmlzV2lkZSA/IHRydW5jYXRlU3RyaW5nKGZpbGVOYW1lLCAxNSkgOiBmaWxlTmFtZVxuXG4gIHJldHVybiBodG1sYDxsaSBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtXG4gICAgICAgICAgICAgICAgICAgICAgICAke3VwbG9hZEluUHJvZ3Jlc3MgPyAnaXMtaW5wcm9ncmVzcycgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICR7aXNVcGxvYWRlZCA/ICdpcy1jb21wbGV0ZScgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICR7aXNQYXVzZWQgPyAnaXMtcGF1c2VkJyA6ICcnfVxuICAgICAgICAgICAgICAgICAgICAgICAgJHtwcm9wcy5yZXN1bWFibGVVcGxvYWRzID8gJ2lzLXJlc3VtYWJsZScgOiAnJ31cIlxuICAgICAgICAgICAgICAgICAgaWQ9XCJ1cHB5XyR7ZmlsZS5pZH1cIlxuICAgICAgICAgICAgICAgICAgdGl0bGU9XCIke2ZpbGUubWV0YS5uYW1lfVwiPlxuICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLXByZXZpZXdcIj5cbiAgICAgICAgJHtmaWxlLnNvdXJjZVxuICAgICAgICAgID8gaHRtbGA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEl0ZW0tc291cmNlSWNvblwiPlxuICAgICAgICAgICAgJHthY3F1aXJlcnMubWFwKGFjcXVpcmVyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGFjcXVpcmVyLmlkID09PSBmaWxlLnNvdXJjZSkgcmV0dXJuIGh0bWxgPHNwYW4gdGl0bGU9XCIke2FjcXVpcmVyLm5hbWV9XCI+JHthY3F1aXJlci5pY29uKCl9PC9zcGFuPmBcbiAgICAgICAgICAgIH0pfVxuICAgICAgICAgIDwvZGl2PmBcbiAgICAgICAgICA6ICcnXG4gICAgICAgIH1cbiAgICAgICAgJHtmaWxlLnByZXZpZXdcbiAgICAgICAgICA/IGh0bWxgPGltZyBhbHQ9XCIke2ZpbGUubmFtZX1cIiBzcmM9XCIke2ZpbGUucHJldmlld31cIj5gXG4gICAgICAgICAgOiBodG1sYDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1wcmV2aWV3SWNvblwiIHN0eWxlPVwiY29sb3I6ICR7Z2V0RmlsZVR5cGVJY29uKGZpbGUudHlwZS5nZW5lcmFsLCBmaWxlLnR5cGUuc3BlY2lmaWMpLmNvbG9yfVwiPlxuICAgICAgICAgICAgICAke2dldEZpbGVUeXBlSWNvbihmaWxlLnR5cGUuZ2VuZXJhbCwgZmlsZS50eXBlLnNwZWNpZmljKS5pY29ufVxuICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICB9XG4gICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1wcm9ncmVzc1wiPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1wcm9ncmVzc0J0blwiXG4gICAgICAgICAgICAgICAgICB0aXRsZT1cIiR7aXNVcGxvYWRlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICA/ICd1cGxvYWQgY29tcGxldGUnXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDogcHJvcHMucmVzdW1hYmxlVXBsb2Fkc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZmlsZS5pc1BhdXNlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyAncmVzdW1lIHVwbG9hZCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJ3BhdXNlIHVwbG9hZCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6ICdjYW5jZWwgdXBsb2FkJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVwiXG4gICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7KGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1VwbG9hZGVkKSByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BzLnJlc3VtYWJsZVVwbG9hZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICBwcm9wcy5wYXVzZVVwbG9hZChmaWxlLmlkKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHByb3BzLmNhbmNlbFVwbG9hZChmaWxlLmlkKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9fT5cbiAgICAgICAgICAgICR7RmlsZUl0ZW1Qcm9ncmVzcyh7XG4gICAgICAgICAgICAgIHByb2dyZXNzOiBmaWxlLnByb2dyZXNzLnBlcmNlbnRhZ2UsXG4gICAgICAgICAgICAgIGZpbGVJRDogZmlsZS5pZFxuICAgICAgICAgICAgfSl9XG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgJHtwcm9wcy5zaG93UHJvZ3Jlc3NEZXRhaWxzXG4gICAgICAgICAgICA/IGh0bWxgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLXByb2dyZXNzSW5mb1wiXG4gICAgICAgICAgICAgICAgICAgICAgICB0aXRsZT1cIiR7cHJvcHMuaTE4bignZmlsZVByb2dyZXNzJyl9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCIke3Byb3BzLmkxOG4oJ2ZpbGVQcm9ncmVzcycpfVwiPlxuICAgICAgICAgICAgICAgICR7IWZpbGUuaXNQYXVzZWQgJiYgIWlzVXBsb2FkZWRcbiAgICAgICAgICAgICAgICAgID8gaHRtbGA8c3Bhbj4ke3ByZXR0eUVUQShnZXRFVEEoZmlsZS5wcm9ncmVzcykpfSDjg7sg4oaRICR7cHJldHR5Qnl0ZXMoZ2V0U3BlZWQoZmlsZS5wcm9ncmVzcykpfS9zPC9zcGFuPmBcbiAgICAgICAgICAgICAgICAgIDogbnVsbFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICAgICAgOiBudWxsXG4gICAgICAgICAgfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1pbmZvXCI+XG4gICAgICA8aDQgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1uYW1lXCIgdGl0bGU9XCIke2ZpbGVOYW1lfVwiPlxuICAgICAgICAke2ZpbGUudXBsb2FkVVJMXG4gICAgICAgICAgPyBodG1sYDxhIGhyZWY9XCIke2ZpbGUudXBsb2FkVVJMfVwiIHRhcmdldD1cIl9ibGFua1wiPlxuICAgICAgICAgICAgICAke2ZpbGUuZXh0ZW5zaW9uID8gdHJ1bmNhdGVkRmlsZU5hbWUgKyAnLicgKyBmaWxlLmV4dGVuc2lvbiA6IHRydW5jYXRlZEZpbGVOYW1lfVxuICAgICAgICAgICAgPC9hPmBcbiAgICAgICAgICA6IGZpbGUuZXh0ZW5zaW9uID8gdHJ1bmNhdGVkRmlsZU5hbWUgKyAnLicgKyBmaWxlLmV4dGVuc2lvbiA6IHRydW5jYXRlZEZpbGVOYW1lXG4gICAgICAgIH1cbiAgICAgIDwvaDQ+XG4gICAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEl0ZW0tc3RhdHVzXCI+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiVXBweURhc2hib2FyZEl0ZW0tc3RhdHVzU2l6ZVwiPiR7ZmlsZS5kYXRhLnNpemUgPyBwcmV0dHlCeXRlcyhmaWxlLmRhdGEuc2l6ZSkgOiAnPyd9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICAkeyF1cGxvYWRJblByb2dyZXNzT3JDb21wbGV0ZVxuICAgICAgICA/IGh0bWxgPGJ1dHRvbiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLWVkaXRcIlxuICAgICAgICAgICAgICAgICAgICAgICBhcmlhLWxhYmVsPVwiRWRpdCBmaWxlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU9XCJFZGl0IGZpbGVcIlxuICAgICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7KGUpID0+IHByb3BzLnNob3dGaWxlQ2FyZChmaWxlLmlkKX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAke2ljb25FZGl0KCl9PC9idXR0b24+YFxuICAgICAgICA6IG51bGxcbiAgICAgIH1cbiAgICAgICR7ZmlsZS51cGxvYWRVUkxcbiAgICAgICAgPyBodG1sYDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1jb3B5TGlua1wiXG4gICAgICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCJDb3B5IGxpbmtcIlxuICAgICAgICAgICAgICAgICAgICAgICB0aXRsZT1cIkNvcHkgbGlua1wiXG4gICAgICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9JHsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgY29weVRvQ2xpcGJvYXJkKGZpbGUudXBsb2FkVVJMLCBwcm9wcy5pMThuKCdjb3B5TGlua1RvQ2xpcGJvYXJkRmFsbGJhY2snKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BzLmxvZygnTGluayBjb3BpZWQgdG8gY2xpcGJvYXJkLicpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcHMuaW5mbyhwcm9wcy5pMThuKCdjb3B5TGlua1RvQ2xpcGJvYXJkU3VjY2VzcycpLCAnaW5mbycsIDMwMDApXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChwcm9wcy5sb2cpXG4gICAgICAgICAgICAgICAgICAgICAgIH19PiR7aWNvbkNvcHkoKX08L2J1dHRvbj5gXG4gICAgICAgIDogbnVsbFxuICAgICAgfVxuICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1hY3Rpb25cIj5cbiAgICAgICR7IWlzVXBsb2FkZWRcbiAgICAgICAgPyBodG1sYDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1yZW1vdmVcIlxuICAgICAgICAgICAgICAgICAgICAgICBhcmlhLWxhYmVsPVwiUmVtb3ZlIGZpbGVcIlxuICAgICAgICAgICAgICAgICAgICAgICB0aXRsZT1cIlJlbW92ZSBmaWxlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgb25jbGljaz0keygpID0+IHByb3BzLnJlbW92ZUZpbGUoZmlsZS5pZCl9PlxuICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjIyXCIgaGVpZ2h0PVwiMjFcIiB2aWV3Qm94PVwiMCAwIDE4IDE3XCI+XG4gICAgICAgICAgICAgICAgICAgPGVsbGlwc2UgY3g9XCI4LjYyXCIgY3k9XCI4LjM4M1wiIHJ4PVwiOC42MlwiIHJ5PVwiOC4zODNcIi8+XG4gICAgICAgICAgICAgICAgICAgPHBhdGggc3Ryb2tlPVwiI0ZGRlwiIGZpbGw9XCIjRkZGXCIgZD1cIk0xMSA2LjE0N0wxMC44NSA2IDguNSA4LjI4NCA2LjE1IDYgNiA2LjE0NyA4LjM1IDguNDMgNiAxMC43MTdsLjE1LjE0Nkw4LjUgOC41NzhsMi4zNSAyLjI4NC4xNS0uMTQ2TDguNjUgOC40M3pcIi8+XG4gICAgICAgICAgICAgICAgIDwvc3ZnPlxuICAgICAgICAgICAgICAgPC9idXR0b24+YFxuICAgICAgICA6IG51bGxcbiAgICAgIH1cbiAgICA8L2Rpdj5cbiAgPC9saT5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG4vLyBodHRwOi8vY29kZXBlbi5pby9IYXJra28vcGVuL3JWeHZOTVxuLy8gaHR0cHM6Ly9jc3MtdHJpY2tzLmNvbS9zdmctbGluZS1hbmltYXRpb24td29ya3MvXG4vLyBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9lc3dhay9hZDRlYTU3YmNkNWZmN2FhNWQ0MlxuXG4vLyBjaXJjbGUgbGVuZ3RoIGVxdWFscyAyICogUEkgKiBSXG5jb25zdCBjaXJjbGVMZW5ndGggPSAyICogTWF0aC5QSSAqIDE1XG5cbi8vIHN0cm9rZS1kYXNob2Zmc2V0IGlzIGEgcGVyY2VudGFnZSBvZiB0aGUgcHJvZ3Jlc3MgZnJvbSBjaXJjbGVMZW5ndGgsXG4vLyBzdWJzdHJhY3RlZCBmcm9tIGNpcmNsZUxlbmd0aCwgYmVjYXVzZSBpdHMgYW4gb2Zmc2V0XG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGBcbiAgICA8c3ZnIHdpZHRoPVwiNzBcIiBoZWlnaHQ9XCI3MFwiIHZpZXdCb3g9XCIwIDAgMzYgMzZcIiBjbGFzcz1cIlVwcHlJY29uIFVwcHlJY29uLXByb2dyZXNzQ2lyY2xlXCI+XG4gICAgICA8ZyBjbGFzcz1cInByb2dyZXNzLWdyb3VwXCI+XG4gICAgICAgIDxjaXJjbGUgcj1cIjE1XCIgY3g9XCIxOFwiIGN5PVwiMThcIiBzdHJva2Utd2lkdGg9XCIyXCIgZmlsbD1cIm5vbmVcIiBjbGFzcz1cImJnXCIvPlxuICAgICAgICA8Y2lyY2xlIHI9XCIxNVwiIGN4PVwiMThcIiBjeT1cIjE4XCIgdHJhbnNmb3JtPVwicm90YXRlKC05MCwgMTgsIDE4KVwiIHN0cm9rZS13aWR0aD1cIjJcIiBmaWxsPVwibm9uZVwiIGNsYXNzPVwicHJvZ3Jlc3NcIlxuICAgICAgICAgICAgICAgIHN0cm9rZS1kYXNoYXJyYXk9JHtjaXJjbGVMZW5ndGh9XG4gICAgICAgICAgICAgICAgc3Ryb2tlLWRhc2hvZmZzZXQ9JHtjaXJjbGVMZW5ndGggLSAoY2lyY2xlTGVuZ3RoIC8gMTAwICogcHJvcHMucHJvZ3Jlc3MpfVxuICAgICAgICAvPlxuICAgICAgPC9nPlxuICAgICAgPHBvbHlnb24gdHJhbnNmb3JtPVwidHJhbnNsYXRlKDMsIDMpXCIgcG9pbnRzPVwiMTIgMjAgMTIgMTAgMjAgMTVcIiBjbGFzcz1cInBsYXlcIi8+XG4gICAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMTQuNSwgMTMpXCIgY2xhc3M9XCJwYXVzZVwiPlxuICAgICAgICA8cmVjdCB4PVwiMFwiIHk9XCIwXCIgd2lkdGg9XCIyXCIgaGVpZ2h0PVwiMTBcIiByeD1cIjBcIiAvPlxuICAgICAgICA8cmVjdCB4PVwiNVwiIHk9XCIwXCIgd2lkdGg9XCIyXCIgaGVpZ2h0PVwiMTBcIiByeD1cIjBcIiAvPlxuICAgICAgPC9nPlxuICAgICAgPHBvbHlnb24gdHJhbnNmb3JtPVwidHJhbnNsYXRlKDIsIDMpXCIgcG9pbnRzPVwiMTQgMjIuNSA3IDE1LjI0NTcwNjUgOC45OTk4NTg1NyAxMy4xNzMyODE1IDE0IDE4LjM1NDcxMDQgMjIuOTcyOTg4MyA5IDI1IDExLjEwMDU2MzRcIiBjbGFzcz1cImNoZWNrXCIvPlxuICAgICAgPHBvbHlnb24gY2xhc3M9XCJjYW5jZWxcIiB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMiwgMilcIiBwb2ludHM9XCIxOS44ODU2NTE2IDExLjA2MjUgMTYgMTQuOTQ4MTUxNiAxMi4xMDE5NzM3IDExLjA2MjUgMTEuMDYyNSAxMi4xMTQzNDg0IDE0Ljk0ODE1MTYgMTYgMTEuMDYyNSAxOS44OTgwMjYzIDEyLjEwMTk3MzcgMjAuOTM3NSAxNiAxNy4wNTE4NDg0IDE5Ljg4NTY1MTYgMjAuOTM3NSAyMC45Mzc1IDE5Ljg5ODAyNjMgMTcuMDUxODQ4NCAxNiAyMC45Mzc1IDEyXCI+PC9wb2x5Z29uPlxuICA8L3N2Zz5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgRmlsZUl0ZW0gPSByZXF1aXJlKCcuL0ZpbGVJdGVtJylcbmNvbnN0IEFjdGlvbkJyb3dzZVRhZ2xpbmUgPSByZXF1aXJlKCcuL0FjdGlvbkJyb3dzZVRhZ2xpbmUnKVxuY29uc3QgeyBkYXNoYm9hcmRCZ0ljb24gfSA9IHJlcXVpcmUoJy4vaWNvbnMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGA8dWwgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWZpbGVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgJHtwcm9wcy50b3RhbEZpbGVDb3VudCA9PT0gMCA/ICdVcHB5RGFzaGJvYXJkLWZpbGVzLS1ub0ZpbGVzJyA6ICcnfVwiPlxuICAgICAgJHtwcm9wcy50b3RhbEZpbGVDb3VudCA9PT0gMFxuICAgICAgID8gaHRtbGA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1iZ0ljb25cIj5cbiAgICAgICAgICAke2Rhc2hib2FyZEJnSWNvbigpfVxuICAgICAgICAgIDxoMyBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtZHJvcEZpbGVzVGl0bGVcIj5cbiAgICAgICAgICAgICR7QWN0aW9uQnJvd3NlVGFnbGluZSh7XG4gICAgICAgICAgICAgIGFjcXVpcmVyczogcHJvcHMuYWNxdWlyZXJzLFxuICAgICAgICAgICAgICBoYW5kbGVJbnB1dENoYW5nZTogcHJvcHMuaGFuZGxlSW5wdXRDaGFuZ2UsXG4gICAgICAgICAgICAgIGkxOG46IHByb3BzLmkxOG5cbiAgICAgICAgICAgIH0pfVxuICAgICAgICAgIDwvaDM+XG4gICAgICAgICAgPGlucHV0IGNsYXNzPVwiVXBweURhc2hib2FyZC1pbnB1dFwiIHR5cGU9XCJmaWxlXCIgbmFtZT1cImZpbGVzW11cIiBtdWx0aXBsZT1cInRydWVcIlxuICAgICAgICAgICAgICAgICBvbmNoYW5nZT0ke3Byb3BzLmhhbmRsZUlucHV0Q2hhbmdlfSAvPlxuICAgICAgICAgPC9kaXY+YFxuICAgICAgIDogbnVsbFxuICAgICAgfVxuICAgICAgJHtPYmplY3Qua2V5cyhwcm9wcy5maWxlcykubWFwKChmaWxlSUQpID0+IHtcbiAgICAgICAgcmV0dXJuIEZpbGVJdGVtKHtcbiAgICAgICAgICBhY3F1aXJlcnM6IHByb3BzLmFjcXVpcmVycyxcbiAgICAgICAgICBmaWxlOiBwcm9wcy5maWxlc1tmaWxlSURdLFxuICAgICAgICAgIHNob3dGaWxlQ2FyZDogcHJvcHMuc2hvd0ZpbGVDYXJkLFxuICAgICAgICAgIHNob3dQcm9ncmVzc0RldGFpbHM6IHByb3BzLnNob3dQcm9ncmVzc0RldGFpbHMsXG4gICAgICAgICAgaW5mbzogcHJvcHMuaW5mbyxcbiAgICAgICAgICBsb2c6IHByb3BzLmxvZyxcbiAgICAgICAgICBpMThuOiBwcm9wcy5pMThuLFxuICAgICAgICAgIHJlbW92ZUZpbGU6IHByb3BzLnJlbW92ZUZpbGUsXG4gICAgICAgICAgcGF1c2VVcGxvYWQ6IHByb3BzLnBhdXNlVXBsb2FkLFxuICAgICAgICAgIGNhbmNlbFVwbG9hZDogcHJvcHMuY2FuY2VsVXBsb2FkLFxuICAgICAgICAgIHJlc3VtYWJsZVVwbG9hZHM6IHByb3BzLnJlc3VtYWJsZVVwbG9hZHMsXG4gICAgICAgICAgaXNXaWRlOiBwcm9wcy5pc1dpZGVcbiAgICAgICAgfSlcbiAgICAgIH0pfVxuICAgIDwvdWw+YFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IHRocm90dGxlID0gcmVxdWlyZSgnbG9kYXNoLnRocm90dGxlJylcblxuZnVuY3Rpb24gcHJvZ3Jlc3NCYXJXaWR0aCAocHJvcHMpIHtcbiAgcmV0dXJuIHByb3BzLnRvdGFsUHJvZ3Jlc3Ncbn1cblxuZnVuY3Rpb24gcHJvZ3Jlc3NEZXRhaWxzIChwcm9wcykge1xuICAvLyBjb25zb2xlLmxvZyhEYXRlLm5vdygpKVxuICByZXR1cm4gaHRtbGA8c3Bhbj4ke3Byb3BzLnRvdGFsUHJvZ3Jlc3MgfHwgMH0l44O7JHtwcm9wcy5jb21wbGV0ZX0gLyAke3Byb3BzLmluUHJvZ3Jlc3N944O7JHtwcm9wcy50b3RhbFVwbG9hZGVkU2l6ZX0gLyAke3Byb3BzLnRvdGFsU2l6ZX3jg7vihpEgJHtwcm9wcy50b3RhbFNwZWVkfS9z44O7JHtwcm9wcy50b3RhbEVUQX08L3NwYW4+YFxufVxuXG5jb25zdCB0aHJvdHRsZWRQcm9ncmVzc0RldGFpbHMgPSB0aHJvdHRsZShwcm9ncmVzc0RldGFpbHMsIDEwMDAsIHtsZWFkaW5nOiB0cnVlLCB0cmFpbGluZzogdHJ1ZX0pXG4vLyBjb25zdCB0aHJvdHRsZWRQcm9ncmVzc0JhcldpZHRoID0gdGhyb3R0bGUocHJvZ3Jlc3NCYXJXaWR0aCwgMzAwLCB7bGVhZGluZzogdHJ1ZSwgdHJhaWxpbmc6IHRydWV9KVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBwcm9wcyA9IHByb3BzIHx8IHt9XG5cbiAgY29uc3QgaXNIaWRkZW4gPSBwcm9wcy50b3RhbEZpbGVDb3VudCA9PT0gMCB8fCAhcHJvcHMuaXNVcGxvYWRTdGFydGVkXG5cbiAgcmV0dXJuIGh0bWxgXG4gICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtc3RhdHVzQmFyXG4gICAgICAgICAgICAgICAgJHtwcm9wcy5pc0FsbENvbXBsZXRlID8gJ2lzLWNvbXBsZXRlJyA6ICcnfVwiXG4gICAgICAgICAgICAgICAgYXJpYS1oaWRkZW49XCIke2lzSGlkZGVufVwiXG4gICAgICAgICAgICAgICAgdGl0bGU9XCJcIj5cbiAgICAgIDxwcm9ncmVzcyBzdHlsZT1cImRpc3BsYXk6IG5vbmU7XCIgbWluPVwiMFwiIG1heD1cIjEwMFwiIHZhbHVlPVwiJHtwcm9wcy50b3RhbFByb2dyZXNzfVwiPjwvcHJvZ3Jlc3M+XG4gICAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1zdGF0dXNCYXJQcm9ncmVzc1wiIHN0eWxlPVwid2lkdGg6ICR7cHJvZ3Jlc3NCYXJXaWR0aChwcm9wcyl9JVwiPjwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtc3RhdHVzQmFyQ29udGVudFwiPlxuICAgICAgICAke3Byb3BzLmlzVXBsb2FkU3RhcnRlZCAmJiAhcHJvcHMuaXNBbGxDb21wbGV0ZVxuICAgICAgICAgID8gIXByb3BzLmlzQWxsUGF1c2VkXG4gICAgICAgICAgICA/IGh0bWxgPHNwYW4gdGl0bGU9XCJVcGxvYWRpbmdcIj4ke3BhdXNlUmVzdW1lQnV0dG9ucyhwcm9wcyl9IFVwbG9hZGluZy4uLiAke3Rocm90dGxlZFByb2dyZXNzRGV0YWlscyhwcm9wcyl9PC9zcGFuPmBcbiAgICAgICAgICAgIDogaHRtbGA8c3BhbiB0aXRsZT1cIlBhdXNlZFwiPiR7cGF1c2VSZXN1bWVCdXR0b25zKHByb3BzKX0gUGF1c2Vk44O7JHtwcm9wcy50b3RhbFByb2dyZXNzfSU8L3NwYW4+YFxuICAgICAgICAgIDogbnVsbFxuICAgICAgICAgIH1cbiAgICAgICAgJHtwcm9wcy5pc0FsbENvbXBsZXRlXG4gICAgICAgICAgPyBodG1sYDxzcGFuIHRpdGxlPVwiQ29tcGxldGVcIj48c3ZnIGNsYXNzPVwiVXBweURhc2hib2FyZC1zdGF0dXNCYXJBY3Rpb24gVXBweUljb25cIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMTdcIiB2aWV3Qm94PVwiMCAwIDIzIDE3XCI+XG4gICAgICAgICAgICAgIDxwYXRoIGQ9XCJNOC45NDQgMTdMMCA3Ljg2NWwyLjU1NS0yLjYxIDYuMzkgNi41MjVMMjAuNDEgMCAyMyAyLjY0NXpcIiAvPlxuICAgICAgICAgICAgPC9zdmc+VXBsb2FkIGNvbXBsZXRl44O7JHtwcm9wcy50b3RhbFByb2dyZXNzfSU8L3NwYW4+YFxuICAgICAgICAgIDogbnVsbFxuICAgICAgICB9XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgYFxufVxuXG5jb25zdCBwYXVzZVJlc3VtZUJ1dHRvbnMgPSAocHJvcHMpID0+IHtcbiAgY29uc3QgdGl0bGUgPSBwcm9wcy5yZXN1bWFibGVVcGxvYWRzXG4gICAgICAgICAgICAgICAgPyBwcm9wcy5pc0FsbFBhdXNlZFxuICAgICAgICAgICAgICAgICAgPyAncmVzdW1lIHVwbG9hZCdcbiAgICAgICAgICAgICAgICAgIDogJ3BhdXNlIHVwbG9hZCdcbiAgICAgICAgICAgICAgICA6ICdjYW5jZWwgdXBsb2FkJ1xuXG4gIHJldHVybiBodG1sYDxidXR0b24gdGl0bGU9XCIke3RpdGxlfVwiIGNsYXNzPVwiVXBweURhc2hib2FyZC1zdGF0dXNCYXJBY3Rpb25cIiB0eXBlPVwiYnV0dG9uXCIgb25jbGljaz0keygpID0+IHRvZ2dsZVBhdXNlUmVzdW1lKHByb3BzKX0+XG4gICAgJHtwcm9wcy5yZXN1bWFibGVVcGxvYWRzXG4gICAgICA/IHByb3BzLmlzQWxsUGF1c2VkXG4gICAgICAgID8gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjE1XCIgaGVpZ2h0PVwiMTdcIiB2aWV3Qm94PVwiMCAwIDExIDEzXCI+XG4gICAgICAgICAgPHBhdGggZD1cIk0xLjI2IDEyLjUzNGEuNjcuNjcgMCAwIDEtLjY3NC4wMTIuNjcuNjcgMCAwIDEtLjMzNi0uNTgzdi0xMUMuMjUuNzI0LjM4LjUuNTg2LjM4MmEuNjU4LjY1OCAwIDAgMSAuNjczLjAxMmw5LjE2NSA1LjVhLjY2LjY2IDAgMCAxIC4zMjUuNTcuNjYuNjYgMCAwIDEtLjMyNS41NzNsLTkuMTY2IDUuNXpcIiAvPlxuICAgICAgICA8L3N2Zz5gXG4gICAgICAgIDogaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTdcIiB2aWV3Qm94PVwiMCAwIDEyIDEzXCI+XG4gICAgICAgICAgPHBhdGggZD1cIk00Ljg4OC44MXYxMS4zOGMwIC40NDYtLjMyNC44MS0uNzIyLjgxSDIuNzIyQzIuMzI0IDEzIDIgMTIuNjM2IDIgMTIuMTlWLjgxYzAtLjQ0Ni4zMjQtLjgxLjcyMi0uODFoMS40NDRjLjM5OCAwIC43MjIuMzY0LjcyMi44MXpNOS44ODguODF2MTEuMzhjMCAuNDQ2LS4zMjQuODEtLjcyMi44MUg3LjcyMkM3LjMyNCAxMyA3IDEyLjYzNiA3IDEyLjE5Vi44MWMwLS40NDYuMzI0LS44MS43MjItLjgxaDEuNDQ0Yy4zOTggMCAuNzIyLjM2NC43MjIuODF6XCIvPlxuICAgICAgICA8L3N2Zz5gXG4gICAgICA6IGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNnB4XCIgaGVpZ2h0PVwiMTZweFwiIHZpZXdCb3g9XCIwIDAgMTkgMTlcIj5cbiAgICAgICAgPHBhdGggZD1cIk0xNy4zMTggMTcuMjMyTDkuOTQgOS44NTQgOS41ODYgOS41bC0uMzU0LjM1NC03LjM3OCA3LjM3OGguNzA3bC0uNjItLjYydi43MDZMOS4zMTggOS45NGwuMzU0LS4zNTQtLjM1NC0uMzU0TDEuOTQgMS44NTR2LjcwN2wuNjItLjYyaC0uNzA2bDcuMzc4IDcuMzc4LjM1NC4zNTQuMzU0LS4zNTQgNy4zNzgtNy4zNzhoLS43MDdsLjYyMi42MnYtLjcwNkw5Ljg1NCA5LjIzMmwtLjM1NC4zNTQuMzU0LjM1NCA3LjM3OCA3LjM3OC43MDgtLjcwNy03LjM4LTcuMzc4di43MDhsNy4zOC03LjM4LjM1My0uMzUzLS4zNTMtLjM1My0uNjIyLS42MjItLjM1My0uMzUzLS4zNTQuMzUyLTcuMzc4IDcuMzhoLjcwOEwyLjU2IDEuMjMgMi4yMDguODhsLS4zNTMuMzUzLS42MjIuNjItLjM1My4zNTUuMzUyLjM1MyA3LjM4IDcuMzh2LS43MDhsLTcuMzggNy4zOC0uMzUzLjM1My4zNTIuMzUzLjYyMi42MjIuMzUzLjM1My4zNTQtLjM1MyA3LjM4LTcuMzhoLS43MDhsNy4zOCA3LjM4elwiLz5cbiAgICAgIDwvc3ZnPmBcbiAgICB9XG4gIDwvYnV0dG9uPmBcbn1cblxuY29uc3QgdG9nZ2xlUGF1c2VSZXN1bWUgPSAocHJvcHMpID0+IHtcbiAgaWYgKHByb3BzLmlzQWxsQ29tcGxldGUpIHJldHVyblxuXG4gIGlmICghcHJvcHMucmVzdW1hYmxlVXBsb2Fkcykge1xuICAgIHJldHVybiBwcm9wcy5jYW5jZWxBbGwoKVxuICB9XG5cbiAgaWYgKHByb3BzLmlzQWxsUGF1c2VkKSB7XG4gICAgcmV0dXJuIHByb3BzLnJlc3VtZUFsbCgpXG4gIH1cblxuICByZXR1cm4gcHJvcHMucGF1c2VBbGwoKVxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IEFjdGlvbkJyb3dzZVRhZ2xpbmUgPSByZXF1aXJlKCcuL0FjdGlvbkJyb3dzZVRhZ2xpbmUnKVxuY29uc3QgeyBsb2NhbEljb24gfSA9IHJlcXVpcmUoJy4vaWNvbnMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBjb25zdCBpc0hpZGRlbiA9IE9iamVjdC5rZXlzKHByb3BzLmZpbGVzKS5sZW5ndGggPT09IDBcblxuICBpZiAocHJvcHMuYWNxdWlyZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBodG1sYFxuICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRUYWJzXCIgYXJpYS1oaWRkZW49XCIke2lzSGlkZGVufVwiPlxuICAgICAgICA8aDMgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFicy10aXRsZVwiPlxuICAgICAgICAke0FjdGlvbkJyb3dzZVRhZ2xpbmUoe1xuICAgICAgICAgIGFjcXVpcmVyczogcHJvcHMuYWNxdWlyZXJzLFxuICAgICAgICAgIGhhbmRsZUlucHV0Q2hhbmdlOiBwcm9wcy5oYW5kbGVJbnB1dENoYW5nZSxcbiAgICAgICAgICBpMThuOiBwcm9wcy5pMThuXG4gICAgICAgIH0pfVxuICAgICAgICA8L2gzPlxuICAgICAgPC9kaXY+XG4gICAgYFxuICB9XG5cbiAgY29uc3QgaW5wdXQgPSBodG1sYFxuICAgIDxpbnB1dCBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtaW5wdXRcIiB0eXBlPVwiZmlsZVwiIG5hbWU9XCJmaWxlc1tdXCIgbXVsdGlwbGU9XCJ0cnVlXCJcbiAgICAgICAgICAgb25jaGFuZ2U9JHtwcm9wcy5oYW5kbGVJbnB1dENoYW5nZX0gLz5cbiAgYFxuXG4gIHJldHVybiBodG1sYDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFic1wiPlxuICAgIDxuYXY+XG4gICAgICA8dWwgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFicy1saXN0XCIgcm9sZT1cInRhYmxpc3RcIj5cbiAgICAgICAgPGxpIGNsYXNzPVwiVXBweURhc2hib2FyZFRhYlwiPlxuICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiVXBweURhc2hib2FyZFRhYi1idG4gVXBweURhc2hib2FyZC1mb2N1c1wiXG4gICAgICAgICAgICAgICAgICByb2xlPVwidGFiXCJcbiAgICAgICAgICAgICAgICAgIHRhYmluZGV4PVwiMFwiXG4gICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7KGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlucHV0LmNsaWNrKClcbiAgICAgICAgICAgICAgICAgIH19PlxuICAgICAgICAgICAgJHtsb2NhbEljb24oKX1cbiAgICAgICAgICAgIDxoNSBjbGFzcz1cIlVwcHlEYXNoYm9hcmRUYWItbmFtZVwiPiR7cHJvcHMuaTE4bignbG9jYWxEaXNrJyl9PC9oNT5cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAke2lucHV0fVxuICAgICAgICA8L2xpPlxuICAgICAgICAke3Byb3BzLmFjcXVpcmVycy5tYXAoKHRhcmdldCkgPT4ge1xuICAgICAgICAgIHJldHVybiBodG1sYDxsaSBjbGFzcz1cIlVwcHlEYXNoYm9hcmRUYWJcIj5cbiAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFiLWJ0blwiXG4gICAgICAgICAgICAgICAgICAgIHJvbGU9XCJ0YWJcIlxuICAgICAgICAgICAgICAgICAgICB0YWJpbmRleD1cIjBcIlxuICAgICAgICAgICAgICAgICAgICBhcmlhLWNvbnRyb2xzPVwiVXBweURhc2hib2FyZENvbnRlbnQtcGFuZWwtLSR7dGFyZ2V0LmlkfVwiXG4gICAgICAgICAgICAgICAgICAgIGFyaWEtc2VsZWN0ZWQ9XCIke3RhcmdldC5pc0hpZGRlbiA/ICdmYWxzZScgOiAndHJ1ZSd9XCJcbiAgICAgICAgICAgICAgICAgICAgb25jbGljaz0keygpID0+IHByb3BzLnNob3dQYW5lbCh0YXJnZXQuaWQpfT5cbiAgICAgICAgICAgICAgJHt0YXJnZXQuaWNvbigpfVxuICAgICAgICAgICAgICA8aDUgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFiLW5hbWVcIj4ke3RhcmdldC5uYW1lfTwvaDU+XG4gICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8L2xpPmBcbiAgICAgICAgfSl9XG4gICAgICA8L3VsPlxuICAgIDwvbmF2PlxuICA8L2Rpdj5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgeyB1cGxvYWRJY29uIH0gPSByZXF1aXJlKCcuL2ljb25zJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcHJvcHMgPSBwcm9wcyB8fCB7fVxuXG4gIHJldHVybiBodG1sYDxidXR0b24gY2xhc3M9XCJVcHB5QnV0dG9uLS1jaXJjdWxhclxuICAgICAgICAgICAgICAgICAgIFVwcHlCdXR0b24tLWJsdWVcbiAgICAgICAgICAgICAgICAgICBVcHB5RGFzaGJvYXJkLXVwbG9hZFwiXG4gICAgICAgICAgICAgICAgIHR5cGU9XCJidXR0b25cIlxuICAgICAgICAgICAgICAgICB0aXRsZT1cIiR7cHJvcHMuaTE4bigndXBsb2FkQWxsTmV3RmlsZXMnKX1cIlxuICAgICAgICAgICAgICAgICBhcmlhLWxhYmVsPVwiJHtwcm9wcy5pMThuKCd1cGxvYWRBbGxOZXdGaWxlcycpfVwiXG4gICAgICAgICAgICAgICAgIG9uY2xpY2s9JHtwcm9wcy5zdGFydFVwbG9hZH0+XG4gICAgICAgICAgICAke3VwbG9hZEljb24oKX1cbiAgICAgICAgICAgIDxzdXAgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLXVwbG9hZENvdW50XCJcbiAgICAgICAgICAgICAgICAgdGl0bGU9XCIke3Byb3BzLmkxOG4oJ251bWJlck9mU2VsZWN0ZWRGaWxlcycpfVwiXG4gICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCIke3Byb3BzLmkxOG4oJ251bWJlck9mU2VsZWN0ZWRGaWxlcycpfVwiPlxuICAgICAgICAgICAgICAgICAgJHtwcm9wcy5uZXdGaWxlQ291bnR9PC9zdXA+XG4gICAgPC9idXR0b24+XG4gIGBcbn1cbiIsImNvbnN0IHsgaWNvblRleHQsIGljb25GaWxlLCBpY29uQXVkaW8sIGljb25WaWRlbywgaWNvblBERiB9ID0gcmVxdWlyZSgnLi9pY29ucycpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZ2V0SWNvbkJ5TWltZSAoZmlsZVR5cGVHZW5lcmFsLCBmaWxlVHlwZVNwZWNpZmljKSB7XG4gIGlmIChmaWxlVHlwZUdlbmVyYWwgPT09ICd0ZXh0Jykge1xuICAgIHJldHVybiB7XG4gICAgICBjb2xvcjogJyMwMDAnLFxuICAgICAgaWNvbjogaWNvblRleHQoKVxuICAgIH1cbiAgfVxuXG4gIGlmIChmaWxlVHlwZUdlbmVyYWwgPT09ICdhdWRpbycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgY29sb3I6ICcjMWFiYzljJyxcbiAgICAgIGljb246IGljb25BdWRpbygpXG4gICAgfVxuICB9XG5cbiAgaWYgKGZpbGVUeXBlR2VuZXJhbCA9PT0gJ3ZpZGVvJykge1xuICAgIHJldHVybiB7XG4gICAgICBjb2xvcjogJyMyOTgwYjknLFxuICAgICAgaWNvbjogaWNvblZpZGVvKClcbiAgICB9XG4gIH1cblxuICBpZiAoZmlsZVR5cGVHZW5lcmFsID09PSAnYXBwbGljYXRpb24nICYmIGZpbGVUeXBlU3BlY2lmaWMgPT09ICdwZGYnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbG9yOiAnI2U3NGMzYycsXG4gICAgICBpY29uOiBpY29uUERGKClcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbG9yOiAnIzAwMCcsXG4gICAgaWNvbjogaWNvbkZpbGUoKVxuICB9XG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG4vLyBodHRwczovL2Nzcy10cmlja3MuY29tL2NyZWF0aW5nLXN2Zy1pY29uLXN5c3RlbS1yZWFjdC9cblxuZnVuY3Rpb24gZGVmYXVsdFRhYkljb24gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjMwXCIgaGVpZ2h0PVwiMzBcIiB2aWV3Qm94PVwiMCAwIDMwIDMwXCI+XG4gICAgPHBhdGggZD1cIk0xNSAzMGM4LjI4NCAwIDE1LTYuNzE2IDE1LTE1IDAtOC4yODQtNi43MTYtMTUtMTUtMTVDNi43MTYgMCAwIDYuNzE2IDAgMTVjMCA4LjI4NCA2LjcxNiAxNSAxNSAxNXptNC4yNTgtMTIuNjc2djYuODQ2aC04LjQyNnYtNi44NDZINS4yMDRsOS44Mi0xMi4zNjQgOS44MiAxMi4zNjRIMTkuMjZ6XCIgLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uQ29weSAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiNTFcIiBoZWlnaHQ9XCI1MVwiIHZpZXdCb3g9XCIwIDAgNTEgNTFcIj5cbiAgICA8cGF0aCBkPVwiTTE3LjIxIDQ1Ljc2NWE1LjM5NCA1LjM5NCAwIDAgMS03LjYyIDBsLTQuMTItNC4xMjJhNS4zOTMgNS4zOTMgMCAwIDEgMC03LjYxOGw2Ljc3NC02Ljc3NS0yLjQwNC0yLjQwNC02Ljc3NSA2Ljc3NmMtMy40MjQgMy40MjctMy40MjQgOSAwIDEyLjQyNmw0LjEyIDQuMTIzYTguNzY2IDguNzY2IDAgMCAwIDYuMjE2IDIuNTdjMi4yNSAwIDQuNS0uODU4IDYuMjE0LTIuNTdsMTMuNTUtMTMuNTUyYTguNzIgOC43MiAwIDAgMCAyLjU3NS02LjIxMyA4LjczIDguNzMgMCAwIDAtMi41NzUtNi4yMTNsLTQuMTIzLTQuMTItMi40MDQgMi40MDQgNC4xMjMgNC4xMmE1LjM1MiA1LjM1MiAwIDAgMSAxLjU4IDMuODFjMCAxLjQzOC0uNTYyIDIuNzktMS41OCAzLjgwOGwtMTMuNTUgMTMuNTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDQuMjU2IDIuODU4QTguNzI4IDguNzI4IDAgMCAwIDM4LjA0My4yODNoLS4wMDJhOC43MyA4LjczIDAgMCAwLTYuMjEyIDIuNTc0bC0xMy41NSAxMy41NWE4LjcyNSA4LjcyNSAwIDAgMC0yLjU3NSA2LjIxNCA4LjczIDguNzMgMCAwIDAgMi41NzQgNi4yMTZsNC4xMiA0LjEyIDIuNDA1LTIuNDAzLTQuMTItNC4xMmE1LjM1NyA1LjM1NyAwIDAgMS0xLjU4LTMuODEyYzAtMS40MzcuNTYyLTIuNzkgMS41OC0zLjgwOGwxMy41NS0xMy41NWE1LjM0OCA1LjM0OCAwIDAgMSAzLjgxLTEuNThjMS40NCAwIDIuNzkyLjU2MiAzLjgxIDEuNThsNC4xMiA0LjEyYzIuMSAyLjEgMi4xIDUuNTE4IDAgNy42MTdMMzkuMiAyMy43NzVsMi40MDQgMi40MDQgNi43NzUtNi43NzdjMy40MjYtMy40MjcgMy40MjYtOSAwLTEyLjQyNmwtNC4xMi00LjEyelwiLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uUmVzdW1lICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIyNVwiIGhlaWdodD1cIjI1XCIgdmlld0JveD1cIjAgMCA0NCA0NFwiPlxuICAgIDxwb2x5Z29uIGNsYXNzPVwicGxheVwiIHRyYW5zZm9ybT1cInRyYW5zbGF0ZSg2LCA1LjUpXCIgcG9pbnRzPVwiMTMgMjEuNjY2NjY2NyAxMyAxMSAyMSAxNi4zMzMzMzMzXCIgLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uUGF1c2UgKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjI1cHhcIiBoZWlnaHQ9XCIyNXB4XCIgdmlld0JveD1cIjAgMCA0NCA0NFwiPlxuICAgIDxnIHRyYW5zZm9ybT1cInRyYW5zbGF0ZSgxOCwgMTcpXCIgY2xhc3M9XCJwYXVzZVwiPlxuICAgICAgPHJlY3QgeD1cIjBcIiB5PVwiMFwiIHdpZHRoPVwiMlwiIGhlaWdodD1cIjEwXCIgcng9XCIwXCIgLz5cbiAgICAgIDxyZWN0IHg9XCI2XCIgeT1cIjBcIiB3aWR0aD1cIjJcIiBoZWlnaHQ9XCIxMFwiIHJ4PVwiMFwiIC8+XG4gICAgPC9nPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25FZGl0ICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIyOFwiIGhlaWdodD1cIjI4XCIgdmlld0JveD1cIjAgMCAyOCAyOFwiPlxuICAgIDxwYXRoIGQ9XCJNMjUuNDM2IDIuNTY2YTcuOTggNy45OCAwIDAgMC0yLjA3OC0xLjUxQzIyLjYzOC43MDMgMjEuOTA2LjUgMjEuMTk4LjVhMyAzIDAgMCAwLTEuMDIzLjE3IDIuNDM2IDIuNDM2IDAgMCAwLS44OTMuNTYyTDIuMjkyIDE4LjIxNy41IDI3LjVsOS4yOC0xLjc5NiAxNi45OS0xNi45OWMuMjU1LS4yNTQuNDQ0LS41Ni41NjItLjg4OGEzIDMgMCAwIDAgLjE3LTEuMDIzYzAtLjcwOC0uMjA1LTEuNDQtLjU1NS0yLjE2YTggOCAwIDAgMC0xLjUxLTIuMDc3ek05LjAxIDI0LjI1MmwtNC4zMTMuODM0YzAtLjAzLjAwOC0uMDYuMDEyLS4wOS4wMDctLjk0NC0uNzQtMS43MTUtMS42Ny0xLjcyMy0uMDQgMC0uMDc4LjAwNy0uMTE4LjAxbC44My00LjI5TDE3LjcyIDUuMDI0bDUuMjY0IDUuMjY0TDkuMDEgMjQuMjUyem0xNi44NC0xNi45NmEuODE4LjgxOCAwIDAgMS0uMTk0LjMxbC0xLjU3IDEuNTctNS4yNi01LjI2IDEuNTctMS41N2EuODIuODIgMCAwIDEgLjMxLS4xOTQgMS40NSAxLjQ1IDAgMCAxIC40OTItLjA3NGMuMzk3IDAgLjkxNy4xMjYgMS40NjguMzk3LjU1LjI3IDEuMTMuNjc4IDEuNjU2IDEuMjEuNTMuNTMuOTQgMS4xMSAxLjIwOCAxLjY1NS4yNzIuNTUuMzk3IDEuMDcuMzkzIDEuNDY4LjAwNC4xOTMtLjAyNy4zNTgtLjA3NC40ODh6XCIgLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBsb2NhbEljb24gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjI3XCIgaGVpZ2h0PVwiMjVcIiB2aWV3Qm94PVwiMCAwIDI3IDI1XCI+XG4gICAgPHBhdGggZD1cIk01LjU4NiA5LjI4OGEuMzEzLjMxMyAwIDAgMCAuMjgyLjE3Nmg0Ljg0djMuOTIyYzAgMS41MTQgMS4yNSAyLjI0IDIuNzkyIDIuMjQgMS41NCAwIDIuNzktLjcyNiAyLjc5LTIuMjRWOS40NjRoNC44NGMuMTIyIDAgLjIzLS4wNjguMjg0LS4xNzZhLjMwNC4zMDQgMCAwIDAtLjA0Ni0uMzI0TDEzLjczNS4xMDZhLjMxNi4zMTYgMCAwIDAtLjQ3MiAwbC03LjYzIDguODU3YS4zMDIuMzAyIDAgMCAwLS4wNDcuMzI1elwiLz5cbiAgICA8cGF0aCBkPVwiTTI0LjMgNS4wOTNjLS4yMTgtLjc2LS41NC0xLjE4Ny0xLjIwOC0xLjE4N2gtNC44NTZsMS4wMTggMS4xOGgzLjk0OGwyLjA0MyAxMS4wMzhoLTcuMTkzdjIuNzI4SDkuMTE0di0yLjcyNWgtNy4zNmwyLjY2LTExLjA0aDMuMzNsMS4wMTgtMS4xOEgzLjkwN2MtLjY2OCAwLTEuMDYuNDYtMS4yMSAxLjE4NkwwIDE2LjQ1NnY3LjA2MkMwIDI0LjMzOC42NzYgMjUgMS41MSAyNWgyMy45OGMuODMzIDAgMS41MS0uNjYzIDEuNTEtMS40ODJ2LTcuMDYyTDI0LjMgNS4wOTN6XCIvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGNsb3NlSWNvbiAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTRweFwiIGhlaWdodD1cIjE0cHhcIiB2aWV3Qm94PVwiMCAwIDE5IDE5XCI+XG4gICAgPHBhdGggZD1cIk0xNy4zMTggMTcuMjMyTDkuOTQgOS44NTQgOS41ODYgOS41bC0uMzU0LjM1NC03LjM3OCA3LjM3OGguNzA3bC0uNjItLjYydi43MDZMOS4zMTggOS45NGwuMzU0LS4zNTQtLjM1NC0uMzU0TDEuOTQgMS44NTR2LjcwN2wuNjItLjYyaC0uNzA2bDcuMzc4IDcuMzc4LjM1NC4zNTQuMzU0LS4zNTQgNy4zNzgtNy4zNzhoLS43MDdsLjYyMi42MnYtLjcwNkw5Ljg1NCA5LjIzMmwtLjM1NC4zNTQuMzU0LjM1NCA3LjM3OCA3LjM3OC43MDgtLjcwNy03LjM4LTcuMzc4di43MDhsNy4zOC03LjM4LjM1My0uMzUzLS4zNTMtLjM1My0uNjIyLS42MjItLjM1My0uMzUzLS4zNTQuMzUyLTcuMzc4IDcuMzhoLjcwOEwyLjU2IDEuMjMgMi4yMDguODhsLS4zNTMuMzUzLS42MjIuNjItLjM1My4zNTUuMzUyLjM1MyA3LjM4IDcuMzh2LS43MDhsLTcuMzggNy4zOC0uMzUzLjM1My4zNTIuMzUzLjYyMi42MjIuMzUzLjM1My4zNTQtLjM1MyA3LjM4LTcuMzhoLS43MDhsNy4zOCA3LjM4elwiLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBwbHVnaW5JY29uICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNnB4XCIgaGVpZ2h0PVwiMTZweFwiIHZpZXdCb3g9XCIwIDAgMzIgMzBcIj5cbiAgICAgIDxwYXRoIGQ9XCJNNi42MjA5ODk0LDExLjE0NTExNjIgQzYuNjgyMzA1MSwxMS4yNzUxNjY5IDYuODEzNzQyNDgsMTEuMzU3MjE4OCA2Ljk1NDYzODEzLDExLjM1NzIxODggTDEyLjY5MjU0ODIsMTEuMzU3MjE4OCBMMTIuNjkyNTQ4MiwxNi4wNjMwNDI3IEMxMi42OTI1NDgyLDE3Ljg4MDUwOSAxNC4xNzI2MDQ4LDE4Ljc1IDE2LjAwMDAwODMsMTguNzUgQzE3LjgyNjEwNzIsMTguNzUgMTkuMzA3NDY4NCwxNy44ODAxODQ3IDE5LjMwNzQ2ODQsMTYuMDYzMDQyNyBMMTkuMzA3NDY4NCwxMS4zNTcyMTg4IEwyNS4wNDM3NDc4LDExLjM1NzIxODggQzI1LjE4NzU3ODcsMTEuMzU3MjE4OCAyNS4zMTY0MDY5LDExLjI3NTE2NjkgMjUuMzc5MDI3MiwxMS4xNDUxMTYyIEMyNS40MzcwODE0LDExLjAxNzMzNTggMjUuNDE3MTg2NSwxMC44NjQyNTg3IDI1LjMyNTIxMjksMTAuNzU2MjYxNSBMMTYuMjc4MjEyLDAuMTI3MTMxODM3IEMxNi4yMDkzOTQ5LDAuMDQ2Mzc3MTc1MSAxNi4xMDY5ODQ2LDAgMTUuOTk5NjgyMiwwIEMxNS44OTEwNzUxLDAgMTUuNzg4NjY0OCwwLjA0NjM3NzE3NTEgMTUuNzE4MjE3LDAuMTI3MTMxODM3IEw2LjY3NjEwODMsMTAuNzU1OTM3MSBDNi41ODI1MDQwMiwxMC44NjQyNTg3IDYuNTYyOTM1MTgsMTEuMDE3MzM1OCA2LjYyMDk4OTQsMTEuMTQ1MTE2MiBMNi42MjA5ODk0LDExLjE0NTExNjIgWlwiLz5cbiAgICAgIDxwYXRoIGQ9XCJNMjguODAwODcyMiw2LjExMTQyNjQ1IEMyOC41NDE3ODkxLDUuMTk4MzE1NTUgMjguMTU4MzMzMSw0LjY4NzUgMjcuMzY4NDg0OCw0LjY4NzUgTDIxLjYxMjQ0NTQsNC42ODc1IEwyMi44MTkwMjM0LDYuMTAzMDc4NzQgTDI3LjQ5ODY3MjUsNi4xMDMwNzg3NCBMMjkuOTE5NTgxNywxOS4zNDg2NDQ5IEwyMS4zOTQzODkxLDE5LjM1MDI1MDIgTDIxLjM5NDM4OTEsMjIuNjIyNTUyIEwxMC44MDIzNDYxLDIyLjYyMjU1MiBMMTAuODAyMzQ2MSwxOS4zNTI0OTc3IEwyLjA3ODE1NzAyLDE5LjM1MzQ2MDkgTDUuMjI5Nzk2OTksNi4xMDMwNzg3NCBMOS4xNzg3MTUyOSw2LjEwMzA3ODc0IEwxMC4zODQwMDExLDQuNjg3NSBMNC42MzA4NjkxLDQuNjg3NSBDMy44Mzk0MDU1OSw0LjY4NzUgMy4zNzQyMTg4OCw1LjIzOTA5MDkgMy4xOTgxNTg2NCw2LjExMTQyNjQ1IEwwLDE5Ljc0NzA4NzQgTDAsMjguMjIxMjk1OSBDMCwyOS4yMDQzOTkyIDAuODAxNDc3OTM3LDMwIDEuNzg4NzA3NTEsMzAgTDMwLjIwOTY3NzMsMzAgQzMxLjE5ODE5OSwzMCAzMiwyOS4yMDQzOTkyIDMyLDI4LjIyMTI5NTkgTDMyLDE5Ljc0NzA4NzQgTDI4LjgwMDg3MjIsNi4xMTE0MjY0NSBMMjguODAwODcyMiw2LjExMTQyNjQ1IFpcIi8+XG4gICAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBjaGVja0ljb24gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb24gVXBweUljb24tY2hlY2tcIiB3aWR0aD1cIjEzcHhcIiBoZWlnaHQ9XCI5cHhcIiB2aWV3Qm94PVwiMCAwIDEzIDlcIj5cbiAgICA8cG9seWdvbiBwb2ludHM9XCI1IDcuMjkzIDEuMzU0IDMuNjQ3IDAuNjQ2IDQuMzU0IDUgOC43MDcgMTIuMzU0IDEuMzU0IDExLjY0NiAwLjY0N1wiPjwvcG9seWdvbj5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uQXVkaW8gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB2aWV3Qm94PVwiMCAwIDU1IDU1XCI+XG4gICAgPHBhdGggZD1cIk01Mi42Ni4yNWMtLjIxNi0uMTktLjUtLjI3Ni0uNzktLjI0MmwtMzEgNC4wMWExIDEgMCAwIDAtLjg3Ljk5MlY0MC42MjJDMTguMTc0IDM4LjQyOCAxNS4yNzMgMzcgMTIgMzdjLTUuNTE0IDAtMTAgNC4wMzctMTAgOXM0LjQ4NiA5IDEwIDkgMTAtNC4wMzcgMTAtOWMwLS4yMzItLjAyLS40Ni0uMDQtLjY4Ny4wMTQtLjA2NS4wNC0uMTI0LjA0LS4xOTJWMTYuMTJsMjktMy43NTN2MTguMjU3QzQ5LjE3NCAyOC40MjggNDYuMjczIDI3IDQzIDI3Yy01LjUxNCAwLTEwIDQuMDM3LTEwIDlzNC40ODYgOSAxMCA5YzUuNDY0IDAgOS45MTMtMy45NjYgOS45OTMtOC44NjcgMC0uMDEzLjAwNy0uMDI0LjAwNy0uMDM3VjFhLjk5OC45OTggMCAwIDAtLjM0LS43NXpNMTIgNTNjLTQuNDEgMC04LTMuMTQtOC03czMuNTktNyA4LTcgOCAzLjE0IDggNy0zLjU5IDctOCA3em0zMS0xMGMtNC40MSAwLTgtMy4xNC04LTdzMy41OS03IDgtNyA4IDMuMTQgOCA3LTMuNTkgNy04IDd6TTIyIDE0LjFWNS44OWwyOS0zLjc1M3Y4LjIxbC0yOSAzLjc1NHpcIi8+XG4gIDwvc3ZnPmBcbn1cblxuZnVuY3Rpb24gaWNvblZpZGVvICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgdmlld0JveD1cIjAgMCA1OCA1OFwiPlxuICAgIDxwYXRoIGQ9XCJNMzYuNTM3IDI4LjE1NmwtMTEtN2ExLjAwNSAxLjAwNSAwIDAgMC0xLjAyLS4wMzNDMjQuMiAyMS4zIDI0IDIxLjYzNSAyNCAyMnYxNGExIDEgMCAwIDAgMS41MzcuODQ0bDExLTdhMS4wMDIgMS4wMDIgMCAwIDAgMC0xLjY4OHpNMjYgMzQuMThWMjMuODJMMzQuMTM3IDI5IDI2IDM0LjE4elwiLz48cGF0aCBkPVwiTTU3IDZIMWExIDEgMCAwIDAtMSAxdjQ0YTEgMSAwIDAgMCAxIDFoNTZhMSAxIDAgMCAwIDEtMVY3YTEgMSAwIDAgMC0xLTF6TTEwIDI4SDJ2LTloOHY5em0tOCAyaDh2OUgydi05em0xMCAxMFY4aDM0djQySDEyVjQwem00NC0xMmgtOHYtOWg4djl6bS04IDJoOHY5aC04di05em04LTIydjloLThWOGg4ek0yIDhoOHY5SDJWOHptMCA0MnYtOWg4djlIMnptNTQgMGgtOHYtOWg4djl6XCIvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25QREYgKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB2aWV3Qm94PVwiMCAwIDM0MiAzMzVcIj5cbiAgICA8cGF0aCBkPVwiTTMyOS4zMzcgMjI3Ljg0Yy0yLjEgMS4zLTguMSAyLjEtMTEuOSAyLjEtMTIuNCAwLTI3LjYtNS43LTQ5LjEtMTQuOSA4LjMtLjYgMTUuOC0uOSAyMi42LS45IDEyLjQgMCAxNiAwIDI4LjIgMy4xIDEyLjEgMyAxMi4yIDkuMyAxMC4yIDEwLjZ6bS0yMTUuMSAxLjljNC44LTguNCA5LjctMTcuMyAxNC43LTI2LjggMTIuMi0yMy4xIDIwLTQxLjMgMjUuNy01Ni4yIDExLjUgMjAuOSAyNS44IDM4LjYgNDIuNSA1Mi44IDIuMSAxLjggNC4zIDMuNSA2LjcgNS4zLTM0LjEgNi44LTYzLjYgMTUtODkuNiAyNC45em0zOS44LTIxOC45YzYuOCAwIDEwLjcgMTcuMDYgMTEgMzMuMTYuMyAxNi0zLjQgMjcuMi04LjEgMzUuNi0zLjktMTIuNC01LjctMzEuOC01LjctNDQuNSAwIDAtLjMtMjQuMjYgMi44LTI0LjI2em0tMTMzLjQgMzA3LjJjMy45LTEwLjUgMTkuMS0zMS4zIDQxLjYtNDkuOCAxLjQtMS4xIDQuOS00LjQgOC4xLTcuNC0yMy41IDM3LjYtMzkuMyA1Mi41LTQ5LjcgNTcuMnptMzE1LjItMTEyLjNjLTYuOC02LjctMjItMTAuMi00NS0xMC41LTE1LjYtLjItMzQuMyAxLjItNTQuMSAzLjktOC44LTUuMS0xNy45LTEwLjYtMjUuMS0xNy4zLTE5LjItMTgtMzUuMi00Mi45LTQ1LjItNzAuMy42LTIuNiAxLjItNC44IDEuNy03LjEgMCAwIDEwLjgtNjEuNSA3LjktODIuMy0uNC0yLjktLjYtMy43LTEuNC01LjlsLS45LTIuNWMtMi45LTYuNzYtOC43LTEzLjk2LTE3LjgtMTMuNTdsLTUuMy0uMTdoLS4xYy0xMC4xIDAtMTguNCA1LjE3LTIwLjUgMTIuODQtNi42IDI0LjMuMiA2MC41IDEyLjUgMTA3LjRsLTMuMiA3LjdjLTguOCAyMS40LTE5LjggNDMtMjkuNSA2MmwtMS4zIDIuNWMtMTAuMiAyMC0xOS41IDM3LTI3LjkgNTEuNGwtOC43IDQuNmMtLjYuNC0xNS41IDguMi0xOSAxMC4zLTI5LjYgMTcuNy00OS4yOCAzNy44LTUyLjU0IDUzLjgtMS4wNCA1LS4yNiAxMS41IDUuMDEgMTQuNmw4LjQgNC4yYzMuNjMgMS44IDcuNTMgMi43IDExLjQzIDIuNyAyMS4xIDAgNDUuNi0yNi4yIDc5LjMtODUuMSAzOS0xMi43IDgzLjQtMjMuMyAxMjIuMy0yOS4xIDI5LjYgMTYuNyA2NiAyOC4zIDg5IDI4LjMgNC4xIDAgNy42LS40IDEwLjUtMS4yIDQuNC0xLjEgOC4xLTMuNiAxMC40LTcuMSA0LjQtNi43IDUuNC0xNS45IDQuMS0yNS40LS4zLTIuOC0yLjYtNi4zLTUtOC43elwiIC8+XG4gIDwvc3ZnPmBcbn1cblxuZnVuY3Rpb24gaWNvbkZpbGUgKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjQ0XCIgaGVpZ2h0PVwiNThcIiB2aWV3Qm94PVwiMCAwIDQ0IDU4XCI+XG4gICAgPHBhdGggZD1cIk0yNy40MzcuNTE3YTEgMSAwIDAgMC0uMDk0LjAzSDQuMjVDMi4wMzcuNTQ4LjIxNyAyLjM2OC4yMTcgNC41OHY0OC40MDVjMCAyLjIxMiAxLjgyIDQuMDMgNC4wMyA0LjAzSDM5LjAzYzIuMjEgMCA0LjAzLTEuODE4IDQuMDMtNC4wM1YxNS42MWExIDEgMCAwIDAtLjAzLS4yOCAxIDEgMCAwIDAgMC0uMDkzIDEgMSAwIDAgMC0uMDMtLjAzMiAxIDEgMCAwIDAgMC0uMDMgMSAxIDAgMCAwLS4wMzItLjA2MyAxIDEgMCAwIDAtLjAzLS4wNjMgMSAxIDAgMCAwLS4wMzIgMCAxIDEgMCAwIDAtLjAzLS4wNjMgMSAxIDAgMCAwLS4wMzItLjAzIDEgMSAwIDAgMC0uMDMtLjA2MyAxIDEgMCAwIDAtLjA2My0uMDYybC0xNC41OTMtMTRhMSAxIDAgMCAwLS4wNjItLjA2MkExIDEgMCAwIDAgMjggLjcwOGExIDEgMCAwIDAtLjM3NC0uMTU3IDEgMSAwIDAgMC0uMTU2IDAgMSAxIDAgMCAwLS4wMy0uMDNsLS4wMDMtLjAwM3pNNC4yNSAyLjU0N2gyMi4yMTh2OS45N2MwIDIuMjEgMS44MiA0LjAzIDQuMDMgNC4wM2gxMC41NjR2MzYuNDM4YTIuMDIgMi4wMiAwIDAgMS0yLjAzMiAyLjAzMkg0LjI1Yy0xLjEzIDAtMi4wMzItLjktMi4wMzItMi4wMzJWNC41OGMwLTEuMTMuOTAyLTIuMDMyIDIuMDMtMi4wMzJ6bTI0LjIxOCAxLjM0NWwxMC4zNzUgOS45MzcuNzUuNzE4SDMwLjVjLTEuMTMgMC0yLjAzMi0uOS0yLjAzMi0yLjAzVjMuODl6XCIgLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uVGV4dCAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHZpZXdCb3g9XCIwIDAgNjQgNjRcIj5cbiAgICA8cGF0aCBkPVwiTTggNjRoNDhWMEgyMi41ODZMOCAxNC41ODZWNjR6bTQ2LTJIMTBWMTZoMTRWMmgzMHY2MHpNMTEuNDE0IDE0TDIyIDMuNDE0VjE0SDExLjQxNHpcIi8+XG4gICAgPHBhdGggZD1cIk0zMiAxM2gxNHYySDMyek0xOCAyM2gyOHYySDE4ek0xOCAzM2gyOHYySDE4ek0xOCA0M2gyOHYySDE4ek0xOCA1M2gyOHYySDE4elwiLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiB1cGxvYWRJY29uICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIzN1wiIGhlaWdodD1cIjMzXCIgdmlld0JveD1cIjAgMCAzNyAzM1wiPlxuICAgIDxwYXRoIGQ9XCJNMjkuMTA3IDI0LjVjNC4wNyAwIDcuMzkzLTMuMzU1IDcuMzkzLTcuNDQyIDAtMy45OTQtMy4xMDUtNy4zMDctNy4wMTItNy41MDJsLjQ2OC40MTVDMjkuMDIgNC41MiAyNC4zNC41IDE4Ljg4Ni41Yy00LjM0OCAwLTguMjcgMi41MjItMTAuMTM4IDYuNTA2bC40NDYtLjI4OEM0LjM5NCA2Ljc4Mi41IDEwLjc1OC41IDE1LjYwOGMwIDQuOTI0IDMuOTA2IDguODkyIDguNzYgOC44OTJoNC44NzJjLjYzNSAwIDEuMDk1LS40NjcgMS4wOTUtMS4xMDQgMC0uNjM2LS40Ni0xLjEwMy0xLjA5NS0xLjEwM0g5LjI2Yy0zLjY0NCAwLTYuNjMtMy4wMzUtNi42My02Ljc0NCAwLTMuNzEgMi45MjYtNi42ODUgNi41Ny02LjY4NWguOTY0bC4xNC0uMjguMTc3LS4zNjJjMS40NzctMy40IDQuNzQ0LTUuNTc2IDguMzQ3LTUuNTc2IDQuNTggMCA4LjQ1IDMuNDUyIDkuMDEgOC4wNzJsLjA2LjUzNi4wNS40NDZoMS4xMDFjMi44NyAwIDUuMjA0IDIuMzcgNS4yMDQgNS4yOTVzLTIuMzMzIDUuMjk2LTUuMjA0IDUuMjk2aC02LjA2MmMtLjYzNCAwLTEuMDk0LjQ2Ny0xLjA5NCAxLjEwMyAwIC42MzcuNDYgMS4xMDQgMS4wOTQgMS4xMDRoNi4xMnpcIi8+XG4gICAgPHBhdGggZD1cIk0yMy4xOTYgMTguOTJsLTQuODI4LTUuMjU4LS4zNjYtLjQtLjM2OC4zOTgtNC44MjggNS4xOTZhMS4xMyAxLjEzIDAgMCAwIDAgMS41NDZjLjQyOC40NiAxLjExLjQ2IDEuNTM3IDBsMy40NS0zLjcxLS44NjgtLjM0djE1LjAzYzAgLjY0LjQ0NSAxLjExOCAxLjA3NSAxLjExOC42MyAwIDEuMDc1LS40OCAxLjA3NS0xLjEyVjE2LjM1bC0uODY3LjM0IDMuNDUgMy43MTJhMSAxIDAgMCAwIC43NjcuMzQ1IDEgMSAwIDAgMCAuNzctLjM0NWMuNDE2LS4zMy40MTYtMS4wMzYgMC0xLjQ4NXYuMDAzelwiLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBkYXNoYm9hcmRCZ0ljb24gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjQ4XCIgaGVpZ2h0PVwiNjlcIiB2aWV3Qm94PVwiMCAwIDQ4IDY5XCI+XG4gICAgPHBhdGggZD1cIk0uNSAxLjVoNXpNMTAuNSAxLjVoNXpNMjAuNSAxLjVoNXpNMzAuNTA0IDEuNWg1ek00NS41IDExLjV2NXpNNDUuNSAyMS41djV6TTQ1LjUgMzEuNXY1ek00NS41IDQxLjUwMnY1ek00NS41IDUxLjUwMnY1ek00NS41IDYxLjV2NXpNNDUuNSA2Ni41MDJoLTQuOTk4ek0zNS41MDMgNjYuNTAyaC01ek0yNS41IDY2LjUwMmgtNXpNMTUuNSA2Ni41MDJoLTV6TTUuNSA2Ni41MDJoLTV6TS41IDY2LjUwMnYtNXpNLjUgNTYuNTAydi01ek0uNSA0Ni41MDNWNDEuNXpNLjUgMzYuNXYtNXpNLjUgMjYuNXYtNXpNLjUgMTYuNXYtNXpNLjUgNi41VjEuNDk4ek00NC44MDcgMTFIMzZWMi4xOTV6XCIvPlxuICA8L3N2Zz5gXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBkZWZhdWx0VGFiSWNvbixcbiAgaWNvbkNvcHksXG4gIGljb25SZXN1bWUsXG4gIGljb25QYXVzZSxcbiAgaWNvbkVkaXQsXG4gIGxvY2FsSWNvbixcbiAgY2xvc2VJY29uLFxuICBwbHVnaW5JY29uLFxuICBjaGVja0ljb24sXG4gIGljb25BdWRpbyxcbiAgaWNvblZpZGVvLFxuICBpY29uUERGLFxuICBpY29uRmlsZSxcbiAgaWNvblRleHQsXG4gIHVwbG9hZEljb24sXG4gIGRhc2hib2FyZEJnSWNvblxufVxuIiwiY29uc3QgUGx1Z2luID0gcmVxdWlyZSgnLi4vUGx1Z2luJylcbmNvbnN0IFRyYW5zbGF0b3IgPSByZXF1aXJlKCcuLi8uLi9jb3JlL1RyYW5zbGF0b3InKVxuY29uc3QgZHJhZ0Ryb3AgPSByZXF1aXJlKCdkcmFnLWRyb3AnKVxuY29uc3QgRGFzaGJvYXJkID0gcmVxdWlyZSgnLi9EYXNoYm9hcmQnKVxuY29uc3QgeyBnZXRTcGVlZCB9ID0gcmVxdWlyZSgnLi4vLi4vY29yZS9VdGlscycpXG5jb25zdCB7IGdldEVUQSB9ID0gcmVxdWlyZSgnLi4vLi4vY29yZS9VdGlscycpXG5jb25zdCB7IHByZXR0eUVUQSB9ID0gcmVxdWlyZSgnLi4vLi4vY29yZS9VdGlscycpXG5jb25zdCB7IGZpbmRET01FbGVtZW50IH0gPSByZXF1aXJlKCcuLi8uLi9jb3JlL1V0aWxzJylcbmNvbnN0IHByZXR0eUJ5dGVzID0gcmVxdWlyZSgncHJldHRpZXItYnl0ZXMnKVxuY29uc3QgeyBkZWZhdWx0VGFiSWNvbiB9ID0gcmVxdWlyZSgnLi9pY29ucycpXG5cbi8qKlxuICogTW9kYWwgRGlhbG9nICYgRGFzaGJvYXJkXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgRGFzaGJvYXJkVUkgZXh0ZW5kcyBQbHVnaW4ge1xuICBjb25zdHJ1Y3RvciAoY29yZSwgb3B0cykge1xuICAgIHN1cGVyKGNvcmUsIG9wdHMpXG4gICAgdGhpcy5pZCA9ICdEYXNoYm9hcmRVSSdcbiAgICB0aGlzLnRpdGxlID0gJ0Rhc2hib2FyZCBVSSdcbiAgICB0aGlzLnR5cGUgPSAnb3JjaGVzdHJhdG9yJ1xuXG4gICAgY29uc3QgZGVmYXVsdExvY2FsZSA9IHtcbiAgICAgIHN0cmluZ3M6IHtcbiAgICAgICAgc2VsZWN0VG9VcGxvYWQ6ICdTZWxlY3QgZmlsZXMgdG8gdXBsb2FkJyxcbiAgICAgICAgY2xvc2VNb2RhbDogJ0Nsb3NlIE1vZGFsJyxcbiAgICAgICAgdXBsb2FkOiAnVXBsb2FkJyxcbiAgICAgICAgaW1wb3J0RnJvbTogJ0ltcG9ydCBmaWxlcyBmcm9tJyxcbiAgICAgICAgZGFzaGJvYXJkV2luZG93VGl0bGU6ICdVcHB5IERhc2hib2FyZCBXaW5kb3cgKFByZXNzIGVzY2FwZSB0byBjbG9zZSknLFxuICAgICAgICBkYXNoYm9hcmRUaXRsZTogJ1VwcHkgRGFzaGJvYXJkJyxcbiAgICAgICAgY29weUxpbmtUb0NsaXBib2FyZFN1Y2Nlc3M6ICdMaW5rIGNvcGllZCB0byBjbGlwYm9hcmQuJyxcbiAgICAgICAgY29weUxpbmtUb0NsaXBib2FyZEZhbGxiYWNrOiAnQ29weSB0aGUgVVJMIGJlbG93JyxcbiAgICAgICAgZG9uZTogJ0RvbmUnLFxuICAgICAgICBsb2NhbERpc2s6ICdMb2NhbCBEaXNrJyxcbiAgICAgICAgZHJvcFBhc3RlSW1wb3J0OiAnRHJvcCBmaWxlcyBoZXJlLCBwYXN0ZSwgaW1wb3J0IGZyb20gb25lIG9mIHRoZSBsb2NhdGlvbnMgYWJvdmUgb3InLFxuICAgICAgICBkcm9wUGFzdGU6ICdEcm9wIGZpbGVzIGhlcmUsIHBhc3RlIG9yJyxcbiAgICAgICAgYnJvd3NlOiAnYnJvd3NlJyxcbiAgICAgICAgZmlsZVByb2dyZXNzOiAnRmlsZSBwcm9ncmVzczogdXBsb2FkIHNwZWVkIGFuZCBFVEEnLFxuICAgICAgICBudW1iZXJPZlNlbGVjdGVkRmlsZXM6ICdOdW1iZXIgb2Ygc2VsZWN0ZWQgZmlsZXMnLFxuICAgICAgICB1cGxvYWRBbGxOZXdGaWxlczogJ1VwbG9hZCBhbGwgbmV3IGZpbGVzJ1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIHRhcmdldDogJ2JvZHknLFxuICAgICAgaW5saW5lOiBmYWxzZSxcbiAgICAgIHdpZHRoOiA3NTAsXG4gICAgICBoZWlnaHQ6IDU1MCxcbiAgICAgIHNlbWlUcmFuc3BhcmVudDogZmFsc2UsXG4gICAgICBkZWZhdWx0VGFiSWNvbjogZGVmYXVsdFRhYkljb24oKSxcbiAgICAgIHNob3dQcm9ncmVzc0RldGFpbHM6IGZhbHNlLFxuICAgICAgbG9jYWxlOiBkZWZhdWx0TG9jYWxlXG4gICAgfVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcblxuICAgIHRoaXMubG9jYWxlID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdExvY2FsZSwgdGhpcy5vcHRzLmxvY2FsZSlcbiAgICB0aGlzLmxvY2FsZS5zdHJpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdExvY2FsZS5zdHJpbmdzLCB0aGlzLm9wdHMubG9jYWxlLnN0cmluZ3MpXG5cbiAgICB0aGlzLnRyYW5zbGF0b3IgPSBuZXcgVHJhbnNsYXRvcih7bG9jYWxlOiB0aGlzLmxvY2FsZX0pXG4gICAgdGhpcy5jb250YWluZXJXaWR0aCA9IHRoaXMudHJhbnNsYXRvci50cmFuc2xhdGUuYmluZCh0aGlzLnRyYW5zbGF0b3IpXG5cbiAgICB0aGlzLmhpZGVNb2RhbCA9IHRoaXMuaGlkZU1vZGFsLmJpbmQodGhpcylcbiAgICB0aGlzLnNob3dNb2RhbCA9IHRoaXMuc2hvd01vZGFsLmJpbmQodGhpcylcblxuICAgIHRoaXMuYWRkVGFyZ2V0ID0gdGhpcy5hZGRUYXJnZXQuYmluZCh0aGlzKVxuICAgIHRoaXMuYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5iaW5kKHRoaXMpXG4gICAgdGhpcy5oaWRlQWxsUGFuZWxzID0gdGhpcy5oaWRlQWxsUGFuZWxzLmJpbmQodGhpcylcbiAgICB0aGlzLnNob3dQYW5lbCA9IHRoaXMuc2hvd1BhbmVsLmJpbmQodGhpcylcbiAgICB0aGlzLmluaXRFdmVudHMgPSB0aGlzLmluaXRFdmVudHMuYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlRXNjYXBlS2V5UHJlc3MgPSB0aGlzLmhhbmRsZUVzY2FwZUtleVByZXNzLmJpbmQodGhpcylcbiAgICB0aGlzLmhhbmRsZUZpbGVDYXJkID0gdGhpcy5oYW5kbGVGaWxlQ2FyZC5iaW5kKHRoaXMpXG4gICAgdGhpcy5oYW5kbGVEcm9wID0gdGhpcy5oYW5kbGVEcm9wLmJpbmQodGhpcylcbiAgICB0aGlzLnBhdXNlQWxsID0gdGhpcy5wYXVzZUFsbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5yZXN1bWVBbGwgPSB0aGlzLnJlc3VtZUFsbC5iaW5kKHRoaXMpXG4gICAgdGhpcy5jYW5jZWxBbGwgPSB0aGlzLmNhbmNlbEFsbC5iaW5kKHRoaXMpXG4gICAgdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoID0gdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoLmJpbmQodGhpcylcbiAgICB0aGlzLnJlbmRlciA9IHRoaXMucmVuZGVyLmJpbmQodGhpcylcbiAgICB0aGlzLmluc3RhbGwgPSB0aGlzLmluc3RhbGwuYmluZCh0aGlzKVxuICB9XG5cbiAgYWRkVGFyZ2V0IChwbHVnaW4pIHtcbiAgICBjb25zdCBjYWxsZXJQbHVnaW5JZCA9IHBsdWdpbi5pZCB8fCBwbHVnaW4uY29uc3RydWN0b3IubmFtZVxuICAgIGNvbnN0IGNhbGxlclBsdWdpbk5hbWUgPSBwbHVnaW4udGl0bGUgfHwgY2FsbGVyUGx1Z2luSWRcbiAgICBjb25zdCBjYWxsZXJQbHVnaW5JY29uID0gcGx1Z2luLmljb24gfHwgdGhpcy5vcHRzLmRlZmF1bHRUYWJJY29uXG4gICAgY29uc3QgY2FsbGVyUGx1Z2luVHlwZSA9IHBsdWdpbi50eXBlXG5cbiAgICBpZiAoY2FsbGVyUGx1Z2luVHlwZSAhPT0gJ2FjcXVpcmVyJyAmJlxuICAgICAgICBjYWxsZXJQbHVnaW5UeXBlICE9PSAncHJvZ3Jlc3NpbmRpY2F0b3InICYmXG4gICAgICAgIGNhbGxlclBsdWdpblR5cGUgIT09ICdwcmVzZW50ZXInKSB7XG4gICAgICBsZXQgbXNnID0gJ0Vycm9yOiBNb2RhbCBjYW4gb25seSBiZSB1c2VkIGJ5IHBsdWdpbnMgb2YgdHlwZXM6IGFjcXVpcmVyLCBwcm9ncmVzc2luZGljYXRvciwgcHJlc2VudGVyJ1xuICAgICAgdGhpcy5jb3JlLmxvZyhtc2cpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXQgPSB7XG4gICAgICBpZDogY2FsbGVyUGx1Z2luSWQsXG4gICAgICBuYW1lOiBjYWxsZXJQbHVnaW5OYW1lLFxuICAgICAgaWNvbjogY2FsbGVyUGx1Z2luSWNvbixcbiAgICAgIHR5cGU6IGNhbGxlclBsdWdpblR5cGUsXG4gICAgICBmb2N1czogcGx1Z2luLmZvY3VzLFxuICAgICAgcmVuZGVyOiBwbHVnaW4ucmVuZGVyLFxuICAgICAgaXNIaWRkZW46IHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBtb2RhbCA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLm1vZGFsXG4gICAgY29uc3QgbmV3VGFyZ2V0cyA9IG1vZGFsLnRhcmdldHMuc2xpY2UoKVxuICAgIG5ld1RhcmdldHMucHVzaCh0YXJnZXQpXG5cbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgbW9kYWw6IE9iamVjdC5hc3NpZ24oe30sIG1vZGFsLCB7XG4gICAgICAgIHRhcmdldHM6IG5ld1RhcmdldHNcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiB0aGlzLnRhcmdldFxuICB9XG5cbiAgaGlkZUFsbFBhbmVscyAoKSB7XG4gICAgY29uc3QgbW9kYWwgPSB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5tb2RhbFxuXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHttb2RhbDogT2JqZWN0LmFzc2lnbih7fSwgbW9kYWwsIHtcbiAgICAgIGFjdGl2ZVBhbmVsOiBmYWxzZVxuICAgIH0pfSlcbiAgfVxuXG4gIHNob3dQYW5lbCAoaWQpIHtcbiAgICBjb25zdCBtb2RhbCA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLm1vZGFsXG5cbiAgICBjb25zdCBhY3RpdmVQYW5lbCA9IG1vZGFsLnRhcmdldHMuZmlsdGVyKCh0YXJnZXQpID0+IHtcbiAgICAgIHJldHVybiB0YXJnZXQudHlwZSA9PT0gJ2FjcXVpcmVyJyAmJiB0YXJnZXQuaWQgPT09IGlkXG4gICAgfSlbMF1cblxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7bW9kYWw6IE9iamVjdC5hc3NpZ24oe30sIG1vZGFsLCB7XG4gICAgICBhY3RpdmVQYW5lbDogYWN0aXZlUGFuZWxcbiAgICB9KX0pXG4gIH1cblxuICBoaWRlTW9kYWwgKCkge1xuICAgIGNvbnN0IG1vZGFsID0gdGhpcy5jb3JlLmdldFN0YXRlKCkubW9kYWxcblxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBtb2RhbDogT2JqZWN0LmFzc2lnbih7fSwgbW9kYWwsIHtcbiAgICAgICAgaXNIaWRkZW46IHRydWVcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnaXMtVXBweURhc2hib2FyZC1vcGVuJylcbiAgfVxuXG4gIHNob3dNb2RhbCAoKSB7XG4gICAgY29uc3QgbW9kYWwgPSB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5tb2RhbFxuXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgIG1vZGFsOiBPYmplY3QuYXNzaWduKHt9LCBtb2RhbCwge1xuICAgICAgICBpc0hpZGRlbjogZmFsc2VcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIC8vIGFkZCBjbGFzcyB0byBib2R5IHRoYXQgc2V0cyBwb3NpdGlvbiBmaXhlZFxuICAgIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnaXMtVXBweURhc2hib2FyZC1vcGVuJylcbiAgICAvLyBmb2N1cyBvbiBtb2RhbCBpbm5lciBibG9ja1xuICAgIHRoaXMudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoJy5VcHB5RGFzaGJvYXJkLWlubmVyJykuZm9jdXMoKVxuXG4gICAgdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoKClcbiAgICAvLyB0byBiZSBzdXJlLCBzb21ldGltZXMgd2hlbiB0aGUgZnVuY3Rpb24gcnVucywgY29udGFpbmVyIHNpemUgaXMgc3RpbGwgMFxuICAgIHNldFRpbWVvdXQodGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoLCAzMDApXG4gIH1cblxuICAvLyBDbG9zZSB0aGUgTW9kYWwgb24gZXNjIGtleSBwcmVzc1xuICBoYW5kbGVFc2NhcGVLZXlQcmVzcyAoZXZlbnQpIHtcbiAgICBpZiAoZXZlbnQua2V5Q29kZSA9PT0gMjcpIHtcbiAgICAgIHRoaXMuaGlkZU1vZGFsKClcbiAgICB9XG4gIH1cblxuICBpbml0RXZlbnRzICgpIHtcbiAgICAvLyBjb25zdCBkYXNoYm9hcmRFbCA9IHRoaXMudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoYCR7dGhpcy5vcHRzLnRhcmdldH0gLlVwcHlEYXNoYm9hcmRgKVxuXG4gICAgLy8gTW9kYWwgb3BlbiBidXR0b25cbiAgICBjb25zdCBzaG93TW9kYWxUcmlnZ2VyID0gZmluZERPTUVsZW1lbnQodGhpcy5vcHRzLnRyaWdnZXIpXG4gICAgaWYgKCF0aGlzLm9wdHMuaW5saW5lICYmIHNob3dNb2RhbFRyaWdnZXIpIHtcbiAgICAgIHNob3dNb2RhbFRyaWdnZXIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLnNob3dNb2RhbClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jb3JlLmxvZygnTW9kYWwgdHJpZ2dlciB3YXNu4oCZdCBmb3VuZCcpXG4gICAgfVxuXG4gICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMuaGFuZGxlRXNjYXBlS2V5UHJlc3MpXG5cbiAgICAvLyBEcmFnIERyb3BcbiAgICB0aGlzLnJlbW92ZURyYWdEcm9wTGlzdGVuZXIgPSBkcmFnRHJvcCh0aGlzLmVsLCAoZmlsZXMpID0+IHtcbiAgICAgIHRoaXMuaGFuZGxlRHJvcChmaWxlcylcbiAgICB9KVxuICB9XG5cbiAgcmVtb3ZlRXZlbnRzICgpIHtcbiAgICBjb25zdCBzaG93TW9kYWxUcmlnZ2VyID0gZmluZERPTUVsZW1lbnQodGhpcy5vcHRzLnRyaWdnZXIpXG4gICAgaWYgKCF0aGlzLm9wdHMuaW5saW5lICYmIHNob3dNb2RhbFRyaWdnZXIpIHtcbiAgICAgIHNob3dNb2RhbFRyaWdnZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLnNob3dNb2RhbClcbiAgICB9XG5cbiAgICB0aGlzLnJlbW92ZURyYWdEcm9wTGlzdGVuZXIoKVxuICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUVzY2FwZUtleVByZXNzKVxuICB9XG5cbiAgYWN0aW9ucyAoKSB7XG4gICAgY29uc3QgYnVzID0gdGhpcy5jb3JlLmJ1c1xuXG4gICAgYnVzLm9uKCdjb3JlOmZpbGUtYWRkJywgdGhpcy5oaWRlQWxsUGFuZWxzKVxuICAgIGJ1cy5vbignZGFzaGJvYXJkOmZpbGUtY2FyZCcsIHRoaXMuaGFuZGxlRmlsZUNhcmQpXG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoKVxuXG4gICAgLy8gYnVzLm9uKCdjb3JlOnN1Y2Nlc3MnLCAodXBsb2FkZWRDb3VudCkgPT4ge1xuICAgIC8vICAgYnVzLmVtaXQoXG4gICAgLy8gICAgICdpbmZvcm1lcicsXG4gICAgLy8gICAgIGAke3RoaXMuY29yZS5pMThuKCdmaWxlcycsIHsnc21hcnRfY291bnQnOiB1cGxvYWRlZENvdW50fSl9IHN1Y2Nlc3NmdWxseSB1cGxvYWRlZCwgU2lyIWAsXG4gICAgLy8gICAgICdpbmZvJyxcbiAgICAvLyAgICAgNjAwMFxuICAgIC8vICAgKVxuICAgIC8vIH0pXG4gIH1cblxuICByZW1vdmVBY3Rpb25zICgpIHtcbiAgICBjb25zdCBidXMgPSB0aGlzLmNvcmUuYnVzXG5cbiAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoKVxuXG4gICAgYnVzLm9mZignY29yZTpmaWxlLWFkZCcsIHRoaXMuaGlkZUFsbFBhbmVscylcbiAgICBidXMub2ZmKCdkYXNoYm9hcmQ6ZmlsZS1jYXJkJywgdGhpcy5oYW5kbGVGaWxlQ2FyZClcbiAgfVxuXG4gIHVwZGF0ZURhc2hib2FyZEVsV2lkdGggKCkge1xuICAgIGNvbnN0IGRhc2hib2FyZEVsID0gdGhpcy50YXJnZXQucXVlcnlTZWxlY3RvcignLlVwcHlEYXNoYm9hcmQtaW5uZXInKVxuICAgIGNvbnN0IGNvbnRhaW5lcldpZHRoID0gZGFzaGJvYXJkRWwub2Zmc2V0V2lkdGhcbiAgICBjb25zb2xlLmxvZyhjb250YWluZXJXaWR0aClcblxuICAgIGNvbnN0IG1vZGFsID0gdGhpcy5jb3JlLmdldFN0YXRlKCkubW9kYWxcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgbW9kYWw6IE9iamVjdC5hc3NpZ24oe30sIG1vZGFsLCB7XG4gICAgICAgIGNvbnRhaW5lcldpZHRoOiBkYXNoYm9hcmRFbC5vZmZzZXRXaWR0aFxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgaGFuZGxlRmlsZUNhcmQgKGZpbGVJZCkge1xuICAgIGNvbnN0IG1vZGFsID0gdGhpcy5jb3JlLmdldFN0YXRlKCkubW9kYWxcblxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBtb2RhbDogT2JqZWN0LmFzc2lnbih7fSwgbW9kYWwsIHtcbiAgICAgICAgZmlsZUNhcmRGb3I6IGZpbGVJZCB8fCBmYWxzZVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgaGFuZGxlRHJvcCAoZmlsZXMpIHtcbiAgICB0aGlzLmNvcmUubG9nKCdBbGwgcmlnaHQsIHNvbWVvbmUgZHJvcHBlZCBzb21ldGhpbmcuLi4nKVxuXG4gICAgZmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgdGhpcy5jb3JlLmJ1cy5lbWl0KCdjb3JlOmZpbGUtYWRkJywge1xuICAgICAgICBzb3VyY2U6IHRoaXMuaWQsXG4gICAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgICAgdHlwZTogZmlsZS50eXBlLFxuICAgICAgICBkYXRhOiBmaWxlXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBjYW5jZWxBbGwgKCkge1xuICAgIHRoaXMuY29yZS5idXMuZW1pdCgnY29yZTpjYW5jZWwtYWxsJylcbiAgfVxuXG4gIHBhdXNlQWxsICgpIHtcbiAgICB0aGlzLmNvcmUuYnVzLmVtaXQoJ2NvcmU6cGF1c2UtYWxsJylcbiAgfVxuXG4gIHJlc3VtZUFsbCAoKSB7XG4gICAgdGhpcy5jb3JlLmJ1cy5lbWl0KCdjb3JlOnJlc3VtZS1hbGwnKVxuICB9XG5cbiAgZ2V0VG90YWxTcGVlZCAoZmlsZXMpIHtcbiAgICBsZXQgdG90YWxTcGVlZCA9IDBcbiAgICBmaWxlcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICB0b3RhbFNwZWVkID0gdG90YWxTcGVlZCArIGdldFNwZWVkKGZpbGUucHJvZ3Jlc3MpXG4gICAgfSlcbiAgICByZXR1cm4gdG90YWxTcGVlZFxuICB9XG5cbiAgZ2V0VG90YWxFVEEgKGZpbGVzKSB7XG4gICAgbGV0IHRvdGFsU2Vjb25kcyA9IDBcblxuICAgIGZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIHRvdGFsU2Vjb25kcyA9IHRvdGFsU2Vjb25kcyArIGdldEVUQShmaWxlLnByb2dyZXNzKVxuICAgIH0pXG5cbiAgICByZXR1cm4gdG90YWxTZWNvbmRzXG4gIH1cblxuICByZW5kZXIgKHN0YXRlKSB7XG4gICAgY29uc3QgZmlsZXMgPSBzdGF0ZS5maWxlc1xuXG4gICAgY29uc3QgbmV3RmlsZXMgPSBPYmplY3Qua2V5cyhmaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgICB9KVxuICAgIGNvbnN0IHVwbG9hZFN0YXJ0ZWRGaWxlcyA9IE9iamVjdC5rZXlzKGZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAgIHJldHVybiBmaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRTdGFydGVkXG4gICAgfSlcbiAgICBjb25zdCBjb21wbGV0ZUZpbGVzID0gT2JqZWN0LmtleXMoZmlsZXMpLmZpbHRlcigoZmlsZSkgPT4ge1xuICAgICAgcmV0dXJuIGZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZENvbXBsZXRlXG4gICAgfSlcbiAgICBjb25zdCBpblByb2dyZXNzRmlsZXMgPSBPYmplY3Qua2V5cyhmaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICByZXR1cm4gIWZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZENvbXBsZXRlICYmXG4gICAgICAgICAgICAgZmlsZXNbZmlsZV0ucHJvZ3Jlc3MudXBsb2FkU3RhcnRlZCAmJlxuICAgICAgICAgICAgICFmaWxlc1tmaWxlXS5pc1BhdXNlZFxuICAgIH0pXG5cbiAgICBsZXQgaW5Qcm9ncmVzc0ZpbGVzQXJyYXkgPSBbXVxuICAgIGluUHJvZ3Jlc3NGaWxlcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICBpblByb2dyZXNzRmlsZXNBcnJheS5wdXNoKGZpbGVzW2ZpbGVdKVxuICAgIH0pXG5cbiAgICBjb25zdCB0b3RhbFNwZWVkID0gcHJldHR5Qnl0ZXModGhpcy5nZXRUb3RhbFNwZWVkKGluUHJvZ3Jlc3NGaWxlc0FycmF5KSlcbiAgICBjb25zdCB0b3RhbEVUQSA9IHByZXR0eUVUQSh0aGlzLmdldFRvdGFsRVRBKGluUHJvZ3Jlc3NGaWxlc0FycmF5KSlcblxuICAgIC8vIHRvdGFsIHNpemUgYW5kIHVwbG9hZGVkIHNpemVcbiAgICBsZXQgdG90YWxTaXplID0gMFxuICAgIGxldCB0b3RhbFVwbG9hZGVkU2l6ZSA9IDBcbiAgICBpblByb2dyZXNzRmlsZXNBcnJheS5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICB0b3RhbFNpemUgPSB0b3RhbFNpemUgKyAoZmlsZS5wcm9ncmVzcy5ieXRlc1RvdGFsIHx8IDApXG4gICAgICB0b3RhbFVwbG9hZGVkU2l6ZSA9IHRvdGFsVXBsb2FkZWRTaXplICsgKGZpbGUucHJvZ3Jlc3MuYnl0ZXNVcGxvYWRlZCB8fCAwKVxuICAgIH0pXG4gICAgdG90YWxTaXplID0gcHJldHR5Qnl0ZXModG90YWxTaXplKVxuICAgIHRvdGFsVXBsb2FkZWRTaXplID0gcHJldHR5Qnl0ZXModG90YWxVcGxvYWRlZFNpemUpXG5cbiAgICBjb25zdCBpc0FsbENvbXBsZXRlID0gc3RhdGUudG90YWxQcm9ncmVzcyA9PT0gMTAwXG4gICAgY29uc3QgaXNBbGxQYXVzZWQgPSBpblByb2dyZXNzRmlsZXMubGVuZ3RoID09PSAwICYmICFpc0FsbENvbXBsZXRlICYmIHVwbG9hZFN0YXJ0ZWRGaWxlcy5sZW5ndGggPiAwXG4gICAgY29uc3QgaXNVcGxvYWRTdGFydGVkID0gdXBsb2FkU3RhcnRlZEZpbGVzLmxlbmd0aCA+IDBcblxuICAgIGNvbnN0IGFjcXVpcmVycyA9IHN0YXRlLm1vZGFsLnRhcmdldHMuZmlsdGVyKCh0YXJnZXQpID0+IHtcbiAgICAgIHJldHVybiB0YXJnZXQudHlwZSA9PT0gJ2FjcXVpcmVyJ1xuICAgIH0pXG5cbiAgICBjb25zdCBwcm9ncmVzc2luZGljYXRvcnMgPSBzdGF0ZS5tb2RhbC50YXJnZXRzLmZpbHRlcigodGFyZ2V0KSA9PiB7XG4gICAgICByZXR1cm4gdGFyZ2V0LnR5cGUgPT09ICdwcm9ncmVzc2luZGljYXRvcidcbiAgICB9KVxuXG4gICAgY29uc3QgYWRkRmlsZSA9IChmaWxlKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOmZpbGUtYWRkJywgZmlsZSlcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdmVGaWxlID0gKGZpbGVJRCkgPT4ge1xuICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTpmaWxlLXJlbW92ZScsIGZpbGVJRClcbiAgICB9XG5cbiAgICBjb25zdCBzdGFydFVwbG9hZCA9IChldikgPT4ge1xuICAgICAgdGhpcy5jb3JlLnVwbG9hZCgpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgLy8gTG9nIGVycm9yLlxuICAgICAgICBjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIubWVzc2FnZSlcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgY29uc3QgcGF1c2VVcGxvYWQgPSAoZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1wYXVzZScsIGZpbGVJRClcbiAgICB9XG5cbiAgICBjb25zdCBjYW5jZWxVcGxvYWQgPSAoZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1jYW5jZWwnLCBmaWxlSUQpXG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOmZpbGUtcmVtb3ZlJywgZmlsZUlEKVxuICAgIH1cblxuICAgIGNvbnN0IHNob3dGaWxlQ2FyZCA9IChmaWxlSUQpID0+IHtcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2Rhc2hib2FyZDpmaWxlLWNhcmQnLCBmaWxlSUQpXG4gICAgfVxuXG4gICAgY29uc3QgZmlsZUNhcmREb25lID0gKG1ldGEsIGZpbGVJRCkgPT4ge1xuICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTp1cGRhdGUtbWV0YScsIG1ldGEsIGZpbGVJRClcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2Rhc2hib2FyZDpmaWxlLWNhcmQnKVxuICAgIH1cblxuICAgIGNvbnN0IGluZm8gPSAodGV4dCwgdHlwZSwgZHVyYXRpb24pID0+IHtcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2luZm9ybWVyJywgdGV4dCwgdHlwZSwgZHVyYXRpb24pXG4gICAgfVxuXG4gICAgY29uc3QgcmVzdW1hYmxlVXBsb2FkcyA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLmNhcGFiaWxpdGllcy5yZXN1bWFibGVVcGxvYWRzIHx8IGZhbHNlXG5cbiAgICByZXR1cm4gRGFzaGJvYXJkKHtcbiAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgIG1vZGFsOiBzdGF0ZS5tb2RhbCxcbiAgICAgIG5ld0ZpbGVzOiBuZXdGaWxlcyxcbiAgICAgIGZpbGVzOiBmaWxlcyxcbiAgICAgIHRvdGFsRmlsZUNvdW50OiBPYmplY3Qua2V5cyhmaWxlcykubGVuZ3RoLFxuICAgICAgaXNVcGxvYWRTdGFydGVkOiBpc1VwbG9hZFN0YXJ0ZWQsXG4gICAgICBpblByb2dyZXNzOiB1cGxvYWRTdGFydGVkRmlsZXMubGVuZ3RoLFxuICAgICAgY29tcGxldGVGaWxlczogY29tcGxldGVGaWxlcyxcbiAgICAgIGluUHJvZ3Jlc3NGaWxlczogaW5Qcm9ncmVzc0ZpbGVzLFxuICAgICAgdG90YWxTcGVlZDogdG90YWxTcGVlZCxcbiAgICAgIHRvdGFsRVRBOiB0b3RhbEVUQSxcbiAgICAgIHRvdGFsUHJvZ3Jlc3M6IHN0YXRlLnRvdGFsUHJvZ3Jlc3MsXG4gICAgICB0b3RhbFNpemU6IHRvdGFsU2l6ZSxcbiAgICAgIHRvdGFsVXBsb2FkZWRTaXplOiB0b3RhbFVwbG9hZGVkU2l6ZSxcbiAgICAgIGlzQWxsQ29tcGxldGU6IGlzQWxsQ29tcGxldGUsXG4gICAgICBpc0FsbFBhdXNlZDogaXNBbGxQYXVzZWQsXG4gICAgICBhY3F1aXJlcnM6IGFjcXVpcmVycyxcbiAgICAgIGFjdGl2ZVBhbmVsOiBzdGF0ZS5tb2RhbC5hY3RpdmVQYW5lbCxcbiAgICAgIHByb2dyZXNzaW5kaWNhdG9yczogcHJvZ3Jlc3NpbmRpY2F0b3JzLFxuICAgICAgYXV0b1Byb2NlZWQ6IHRoaXMuY29yZS5vcHRzLmF1dG9Qcm9jZWVkLFxuICAgICAgaWQ6IHRoaXMuaWQsXG4gICAgICBoaWRlTW9kYWw6IHRoaXMuaGlkZU1vZGFsLFxuICAgICAgc2hvd1Byb2dyZXNzRGV0YWlsczogdGhpcy5vcHRzLnNob3dQcm9ncmVzc0RldGFpbHMsXG4gICAgICBpbmxpbmU6IHRoaXMub3B0cy5pbmxpbmUsXG4gICAgICBzZW1pVHJhbnNwYXJlbnQ6IHRoaXMub3B0cy5zZW1pVHJhbnNwYXJlbnQsXG4gICAgICBvblBhc3RlOiB0aGlzLmhhbmRsZVBhc3RlLFxuICAgICAgc2hvd1BhbmVsOiB0aGlzLnNob3dQYW5lbCxcbiAgICAgIGhpZGVBbGxQYW5lbHM6IHRoaXMuaGlkZUFsbFBhbmVscyxcbiAgICAgIGxvZzogdGhpcy5jb3JlLmxvZyxcbiAgICAgIGJ1czogdGhpcy5jb3JlLmVtaXR0ZXIsXG4gICAgICBpMThuOiB0aGlzLmNvbnRhaW5lcldpZHRoLFxuICAgICAgcGF1c2VBbGw6IHRoaXMucGF1c2VBbGwsXG4gICAgICByZXN1bWVBbGw6IHRoaXMucmVzdW1lQWxsLFxuICAgICAgY2FuY2VsQWxsOiB0aGlzLmNhbmNlbEFsbCxcbiAgICAgIGFkZEZpbGU6IGFkZEZpbGUsXG4gICAgICByZW1vdmVGaWxlOiByZW1vdmVGaWxlLFxuICAgICAgaW5mbzogaW5mbyxcbiAgICAgIG1ldGFGaWVsZHM6IHN0YXRlLm1ldGFGaWVsZHMsXG4gICAgICByZXN1bWFibGVVcGxvYWRzOiByZXN1bWFibGVVcGxvYWRzLFxuICAgICAgc3RhcnRVcGxvYWQ6IHN0YXJ0VXBsb2FkLFxuICAgICAgcGF1c2VVcGxvYWQ6IHBhdXNlVXBsb2FkLFxuICAgICAgY2FuY2VsVXBsb2FkOiBjYW5jZWxVcGxvYWQsXG4gICAgICBmaWxlQ2FyZEZvcjogc3RhdGUubW9kYWwuZmlsZUNhcmRGb3IsXG4gICAgICBzaG93RmlsZUNhcmQ6IHNob3dGaWxlQ2FyZCxcbiAgICAgIGZpbGVDYXJkRG9uZTogZmlsZUNhcmREb25lLFxuICAgICAgdXBkYXRlRGFzaGJvYXJkRWxXaWR0aDogdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoLFxuICAgICAgbWF4V2lkdGg6IHRoaXMub3B0cy5tYXhXaWR0aCxcbiAgICAgIG1heEhlaWdodDogdGhpcy5vcHRzLm1heEhlaWdodCxcbiAgICAgIGN1cnJlbnRXaWR0aDogc3RhdGUubW9kYWwuY29udGFpbmVyV2lkdGgsXG4gICAgICBpc1dpZGU6IHN0YXRlLm1vZGFsLmNvbnRhaW5lcldpZHRoID4gNDAwXG4gICAgfSlcbiAgfVxuXG4gIGluc3RhbGwgKCkge1xuICAgIC8vIFNldCBkZWZhdWx0IHN0YXRlIGZvciBNb2RhbFxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7bW9kYWw6IHtcbiAgICAgIGlzSGlkZGVuOiB0cnVlLFxuICAgICAgc2hvd0ZpbGVDYXJkOiBmYWxzZSxcbiAgICAgIGFjdGl2ZVBhbmVsOiBmYWxzZSxcbiAgICAgIHRhcmdldHM6IFtdXG4gICAgfX0pXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLm9wdHMudGFyZ2V0XG4gICAgY29uc3QgcGx1Z2luID0gdGhpc1xuICAgIHRoaXMudGFyZ2V0ID0gdGhpcy5tb3VudCh0YXJnZXQsIHBsdWdpbilcblxuICAgIHRoaXMuaW5pdEV2ZW50cygpXG4gICAgdGhpcy5hY3Rpb25zKClcbiAgfVxuXG4gIHVuaW5zdGFsbCAoKSB7XG4gICAgdGhpcy51bm1vdW50KClcbiAgICB0aGlzLnJlbW92ZUFjdGlvbnMoKVxuICAgIHRoaXMucmVtb3ZlRXZlbnRzKClcbiAgfVxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGZvbGRlcjogKCkgPT5cbiAgICBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHN0eWxlPVwid2lkdGg6MTZweDttYXJnaW4tcmlnaHQ6M3B4XCIgdmlld0JveD1cIjAgMCAyNzYuMTU3IDI3Ni4xNTdcIj5cbiAgICAgIDxwYXRoIGQ9XCJNMjczLjA4IDEwMS4zNzhjLTMuMy00LjY1LTguODYtNy4zMi0xNS4yNTQtNy4zMmgtMjQuMzRWNjcuNTljMC0xMC4yLTguMy0xOC41LTE4LjUtMTguNWgtODUuMzIyYy0zLjYzIDAtOS4yOTUtMi44NzUtMTEuNDM2LTUuODA1bC02LjM4Ni04LjczNWMtNC45ODItNi44MTQtMTUuMTA0LTExLjk1NC0yMy41NDYtMTEuOTU0SDU4LjczYy05LjI5MiAwLTE4LjYzOCA2LjYwOC0yMS43MzcgMTUuMzcybC0yLjAzMyA1Ljc1MmMtLjk1OCAyLjcxLTQuNzIgNS4zNy03LjU5NiA1LjM3SDE4LjVDOC4zIDQ5LjA5IDAgNTcuMzkgMCA2Ny41OXYxNjcuMDdjMCAuODg2LjE2IDEuNzMuNDQzIDIuNTIuMTUyIDMuMzA2IDEuMTggNi40MjQgMy4wNTMgOS4wNjQgMy4zIDQuNjUyIDguODYgNy4zMiAxNS4yNTUgNy4zMmgxODguNDg3YzExLjM5NSAwIDIzLjI3LTguNDI1IDI3LjAzNS0xOS4xOGw0MC42NzctMTE2LjE4OGMyLjExLTYuMDM1IDEuNDMtMTIuMTY0LTEuODctMTYuODE2ek0xOC41IDY0LjA4OGg4Ljg2NGM5LjI5NSAwIDE4LjY0LTYuNjA3IDIxLjczOC0xNS4zN2wyLjAzMi01Ljc1Yy45Ni0yLjcxMiA0LjcyMi01LjM3MyA3LjU5Ny01LjM3M2gyOS41NjVjMy42MyAwIDkuMjk1IDIuODc2IDExLjQzNyA1LjgwNmw2LjM4NiA4LjczNWM0Ljk4MiA2LjgxNSAxNS4xMDQgMTEuOTU0IDIzLjU0NiAxMS45NTRoODUuMzIyYzEuODk4IDAgMy41IDEuNjAyIDMuNSAzLjV2MjYuNDdINjkuMzRjLTExLjM5NSAwLTIzLjI3IDguNDIzLTI3LjAzNSAxOS4xNzhMMTUgMTkxLjIzVjY3LjU5YzAtMS44OTggMS42MDMtMy41IDMuNS0zLjV6bTI0Mi4yOSA0OS4xNWwtNDAuNjc2IDExNi4xODhjLTEuNjc0IDQuNzgtNy44MTIgOS4xMzUtMTIuODc3IDkuMTM1SDE4Ljc1Yy0xLjQ0NyAwLTIuNTc2LS4zNzItMy4wMi0uOTk3LS40NDItLjYyNS0uNDIyLTEuODE0LjA1Ny0zLjE4bDQwLjY3Ny0xMTYuMTljMS42NzQtNC43OCA3LjgxMi05LjEzNCAxMi44NzctOS4xMzRoMTg4LjQ4N2MxLjQ0OCAwIDIuNTc3LjM3MiAzLjAyLjk5Ny40NDMuNjI1LjQyMyAxLjgxNC0uMDU2IDMuMTh6XCIvPlxuICA8L3N2Zz5gLFxuICBtdXNpYzogKCkgPT5cbiAgICBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTYuMDAwMDAwcHRcIiBoZWlnaHQ9XCIxNi4wMDAwMDBwdFwiIHZpZXdCb3g9XCIwIDAgNDguMDAwMDAwIDQ4LjAwMDAwMFwiXG4gICAgcHJlc2VydmVBc3BlY3RSYXRpbz1cInhNaWRZTWlkIG1lZXRcIj5cbiAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMC4wMDAwMDAsNDguMDAwMDAwKSBzY2FsZSgwLjEwMDAwMCwtMC4xMDAwMDApXCJcbiAgICBmaWxsPVwiIzUyNTA1MFwiIHN0cm9rZT1cIm5vbmVcIj5cbiAgICA8cGF0aCBkPVwiTTIwOSA0NzMgYzAgLTUgMCAtNTIgMSAtMTA2IDEgLTU0IC0yIC0xMTggLTYgLTE0MyBsLTcgLTQ2IC00NCA1XG4gICAgYy03MyA4IC0xMzMgLTQ2IC0xMzMgLTEyMCAwIC0xNyAtNSAtMzUgLTEwIC0zOCAtMTggLTExIDAgLTI1IDMzIC0yNCAzMCAxIDMwXG4gICAgMSA3IDggLTE1IDQgLTIwIDEwIC0xMyAxNCA2IDQgOSAxNiA2IDI3IC05IDM0IDcgNzAgNDAgOTAgMTcgMTEgMzkgMjAgNDcgMjBcbiAgICA4IDAgLTMgLTkgLTI2IC0xOSAtNDIgLTE5IC01NCAtMzYgLTU0IC03NSAwIC0zNiAzMCAtNTYgODQgLTU2IDQxIDAgNTMgNSA4MlxuICAgIDM0IDE5IDE5IDM0IDMxIDM0IDI3IDAgLTQgLTUgLTEyIC0xMiAtMTkgLTkgLTkgLTEgLTEyIDM5IC0xMiAxMDYgMCAxODMgLTIxXG4gICAgMTIxIC0zMyAtMTcgLTMgLTE0IC01IDEwIC02IDI1IC0xIDMyIDMgMzIgMTcgMCAyNiAtMjAgNDIgLTUxIDQyIC0zOSAwIC00M1xuICAgIDEzIC0xMCAzOCA1NiA0MSA3NiAxMjQgNDUgMTg1IC0yNSA0OCAtNzIgMTA1IC0xMDMgMTIzIC0xNSA5IC0zNiAyOSAtNDcgNDVcbiAgICAtMTcgMjYgLTYzIDQxIC02NSAyMnogbTU2IC00OCBjMTYgLTI0IDMxIC00MiAzNCAtMzkgOSA5IDc5IC02OSA3NCAtODMgLTMgLTdcbiAgICAtMiAtMTMgMyAtMTIgMTggMyAyNSAtMSAxOSAtMTIgLTUgLTcgLTE2IC0yIC0zMyAxMyBsLTI2IDIzIDE2IC0yNSBjMTcgLTI3XG4gICAgMjkgLTkyIDE2IC04NCAtNCAzIC04IC04IC04IC0yNSAwIC0xNiA0IC0zMyAxMCAtMzYgNSAtMyA3IDAgNCA5IC0zIDkgMyAyMFxuICAgIDE1IDI4IDEzIDggMjEgMjQgMjIgNDMgMSAxOCAzIDIzIDYgMTIgMyAtMTAgMiAtMjkgLTEgLTQzIC03IC0yNiAtNjIgLTk0IC03N1xuICAgIC05NCAtMTMgMCAtMTEgMTcgNCAzMiAyMSAxOSA0IDg4IC0yOCAxMTUgLTE0IDEzIC0yMiAyMyAtMTYgMjMgNSAwIDIxIC0xNCAzNVxuICAgIC0zMSAxNCAtMTcgMjYgLTI1IDI2IC0xOSAwIDIxIC02MCA3MiAtNzkgNjcgLTE2IC00IC0xNyAtMSAtOCAzNCA2IDI0IDE0IDM2XG4gICAgMjEgMzIgNiAtMyAxIDUgLTExIDE4IC0xMiAxMyAtMjIgMjkgLTIzIDM0IC0xIDYgLTYgMTcgLTEyIDI1IC02IDEwIC03IC0zOVxuICAgIC00IC0xNDIgbDYgLTE1OCAtMjYgMTAgYy0zMyAxMyAtNDQgMTIgLTIxIC0xIDE3IC0xMCAyNCAtNDQgMTAgLTUyIC01IC0zIC0zOVxuICAgIC04IC03NiAtMTIgLTY4IC03IC02OSAtNyAtNjUgMTcgNCAyOCA2NCA2MCAxMTcgNjIgbDM2IDEgMCAxNTcgYzAgODcgMiAxNTggNVxuICAgIDE1OCAzIDAgMTggLTIwIDM1IC00NXogbTE1IC0xNTkgYzAgLTIgLTcgLTcgLTE2IC0xMCAtOCAtMyAtMTIgLTIgLTkgNCA2IDEwXG4gICAgMjUgMTQgMjUgNnogbTUwIC05MiBjMCAtMTMgLTQgLTI2IC0xMCAtMjkgLTE0IC05IC0xMyAtNDggMiAtNjMgOSAtOSA2IC0xMlxuICAgIC0xNSAtMTIgLTIyIDAgLTI3IDUgLTI3IDI0IDAgMTQgLTQgMjggLTEwIDMxIC0xNSA5IC0xMyAxMDIgMyAxMDggMTggNyA1N1xuICAgIC0zMyA1NyAtNTl6IG0tMTM5IC0xMzUgYy0zMiAtMjYgLTEyMSAtMjUgLTEyMSAyIDAgNiA4IDUgMTkgLTEgMjYgLTE0IDY0IC0xM1xuICAgIDU1IDEgLTQgOCAxIDkgMTYgNCAxMyAtNCAyMCAtMyAxNyAyIC0zIDUgNCAxMCAxNiAxMCAyMiAyIDIyIDIgLTIgLTE4elwiLz5cbiAgICA8cGF0aCBkPVwiTTMzMCAzNDUgYzE5IC0xOSAzNiAtMzUgMzkgLTM1IDMgMCAtMTAgMTYgLTI5IDM1IC0xOSAxOSAtMzYgMzUgLTM5XG4gICAgMzUgLTMgMCAxMCAtMTYgMjkgLTM1elwiLz5cbiAgICA8cGF0aCBkPVwiTTM0OSAxMjMgYy0xMyAtMTYgLTEyIC0xNyA0IC00IDE2IDEzIDIxIDIxIDEzIDIxIC0yIDAgLTEwIC04IC0xN1xuICAgIC0xN3pcIi8+XG4gICAgPHBhdGggZD1cIk0yNDMgMTMgYzE1IC0yIDM5IC0yIDU1IDAgMTUgMiAyIDQgLTI4IDQgLTMwIDAgLTQzIC0yIC0yNyAtNHpcIi8+XG4gICAgPC9nPlxuICAgIDwvc3ZnPmAsXG4gIHBhZ2Vfd2hpdGVfcGljdHVyZTogKCkgPT5cbiAgICBodG1sYFxuICAgIDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTYuMDAwMDAwcHRcIiBoZWlnaHQ9XCIxNi4wMDAwMDBwdFwiIHZpZXdCb3g9XCIwIDAgNDguMDAwMDAwIDM2LjAwMDAwMFwiXG4gICAgcHJlc2VydmVBc3BlY3RSYXRpbz1cInhNaWRZTWlkIG1lZXRcIj5cbiAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMC4wMDAwMDAsMzYuMDAwMDAwKSBzY2FsZSgwLjEwMDAwMCwtMC4xMDAwMDApXCJcbiAgICBmaWxsPVwiIzU2NTU1NVwiIHN0cm9rZT1cIm5vbmVcIj5cbiAgICA8cGF0aCBkPVwiTTAgMTgwIGwwIC0xODAgMjQwIDAgMjQwIDAgMCAxODAgMCAxODAgLTI0MCAwIC0yNDAgMCAwIC0xODB6IG00NzBcbiAgICAwIGwwIC0xNzAgLTIzMCAwIC0yMzAgMCAwIDE3MCAwIDE3MCAyMzAgMCAyMzAgMCAwIC0xNzB6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDAgMTg1IGwwIC0xMzUgMjAwIDAgMjAwIDAgMCAxMzUgMCAxMzUgLTIwMCAwIC0yMDAgMCAwIC0xMzV6IG0zOTBcbiAgICA1OSBsMCAtNjUgLTI5IDIwIGMtMzcgMjcgLTQ1IDI2IC02NSAtNCAtOSAtMTQgLTIyIC0yNSAtMjggLTI1IC03IDAgLTI0IC0xMlxuICAgIC0zOSAtMjYgLTI2IC0yNSAtMjggLTI1IC01MyAtOSAtMTcgMTEgLTI2IDEzIC0yNiA2IDAgLTcgLTQgLTkgLTEwIC02IC01IDNcbiAgICAtMjIgLTIgLTM3IC0xMiBsLTI4IC0xOCAyMCAyNyBjMTEgMTUgMjYgMjUgMzMgMjMgNiAtMiAxMiAtMSAxMiA0IDAgMTAgLTM3XG4gICAgMjEgLTY1IDIwIC0xNCAtMSAtMTIgLTMgNyAtOCBsMjggLTYgLTUwIC01NSAtNDkgLTU1IDAgMTI2IDEgMTI2IDE4OSAxIDE4OSAyXG4gICAgMCAtNjZ6IG0tMTYgLTczIGMxMSAtMTIgMTQgLTIxIDggLTIxIC02IDAgLTEzIDQgLTE3IDEwIC0zIDUgLTEyIDcgLTE5IDQgLThcbiAgICAtMyAtMTYgMiAtMTkgMTMgLTMgMTEgLTQgNyAtNCAtOSAxIC0xOSA2IC0yNSAxOCAtMjMgMTkgNCA0NiAtMjEgMzUgLTMyIC00XG4gICAgLTQgLTExIC0xIC0xNiA3IC02IDggLTEwIDEwIC0xMCA0IDAgLTYgNyAtMTcgMTUgLTI0IDI0IC0yMCAxMSAtMjQgLTc2IC0yN1xuICAgIC02OSAtMSAtODMgMSAtOTcgMTggLTkgMTAgLTIwIDE5IC0yNSAxOSAtNSAwIC00IC02IDIgLTE0IDE0IC0xNyAtNSAtMjYgLTU1XG4gICAgLTI2IC0zNiAwIC00NiAxNiAtMTcgMjcgMTAgNCAyMiAxMyAyNyAyMiA4IDEzIDEwIDEyIDE3IC00IDcgLTE3IDggLTE4IDggLTJcbiAgICAxIDIzIDExIDIyIDU1IC04IDMzIC0yMiAzNSAtMjMgMjYgLTUgLTkgMTYgLTggMjAgNSAyMCA4IDAgMTUgNSAxNSAxMSAwIDUgLTRcbiAgICA3IC0xMCA0IC01IC0zIC0xMCAtNCAtMTAgLTEgMCA0IDU5IDM2IDY3IDM2IDIgMCAxIC0xMCAtMiAtMjEgLTUgLTE1IC00IC0xOVxuICAgIDUgLTE0IDYgNCA5IDE3IDYgMjggLTEyIDQ5IDI3IDUzIDY4IDh6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMTAwIDI5NiBjMCAtMiA3IC03IDE2IC0xMCA4IC0zIDEyIC0yIDkgNCAtNiAxMCAtMjUgMTQgLTI1IDZ6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMjQzIDI5MyBjOSAtMiAyMyAtMiAzMCAwIDYgMyAtMSA1IC0xOCA1IC0xNiAwIC0yMiAtMiAtMTIgLTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNjUgMjgwIGMtMyAtNSAtMiAtMTAgNCAtMTAgNSAwIDEzIDUgMTYgMTAgMyA2IDIgMTAgLTQgMTAgLTUgMCAtMTNcbiAgICAtNCAtMTYgLTEwelwiLz5cbiAgICA8cGF0aCBkPVwiTTE1NSAyNzAgYy0zIC02IDEgLTcgOSAtNCAxOCA3IDIxIDE0IDcgMTQgLTYgMCAtMTMgLTQgLTE2IC0xMHpcIi8+XG4gICAgPHBhdGggZD1cIk0yMzMgMjUyIGMtMTMgLTIgLTIzIC04IC0yMyAtMTMgMCAtNyAtMTIgLTggLTMwIC00IC0yMiA1IC0zMCAzIC0zMFxuICAgIC03IDAgLTEwIC0yIC0xMCAtOSAxIC01IDggLTE5IDEyIC0zNSA5IC0xNCAtMyAtMjcgLTEgLTMwIDQgLTIgNSAtNCA0IC0zIC0zXG4gICAgMiAtNiA2IC0xMCAxMCAtMTAgMyAwIDIwIC00IDM3IC05IDE4IC01IDMyIC01IDM2IDEgMyA2IDEzIDggMjEgNSAxMyAtNSAxMTNcbiAgICAyMSAxMTMgMzAgMCAzIC0xOSAyIC01NyAtNHpcIi8+XG4gICAgPHBhdGggZD1cIk0yNzUgMjIwIGMtMTMgLTYgLTE1IC05IC01IC05IDggMCAyMiA0IDMwIDkgMTggMTIgMiAxMiAtMjUgMHpcIi8+XG4gICAgPHBhdGggZD1cIk0xMzIgMjMgYzU5IC0yIDE1OCAtMiAyMjAgMCA2MiAxIDE0IDMgLTEwNyAzIC0xMjEgMCAtMTcyIC0yIC0xMTNcbiAgICAtM3pcIi8+XG4gICAgPC9nPlxuICAgIDwvc3ZnPmAsXG4gIHdvcmQ6ICgpID0+XG4gICAgaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjE2LjAwMDAwMHB0XCIgaGVpZ2h0PVwiMTYuMDAwMDAwcHRcIiB2aWV3Qm94PVwiMCAwIDQ4LjAwMDAwMCA0OC4wMDAwMDBcIlxuICAgIHByZXNlcnZlQXNwZWN0UmF0aW89XCJ4TWlkWU1pZCBtZWV0XCI+XG4gICAgPGcgdHJhbnNmb3JtPVwidHJhbnNsYXRlKDAuMDAwMDAwLDQ4LjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKVwiXG4gICAgZmlsbD1cIiM0MjNkM2RcIiBzdHJva2U9XCJub25lXCI+XG4gICAgPHBhdGggZD1cIk0wIDQ2NiBjMCAtMTUgODcgLTI2IDIxMyAtMjYgbDc3IDAgMCAtMTQwIDAgLTE0MCAtNzcgMCBjLTEwNSAwXG4gICAgLTIxMyAtMTEgLTIxMyAtMjEgMCAtNSAxNSAtOSAzNCAtOSAyNSAwIDMzIC00IDMzIC0xNyAwIC03NCA0IC0xMTMgMTMgLTExMyA2XG4gICAgMCAxMCAzMiAxMCA3NSBsMCA3NSAxMDUgMCAxMDUgMCAwIDE1MCAwIDE1MCAtMTA1IDAgYy04NyAwIC0xMDUgMyAtMTA1IDE1IDBcbiAgICAxMSAtMTIgMTUgLTQ1IDE1IC0zMSAwIC00NSAtNCAtNDUgLTE0elwiLz5cbiAgICA8cGF0aCBkPVwiTTEyMyA0NjggYy0yIC01IDUwIC04IDExNiAtOCBsMTIxIDAgMCAtNTAgYzAgLTQ2IC0yIC01MCAtMjMgLTUwXG4gICAgLTE0IDAgLTI0IC02IC0yNCAtMTUgMCAtOCA0IC0xNSA5IC0xNSA0IDAgOCAtMjAgOCAtNDUgMCAtMjUgLTQgLTQ1IC04IC00NVxuICAgIC01IDAgLTkgLTcgLTkgLTE1IDAgLTkgMTAgLTE1IDI0IC0xNSAyMiAwIDIzIDMgMjMgNzUgbDAgNzUgNTAgMCA1MCAwIDAgLTE3MFxuICAgIDAgLTE3MCAtMTc1IDAgLTE3NSAwIC0yIDYzIGMtMiA1OSAtMiA2MCAtNSAxMyAtMyAtMjcgLTIgLTYwIDIgLTczIGw1IC0yM1xuICAgIDE4MyAyIDE4MiAzIDIgMjE2IGMzIDI3NSAxOSAyNTQgLTE5NCAyNTQgLTg1IDAgLTE1NyAtMyAtMTYwIC03eiBtMzM3IC04NSBjMFxuICAgIC0yIC0xOCAtMyAtMzkgLTMgLTM5IDAgLTM5IDAgLTQzIDQ1IGwtMyA0NCA0MiAtNDEgYzI0IC0yMyA0MyAtNDMgNDMgLTQ1elxuICAgIG0tMTkgNTAgYzE5IC0yMiAyMyAtMjkgOSAtMTggLTM2IDMwIC01MCA0MyAtNTAgNDkgMCAxMSA2IDYgNDEgLTMxelwiLz5cbiAgICA8cGF0aCBkPVwiTTQgMzAwIGMwIC03NCAxIC0xMDUgMyAtNjcgMiAzNyAyIDk3IDAgMTM1IC0yIDM3IC0zIDYgLTMgLTY4elwiLz5cbiAgICA8cGF0aCBkPVwiTTIwIDMwMCBsMCAtMTMxIDEyOCAzIDEyNyAzIDMgMTI4IDMgMTI3IC0xMzEgMCAtMTMwIDAgMCAtMTMweiBtMjUwXG4gICAgMTAwIGMwIC0xNiAtNyAtMjAgLTMzIC0yMCAtMzEgMCAtMzQgLTIgLTM0IC0zMSAwIC0yOCAyIC0zMCAxMyAtMTQgOCAxMCAxMVxuICAgIDIyIDggMjYgLTMgNSAxIDkgOSA5IDExIDAgOSAtMTIgLTEyIC01MCAtMTQgLTI3IC0zMiAtNTAgLTM5IC01MCAtMTUgMCAtMzFcbiAgICAzOCAtMjYgNjMgMiAxMCAtMSAxNSAtOCAxMSAtNiAtNCAtOSAtMSAtNiA2IDIgOCAxMCAxNiAxNiAxOCA4IDIgMTIgLTEwIDEyXG4gICAgLTM4IDAgLTM4IDIgLTQxIDE2IC0yOSA5IDcgMTIgMTUgNyAxNiAtNSAyIC03IDE3IC01IDMzIDQgMjYgMSAzMCAtMjAgMzAgLTE3XG4gICAgMCAtMjkgLTkgLTM5IC0yNyAtMjAgLTQxIC0yMiAtNTAgLTYgLTMwIDE0IDE3IDE1IDE2IDIwIC01IDQgLTEzIDIgLTQwIC0yXG4gICAgLTYwIC05IC0zNyAtOCAtMzggMjAgLTM4IDI2IDAgMzMgOCA2NCA3MCAxOSAzOSAzNyA3MCA0MCA3MCAzIDAgNSAtNDAgNSAtOTBcbiAgICBsMCAtOTAgLTEyMCAwIC0xMjAgMCAwIDEyMCAwIDEyMCAxMjAgMCBjMTEzIDAgMTIwIC0xIDEyMCAtMjB6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDAgMzcxIGMwIC02IDUgLTEzIDEwIC0xNiA2IC0zIDEwIC0zNSAxMCAtNzEgMCAtNTcgMiAtNjQgMjAgLTY0XG4gICAgMTMgMCAyNyAxNCA0MCA0MCAyNSA0OSAyNSA2MyAwIDMwIC0xOSAtMjUgLTM5IC0yMyAtMjQgMiA1IDcgNyAyMyA2IDM1IC0yIDExXG4gICAgMiAyNCA3IDI4IDIzIDEzIDkgMjUgLTI5IDI1IC0yMiAwIC00MCAtNCAtNDAgLTl6IG01MyAtOSBjLTYgLTQgLTEzIC0yOCAtMTVcbiAgICAtNTIgbC0zIC00NSAtNSA1MyBjLTUgNDcgLTMgNTIgMTUgNTIgMTMgMCAxNiAtMyA4IC04elwiLz5cbiAgICA8cGF0aCBkPVwiTTMxMyAxNjUgYzAgLTkgMTAgLTE1IDI0IC0xNSAxNCAwIDIzIDYgMjMgMTUgMCA5IC05IDE1IC0yMyAxNSAtMTRcbiAgICAwIC0yNCAtNiAtMjQgLTE1elwiLz5cbiAgICA8cGF0aCBkPVwiTTE4MCAxMDUgYzAgLTEyIDE3IC0xNSA5MCAtMTUgNzMgMCA5MCAzIDkwIDE1IDAgMTIgLTE3IDE1IC05MCAxNVxuICAgIC03MyAwIC05MCAtMyAtOTAgLTE1elwiLz5cbiAgICA8L2c+XG4gICAgPC9zdmc+YCxcbiAgcG93ZXJwb2ludDogKCkgPT5cbiAgICBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTYuMDAwMDAwcHRcIiBoZWlnaHQ9XCIxNi4wMDAwMDBwdFwiIHZpZXdCb3g9XCIwIDAgMTYuMDAwMDAwIDE2LjAwMDAwMFwiXG4gICAgcHJlc2VydmVBc3BlY3RSYXRpbz1cInhNaWRZTWlkIG1lZXRcIj5cbiAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMC4wMDAwMDAsMTQ0LjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKVwiXG4gICAgZmlsbD1cIiM0OTQ3NDdcIiBzdHJva2U9XCJub25lXCI+XG4gICAgPHBhdGggZD1cIk0wIDEzOTAgbDAgLTUwIDkzIDAgYzUwIDAgMTA5IC0zIDEzMCAtNiBsMzcgLTcgMCA1NyAwIDU2IC0xMzAgMFxuICAgIC0xMzAgMCAwIC01MHpcIi8+XG4gICAgPHBhdGggZD1cIk04NzAgMTQyNSBjMCAtOCAtMTIgLTE4IC0yNyAtMjIgbC0yOCAtNiAzMCAtOSBjMTcgLTUgNzUgLTEwIDEzMFxuICAgIC0xMiA4NiAtMiAxMDAgLTUgOTkgLTE5IDAgLTEwIC0xIC04MCAtMiAtMTU3IGwtMiAtMTQwIC02NSAwIGMtNjAgMCAtODAgLTlcbiAgICAtNTUgLTI1IDggLTUgNyAtMTEgLTEgLTIxIC0xNyAtMjAgMiAtMjUgMTEyIC0yNyBsOTQgLTIgMCA0MCAwIDQwIDEwMCA1IGM1NVxuICAgIDMgMTA0IDMgMTA4IC0xIDggLTYgMTEgLTEwMDggNCAtMTAxNiAtMiAtMiAtMjM2IC00IC01MjAgLTYgLTI4MyAtMSAtNTE5IC01XG4gICAgLTUyMyAtOSAtNCAtNCAtMSAtMTQgNiAtMjMgMTEgLTEzIDgyIC0xNSA1NjEgLTE1IGw1NDkgMCAwIDU3MCBjMCA1NDMgLTEgNTcwXG4gICAgLTE4IDU3MCAtMTAgMCAtNTYgMzkgLTEwMyA4NiAtNDYgNDcgLTkzIDkwIC0xMDQgOTUgLTExIDYgMjIgLTMxIDczIC04MiA1MFxuICAgIC01MCA5MiAtOTUgOTIgLTk5IDAgLTE0IC0yMyAtMTYgLTEzNiAtMTIgbC0xMTEgNCAtNiAxMjQgYy02IDExOSAtNyAxMjYgLTMyXG4gICAgMTQ1IC0xNCAxMiAtMjMgMjUgLTIwIDMwIDQgNSAtMzggOSAtOTkgOSAtODcgMCAtMTA2IC0zIC0xMDYgLTE1elwiLz5cbiAgICA8cGF0aCBkPVwiTTExOTAgMTQyOSBjMCAtMTQgMjI1IC0yMzkgMjM5IC0yMzkgNyAwIDExIDMwIDExIDg1IDAgNzcgLTIgODUgLTE5XG4gICAgODUgLTIxIDAgLTYxIDQ0IC02MSA2NiAwIDExIC0yMCAxNCAtODUgMTQgLTU1IDAgLTg1IC00IC04NSAtMTF6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMjgxIDEzMzEgYy0yNCAtMTYgNyAtMjMgMTI3IC0zMSAxMDAgLTYgMTA3IC03IDQ3IC05IC0zOCAtMSAtMTQyXG4gICAgLTggLTIyOSAtMTQgbC0xNjAgLTEyIC03IC0yOCBjLTEwIC0zNyAtMTYgLTY4MyAtNiAtNjkzIDQgLTQgMTAgLTQgMTUgMCA0IDRcbiAgICA4IDE2NiA5IDM1OSBsMiAzNTIgMzU4IC0zIDM1OCAtMiA1IC0zNTMgYzMgLTE5MyAyIC0zNTYgLTIgLTM2MSAtMyAtNCAtMTM2XG4gICAgLTggLTI5NSAtNyAtMjkwIDIgLTQyMyAtNCAtNDIzIC0yMCAwIC01IDMzIC05IDczIC05IDM5IDAgOTAgLTMgMTExIC03IGwzOVxuICAgIC02IC00NSAtMTggYy0yNiAtMTAgLTkwIC0yMCAtMTUxIC0yNSBsLTEwNyAtNyAwIC0zOCBjMCAtMzUgMyAtMzkgMjQgLTM5IDM2XG4gICAgMCAxMjYgLTQ4IDEyOCAtNjggMSAtOSAyIC00MCAzIC02OSAyIC0yOSA2IC05MSAxMCAtMTM4IGw3IC04NSA0NCAwIDQ0IDAgMFxuICAgIDIxOSAwIDIyMCAzMTEgMSBjMTcyIDAgMzE0IDIgMzE4IDQgNSA0IDYgMzAxIDIgNzU5IGwtMSAxMzcgLTI5NyAwIGMtMTY0IDBcbiAgICAtMzA0IC00IC0zMTIgLTl6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMiA4ODAgYy0xIC0yNzYgMiAtMzc4IDEwIC0zNjAgMTIgMzAgMTEgNjU3IC0yIDcxMCAtNSAyMSAtOCAtMTIxXG4gICAgLTggLTM1MHpcIi8+XG4gICAgPHBhdGggZD1cIk0xNDUgMTE3OCBjLTMgLTggLTQgLTE0MSAtMyAtMjk4IGwzIC0yODUgMjk1IDAgMjk1IDAgMCAyOTUgMCAyOTVcbiAgICAtMjkzIDMgYy0yMzAgMiAtMjk0IDAgLTI5NyAtMTB6IG01NTMgLTI3IGMxMSAtNiAxMyAtNjAgMTEgLTI2MCAtMSAtMTM5IC02XG4gICAgLTI1NCAtOSAtMjU2IC00IC0zIC0xMjQgLTYgLTI2NiAtNyBsLTI1OSAtMyAtMyAyNTUgYy0xIDE0MCAwIDI2MCAzIDI2NyAzIDEwXG4gICAgNjIgMTMgMjU3IDEzIDEzOSAwIDI1OSAtNCAyNjYgLTl6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDQ1IDEwOTAgbC0yMTAgLTUgLTMgLTM3IC0zIC0zOCAyMjUgMCAyMjYgMCAwIDM0IGMwIDE4IC02IDM3IC0xMlxuICAgIDQyIC03IDUgLTEwNyA3IC0yMjMgNHpcIi8+XG4gICAgPHBhdGggZD1cIk0yOTUgOTQwIGMtMyAtNiAxIC0xMiA5IC0xNSA5IC0zIDIzIC03IDMxIC0xMCAxMCAtMyAxNSAtMTggMTUgLTQ5XG4gICAgMCAtMjUgMyAtNDcgOCAtNDkgMTUgLTkgNDcgMTEgNTIgMzMgOSAzOCAyOCAzNCA0MSAtOCAxMCAtMzUgOSAtNDMgLTcgLTY2XG4gICAgLTIzIC0zMSAtNTEgLTM0IC01NiAtNCAtNCAzMSAtMjYgMzQgLTM4IDQgLTUgLTE0IC0xMiAtMjYgLTE2IC0yNiAtNCAwIC0yMlxuICAgIDE2IC00MSAzNiAtMzMgMzUgLTM0IDQwIC0yOCA4NiA3IDQ4IDYgNTAgLTE2IDQ2IC0xOCAtMiAtMjMgLTkgLTIxIC0yMyAyIC0xMVxuICAgIDMgLTQ5IDMgLTg1IDAgLTcyIDYgLTgzIDYwIC0xMTEgNTcgLTI5IDk1IC0yNSAxNDQgMTUgMzcgMzEgNDYgMzQgODMgMjkgNDBcbiAgICAtNSA0MiAtNSA0MiAyMSAwIDI0IC0zIDI3IC0yNyAyNCAtMjQgLTMgLTI4IDEgLTMxIDI1IC0zIDI0IDAgMjggMjAgMjUgMTMgLTJcbiAgICAyMyAyIDIzIDcgMCA2IC05IDkgLTIwIDggLTEzIC0yIC0yOCA5IC00NCAzMiAtMTMgMTkgLTMxIDM1IC00MSAzNSAtMTAgMCAtMjNcbiAgICA3IC0zMCAxNSAtMTQgMTcgLTEwNSAyMSAtMTE1IDV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNTIyIDkxOSBjLTI4IC0xMSAtMjAgLTI5IDE0IC0yOSAxNCAwIDI0IDYgMjQgMTQgMCAyMSAtMTEgMjUgLTM4XG4gICAgMTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNjIzIDkyMiBjLTUzIC01IC00MyAtMzIgMTIgLTMyIDMyIDAgNDUgNCA0NSAxNCAwIDE3IC0xNiAyMiAtNTcgMTh6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNTk3IDg1NCBjLTEzIC0xNCA2IC0yNCA0NCAtMjQgMjggMCAzOSA0IDM5IDE1IDAgMTEgLTExIDE1IC0zOCAxNVxuICAgIC0yMSAwIC00MiAtMyAtNDUgLTZ6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNTk3IDc5NCBjLTQgLTQgLTcgLTE4IC03IC0zMSAwIC0yMSA0IC0yMyA0NiAtMjMgNDQgMCA0NSAxIDQyIDI4XG4gICAgLTMgMjMgLTggMjcgLTM4IDMwIC0yMCAyIC0zOSAwIC00MyAtNHpcIi8+XG4gICAgPHBhdGggZD1cIk05ODkgODgzIGMtMzQgLTQgLTM3IC02IC0zNyAtMzcgMCAtMzIgMiAtMzQgNDUgLTQwIDI1IC0zIDcyIC02IDEwNFxuICAgIC02IGw1OSAwIDAgNDUgMCA0NSAtNjcgLTIgYy0zOCAtMSAtODQgLTMgLTEwNCAtNXpcIi8+XG4gICAgPHBhdGggZD1cIk05OTMgNzAzIGMtNDIgLTQgLTU0IC0xNSAtMzMgLTI4IDggLTUgOCAtMTEgMCAtMjAgLTE2IC0yMCAtMyAtMjRcbiAgICAxMDQgLTMxIGw5NiAtNyAwIDQ3IDAgNDYgLTYyIC0yIGMtMzUgLTEgLTgyIC0zIC0xMDUgLTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMTAwNSA1MjMgYy01MCAtNiAtNTkgLTEyIC00NiAtMjYgOCAtMTAgNyAtMTcgLTEgLTI1IC02IC02IC05IC0xNFxuICAgIC02IC0xNyAzIC0zIDUxIC04IDEwNyAtMTIgbDEwMSAtNiAwIDQ2IDAgNDcgLTYyIC0xIGMtMzUgLTEgLTc2IC00IC05MyAtNnpcIi8+XG4gICAgPHBhdGggZD1cIk01MzcgMzQ0IGMtNCAtNCAtNyAtMjUgLTcgLTQ2IGwwIC0zOCA0NiAwIDQ1IDAgLTMgNDMgYy0zIDQwIC00IDQyXG4gICAgLTM4IDQ1IC0yMCAyIC0zOSAwIC00MyAtNHpcIi8+XG4gICAgPHBhdGggZD1cIk03MTQgMzQxIGMtMiAtMiAtNCAtMjIgLTQgLTQzIGwwIC0zOCAyMjUgMCAyMjUgMCAwIDQ1IDAgNDYgLTIyMSAtM1xuICAgIGMtMTIxIC0yIC0yMjIgLTUgLTIyNSAtN3pcIi8+XG4gICAgPHBhdGggZD1cIk0zMDQgMjA1IGMwIC02NiAxIC05MiAzIC01NyAyIDM0IDIgODggMCAxMjAgLTIgMzEgLTMgMyAtMyAtNjN6XCIvPlxuICAgIDwvZz5cbiAgICA8L3N2Zz5gLFxuICBwYWdlX3doaXRlOiAoKSA9PlxuICAgIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNi4wMDAwMDBwdFwiIGhlaWdodD1cIjE2LjAwMDAwMHB0XCIgdmlld0JveD1cIjAgMCA0OC4wMDAwMDAgNDguMDAwMDAwXCJcbiAgICBwcmVzZXJ2ZUFzcGVjdFJhdGlvPVwieE1pZFlNaWQgbWVldFwiPlxuICAgIDxnIHRyYW5zZm9ybT1cInRyYW5zbGF0ZSgwLjAwMDAwMCw0OC4wMDAwMDApIHNjYWxlKDAuMTAwMDAwLC0wLjEwMDAwMClcIlxuICAgIGZpbGw9XCIjMDAwMDAwXCIgc3Ryb2tlPVwibm9uZVwiPlxuICAgIDxwYXRoIGQ9XCJNMjAgMjQwIGMxIC0yMDIgMyAtMjQwIDE2IC0yNDAgMTIgMCAxNCAzOCAxNCAyNDAgMCAyMDggLTIgMjQwIC0xNVxuICAgIDI0MCAtMTMgMCAtMTUgLTMxIC0xNSAtMjQwelwiLz5cbiAgICA8cGF0aCBkPVwiTTc1IDQ3MSBjLTQgLTggMzIgLTExIDExOSAtMTEgbDEyNiAwIDAgLTUwIDAgLTUwIDUwIDAgYzI4IDAgNTAgNVxuICAgIDUwIDEwIDAgNiAtMTggMTAgLTQwIDEwIGwtNDAgMCAwIDQyIDAgNDIgNDMgLTM5IDQyIC00MCAtNDMgNDUgLTQyIDQ1IC0xMjkgM1xuICAgIGMtODUgMiAtMTMxIDAgLTEzNiAtN3pcIi8+XG4gICAgPHBhdGggZD1cIk0zOTggNDM3IGw0MiAtNDMgMCAtMTk3IGMwIC0xNjggMiAtMTk3IDE1IC0xOTcgMTMgMCAxNSAyOSAxNSAxOThcbiAgICBsMCAxOTggLTM2IDQyIGMtMjEgMjUgLTQ0IDQyIC01NyA0MiAtMTggMCAtMTYgLTYgMjEgLTQzelwiLz5cbiAgICA8cGF0aCBkPVwiTTkyIDM1MyBsMiAtODggMyA3OCA0IDc3IDg5IDAgODkgMCA4IC00MiBjOCAtNDMgOSAtNDMgNTUgLTQ2IDQ0IC0zXG4gICAgNDcgLTUgNTEgLTM1IDQgLTMxIDQgLTMxIDUgNiBsMiAzNyAtNTAgMCAtNTAgMCAwIDUwIDAgNTAgLTEwNSAwIC0xMDUgMCAyXG4gICAgLTg3elwiLz5cbiAgICA8cGF0aCBkPVwiTTc1IDEwIGM4IC0xMyAzMzIgLTEzIDM0MCAwIDQgNyAtNTUgMTAgLTE3MCAxMCAtMTE1IDAgLTE3NCAtMyAtMTcwXG4gICAgLTEwelwiLz5cbiAgICA8L2c+XG4gICAgPC9zdmc+YFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4uL1BsdWdpbicpXG5cbmNvbnN0IFByb3ZpZGVyID0gcmVxdWlyZSgnLi4vLi4vdXBweS1iYXNlL3NyYy9wbHVnaW5zL1Byb3ZpZGVyJylcblxuY29uc3QgVmlldyA9IHJlcXVpcmUoJy4uLy4uL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvaW5kZXgnKVxuY29uc3QgaWNvbnMgPSByZXF1aXJlKCcuL2ljb25zJylcblxubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBEcm9wYm94IGV4dGVuZHMgUGx1Z2luIHtcbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICBzdXBlcihjb3JlLCBvcHRzKVxuICAgIHRoaXMudHlwZSA9ICdhY3F1aXJlcidcbiAgICB0aGlzLmlkID0gJ0Ryb3Bib3gnXG4gICAgdGhpcy50aXRsZSA9ICdEcm9wYm94J1xuICAgIHRoaXMuc3RhdGVJZCA9ICdkcm9wYm94J1xuICAgIHRoaXMuaWNvbiA9ICgpID0+IGh0bWxgXG4gICAgICA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjEyOFwiIGhlaWdodD1cIjExOFwiIHZpZXdCb3g9XCIwIDAgMTI4IDExOFwiPlxuICAgICAgICA8cGF0aCBkPVwiTTM4LjE0NS43NzdMMS4xMDggMjQuOTZsMjUuNjA4IDIwLjUwNyAzNy4zNDQtMjMuMDZ6XCIvPlxuICAgICAgICA8cGF0aCBkPVwiTTEuMTA4IDY1Ljk3NWwzNy4wMzcgMjQuMTgzTDY0LjA2IDY4LjUyNWwtMzcuMzQzLTIzLjA2ek02NC4wNiA2OC41MjVsMjUuOTE3IDIxLjYzMyAzNy4wMzYtMjQuMTgzLTI1LjYxLTIwLjUxelwiLz5cbiAgICAgICAgPHBhdGggZD1cIk0xMjcuMDE0IDI0Ljk2TDg5Ljk3Ny43NzYgNjQuMDYgMjIuNDA3bDM3LjM0NSAyMy4wNnpNNjQuMTM2IDczLjE4bC0yNS45OSAyMS41NjctMTEuMTIyLTcuMjYydjguMTQybDM3LjExMiAyMi4yNTYgMzcuMTE0LTIyLjI1NnYtOC4xNDJsLTExLjEyIDcuMjYyelwiLz5cbiAgICAgIDwvc3ZnPlxuICAgIGBcblxuICAgIC8vIHdyaXRpbmcgb3V0IHRoZSBrZXkgZXhwbGljaXRseSBmb3IgcmVhZGFiaWxpdHkgdGhlIGtleSB1c2VkIHRvIHN0b3JlXG4gICAgLy8gdGhlIHByb3ZpZGVyIGluc3RhbmNlIG11c3QgYmUgZXF1YWwgdG8gdGhpcy5pZC5cbiAgICB0aGlzLkRyb3Bib3ggPSBuZXcgUHJvdmlkZXIoe1xuICAgICAgaG9zdDogdGhpcy5vcHRzLmhvc3QsXG4gICAgICBwcm92aWRlcjogJ2Ryb3Bib3gnXG4gICAgfSlcblxuICAgIHRoaXMuZmlsZXMgPSBbXVxuXG4gICAgdGhpcy5vbkF1dGggPSB0aGlzLm9uQXV0aC5iaW5kKHRoaXMpXG4gICAgLy8gVmlzdWFsXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG5cbiAgICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7fVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcbiAgfVxuXG4gIGluc3RhbGwgKCkge1xuICAgIHRoaXMudmlldyA9IG5ldyBWaWV3KHRoaXMpXG4gICAgLy8gU2V0IGRlZmF1bHQgc3RhdGVcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgLy8gd3JpdGluZyBvdXQgdGhlIGtleSBleHBsaWNpdGx5IGZvciByZWFkYWJpbGl0eSB0aGUga2V5IHVzZWQgdG8gc3RvcmVcbiAgICAgIC8vIHRoZSBwbHVnaW4gc3RhdGUgbXVzdCBiZSBlcXVhbCB0byB0aGlzLnN0YXRlSWQuXG4gICAgICBkcm9wYm94OiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGZhbHNlLFxuICAgICAgICBmaWxlczogW10sXG4gICAgICAgIGZvbGRlcnM6IFtdLFxuICAgICAgICBkaXJlY3RvcmllczogW10sXG4gICAgICAgIGFjdGl2ZVJvdzogLTEsXG4gICAgICAgIGZpbHRlcklucHV0OiAnJ1xuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLm9wdHMudGFyZ2V0XG4gICAgY29uc3QgcGx1Z2luID0gdGhpc1xuICAgIHRoaXMudGFyZ2V0ID0gdGhpcy5tb3VudCh0YXJnZXQsIHBsdWdpbilcblxuICAgIHRoaXNbdGhpcy5pZF0uYXV0aCgpLnRoZW4odGhpcy5vbkF1dGgpLmNhdGNoKHRoaXMudmlldy5oYW5kbGVFcnJvcilcblxuICAgIHJldHVyblxuICB9XG5cbiAgdW5pbnN0YWxsICgpIHtcbiAgICB0aGlzLnVubW91bnQoKVxuICB9XG5cbiAgb25BdXRoIChhdXRoZW50aWNhdGVkKSB7XG4gICAgdGhpcy52aWV3LnVwZGF0ZVN0YXRlKHthdXRoZW50aWNhdGVkfSlcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgdGhpcy52aWV3LmdldEZvbGRlcigpXG4gICAgfVxuICB9XG5cbiAgaXNGb2xkZXIgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5pc19kaXJcbiAgfVxuXG4gIGdldEl0ZW1EYXRhIChpdGVtKSB7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIGl0ZW0sIHtzaXplOiBpdGVtLmJ5dGVzfSlcbiAgfVxuXG4gIGdldEl0ZW1JY29uIChpdGVtKSB7XG4gICAgdmFyIGljb24gPSBpY29uc1tpdGVtLmljb25dXG5cbiAgICBpZiAoIWljb24pIHtcbiAgICAgIGlmIChpdGVtLmljb24uc3RhcnRzV2l0aCgnZm9sZGVyJykpIHtcbiAgICAgICAgaWNvbiA9IGljb25zWydmb2xkZXInXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWNvbiA9IGljb25zWydwYWdlX3doaXRlJ11cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGljb24oKVxuICB9XG5cbiAgZ2V0SXRlbVN1Ykxpc3QgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5jb250ZW50c1xuICB9XG5cbiAgZ2V0SXRlbU5hbWUgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5wYXRoLmxlbmd0aCA+IDEgPyBpdGVtLnBhdGguc3Vic3RyaW5nKDEpIDogaXRlbS5wYXRoXG4gIH1cblxuICBnZXRNaW1lVHlwZSAoaXRlbSkge1xuICAgIHJldHVybiBpdGVtLm1pbWVfdHlwZVxuICB9XG5cbiAgZ2V0SXRlbUlkIChpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0ucmV2XG4gIH1cblxuICBnZXRJdGVtUmVxdWVzdFBhdGggKGl0ZW0pIHtcbiAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuZ2V0SXRlbU5hbWUoaXRlbSkpXG4gIH1cblxuICBnZXRJdGVtTW9kaWZpZWREYXRlIChpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0ubW9kaWZpZWRcbiAgfVxuXG4gIHJlbmRlciAoc3RhdGUpIHtcbiAgICByZXR1cm4gdGhpcy52aWV3LnJlbmRlcihzdGF0ZSlcbiAgfVxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4uL1BsdWdpbicpXG5cbmNvbnN0IFByb3ZpZGVyID0gcmVxdWlyZSgnLi4vLi4vdXBweS1iYXNlL3NyYy9wbHVnaW5zL1Byb3ZpZGVyJylcblxuY29uc3QgVmlldyA9IHJlcXVpcmUoJy4uLy4uL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvaW5kZXgnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIEdvb2dsZSBleHRlbmRzIFBsdWdpbiB7XG4gIGNvbnN0cnVjdG9yIChjb3JlLCBvcHRzKSB7XG4gICAgc3VwZXIoY29yZSwgb3B0cylcbiAgICB0aGlzLnR5cGUgPSAnYWNxdWlyZXInXG4gICAgdGhpcy5pZCA9ICdHb29nbGVEcml2ZSdcbiAgICB0aGlzLnRpdGxlID0gJ0dvb2dsZSBEcml2ZSdcbiAgICB0aGlzLnN0YXRlSWQgPSAnZ29vZ2xlRHJpdmUnXG4gICAgdGhpcy5pY29uID0gKCkgPT4gaHRtbGBcbiAgICAgIDxzdmcgY2xhc3M9XCJVcHB5SWNvbiBVcHB5TW9kYWxUYWItaWNvblwiIHdpZHRoPVwiMjhcIiBoZWlnaHQ9XCIyOFwiIHZpZXdCb3g9XCIwIDAgMTYgMTZcIj5cbiAgICAgICAgPHBhdGggZD1cIk0yLjk1NSAxNC45M2wyLjY2Ny00LjYySDE2bC0yLjY2NyA0LjYySDIuOTU1em0yLjM3OC00LjYybC0yLjY2NiA0LjYyTDAgMTAuMzFsNS4xOS04Ljk5IDIuNjY2IDQuNjItMi41MjMgNC4zN3ptMTAuNTIzLS4yNWgtNS4zMzNsLTUuMTktOC45OWg1LjMzNGw1LjE5IDguOTl6XCIvPlxuICAgICAgPC9zdmc+XG4gICAgYFxuXG4gICAgLy8gd3JpdGluZyBvdXQgdGhlIGtleSBleHBsaWNpdGx5IGZvciByZWFkYWJpbGl0eSB0aGUga2V5IHVzZWQgdG8gc3RvcmVcbiAgICAvLyB0aGUgcHJvdmlkZXIgaW5zdGFuY2UgbXVzdCBiZSBlcXVhbCB0byB0aGlzLmlkLlxuICAgIHRoaXMuR29vZ2xlRHJpdmUgPSBuZXcgUHJvdmlkZXIoe1xuICAgICAgaG9zdDogdGhpcy5vcHRzLmhvc3QsXG4gICAgICBwcm92aWRlcjogJ2RyaXZlJyxcbiAgICAgIGF1dGhQcm92aWRlcjogJ2dvb2dsZSdcbiAgICB9KVxuXG4gICAgdGhpcy5maWxlcyA9IFtdXG5cbiAgICB0aGlzLm9uQXV0aCA9IHRoaXMub25BdXRoLmJpbmQodGhpcylcbiAgICAvLyBWaXN1YWxcbiAgICB0aGlzLnJlbmRlciA9IHRoaXMucmVuZGVyLmJpbmQodGhpcylcblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHt9XG5cbiAgICAvLyBtZXJnZSBkZWZhdWx0IG9wdGlvbnMgd2l0aCB0aGUgb25lcyBzZXQgYnkgdXNlclxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuICB9XG5cbiAgaW5zdGFsbCAoKSB7XG4gICAgdGhpcy52aWV3ID0gbmV3IFZpZXcodGhpcylcbiAgICAvLyBTZXQgZGVmYXVsdCBzdGF0ZSBmb3IgR29vZ2xlIERyaXZlXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgIC8vIHdyaXRpbmcgb3V0IHRoZSBrZXkgZXhwbGljaXRseSBmb3IgcmVhZGFiaWxpdHkgdGhlIGtleSB1c2VkIHRvIHN0b3JlXG4gICAgICAvLyB0aGUgcGx1Z2luIHN0YXRlIG11c3QgYmUgZXF1YWwgdG8gdGhpcy5zdGF0ZUlkLlxuICAgICAgZ29vZ2xlRHJpdmU6IHtcbiAgICAgICAgYXV0aGVudGljYXRlZDogZmFsc2UsXG4gICAgICAgIGZpbGVzOiBbXSxcbiAgICAgICAgZm9sZGVyczogW10sXG4gICAgICAgIGRpcmVjdG9yaWVzOiBbXSxcbiAgICAgICAgYWN0aXZlUm93OiAtMSxcbiAgICAgICAgZmlsdGVySW5wdXQ6ICcnXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMub3B0cy50YXJnZXRcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzXG4gICAgdGhpcy50YXJnZXQgPSB0aGlzLm1vdW50KHRhcmdldCwgcGx1Z2luKVxuXG4gICAgLy8gY2F0Y2ggZXJyb3IgaGVyZS5cbiAgICB0aGlzW3RoaXMuaWRdLmF1dGgoKS50aGVuKHRoaXMub25BdXRoKS5jYXRjaCh0aGlzLnZpZXcuaGFuZGxlRXJyb3IpXG4gICAgcmV0dXJuXG4gIH1cblxuICB1bmluc3RhbGwgKCkge1xuICAgIHRoaXMudW5tb3VudCgpXG4gIH1cblxuICBvbkF1dGggKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICB0aGlzLnZpZXcudXBkYXRlU3RhdGUoe2F1dGhlbnRpY2F0ZWR9KVxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICB0aGlzLnZpZXcuZ2V0Rm9sZGVyKCdyb290JylcbiAgICB9XG4gIH1cblxuICBpc0ZvbGRlciAoaXRlbSkge1xuICAgIHJldHVybiBpdGVtLm1pbWVUeXBlID09PSAnYXBwbGljYXRpb24vdm5kLmdvb2dsZS1hcHBzLmZvbGRlcidcbiAgfVxuXG4gIGdldEl0ZW1EYXRhIChpdGVtKSB7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIGl0ZW0sIHtzaXplOiBwYXJzZUZsb2F0KGl0ZW0uZmlsZVNpemUpfSlcbiAgfVxuXG4gIGdldEl0ZW1JY29uIChpdGVtKSB7XG4gICAgcmV0dXJuIGh0bWxgPGltZyBzcmM9JHtpdGVtLmljb25MaW5rfS8+YFxuICB9XG5cbiAgZ2V0SXRlbVN1Ykxpc3QgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5pdGVtc1xuICB9XG5cbiAgZ2V0SXRlbU5hbWUgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS50aXRsZSA/IGl0ZW0udGl0bGUgOiAnLydcbiAgfVxuXG4gIGdldE1pbWVUeXBlIChpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0ubWltZVR5cGVcbiAgfVxuXG4gIGdldEl0ZW1JZCAoaXRlbSkge1xuICAgIHJldHVybiBpdGVtLmlkXG4gIH1cblxuICBnZXRJdGVtUmVxdWVzdFBhdGggKGl0ZW0pIHtcbiAgICByZXR1cm4gdGhpcy5nZXRJdGVtSWQoaXRlbSlcbiAgfVxuXG4gIGdldEl0ZW1Nb2RpZmllZERhdGUgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5tb2RpZmllZEJ5TWVEYXRlXG4gIH1cblxuICByZW5kZXIgKHN0YXRlKSB7XG4gICAgcmV0dXJuIHRoaXMudmlldy5yZW5kZXIoc3RhdGUpXG4gIH1cbn1cbiIsImNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4vUGx1Z2luJylcbmNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbi8qKlxuICogSW5mb3JtZXJcbiAqIFNob3dzIHJhZCBtZXNzYWdlIGJ1YmJsZXNcbiAqIHVzZWQgbGlrZSB0aGlzOiBgYnVzLmVtaXQoJ2luZm9ybWVyJywgJ2hlbGxvIHdvcmxkJywgJ2luZm8nLCA1MDAwKWBcbiAqIG9yIGZvciBlcnJvcnM6IGBidXMuZW1pdCgnaW5mb3JtZXInLCAnRXJyb3IgdXBsb2FkaW5nIGltZy5qcGcnLCAnZXJyb3InLCA1MDAwKWBcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgSW5mb3JtZXIgZXh0ZW5kcyBQbHVnaW4ge1xuICBjb25zdHJ1Y3RvciAoY29yZSwgb3B0cykge1xuICAgIHN1cGVyKGNvcmUsIG9wdHMpXG4gICAgdGhpcy50eXBlID0gJ3Byb2dyZXNzaW5kaWNhdG9yJ1xuICAgIHRoaXMuaWQgPSAnSW5mb3JtZXInXG4gICAgdGhpcy50aXRsZSA9ICdJbmZvcm1lcidcbiAgICB0aGlzLnRpbWVvdXRJRCA9IHVuZGVmaW5lZFxuXG4gICAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgdHlwZUNvbG9yczoge1xuICAgICAgICBpbmZvOiB7XG4gICAgICAgICAgdGV4dDogJyNmZmYnLFxuICAgICAgICAgIGJnOiAnIzAwMCdcbiAgICAgICAgfSxcbiAgICAgICAgd2FybmluZzoge1xuICAgICAgICAgIHRleHQ6ICcjZmZmJyxcbiAgICAgICAgICBiZzogJyNGNkE2MjMnXG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yOiB7XG4gICAgICAgICAgdGV4dDogJyNmZmYnLFxuICAgICAgICAgIGJnOiAnI2U3NGMzYydcbiAgICAgICAgfSxcbiAgICAgICAgc3VjY2Vzczoge1xuICAgICAgICAgIHRleHQ6ICcjZmZmJyxcbiAgICAgICAgICBiZzogJyM3YWM4MjQnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBtZXJnZSBkZWZhdWx0IG9wdGlvbnMgd2l0aCB0aGUgb25lcyBzZXQgYnkgdXNlclxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG4gIH1cblxuICBzaG93SW5mb3JtZXIgKG1zZywgdHlwZSwgZHVyYXRpb24pIHtcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgaW5mb3JtZXI6IHtcbiAgICAgICAgaXNIaWRkZW46IGZhbHNlLFxuICAgICAgICB0eXBlOiB0eXBlLFxuICAgICAgICBtc2c6IG1zZ1xuICAgICAgfVxuICAgIH0pXG5cbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMudGltZW91dElEKVxuICAgIGlmIChkdXJhdGlvbiA9PT0gMCkge1xuICAgICAgdGhpcy50aW1lb3V0SUQgPSB1bmRlZmluZWRcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIGhpZGUgdGhlIGluZm9ybWVyIGFmdGVyIGBkdXJhdGlvbmAgbWlsbGlzZWNvbmRzXG4gICAgdGhpcy50aW1lb3V0SUQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnN0IG5ld0luZm9ybWVyID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb3JlLmdldFN0YXRlKCkuaW5mb3JtZXIsIHtcbiAgICAgICAgaXNIaWRkZW46IHRydWVcbiAgICAgIH0pXG4gICAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgICBpbmZvcm1lcjogbmV3SW5mb3JtZXJcbiAgICAgIH0pXG4gICAgfSwgZHVyYXRpb24pXG4gIH1cblxuICBoaWRlSW5mb3JtZXIgKCkge1xuICAgIGNvbnN0IG5ld0luZm9ybWVyID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb3JlLmdldFN0YXRlKCkuaW5mb3JtZXIsIHtcbiAgICAgIGlzSGlkZGVuOiB0cnVlXG4gICAgfSlcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgaW5mb3JtZXI6IG5ld0luZm9ybWVyXG4gICAgfSlcbiAgfVxuXG4gIHJlbmRlciAoc3RhdGUpIHtcbiAgICBjb25zdCBpc0hpZGRlbiA9IHN0YXRlLmluZm9ybWVyLmlzSGlkZGVuXG4gICAgY29uc3QgbXNnID0gc3RhdGUuaW5mb3JtZXIubXNnXG4gICAgY29uc3QgdHlwZSA9IHN0YXRlLmluZm9ybWVyLnR5cGUgfHwgJ2luZm8nXG4gICAgY29uc3Qgc3R5bGUgPSBgYmFja2dyb3VuZC1jb2xvcjogJHt0aGlzLm9wdHMudHlwZUNvbG9yc1t0eXBlXS5iZ307IGNvbG9yOiAke3RoaXMub3B0cy50eXBlQ29sb3JzW3R5cGVdLnRleHR9O2BcblxuICAgIC8vIEBUT0RPIGFkZCBhcmlhLWxpdmUgZm9yIHNjcmVlbi1yZWFkZXJzXG4gICAgcmV0dXJuIGh0bWxgPGRpdiBjbGFzcz1cIlVwcHkgVXBweVRoZW1lLS1kZWZhdWx0IFVwcHlJbmZvcm1lclwiIHN0eWxlPVwiJHtzdHlsZX1cIiBhcmlhLWhpZGRlbj1cIiR7aXNIaWRkZW59XCI+XG4gICAgICA8cD4ke21zZ308L3A+XG4gICAgPC9kaXY+YFxuICB9XG5cbiAgaW5zdGFsbCAoKSB7XG4gICAgLy8gU2V0IGRlZmF1bHQgc3RhdGUgZm9yIEdvb2dsZSBEcml2ZVxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBpbmZvcm1lcjoge1xuICAgICAgICBpc0hpZGRlbjogdHJ1ZSxcbiAgICAgICAgdHlwZTogJycsXG4gICAgICAgIG1zZzogJydcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgdGhpcy5jb3JlLm9uKCdpbmZvcm1lcicsIChtc2csIHR5cGUsIGR1cmF0aW9uKSA9PiB7XG4gICAgICB0aGlzLnNob3dJbmZvcm1lcihtc2csIHR5cGUsIGR1cmF0aW9uKVxuICAgIH0pXG5cbiAgICB0aGlzLmNvcmUub24oJ2luZm9ybWVyOmhpZGUnLCAoKSA9PiB7XG4gICAgICB0aGlzLmhpZGVJbmZvcm1lcigpXG4gICAgfSlcblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMub3B0cy50YXJnZXRcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzXG4gICAgdGhpcy50YXJnZXQgPSB0aGlzLm1vdW50KHRhcmdldCwgcGx1Z2luKVxuICB9XG5cbiAgdW5pbnN0YWxsICgpIHtcbiAgICB0aGlzLnVubW91bnQoKVxuICB9XG59XG4iLCJjb25zdCBQbHVnaW4gPSByZXF1aXJlKCcuL1BsdWdpbicpXG5cbi8qKlxuICogTWV0YSBEYXRhXG4gKiBBZGRzIG1ldGFkYXRhIGZpZWxkcyB0byBVcHB5XG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIE1ldGFEYXRhIGV4dGVuZHMgUGx1Z2luIHtcbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICBzdXBlcihjb3JlLCBvcHRzKVxuICAgIHRoaXMudHlwZSA9ICdtb2RpZmllcidcbiAgICB0aGlzLmlkID0gJ01ldGFEYXRhJ1xuICAgIHRoaXMudGl0bGUgPSAnTWV0YSBEYXRhJ1xuXG4gICAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zID0ge31cblxuICAgIC8vIG1lcmdlIGRlZmF1bHQgb3B0aW9ucyB3aXRoIHRoZSBvbmVzIHNldCBieSB1c2VyXG4gICAgdGhpcy5vcHRzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdE9wdGlvbnMsIG9wdHMpXG5cbiAgICB0aGlzLmhhbmRsZUZpbGVBZGRlZCA9IHRoaXMuaGFuZGxlRmlsZUFkZGVkLmJpbmQodGhpcylcbiAgfVxuXG4gIGhhbmRsZUZpbGVBZGRlZCAoZmlsZUlEKSB7XG4gICAgY29uc3QgbWV0YUZpZWxkcyA9IHRoaXMub3B0cy5maWVsZHNcblxuICAgIG1ldGFGaWVsZHMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgY29uc3Qgb2JqID0ge31cbiAgICAgIG9ialtpdGVtLmlkXSA9IGl0ZW0udmFsdWVcbiAgICAgIHRoaXMuY29yZS51cGRhdGVNZXRhKG9iaiwgZmlsZUlEKVxuICAgIH0pXG4gIH1cblxuICBhZGRJbml0aWFsTWV0YSAoKSB7XG4gICAgY29uc3QgbWV0YUZpZWxkcyA9IHRoaXMub3B0cy5maWVsZHNcblxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBtZXRhRmllbGRzOiBtZXRhRmllbGRzXG4gICAgfSlcblxuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdmaWxlLWFkZGVkJywgdGhpcy5oYW5kbGVGaWxlQWRkZWQpXG4gIH1cblxuICBpbnN0YWxsICgpIHtcbiAgICB0aGlzLmFkZEluaXRpYWxNZXRhKClcbiAgfVxuXG4gIHVuaW5zdGFsbCAoKSB7XG4gICAgdGhpcy5jb3JlLmVtaXR0ZXIub2ZmKCdmaWxlLWFkZGVkJywgdGhpcy5oYW5kbGVGaWxlQWRkZWQpXG4gIH1cbn1cbiIsImNvbnN0IHlvID0gcmVxdWlyZSgneW8teW8nKVxuLy8gY29uc3QgbmFub3JhZiA9IHJlcXVpcmUoJ25hbm9yYWYnKVxuY29uc3QgeyBmaW5kRE9NRWxlbWVudCB9ID0gcmVxdWlyZSgnLi4vY29yZS9VdGlscycpXG5cbi8qKlxuICogQm9pbGVycGxhdGUgdGhhdCBhbGwgUGx1Z2lucyBzaGFyZSAtIGFuZCBzaG91bGQgbm90IGJlIHVzZWRcbiAqIGRpcmVjdGx5LiBJdCBhbHNvIHNob3dzIHdoaWNoIG1ldGhvZHMgZmluYWwgcGx1Z2lucyBzaG91bGQgaW1wbGVtZW50L292ZXJyaWRlLFxuICogdGhpcyBkZWNpZGluZyBvbiBzdHJ1Y3R1cmUuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IG1haW4gVXBweSBjb3JlIG9iamVjdFxuICogQHBhcmFtIHtvYmplY3R9IG9iamVjdCB3aXRoIHBsdWdpbiBvcHRpb25zXG4gKiBAcmV0dXJuIHthcnJheSB8IHN0cmluZ30gZmlsZXMgb3Igc3VjY2Vzcy9mYWlsIG1lc3NhZ2VcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBQbHVnaW4ge1xuXG4gIGNvbnN0cnVjdG9yIChjb3JlLCBvcHRzKSB7XG4gICAgdGhpcy5jb3JlID0gY29yZVxuICAgIHRoaXMub3B0cyA9IG9wdHMgfHwge31cbiAgICB0aGlzLnR5cGUgPSAnbm9uZSdcblxuICAgIC8vIGNsZWFyIGV2ZXJ5dGhpbmcgaW5zaWRlIHRoZSB0YXJnZXQgc2VsZWN0b3JcbiAgICB0aGlzLm9wdHMucmVwbGFjZVRhcmdldENvbnRlbnQgPT09IHRoaXMub3B0cy5yZXBsYWNlVGFyZ2V0Q29udGVudCB8fCB0cnVlXG5cbiAgICB0aGlzLnVwZGF0ZSA9IHRoaXMudXBkYXRlLmJpbmQodGhpcylcbiAgICB0aGlzLm1vdW50ID0gdGhpcy5tb3VudC5iaW5kKHRoaXMpXG4gICAgdGhpcy5mb2N1cyA9IHRoaXMuZm9jdXMuYmluZCh0aGlzKVxuICAgIHRoaXMuaW5zdGFsbCA9IHRoaXMuaW5zdGFsbC5iaW5kKHRoaXMpXG4gICAgdGhpcy51bmluc3RhbGwgPSB0aGlzLnVuaW5zdGFsbC5iaW5kKHRoaXMpXG5cbiAgICAvLyB0aGlzLmZyYW1lID0gbnVsbFxuICB9XG5cbiAgdXBkYXRlIChzdGF0ZSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5lbCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIGNvbnN0IHByZXYgPSB7fVxuICAgIC8vIGlmICghdGhpcy5mcmFtZSkge1xuICAgIC8vICAgY29uc29sZS5sb2coJ2NyZWF0aW5nIGZyYW1lJylcbiAgICAvLyAgIHRoaXMuZnJhbWUgPSBuYW5vcmFmKChzdGF0ZSwgcHJldikgPT4ge1xuICAgIC8vICAgICBjb25zb2xlLmxvZygndXBkYXRpbmchJywgRGF0ZS5ub3coKSlcbiAgICAvLyAgICAgY29uc3QgbmV3RWwgPSB0aGlzLnJlbmRlcihzdGF0ZSlcbiAgICAvLyAgICAgdGhpcy5lbCA9IHlvLnVwZGF0ZSh0aGlzLmVsLCBuZXdFbClcbiAgICAvLyAgIH0pXG4gICAgLy8gfVxuICAgIC8vIGNvbnNvbGUubG9nKCdhdHRlbXB0aW5nIGFuIHVwZGF0ZS4uLicsIERhdGUubm93KCkpXG4gICAgLy8gdGhpcy5mcmFtZShzdGF0ZSwgcHJldilcblxuICAgIC8vIHRoaXMuY29yZS5sb2coJ3VwZGF0ZSBudW1iZXI6ICcgKyB0aGlzLmNvcmUudXBkYXRlTnVtKyspXG5cbiAgICBjb25zdCBuZXdFbCA9IHRoaXMucmVuZGVyKHN0YXRlKVxuICAgIHlvLnVwZGF0ZSh0aGlzLmVsLCBuZXdFbClcblxuICAgIC8vIG9wdGltaXplcyBwZXJmb3JtYW5jZT9cbiAgICAvLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgIC8vICAgY29uc3QgbmV3RWwgPSB0aGlzLnJlbmRlcihzdGF0ZSlcbiAgICAvLyAgIHlvLnVwZGF0ZSh0aGlzLmVsLCBuZXdFbClcbiAgICAvLyB9KVxuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIHN1cHBsaWVkIGB0YXJnZXRgIGlzIGEgRE9NIGVsZW1lbnQgb3IgYW4gYG9iamVjdGAuXG4gICAqIElmIGl04oCZcyBhbiBvYmplY3Qg4oCUIHRhcmdldCBpcyBhIHBsdWdpbiwgYW5kIHdlIHNlYXJjaCBgcGx1Z2luc2BcbiAgICogZm9yIGEgcGx1Z2luIHdpdGggc2FtZSBuYW1lIGFuZCByZXR1cm4gaXRzIHRhcmdldC5cbiAgICpcbiAgICogQHBhcmFtIHtTdHJpbmd8T2JqZWN0fSB0YXJnZXRcbiAgICpcbiAgICovXG4gIG1vdW50ICh0YXJnZXQsIHBsdWdpbikge1xuICAgIGNvbnN0IGNhbGxlclBsdWdpbk5hbWUgPSBwbHVnaW4uaWRcblxuICAgIGNvbnN0IHRhcmdldEVsZW1lbnQgPSBmaW5kRE9NRWxlbWVudCh0YXJnZXQpXG5cbiAgICBpZiAodGFyZ2V0RWxlbWVudCkge1xuICAgICAgdGhpcy5jb3JlLmxvZyhgSW5zdGFsbGluZyAke2NhbGxlclBsdWdpbk5hbWV9IHRvIGEgRE9NIGVsZW1lbnRgKVxuXG4gICAgICAvLyBjbGVhciBldmVyeXRoaW5nIGluc2lkZSB0aGUgdGFyZ2V0IGNvbnRhaW5lclxuICAgICAgaWYgKHRoaXMub3B0cy5yZXBsYWNlVGFyZ2V0Q29udGVudCkge1xuICAgICAgICB0YXJnZXRFbGVtZW50LmlubmVySFRNTCA9ICcnXG4gICAgICB9XG5cbiAgICAgIHRoaXMuZWwgPSBwbHVnaW4ucmVuZGVyKHRoaXMuY29yZS5zdGF0ZSlcbiAgICAgIHRhcmdldEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5lbClcblxuICAgICAgcmV0dXJuIHRhcmdldEVsZW1lbnRcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVE9ETzogaXMgaW5zdGFudGlhdGluZyB0aGUgcGx1Z2luIHJlYWxseSB0aGUgd2F5IHRvIHJvbGxcbiAgICAgIC8vIGp1c3QgdG8gZ2V0IHRoZSBwbHVnaW4gbmFtZT9cbiAgICAgIGNvbnN0IFRhcmdldCA9IHRhcmdldFxuICAgICAgY29uc3QgdGFyZ2V0UGx1Z2luTmFtZSA9IG5ldyBUYXJnZXQoKS5pZFxuXG4gICAgICB0aGlzLmNvcmUubG9nKGBJbnN0YWxsaW5nICR7Y2FsbGVyUGx1Z2luTmFtZX0gdG8gJHt0YXJnZXRQbHVnaW5OYW1lfWApXG5cbiAgICAgIGNvbnN0IHRhcmdldFBsdWdpbiA9IHRoaXMuY29yZS5nZXRQbHVnaW4odGFyZ2V0UGx1Z2luTmFtZSlcbiAgICAgIGNvbnN0IHNlbGVjdG9yVGFyZ2V0ID0gdGFyZ2V0UGx1Z2luLmFkZFRhcmdldChwbHVnaW4pXG5cbiAgICAgIHJldHVybiBzZWxlY3RvclRhcmdldFxuICAgIH1cbiAgfVxuXG4gIHVubW91bnQgKCkge1xuICAgIGlmICh0aGlzLmVsICYmIHRoaXMuZWwucGFyZW50Tm9kZSkge1xuICAgICAgdGhpcy5lbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuZWwpXG4gICAgfVxuICB9XG5cbiAgZm9jdXMgKCkge1xuICAgIHJldHVyblxuICB9XG5cbiAgaW5zdGFsbCAoKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICB1bmluc3RhbGwgKCkge1xuICAgIHJldHVyblxuICB9XG59XG4iLCJjb25zdCBQbHVnaW4gPSByZXF1aXJlKCcuL1BsdWdpbicpXG5jb25zdCB0dXMgPSByZXF1aXJlKCd0dXMtanMtY2xpZW50JylcbmNvbnN0IFVwcHlTb2NrZXQgPSByZXF1aXJlKCcuLi9jb3JlL1VwcHlTb2NrZXQnKVxuY29uc3QgdGhyb3R0bGUgPSByZXF1aXJlKCdsb2Rhc2gudGhyb3R0bGUnKVxucmVxdWlyZSgnd2hhdHdnLWZldGNoJylcblxuLy8gRXh0cmFjdGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL3R1cy90dXMtanMtY2xpZW50L2Jsb2IvbWFzdGVyL2xpYi91cGxvYWQuanMjTDEzXG4vLyBleGNlcHRlZCB3ZSByZW1vdmVkICdmaW5nZXJwcmludCcga2V5IHRvIGF2b2lkIGFkZGluZyBtb3JlIGRlcGVuZGVuY2llc1xuY29uc3QgdHVzRGVmYXVsdE9wdGlvbnMgPSB7XG4gIGVuZHBvaW50OiAnJyxcbiAgcmVzdW1lOiB0cnVlLFxuICBvblByb2dyZXNzOiBudWxsLFxuICBvbkNodW5rQ29tcGxldGU6IG51bGwsXG4gIG9uU3VjY2VzczogbnVsbCxcbiAgb25FcnJvcjogbnVsbCxcbiAgaGVhZGVyczoge30sXG4gIGNodW5rU2l6ZTogSW5maW5pdHksXG4gIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXG4gIHVwbG9hZFVybDogbnVsbCxcbiAgdXBsb2FkU2l6ZTogbnVsbCxcbiAgb3ZlcnJpZGVQYXRjaE1ldGhvZDogZmFsc2UsXG4gIHJldHJ5RGVsYXlzOiBudWxsXG59XG5cbi8qKlxuICogVHVzIHJlc3VtYWJsZSBmaWxlIHVwbG9hZGVyXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFR1czEwIGV4dGVuZHMgUGx1Z2luIHtcbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICBzdXBlcihjb3JlLCBvcHRzKVxuICAgIHRoaXMudHlwZSA9ICd1cGxvYWRlcidcbiAgICB0aGlzLmlkID0gJ1R1cydcbiAgICB0aGlzLnRpdGxlID0gJ1R1cydcblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIHJlc3VtZTogdHJ1ZSxcbiAgICAgIGFsbG93UGF1c2U6IHRydWUsXG4gICAgICBhdXRvUmV0cnk6IHRydWVcbiAgICB9XG5cbiAgICAvLyBtZXJnZSBkZWZhdWx0IG9wdGlvbnMgd2l0aCB0aGUgb25lcyBzZXQgYnkgdXNlclxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuXG4gICAgdGhpcy5oYW5kbGVQYXVzZUFsbCA9IHRoaXMuaGFuZGxlUGF1c2VBbGwuYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlUmVzdW1lQWxsID0gdGhpcy5oYW5kbGVSZXN1bWVBbGwuYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlVXBsb2FkID0gdGhpcy5oYW5kbGVVcGxvYWQuYmluZCh0aGlzKVxuICB9XG5cbiAgcGF1c2VSZXN1bWUgKGFjdGlvbiwgZmlsZUlEKSB7XG4gICAgY29uc3QgdXBkYXRlZEZpbGVzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb3JlLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgY29uc3QgaW5Qcm9ncmVzc1VwZGF0ZWRGaWxlcyA9IE9iamVjdC5rZXlzKHVwZGF0ZWRGaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICByZXR1cm4gIXVwZGF0ZWRGaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRDb21wbGV0ZSAmJlxuICAgICAgICAgICAgIHVwZGF0ZWRGaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRTdGFydGVkXG4gICAgfSlcblxuICAgIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgICBjYXNlICd0b2dnbGUnOlxuICAgICAgICBpZiAodXBkYXRlZEZpbGVzW2ZpbGVJRF0udXBsb2FkQ29tcGxldGUpIHJldHVyblxuXG4gICAgICAgIGNvbnN0IHdhc1BhdXNlZCA9IHVwZGF0ZWRGaWxlc1tmaWxlSURdLmlzUGF1c2VkIHx8IGZhbHNlXG4gICAgICAgIGNvbnN0IGlzUGF1c2VkID0gIXdhc1BhdXNlZFxuICAgICAgICBsZXQgdXBkYXRlZEZpbGVcbiAgICAgICAgaWYgKHdhc1BhdXNlZCkge1xuICAgICAgICAgIHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0sIHtcbiAgICAgICAgICAgIGlzUGF1c2VkOiBmYWxzZVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlZEZpbGUgPSBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXSwge1xuICAgICAgICAgICAgaXNQYXVzZWQ6IHRydWVcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZWRGaWxlc1tmaWxlSURdID0gdXBkYXRlZEZpbGVcbiAgICAgICAgdGhpcy5jb3JlLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgICAgICAgcmV0dXJuIGlzUGF1c2VkXG4gICAgICBjYXNlICdwYXVzZUFsbCc6XG4gICAgICAgIGluUHJvZ3Jlc3NVcGRhdGVkRmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVdLCB7XG4gICAgICAgICAgICBpc1BhdXNlZDogdHJ1ZVxuICAgICAgICAgIH0pXG4gICAgICAgICAgdXBkYXRlZEZpbGVzW2ZpbGVdID0gdXBkYXRlZEZpbGVcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5jb3JlLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgICAgICAgcmV0dXJuXG4gICAgICBjYXNlICdyZXN1bWVBbGwnOlxuICAgICAgICBpblByb2dyZXNzVXBkYXRlZEZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgICAgICBjb25zdCB1cGRhdGVkRmlsZSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlXSwge1xuICAgICAgICAgICAgaXNQYXVzZWQ6IGZhbHNlXG4gICAgICAgICAgfSlcbiAgICAgICAgICB1cGRhdGVkRmlsZXNbZmlsZV0gPSB1cGRhdGVkRmlsZVxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe2ZpbGVzOiB1cGRhdGVkRmlsZXN9KVxuICAgICAgICByZXR1cm5cbiAgICB9XG4gIH1cblxuICBoYW5kbGVQYXVzZUFsbCAoKSB7XG4gICAgdGhpcy5wYXVzZVJlc3VtZSgncGF1c2VBbGwnKVxuICB9XG5cbiAgaGFuZGxlUmVzdW1lQWxsICgpIHtcbiAgICB0aGlzLnBhdXNlUmVzdW1lKCdyZXN1bWVBbGwnKVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyBUdXMgdXBsb2FkXG4gICAqXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBmaWxlIGZvciB1c2Ugd2l0aCB1cGxvYWRcbiAgICogQHBhcmFtIHtpbnRlZ2VyfSBjdXJyZW50IGZpbGUgaW4gYSBxdWV1ZVxuICAgKiBAcGFyYW0ge2ludGVnZXJ9IHRvdGFsIG51bWJlciBvZiBmaWxlcyBpbiBhIHF1ZXVlXG4gICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgKi9cbiAgdXBsb2FkIChmaWxlLCBjdXJyZW50LCB0b3RhbCkge1xuICAgIHRoaXMuY29yZS5sb2coYHVwbG9hZGluZyAke2N1cnJlbnR9IG9mICR7dG90YWx9YClcblxuICAgIC8vIENyZWF0ZSBhIG5ldyB0dXMgdXBsb2FkXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IG9wdHNUdXMgPSBPYmplY3QuYXNzaWduKFxuICAgICAgICB7fSxcbiAgICAgICAgdHVzRGVmYXVsdE9wdGlvbnMsXG4gICAgICAgIHRoaXMub3B0cyxcbiAgICAgICAgLy8gSW5zdGFsbCBmaWxlLXNwZWNpZmljIHVwbG9hZCBvdmVycmlkZXMuXG4gICAgICAgIGZpbGUudHVzIHx8IHt9XG4gICAgICApXG5cbiAgICAgIG9wdHNUdXMub25FcnJvciA9IChlcnIpID0+IHtcbiAgICAgICAgdGhpcy5jb3JlLmxvZyhlcnIpXG4gICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6dXBsb2FkLWVycm9yJywgZmlsZS5pZCwgZXJyKVxuICAgICAgICByZWplY3QoJ0ZhaWxlZCBiZWNhdXNlOiAnICsgZXJyKVxuICAgICAgfVxuXG4gICAgICBvcHRzVHVzLm9uUHJvZ3Jlc3MgPSAoYnl0ZXNVcGxvYWRlZCwgYnl0ZXNUb3RhbCkgPT4ge1xuICAgICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1wcm9ncmVzcycsIHtcbiAgICAgICAgICB1cGxvYWRlcjogdGhpcyxcbiAgICAgICAgICBpZDogZmlsZS5pZCxcbiAgICAgICAgICBieXRlc1VwbG9hZGVkOiBieXRlc1VwbG9hZGVkLFxuICAgICAgICAgIGJ5dGVzVG90YWw6IGJ5dGVzVG90YWxcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgb3B0c1R1cy5vblN1Y2Nlc3MgPSAoKSA9PiB7XG4gICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6dXBsb2FkLXN1Y2Nlc3MnLCBmaWxlLmlkLCB1cGxvYWQsIHVwbG9hZC51cmwpXG5cbiAgICAgICAgaWYgKHVwbG9hZC51cmwpIHtcbiAgICAgICAgICB0aGlzLmNvcmUubG9nKCdEb3dubG9hZCAnICsgdXBsb2FkLmZpbGUubmFtZSArICcgZnJvbSAnICsgdXBsb2FkLnVybClcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc29sdmUodXBsb2FkKVxuICAgICAgfVxuICAgICAgb3B0c1R1cy5tZXRhZGF0YSA9IGZpbGUubWV0YVxuXG4gICAgICBjb25zdCB1cGxvYWQgPSBuZXcgdHVzLlVwbG9hZChmaWxlLmRhdGEsIG9wdHNUdXMpXG5cbiAgICAgIHRoaXMub25GaWxlUmVtb3ZlKGZpbGUuaWQsICgpID0+IHtcbiAgICAgICAgdGhpcy5jb3JlLmxvZygncmVtb3ZpbmcgZmlsZTonLCBmaWxlLmlkKVxuICAgICAgICB1cGxvYWQuYWJvcnQoKVxuICAgICAgICByZXNvbHZlKGB1cGxvYWQgJHtmaWxlLmlkfSB3YXMgcmVtb3ZlZGApXG4gICAgICB9KVxuXG4gICAgICB0aGlzLm9uUGF1c2UoZmlsZS5pZCwgKGlzUGF1c2VkKSA9PiB7XG4gICAgICAgIGlzUGF1c2VkID8gdXBsb2FkLmFib3J0KCkgOiB1cGxvYWQuc3RhcnQoKVxuICAgICAgfSlcblxuICAgICAgdGhpcy5vblBhdXNlQWxsKGZpbGUuaWQsICgpID0+IHtcbiAgICAgICAgdXBsb2FkLmFib3J0KClcbiAgICAgIH0pXG5cbiAgICAgIHRoaXMub25SZXN1bWVBbGwoZmlsZS5pZCwgKCkgPT4ge1xuICAgICAgICB1cGxvYWQuc3RhcnQoKVxuICAgICAgfSlcblxuICAgICAgdGhpcy5jb3JlLm9uKCdjb3JlOnJldHJ5LXN0YXJ0ZWQnLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5jb3JlLmdldFN0YXRlKCkuZmlsZXNcbiAgICAgICAgaWYgKGZpbGVzW2ZpbGUuaWRdLnByb2dyZXNzLnVwbG9hZENvbXBsZXRlIHx8XG4gICAgICAgICAgIWZpbGVzW2ZpbGUuaWRdLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWQgfHxcbiAgICAgICAgICBmaWxlc1tmaWxlLmlkXS5pc1BhdXNlZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdXBsb2FkLnN0YXJ0KClcbiAgICAgIH0pXG5cbiAgICAgIHVwbG9hZC5zdGFydCgpXG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1zdGFydGVkJywgZmlsZS5pZCwgdXBsb2FkKVxuICAgIH0pXG4gIH1cblxuICB1cGxvYWRSZW1vdGUgKGZpbGUsIGN1cnJlbnQsIHRvdGFsKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMuY29yZS5sb2coZmlsZS5yZW1vdGUudXJsKVxuICAgICAgbGV0IGVuZHBvaW50ID0gdGhpcy5vcHRzLmVuZHBvaW50XG4gICAgICBpZiAoZmlsZS50dXMgJiYgZmlsZS50dXMuZW5kcG9pbnQpIHtcbiAgICAgICAgZW5kcG9pbnQgPSBmaWxlLnR1cy5lbmRwb2ludFxuICAgICAgfVxuXG4gICAgICBmZXRjaChmaWxlLnJlbW90ZS51cmwsIHtcbiAgICAgICAgbWV0aG9kOiAncG9zdCcsXG4gICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoT2JqZWN0LmFzc2lnbih7fSwgZmlsZS5yZW1vdGUuYm9keSwge1xuICAgICAgICAgIGVuZHBvaW50LFxuICAgICAgICAgIHByb3RvY29sOiAndHVzJyxcbiAgICAgICAgICBzaXplOiBmaWxlLmRhdGEuc2l6ZVxuICAgICAgICAgIC8vIFRPRE8gYWRkIGBmaWxlLm1ldGFgIGFzIHR1cyBtZXRhZGF0YSBoZXJlXG4gICAgICAgIH0pKVxuICAgICAgfSlcbiAgICAgIC50aGVuKChyZXMpID0+IHtcbiAgICAgICAgaWYgKHJlcy5zdGF0dXMgPCAyMDAgJiYgcmVzLnN0YXR1cyA+IDMwMCkge1xuICAgICAgICAgIHJldHVybiByZWplY3QocmVzLnN0YXR1c1RleHQpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1zdGFydGVkJywgZmlsZS5pZClcblxuICAgICAgICByZXMuanNvbigpLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgICAgICAvLyBnZXQgdGhlIGhvc3QgZG9tYWluXG4gICAgICAgICAgLy8gdmFyIHJlZ2V4ID0gL14oPzpodHRwcz86XFwvXFwvfFxcL1xcLyk/KD86W15AXFwvXFxuXStAKT8oPzp3d3dcXC4pPyhbXlxcL1xcbl0rKS9cbiAgICAgICAgICB2YXIgcmVnZXggPSAvXig/Omh0dHBzPzpcXC9cXC98XFwvXFwvKT8oPzpbXkBcXG5dK0ApPyg/Ond3d1xcLik/KFteXFxuXSspL1xuICAgICAgICAgIHZhciBob3N0ID0gcmVnZXguZXhlYyhmaWxlLnJlbW90ZS5ob3N0KVsxXVxuICAgICAgICAgIHZhciBzb2NrZXRQcm90b2NvbCA9IGxvY2F0aW9uLnByb3RvY29sID09PSAnaHR0cHM6JyA/ICd3c3MnIDogJ3dzJ1xuXG4gICAgICAgICAgdmFyIHRva2VuID0gZGF0YS50b2tlblxuICAgICAgICAgIHZhciBzb2NrZXQgPSBuZXcgVXBweVNvY2tldCh7XG4gICAgICAgICAgICB0YXJnZXQ6IHNvY2tldFByb3RvY29sICsgYDovLyR7aG9zdH0vYXBpLyR7dG9rZW59YFxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICB0aGlzLm9uRmlsZVJlbW92ZShmaWxlLmlkLCAoKSA9PiB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZCgncGF1c2UnLCB7fSlcbiAgICAgICAgICAgIHJlc29sdmUoYHVwbG9hZCAke2ZpbGUuaWR9IHdhcyByZW1vdmVkYClcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgdGhpcy5vblBhdXNlKGZpbGUuaWQsIChpc1BhdXNlZCkgPT4ge1xuICAgICAgICAgICAgaXNQYXVzZWQgPyBzb2NrZXQuc2VuZCgncGF1c2UnLCB7fSkgOiBzb2NrZXQuc2VuZCgncmVzdW1lJywge30pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHRoaXMub25QYXVzZUFsbChmaWxlLmlkLCAoKSA9PiB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZCgncGF1c2UnLCB7fSlcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgdGhpcy5vblJlc3VtZUFsbChmaWxlLmlkLCAoKSA9PiB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZCgncmVzdW1lJywge30pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIGNvbnN0IGVtaXRQcm9ncmVzcyA9IChwcm9ncmVzc0RhdGEpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHtwcm9ncmVzcywgYnl0ZXNVcGxvYWRlZCwgYnl0ZXNUb3RhbH0gPSBwcm9ncmVzc0RhdGFcblxuICAgICAgICAgICAgaWYgKHByb2dyZXNzKSB7XG4gICAgICAgICAgICAgIHRoaXMuY29yZS5sb2coYFVwbG9hZCBwcm9ncmVzczogJHtwcm9ncmVzc31gKVxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhmaWxlLmlkKVxuXG4gICAgICAgICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6dXBsb2FkLXByb2dyZXNzJywge1xuICAgICAgICAgICAgICAgIHVwbG9hZGVyOiB0aGlzLFxuICAgICAgICAgICAgICAgIGlkOiBmaWxlLmlkLFxuICAgICAgICAgICAgICAgIGJ5dGVzVXBsb2FkZWQ6IGJ5dGVzVXBsb2FkZWQsXG4gICAgICAgICAgICAgICAgYnl0ZXNUb3RhbDogYnl0ZXNUb3RhbFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHRocm90dGxlZEVtaXRQcm9ncmVzcyA9IHRocm90dGxlKGVtaXRQcm9ncmVzcywgMzAwLCB7bGVhZGluZzogdHJ1ZSwgdHJhaWxpbmc6IHRydWV9KVxuICAgICAgICAgIHNvY2tldC5vbigncHJvZ3Jlc3MnLCB0aHJvdHRsZWRFbWl0UHJvZ3Jlc3MpXG5cbiAgICAgICAgICBzb2NrZXQub24oJ3N1Y2Nlc3MnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTp1cGxvYWQtc3VjY2VzcycsIGZpbGUuaWQsIGRhdGEsIGRhdGEudXJsKVxuICAgICAgICAgICAgc29ja2V0LmNsb3NlKClcbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlKClcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgb25GaWxlUmVtb3ZlIChmaWxlSUQsIGNiKSB7XG4gICAgdGhpcy5jb3JlLmVtaXR0ZXIub24oJ2NvcmU6ZmlsZS1yZW1vdmUnLCAodGFyZ2V0RmlsZUlEKSA9PiB7XG4gICAgICBpZiAoZmlsZUlEID09PSB0YXJnZXRGaWxlSUQpIGNiKClcbiAgICB9KVxuICB9XG5cbiAgb25QYXVzZSAoZmlsZUlELCBjYikge1xuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdjb3JlOnVwbG9hZC1wYXVzZScsICh0YXJnZXRGaWxlSUQpID0+IHtcbiAgICAgIGlmIChmaWxlSUQgPT09IHRhcmdldEZpbGVJRCkge1xuICAgICAgICBjb25zdCBpc1BhdXNlZCA9IHRoaXMucGF1c2VSZXN1bWUoJ3RvZ2dsZScsIGZpbGVJRClcbiAgICAgICAgY2IoaXNQYXVzZWQpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIG9uUGF1c2VBbGwgKGZpbGVJRCwgY2IpIHtcbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vbignY29yZTpwYXVzZS1hbGwnLCAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLmZpbGVzXG4gICAgICBpZiAoIWZpbGVzW2ZpbGVJRF0pIHJldHVyblxuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBvblJlc3VtZUFsbCAoZmlsZUlELCBjYikge1xuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdjb3JlOnJlc3VtZS1hbGwnLCAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLmZpbGVzXG4gICAgICBpZiAoIWZpbGVzW2ZpbGVJRF0pIHJldHVyblxuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICB1cGxvYWRGaWxlcyAoZmlsZXMpIHtcbiAgICBpZiAoT2JqZWN0LmtleXMoZmlsZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy5jb3JlLmxvZygnbm8gZmlsZXMgdG8gdXBsb2FkIScpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBmaWxlcy5mb3JFYWNoKChmaWxlLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgY3VycmVudCA9IHBhcnNlSW50KGluZGV4LCAxMCkgKyAxXG4gICAgICBjb25zdCB0b3RhbCA9IGZpbGVzLmxlbmd0aFxuXG4gICAgICBpZiAoIWZpbGUuaXNSZW1vdGUpIHtcbiAgICAgICAgdGhpcy51cGxvYWQoZmlsZSwgY3VycmVudCwgdG90YWwpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnVwbG9hZFJlbW90ZShmaWxlLCBjdXJyZW50LCB0b3RhbClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgc2VsZWN0Rm9yVXBsb2FkIChmaWxlcykge1xuICAgIC8vIFRPRE86IHJlcGxhY2UgZmlsZXNbZmlsZV0uaXNSZW1vdGUgd2l0aCBzb21lIGxvZ2ljXG4gICAgLy9cbiAgICAvLyBmaWx0ZXIgZmlsZXMgdGhhdCBhcmUgbm93IHlldCBiZWluZyB1cGxvYWRlZCAvIGhhdmVu4oCZdCBiZWVuIHVwbG9hZGVkXG4gICAgLy8gYW5kIHJlbW90ZSB0b29cbiAgICBjb25zdCBmaWxlc0ZvclVwbG9hZCA9IE9iamVjdC5rZXlzKGZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAgIGlmICghZmlsZXNbZmlsZV0ucHJvZ3Jlc3MudXBsb2FkU3RhcnRlZCB8fCBmaWxlc1tmaWxlXS5pc1JlbW90ZSkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfSkubWFwKChmaWxlKSA9PiB7XG4gICAgICByZXR1cm4gZmlsZXNbZmlsZV1cbiAgICB9KVxuXG4gICAgdGhpcy51cGxvYWRGaWxlcyhmaWxlc0ZvclVwbG9hZClcbiAgfVxuXG4gIGhhbmRsZVVwbG9hZCAoKSB7XG4gICAgdGhpcy5jb3JlLmxvZygnVHVzIGlzIHVwbG9hZGluZy4uLicpXG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5maWxlc1xuXG4gICAgdGhpcy5zZWxlY3RGb3JVcGxvYWQoZmlsZXMpXG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRoaXMuY29yZS5idXMub25jZSgnY29yZTp1cGxvYWQtY29tcGxldGUnLCByZXNvbHZlKVxuICAgIH0pXG4gIH1cblxuICBhY3Rpb25zICgpIHtcbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vbignY29yZTpwYXVzZS1hbGwnLCB0aGlzLmhhbmRsZVBhdXNlQWxsKVxuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdjb3JlOnJlc3VtZS1hbGwnLCB0aGlzLmhhbmRsZVJlc3VtZUFsbClcblxuICAgIGlmICh0aGlzLm9wdHMuYXV0b1JldHJ5KSB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5vbignYmFjay1vbmxpbmUnLCAoKSA9PiB7XG4gICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6cmV0cnktc3RhcnRlZCcpXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGFkZFJlc3VtYWJsZVVwbG9hZHNDYXBhYmlsaXR5RmxhZyAoKSB7XG4gICAgY29uc3QgbmV3Q2FwYWJpbGl0aWVzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb3JlLmdldFN0YXRlKCkuY2FwYWJpbGl0aWVzKVxuICAgIG5ld0NhcGFiaWxpdGllcy5yZXN1bWFibGVVcGxvYWRzID0gdHJ1ZVxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBjYXBhYmlsaXRpZXM6IG5ld0NhcGFiaWxpdGllc1xuICAgIH0pXG4gIH1cblxuICBpbnN0YWxsICgpIHtcbiAgICB0aGlzLmFkZFJlc3VtYWJsZVVwbG9hZHNDYXBhYmlsaXR5RmxhZygpXG4gICAgdGhpcy5jb3JlLmFkZFVwbG9hZGVyKHRoaXMuaGFuZGxlVXBsb2FkKVxuICAgIHRoaXMuYWN0aW9ucygpXG4gIH1cblxuICB1bmluc3RhbGwgKCkge1xuICAgIHRoaXMuY29yZS5yZW1vdmVVcGxvYWRlcih0aGlzLmhhbmRsZVVwbG9hZClcbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vZmYoJ2NvcmU6cGF1c2UtYWxsJywgdGhpcy5oYW5kbGVQYXVzZUFsbClcbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vZmYoJ2NvcmU6cmVzdW1lLWFsbCcsIHRoaXMuaGFuZGxlUmVzdW1lQWxsKVxuICB9XG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjEwMFwiIGhlaWdodD1cIjc3XCIgdmlld0JveD1cIjAgMCAxMDAgNzdcIj5cbiAgICA8cGF0aCBkPVwiTTUwIDMyYy03LjE2OCAwLTEzIDUuODMyLTEzIDEzczUuODMyIDEzIDEzIDEzIDEzLTUuODMyIDEzLTEzLTUuODMyLTEzLTEzLTEzelwiLz5cbiAgICA8cGF0aCBkPVwiTTg3IDEzSDcyYzAtNy4xOC01LjgyLTEzLTEzLTEzSDQxYy03LjE4IDAtMTMgNS44Mi0xMyAxM0gxM0M1LjgyIDEzIDAgMTguODIgMCAyNnYzOGMwIDcuMTggNS44MiAxMyAxMyAxM2g3NGM3LjE4IDAgMTMtNS44MiAxMy0xM1YyNmMwLTcuMTgtNS44Mi0xMy0xMy0xM3pNNTAgNjhjLTEyLjY4MyAwLTIzLTEwLjMxOC0yMy0yM3MxMC4zMTctMjMgMjMtMjMgMjMgMTAuMzE4IDIzIDIzLTEwLjMxNyAyMy0yMyAyM3pcIi8+XG4gIDwvc3ZnPmBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBTbmFwc2hvdEJ1dHRvbiA9IHJlcXVpcmUoJy4vU25hcHNob3RCdXR0b24nKVxuY29uc3QgUmVjb3JkQnV0dG9uID0gcmVxdWlyZSgnLi9SZWNvcmRCdXR0b24nKVxuXG5mdW5jdGlvbiBpc01vZGVBdmFpbGFibGUgKG1vZGVzLCBtb2RlKSB7XG4gIHJldHVybiBtb2Rlcy5pbmRleE9mKG1vZGUpICE9PSAtMVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBjb25zdCBzcmMgPSBwcm9wcy5zcmMgfHwgJydcbiAgbGV0IHZpZGVvXG5cbiAgaWYgKHByb3BzLnVzZVRoZUZsYXNoKSB7XG4gICAgdmlkZW8gPSBwcm9wcy5nZXRTV0ZIVE1MKClcbiAgfSBlbHNlIHtcbiAgICB2aWRlbyA9IGh0bWxgPHZpZGVvIGNsYXNzPVwiVXBweVdlYmNhbS12aWRlb1wiIGF1dG9wbGF5IG11dGVkIHNyYz1cIiR7c3JjfVwiPjwvdmlkZW8+YFxuICB9XG5cbiAgY29uc3Qgc2hvdWxkU2hvd1JlY29yZEJ1dHRvbiA9IHByb3BzLnN1cHBvcnRzUmVjb3JkaW5nICYmIChcbiAgICBpc01vZGVBdmFpbGFibGUocHJvcHMubW9kZXMsICd2aWRlby1vbmx5JykgfHxcbiAgICBpc01vZGVBdmFpbGFibGUocHJvcHMubW9kZXMsICdhdWRpby1vbmx5JykgfHxcbiAgICBpc01vZGVBdmFpbGFibGUocHJvcHMubW9kZXMsICd2aWRlby1hdWRpbycpXG4gIClcblxuICBjb25zdCBzaG91bGRTaG93U25hcHNob3RCdXR0b24gPSBpc01vZGVBdmFpbGFibGUocHJvcHMubW9kZXMsICdwaWN0dXJlJylcblxuICByZXR1cm4gaHRtbGBcbiAgICA8ZGl2IGNsYXNzPVwiVXBweVdlYmNhbS1jb250YWluZXJcIiBvbmxvYWQ9JHsoZWwpID0+IHtcbiAgICAgIHByb3BzLm9uRm9jdXMoKVxuICAgICAgY29uc3QgcmVjb3JkQnV0dG9uID0gZWwucXVlcnlTZWxlY3RvcignLlVwcHlXZWJjYW0tcmVjb3JkQnV0dG9uJylcbiAgICAgIGlmIChyZWNvcmRCdXR0b24pIHJlY29yZEJ1dHRvbi5mb2N1cygpXG4gICAgfX0gb251bmxvYWQ9JHsoZWwpID0+IHtcbiAgICAgIHByb3BzLm9uU3RvcCgpXG4gICAgfX0+XG4gICAgICA8ZGl2IGNsYXNzPSdVcHB5V2ViY2FtLXZpZGVvQ29udGFpbmVyJz5cbiAgICAgICAgJHt2aWRlb31cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz0nVXBweVdlYmNhbS1idXR0b25Db250YWluZXInPlxuICAgICAgICAke3Nob3VsZFNob3dSZWNvcmRCdXR0b24gPyBSZWNvcmRCdXR0b24ocHJvcHMpIDogbnVsbH1cbiAgICAgICAgJHtzaG91bGRTaG93U25hcHNob3RCdXR0b24gPyBTbmFwc2hvdEJ1dHRvbihwcm9wcykgOiBudWxsfVxuICAgICAgPC9kaXY+XG4gICAgICA8Y2FudmFzIGNsYXNzPVwiVXBweVdlYmNhbS1jYW52YXNcIiBzdHlsZT1cImRpc3BsYXk6IG5vbmU7XCI+PC9jYW52YXM+XG4gICAgPC9kaXY+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBodG1sYFxuICAgIDxkaXY+XG4gICAgICA8aDE+UGxlYXNlIGFsbG93IGFjY2VzcyB0byB5b3VyIGNhbWVyYTwvaDE+XG4gICAgICA8c3Bhbj5Zb3UgaGF2ZSBiZWVuIHByb21wdGVkIHRvIGFsbG93IGNhbWVyYSBhY2Nlc3MgZnJvbSB0aGlzIHNpdGUuIEluIG9yZGVyIHRvIHRha2UgcGljdHVyZXMgd2l0aCB5b3VyIGNhbWVyYSB5b3UgbXVzdCBhcHByb3ZlIHRoaXMgcmVxdWVzdC48L3NwYW4+XG4gICAgPC9kaXY+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBSZWNvcmRTdGFydEljb24gPSByZXF1aXJlKCcuL1JlY29yZFN0YXJ0SWNvbicpXG5jb25zdCBSZWNvcmRTdG9wSWNvbiA9IHJlcXVpcmUoJy4vUmVjb3JkU3RvcEljb24nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIFJlY29yZEJ1dHRvbiAoeyByZWNvcmRpbmcsIG9uU3RhcnRSZWNvcmRpbmcsIG9uU3RvcFJlY29yZGluZyB9KSB7XG4gIGlmIChyZWNvcmRpbmcpIHtcbiAgICByZXR1cm4gaHRtbGBcbiAgICAgIDxidXR0b24gY2xhc3M9XCJVcHB5QnV0dG9uLS1jaXJjdWxhciBVcHB5QnV0dG9uLS1yZWQgVXBweUJ1dHRvbi0tc2l6ZU0gVXBweVdlYmNhbS1yZWNvcmRCdXR0b25cIlxuICAgICAgICB0eXBlPVwiYnV0dG9uXCJcbiAgICAgICAgdGl0bGU9XCJTdG9wIFJlY29yZGluZ1wiXG4gICAgICAgIGFyaWEtbGFiZWw9XCJTdG9wIFJlY29yZGluZ1wiXG4gICAgICAgIG9uY2xpY2s9JHtvblN0b3BSZWNvcmRpbmd9PlxuICAgICAgICAke1JlY29yZFN0b3BJY29uKCl9XG4gICAgICA8L2J1dHRvbj5cbiAgICBgXG4gIH1cblxuICByZXR1cm4gaHRtbGBcbiAgICA8YnV0dG9uIGNsYXNzPVwiVXBweUJ1dHRvbi0tY2lyY3VsYXIgVXBweUJ1dHRvbi0tcmVkIFVwcHlCdXR0b24tLXNpemVNIFVwcHlXZWJjYW0tcmVjb3JkQnV0dG9uXCJcbiAgICAgIHR5cGU9XCJidXR0b25cIlxuICAgICAgdGl0bGU9XCJCZWdpbiBSZWNvcmRpbmdcIlxuICAgICAgYXJpYS1sYWJlbD1cIkJlZ2luIFJlY29yZGluZ1wiXG4gICAgICBvbmNsaWNrPSR7b25TdGFydFJlY29yZGluZ30+XG4gICAgICAke1JlY29yZFN0YXJ0SWNvbigpfVxuICAgIDwvYnV0dG9uPlxuICBgXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjEwMFwiIGhlaWdodD1cIjEwMFwiIHZpZXdCb3g9XCIwIDAgMTAwIDEwMFwiPlxuICAgIDxjaXJjbGUgY3g9XCI1MFwiIGN5PVwiNTBcIiByPVwiNDBcIiAvPlxuICA8L3N2Zz5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjEwMFwiIGhlaWdodD1cIjEwMFwiIHZpZXdCb3g9XCIwIDAgMTAwIDEwMFwiPlxuICAgIDxyZWN0IHg9XCIxNVwiIHk9XCIxNVwiIHdpZHRoPVwiNzBcIiBoZWlnaHQ9XCI3MFwiIC8+XG4gIDwvc3ZnPmBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBDYW1lcmFJY29uID0gcmVxdWlyZSgnLi9DYW1lcmFJY29uJylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBTbmFwc2hvdEJ1dHRvbiAoeyBvblNuYXBzaG90IH0pIHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPGJ1dHRvbiBjbGFzcz1cIlVwcHlCdXR0b24tLWNpcmN1bGFyIFVwcHlCdXR0b24tLXJlZCBVcHB5QnV0dG9uLS1zaXplTSBVcHB5V2ViY2FtLXJlY29yZEJ1dHRvblwiXG4gICAgICB0eXBlPVwiYnV0dG9uXCJcbiAgICAgIHRpdGxlPVwiVGFrZSBhIHNuYXBzaG90XCJcbiAgICAgIGFyaWEtbGFiZWw9XCJUYWtlIGEgc25hcHNob3RcIlxuICAgICAgb25jbGljaz0ke29uU25hcHNob3R9PlxuICAgICAgJHtDYW1lcmFJY29uKCl9XG4gICAgPC9idXR0b24+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBodG1sYFxuICAgIDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIyMVwiIHZpZXdCb3g9XCIwIDAgMTggMjFcIj5cbiAgICAgIDxwYXRoIGQ9XCJNMTQuOCAxNi45YzEuOS0xLjcgMy4yLTQuMSAzLjItNi45IDAtNS00LTktOS05cy05IDQtOSA5YzAgMi44IDEuMiA1LjIgMy4yIDYuOUMxLjkgMTcuOS41IDE5LjQgMCAyMWgzYzEtMS45IDExLTEuOSAxMiAwaDNjLS41LTEuNi0xLjktMy4xLTMuMi00LjF6TTkgNGMzLjMgMCA2IDIuNyA2IDZzLTIuNyA2LTYgNi02LTIuNy02LTYgMi43LTYgNi02elwiLz5cbiAgICAgIDxwYXRoIGQ9XCJNOSAxNGMyLjIgMCA0LTEuOCA0LTRzLTEuOC00LTQtNC00IDEuOC00IDQgMS44IDQgNCA0ek04IDhjLjYgMCAxIC40IDEgMXMtLjQgMS0xIDEtMS0uNC0xLTFjMC0uNS40LTEgMS0xelwiLz5cbiAgICA8L3N2Zz5cbiAgYFxufVxuIiwiY29uc3QgUGx1Z2luID0gcmVxdWlyZSgnLi4vUGx1Z2luJylcbmNvbnN0IFdlYmNhbVByb3ZpZGVyID0gcmVxdWlyZSgnLi4vLi4vdXBweS1iYXNlL3NyYy9wbHVnaW5zL1dlYmNhbScpXG5jb25zdCB7IGV4dGVuZCxcbiAgICAgICAgZ2V0RmlsZVR5cGVFeHRlbnNpb24sXG4gICAgICAgIHN1cHBvcnRzTWVkaWFSZWNvcmRlciB9ID0gcmVxdWlyZSgnLi4vLi4vY29yZS9VdGlscycpXG5jb25zdCBXZWJjYW1JY29uID0gcmVxdWlyZSgnLi9XZWJjYW1JY29uJylcbmNvbnN0IENhbWVyYVNjcmVlbiA9IHJlcXVpcmUoJy4vQ2FtZXJhU2NyZWVuJylcbmNvbnN0IFBlcm1pc3Npb25zU2NyZWVuID0gcmVxdWlyZSgnLi9QZXJtaXNzaW9uc1NjcmVlbicpXG5cbi8qKlxuICogV2ViY2FtXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgV2ViY2FtIGV4dGVuZHMgUGx1Z2luIHtcbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICBzdXBlcihjb3JlLCBvcHRzKVxuICAgIHRoaXMudXNlck1lZGlhID0gdHJ1ZVxuICAgIHRoaXMucHJvdG9jb2wgPSBsb2NhdGlvbi5wcm90b2NvbC5tYXRjaCgvaHR0cHMvaSkgPyAnaHR0cHMnIDogJ2h0dHAnXG4gICAgdGhpcy50eXBlID0gJ2FjcXVpcmVyJ1xuICAgIHRoaXMuaWQgPSAnV2ViY2FtJ1xuICAgIHRoaXMudGl0bGUgPSAnV2ViY2FtJ1xuICAgIHRoaXMuaWNvbiA9IFdlYmNhbUljb25cblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIGVuYWJsZUZsYXNoOiB0cnVlLFxuICAgICAgbW9kZXM6IFtcbiAgICAgICAgJ3ZpZGVvLWF1ZGlvJyxcbiAgICAgICAgJ3ZpZGVvLW9ubHknLFxuICAgICAgICAnYXVkaW8tb25seScsXG4gICAgICAgICdwaWN0dXJlJ1xuICAgICAgXVxuICAgIH1cblxuICAgIHRoaXMucGFyYW1zID0ge1xuICAgICAgc3dmVVJMOiAnd2ViY2FtLnN3ZicsXG4gICAgICB3aWR0aDogNDAwLFxuICAgICAgaGVpZ2h0OiAzMDAsXG4gICAgICBkZXN0X3dpZHRoOiA4MDAsICAgICAgICAgLy8gc2l6ZSBvZiBjYXB0dXJlZCBpbWFnZVxuICAgICAgZGVzdF9oZWlnaHQ6IDYwMCwgICAgICAgIC8vIHRoZXNlIGRlZmF1bHQgdG8gd2lkdGgvaGVpZ2h0XG4gICAgICBpbWFnZV9mb3JtYXQ6ICdqcGVnJywgIC8vIGltYWdlIGZvcm1hdCAobWF5IGJlIGpwZWcgb3IgcG5nKVxuICAgICAganBlZ19xdWFsaXR5OiA5MCwgICAgICAvLyBqcGVnIGltYWdlIHF1YWxpdHkgZnJvbSAwICh3b3JzdCkgdG8gMTAwIChiZXN0KVxuICAgICAgZW5hYmxlX2ZsYXNoOiB0cnVlLCAgICAvLyBlbmFibGUgZmxhc2ggZmFsbGJhY2ssXG4gICAgICBmb3JjZV9mbGFzaDogZmFsc2UsICAgIC8vIGZvcmNlIGZsYXNoIG1vZGUsXG4gICAgICBmbGlwX2hvcml6OiBmYWxzZSwgICAgIC8vIGZsaXAgaW1hZ2UgaG9yaXogKG1pcnJvciBtb2RlKVxuICAgICAgZnBzOiAzMCwgICAgICAgICAgICAgICAvLyBjYW1lcmEgZnJhbWVzIHBlciBzZWNvbmRcbiAgICAgIHVwbG9hZF9uYW1lOiAnd2ViY2FtJywgLy8gbmFtZSBvZiBmaWxlIGluIHVwbG9hZCBwb3N0IGRhdGFcbiAgICAgIGNvbnN0cmFpbnRzOiBudWxsLCAgICAgLy8gY3VzdG9tIHVzZXIgbWVkaWEgY29uc3RyYWludHMsXG4gICAgICBmbGFzaE5vdERldGVjdGVkVGV4dDogJ0VSUk9SOiBObyBBZG9iZSBGbGFzaCBQbGF5ZXIgZGV0ZWN0ZWQuICBXZWJjYW0uanMgcmVsaWVzIG9uIEZsYXNoIGZvciBicm93c2VycyB0aGF0IGRvIG5vdCBzdXBwb3J0IGdldFVzZXJNZWRpYSAobGlrZSB5b3VycykuJyxcbiAgICAgIG5vSW50ZXJmYWNlRm91bmRUZXh0OiAnTm8gc3VwcG9ydGVkIHdlYmNhbSBpbnRlcmZhY2UgZm91bmQuJyxcbiAgICAgIHVuZnJlZXplX3NuYXA6IHRydWUgICAgLy8gV2hldGhlciB0byB1bmZyZWV6ZSB0aGUgY2FtZXJhIGFmdGVyIHNuYXAgKGRlZmF1bHRzIHRvIHRydWUpXG4gICAgfVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcblxuICAgIHRoaXMuaW5zdGFsbCA9IHRoaXMuaW5zdGFsbC5iaW5kKHRoaXMpXG4gICAgdGhpcy51cGRhdGVTdGF0ZSA9IHRoaXMudXBkYXRlU3RhdGUuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG5cbiAgICAvLyBDYW1lcmEgY29udHJvbHNcbiAgICB0aGlzLnN0YXJ0ID0gdGhpcy5zdGFydC5iaW5kKHRoaXMpXG4gICAgdGhpcy5zdG9wID0gdGhpcy5zdG9wLmJpbmQodGhpcylcbiAgICB0aGlzLnRha2VTbmFwc2hvdCA9IHRoaXMudGFrZVNuYXBzaG90LmJpbmQodGhpcylcbiAgICB0aGlzLnN0YXJ0UmVjb3JkaW5nID0gdGhpcy5zdGFydFJlY29yZGluZy5iaW5kKHRoaXMpXG4gICAgdGhpcy5zdG9wUmVjb3JkaW5nID0gdGhpcy5zdG9wUmVjb3JkaW5nLmJpbmQodGhpcylcblxuICAgIHRoaXMud2ViY2FtID0gbmV3IFdlYmNhbVByb3ZpZGVyKHRoaXMub3B0cywgdGhpcy5wYXJhbXMpXG4gICAgdGhpcy53ZWJjYW1BY3RpdmUgPSBmYWxzZVxuICB9XG5cbiAgc3RhcnQgKCkge1xuICAgIHRoaXMud2ViY2FtQWN0aXZlID0gdHJ1ZVxuXG4gICAgdGhpcy53ZWJjYW0uc3RhcnQoKVxuICAgICAgLnRoZW4oKHN0cmVhbSkgPT4ge1xuICAgICAgICB0aGlzLnN0cmVhbSA9IHN0cmVhbVxuICAgICAgICB0aGlzLnVwZGF0ZVN0YXRlKHtcbiAgICAgICAgICAvLyB2aWRlb1N0cmVhbTogc3RyZWFtLFxuICAgICAgICAgIGNhbWVyYVJlYWR5OiB0cnVlXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZSh7XG4gICAgICAgICAgY2FtZXJhRXJyb3I6IGVyclxuICAgICAgICB9KVxuICAgICAgfSlcbiAgfVxuXG4gIHN0YXJ0UmVjb3JkaW5nICgpIHtcbiAgICAvLyBUT0RPIFdlIGNhbiBjaGVjayBoZXJlIGlmIGFueSBvZiB0aGUgbWltZSB0eXBlcyBsaXN0ZWQgaW4gdGhlXG4gICAgLy8gbWltZVRvRXh0ZW5zaW9ucyBtYXAgaW4gVXRpbHMuanMgYXJlIHN1cHBvcnRlZCwgYW5kIHByZWZlciB0byB1c2Ugb25lIG9mXG4gICAgLy8gdGhvc2UuXG4gICAgLy8gUmlnaHQgbm93IHdlIGxldCB0aGUgYnJvd3NlciBwaWNrIGEgdHlwZSB0aGF0IGl0IGRlZW1zIGFwcHJvcHJpYXRlLlxuICAgIHRoaXMucmVjb3JkZXIgPSBuZXcgTWVkaWFSZWNvcmRlcih0aGlzLnN0cmVhbSlcbiAgICB0aGlzLnJlY29yZGluZ0NodW5rcyA9IFtdXG4gICAgdGhpcy5yZWNvcmRlci5hZGRFdmVudExpc3RlbmVyKCdkYXRhYXZhaWxhYmxlJywgKGV2ZW50KSA9PiB7XG4gICAgICB0aGlzLnJlY29yZGluZ0NodW5rcy5wdXNoKGV2ZW50LmRhdGEpXG4gICAgfSlcbiAgICB0aGlzLnJlY29yZGVyLnN0YXJ0KClcblxuICAgIHRoaXMudXBkYXRlU3RhdGUoe1xuICAgICAgaXNSZWNvcmRpbmc6IHRydWVcbiAgICB9KVxuICB9XG5cbiAgc3RvcFJlY29yZGluZyAoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMucmVjb3JkZXIuYWRkRXZlbnRMaXN0ZW5lcignc3RvcCcsICgpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZSh7XG4gICAgICAgICAgaXNSZWNvcmRpbmc6IGZhbHNlXG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgbWltZVR5cGUgPSB0aGlzLnJlY29yZGluZ0NodW5rc1swXS50eXBlXG4gICAgICAgIGNvbnN0IGZpbGVFeHRlbnNpb24gPSBnZXRGaWxlVHlwZUV4dGVuc2lvbihtaW1lVHlwZSlcblxuICAgICAgICBpZiAoIWZpbGVFeHRlbnNpb24pIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBDb3VsZCBub3QgdXBsb2FkIGZpbGU6IFVuc3VwcG9ydGVkIG1lZGlhIHR5cGUgXCIke21pbWVUeXBlfVwiYCkpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmaWxlID0ge1xuICAgICAgICAgIHNvdXJjZTogdGhpcy5pZCxcbiAgICAgICAgICBuYW1lOiBgd2ViY2FtLSR7RGF0ZS5ub3coKX0uJHtmaWxlRXh0ZW5zaW9ufWAsXG4gICAgICAgICAgdHlwZTogbWltZVR5cGUsXG4gICAgICAgICAgZGF0YTogbmV3IEJsb2IodGhpcy5yZWNvcmRpbmdDaHVua3MsIHsgdHlwZTogbWltZVR5cGUgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6ZmlsZS1hZGQnLCBmaWxlKVxuXG4gICAgICAgIHRoaXMucmVjb3JkaW5nQ2h1bmtzID0gbnVsbFxuICAgICAgICB0aGlzLnJlY29yZGVyID0gbnVsbFxuXG4gICAgICAgIHJlc29sdmUoKVxuICAgICAgfSlcblxuICAgICAgdGhpcy5yZWNvcmRlci5zdG9wKClcbiAgICB9KVxuICB9XG5cbiAgc3RvcCAoKSB7XG4gICAgdGhpcy5zdHJlYW0uZ2V0QXVkaW9UcmFja3MoKS5mb3JFYWNoKCh0cmFjaykgPT4ge1xuICAgICAgdHJhY2suc3RvcCgpXG4gICAgfSlcbiAgICB0aGlzLnN0cmVhbS5nZXRWaWRlb1RyYWNrcygpLmZvckVhY2goKHRyYWNrKSA9PiB7XG4gICAgICB0cmFjay5zdG9wKClcbiAgICB9KVxuICAgIHRoaXMud2ViY2FtQWN0aXZlID0gZmFsc2VcbiAgICB0aGlzLnN0cmVhbSA9IG51bGxcbiAgICB0aGlzLnN0cmVhbVNyYyA9IG51bGxcbiAgfVxuXG4gIHRha2VTbmFwc2hvdCAoKSB7XG4gICAgY29uc3Qgb3B0cyA9IHtcbiAgICAgIG5hbWU6IGB3ZWJjYW0tJHtEYXRlLm5vdygpfS5qcGdgLFxuICAgICAgbWltZVR5cGU6ICdpbWFnZS9qcGVnJ1xuICAgIH1cblxuICAgIGNvbnN0IHZpZGVvID0gdGhpcy50YXJnZXQucXVlcnlTZWxlY3RvcignLlVwcHlXZWJjYW0tdmlkZW8nKVxuXG4gICAgY29uc3QgaW1hZ2UgPSB0aGlzLndlYmNhbS5nZXRJbWFnZSh2aWRlbywgb3B0cylcblxuICAgIGNvbnN0IHRhZ0ZpbGUgPSB7XG4gICAgICBzb3VyY2U6IHRoaXMuaWQsXG4gICAgICBuYW1lOiBvcHRzLm5hbWUsXG4gICAgICBkYXRhOiBpbWFnZS5kYXRhLFxuICAgICAgdHlwZTogb3B0cy5taW1lVHlwZVxuICAgIH1cblxuICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6ZmlsZS1hZGQnLCB0YWdGaWxlKVxuICB9XG5cbiAgcmVuZGVyIChzdGF0ZSkge1xuICAgIGlmICghdGhpcy53ZWJjYW1BY3RpdmUpIHtcbiAgICAgIHRoaXMuc3RhcnQoKVxuICAgIH1cblxuICAgIGlmICghc3RhdGUud2ViY2FtLmNhbWVyYVJlYWR5ICYmICFzdGF0ZS53ZWJjYW0udXNlVGhlRmxhc2gpIHtcbiAgICAgIHJldHVybiBQZXJtaXNzaW9uc1NjcmVlbihzdGF0ZS53ZWJjYW0pXG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnN0cmVhbVNyYykge1xuICAgICAgdGhpcy5zdHJlYW1TcmMgPSB0aGlzLnN0cmVhbSA/IFVSTC5jcmVhdGVPYmplY3RVUkwodGhpcy5zdHJlYW0pIDogbnVsbFxuICAgIH1cblxuICAgIHJldHVybiBDYW1lcmFTY3JlZW4oZXh0ZW5kKHN0YXRlLndlYmNhbSwge1xuICAgICAgb25TbmFwc2hvdDogdGhpcy50YWtlU25hcHNob3QsXG4gICAgICBvblN0YXJ0UmVjb3JkaW5nOiB0aGlzLnN0YXJ0UmVjb3JkaW5nLFxuICAgICAgb25TdG9wUmVjb3JkaW5nOiB0aGlzLnN0b3BSZWNvcmRpbmcsXG4gICAgICBvbkZvY3VzOiB0aGlzLmZvY3VzLFxuICAgICAgb25TdG9wOiB0aGlzLnN0b3AsXG4gICAgICBtb2RlczogdGhpcy5vcHRzLm1vZGVzLFxuICAgICAgc3VwcG9ydHNSZWNvcmRpbmc6IHN1cHBvcnRzTWVkaWFSZWNvcmRlcigpLFxuICAgICAgcmVjb3JkaW5nOiBzdGF0ZS53ZWJjYW0uaXNSZWNvcmRpbmcsXG4gICAgICBnZXRTV0ZIVE1MOiB0aGlzLndlYmNhbS5nZXRTV0ZIVE1MLFxuICAgICAgc3JjOiB0aGlzLnN0cmVhbVNyY1xuICAgIH0pKVxuICB9XG5cbiAgZm9jdXMgKCkge1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnaW5mb3JtZXInLCAnU21pbGUhJywgJ3dhcm5pbmcnLCAyMDAwKVxuICAgIH0sIDEwMDApXG4gIH1cblxuICBpbnN0YWxsICgpIHtcbiAgICB0aGlzLndlYmNhbS5pbml0KClcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgd2ViY2FtOiB7XG4gICAgICAgIGNhbWVyYVJlYWR5OiBmYWxzZVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLm9wdHMudGFyZ2V0XG4gICAgY29uc3QgcGx1Z2luID0gdGhpc1xuICAgIHRoaXMudGFyZ2V0ID0gdGhpcy5tb3VudCh0YXJnZXQsIHBsdWdpbilcbiAgfVxuXG4gIHVuaW5zdGFsbCAoKSB7XG4gICAgdGhpcy53ZWJjYW0ucmVzZXQoKVxuICAgIHRoaXMudW5tb3VudCgpXG4gIH1cblxuICAvKipcbiAgICogTGl0dGxlIHNob3J0aGFuZCB0byB1cGRhdGUgdGhlIHN0YXRlIHdpdGggbXkgbmV3IHN0YXRlXG4gICAqL1xuICB1cGRhdGVTdGF0ZSAobmV3U3RhdGUpIHtcbiAgICBjb25zdCB7c3RhdGV9ID0gdGhpcy5jb3JlXG4gICAgY29uc3Qgd2ViY2FtID0gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUud2ViY2FtLCBuZXdTdGF0ZSlcblxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7d2ViY2FtfSlcbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbnJlcXVpcmUoJ3doYXR3Zy1mZXRjaCcpXG5cbmNvbnN0IF9nZXROYW1lID0gKGlkKSA9PiB7XG4gIHJldHVybiBpZC5zcGxpdCgnLScpLm1hcCgocykgPT4gcy5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHMuc2xpY2UoMSkpLmpvaW4oJyAnKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFByb3ZpZGVyIHtcbiAgY29uc3RydWN0b3IgKG9wdHMpIHtcbiAgICB0aGlzLm9wdHMgPSBvcHRzXG4gICAgdGhpcy5wcm92aWRlciA9IG9wdHMucHJvdmlkZXJcbiAgICB0aGlzLmlkID0gdGhpcy5wcm92aWRlclxuICAgIHRoaXMuYXV0aFByb3ZpZGVyID0gb3B0cy5hdXRoUHJvdmlkZXIgfHwgdGhpcy5wcm92aWRlclxuICAgIHRoaXMubmFtZSA9IHRoaXMub3B0cy5uYW1lIHx8IF9nZXROYW1lKHRoaXMuaWQpXG4gIH1cblxuICBhdXRoICgpIHtcbiAgICByZXR1cm4gZmV0Y2goYCR7dGhpcy5vcHRzLmhvc3R9LyR7dGhpcy5pZH0vYXV0aGAsIHtcbiAgICAgIG1ldGhvZDogJ2dldCcsXG4gICAgICBjcmVkZW50aWFsczogJ2luY2x1ZGUnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uLmpzb24nXG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigocmVzKSA9PiB7XG4gICAgICByZXR1cm4gcmVzLmpzb24oKVxuICAgICAgLnRoZW4oKHBheWxvYWQpID0+IHtcbiAgICAgICAgcmV0dXJuIHBheWxvYWQuYXV0aGVudGljYXRlZFxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgbGlzdCAoZGlyZWN0b3J5KSB7XG4gICAgcmV0dXJuIGZldGNoKGAke3RoaXMub3B0cy5ob3N0fS8ke3RoaXMuaWR9L2xpc3QvJHtkaXJlY3RvcnkgfHwgJyd9YCwge1xuICAgICAgbWV0aG9kOiAnZ2V0JyxcbiAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKChyZXMpID0+IHJlcy5qc29uKCkpXG4gIH1cblxuICBsb2dvdXQgKHJlZGlyZWN0ID0gbG9jYXRpb24uaHJlZikge1xuICAgIHJldHVybiBmZXRjaChgJHt0aGlzLm9wdHMuaG9zdH0vJHt0aGlzLmlkfS9sb2dvdXQ/cmVkaXJlY3Q9JHtyZWRpcmVjdH1gLCB7XG4gICAgICBtZXRob2Q6ICdnZXQnLFxuICAgICAgY3JlZGVudGlhbHM6ICdpbmNsdWRlJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuICAgICAgfVxuICAgIH0pXG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5jb25zdCBkYXRhVVJJdG9GaWxlID0gcmVxdWlyZSgnLi4vdXRpbHMvZGF0YVVSSXRvRmlsZScpXG5cbi8qKlxuICogV2ViY2FtIFBsdWdpblxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFdlYmNhbSB7XG4gIGNvbnN0cnVjdG9yIChvcHRzID0ge30sIHBhcmFtcyA9IHt9KSB7XG4gICAgdGhpcy5fdXNlck1lZGlhXG4gICAgdGhpcy51c2VyTWVkaWEgPSB0cnVlXG4gICAgdGhpcy5wcm90b2NvbCA9IGxvY2F0aW9uLnByb3RvY29sLm1hdGNoKC9odHRwcy9pKSA/ICdodHRwcycgOiAnaHR0cCdcblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIGVuYWJsZUZsYXNoOiB0cnVlLFxuICAgICAgbW9kZXM6IFtdXG4gICAgfVxuXG4gICAgY29uc3QgZGVmYXVsdFBhcmFtcyA9IHtcbiAgICAgIHN3ZlVSTDogJ3dlYmNhbS5zd2YnLFxuICAgICAgd2lkdGg6IDQwMCxcbiAgICAgIGhlaWdodDogMzAwLFxuICAgICAgZGVzdF93aWR0aDogODAwLCAgICAgICAgIC8vIHNpemUgb2YgY2FwdHVyZWQgaW1hZ2VcbiAgICAgIGRlc3RfaGVpZ2h0OiA2MDAsICAgICAgICAvLyB0aGVzZSBkZWZhdWx0IHRvIHdpZHRoL2hlaWdodFxuICAgICAgaW1hZ2VfZm9ybWF0OiAnanBlZycsICAvLyBpbWFnZSBmb3JtYXQgKG1heSBiZSBqcGVnIG9yIHBuZylcbiAgICAgIGpwZWdfcXVhbGl0eTogOTAsICAgICAgLy8ganBlZyBpbWFnZSBxdWFsaXR5IGZyb20gMCAod29yc3QpIHRvIDEwMCAoYmVzdClcbiAgICAgIGVuYWJsZV9mbGFzaDogdHJ1ZSwgICAgLy8gZW5hYmxlIGZsYXNoIGZhbGxiYWNrLFxuICAgICAgZm9yY2VfZmxhc2g6IGZhbHNlLCAgICAvLyBmb3JjZSBmbGFzaCBtb2RlLFxuICAgICAgZmxpcF9ob3JpejogZmFsc2UsICAgICAvLyBmbGlwIGltYWdlIGhvcml6IChtaXJyb3IgbW9kZSlcbiAgICAgIGZwczogMzAsICAgICAgICAgICAgICAgLy8gY2FtZXJhIGZyYW1lcyBwZXIgc2Vjb25kXG4gICAgICB1cGxvYWRfbmFtZTogJ3dlYmNhbScsIC8vIG5hbWUgb2YgZmlsZSBpbiB1cGxvYWQgcG9zdCBkYXRhXG4gICAgICBjb25zdHJhaW50czogbnVsbCwgICAgIC8vIGN1c3RvbSB1c2VyIG1lZGlhIGNvbnN0cmFpbnRzLFxuICAgICAgZmxhc2hOb3REZXRlY3RlZFRleHQ6ICdFUlJPUjogTm8gQWRvYmUgRmxhc2ggUGxheWVyIGRldGVjdGVkLiAgV2ViY2FtLmpzIHJlbGllcyBvbiBGbGFzaCBmb3IgYnJvd3NlcnMgdGhhdCBkbyBub3Qgc3VwcG9ydCBnZXRVc2VyTWVkaWEgKGxpa2UgeW91cnMpLicsXG4gICAgICBub0ludGVyZmFjZUZvdW5kVGV4dDogJ05vIHN1cHBvcnRlZCB3ZWJjYW0gaW50ZXJmYWNlIGZvdW5kLicsXG4gICAgICB1bmZyZWV6ZV9zbmFwOiB0cnVlICAgIC8vIFdoZXRoZXIgdG8gdW5mcmVlemUgdGhlIGNhbWVyYSBhZnRlciBzbmFwIChkZWZhdWx0cyB0byB0cnVlKVxuICAgIH1cblxuICAgIHRoaXMucGFyYW1zID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdFBhcmFtcywgcGFyYW1zKVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcblxuICAgIC8vIENhbWVyYSBjb250cm9sc1xuICAgIHRoaXMuc3RhcnQgPSB0aGlzLnN0YXJ0LmJpbmQodGhpcylcbiAgICB0aGlzLmluaXQgPSB0aGlzLmluaXQuYmluZCh0aGlzKVxuICAgIHRoaXMuc3RvcCA9IHRoaXMuc3RvcC5iaW5kKHRoaXMpXG4gICAgLy8gdGhpcy5zdGFydFJlY29yZGluZyA9IHRoaXMuc3RhcnRSZWNvcmRpbmcuYmluZCh0aGlzKVxuICAgIC8vIHRoaXMuc3RvcFJlY29yZGluZyA9IHRoaXMuc3RvcFJlY29yZGluZy5iaW5kKHRoaXMpXG4gICAgdGhpcy50YWtlU25hcHNob3QgPSB0aGlzLnRha2VTbmFwc2hvdC5iaW5kKHRoaXMpXG4gICAgdGhpcy5nZXRJbWFnZSA9IHRoaXMuZ2V0SW1hZ2UuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0U1dGSFRNTCA9IHRoaXMuZ2V0U1dGSFRNTC5iaW5kKHRoaXMpXG4gICAgdGhpcy5kZXRlY3RGbGFzaCA9IHRoaXMuZGV0ZWN0Rmxhc2guYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0VXNlck1lZGlhID0gdGhpcy5nZXRVc2VyTWVkaWEuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0TWVkaWFEZXZpY2VzID0gdGhpcy5nZXRNZWRpYURldmljZXMuYmluZCh0aGlzKVxuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBmb3IgZ2V0VXNlck1lZGlhIHN1cHBvcnRcbiAgICovXG4gIGluaXQgKCkge1xuICAgIC8vIGluaXRpYWxpemUsIGNoZWNrIGZvciBnZXRVc2VyTWVkaWEgc3VwcG9ydFxuICAgIHRoaXMubWVkaWFEZXZpY2VzID0gdGhpcy5nZXRNZWRpYURldmljZXMoKVxuXG4gICAgdGhpcy51c2VyTWVkaWEgPSB0aGlzLmdldFVzZXJNZWRpYSh0aGlzLm1lZGlhRGV2aWNlcylcblxuICAgIC8vIE1ha2Ugc3VyZSBtZWRpYSBzdHJlYW0gaXMgY2xvc2VkIHdoZW4gbmF2aWdhdGluZyBhd2F5IGZyb20gcGFnZVxuICAgIGlmICh0aGlzLnVzZXJNZWRpYSkge1xuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsIChldmVudCkgPT4ge1xuICAgICAgICB0aGlzLnJlc2V0KClcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lZGlhRGV2aWNlczogdGhpcy5tZWRpYURldmljZXMsXG4gICAgICB1c2VyTWVkaWE6IHRoaXMudXNlck1lZGlhXG4gICAgfVxuICB9XG5cbiAgLy8gU2V0dXAgZ2V0VXNlck1lZGlhLCB3aXRoIHBvbHlmaWxsIGZvciBvbGRlciBicm93c2Vyc1xuICAvLyBBZGFwdGVkIGZyb206IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9NZWRpYURldmljZXMvZ2V0VXNlck1lZGlhXG4gIGdldE1lZGlhRGV2aWNlcyAoKSB7XG4gICAgcmV0dXJuIChuYXZpZ2F0b3IubWVkaWFEZXZpY2VzICYmIG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKVxuICAgICAgPyBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzIDogKChuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhIHx8IG5hdmlnYXRvci53ZWJraXRHZXRVc2VyTWVkaWEpID8ge1xuICAgICAgICBnZXRVc2VyTWVkaWE6IGZ1bmN0aW9uIChvcHRzKSB7XG4gICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgICAgICAgIChuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhIHx8XG4gICAgICAgICAgICBuYXZpZ2F0b3Iud2Via2l0R2V0VXNlck1lZGlhKS5jYWxsKG5hdmlnYXRvciwgb3B0cywgcmVzb2x2ZSwgcmVqZWN0KVxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH0gOiBudWxsKVxuICB9XG5cbiAgZ2V0VXNlck1lZGlhIChtZWRpYURldmljZXMpIHtcbiAgICBjb25zdCB1c2VyTWVkaWEgPSB0cnVlXG4gICAgLy8gT2xkZXIgdmVyc2lvbnMgb2YgZmlyZWZveCAoPCAyMSkgYXBwYXJlbnRseSBjbGFpbSBzdXBwb3J0IGJ1dCB1c2VyIG1lZGlhIGRvZXMgbm90IGFjdHVhbGx5IHdvcmtcbiAgICBpZiAobmF2aWdhdG9yLnVzZXJBZ2VudC5tYXRjaCgvRmlyZWZveFxcRCsoXFxkKykvKSkge1xuICAgICAgaWYgKHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApIDwgMjEpIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICB3aW5kb3cuVVJMID0gd2luZG93LlVSTCB8fCB3aW5kb3cud2Via2l0VVJMIHx8IHdpbmRvdy5tb3pVUkwgfHwgd2luZG93Lm1zVVJMXG4gICAgcmV0dXJuIHVzZXJNZWRpYSAmJiAhIW1lZGlhRGV2aWNlcyAmJiAhIXdpbmRvdy5VUkxcbiAgfVxuXG4gIHN0YXJ0ICgpIHtcbiAgICB0aGlzLnVzZXJNZWRpYSA9IHRoaXMuX3VzZXJNZWRpYSA9PT0gdW5kZWZpbmVkID8gdGhpcy51c2VyTWVkaWEgOiB0aGlzLl91c2VyTWVkaWFcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgaWYgKHRoaXMudXNlck1lZGlhKSB7XG4gICAgICAgIGNvbnN0IGFjY2VwdHNBdWRpbyA9IHRoaXMub3B0cy5tb2Rlcy5pbmRleE9mKCd2aWRlby1hdWRpbycpICE9PSAtMSB8fFxuICAgICAgICAgIHRoaXMub3B0cy5tb2Rlcy5pbmRleE9mKCdhdWRpby1vbmx5JykgIT09IC0xXG4gICAgICAgIGNvbnN0IGFjY2VwdHNWaWRlbyA9IHRoaXMub3B0cy5tb2Rlcy5pbmRleE9mKCd2aWRlby1hdWRpbycpICE9PSAtMSB8fFxuICAgICAgICAgIHRoaXMub3B0cy5tb2Rlcy5pbmRleE9mKCd2aWRlby1vbmx5JykgIT09IC0xIHx8XG4gICAgICAgICAgdGhpcy5vcHRzLm1vZGVzLmluZGV4T2YoJ3BpY3R1cmUnKSAhPT0gLTFcblxuICAgICAgICAvLyBhc2sgdXNlciBmb3IgYWNjZXNzIHRvIHRoZWlyIGNhbWVyYVxuICAgICAgICB0aGlzLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoe1xuICAgICAgICAgIGF1ZGlvOiBhY2NlcHRzQXVkaW8sXG4gICAgICAgICAgdmlkZW86IGFjY2VwdHNWaWRlb1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoc3RyZWFtKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUoc3RyZWFtKVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogRGV0ZWN0cyBpZiBicm93c2VyIHN1cHBvcnRzIGZsYXNoXG4gICAqIENvZGUgc25pcHBldCBib3Jyb3dlZCBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vc3dmb2JqZWN0L3N3Zm9iamVjdFxuICAgKlxuICAgKiBAcmV0dXJuIHtib29sfSBmbGFzaCBzdXBwb3J0ZWRcbiAgICovXG4gIGRldGVjdEZsYXNoICgpIHtcbiAgICBjb25zdCBTSE9DS1dBVkVfRkxBU0ggPSAnU2hvY2t3YXZlIEZsYXNoJ1xuICAgIGNvbnN0IFNIT0NLV0FWRV9GTEFTSF9BWCA9ICdTaG9ja3dhdmVGbGFzaC5TaG9ja3dhdmVGbGFzaCdcbiAgICBjb25zdCBGTEFTSF9NSU1FX1RZUEUgPSAnYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2gnXG4gICAgY29uc3Qgd2luID0gd2luZG93XG4gICAgY29uc3QgbmF2ID0gbmF2aWdhdG9yXG4gICAgbGV0IGhhc0ZsYXNoID0gZmFsc2VcblxuICAgIGlmICh0eXBlb2YgbmF2LnBsdWdpbnMgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBuYXYucGx1Z2luc1tTSE9DS1dBVkVfRkxBU0hdID09PSAnb2JqZWN0Jykge1xuICAgICAgdmFyIGRlc2MgPSBuYXYucGx1Z2luc1tTSE9DS1dBVkVfRkxBU0hdLmRlc2NyaXB0aW9uXG4gICAgICBpZiAoZGVzYyAmJiAodHlwZW9mIG5hdi5taW1lVHlwZXMgIT09ICd1bmRlZmluZWQnICYmIG5hdi5taW1lVHlwZXNbRkxBU0hfTUlNRV9UWVBFXSAmJiBuYXYubWltZVR5cGVzW0ZMQVNIX01JTUVfVFlQRV0uZW5hYmxlZFBsdWdpbikpIHtcbiAgICAgICAgaGFzRmxhc2ggPSB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygd2luLkFjdGl2ZVhPYmplY3QgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YXIgYXggPSBuZXcgd2luLkFjdGl2ZVhPYmplY3QoU0hPQ0tXQVZFX0ZMQVNIX0FYKVxuICAgICAgICBpZiAoYXgpIHtcbiAgICAgICAgICB2YXIgdmVyID0gYXguR2V0VmFyaWFibGUoJyR2ZXJzaW9uJylcbiAgICAgICAgICBpZiAodmVyKSBoYXNGbGFzaCA9IHRydWVcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICB9XG5cbiAgICByZXR1cm4gaGFzRmxhc2hcbiAgfVxuXG4gIHJlc2V0ICgpIHtcbiAgICAvLyBzaHV0ZG93biBjYW1lcmEsIHJlc2V0IHRvIHBvdGVudGlhbGx5IGF0dGFjaCBhZ2FpblxuICAgIGlmICh0aGlzLnByZXZpZXdfYWN0aXZlKSB0aGlzLnVuZnJlZXplKClcblxuICAgIGlmICh0aGlzLnVzZXJNZWRpYSkge1xuICAgICAgaWYgKHRoaXMuc3RyZWFtKSB7XG4gICAgICAgIGlmICh0aGlzLnN0cmVhbS5nZXRWaWRlb1RyYWNrcykge1xuICAgICAgICAgIC8vIGdldCB2aWRlbyB0cmFjayB0byBjYWxsIHN0b3Agb24gaXRcbiAgICAgICAgICB2YXIgdHJhY2tzID0gdGhpcy5zdHJlYW0uZ2V0VmlkZW9UcmFja3MoKVxuICAgICAgICAgIGlmICh0cmFja3MgJiYgdHJhY2tzWzBdICYmIHRyYWNrc1swXS5zdG9wKSB0cmFja3NbMF0uc3RvcCgpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdHJlYW0uc3RvcCkge1xuICAgICAgICAgIC8vIGRlcHJlY2F0ZWQsIG1heSBiZSByZW1vdmVkIGluIGZ1dHVyZVxuICAgICAgICAgIHRoaXMuc3RyZWFtLnN0b3AoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkZWxldGUgdGhpcy5zdHJlYW1cbiAgICB9XG5cbiAgICBpZiAodGhpcy51c2VyTWVkaWEgIT09IHRydWUpIHtcbiAgICAgIC8vIGNhbGwgZm9yIHR1cm4gb2ZmIGNhbWVyYSBpbiBmbGFzaFxuICAgICAgdGhpcy5nZXRNb3ZpZSgpLl9yZWxlYXNlQ2FtZXJhKClcbiAgICB9XG4gIH1cblxuICBnZXRTV0ZIVE1MICgpIHtcbiAgICAvLyBSZXR1cm4gSFRNTCBmb3IgZW1iZWRkaW5nIGZsYXNoIGJhc2VkIHdlYmNhbSBjYXB0dXJlIG1vdmllXG4gICAgdmFyIHN3ZlVSTCA9IHRoaXMucGFyYW1zLnN3ZlVSTFxuXG4gICAgLy8gbWFrZSBzdXJlIHdlIGFyZW4ndCBydW5uaW5nIGxvY2FsbHkgKGZsYXNoIGRvZXNuJ3Qgd29yaylcbiAgICBpZiAobG9jYXRpb24ucHJvdG9jb2wubWF0Y2goL2ZpbGUvKSkge1xuICAgICAgcmV0dXJuICc8aDMgc3R5bGU9XCJjb2xvcjpyZWRcIj5FUlJPUjogdGhlIFdlYmNhbS5qcyBGbGFzaCBmYWxsYmFjayBkb2VzIG5vdCB3b3JrIGZyb20gbG9jYWwgZGlzay4gIFBsZWFzZSBydW4gaXQgZnJvbSBhIHdlYiBzZXJ2ZXIuPC9oMz4nXG4gICAgfVxuXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgZmxhc2hcbiAgICBpZiAoIXRoaXMuZGV0ZWN0Rmxhc2goKSkge1xuICAgICAgcmV0dXJuICc8aDMgc3R5bGU9XCJjb2xvcjpyZWRcIj5ObyBmbGFzaDwvaDM+J1xuICAgIH1cblxuICAgIC8vIHNldCBkZWZhdWx0IHN3ZlVSTCBpZiBub3QgZXhwbGljaXRseSBzZXRcbiAgICBpZiAoIXN3ZlVSTCkge1xuICAgICAgLy8gZmluZCBvdXIgc2NyaXB0IHRhZywgYW5kIHVzZSB0aGF0IGJhc2UgVVJMXG4gICAgICB2YXIgYmFzZVVybCA9ICcnXG4gICAgICB2YXIgc2NwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylcbiAgICAgIGZvciAodmFyIGlkeCA9IDAsIGxlbiA9IHNjcHRzLmxlbmd0aDsgaWR4IDwgbGVuOyBpZHgrKykge1xuICAgICAgICB2YXIgc3JjID0gc2NwdHNbaWR4XS5nZXRBdHRyaWJ1dGUoJ3NyYycpXG4gICAgICAgIGlmIChzcmMgJiYgc3JjLm1hdGNoKC9cXC93ZWJjYW0oXFwubWluKT9cXC5qcy8pKSB7XG4gICAgICAgICAgYmFzZVVybCA9IHNyYy5yZXBsYWNlKC9cXC93ZWJjYW0oXFwubWluKT9cXC5qcy4qJC8sICcnKVxuICAgICAgICAgIGlkeCA9IGxlblxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYmFzZVVybCkgc3dmVVJMID0gYmFzZVVybCArICcvd2ViY2FtLnN3ZidcbiAgICAgIGVsc2Ugc3dmVVJMID0gJ3dlYmNhbS5zd2YnXG4gICAgfVxuXG4gICAgLy8gLy8gaWYgdGhpcyBpcyB0aGUgdXNlcidzIGZpcnN0IHZpc2l0LCBzZXQgZmxhc2h2YXIgc28gZmxhc2ggcHJpdmFjeSBzZXR0aW5ncyBwYW5lbCBpcyBzaG93biBmaXJzdFxuICAgIC8vIGlmICh3aW5kb3cubG9jYWxTdG9yYWdlICYmICFsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndmlzaXRlZCcpKSB7XG4gICAgLy8gICAvLyB0aGlzLnBhcmFtcy5uZXdfdXNlciA9IDFcbiAgICAvLyAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCd2aXNpdGVkJywgMSlcbiAgICAvLyB9XG4gICAgLy8gdGhpcy5wYXJhbXMubmV3X3VzZXIgPSAxXG4gICAgLy8gY29uc3RydWN0IGZsYXNodmFycyBzdHJpbmdcbiAgICB2YXIgZmxhc2h2YXJzID0gJydcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5wYXJhbXMpIHtcbiAgICAgIGlmIChmbGFzaHZhcnMpIGZsYXNodmFycyArPSAnJidcbiAgICAgIGZsYXNodmFycyArPSBrZXkgKyAnPScgKyBlc2NhcGUodGhpcy5wYXJhbXNba2V5XSlcbiAgICB9XG5cbiAgICAvLyBjb25zdHJ1Y3Qgb2JqZWN0L2VtYmVkIHRhZ1xuXG4gICAgcmV0dXJuIGA8b2JqZWN0IGNsYXNzaWQ9XCJjbHNpZDpkMjdjZGI2ZS1hZTZkLTExY2YtOTZiOC00NDQ1NTM1NDAwMDBcIiB0eXBlPVwiYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2hcIiBjb2RlYmFzZT1cIiR7dGhpcy5wcm90b2NvbH06Ly9kb3dubG9hZC5tYWNyb21lZGlhLmNvbS9wdWIvc2hvY2t3YXZlL2NhYnMvZmxhc2gvc3dmbGFzaC5jYWIjdmVyc2lvbj05LDAsMCwwXCIgd2lkdGg9XCIke3RoaXMucGFyYW1zLndpZHRofVwiIGhlaWdodD1cIiR7dGhpcy5wYXJhbXMuaGVpZ2h0fVwiIGlkPVwid2ViY2FtX21vdmllX29ialwiIGFsaWduPVwibWlkZGxlXCI+PHBhcmFtIG5hbWU9XCJ3bW9kZVwiIHZhbHVlPVwib3BhcXVlXCIgLz48cGFyYW0gbmFtZT1cImFsbG93U2NyaXB0QWNjZXNzXCIgdmFsdWU9XCJhbHdheXNcIiAvPjxwYXJhbSBuYW1lPVwiYWxsb3dGdWxsU2NyZWVuXCIgdmFsdWU9XCJmYWxzZVwiIC8+PHBhcmFtIG5hbWU9XCJtb3ZpZVwiIHZhbHVlPVwiJHtzd2ZVUkx9XCIgLz48cGFyYW0gbmFtZT1cImxvb3BcIiB2YWx1ZT1cImZhbHNlXCIgLz48cGFyYW0gbmFtZT1cIm1lbnVcIiB2YWx1ZT1cImZhbHNlXCIgLz48cGFyYW0gbmFtZT1cInF1YWxpdHlcIiB2YWx1ZT1cImJlc3RcIiAvPjxwYXJhbSBuYW1lPVwiYmdjb2xvclwiIHZhbHVlPVwiI2ZmZmZmZlwiIC8+PHBhcmFtIG5hbWU9XCJmbGFzaHZhcnNcIiB2YWx1ZT1cIiR7Zmxhc2h2YXJzfVwiLz48ZW1iZWQgaWQ9XCJ3ZWJjYW1fbW92aWVfZW1iZWRcIiBzcmM9XCIke3N3ZlVSTH1cIiB3bW9kZT1cIm9wYXF1ZVwiIGxvb3A9XCJmYWxzZVwiIG1lbnU9XCJmYWxzZVwiIHF1YWxpdHk9XCJiZXN0XCIgYmdjb2xvcj1cIiNmZmZmZmZcIiB3aWR0aD1cIiR7dGhpcy5wYXJhbXMud2lkdGh9XCIgaGVpZ2h0PVwiJHt0aGlzLnBhcmFtcy5oZWlnaHR9XCIgbmFtZT1cIndlYmNhbV9tb3ZpZV9lbWJlZFwiIGFsaWduPVwibWlkZGxlXCIgYWxsb3dTY3JpcHRBY2Nlc3M9XCJhbHdheXNcIiBhbGxvd0Z1bGxTY3JlZW49XCJmYWxzZVwiIHR5cGU9XCJhcHBsaWNhdGlvbi94LXNob2Nrd2F2ZS1mbGFzaFwiIHBsdWdpbnNwYWdlPVwiaHR0cDovL3d3dy5tYWNyb21lZGlhLmNvbS9nby9nZXRmbGFzaHBsYXllclwiIGZsYXNodmFycz1cIiR7Zmxhc2h2YXJzfVwiPjwvZW1iZWQ+PC9vYmplY3Q+YFxuICB9XG5cbiAgZ2V0TW92aWUgKCkge1xuICAgIC8vIGdldCByZWZlcmVuY2UgdG8gbW92aWUgb2JqZWN0L2VtYmVkIGluIERPTVxuICAgIHZhciBtb3ZpZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3ZWJjYW1fbW92aWVfb2JqJylcbiAgICBpZiAoIW1vdmllIHx8ICFtb3ZpZS5fc25hcCkgbW92aWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnd2ViY2FtX21vdmllX2VtYmVkJylcbiAgICBpZiAoIW1vdmllKSBjb25zb2xlLmxvZygnZ2V0TW92aWUgZXJyb3InKVxuICAgIHJldHVybiBtb3ZpZVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIHRoZSB3ZWJjYW0gY2FwdHVyZSBhbmQgdmlkZW8gcGxheWJhY2suXG4gICAqL1xuICBzdG9wICgpIHtcbiAgICBsZXQgeyB2aWRlb1N0cmVhbSB9ID0gdGhpc1xuXG4gICAgdGhpcy51cGRhdGVTdGF0ZSh7XG4gICAgICBjYW1lcmFSZWFkeTogZmFsc2VcbiAgICB9KVxuXG4gICAgaWYgKHZpZGVvU3RyZWFtKSB7XG4gICAgICBpZiAodmlkZW9TdHJlYW0uc3RvcCkge1xuICAgICAgICB2aWRlb1N0cmVhbS5zdG9wKClcbiAgICAgIH0gZWxzZSBpZiAodmlkZW9TdHJlYW0ubXNTdG9wKSB7XG4gICAgICAgIHZpZGVvU3RyZWFtLm1zU3RvcCgpXG4gICAgICB9XG5cbiAgICAgIHZpZGVvU3RyZWFtLm9uZW5kZWQgPSBudWxsXG4gICAgICB2aWRlb1N0cmVhbSA9IG51bGxcbiAgICB9XG4gIH1cblxuICBmbGFzaE5vdGlmeSAodHlwZSwgbXNnKSB7XG4gICAgLy8gcmVjZWl2ZSBub3RpZmljYXRpb24gZnJvbSBmbGFzaCBhYm91dCBldmVudFxuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnZmxhc2hMb2FkQ29tcGxldGUnOlxuICAgICAgICAvLyBtb3ZpZSBsb2FkZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICAgIGJyZWFrXG5cbiAgICAgIGNhc2UgJ2NhbWVyYUxpdmUnOlxuICAgICAgICAvLyBjYW1lcmEgaXMgbGl2ZSBhbmQgcmVhZHkgdG8gc25hcFxuICAgICAgICB0aGlzLmxpdmUgPSB0cnVlXG4gICAgICAgIGJyZWFrXG5cbiAgICAgIGNhc2UgJ2Vycm9yJzpcbiAgICAgICAgLy8gRmxhc2ggZXJyb3JcbiAgICAgICAgY29uc29sZS5sb2coJ1RoZXJlIHdhcyBhIGZsYXNoIGVycm9yJywgbXNnKVxuICAgICAgICBicmVha1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICAvLyBjYXRjaC1hbGwgZXZlbnQsIGp1c3QgaW4gY2FzZVxuICAgICAgICBjb25zb2xlLmxvZygnd2ViY2FtIGZsYXNoX25vdGlmeTogJyArIHR5cGUgKyAnOiAnICsgbXNnKVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGNvbmZpZ3VyZSAocGFuZWwpIHtcbiAgICAvLyBvcGVuIGZsYXNoIGNvbmZpZ3VyYXRpb24gcGFuZWwgLS0gc3BlY2lmeSB0YWIgbmFtZTpcbiAgICAvLyAnY2FtZXJhJywgJ3ByaXZhY3knLCAnZGVmYXVsdCcsICdsb2NhbFN0b3JhZ2UnLCAnbWljcm9waG9uZScsICdzZXR0aW5nc01hbmFnZXInXG4gICAgaWYgKCFwYW5lbCkgcGFuZWwgPSAnY2FtZXJhJ1xuICAgIHRoaXMuZ2V0TW92aWUoKS5fY29uZmlndXJlKHBhbmVsKVxuICB9XG5cbiAgLyoqXG4gICAqIFRha2VzIGEgc25hcHNob3QgYW5kIGRpc3BsYXlzIGl0IGluIGEgY2FudmFzLlxuICAgKi9cbiAgZ2V0SW1hZ2UgKHZpZGVvLCBvcHRzKSB7XG4gICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gICAgY2FudmFzLndpZHRoID0gdmlkZW8udmlkZW9XaWR0aFxuICAgIGNhbnZhcy5oZWlnaHQgPSB2aWRlby52aWRlb0hlaWdodFxuICAgIGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpLmRyYXdJbWFnZSh2aWRlbywgMCwgMClcblxuICAgIHZhciBkYXRhVXJsID0gY2FudmFzLnRvRGF0YVVSTChvcHRzLm1pbWVUeXBlKVxuXG4gICAgdmFyIGZpbGUgPSBkYXRhVVJJdG9GaWxlKGRhdGFVcmwsIHtcbiAgICAgIG5hbWU6IG9wdHMubmFtZVxuICAgIH0pXG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YVVybDogZGF0YVVybCxcbiAgICAgIGRhdGE6IGZpbGUsXG4gICAgICB0eXBlOiBvcHRzLm1pbWVUeXBlXG4gICAgfVxuICB9XG5cbiAgdGFrZVNuYXBzaG90ICh2aWRlbywgY2FudmFzKSB7XG4gICAgY29uc3Qgb3B0cyA9IHtcbiAgICAgIG5hbWU6IGB3ZWJjYW0tJHtEYXRlLm5vdygpfS5qcGdgLFxuICAgICAgbWltZVR5cGU6ICdpbWFnZS9qcGVnJ1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlID0gdGhpcy5nZXRJbWFnZSh2aWRlbywgY2FudmFzLCBvcHRzKVxuXG4gICAgY29uc3QgdGFnRmlsZSA9IHtcbiAgICAgIHNvdXJjZTogdGhpcy5pZCxcbiAgICAgIG5hbWU6IG9wdHMubmFtZSxcbiAgICAgIGRhdGE6IGltYWdlLmRhdGEsXG4gICAgICB0eXBlOiBvcHRzLnR5cGVcbiAgICB9XG5cbiAgICByZXR1cm4gdGFnRmlsZVxuICB9XG59XG4iLCJmdW5jdGlvbiBkYXRhVVJJdG9CbG9iIChkYXRhVVJJLCBvcHRzLCB0b0ZpbGUpIHtcbiAgLy8gZ2V0IHRoZSBiYXNlNjQgZGF0YVxuICB2YXIgZGF0YSA9IGRhdGFVUkkuc3BsaXQoJywnKVsxXVxuXG4gIC8vIHVzZXIgbWF5IHByb3ZpZGUgbWltZSB0eXBlLCBpZiBub3QgZ2V0IGl0IGZyb20gZGF0YSBVUklcbiAgdmFyIG1pbWVUeXBlID0gb3B0cy5taW1lVHlwZSB8fCBkYXRhVVJJLnNwbGl0KCcsJylbMF0uc3BsaXQoJzonKVsxXS5zcGxpdCgnOycpWzBdXG5cbiAgLy8gZGVmYXVsdCB0byBwbGFpbi90ZXh0IGlmIGRhdGEgVVJJIGhhcyBubyBtaW1lVHlwZVxuICBpZiAobWltZVR5cGUgPT0gbnVsbCkge1xuICAgIG1pbWVUeXBlID0gJ3BsYWluL3RleHQnXG4gIH1cblxuICB2YXIgYmluYXJ5ID0gYXRvYihkYXRhKVxuICB2YXIgYXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGJpbmFyeS5sZW5ndGg7IGkrKykge1xuICAgIGFycmF5LnB1c2goYmluYXJ5LmNoYXJDb2RlQXQoaSkpXG4gIH1cblxuICAvLyBDb252ZXJ0IHRvIGEgRmlsZT9cbiAgaWYgKHRvRmlsZSkge1xuICAgIHJldHVybiBuZXcgRmlsZShbbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXSwgb3B0cy5uYW1lIHx8ICcnLCB7dHlwZTogbWltZVR5cGV9KVxuICB9XG5cbiAgcmV0dXJuIG5ldyBCbG9iKFtuZXcgVWludDhBcnJheShhcnJheSldLCB7dHlwZTogbWltZVR5cGV9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChkYXRhVVJJLCBvcHRzKSB7XG4gIHJldHVybiBkYXRhVVJJdG9CbG9iKGRhdGFVUkksIG9wdHMsIHRydWUpXG59XG4iLCIiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnByZXBlbmRPbmNlTGlzdGVuZXIgPSBub29wO1xuXG5wcm9jZXNzLmxpc3RlbmVycyA9IGZ1bmN0aW9uIChuYW1lKSB7IHJldHVybiBbXSB9XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiY29uc3QgVXBweSA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9jb3JlJylcbmNvbnN0IERhc2hib2FyZCA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZCcpXG5jb25zdCBHb29nbGVEcml2ZSA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL0dvb2dsZURyaXZlJylcbmNvbnN0IERyb3Bib3ggPSByZXF1aXJlKCcuLi8uLi8uLi8uLi9zcmMvcGx1Z2lucy9Ecm9wYm94JylcbmNvbnN0IFdlYmNhbSA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL1dlYmNhbScpXG5jb25zdCBUdXMxMCA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL1R1czEwJylcbmNvbnN0IE1ldGFEYXRhID0gcmVxdWlyZSgnLi4vLi4vLi4vLi4vc3JjL3BsdWdpbnMvTWV0YURhdGEnKVxuY29uc3QgSW5mb3JtZXIgPSByZXF1aXJlKCcuLi8uLi8uLi8uLi9zcmMvcGx1Z2lucy9JbmZvcm1lcicpXG5cbmNvbnN0IFVQUFlfU0VSVkVSID0gcmVxdWlyZSgnLi4vZW52JylcblxuY29uc3QgUFJPVE9DT0wgPSBsb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyAnaHR0cHMnIDogJ2h0dHAnXG5jb25zdCBUVVNfRU5EUE9JTlQgPSBQUk9UT0NPTCArICc6Ly9tYXN0ZXIudHVzLmlvL2ZpbGVzLydcblxuZnVuY3Rpb24gdXBweUluaXQgKCkge1xuICBjb25zdCBvcHRzID0gd2luZG93LnVwcHlPcHRpb25zXG4gIGNvbnN0IGRhc2hib2FyZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLlVwcHlEYXNoYm9hcmQnKVxuICBpZiAoZGFzaGJvYXJkRWwpIHtcbiAgICBjb25zdCBkYXNoYm9hcmRFbFBhcmVudCA9IGRhc2hib2FyZEVsLnBhcmVudE5vZGVcbiAgICBkYXNoYm9hcmRFbFBhcmVudC5yZW1vdmVDaGlsZChkYXNoYm9hcmRFbClcbiAgfVxuXG4gIGNvbnN0IHVwcHkgPSBVcHB5KHtkZWJ1ZzogdHJ1ZSwgYXV0b1Byb2NlZWQ6IG9wdHMuYXV0b1Byb2NlZWR9KVxuICB1cHB5LnVzZShEYXNoYm9hcmQsIHtcbiAgICB0cmlnZ2VyOiAnLlVwcHlNb2RhbE9wZW5lckJ0bicsXG4gICAgaW5saW5lOiBvcHRzLkRhc2hib2FyZElubGluZSxcbiAgICB0YXJnZXQ6IG9wdHMuRGFzaGJvYXJkSW5saW5lID8gJy5EYXNoYm9hcmRDb250YWluZXInIDogJ2JvZHknXG4gIH0pXG5cbiAgaWYgKG9wdHMuR29vZ2xlRHJpdmUpIHtcbiAgICB1cHB5LnVzZShHb29nbGVEcml2ZSwge3RhcmdldDogRGFzaGJvYXJkLCBob3N0OiBVUFBZX1NFUlZFUn0pXG4gIH1cblxuICBpZiAob3B0cy5Ecm9wYm94KSB7XG4gICAgdXBweS51c2UoRHJvcGJveCwge3RhcmdldDogRGFzaGJvYXJkLCBob3N0OiBVUFBZX1NFUlZFUn0pXG4gIH1cblxuICBpZiAob3B0cy5XZWJjYW0pIHtcbiAgICB1cHB5LnVzZShXZWJjYW0sIHt0YXJnZXQ6IERhc2hib2FyZH0pXG4gIH1cblxuICB1cHB5LnVzZShUdXMxMCwge2VuZHBvaW50OiBUVVNfRU5EUE9JTlQsIHJlc3VtZTogdHJ1ZX0pXG4gIHVwcHkudXNlKEluZm9ybWVyLCB7dGFyZ2V0OiBEYXNoYm9hcmR9KVxuICB1cHB5LnVzZShNZXRhRGF0YSwge1xuICAgIGZpZWxkczogW1xuICAgICAgeyBpZDogJ3Jlc2l6ZVRvJywgbmFtZTogJ1Jlc2l6ZSB0bycsIHZhbHVlOiAxMjAwLCBwbGFjZWhvbGRlcjogJ3NwZWNpZnkgZnV0dXJlIGltYWdlIHNpemUnIH0sXG4gICAgICB7IGlkOiAnZGVzY3JpcHRpb24nLCBuYW1lOiAnRGVzY3JpcHRpb24nLCB2YWx1ZTogJ25vbmUnLCBwbGFjZWhvbGRlcjogJ2Rlc2NyaWJlIHdoYXQgdGhlIGZpbGUgaXMgZm9yJyB9XG4gICAgXVxuICB9KVxuICB1cHB5LnJ1bigpXG5cbiAgdXBweS5vbignY29yZTpzdWNjZXNzJywgKGZpbGVDb3VudCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdZbywgdXBsb2FkZWQ6ICcgKyBmaWxlQ291bnQpXG4gIH0pXG59XG5cbnVwcHlJbml0KClcbndpbmRvdy51cHB5SW5pdCA9IHVwcHlJbml0XG4iLCJsZXQgdXBweVNlcnZlckVuZHBvaW50ID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAyMCdcblxuaWYgKGxvY2F0aW9uLmhvc3RuYW1lID09PSAndXBweS5pbycpIHtcbiAgdXBweVNlcnZlckVuZHBvaW50ID0gJy8vc2VydmVyLnVwcHkuaW8nXG59XG5cbmNvbnN0IFVQUFlfU0VSVkVSID0gdXBweVNlcnZlckVuZHBvaW50XG5tb2R1bGUuZXhwb3J0cyA9IFVQUFlfU0VSVkVSXG4iXX0=
