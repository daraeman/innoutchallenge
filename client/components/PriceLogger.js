import React from "react";
import { connect } from "react-redux";
import Select from "react-select";

import { fetchStoresList, saveStorePrice, getStorePrice, getClosestStore } from "../actions/storeActions";

import Error from "./Error";
import Success from "./Success";
import TopNav from "./TopNav";
import SubNav from "./SubNav";
import PageNotAuthorized from "./PageNotAuthorized";
import Geolocation from "./Geolocation";

require( "../less/PriceLogger.less" )
require( "../../node_modules/react-select/less/select.less" );
@connect( ( store ) => {
	return {
		prices: store.storePrice.price,
		stores: store.storesList.stores,
		error: store.storesList.error,
		closest: store.storeClosest.store,
		saveError: store.saveStorePrice.error.error,
		saveSuccess: store.saveStorePrice.success,
		saveInProgress: store.saveStorePrice.saving,
	}
})

class PriceLogger extends React.Component {

	componentWillMount() {

		this.props.dispatch( fetchStoresList( this.props.dispatch ) );
		//this.props.dispatch( getStorePrice( this.props.dispatch, null ) );
		this.setState({
			store: "",
			prices: this.props.prices,
			did_request_coords: 0,
			menu_image: "",
			menu_image_url: "",
			geolocation: {},
			loading_position: false,
		});

		this.savePrice = this.savePrice.bind( this );
		this.savePriceWithImage = this.savePriceWithImage.bind( this );
		this.setStore = this.setStore.bind( this );
		this.takeImage = this.takeImage.bind( this );
		this.createImage = this.createImage.bind( this );
		this.triggerImage = this.triggerImage.bind( this );
		this.triggerImageUpload = this.triggerImageUpload.bind( this );
		this.enableGeoLocation = this.enableGeoLocation.bind( this );

		this.getGeolocationInnerRef = this.getGeolocationInnerRef.bind( this );
		this.getLocation = this.getLocation.bind( this );

		this.geolocationHandler = this.geolocationHandler.bind( this );
	}

	geolocationHandler() {
		this.setState({
			geolocation: this.geolocationInnerRef.state,
			loading_position: false,
		});
	}

	geolocationInnerRef;
	imageInputRef;
	imageInputUploadRef;

	getGeolocationInnerRef( ref ) {
		this.geolocationInnerRef = ref;
	}

	getLocation() {
		this.setState({
			loading_position: true,
		}, () => {
			this.geolocationInnerRef && this.geolocationInnerRef.getLocation();
		});
	}

	priceInputHtml( value = "", tabindex = 0, changeHandler ) {
		console.log( "priceInputHtml", value )

		if ( value !== null ) {
			//value = value.toString();
			//value = value.replace( /[^\d?\.?(?:\d+)?]/, "" );
			//if ( value.toString().length === 2 &&  )
			//	value += 0.00;
			//else
			//	value += new Array( 4 - value.length ).fill( 0 ).join( "" );
		}
		else {
			value = "";
		}
		

		return (
			<div class="price">
				<div class="input">
					<input type="number" placeholder="0.00" step="0.01" value={ value } tabIndex={ tabindex } onChange={ changeHandler } />
				</div>
			</div>
		)
	}

	savePrice() {
		this.props.dispatch( saveStorePrice( this.props.dispatch, this.state.store, this.state.prices ) );
	}

	createImage( callback ) {

		let reader = new FileReader();

		console.log( "reader", reader )

		reader.addEventListener( "load", function () {
			callback( reader.result );
		}, false );
		
		reader.readAsDataURL( this.state.menu_image );
	}

	savePriceWithImage() {
		this.createImage( ( data_url ) => {
			this.props.dispatch( saveStorePrice( this.props.dispatch, this.state.store, this.state.prices, data_url ) );
		});
	}

	setStore( select_value ) {
		let store_id = select_value.value;
		this.setState({
			store: store_id,
		})
		this.props.dispatch( getStorePrice( this.props.dispatch, store_id ) );
	}

	enableGeoLocation() {
		this.getLocation();
	}

	componentDidUpdate( old_props ) {

		if ( this.props.saveSuccess !== old_props.saveSuccess || this.props.saveError !== old_props.saveError )
			window.scrollTo( 0, 0 );

		// show error
		if ( this.props.error && this.props.error !== old_props.error ) {
			console.error( this.props.error );
		}

		// user did allow geolocation
		if ( this.state.geolocation.isGeolocationAvailable && this.state.geolocation.isGeolocationEnabled && this.state.did_request_coords === 0 ) {
			
			this.setState({
				did_request_coords: 1,
			});

			// send geolocation request once the coordinates have been retrieved
			let interval = setInterval( () => {

				if ( ! this.state.geolocation.coords )
					return;

				this.props.dispatch( getClosestStore( this.props.dispatch, this.state.geolocation.coords.latitude, this.state.geolocation.coords.longitude ) );
				clearInterval( interval );

			}, 300 );
		}

		// geolocation request returned, set store dynamically
		if ( ! old_props.closest._id && this.props.closest._id ) {
			this.setState({
				store: this.props.closest._id,
			});
		}

		console.log( "old_props.prices", old_props.prices )
		console.log( "this.props.prices", this.props.prices )
		console.log( "this.props", this.props )

		// set store prices
		if ( JSON.stringify( old_props.prices ) !== JSON.stringify( this.props.prices ) ) {
			this.setState({
				prices: this.props.prices,
			});
		}
	}

	takeImage( event ) {
		
		let file = event.target.files[0];
		let url = URL.createObjectURL( file );
		
		this.setState({
			menu_image: file,
			menu_image_url: url,
		});

	}

	triggerImage() {
		this.imageInputRef.click();
	}
	triggerImageUpload( event ) {
		event.stopPropagation();
		this.imageInputUploadRef.click();
	}

	getStoresOptions() {

		return this.props.stores.map( ( store ) => {

			return {
				value: store._id,
				label: store.number + " - " + store.location.address + " (" + store.location.city + ", " + store.location.state + ")"
			};
		});
	}

	render() {

		let tabindex = 3;
		let errors = [];
		let successes = [];

		const { stores, error, coords, saveError, saveSuccess, saveInProgress } = this.props;
		const { prices } = this.state;

		console.log( "this.state.prices", this.state.prices )

		if ( saveError )
			errors.push( "Failed to save Store Price ["+ saveError.error +"]" );

		if ( saveSuccess )
			successes.push( "Price Saved" );

		if ( error && error.status === 401 ) {
			return (
				<PageNotAuthorized returnUrl={ this.props.location.pathname } />
			);
		}

		let date = new Date();

		let burgers = [
			{ name: "Double-Double", key: "double_double" },
			{ name: "Cheeseburger", key: "cheeseburger" },
			{ name: "Hamburger", key: "hamburger" },
			{ name: "French Fries", key: "fries" },
		];
		let burgers_html = burgers.map( ( burger, index ) => {
			return (
				<div class="item" key={ index }>
					<div class="title">{ burger.name.toUpperCase() }</div>
					{ this.priceInputHtml( prices.burgers[ burger.key ], tabindex++, ( event ) => {
						console.log( "event.target.value", event.target.value )
						console.log( "parseFloat( event.target.value )", parseFloat( event.target.value ) )
						let new_state = { ...this.state };
							new_state.prices.burgers[ burger.key ] = parseFloat( event.target.value );
						this.setState( new_state );
					} ) }
				</div>
			)
		});

		let sodas = [
			{ name: "Coke" },
			{ name: "Root Beer" },
			{ name: "Lemonade" },
			{ name: "Iced Tea" },
			{ name: "Seven-Up" },
			{ name: "Dr Pepper" },
		];
		let soda_row_length = 4;
		let sodas_row_1 = sodas.slice( 0, soda_row_length ).map( ( soda, index ) => {
			return (
				<div class="soda" key={ index }>{ soda.name.toUpperCase() }</div>
			);
		});
		let sodas_row_2 = sodas.slice( soda_row_length ).map( ( soda, index ) => {
			return (
				<div class="soda" key={ index + soda_row_length }>{ soda.name.toUpperCase() }</div>
			);
		});

		let soda_prices = [
			{ name: "SM", key: "small" },
			{ name: "MED", key: "medium" },
			{ name: "LG", key: "large" },
			{ name: "X-LG", key: "xlarge" },
		];
		let soda_prices_html = soda_prices.map( ( soda_price, index ) => {
			return (
				<div class="item" key={ index }>
					<div class="title">{ soda_price.name }</div>
					{ this.priceInputHtml( prices.sodas[ soda_price.key ], tabindex++, ( event ) => {
						let new_state = { ...this.state };
							new_state.prices.sodas[ soda_price.key ] = parseFloat( event.target.value );
						this.setState( new_state );
					} ) }
				</div>
			);
		});

		let other_drinks = [
			{ name: "Shakes", key: "shake" },
			{ name: "Milk", key: "milk" },
			{ name: "Hot Cocoa", key: "cocoa" },
			{ name: "Coffee", key: "coffee" },
		];
		let other_drinks_html = other_drinks.map( ( other_drink, index ) => {
			return (
				<div class="item" key={ index }>
					<div class="title">{ other_drink.name.toUpperCase() }</div>
					{ this.priceInputHtml( prices.other_drinks[ other_drink.key ], tabindex++, ( event ) => {
						let new_state = { ...this.state };
							new_state.prices.other_drinks[ other_drink.key ] = parseFloat( event.target.value );
						this.setState( new_state );
					} ) }
				</div>
			);
		});

		let camera_html;
		if ( this.state.menu_image_url.length ) {
			camera_html = (
				<div class="item">
					<img src={ this.state.menu_image_url } class="image" />
				</div>
			)
		}

		let locationSpinnerClass = "spinner_wrap";
		if ( this.state.loading_position )
			locationSpinnerClass += " show";
		let locationButtonClass = "button";
		if ( this.state.geolocation.hasOwnProperty( "isGeolocationEnabled" ) && ! this.state.geolocation.isGeolocationEnabled )
			locationButtonClass += " disabled";
		
		let saveSpinnerClass = "spinner_wrap";
		if ( saveInProgress )
			saveSpinnerClass += " show";
		let saveButtonClass = "button";
		if ( saveInProgress )
			saveButtonClass += " disabled";

		return (
			<div>
				<input class="hide" type="file" accept="image/*" capture="environment" onChange={ this.takeImage } ref={ ( imageInputRef ) => { this.imageInputRef = imageInputRef } } />
				<input class="hide" type="file" accept="image/*" onChange={ this.takeImage } ref={ ( imageInputUploadRef ) => { this.imageInputUploadRef = imageInputUploadRef } } />
				<Geolocation ref={ this.getGeolocationInnerRef } handler={ this.geolocationHandler } />
				<TopNav title="Price Logger (beta)" showBackButton={ false } />
				<Error messages={ errors } />
				<Success messages={ successes } />
				<div class="container" id="price_logger">
					<div class="section camera">
						{ camera_html }
						<div class="item">
							<div class="button" onClick={ this.triggerImage }>
								<div class="text">Menu Photo</div>
								<div class="icon" onClick={ this.triggerImage }>
									<img src="/img/camera_icon.svg" />
								</div>
								<div class="icon" onClick={ this.triggerImageUpload }>
									<img src="/img/upload_icon.svg" />
								</div>
							</div>
						</div>
					</div>
					<div class="section options">
						<div class="item">
							<div class="title inline_block">
								Date: 
							</div>
							<div class="input">
								<input type="date" defaultValue={ date.toISOString().substr( 0, 10 ) } tabIndex="1" />
							</div>
						</div>
						<div class="item select">
							<div class="title inline_block">Store: </div>
							<Select
								tabIndex="2"
								value={ this.state.store }
								onChange={ this.setStore }
								options={ this.getStoresOptions() }
								placeholder="select your store"
								autosize={ false }
							/>
							<div class={ locationButtonClass } onClick={ () => { this.enableGeoLocation() } }>
								<div class="text">Find Closest Store</div>
								<div class="icon"><img src="/img/location_icon.svg" /></div>
								<div class={ locationSpinnerClass }>
									<div class="spinner spinner_a"></div>
								</div>
							</div>
						</div>
					</div>
					<div class="section">
						<div class="ino_menu">
							<div class="burgers">
								{ burgers_html }
							</div>
							<div class="drinks">
								<div class="sodas">
									<div class="names_wrap">
										<div class="names">
											<div class="column">{ sodas_row_1 }</div>
											<div class="column">{ sodas_row_2 }</div>
										</div>
										<div class="prices">
											{ soda_prices_html }
										</div>
									</div>
								</div>
								<div class="other_drinks">
									{ other_drinks_html }
								</div>
							</div>
						</div>
					</div>
					<div class="section options">
						<div class="item">
							<div class={ saveButtonClass } tabIndex={ ++tabindex } onClick={ this.savePrice }>
								<div class="text">Save</div>
								<div class={ saveSpinnerClass }>
									<div class="spinner spinner_a"></div>
								</div>
							</div>
						</div>
						<div class="item">
							<div class={ saveButtonClass } tabIndex={ ++tabindex } onClick={ this.savePriceWithImage }>
								<div class="text">Save w/Image</div>
								<div class={ saveSpinnerClass }>
									<div class="spinner spinner_a"></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		)
	}
}

export default PriceLogger;