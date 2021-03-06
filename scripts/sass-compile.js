/* eslint-disable no-console */

/**
 * Dependencies.
 */
const sass = require('node-sass');
const postcss = require('postcss');
const fs = require('fs-extra');
const path = require('path-extra');
const args = require('minimist')(process.argv.slice(2));


/**
 * Set up cli arguments and aliases that can be used.
 */
args.bundles = args.bundles || args.b;
args.file = args.file || args.f;
args.env = args.env || args.e || process.env.NODE_ENV || 'dev';
if (args.env === 'production') args.env = 'prod';


/**
 * Bundles configuration.
 * [IMPORTANT] Put all bundles here that can potentially be compiled.
 * Try not to edit any other section.
 * @type  {object}
 */
const bundles = {
	dist: {
		entry: 'src/sass/_flipper-init.scss',
		output: 'dist/css/flipper-vanilla.css',
		envs: ['dev', 'prod']
	},
	examples: {
		entry: 'examples/example.scss',
		output: 'examples/flipper-sass.css',
		envs: ['dev']
	}
};
// Map files to bundles (i.e., when 'x' source file changes, run 'y' bundle).
const fileBundles = {
	'src/sass/_flipper-init.scss': ['dist', 'examples'],
	'src/sass/flipper.scss': ['dist', 'examples'],
	'examples/example.scss': ['examples'],
};


/**
 * Run bundles.
 * @description The bundle that runs is determined by EITHER --file (-f) or --bundles (-b) arguments.
 * - Pass --file=<path> to run bundle from `fileBundles`.
 * - Pass --bundle=<bundle list> to run specific bundles.
 * - If neither are passed, all bundles will run.
 */
// Grab bundles from cli (first from --file, then from --bundle).
let bundlesToRun = args.file && fileBundles[args.file] ? fileBundles[args.file] : (args.bundles ? args.bundles.split(',') : Object.keys(bundles));

// Start a timer.
let startTime = Date.now();
let promises = [];

// Iterate over each bundle.
bundlesToRun.forEach((bundle) => {
	if (!bundles[bundle]) {
		log(`Skipped ${bundle} bundle, it doesn't exist.`);
		return false;
	}
	bundles[bundle].start = Date.now();
	bundles[bundle].name = bundle;
	promises.push(compileBundle(bundles[bundle], bundle));
});

// Make sure all promises finish to time the task duration.
Promise.all(promises)
	.then((results) => {
		let compilePromises = [];
		results.forEach((promise) => compilePromises = compilePromises.concat(promise));
		return Promise.all(compilePromises);
	}).then(() => {
		if (promises.length > 1) {
			let endTime = Date.now();
			let duration = formatDuration(endTime - startTime);
			log(`Compiled all SASS files in ${duration}.`);
		}
	})
	.catch((error) => log(error));


/**
 * Compile a SASS bundle to CSS.
 * @method  compileBundle
 * @param   {object}  bundle  Configuration object.
 * @return  {promise}
 */
function compileBundle(bundle) {
	let compilePromises = [];

	return new Promise((resolve, reject) => {
		// Sass always compiles for dev, then postcss handles the production build.
		return sass.render({
			file: bundle.entry,
			indentType: 'tab',
			indentWidth: 1,
			outputStyle: 'expanded',
			sourceComments: true,
			sourceMap: true,
			outFile: bundle.output + '.map'
		}, (error, result) => {
			if (error) {
				log(error);
				reject(error);
			}

			// Track duration of just sass compilation.
			bundle.sassDuration = formatDuration(Date.now() - bundle.start);

			// Set up plugins.
			let plugins = [
				require('autoprefixer')({cascade: false})
			];

			// Run postcss.
			return postcss(plugins)
				.process(result.css, {
					from: bundle.entry,
					to: bundle.output,
					map: {
						prev: result.map.toString(),
						inline: false
					}
				})
				.then((result) => {
					const pkg = require('../package.json');
					let banner = [
						pkg.name + ' v' + pkg.version,
						'@filename ' + path.basename(bundle.output),
						'@author ' + pkg.author,
						'@homepage ' + pkg.homepage,
						'@license ' + pkg.license,
						'@description ' + pkg.description,
					];

					// Always save unminified file.
					compilePromises.push(fs.outputFile(bundle.output, ['/*!\n * ' + banner.join('\n * ') + '\n */', result.css].join('\n\n\n')));

					// Save sourcemap.
					if (result.map) {
						compilePromises.push(fs.outputFile(bundle.output + '.map', result.map));
					}

					// Minify it in production.
					if (args.env === 'prod' && bundle.envs.indexOf('prod') > -1) {
						let minifiedCss = require('csso').minify(result.css).css;
						compilePromises.push( fs.outputFile(path.fileNameWithPostfix(bundle.output, '.min'), '/*! ' + banner.join(' | ') + ' */\n' + minifiedCss ));
					}

					return Promise.all(compilePromises);
				}).then((result) => {
					// Log time.
					bundle.stop = Date.now();
					bundle.duration = formatDuration(bundle.stop - bundle.start);
					log(`Compiled ${bundle.name} bundle [${bundle.output}] in ${bundle.duration} (${bundle.sassDuration} for sass).`);

					resolve(result);
					return result;
				}).catch((error) => {
					log(error);
					reject(error);
				});
	});
	});
}


/**
 * Format duration to show as 'ms' or 's'.
 * @method  formatDuration
 * @param   {number}  duration  Number of milliseconds.
 * @return  {string}  String formatted as number + 'ms' or 's'.
 */
function formatDuration(duration) {
	return duration = duration > 999 ? (duration / 1000) + 's' : duration + 'ms';
}


/**
 * Helper to log with SASS prefix.
 * @method  log
 * @param   {string}  output  String to output to console.log.
 */
function log(output) {
	console.log(`[SASS] ${output}`);
}
