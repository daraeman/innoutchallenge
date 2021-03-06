if ( ! process.env.NODE_ENV )
	console.log( "missing NODE_ENV, remember to prepend \"export NODE_ENV=production/dev;\"" );
if ( ! process.env.ENV_PATH )
	console.log( "missing NODE_ENV, remember to prepend \"export ENV_PATH=.env.production/.env.dev;\"" );

if ( ! process.env.ENV_PATH || ! process.env.ENV_PATH )
	throw new Error( "missing required env vars" );

const fs = require( "fs.promised" );
const db = require( "../db" );
const oldSiteController = require( "../../controller/old_site" );
const tweetController = require( "../../controller/tweet" );
const storeController = require( "../../controller/store" );
const userController = require( "../../controller/user" );
const twitterUserController = require( "../../controller/twitter_user" );

const mongo_conf = "mongo.conf";
const mongo_conf_sample = "mongo.conf.sample";
const mongo_log = "log/mongo.log";
const env_file_dev = ".env.dev";
const env_file_production = ".env.production";
const env_template = ".env.sample";
const use_cache = false;

// check mongo conf exists
fs.access( mongo_conf, fs.constants.F_OK | fs.constants.W_OK )
	.then( () => {
		console.log( "Mongo Conf Already Exists" );
	})
	.catch( () => {
		// create blank mongo log
		fs.createReadStream( mongo_conf_sample ).pipe( fs.createWriteStream( mongo_conf ) );
		console.log( "Mongo Conf Created" );
	})
	.then( () => {
		return fs.access( mongo_log, fs.constants.F_OK | fs.constants.W_OK );
	})
	.then( () => {
		console.log( "Mongo Log Already Exists" );
	})
	.catch( () => {
		// create blank mongo log
		return fs.writeFile( mongo_log, "" );
	})
	.catch( ( error ) => {
		// error creating mongo log
		throw error;
	})
	.then( () => {
		// check envronment file exists
		return fs.access( env_file_dev, fs.constants.F_OK | fs.constants.W_OK );
	})
	.then( () => {
		console.log( "Dev Environment File Already Exists" );
	})
	.catch( () => {
		// create environment file from the sample
		fs.createReadStream( env_template ).pipe( fs.createWriteStream( env_file_dev ) );
		console.log( "Blank Dev Environment File Created" );
	})
	.then( () => {
		// check envronment file exists
		return fs.access( env_file_production, fs.constants.F_OK | fs.constants.W_OK );
	})
	.then( () => {
		console.log( "Production Environment File Already Exists" );
	})
	.catch( () => {
		// create environment file from the sample
		fs.createReadStream( env_template ).pipe( fs.createWriteStream( env_file_production ) );
		console.log( "Blank Production Environment File Created" );
	})
	.then( () => {
		return db.connect();
	})
	.then( () => {
		// delete all collections in mongo
		return oldSiteController.resetData();
	})
	.then( () => {
		// fetch the list of all the stores and import it
		return storeController.updateStores();
	})
	.then( () => {
		// fetch the remote/cached data from the old innoutchalllenge
		console.log( "Data Reset" );
		if ( ! use_cache )
			return oldSiteController.getRemote();
		else
			return oldSiteController.getLocal();
	})
	.then( ( data ) => {
		// import the old data
		console.log( "Data Retrieved" );
		return oldSiteController.importData( data );
	})
	.then( () => {
		// fetch all the tweets for the old, incomplete data
		console.log( "Data Imported, Refetching Tweets" );
		return oldSiteController.refetchTweetsAll();
	})
	.then( () => {
		// normalize the data to our new format
		console.log( "Tweets Fetched, Cleaning up Tweets" );
		return oldSiteController.postCleanup();
	})
	.then( () => {
		// parse all the tweets we just fetched
		console.log( "Data Cleaned, Parsing Tweets" );
		return tweetController.parseTweets( false, false );
	})
	.then( () => {
		// fetch any new tweets to fill in the gap, if any
		console.log( "Tweets Parsed, Getting New Tweets from Twitter" );
		return tweetController.getTweetsFromSearchApp();
	})
	.then( () => {
		// parse the new tweets
		console.log( "Tweets Fetched, Parsing Tweets" );
		return tweetController.parseTweets( true, true );
	})
	.then( () => {
		// parse the tweets for any store locations
		console.log( "Tweets Parsed, Getting Stores From Tweets" );
		return storeController.findStoresFromTweets();
	})
	.then( () => {
		// update all the user totals
		console.log( "Tweets Parsed for Stores, Updating User Totals" );
		return userController.updateAllUsersTotals();
	})
	.then( () => {
		// update all the user totals
		console.log( "User Totals Updated, Filling TwitterUser Data From Twitter" );
		return twitterUserController.updateTwitterUsers();
	})
	.then( () => {
		console.log( "TwitterUsers Updated, All Done!" );
		db.close();
	})
	.catch( ( error ) => {
		throw error;
	});