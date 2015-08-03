'use strict';

require('../preconfigure');
require('../chdir');

var fs = require('fs');
var contra = require('contra');
var winston = require('winston');
var moment = require('moment');
var models = require('../models');
var pkg = require('../package.json');
var logging = require('../lib/logging');
var db = require('../lib/db');
var articleService = require('../services/article');
var articlePublishService = require('../services/articlePublish');
var t = 0;
var p = 0;
var m;
var defaultFormat = 'HH:mm:ss -- DD MMMM, YYYY';

fs.writeFile('.job.scheduler', moment().format(defaultFormat) + '\n');
logging.configure();
db(operational);

function operational () {
  winston.info('[job] Worker %s executing job@%s', process.pid, pkg.version);
  m = models();
  m.Article.find({ status: 'publish' }, found);
}

function found (err, articles) {
  if (err || !articles || articles.length === 0) {
    done(err); return;
  }
  t = articles.length;
  winston.info('[job] Found %s articles slated for publication', t);
  contra.each(articles, 2, single, done);
}

function single (article, next) {
  contra.waterfall([
    function attemptPublication (next) {
      articlePublishService.publish(article, next);
    },
    function notifySubscribers (published, next) {
      var when;
      if (published) {
        article.save(saved); // save the status change first!
      } else {
        if (article.publication) {
          when = moment(article.publication);
          winston.info('[job] Article "%s" will be published %s (%s).', article.title, when.fromNow(), when.format(defaultFormat));
        }
        next();
      }

      function saved (err) {
        if (!err) {
          p++;
          articleService.campaign(article, promoted);
          winston.info('[job] Published "%s".', article.title);
        } else {
          next(err);
        }
      }

      function promoted (err) {
        if (err) {
          winston.error('[job] Article campaign failed for "%s".\n%s', article.title, err.stack || err);
        }
        next(err);
      }
    }
  ], next);
}

function done (err) {
  if (err) {
    winston.error('[job] Cron job failed!', err.stack || err);
  }
  winston.info('[job] Published %s/%s articles.', p, t);
  setTimeout(exit, 3000);
  function exit () {
    process.exit(err ? 1 : 0);
  }
}
