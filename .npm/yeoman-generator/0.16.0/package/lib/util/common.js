'use strict';
var chalk = require('chalk');

/**
 * Common/General utilities
 *
 * @mixin util/common
 */
var common = module.exports;

/**
 * 'Welcome to Yeoman' prompt intro
 * @type {String}
 * @memberof util/common
 */
common.yeoman =
'\n     _-----_' +
'\n    |       |' +
'\n    |' + chalk.red('--(o)--') + '|   .--------------------------.' +
'\n   `---------´  |    ' + chalk.yellow.bold('Welcome to Yeoman') + ',    |' +
'\n    ' + chalk.yellow('(') + ' _' + chalk.yellow('´U`') + '_ ' + chalk.yellow(')') + '   |   ' + chalk.yellow.bold('ladies and gentlemen!') + '  |' +
'\n    /___A___\\   \'__________________________\'' +
'\n     ' + chalk.yellow('|  ~  |') +
'\n   __' + chalk.yellow('\'.___.\'') + '__' +
'\n ´   ' + chalk.red('`  |') + '° ' + chalk.red('´ Y') + ' `\n';
