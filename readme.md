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

## Publishing New Versions

- Build production versions of the file
	- Typically all repos contain a `npm run build:dist` command as a shortcut
- You must have a valid `.npmrc` in your user folder (`C:\Users\abc1d2\.npmrc`)
	- For more info: <http://bitbucket.intra.omneo.com:7990/projects/OMNEO/repos/omneo-ui/browse/docs/artifactory.md>
  - You must have AWS CLI set up with Project16 keys
  	- You should be able to access Project16 AWS console with your webkey credentials: <https://salesforce.industrysoftware.automation.siemens.com/WebkeyLogin/Authenticate6?url=https://salesforce.industrysoftware.automation.siemens.com/WebkeyLogin/SAMLAuth/alias/aws>
  	- There you can get your AWS Keys: <https://console.aws.amazon.com/iam/home?region=us-east-1#/users>
  		- Find yourself in the list of Users
  		- Go to **Security credentials** tab where you can generate AWS Key
  	- And then use those for setting up your AWS CLI: <https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html>
- Then, using [`yarn`](https://yarnpkg.com) and [`np`](https://github.com/sindresorhus/np), create a new version
	- Remember to always apply the `--yolo` and `--no-yarn` flags
	- While developing, new branches **must** be published under prerelease types
	- Prerelase tags should be something unique-ish. Your name should be fine.
```sh
# Example development publish
yarn run build:dist
yarn run np --yolo --no-yarn --any-branch --tag=jon 1.2.3-jon.4

# Example final version publish
npm run build:dist
npm run test
# commit any changes, fix any test failures...
# repeat...

# mark the new release
# <version> can be "patch", "minor", or "major"
yarn run np --yolo --no-yarn --any-branch <version>
# push updated package.json file
git push
# push updated git tags
git push origin --tags
# merge pull request
```
