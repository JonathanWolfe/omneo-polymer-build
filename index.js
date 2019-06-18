const yargs = require( 'yargs' )
	.boolean( 'production' )
	.boolean( 'coverage' )
	.env()
	.argv;

const babel = require( 'gulp-babel' );
const uglify = require( 'gulp-uglify' );
const sass = require( 'gulp-sass' );
const autoprefixer = require( 'autoprefixer' );
const postcss = require( 'gulp-postcss' );
const cssnano = require( 'cssnano' );

const path = require( 'path' );
const fs = require( 'fs-extra' );
const flatten = require( 'gulp-flatten' );

const gutil = require( 'gulp-util' );
const gulpIf = require( 'gulp-if' );
const newer = require( 'gulp-newer' );
const change = require( 'gulp-change' );
const stream = require( 'stream' );
const through = require( 'through2' );
const StringDecoder = require( 'string_decoder' ).StringDecoder;

const inlineSource = require( 'gulp-inline-source' );

/**
 * Checks if something is a non-null object
 *
 * @param {any} source Thing to check
 * @returns {boolean}
 */
function isObject( source ) {
	const nonNullObject = source && typeof source === 'object';
	const toString = Object.prototype.toString.call( source );

	return Boolean( nonNullObject && toString === '[object Object]' );
}

/**
 * Deep merges multiple objects together
 * Each argument will overwrite values to it's left
 *
 * @param {Object} original Starter object
 * @param {Object} overwriters Objects to with values to overwrite with
 * @returns {Object}
 */
function mergeObjects( original, ...overwriters ) {
	if ( overwriters.length === 0 ) return original;

	const source = overwriters.shift();

	if ( isObject( original ) && isObject( source ) ) {

		Object.keys( source ).forEach( function eachKey( key ) {

			if ( isObject( source[ key ] ) ) {

				if ( original[ key ] === undefined ) {
					Object.assign( original, { [ key ]: {} } );
				}

				mergeObjects( original[ key ], source[ key ] );

			} else {
				Object.assign( original, { [ key ]: source[ key ] } );
			}

		} );

	}

	return mergeObjects( original, ...overwriters );
}

/**
 * Check if any parts of a component have been modified
 * If none have, we don't need to re-build that component
 *
 * @param {string} dest Output folder
 * @returns {TransformationStream}
 */
function checkNewerBeforeInlining( dest ) {
	const decode = new StringDecoder( 'utf8' );
	const findInlined = /<(?:link|script) inline .*?(?:href|src)="(.+)"/ig;

	/**
	 * Checks if any part of a component is newer than the build result
	 *
	 * @param {Vinyl} file Vinyl file instance for the current file in the gulp stream
	 * @param {string} enc Encoding
	 * @param {Function(error, file)} done Callback to continue down the stream
	 */
	function checkNewer( file, enc, done ) {
		const filePath = path.parse( path.normalize( file.path ) );

		let buildFileStats;

		try {
			buildFileStats = fs.statSync( path.resolve( '.', dest, filePath.base ) );
		} catch ( e ) {
			// file doesn't exist
		}

		if ( !buildFileStats ) {
			return done( null, file );
		}

		const stats = [ file.stat ];

		const contents = decode.end( file.contents );
		const inlined = [];

		let nextMatch = findInlined.exec( contents );

		while ( nextMatch != null ) {
			inlined.push( nextMatch[ 1 ] );

			nextMatch = findInlined.exec( contents );
		}

		inlined.forEach( function getStats( url ) {
			const nonAbsolute = url.startsWith( '/' ) ? url.substring( 1 ) : url;

			let fileStats;

			try {
				fileStats = fs.statSync( path.resolve( '.', nonAbsolute ) );
			} catch ( e ) {
				// file doesn't exist
			}

			if ( fileStats ) stats.push( fileStats );
		} );

		if ( stats.some( stat => stat.mtimeMs > buildFileStats.mtimeMs ) ) {
			return done( null, file );
		}

		return done();
	}

	return through.obj( checkNewer );
}

/**
 * Attches the build tasks to the provided gulp instance
 *
 * @param {Gulp} gulp The gulp instance to attach to
 */
function attachTasks( gulp, settingsOverride ) {

	const settingsDefaults = {
		locations: {
			elements: [ 'app/elements', 'app/pages', 'app/behaviors', 'app/dependency-imports' ],
			tests: [ 'test' ],
			globalCSS: [ 'app/css' ],
			globalJS: [ 'app/js' ],
		},
		sass: {
			src: [],
			dest: 'build/sass',
			includePaths: [ '.', 'app', 'app/elements', 'app/pages', 'app/css', 'bower_components', 'node_modules' ],
			minify: false,
		},
		js: {
			src: [],
			dest: 'build/js',
			addCoverage: false,
			minify: false,
		},
		html: {
			src: [],
			dest: 'build/inline',
			changeBeforeWrite: false,
			changeFunction: new stream.PassThrough(),
		},
		test: {
			dest: 'build/test',
			index: 'app/index.html',
			template: 'app/unit-test-template.html',
		},
	};
	const combinedSettings = isObject( settingsOverride ) ? mergeObjects( {}, settingsDefaults, settingsOverride ) : settingsDefaults;

	if ( yargs.production ) {
		combinedSettings.sass.minify = true;
		combinedSettings.js.minify = true;
	}

	if ( yargs.coverage ) {
		combinedSettings.js.addCoverage = true;
	}

	/**
	 * Process Sass with the appropriate tools
	 *
	 * @param {{ src:string|string[], dest:stirng, includePaths:string[], minify:boolean }} settings Settings for the instance
	 * @returns {Gulp}
	 */
	function processSass( settings ) {
		const sassParser = sass( {
			outputStyle: 'expanded',
			includePaths: settings.includePaths,
		} )
			.on( 'error', sass.logError );

		const postcssSettings = [ autoprefixer() ];

		if ( settings.minify ) {
			postcssSettings.push( cssnano( {
				discardComments: { removeAll: true },
				zindex: false,
			} ) );
		}

		fs.ensureDirSync( settings.dest );

		return gulp.src( settings.src )
			.pipe( newer( {
				dest: settings.dest,
				ext: '.css',
				map: path.basename,
			} ) )
			.pipe( sassParser )
			.pipe( postcss( postcssSettings ) )
			.pipe( flatten() )
			.pipe( gulp.dest( settings.dest ) );
	}

	/**
	 * Process JS with the appropriate tools
	 *
	 * @param {{ src:string|string[], dest:string, addCoverage:boolean, flatten:boolean }} settings Settings for the instance
	 * @returns {Gulp}
	 */
	function processJS( settings ) {
		const babelOptions = {
			compact: settings.minify,
			presets: [
				'@babel/env',
			],
		};

		if ( settings.addCoverage ) {
			babelOptions.plugins = [ 'istanbul' ];
		}

		const babelProcess = babel( babelOptions );

		babelProcess
			.on( 'error', function error( err ) {
				gutil.log( err.stack || err );

				babelProcess.end();
			} );

		fs.ensureDirSync( settings.dest );

		return gulp.src( settings.src )
			.pipe( newer( {
				dest: settings.dest,
				map: function map( relativeFilePath ) {
					if ( settings.flatten ) {
						return path.basename( relativeFilePath );
					}

					return relativeFilePath;
				},
			} ) )
			.pipe( babelProcess )
			.pipe( gulpIf( settings.minify, uglify() ) )
			.pipe( gulpIf( settings.flatten, flatten() ) )
			.pipe( gulp.dest( settings.dest ) );
	}

	/**
	 * Process HTML with the appropriate tools
	 *
	 * @param {{ src:string|string[], dest:string, changeBeforeWrite:Function }} settings Settings for the instance
	 * @returns {Gulp}
	 */
	function processHTML( settings ) {
		fs.ensureDirSync( settings.dest );

		return gulp.src( settings.src )
			.pipe( checkNewerBeforeInlining( settings.dest ) )
			.pipe( inlineSource( {
				rootpath: '.',
				compress: false,
				pretty: false,
			} ) )
			.pipe( flatten() )
			.pipe( gulpIf( settings.changeBeforeWrite, settings.changeFunction ) )
			.pipe( gulp.dest( settings.dest ) );
	}

	gulp.task( 'sass:styles', function sassStyles() {
		return processSass( {
			src: combinedSettings.locations.globalCSS.map( location => `${location}/**/*.scss` ),
			dest: combinedSettings.sass.dest,
			includePaths: combinedSettings.sass.includePaths,
			minify: combinedSettings.sass.minify,
		} );
	} );

	gulp.task( 'sass:elements', function sassElements() {
		const overridden = Array.isArray( combinedSettings.sass.src ) && combinedSettings.sass.src.length > 0;
		const sources = overridden ? combinedSettings.sass.src : combinedSettings.locations.elements.map( location => `${location}/**/*.scss` );

		return processSass( {
			src: sources,
			dest: combinedSettings.sass.dest,
			includePaths: combinedSettings.sass.includePaths,
			minify: combinedSettings.sass.minify,
		} );
	} );

	gulp.task( 'compileJS:scripts', function compileScripts() {
		return processJS( {
			src: combinedSettings.locations.globalJS.map( location => `${location}/**/*.js` ),
			dest: `${combinedSettings.js.dest}/global`,
			addCoverage: combinedSettings.js.addCoverage,
			minify: combinedSettings.js.minify,
			flatten: false,
		} );
	} );

	gulp.task( 'compileJS:elements', function compileElements() {
		const overridden = Array.isArray( combinedSettings.js.src ) && combinedSettings.js.src.length > 0;
		const sources = overridden ? combinedSettings.js.src : combinedSettings.locations.elements.map( location => `${location}/**/*.js` );

		return processJS( {
			src: sources,
			dest: `${combinedSettings.js.dest}/element`,
			addCoverage: combinedSettings.js.addCoverage,
			minify: combinedSettings.js.minify,
			flatten: true,
		} );
	} );

	gulp.task( 'compileJS:tests', function compileTests() {
		return processJS( {
			src: [ 'test/**/*.test.js' ],
			dest: `${combinedSettings.js.dest}/test`,
			addCoverage: combinedSettings.js.addCoverage,
			minify: combinedSettings.js.minify,
			flatten: true,
		} );
	} );

	gulp.task( 'inline:elements', [ 'sass:elements', 'compileJS:elements' ], function inlineElements() {
		const overridden = Array.isArray( combinedSettings.html.src ) && combinedSettings.html.src.length > 0;
		const sources = overridden ? combinedSettings.html.src : combinedSettings.locations.elements.map( location => `${location}/**/*.html` );

		return processHTML( {
			src: sources,
			dest: combinedSettings.html.dest,
			changeBeforeWrite: combinedSettings.html.changeBeforeWrite,
			changeFunction: combinedSettings.html.changeFunction,
		} );
	} );

	gulp.task( 'inline:tests', [ 'compileJS:tests' ], function inlineTests() {
		let indexHTML = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Unit Test</title></head><body></body></html>';
		let templateHTML = '<content-goes-here></content-goes-here>';

		if ( combinedSettings.test.index ) {
			try {
				indexHTML = fs.readFileSync( path.resolve( '.', combinedSettings.test.index ), { encoding: 'utf8' } );
			} catch ( e ) {
				console.error( `${combinedSettings.test.index} does not exist` );
			}
		}

		if ( combinedSettings.test.template ) {
			try {
				templateHTML = fs.readFileSync( path.resolve( '.', combinedSettings.test.template ), { encoding: 'utf8' } );
			} catch ( e ) {
				console.error( `${combinedSettings.test.template} does not exist` );
			}
		}

		return processHTML( {
			src: combinedSettings.locations.tests.map( location => `${location}/**/*.test.html` ),
			dest: combinedSettings.test.dest,
			changeBeforeWrite: true,
			changeFunction: change( function joinTemplate( content ) {
				const contentSwapped = templateHTML.replace( '<content-goes-here></content-goes-here>', content );

				return indexHTML.replace( /<body[\s\S]+\/body>/g, contentSwapped );
			} ),
		} );
	} );
}

module.exports = {
	attachTasks,
};
