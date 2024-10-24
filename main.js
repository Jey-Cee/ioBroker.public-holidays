'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const deHolidays = require('./lib/holidays/de.json');
const atHolidays = require('./lib/holidays/at.json');

class PublicHolidays extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'public-holidays',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		updateSettings: if (this.config.country !== '') {
			try {
				const lastSettingsState = await this.getStateAsync(`info.lastSettings`);
				let lastSettings;
				if (lastSettingsState && lastSettingsState.val) {
					lastSettings = lastSettingsState.val;
				}
				if (JSON.stringify(lastSettings) === JSON.stringify(this.config)) {
					break updateSettings;
				}
				const adapterObject = await this.getForeignObjectAsync(
					'system.adapter.public-holidays.' + this.instance
				);

				if (adapterObject === null || adapterObject === undefined) {
					break updateSettings;
				}
				// Load original Settings after changing country
				if (lastSettings === '' || adapterObject.native.country !== lastSettings?.country) {

					delete adapterObject.native['holidays'];
					switch (this.config.country) {
						case 'de':
							adapterObject.native['holidays'] = deHolidays;
							await this.setState(`info.lastSettings`, { val: adapterObject.native, ack: true });
							await this.setForeignObjectAsync(
								'system.adapter.public-holidays.' + this.instance,
								adapterObject,
							);
							break;
						case 'at':
							adapterObject.native['holidays'] = atHolidays;
							await this.setState(`info.lastSettings`, { val: adapterObject.native, ack: true });
							await this.setForeignObjectAsync(
								'system.adapter.public-holidays.' + this.instance,
								adapterObject,
							);
							break;
					}
				} else {
					await this.setState(`info.lastSettings`, { val: adapterObject.native, ack: true });
				}
			} catch (error) {
				console.error(error);
			}
		}

		// Check if one or more enabled holidays are today

		const today = new Date();
		// const today = new Date('2024-05-12T10:16:30.577Z');
		const tomorrow = new Date(today);
		tomorrow.setDate(today.getDate() + 1);
		const afterTomorrow = new Date(today);
		afterTomorrow.setDate(today.getDate() + 2);

		const holidays = this.config.holidays;

		let todayBoolean = false;
		let todayName = '';
		let tomorrowBoolean = false;
		let tomorrowName = '';
		let afterTomorrowBoolean = false;
		let afterTomorrowName = '';

		// Loop through each holiday and check if it matches today
		for (const holiday of holidays) {
			if (holiday.enabled) {
				const holidayTodayDate = calculateHoliday(holiday, today.getFullYear());
				// Check if today is holiday
				if (holidayTodayDate instanceof Date && holidayTodayDate.toDateString() === today.toDateString()) {
					todayBoolean = true;
					if (todayName.length === 0) {
						todayName = holiday.name;
					} else {
						todayName += `, ${holiday.name}`;
					}
				}
				// Check if tomorrow is holiday
				const holidayTomorrowDate = calculateHoliday(holiday, tomorrow.getFullYear());
				if (
					holidayTomorrowDate instanceof Date &&
					holidayTomorrowDate.toDateString() === tomorrow.toDateString()
				) {
					tomorrowBoolean = true;
					if (tomorrowName.length === 0) {
						tomorrowName = holiday.name;
					} else {
						tomorrowName += `, ${tomorrowName}`;
					}
				}
				// Check if after tomorrow is holiday
				const holidayAfterTomorrowDate = calculateHoliday(holiday, afterTomorrow.getFullYear());
				if (
					holidayAfterTomorrowDate instanceof Date &&
					holidayAfterTomorrowDate.toDateString() === afterTomorrow.toDateString()
				) {
					afterTomorrowBoolean = true;
					if (afterTomorrowName.length === 0) {
						afterTomorrowName = holiday.name;
					} else {
						afterTomorrowName += `, ${afterTomorrowName}`;
					}
				}
			}
		}

		// Find the next holiday
		const findNextHoliday = (year) => {
			return holidays
				.filter((holiday) => holiday.enabled)
				.map((holiday) => calculateHoliday(holiday, year))
				.filter((date) => date instanceof Date && date >= today) // Future dates
				.sort((a, b) => a - b)[0];
		};

		let year  = today.getFullYear();

		let nextHoliday = findNextHoliday(year);

		if (!nextHoliday) {
			year = today.getFullYear() + 1;
			// No holiday found in the current year, try the next year
			nextHoliday = findNextHoliday(year);
		}

		if (nextHoliday) {
			const daysUntilNextHoliday = Math.ceil((nextHoliday - today) / (1000 * 60 * 60 * 24));
			const nextHolidayName = holidays.find(
				(holiday) =>
					calculateHoliday(holiday, year)?.toDateString() ===
					nextHoliday.toDateString(),
			).name;

			this.setStateChanged(`next.name`, { val: nextHolidayName, ack: true });
			this.setStateChanged(`next.date`, { val: nextHoliday.toLocaleDateString(), ack: true });
			this.setStateChanged(`next.duration`, { val: daysUntilNextHoliday, ack: true });
		}

		this.setStateChanged(`today.name`, { val: todayName, ack: true });
		this.setStateChanged(`today.boolean`, {val: todayBoolean, ack: true});
		this.setStateChanged(`tomorrow.name`, { val: tomorrowName, ack: true });
		this.setStateChanged(`tomorrow.boolean`, {val: tomorrowBoolean, ack: true});
		this.setStateChanged(`aftertomorrow.name`, { val: afterTomorrowName, ack: true });
		this.setStateChanged(`aftertomorrow.boolean`, {val: afterTomorrowBoolean, ack: true});

		this.stop({ exitCode: 0 });
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }
}

/**
 * Calculates the date of a holiday based on its rule type and the specified year.
 * @param {Object} holiday - The holiday object containing the rule type and other specific details required for calculation.
 * @param {string} holiday.ruleType - The type of rule used to calculate the holiday (e.g., 'fixed', 'easter', 'weekdayInMonth').
 * @param {string} [holiday.date] - The specific date for fixed holidays in YYYY-MM-DD format.
 * @param {number} [holiday.offsetDays] - The number of days offset from Easter Sunday for 'easter' type holidays.
 * @param {Object} [holiday.weekdayInMonth] - The information for calculating 'weekdayInMonth' type holidays.
 * @param {number} year - The year for which the holiday is to be calculated.
 * @return {Date|null} The calculated date of the holiday, or null if the rule type is not recognized.
 */
function calculateHoliday(holiday, year) {
	switch (holiday.ruleType) {
		case 'fixed':
			return new Date(`${year}-${holiday.date}`);
		case 'easter':
			return calculateEasterSunday(year, holiday.offsetDays);
		case 'weekdayInMonth':
			return calculateWeekdayInMonth(year, holiday.weekdayInMonth);
		default:
			console.error ('Can not calculate holiday');
	}
}


/**
 * Calculates the date of Easter Sunday and allows an offset in days.
 *
 * @param {number} year - The year for which to calculate Easter Sunday.
 * @param {number} offsetDays - The number of days to offset from Easter Sunday.
 *
 * @return {Date} The date of Easter Sunday with the specified offset.
 */
function calculateEasterSunday(year, offsetDays) {

	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);  // 3 = März, 4 = April
	const day = ((h + l - 7 * m + 114) % 31) + 1;

	const easterSunday = new Date(year, month - 1, day);
	return new Date(easterSunday.setDate(easterSunday.getDate() + offsetDays));
}

/**
 * Calculates the date of the nth occurrence of a specific weekday in a given month and year.
 *
 * @param {number} year - The year for which to calculate the date.
 * @param {Object} options - Object containing the details for the calculation.
 * @param {number} options.weekday - The weekday to find (0 for Sunday, 1 for Monday, ..., 6 for Saturday).
 * @param {number} options.week - The occurrence of the weekday in the month (1 for first occurrence, 2 for second, etc.).
 * @param {number} options.month - The month in which to find the weekday (1 for January, 2 for February, ..., 12 for December).
 * @return {Date|null} The date of the nth occurrence of the specified weekday, or null if it doesn't exist.
 */
function calculateWeekdayInMonth(year, { weekday, week, month }) {
	const date = new Date(year, month - 1, 1);
	let count = 0;

	while (date.getMonth() === month - 1) {
		if (date.getDay() === weekday) {
			count++;
			if (count === week) {
				return date;
			}
		}
		date.setDate(date.getDate() + 1);
	}

	return null;
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new PublicHolidays(options);
} else {
	// otherwise start the instance directly
	new PublicHolidays();
}
