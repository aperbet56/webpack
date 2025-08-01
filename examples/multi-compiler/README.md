# example.js

```javascript
if(ENV === "mobile") {
	require("./mobile-stuff");
}
console.log("Running " + ENV + " build");
```

# webpack.config.js

```javascript
"use strict";

const path = require("path");
const webpack = require("../../");

module.exports = [
	{
		name: "mobile",
		// mode: "development" || "production",
		entry: "./example",
		output: {
			path: path.join(__dirname, "dist"),
			filename: "mobile.js"
		},
		plugins: [
			new webpack.DefinePlugin({
				ENV: JSON.stringify("mobile")
			})
		]
	},

	{
		name: "desktop",
		// mode: "development" || "production",
		entry: "./example",
		output: {
			path: path.join(__dirname, "dist"),
			filename: "desktop.js"
		},
		plugins: [
			new webpack.DefinePlugin({
				ENV: JSON.stringify("desktop")
			})
		]
	}
];
```

# dist/desktop.js

```javascript
/******/ (() => { // webpackBootstrap
/*!********************!*\
  !*** ./example.js ***!
  \********************/
/*! unknown exports (runtime-defined) */
/*! runtime requirements:  */
if(false) // removed by dead control flow
{}
console.log("Running " + "desktop" + " build");
/******/ })()
;
```

# dist/mobile.js

```javascript
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/*!*************************!*\
  !*** ./mobile-stuff.js ***!
  \*************************/
/*! unknown exports (runtime-defined) */
/*! runtime requirements:  */
/***/ (() => {

// mobile only stuff

/***/ })
/******/ 	]);
```

<details><summary><code>/* webpack runtime code */</code></summary>

``` js
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
```

</details>

``` js
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!********************!*\
  !*** ./example.js ***!
  \********************/
/*! unknown exports (runtime-defined) */
/*! runtime requirements: __webpack_require__ */
if(true) {
	__webpack_require__(/*! ./mobile-stuff */ 1);
}
console.log("Running " + "mobile" + " build");
})();

/******/ })()
;
```

# Info

## Unoptimized

```
mobile:
  asset mobile.js 1.71 KiB [emitted] (name: main)
  chunk (runtime: main) mobile.js (main) 114 bytes [entry] [rendered]
    > ./example main
    dependent modules 20 bytes [dependent] 1 module
    ./example.js 94 bytes [built] [code generated]
      [used exports unknown]
      entry ./example main
  mobile (webpack X.X.X) compiled successfully

desktop:
  asset desktop.js 294 bytes [emitted] (name: main)
  chunk (runtime: main) desktop.js (main) 94 bytes [entry] [rendered]
    > ./example main
    ./example.js 94 bytes [built] [code generated]
      [used exports unknown]
      entry ./example main
  desktop (webpack X.X.X) compiled successfully
```

## Production mode

```
mobile:
  asset mobile.js 193 bytes [emitted] [minimized] (name: main)
  chunk (runtime: main) mobile.js (main) 114 bytes [entry] [rendered]
    > ./example main
    dependent modules 20 bytes [dependent] 1 module
    ./example.js 94 bytes [built] [code generated]
      [no exports used]
      entry ./example main
  mobile (webpack X.X.X) compiled successfully

desktop:
  asset desktop.js 37 bytes [emitted] [minimized] (name: main)
  chunk (runtime: main) desktop.js (main) 94 bytes [entry] [rendered]
    > ./example main
    ./example.js 94 bytes [built] [code generated]
      [no exports used]
      entry ./example main
  desktop (webpack X.X.X) compiled successfully
```
