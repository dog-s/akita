/**
 * This file contains functions used to populate the UI with data.
 */

/***********************************************************
 * Get Top Origins
 ***********************************************************/

/**
 * Get the top N monetized origins based on time spent at the origin.
 *
 * @param {Number} nTopOrigins The number of top monetized origins to retrieve.
 * @return {Promise<[AkitaOriginData]>} Resolves to a list of nTopOrigins AkitaOriginData objects.
 */
async function getTopOriginsByTimeSpent(nTopOrigins) {
	let originDataList = await getOriginDataList();
	let topOriginsList = null;
	let listSize = nTopOrigins;

	if (originDataList) {
		if (originDataList.length > 1) {
			// Sort the list of origin data by monetizedTimeSpent,
			// i.e. sort by descending time starting from index 0
			originDataList.sort((a, b) =>
				b.originVisitData.monetizedTimeSpent - a.originVisitData.monetizedTimeSpent
			);

			listSize = Math.min(listSize, originDataList.length);
			topOriginsList = originDataList.slice(0, listSize);
		} else {
			topOriginsList = originDataList;
		}
	}

	return topOriginsList;
}

/**
 * Constants used to calculate how much love an origin needs relative to
 * another origin.
 */
const NEEDS_LOVE_MAGIC_NUMBER_MARGIN = 0.25;
const NEEDS_LOVE_MAGIC_NUMBER = 1;

/**
 * Get the top N monetized origins based on how much the origin
 * "needs some love" compared to other monetized origins.
 *
 * To calculate how much an origin "needs love", get the ratio of monetized time
 * to visits. i.e. "needs love ratio" = monetizedTimeSpent / numberOfVisits.
 * A small ratio indicates that, relative to how many times the user visits
 * the monetized site, they don't seem to spend much time there. We'd like to
 * inform the user if this is the case, so that the user can consider spending
 * more time on that site to support the creator (more time on the site = more
 * payment streamed if they are using a payment provider). A bit more complexity
 * is added to determining relative "love needed" by using the NEEDS_LOVE_MAGIC_NUMBER
 * and NEEDS_LOVE_MAGIC_NUMBER_MARGIN constants.
 *
 * @param {Number} nTopOrigins The number of "top monetized origins that need some love" to retrieve.
 * @return {Promise<[AkitaOriginData]>} Resolves to a list of nTopOrigins AkitaOriginData objects.
 */
async function getTopOriginsThatNeedSomeLove(nTopOrigins) {
	let originDataList = await getOriginDataList();
	let topOriginsList = null;
	let listSize = nTopOrigins;

	if (originDataList) {
		if (originDataList.length > 1) {
			// Sort the list of origin data by the "needs love ratio",
			// i.e. sort by ascending "needs love ratio" starting from index 0
			// The smallest ratios indicate the most "love needed"
			originDataList.sort((a, b) => {
				const needsLoveRatioA = a.originVisitData.monetizedTimeSpent / a.originVisitData.numberOfVisits;
				const needsLoveRatioB = b.originVisitData.monetizedTimeSpent / b.originVisitData.numberOfVisits;
				const ratioComparison = needsLoveRatioA / needsLoveRatioB;

				// If Array.prototype.sort() returns 0, 'b' and 'a' will be unchanged with respect to one another
				let sortResult = 0;

				if ((ratioComparison >= (NEEDS_LOVE_MAGIC_NUMBER - NEEDS_LOVE_MAGIC_NUMBER_MARGIN))
					&& (ratioComparison <= NEEDS_LOVE_MAGIC_NUMBER)
				) {
					if (a.originVisitData.numberOfVisits > b.originVisitData.numberOfVisits) {
						// If origin 'a' has a slightly smaller needsLoveRatio but has more visits,
						// origin 'b' actually needs more love since the person has spent only a marginally
						// larger amount of time on the site, but with fewer visits. We should encourage
						// them to visit 'b' more!

						// If Array.prototype.sort() returns > 0, 'b' will be placed before 'a' in the array
						return 1;
					} else {
						// Otherwise, if origin 'a' has a smaller needsLoveRatio AND less visits, then
						// it definitely needs more love than 'b'.

						// If Array.prototype.sort() returns < 0, 'a' will be placed before 'b' in the array
						return -1;
					}
				} else {
					// Sort as usual, place the origin with the smaller ratio before the other one
					sortResult = needsLoveRatioA - needsLoveRatioB;
				}
				return sortResult;
			});

			listSize = Math.min(listSize, originDataList.length);
			topOriginsList = originDataList.slice(0, listSize);
		} else {
			topOriginsList = originDataList;
		}
	}

	return topOriginsList;
}

/**
 * Check if the user has used a Web Monetization Provider to stream payment to WM
 * content since installing Akita.
 *
 * @param {AkitaOriginStats} originStats The origin stats data.
 * @returns true if the user has used a Web Monetization Provider, false otherwise.
 */
function hasUsedWebMonetizationProvider(originStats) {
	// If the totalSentAssetsMap exists and has at least one entry, then the
	// user has streamed payment to WM content through a WM Provider
	return ((originStats)
		&& (originStats.totalSentAssetsMap)
		&& (Object.keys(originStats.totalSentAssetsMap).length !== 0));
}

/***********************************************************
 * Payment Prediction
 ***********************************************************/

/**
 * This stream rate is based on Coil's $0.36 USD/hour rate, as
 * described in https://help.coil.com/accounts/membership-accounts#how-much-do-you-pay-out-to-creators
 *
 * 0.36/hour = 0.0000001/millisecond
 */
const STREAM_RATE_PER_MILLISECOND = 0.0000001;

/**
 * Calculate the estimated payment to the site in USD.
 *
 * @param {String} origin The origin of the site to estimate payment for.
 * @return {Promise<Number>} The estimated payment to the site in USD.
 */
async function getEstimatedPaymentForOriginUSD(origin) {
	const originData = await loadOriginData(origin);
	let estimatedPayment = 0;

	if (originData) {
		const monetizedTimeSpent = originData.originVisitData.monetizedTimeSpent;
		estimatedPayment = unNaN(Number.parseFloat(monetizedTimeSpent * STREAM_RATE_PER_MILLISECOND)).toFixed(2);
	}

	return estimatedPayment;
}

/**
 * Calculate the total estimated payment in USD based on the timeSpent.
 *
 * @param {Number} timeSpent The amount of time spent in milliseconds.
 * @return {Number} The estimated payment in USD.
 */
function getEstimatedPaymentForTimeInUSD(timeSpent) {
	return Number.parseFloat(timeSpent * STREAM_RATE_PER_MILLISECOND).toFixed(2);
}

/***********************************************************
 * Various data retrieval functions
 ***********************************************************/

/**
 * Get the percentage of time spent at the origin out of
 * total time spent across all origins.
 *
 * @param {AkitaOriginData} originData The origin data object.
 * @param {AkitaOriginStats} originStats The origin stats object.
 * @return {Number} The percent of time spent at the origin out of total time spent.
 */
function getPercentTimeSpentAtOriginOutOfTotal(originData, originStats) {
	if (!originData || !originStats) return 0;

	const monetizedTimeSpent = originData.originVisitData.monetizedTimeSpent;
	const totalTimeSpent = originStats.totalTimeSpent;

	return toPercent(monetizedTimeSpent / totalTimeSpent);
}

/**
 * Get the percentage of visits to the origin out of total
 * origin visits.
 *
 * @param {AkitaOriginData} originData The origin data object.
 * @param {AkitaOriginStats} originStats The origin stats object.
 * @return {Number} The percent of visits to the origin out of total visits.
 */
function getPercentVisitsToOriginOutOfTotal(originData, originStats) {
	if (!originData || !originStats || originStats.totalVisits === 0) return 0;

	return toPercent(originData.originVisitData.numberOfVisits / originStats.totalVisits);
}

/**
 * Get the percentage of monetized origin time spent out of
 * total origin time spent.
 *
 * @param {AkitaOriginStats} originStats The origin stats object.
 * @return {Number} The percent of monetized origin time spent.
 */
function getMonetizedTimeSpentPercent(originStats) {
	if (!originStats || originStats.totalTimeSpent === 0) return 0;

	return toPercent(originStats.totalMonetizedTimeSpent / originStats.totalTimeSpent);
}

/**
 * Convert a number to a percent with 2 decimal places.
 *
 * @param {Number} number The number to convert into a percent.
 * @return {Number} The number as a percent.
 */
function toPercent(number) {
	return unNaN((100 * number)).toFixed(2);
}

/**
 * If the number is NaN, return 0 so that the value is not NaN.
 *
 * @param {Number} number Number to unNaN
 * @return {Number} The non-NaN number, or 0 to unNaN the number.
 */
function unNaN(number) {
	return isNaN(number) ? 0 : number;
}
