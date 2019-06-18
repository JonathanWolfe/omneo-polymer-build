# Omneo-Polymer-Build

Provides `gulp` tasks that can be used to quickly build polymer projects.

## Configuration Defaults

```js
{
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
}
```

## Usage

Here is an example `gulpfile.js`:

```js
const fs = require( 'fs-extra' );
const gulp = require( 'gulp' );
const omneoPolymerBuild = require( 'omneo-polymer-build' );
const path = require( 'path' );

const polymerBuildConfig = {
	locations: {
		elements: [ 'src' ],
		globalCSS: [],
		globalJS: [],
	},
	sass: {
		includePaths: [ '.', 'src', 'bower_components', 'node_modules' ],
	},
	test: {
		index: 'unit-test-index.html',
		template: 'unit-test-template.html',
	},
};

omneoPolymerBuild.attachTasks( gulp, polymerBuildConfig );

gulp.task( 'clean', function clean( callback ) {
	return fs.remove( path.resolve( './build' ), callback );
} );

gulp.task( 'build', [ 'inline:elements', 'inline:tests' ] );
```
