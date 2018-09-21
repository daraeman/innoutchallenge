const Twitter = require( "twitter-request-queue-node" );
const TwitterPlace = require( "../model/twitter_place" );
const Tweet = require( "../model/tweet" );
const Store = require( "../model/store" );
const User = require( "../model/user" );
const Receipt = require( "../model/receipt" );
require( "dotenv" ).config();
const TwitterUser = require( "../model/twitter_user" );
const wordToNumber = require( "word-to-number-node" );
const w2n = new wordToNumber();
w2n.setSideChars( /[a-z#]/i ); // don't allow word numbers in hashtags
const storeController = require( "./store" );
const userController = require( "./user" );
const tweetQueueController = require( "./tweet_queue" );
const utils = require( "./utils" );
const PromiseBreakError = require( "./PromiseBreakError" );
const PromiseEndError = require( "./PromiseEndError" );

const twitterSearchRequest = function( search_params, app_only_auth, user_token, user_secret ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! search_params )
			return reject( "empty params" );

		let auth_params = {
			consumer_key: process.env.TWITTER_CONSUMER_KEY_USER,
			consumer_secret: process.env.TWITTER_CONSUMER_SECRET_USER,
		};

		if ( app_only_auth ) {
			console.log( "app_only_auth" )
			auth_params.bearer_token = process.env.TWITTER_BEARER_TOKEN_USER;
		}
		else {
			console.log( "user auth" )
			// auth_params. = user_token;
			// auth_params. = user_secret;
		}

		console.log( "auth_params", auth_params )

		const client = new Twitter( auth_params );

		client.get( "search/tweets", search_params, function( error, tweets ) {

			if ( error )
				return reject( error );
			else
				return resolve( tweets );

		});

	});

};

const getTweetsFromSearchApp = function( search_string ) {

	search_string = search_string || "#innoutchallenge";

	return new Promise( ( resolve, reject ) => {

		getLatestSearchTweetFromDb()
			.then( ( last_tweet ) => {

				let search_params = { q: search_string, count: 100 };

				if ( last_tweet )
					search_params.since_id = last_tweet.data.id_str;

				return twitterSearchRequest( search_params, true );
			})
			.then( ( tweets ) => {

				if ( ! tweets || ! tweets.statuses || ! tweets.statuses.length )
					return resolve();

				let remaining = tweets.statuses.length;
				// we want to save to the db starting with the oldest,
				// just in case it fails. So we don't miss earlier
				// ones when we refetch with the latest created_at date
				tweets.statuses.sort( ( a, b ) => {
					return ( new Date( a.created_at ) - new Date( b.created_at ) );
				});

				let stop = false;
				tweets.statuses.forEach( ( tweet_data ) => {

					if ( stop )
						return;

					remaining--;

					Tweet.findOne({ "data.id_str": tweet_data.id_str })
						.then( ( tweet ) => {

							if ( tweet === null ) {

								createTweet( { data: tweet_data, source: 1, fetched: true, fetch_date: new Date() } )
									.then( () => {

										if ( remaining <= 0 )
											return resolve();

									})
									.catch( ( error ) => {
										throw error;
									});
							}
							else if ( remaining <= 0 ) {
								return resolve();
							}
						})
						.catch( ( error ) => {
							stop = true;
							throw error;
						});

					if ( remaining <= 0 ) {
						stop = true;
						return resolve();
					}
				});
			})
			.catch( ( error ) => {
				return reject( error );
			});

	});
};

const getLatestSearchTweetFromDb = function() {
	return Tweet.findOne( { source: 1 } ).sort( { "data.created_at": "desc" } );
};

const getTweetsFromSearchUser = function( user ) {

	return new Promise( ( resolve, reject ) => {

		TwitterUser.findOne( { _id: user.twitter_user }, ( error, twitter_user ) => {

			if ( error )
				return reject( error );

			if ( twitter_user === null )
				return reject( "Failed to find TwitterUser" );

			let client = new Twitter({
				consumer_key: process.env.TWITTER_CONSUMER_KEY_USER,
				consumer_secret: process.env.TWITTER_CONSUMER_SECRET_USER,
				access_token_key: twitter_user.oauth_token,
				access_token_secret: twitter_user.oauth_secret,
			});

			client.get( "statuses/user_timeline", { user_id: twitter_user.data.id_str }, ( error, tweets ) => {

				if ( error )
					return reject( error );

				let remaining = tweets.length;

				let stop;
				tweets.forEach( ( tweet_data ) => {

					if ( stop )
						return;

					Tweet.findOne(
						{ "data.id_str": tweet_data.id_str },
						( error, tweet ) => {

							if ( error )
								return reject( error );

							if ( tweet === null ) {
								new Tweet( { data: tweet_data, source: 2 } ).save( ( error ) => {

									if ( error )
										return reject();

									if ( --remaining === 0 )
										resolve();
								});
							}
							else {
								if ( --remaining === 0 )
									resolve();
							}
						}
					);
				});
			});
		});
	});
};

const getTweetsFromLookupApp = function( status_ids_array ) {

	return new Promise( ( resolve, reject ) => {

		let client = new Twitter({
			consumer_key: process.env.TWITTER_CONSUMER_KEY_USER,
			consumer_secret: process.env.TWITTER_CONSUMER_SECRET_USER,
			bearer_token: process.env.TWITTER_BEARER_TOKEN_USER,
		});

		const ids = status_ids_array.join( "," );

		client.get( "statuses/lookup", { id: ids, map: true }, function( error, tweets ) {

			if ( error )
				return reject( error );

			resolve( tweets );
		});
	});
};

const parseForInStoreReceipt = function( text ) {
	let number = parseForInStoreDigits( text ) || w2n.parse( text )[0];
	if ( number && number != 69 && number > 0 && number < 100 )
		return number;
	return false;
};

const parseForDriveThruReceipt = function( text ) {
	let number = parseForDriveThruDigits( text ) || w2n.parse( text )[0];
	if ( number && number > 3999 && number < 5000 )
		return number;
	return false;
};

const isRetweet = function( tweet ) {
	if ( tweet.retweet || /^rt\s/i.test( tweet.data.text ) )
		return true;
	return false;
};

const hasIgnoreFlag = function( tweet ) {
	if ( /\#\!/i.test( tweet.data.text ) )
		return true;
	return false;
};

const isIgnoredUser = function( tweet ) {
	if ( tweet.data.user.id_str === "584408608" || tweet.data.user.id_str === "1487483659" )
		return true;
	return false;
};

const parseForInStoreDigits = function( text ) {
	let matches = text.match( /number\s+(\d{1,2})(?!\d)/i );
	if ( ! matches )
		matches = text.match( /(?:^|[\s!.,])(\d{1,2})(?:[\s!.,]|$)/ );
	if ( matches )
		return matches[1].trim();
	return false;
};

const parseForDriveThruDigits = function( text ) {
	let matches = text.match( /number\s+(4\d{3})/i );
	if ( ! matches )
		matches = text.match( /(?:^|[\s!.,])(4\d{3})(?:[\s!.,]|$)/ );
	if ( matches )
		return matches[1].trim();
	return false;
};

const parseTweets = function( do_new_user_tweet, do_new_receipt_tweet ) {

	return new Promise( ( resolve, reject ) => {

		let number_of_tweets = 0;
		Tweet.find({ fetched: true, parsed: false })
			.then( ( tweets ) => {

				if ( ! tweets.length ) {
					throw new PromiseEndError( "no tweets" );
				}

				number_of_tweets = tweets.length;

				let i = 0;
				let end = tweets.length;
				function parseTweetSync() {

					if ( i == end )
						return resolve( number_of_tweets );

					parseTweet( tweets[ i++ ], do_new_user_tweet, do_new_receipt_tweet )
						.then( () => {
							parseTweetSync();
						})
						.catch( ( error ) => {
							throw error;
						});
				}

				parseTweetSync();
			})
			.catch( ( error ) => {

				if ( error instanceof PromiseEndError ) {
					console.log( error, true );
					resolve( number_of_tweets );
				}
				else {
					reject( error );
				}
			});
	});
};

const parseTweet = function( tweet, do_new_user_tweet, do_new_receipt_tweet ) {

	return new Promise( ( resolve, reject ) => {

		let this_twitter_user,
			this_user,
			this_receipt,
			this_totals,
			this_store,
			receipt_data = {},
			is_new_in_store = false,
			is_new_drive_thru = false,
			is_new_store = false,
			is_new_user = false,
			message_type = 0;

		tweet.parsed = true;
		tweet.data.created_at = new Date( tweet.data.created_at );

		// see if we already have this twitter user
		TwitterUser.findOne( { "data.id_str": tweet.data.user.id_str } )
			.then( ( twitter_user ) => {

				// create it if not
				if ( ! twitter_user ) {
					return TwitterUser.create({
						data: {
							id_str: tweet.data.user.id_str,
							screen_name: tweet.data.user.screen_name,
						},
					});
				}
				else {
					return twitter_user;
				}
			})
			.then( ( twitter_user ) => {
				this_twitter_user = twitter_user;
				// find user
				return User.findOne( { twitter_user: twitter_user._id } );
			})
			.then( ( user ) => {

				// if there is no user, create one
				if ( ! user ) {
					is_new_user = true;
					return User.create({
						name: this_twitter_user.data.screen_name,
						twitter_user: this_twitter_user._id,
						state: 0,
					});
				}
				// if the user was ignored previously, reset it to not approved
				else if ( user.state === 3 ) {
					user.state = 0;
					return user.save();
				}
				else {
					return user;
				}
			})
			.then( ( user ) => {
				this_user = user;
				return storeController.parseTweetForStore( tweet );
			})
			.then( ( store ) => {
				this_store = store;
				if ( isRetweet( tweet ) || hasIgnoreFlag( tweet ) || isIgnoredUser( tweet ) ) {
					throw new PromiseEndError();
				}
				else {
					let in_store_number = parseForInStoreReceipt( tweet.data.text );

					if ( in_store_number ) {
						receipt_data.type = 1;
						receipt_data.number = in_store_number;
					}
					else {
						let drive_thru_number = parseForDriveThruReceipt( tweet.data.text );
						if ( drive_thru_number ) {
							receipt_data.type = 2;
							receipt_data.number = drive_thru_number;
						}
						else {
							throw new PromiseBreakError( "invalid number" );
						}
					}

					let search = {
						tweet: tweet._id
					};

					receipt_data.tweet = tweet._id;
					receipt_data.user = this_user._id;
					receipt_data.twitter_user = this_twitter_user._id;
					receipt_data.date = tweet.data.created_at;
					// user is regular approved, or admin
					receipt_data.approved = ( this_user.state === 1 || this_user.state === 4 ) ? 2 : 0;

					if ( store ) {
						receipt_data.store = this_store._id;
					}

					return Receipt.findOne( search ); 
				}
			})
			.then( ( receipt ) => {
				if ( receipt ) {
					if ( receipt_data.store && ! receipt.store ) {
						return new Promise( ( resolve, reject ) => {
							receipt.store = receipt_data.store;
							receipt.save()
								.then( () => {
									resolve( "break" );
								})
								.catch( ( error ) => {
									reject( error );
								});
						});
					}
					throw new PromiseBreakError( "receipt exists" );
				}
				else {
					return Receipt.create( receipt_data );
				}
			})
			.then( ( receipt ) => {
				if ( receipt === "break" ) {
					throw new PromiseBreakError( "receipt exists" );
				}
				this_receipt = receipt;
				let search = {
					number: this_receipt.number,
					user: this_user._id,
					date: this_receipt.date,
					_id: { $ne: this_receipt._id }
				};

				if ( this_receipt.tweet ) {
					search.tweet = this_receipt.tweet;
				}
				
				return Receipt.findOne( search );
			})
			.then( ( existing_number_receipt ) => {

				if ( ! existing_number_receipt ) {

					if ( this_receipt.type === 1 )  {
						is_new_in_store = true;
					}
					else if ( this_receipt.type === 2 )  {
						is_new_drive_thru = true;
					}
				}

				if ( this_receipt.store ) {
					
					let search = {
						store: this_receipt.store,
						user: this_user._id,
						_id: { $ne: this_receipt._id.toString() }
					};

					if ( this_receipt.tweet ) {
						search.tweet = this_receipt.tweet;
					}

					return Receipt.findOne( search );
				}

				return false;
			})
			.then( ( existing_store_receipt ) => {

				if ( ! existing_store_receipt && this_receipt.store )
					is_new_store = true;

				return this_receipt.save();
			})
			.then( () => {
				return userController.updateUserTotals( this_user );
			})
			.then( ( totals ) => {
				this_totals = totals;
				return tweetQueueController.findQueue( { user: this_user._id, type: { $in: [ 1, 2 ] } } );
			})
			.then( ( tweet_queue ) => {

				if ( ! tweet_queue && do_new_receipt_tweet && this_receipt.approved === 2 ) {

					let store_number = ( this_store ) ? this_store.number : null;

					let data = {
						is_new_in_store: is_new_in_store,
						in_store_receipt_number: this_receipt.number,
						in_store_receipts_remaining: this_totals.receipts.remaining,
						is_new_drive_thru: is_new_drive_thru,
						drive_thru_receipt_number: this_receipt.number,
						drive_thru_receipts_remaining: this_totals.drivethru.remaining,
						is_new_store: is_new_store,
						store_number: store_number,
						stores_remaining: this_totals.stores.remaining,
					};
/*
	// we don't want to auto-tweet new users, because people use the hashtag without truly understanding the consequences
	
					if ( is_new_user ) {
						if ( this_twitter_user.data.protected ) {
							message_type = 2;
							return createNewUserDMParams( this_twitter_user.data.screen_name );
						}
						else {
							message_type = 1;
							return createNewUserTweetParams( this_twitter_user.data.screen_name, tweet );
						}
					}
*/
					if ( is_new_in_store ) {
						if ( this_user.settings.tweet.unique_numbers ) {
							message_type = 1;
							return createNewReceiptTweetParams( this_twitter_user.data.screen_name, tweet, data );
						}
						else if ( this_user.settings.dm.unique_numbers ) {
							message_type = 2;
							return createNewReceiptDMParams( this_twitter_user.data.screen_name, data );
						}
					}
					else if ( is_new_drive_thru ) {
						if ( this_user.settings.dm.drive_thrus ) {
							message_type = 2;
							return createNewReceiptDMParams( this_twitter_user.data.screen_name, data );
						}
						else {
							return;
						}
					}
					else if ( is_new_store ) {
						if ( this_user.settings.dm.stores ) {
							message_type = 2;
							return createNewReceiptDMParams( this_twitter_user.data.screen_name, data );
						}
						else {
							return;
						}
					}
					else {
						return;
					}
				}
				else {
					return;
				}
			})
			.then( ( params ) => {
				if ( params ) {
					return tweetQueueController.addTweetToQueue( params, this_user._id, 2, null, message_type );
				}
			})
			.then( () => {

				tweet.save()
					.then(() => {
						resolve();
					})
					.catch( ( error ) => {
						throw error;
					});
			})
			.catch( ( error ) => {
				if ( error instanceof PromiseBreakError || error instanceof PromiseEndError ) {
					tweet.save()
						.then(() => {
							resolve();
						})
						.catch(( error ) => {
							if ( error instanceof PromiseEndError ) {
								resolve();
							}
							else {
								reject( error );
							}
						});
				}
				else {
					reject( error );
				}
			});
	});
};

const sendTweet = function( twitter_user, tweet ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! twitter_user.oauth_token_admin || ! twitter_user.oauth_secret_admin )
			return reject( "Invalid credentials" );

		let client = new Twitter({
			consumer_key: process.env.TWITTER_CONSUMER_KEY_ADMIN,
			consumer_secret: process.env.TWITTER_CONSUMER_SECRET_ADMIN,
			access_token_key: twitter_user.oauth_token_admin,
			access_token_secret: twitter_user.oauth_secret_admin,
		});

		client.post( "statuses/update", tweet, ( error, response ) => {

			if ( error )
				return reject( error );

			return resolve( response );
		});
	});
};

const sendDM = function( twitter_user, dm ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! twitter_user.oauth_token_admin || ! twitter_user.oauth_secret_admin )
			return reject( "Invalid credentials" );

		let client = new Twitter({
			consumer_key: process.env.TWITTER_CONSUMER_KEY_ADMIN,
			consumer_secret: process.env.TWITTER_CONSUMER_SECRET_ADMIN,
			access_token_key: twitter_user.oauth_token_admin,
			access_token_secret: twitter_user.oauth_secret_admin,
		});

		client.post( "direct_messages/new", dm, ( error, response ) => {

			if ( error )
				return reject( error );

			return resolve( response );
		});
	});
};

/*
	(string) screen_name
	(object) {

		(int) store_number

		(bool) is_new_in_store
		(bool) is_new_drive_thru
		(bool) is_new_store

		(int) in_store_receipt_number
		(int) drive_thru_receipt_number

		(int) stores_remaining
		(int) in_store_receipts_remaining
	}

	returns (string)
			or (bool) false
*/
const createNewReceiptTweetText = function( screen_name, data ) {

	let in_store_phrases = [
		"Congrats",
		"Nice",
		"Sweet",
		"Cool",
		"Great Scott",
		"Perfect",
		"Good Going",
		"Awesome",
		"Stupendous",
		"Woot",
		"Yo",
		"Yeehaw",
		"Hey Hey Hey",
		"WutWut",
		"Yeehaw",
		"Awesome"
	];
	let drive_thru_phrases = in_store_phrases;
	let store_phrases = in_store_phrases;

	let key;
	let intro;
	if ( data.is_new_in_store ) {
		key = utils.rand( 0, ( in_store_phrases.length - 1 ) );
		intro = in_store_phrases[ key ];
	}
	else if ( data.is_new_drive_thru ) {
		key = utils.rand( 0, ( drive_thru_phrases.length - 1 ) );
		intro = drive_thru_phrases[ key ];
	}
	else if ( data.is_new_store ) {
		key = utils.rand( 0, ( store_phrases.length - 1 ) );
		intro = store_phrases[ key ];
	}

	if ( data.is_new_drive_thru && data.is_new_store )
		return "@"+ screen_name +" "+ intro +"! You just got "+ data.drive_thru_receipt_number +" and store "+ data.store_number +". Now you only have "+ data.stores_remaining +" stores to go!";
	else if ( data.is_new_in_store && data.is_new_store )
		return "@"+ screen_name +" "+ intro +"! You just got "+ data.in_store_receipt_number +" and store "+ data.store_number +". Now you only have "+ data.in_store_receipts_remaining +" receipts and "+ data.stores_remaining +" stores to go!";
	// no drive thru tweets
	//else if ( data.is_new_drive_thru )
	//	return "@"+ screen_name +" "+ intro +"! You just got "+ data.drive_thru_receipt_number +".";
	else if ( data.is_new_in_store )
		return "@"+ screen_name +" "+ intro +"! You just got "+ data.in_store_receipt_number +". Now you only have "+ data.in_store_receipts_remaining +" to go!";
	else if ( data.is_new_store )
		return "@"+ screen_name +" "+ intro +"! You just got store "+ data.store_number +". Now you only have "+ data.stores_remaining +" to go!";

	return false;
};

const createNewReceiptDMText = function( screen_name, data ) {

	let in_store_phrases = [
		"Congrats",
		"Nice",
		"Sweet",
		"Cool",
		"Great Scott",
		"Perfect",
		"Good Going",
		"Awesome",
		"Stupendous",
		"Woot",
		"Yo",
		"Yeehaw",
		"Hey Hey Hey",
		"WutWut",
		"Yeehaw",
		"Awesome"
	];
	let drive_thru_phrases = in_store_phrases;
	let store_phrases = in_store_phrases;

	let key;
	let intro;
	if ( data.is_new_in_store ) {
		key = utils.rand( 0, ( in_store_phrases.length - 1 ) );
		intro = in_store_phrases[ key ];
	}
	else if ( data.is_new_drive_thru ) {
		key = utils.rand( 0, ( drive_thru_phrases.length - 1 ) );
		intro = drive_thru_phrases[ key ];
	}
	else if ( data.is_new_store ) {
		key = utils.rand( 0, ( store_phrases.length - 1 ) );
		intro = store_phrases[ key ];
	}

	if ( data.is_new_drive_thru && data.is_new_store )
		return intro +"! You just got "+ data.drive_thru_receipt_number +" and store "+ data.store_number +". Now you only have "+ data.stores_remaining +" stores to go!";
	else if ( data.is_new_in_store && data.is_new_store )
		return intro +"! You just got "+ data.in_store_receipt_number +" and store "+ data.store_number +". Now you only have "+ data.in_store_receipts_remaining +" receipts and "+ data.stores_remaining +" stores to go!";
	else if ( data.is_new_drive_thru )
		return intro +"! You just got "+ data.drive_thru_receipt_number +".";
	else if ( data.is_new_in_store )
		return intro +"! You just got "+ data.in_store_receipt_number +". Now you only have "+ data.in_store_receipts_remaining +" to go!";
	else if ( data.is_new_store )
		return intro +"! You just got store "+ data.store_number +". Now you only have "+ data.stores_remaining +" to go!";

	return;
};

/*
	 data = {
		is_new_in_store: (Boolean),
		in_store_receipt_number: (Number),
		in_store_receipts_remaining: (Number),
		is_new_drive_thru: (Boolean),
		drive_thru_receipt_number: (Number),
		drive_thru_receipts_remaining: (Number),
		is_new_store: (Boolean),
		store_number: (Number),
		stores_remaining: (Number),
	}
*/
const createNewReceiptTweetParams = function( screen_name, originating_tweet, data ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! screen_name )
			return reject( "invalid screen_name ["+ screen_name +"]" );

		let params = {
			status: createNewReceiptTweetText( screen_name, data ),
		};

		if ( originating_tweet )
			params.in_reply_to_status_id = originating_tweet.data.id_str;

		if ( data.store_number ) {

			Store.findOne( { number: data.store_number } )
				.then( ( store ) => {

					if ( ! store )
						return resolve( params );

					params.lat = store.location.latitude;
					params.long = store.location.longitude;

					if ( store.location.twitter_place ) {

						TwitterPlace.findOne( { _id: store.location.twitter_place }, ( error, twitter_place ) => {

							if ( error )
								return;

							if ( ! twitter_place )
								return resolve( params );

							params.place = twitter_place.data.id;

							resolve( params );

						});
					}
					else {
						resolve( params );
					}
				})
				.catch( ( error ) => {
					reject( error );
				});
		}
		else {
			resolve( params );
		} 
	});
};

/*
	 data = {
		is_new_in_store: (Boolean),
		in_store_receipt_number: (Number),
		in_store_receipts_remaining: (Number),
		is_new_drive_thru: (Boolean),
		drive_thru_receipt_number: (Number),
		drive_thru_receipts_remaining: (Number),
		is_new_store: (Boolean),
		store_number: (Number),
		stores_remaining: (Number),
	}
*/
const createNewReceiptDMParams = function( screen_name, data ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! screen_name )
			return reject( "invalid screen_name ["+ screen_name +"]" );

		let params = {
			screen_name: screen_name,
			text: createNewReceiptDMText( screen_name, data ),
		};

		resolve( params );
	});
};

const createNewUserTweetText = function( screen_name ) {

	const phrases = [
		"Sweet Whole Grilled Onions",
		"Chopped Chili Chili Bang Bang",
		"Neopolitan Nebulas",
		"Three By Meat Madness",
		"Fantastic Root Beer Floatations",
		"Fabulous Animal Fries",
	];

	const key = utils.rand( 0, ( phrases.length - 1 ) );
	const intro = phrases[ key ];

	const user_url = utils.createUserUrl( screen_name );

	return intro +"! @"+ screen_name +" has joined the #innoutChallenge! "+ user_url;
};

const createNewUserDMText = function( screen_name ) {

	const phrases = [
		"Sweet Whole Grilled Onions",
		"Chopped Chili Chili Bang Bang",
		"Neopolitan Nebulas",
		"Three By Meat Madness",
		"Fantastic Root Beer Floatations",
		"Fabulous Animal Fries",
	];

	const key = utils.rand( 0, ( phrases.length - 1 ) );
	const intro = phrases[ key ];

	const user_url = utils.createUserUrl( screen_name );

	return intro +"! @"+ screen_name +" you've joined the #innoutChallenge! "+ user_url;
};

const createNewUserTweetParams = function( screen_name, originating_tweet ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! screen_name )
			return reject( "invalid screen_name ["+ screen_name +"]" );

		let params = {
			status: createNewUserTweetText( screen_name ),
		};

		if ( originating_tweet )
			params.in_reply_to_status_id = originating_tweet.data.id_str;

		if ( originating_tweet.store ) {
			Store.findOne( { _id: originating_tweet.store }, ( error, store ) => {

				if ( error )
					return;

				if ( ! store )
					return;

				params.lat = store.location.latitude;
				params.long = store.location.longitude;

				if ( store.location.twitter_place ) {

					TwitterPlace.findOne( { _id: store.location.twitter_place }, ( error, twitter_place ) => {

						if ( error )
							return; // logerror

						if ( ! twitter_place )
							return;

						params.place = twitter_place.data.id;

						resolve( params );

					});
				}
				else {
					resolve( params );
				}
			});
		}
		else {
			resolve( params );
		} 
	});
};

const createNewUserDMParams = function( screen_name ) {

	return new Promise( ( resolve, reject ) => {

		if ( ! screen_name )
			return reject( "invalid screen_name ["+ screen_name +"]" );

		let params = {
			screen_name: screen_name,
			text: createNewUserDMText( screen_name ),
		};

		resolve( params );
	});
};

const sendNewUserTweet = function( params ) {

	return new Promise( ( resolve, reject ) => {

		TwitterUser.findOne({ "data.id_str": process.env.NEW_USER_TWEET_USER_ID }, ( error, twitter_user ) => {

			if ( error )
				return reject( error );

			if ( ! twitter_user )
				return reject( "Unable to find twitter_user" );

			sendTweet( twitter_user, params )
				.then( ( tweet ) => {
					resolve( tweet );
				})
				.catch( ( error ) => {
					reject( error );
				});

		});
	});
};

const getUnfetchedTweets = function() {

	return new Promise( ( resolve, reject ) => {

		Tweet.find({ fetched: { $eq: false } }, ( error, tweets ) => {

			if ( error )
				return reject( error );

			if ( ! tweets )
				return reject( "Unable to find any tweets" );

			resolve( tweets );
		});
	});
};

const findTweet = function( query, fields ) {

	return new Promise( ( resolve, reject ) => {

		Tweet.findOne( query, fields, ( error, tweet ) => {

			if ( error )
				return reject( error );

			resolve( tweet );

		});
	});
};

const findTweets = function( query, fields, options ) {

	return new Promise( ( resolve, reject ) => {

		Tweet.find( query, fields, options, ( error, tweets ) => {

			if ( error )
				return reject( error );

			resolve( tweets );

		});
	});
};

const createTweet = function( data ) {

	return new Promise( ( resolve, reject ) => {

		data.data = formatTweetData( data.data );

		Tweet.create( data, ( error, tweet ) => {

			if ( error )
				return reject( error );

			resolve( tweet );

		});
	});
};

const formatTweetData = function( data ) {

	if ( data.created_at )
		data.created_at = new Date( data.created_at );

	return data;
};

module.exports.getTweetsFromSearchApp = getTweetsFromSearchApp;
module.exports.getLatestSearchTweetFromDb = getLatestSearchTweetFromDb;
module.exports.getTweetsFromSearchUser = getTweetsFromSearchUser;
module.exports.getTweetsFromLookupApp = getTweetsFromLookupApp;
module.exports.parseTweets = parseTweets;
module.exports.sendTweet = sendTweet;
module.exports.sendDM = sendDM;
module.exports.createNewReceiptTweetText = createNewReceiptTweetText;
module.exports.createNewReceiptTweetParams = createNewReceiptTweetParams;
module.exports.createNewUserTweetText = createNewUserTweetText;
module.exports.createNewUserTweetParams = createNewUserTweetParams;
module.exports.sendNewUserTweet = sendNewUserTweet;
module.exports.getUnfetchedTweets = getUnfetchedTweets;
module.exports.findTweet = findTweet;
module.exports.findTweets = findTweets;
module.exports.createTweet = createTweet;
module.exports.formatTweetData = formatTweetData;
module.exports.parseForInStoreReceipt = parseForInStoreReceipt;
module.exports.parseForDriveThruReceipt = parseForDriveThruReceipt;
module.exports.isRetweet = isRetweet;
module.exports.hasIgnoreFlag = hasIgnoreFlag;
module.exports.isIgnoredUser = isIgnoredUser;
module.exports.parseForInStoreDigits = parseForInStoreDigits;
module.exports.parseForDriveThruDigits = parseForDriveThruDigits;
module.exports.twitterSearchRequest = twitterSearchRequest;
