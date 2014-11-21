'use strict';

var $ = require('dominus');
var taunus = require('taunus/global');
var input = $('.sr-input');
var button = $('.sr-button');
var searchUrlService = require('../../services/searchUrl');

button.on('click', search);

function search (e) {
  e.preventDefault();
  var terms = input.value();
  var route = searchUrlService.compile(terms);
  if (route) {
    taunus.navigate(route);
  }
}
