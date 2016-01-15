'use strict';

var _ = require('lodash');
var contra = require('contra');
var queso = require('queso');
var assign = require('assignment');
var moment = require('moment');
var env = require('../../lib/env');
var browserEnv = require('../../client/js/lib/env');
var colorService = require('../../services/color');
var datetimeService = require('../../services/datetime');
var presentationService = require('../../services/presentation');
var Engagement = require('../../models/Engagement');
var Presentation = require('../../models/Presentation');
var mapsKey = browserEnv('GOOGLE_MAPS_API_KEY');
var pastTagMap = {
  speaking: 'spoke',
  organizing: 'organized',
  attending: 'attended'
};

function home (req, res, next) {
  getModelData(function got (err, data) {
    if (err) {
      next(err); return;
    }
    var upcoming = _.sortBy(data.engagements.filter(hasNotEnded), 'end');
    var diff = _.difference(data.engagements, upcoming);
    var past = _.sortBy(diff, 'end').reverse();
    var fullMap = getFullMap(data.engagements);
    var upcomingModels = upcoming.map(toEngagementModel);
    res.viewModel = {
      model: {
        title: 'Conference Talks presented by Nicolás Bevacqua',
        meta: {
          canonical: '/speaking',
          images: [fullMap]
            .concat(upcomingModels.map(toEngagementMapImage))
            .concat('/img/speaking.b83cbc22.jpg')
        },
        engagements: {
          upcoming: upcomingModels,
          past: past.map(toEngagementModel),
          fullMap: fullMap
        },
        presentations: data.presentations.map(presentationService.toModel)
      }
    };
    next();
  });
}

function toEngagementMapImage (engagement) {
  return engagement.map.image;
}

function getModelData (done) {
  contra.concurrent({
    engagements: function (next) {
      Engagement.find({}).lean().exec(next);
    },
    presentations: function (next) {
      Presentation.find({}).sort('-presented').lean().exec(next);
    }
  }, done);
}

function getFullMap (engagements) {
  return getMapImageUrl(engagements.map(toPlace), {
    size: '1200x300',
    style: 'all|saturation:-100'
  });
  function toPlace (engagement) {
    return {
      location: engagement.location,
      color: getMarkerColor(engagement),
      size: 'tiny'
    };
  }
}

function getMarkerColor (engagement) {
  var upcoming = hasNotEnded(engagement);
  var color = colorService[upcoming ? 'pink' : 'black'];
  var hex = '0x' + color;
  return hex;
}

function toEngagementModel (engagement) {
  var upcoming = hasNotEnded(engagement);
  var model = {
    range: datetimeService.range(engagement.start, engagement.end),
    conference: engagement.conference,
    website: engagement.website,
    venue: engagement.venue,
    location: engagement.location,
    map: {
      link: 'https://maps.google.com?q=' + encodeURIComponent(engagement.location).replace(/%20/g, '+'),
      image: getMapImageUrl([{
        location: engagement.location,
        color: getMarkerColor(engagement),
        size: 'med'
      }], { scale: 17 })
    },
    tags: engagement.tags.map(toTagText)
  };
  return model;
  function toTagText (tag) {
    return upcoming ? tag : pastTagMap[tag] || tag;
  }
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

module.exports = home;
