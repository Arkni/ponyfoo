'use strict';

var _ = require('lodash');
var queso = require('queso');
var assign = require('assignment');
var moment = require('moment');
var colorService = require('../../services/color');
var datetimeService = require('../../services/datetime');
var browserEnv = require('../../client/js/lib/env');
var mapsKey = browserEnv('GOOGLE_MAPS_API_KEY');
var Engagement = require('../../models/Engagement');
var pastTagMap = {
  speaking: 'spoke',
  organizing: 'organized',
  attending: 'attended'
};

module.exports = function (req, res, next) {
  Engagement.find({}).lean().exec(function (err, engagements) {
    if (err) {
      next(err); return;
    }
    var upcoming = _.sortBy(engagements.filter(hasNotEnded), 'end');
    var diff = _.difference(engagements, upcoming);
    var past = _.sortBy(diff, 'end').reverse();
    res.viewModel = {
      model: {
        title: 'Conference Talks presented by Nicolás Bevacqua',
        talks: {
          upcoming: upcoming.map(toTalk),
          past: past.map(toTalk),
          fullMap: getFullMap(engagements)
        }
      }
    };
    next();
  });
};

function getFullMap (engagements) {
  return getMapImageUrl(engagements.map(toPlace), {
    size: '1200x300',
    style: 'all|saturation:-100'
  });
  function toPlace (engagement) {
    return {
      location: engagement.location,
      color: getMarkerColor(engagement),
      size: getMarkerSize(engagement)
    };
  }
}

function getMarkerColor (engagement) {
  var upcoming = hasNotEnded(engagement);
  var color = colorService[upcoming ? 'pink' : 'black'];
  var hex = '0x' + color;
  return hex;
}

function getMarkerSize (engagement) {
  return hasNotEnded(engagement) ? 'small' : 'tiny';
}

function toTalk (engagement, i) {
  var upcoming = hasNotEnded(engagement);
  var talk = {
    range: datetimeService.range(engagement.start, engagement.end),
    conference: engagement.conference,
    website: engagement.website,
    venue: engagement.venue,
    map: {
      link: 'https://maps.google.com?q=' + encodeURIComponent(engagement.location).replace(/%20/g, '+'),
      image: getMapImageUrl([{
        location: engagement.location,
        color: getMarkerColor(engagement),
        size: getMarkerSize(engagement)
      }], { scale: 17 })
    },
    tags: engagement.tags.map(toTagText)
  };
  return talk;
  function toTagText (tag) {
    return upcoming ? tag : pastTagMap[tag] || tag;
  }
}

function hasStarted (engagement) {
  return moment(engagement.start).startOf('day').isBefore(moment());
}

function hasNotEnded (engagement) {
  return moment(engagement.end).endOf('day').isAfter(moment());
}

function getMapImageUrl (places, options) {
  var base = 'https://maps.googleapis.com/maps/api/staticmap';
  var defaults = {
    scale: 2,
    size: '600x300',
    maptype: 'roadmap',
    key: mapsKey
  };
  var qs = queso.stringify(assign({}, defaults, options));
  var markers = places.reduce(getMarker, '');
  return base + qs + markers;
}

function getMarker (all, place) {
  var marker = Object.keys(place).reduce(getProps, '');
  return all + '&markers=' + encodeURIComponent(marker) + place.location;
  function getProps (props, key) {
    if (key === 'location') {
      return props;
    }
    return props + key + ':' + place[key] + '|';
  }
}
