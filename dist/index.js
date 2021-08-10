'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var inBrowser = typeof window !== 'undefined';
var conn = inBrowser && navigator.connection;
var canPrefetch = inBrowser && (!conn || (conn.effectiveType || '').indexOf('2g') === -1 && !conn.saveData);
var supportIntersectionObserver = inBrowser && window.IntersectionObserver;

/**
 * Portions copyright 2018 Google Inc.
 * Inspired by Gatsby's prefetching logic, with those portions
 * remaining MIT. Additions include support for Fetch API,
 * XHR switching, SaveData and Effective Connection Type checking.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
var preFetched = {};
/**
 * Checks if a feature on `link` is natively supported.
 * Examples of features include `prefetch` and `preload`.
 * @param {string} feature - name of the feature to test
 * @return {Boolean} whether the feature is supported
 */

function support(feature) {
  if (!inBrowser) {
    return;
  }

  var link = document.createElement('link');
  return link.relList && link.relList.supports && link.relList.supports(feature);
}
/**
 * Fetches a given URL using `<link rel=prefetch>`
 * @param {string} url - the URL to fetch
 * @return {Object} a Promise
 */


function linkPrefetchStrategy(url) {
  return new Promise(function (resolve, reject) {
    var link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    link.addEventListener('load', resolve);
    link.addEventListener('error', reject);
    document.head.appendChild(link);
  });
}
/**
 * Fetches a given URL using XMLHttpRequest
 * @param {string} url - the URL to fetch
 * @return {Object} a Promise
 */


function xhrPrefetchStrategy(url) {
  return new Promise(function (resolve, reject) {
    var req = new XMLHttpRequest();
    req.open("GET", url, req.withCredentials = true);
    req.addEventListener('load', function () {
      req.status === 200 ? resolve() : reject();
    });
    req.send();
  });
}
/**
 * Fetches a given URL using the Fetch API. Falls back
 * to XMLHttpRequest if the API is not supported.
 * @param {string} url - the URL to fetch
 * @return {Object} a Promise
 */


function highPriFetchStrategy(url) {
  // TODO: Investigate using preload for high-priority
  // fetches. May have to sniff file-extension to provide
  // valid 'as' values. In the future, we may be able to
  // use Priority Hints here.
  //
  // As of 2018, fetch() is high-priority in Chrome
  // and medium-priority in Safari.
  return self.fetch ? fetch(url, {
    credentials: "include"
  }) : xhrPrefetchStrategy(url);
}

var supportedPrefetchStrategy = support('prefetch') ? linkPrefetchStrategy : xhrPrefetchStrategy;
/**
 * Prefetch a given URL with an optional preferred fetch priority
 * @param {String} url - the URL to fetch
 * @param {Boolean} isPriority - if is "high" priority
 * @param {Object} conn - navigator.connection (internal)
 * @return {Object} a Promise
 */

function prefetcher(url, isPriority) {
  if (!canPrefetch || preFetched[url]) {
    return;
  } // Wanna do something on catch()?


  return (isPriority ? highPriFetchStrategy : supportedPrefetchStrategy)(url).then(function () {
    preFetched[url] = true;
  });
}

function installRouterPrefetch(app, ref) {
  if ( ref === void 0 ) ref = {};
  var componentName = ref.componentName; if ( componentName === void 0 ) componentName = 'RouterLink';
  var enablePrefetch = ref.prefetch; if ( enablePrefetch === void 0 ) enablePrefetch = true;

  var observer = supportIntersectionObserver && new window.IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target._linkPrefetch();
      }
    });
  });

  var requestIdleCallback = inBrowser && window.requestIdleCallback || function (cb, ref) {
    var timeout = ref.timeout; if ( timeout === void 0 ) timeout = 1;

    var start = Date.now();
    return setTimeout(function () {
      cb({
        didTimeout: false,

        timeRemaining: function timeRemaining() {
          return Math.max(0, 50 - (Date.now() - start));
        }

      });
    }, timeout);
  };

  var RouterLink = app.component('RouterLink') || app.component('router-link');

  if (process.env.NODE_ENV === 'development' && !RouterLink) {
    console.error("[vue-router-prefetch] You need to call app.use(VueRouter) before this plugin!");
  }

  var Link = {
    name: componentName,
    extends: RouterLink,
    props: {
      prefetch: {
        type: Boolean,
        default: enablePrefetch
      },
      prefetchFiles: {
        type: Array
      },
      timeout: {
        type: Number,
        default: 2000
      }
    },

    setup: function setup(props, context) {
      return RouterLink.setup(props, context);
    },

    mounted: function mounted() {
      if (this.prefetch && observer && canPrefetch) {
        requestIdleCallback(this.observe, {
          timeout: this.timeout
        });
      }
    },

    beforeUnmount: function beforeUnmount() {
      this.unobserve();
    },

    methods: {
      observe: function observe() {
        observer.observe(this.$el);
        this.$el._linkPrefetch = this.linkPrefetch;
        this._linkObserved = true;
      },

      unobserve: function unobserve() {
        if (this._linkObserved) {
          observer.unobserve(this.$el);
        }
      },

      getRouteComponents: function getRouteComponents(route) {
        return route.matched.map(function (record) {
          return Object.values(record.components);
        }).flat().filter(function (Component) {
          return Component.cid === undefined && typeof Component === 'function';
        });
      },

      linkPrefetch: function linkPrefetch() {
        var route = this.$router.resolve(this.to);
        if (route.meta.__prefetched) { return; }
        route.meta.__prefetched = true;

        if (route.meta.prefetch !== false) {
          // Prefetch route component
          var components = this.getRouteComponents(route);

          for (var i = 0, list = components; i < list.length; i += 1) {
            var Component = list[i];

            this.$emit('prefetch', this.to);
            Component(); // eslint-disable-line new-cap
          }
        }

        if (typeof route.meta.prefetch === 'function') {
          route.meta.prefetch(route);
        } // Prefetch addtional files


        var prefetchFiles = (this.prefetchFiles || []).concat( (route.meta.prefetchFiles || []));

        if (prefetchFiles.length > 0) {
          for (var i$1 = 0, list$1 = prefetchFiles; i$1 < list$1.length; i$1 += 1) {
            var file = list$1[i$1];

            prefetcher(file);
          }
        }

        this.unobserve();
      }

    }
  };
  app.component(Link.name, Link);
}

exports.default = installRouterPrefetch;
exports.install = installRouterPrefetch;
exports.prefetch = prefetcher;
