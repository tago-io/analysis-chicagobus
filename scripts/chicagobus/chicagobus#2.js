/**
 * That analysis can run on your machine,
 * or on Tago servers,
 * if will run in Tago server,
 * we will ignore analysis token.
 */
'use strict';
const Analysis  = require('tago/analysis');
const Device    = require('tago/device');
const _         = require('lodash');
const moment_tz = require('moment-timezone');
const async     = require('async');

const TASK_INTERVAL   = 2; // minute
const ALL_ROUTE_MILES = 3.2; // miles
const LOCATIONS = [
    {
        "id": 1,
        "location": { "lat": 41.876919, "lng": Number(`-87.6${_.random(27660, 34800)}`) },
        "max_speed": 45
    }, {
        "id": 2,
        "location": { "lat": 41.876851, "lng": -87.635176 },
        "max_speed": 5
    }, {
        "id": 3,
        "location": { "lat": Number(`41.87${_.random(6955, 8955)}`), "lng": -87.635176 },
        "max_speed": 20
    }, {
        "id": 4,
        "location": { "lat": Number(`41.87${_.random(8955, 9999)}`), "lng": -87.635176 },
        "max_speed": 20
    }, {
        "id": 5,
        "location": { "lat": Number(`41.88${_.random(0, 5500)}`), "lng": -87.635376 },
        "max_speed": 20
    }, {
        "id": 6,
        "location": { "lat": 41.885714, "lng": -87.635363 },
        "max_speed": 30
    }, {
        "id": 7,
        "location": { "lat": 41.885714, "lng": Number(`-87.63${_.random(1999, 5363)}`) },
        "max_speed": 15
    }, {
        "id": 8,
        "location": { "lat": 41.885714, "lng": Number(`-87.62${_.random(7999, 9999)}`) },
        "max_speed": 20
    }, {
        "id": 9,
        "location": { "lat": 41.885610, "lng": -87.627956 },
        "max_speed": 5
    }, {
        "id": 10,
        "location": { "lat": Number(`41.88${_.random(0, 5610)}`), "lng": -87.627956 },
        "max_speed": 20
    }, {
        "id": 11,
        "location": { "lat": Number(`41.87${_.random(6999, 9999)}`), "lng": -87.627720 },
        "max_speed": 20
    }
];

function env_to_obj(environment) {
    return environment.reduce((pv,cv) => { 
        pv[cv.key] = cv.value;
        return pv; 
    }, {});
}

function myanalysis(context) {
    let environment  = env_to_obj(context.environment);
    const bus_device = new Device(environment.bus_token);

    function get_serie(cb) {
        bus_device.find({"variable":"serie", "query":"last_value"}).then((result) => {
            result = result[0] || {};
            let serie = 0;

            if (result) {
                serie = Number(result.value) || 0;
            }

            serie += 1;

            cb(null, serie);
        }).catch(console.log);
    }

    function get_inc_id(cb) {
        bus_device.find({"variable":"id", "query": "last_value"}).then((result) => {
            result = result[0] || {};
            let id = 0;

            if (result.value >= LOCATIONS.length) {
                result.value = 0;
            } else if (result) {
                id = Number(result.value) || 0;
            }

            id += 1;

            cb(null, id);
        }).catch(console.log);
    }
    
    function get_fuel(cb) {
        bus_device.find({"variable":"fuel_level", "query": "last_value"}).then((result) => {
            result = result[0] || {};
            let fuel = 100;

            if (result.value >= 5) {
                let how_much_spend = ((TASK_INTERVAL * LOCATIONS.length) / 45);
                fuel = Number(result.value) - (_.random(0, how_much_spend));
            }

            cb(null, fuel);
        }).catch(console.log);
    }

    function stops_fuel_station(cb) {
        let start_date = new moment_tz().tz("America/Chicago").startOf('day')._d;
        let end_date   = new moment_tz().tz("America/Chicago").endOf('day')._d;

        bus_device.find({"variable":"stops_fuel_station", "query": "last_value", "qty": 1, "start_date":start_date, "end_date": end_date}).then((result) => {
            result = result[0] || {};
            let stops = result.value || 0;

            cb(null, stops);
        }).catch(console.log);
    }

    function get_trip_odometer(cb) {
        bus_device.find({"variable":"trip_odometer", "query": "last_value"}).then((result) => {
            result = result[0] || {};
            let miles = 0;

            if (result) {
                let how_much = (ALL_ROUTE_MILES / LOCATIONS.length);
                miles = (Number(result.value) || 0) + how_much;
            }

            cb(null, miles);
        }).catch(console.log);
    }

    let functions = { "serie": get_serie, "id": get_inc_id, "fuel": get_fuel, "stops_fuel_station": stops_fuel_station, "trip_odometer": get_trip_odometer };
    async.parallel(functions, function (err, result) {
        if (err) {
            return console.log(err);
        }

        let insert = function (vari, object_vari) {
            bus_device.insert(Object.assign({}, {"variable":vari}, object_vari));
        };

        // Bus Prop
        let bus = _.find(LOCATIONS, { "id": result.id });
        let stop_fuel_value = (result.fuel === 100 ? (result.stops_fuel_station + 1) : result.stops_fuel_station);
        let trip_odometer_adjusted = result.trip_odometer.toFixed(1);

        insert("location", { "location": bus.location, "serie": result.serie });
        insert("break_pressed", { "value": random_true_false(), "serie": result.serie });
        insert("stops_fuel_station", { "value": stop_fuel_value, "serie": result.serie });
        insert("fuel_level", { "value": result.fuel, "unit": "%", "serie": result.serie });
        insert("speed", { "value": _.random(0, bus.max_speed), "unit": "mph", "serie": result.serie });
        insert("update_at", { "value": moment_tz().tz("America/Chicago").format("hh:mm A - z"), "serie": result.serie });
        insert("trip_odometer", { "value": trip_odometer_adjusted, "serie": result.serie });

        // Tago Analysis
        insert("id", { "value": result.id });
        insert("serie", { "value": result.serie });
    });

    // Helpers
    function random_true_false() {
        return (_.random(true, false) ? true : false);
    }
}

module.exports = new Analysis(myanalysis, '14f3a540-3e4b-11e6-a9e9-c38b3d7df0db');



