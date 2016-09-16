require('colors')

const lodash = require('lodash')

function start (options = {}, context = {}, ready = function() {}) {
  options = lodash.defaults(options, {
    terminal: true,
    colors: true,
    ignoreUndefined: true,
    prompt: `${'OpenCollective'.cyan}${'> '.grey}`,
    input: process.stdin,
    output: process.stdout,
    useGlobal: true
  })

  const server = require('repl').start(options)

  Object.keys(context).forEach(key => {
    Object.defineProperty(server.context, key, {
      configurable: true,
      enumerable: true,
      get: function() {
        return context[key]
      }
    })
  })

  try {
    promisify(server)
  } catch (error) {
    ready(error)
    return
  }

  ready && ready(server)

  return server
}

/* eslint-disable */
export function promisify (repl) {
  var realEval = repl.eval;
  var promiseEval = function (cmd, context, filename, callback) {
    realEval.call(repl, cmd, context, filename, function (err, res) {
      // Error response
      if (err) {
        return callback(err);
      }

      // Non-thenable response
      if (!res || typeof res.then != 'function') {
        return callback(null, res);
      }

      // Thenable detected; extract value/error from it

      // Start listening for escape characters, to quit waiting on the promise
      var cancel = function (chunk, key) {
        repl.outputStream.write('break.\n');
        if (key.name === 'escape') {
          process.stdin.removeListener('keypress', cancel);
          callback(null, res);
          // Ensure we don't call the callback again
          callback = function () {};
        }
      };
      process.stdin.on('keypress', cancel);

      // Start a timer indicating that escape can be used to quit
      var hangTimer = setTimeout(function () {
        repl.outputStream.write('Hit escape to stop waiting on promise\n');
      }, 5000);

      res.then(function (val) {
        process.stdin.removeListener('keypress', cancel);
        clearTimeout(hangTimer);
        callback(null, val)
      }, function (err) {
        process.stdin.removeListener('keypress', cancel);
        clearTimeout(hangTimer);
        repl.outputStream.write('Promise rejected: ');
        callback(err);
      }).then(null, function (uncaught) {
        // Rethrow uncaught exceptions
        process.nextTick(function () {
          throw uncaught;
        });
      });
    });
  };

  repl.eval = promiseEval;

  repl.commands['promise'] = {
    help: 'Toggle auto-promise unwrapping',
    action: function () {
      if (repl.eval === promiseEval) {
        this.outputStream.write('Promise auto-eval disabled\n');
        repl.eval = realEval;
      } else {
        this.outputStream.write('Promise auto-eval enabled\n');
        repl.eval = promiseEval;
      }
      this.displayPrompt();
    }
  }
}

module.exports = start
