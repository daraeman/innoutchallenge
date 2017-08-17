if ( ! process.env.NODE_ENV )
	throw new Error( "missing NODE_ENV" );

if ( ! process.env.ENV_PATH )
	throw new Error( "missing ENV_PATH" );

let env_path = ( process.env.ENV_PATH === ".env.production" ) ? ".env.production" : ".env.dev";

require( "dotenv" ).config( { path: env_path } );
const debug = process.env.NODE_ENV !== "production";
const webpack = require( "webpack" );
const path = require( "path" );
const UglifyJSPlugin = require( "uglifyjs-webpack-plugin" );
const Dotenv = require( "dotenv-webpack" );

let plugins = [
	new Dotenv({
		path: env_path, 
		safe: false,
	})
];
if ( ! debug ) {
	plugins.push(
		new webpack.DefinePlugin({
			"process.env": {
				NODE_ENV: JSON.stringify( "production" )
			}
		})
	);
	plugins.push(
		new webpack.optimize.UglifyJsPlugin()
	);
}

module.exports = {
	node: {
		fs: "empty",
	},
	context: path.resolve( __dirname, "client" ),
	devtool: debug ? "inline-sourcemap" : false,
	entry: "./client.js",
	module: {
		loaders: [
			{
				test: /\.jsx?$/,
				loader: "babel-loader",
				query: {
					presets: [ "react", "es2015", "stage-0" ],
					plugins: [ "react-html-attrs", "transform-class-properties", "transform-decorators-legacy" ],
				},
			},
			{
				test: /\.less$/,
				use: [
					{ loader: "style-loader" },
					{ loader: "css-loader", options: { minimize: ! debug } },
					{ loader: "less-loader" },
				],
			},
		],
	},
	plugins: plugins,
	output: {
		path: path.resolve( __dirname, "client/build" ),
		filename: "bundle.js",
	},
	devServer: {
		contentBase: path.resolve( __dirname, "client/build" ),
		historyApiFallback: true,
		host: process.env.FRONTEND_HOST,
		port: process.env.FRONTEND_PORT,
		proxy: [
			{
				context: [ "/api/**", "/img/**", "/font/**" ],
				target: process.env.BACKEND_URL,
				secure: false,
			},
		],
	},
};