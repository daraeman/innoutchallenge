import axios from "axios"


/*
{
	type: "FETCH_USERS_FULFILLED",
	payload: [{
		name: String,
		totals: {
			receipts: {
				unique: Number,
			}
		}
	}]
}
*/
export function fetchUsers( dispatch, search, amount, page ) {

	dispatch({ type: "FETCH_USERS_PENDING" })
	return function ( dispatch ) {

		axios( process.env.REACT_APP_BACKEND_URL + "/api/users/list", { method: "post", data: { search: search, amount: amount, page: page }, withCredentials: true } )
			.then( ( response ) => {
				dispatch({ type: "FETCH_USERS_FULFILLED", payload: response.data })
			})
			.catch( ( error ) => {
				console.log( "error", error )

				let message;
				let status;
				if ( error.response ) {
					message = "["+ error.response.status +"] "+ error.response.data;
					status = error.response.status;
				}
				else {
					message = error.message;
					status: -1;
				}

				dispatch({ type: "FETCH_USERS_REJECTED", payload: { message: message, status: status } })
			});
	}
}

export function clearUsers( dispatch ) {
	return function ( dispatch ) {
		dispatch({ type: "CLEAR_USERS_FULFILLED", payload: true })
	}
}