'use strict';

var _ = require('lodash');
var fs = require('fs');
var but = require('but');
var util = require('util');
var contra = require('contra');
var env = require('../lib/env');
var subscriberService = require('./subscriber');
var textService = require('./text');
var cryptoService = require('./crypto');
var facebookService = require('./facebook');
var twitterService = require('./twitter');
var twitterEmojiService = require('./twitterEmoji');
var echojsService = require('./echojs');
var hackernewsService = require('./hackernews');
var lobstersService = require('./lobsters');
var markupService = require('./markup');
var weeklyService = require('./weekly');
var User = require('../models/User');
var authority = env('AUTHORITY');
var card = env('TWITTER_CAMPAIGN_CARD_NEWSLETTER');
var css = fs.readFileSync('.bin/emails/newsletter.css', 'utf8');

function noop () {}

function share (issue, done) {
  if (done === void 0) {
    done = noop;
  }
  contra.concurrent([
    curried('email', email),
    curried('tweet', tweet),
    curried('fb', facebook),
    curried('echojs', echojs),
    curried('hn', hackernews),
    curried('lobsters', lobsters)
  ], done);

  function curried (key, fn) {
    return function shareVia (next) {
      if (issue[key] === false) {
        next(); return;
      }
      fn(issue, {}, next);
    };
  }
}

function emailSelf (issue, options, done) {
  if (!options.userId) {
    done(new Error('User not provided.')); return;
  }
  User.findOne({ _id: options.userId }).select('email').exec(found);
  function found (err, user) {
    if (err) {
      done(err); return;
    }
    if (!user) {
      done(new Error('User not found.')); return;
    }
    options.reshare = false; // sending to self is perfectly fine.
    options.recipients = [user.email];
    email(issue, options, done);
  }
}

function email (issue, options, done) {
  if (options.reshare) {
    done(new Error('The weekly newsletter cannot be reshared.')); return;
  }
  var thanks = options.thanks ? ('?thanks=' + cryptoService.md5(issue._id + options.thanks)) : '';
  var relativePermalink = '/weekly/' + issue.slug + thanks;
  var permalink = authority + relativePermalink;
  var issueModel = weeklyService.toView(issue, false);
  var model = {
    subject: issue.name + ' \u2014 Pony Foo Weekly',
    teaser: 'This week’s Web Platform news & inspiration',
    teaserHtml: util.format('<a href="%s">Read this issue on ponyfoo.com</a>', permalink),
    css: css,
    permalink: permalink,
    thanks: !!thanks,
    issue: issueModel,
    emailFormat: true,
    linkedData: {
      '@context': 'http://schema.org',
      '@type': 'EmailMessage',
      potentialAction: {
        '@type': 'ViewAction',
        name: 'See web version',
        target:  permalink
      },
      description: 'See weekly newsletter issue #' + issue.slug + ' on the web'
    }
  };
  subscriberService.send({
    topic: 'newsletter',
    template: 'newsletter-issue',
    patrons: options.patrons,
    recipients: options.recipients,
    model: model
  }, done);
}

function statusLink (issue) {
  return util.format('%s/weekly/%s', authority, issue.slug);
}

function randomHeadline (options) {
  return _.sample(options.reshare ? [
    'In case you missed it!',
    'Read this!',
    'Check this out!'
  ] : [
    'Just published!',
    'Fresh content!',
    'Crisp new words!',
    'Hot off the press!',
    'Extra! Extra!',
    'This just out!'
  ]);
}

function randomMailEmoji () {
  return _.sample(['✉️️', '💌', '📥', '📤', '📬', '📩', '📮', '📪', '📫', '📬', '📭']);
}

function getTitle (issue) {
  return 'Pony Foo Weekly \u2014 ' + issue.name;
}

function tweet (issue, options, done) {
  var tagPair = '#' + issue.tags.slice(0, 2).join(' #');
  var tagText = textService.hyphenToCamel(tagPair);
  var headline = randomHeadline(options);
  var tweetLength = 0;
  var tweetLines = [];
  var title = getTitle(issue);

  // sorted by importance: link, title, cta, headline, hashtag.
  add(3, randomMailEmoji() + ' ' + statusLink(issue), 2 + 24);
  add(1, randomMailEmoji() + ' ' + title, 2 + title.length);
  add(4, card, 25);
  add(0, randomMailEmoji() + ' ' + headline, 2 + headline.length);
  add(2, randomMailEmoji() + ' ' + '#ponyfooweekly', 2 + 14); // no extra new line here

  var status = tweetLines.filter(notEmpty).join('\n');

  twitterService.tweet(status, done);

  function add (i, contents, length) {
    if (tweetLength + length + 1 > 140) {
      return; // avoid going overboard
    }
    tweetLength += length + 1; // one for the next new line
    tweetLines[i] = contents;
  }
  function notEmpty (line) {
    return line;
  }
}

function facebook (issue, options, done) {
  facebookService.share(getTitle(issue), statusLink(issue), done);
}

function echojs (issue, options, done) {
  var data = {
    title: getTitle(issue),
    url: util.format('%s/weekly/%s', authority, issue.slug)
  };
  echojsService.submit(data, done);
}

function hackernews (issue, options, done) {
  var data = {
    title: getTitle(issue),
    url: util.format('%s/weekly/%s', authority, issue.slug)
  };
  hackernewsService.submit(data, submitted);
  function submitted (err, res, body, discuss) {
    issue.hnDiscuss = discuss;
    issue.save(but(done));
  }
}

function lobsters (issue, options, done) {
  var data = {
    title: getTitle(issue),
    url: util.format('%s/weekly/%s', authority, issue.slug)
  };
  lobstersService.submit(data, done);
}

module.exports = {
  share: share,
  'email-self': emailSelf,
  email: email,
  twitter: tweet,
  facebook: facebook,
  echojs: echojs,
  hackernews: hackernews,
  lobsters: lobsters
};
