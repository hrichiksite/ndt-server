/* jshint esversion: 6, asi: true */
// ndt7 is a simple ndt7 client API.

const ndt7 = (function() {

  // cb creates a default-empty callback function, allowing library users to only need to specify callback functions for the events they care about.
  var cb = function(name, callbacks) {
    if (typeof(callbacks) != "undefined" && name in callbacks) {
      return callbacks[name];
    }
    return function(arg){ console.log(name, ": ", arg); };
  };

  var discoverServerURLs = async function(callbacks, config) {
    if (config && ('server' in config)) {
      return {
        'ws:///ndt/v7/download':  'ws://' + config.server + '/ndt/v7/download',
        'ws:///ndt/v7/upload':  'ws://' + config.server + '/ndt/v7/upload',
        'wss:///ndt/v7/download':  'wss://' + config.server + '/ndt/v7/download',
        'wss:///ndt/v7/upload':  'wss://' + config.server + '/ndt/v7/upload'
      };
    }
    // If no server was specified then use a loadbalancer. If no loadbalancer is specified, use the locate service from Measurement Lab.
    const lbURL = (config && (loadbalancer in config)) ? config.loadbalancer : new URL('https://locate-dot-mlab-staging.appspot.com/v2beta1/query/ndt/ndt7');
    callbacks.serverDiscovery({loadbalancer: lbURL});
    const response = await fetch(lbURL);
    const js = await response.json();
    if (! ('results' in js) ) {
      callbacks.error("Could not understand response from " + lbURL + ": " + js);
      return {};
    }
    const choice = js.results[Math.floor(Math.random() * js.results.length)];
    callbacks.serverChosen(choice);
    return choice.urls;
  };

  return {
    test: async function(userCallbacks, config) {
      const callbacks = {
        error: cb('error', userCallbacks),
        serverDiscovery: cb('serverDiscovery', userCallbacks),
        serverChosen: cb('serverChosen', userCallbacks),
        downloadStart: cb('downloadStart', userCallbacks),
        downloadMeasurement: cb('downloadMeasurement', userCallbacks),
        downloadComplete: cb('downloadComplete', userCallbacks),
        //startingUpload: function(e){},
        //finishingUpload: function(e){},
      };

      // Starts the asynchronous process of server discovery, allowing other stuff to proceed in the background.
      const urlPromise = discoverServerURLs(callbacks, config);

      // Set up the webworker to run.
      const downloadWorker = new Worker('./ndt7-download-worker.js');
      downloadWorker.terminated = false;
      downloadWorker.onmessage = function (ev) {
        if (ev.data == null || ev.data.MsgType == 'error') {
          downloadWorker.terminated = true;
          downloadWorker.terminate();
          const errMsg = (ev.data == null) ? 'There was a download error' : ev.data.Error; 
          callbacks.error(errMsg);
        } else if (ev.data.MsgType == 'measurement') {
          callbacks.downloadMeasurement({
            Source: ev.data.Source, 
            Data: ev.data.Data
          });
        } else if (ev.data.MsgType == 'complete') {
          callbacks.downloadComplete({
            Data: ev.data.Data
          });
        };
      };

      // TODO: Make sure the worker times out in 13 seconds no matter what.

      const urls = await urlPromise;
      downloadWorker.postMessage(urls);

      // TODO: await the termination of the downloadWorker.
    }
    /*,
    // run runs the specified test with the specified base URL and calls
    // callback to notify the caller of ndt7 events.
    run: function(baseURL, testName, callback) {
      callback('starting', {Origin: 'client', Test: testName})
      let done = false
      let worker = new Worker('ndt7-' + testName + '.js')
      function finish() {
        if (!done) {
          done = true
          if (callback !== undefined) {
            callback('complete', {Origin: 'client', Test: testName})
          }
        }
      }
      worker.onmessage = function (ev) {
        if (ev.data === null) {
          finish()
          return
        }
        callback('measurement', ev.data)
      }
      // Kill the worker after the timeout. This force the browser to
      // close the WebSockets and prevent too-long tests.
      setTimeout(function () {
        worker.terminate()
        finish()
      }, 10000)
      worker.postMessage({
        href: baseURL,
      })
    }*/
  }
}());

module.exports = ndt7;