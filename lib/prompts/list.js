/**
 * `list` type prompt
 */

var _ = require('lodash');
var util = require('util');
var chalk = require('chalk');
var figures = require('figures');
var cliCursor = require('cli-cursor');
var runAsync = require('run-async');
var Base = require('./base');
var observe = require('../utils/events');
var Paginator = require('../utils/paginator');

/**
 * Module exports
 */

module.exports = Prompt;

/**
 * Constructor
 */

function Prompt() {
  Base.apply(this, arguments);

  if (!this.opt.choices) {
    this.throwParamError('choices');
  }

  this.firstRender = true;
  this.selected = 0;

  var def = this.opt.default;

  // Default being a Number
  if (_.isNumber(def) && def >= 0 && def < this.opt.choices.realLength) {
    this.selected = def;
  }

  // Default being a String
  if (_.isString(def)) {
    this.selected = this.opt.choices.pluck('value').indexOf(def);
  }

  // Make sure no default is set (so it won't be printed)
  this.opt.default = null;

  this.paginator = new Paginator();
}
util.inherits(Prompt, Base);

/**
 * Start the Inquiry session
 * @param  {Function} cb      Callback when prompt is done
 * @return {this}
 */

Prompt.prototype._run = function (cb) {
  this.done = cb;

  var self = this;

  var events = observe(this.rl);
  events.normalizedUpKey.takeUntil(events.line).forEach(this.onUpKey.bind(this));
  events.normalizedDownKey.takeUntil(events.line).forEach(this.onDownKey.bind(this));
  events.numberKey.takeUntil(events.line).forEach(this.onNumberKey.bind(this));
  events.keypress.takeUntil(events.line).forEach(this.onAnyKey.bind(this));
  events.line
    .take(1)
    .map(this.getCurrentValue.bind(this))
    .flatMap(function (value) {
      return runAsync(self.opt.filter)(value).catch(function (err) {
        return err;
      });
    })
    .forEach(this.onSubmit.bind(this));

  // Init the prompt
  cliCursor.hide();
  this.render();

  return this;
};

/**
 * Render the prompt to screen
 * @return {Prompt} self
 */

Prompt.prototype.render = function () {
  // Render question
  var message = this.getQuestion();

  if (this.firstRender) {
    message += chalk.dim('(Use arrow keys)');
  }

  // if (this.lastKeyPress) {
  //   message += chalk.yellow(this.lastKeyPress);
  // }

  // Render choices or answer depending on the state
  if (this.status === 'answered') {
    message += chalk.cyan(this.opt.choices.getChoice(this.selected).short);
  } else {
    var choicesStr = listRender(this.opt.choices, this.selected);
    var indexPosition = this.opt.choices.indexOf(this.opt.choices.getChoice(this.selected));
    message += '\n' + this.paginator.paginate(choicesStr, indexPosition, this.opt.pageSize);
  }

  this.firstRender = false;

  this.screen.render(message);
};

/**
 * When user press `enter` key
 */

Prompt.prototype.onSubmit = function (value) {
  this.status = 'answered';

  // Rerender prompt
  this.render();

  this.screen.done();
  cliCursor.show();
  this.done(value);
};

Prompt.prototype.getCurrentValue = function () {
  return this.opt.choices.getChoice(this.selected).value;
};

/**
 * When user press a key
 */
Prompt.prototype.onUpKey = function () {
  var len = this.opt.choices.realLength;
  this.selected = (this.selected > 0) ? this.selected - 1 : len - 1;
  this.render();
};

Prompt.prototype.onDownKey = function () {
  var len = this.opt.choices.realLength;
  this.selected = (this.selected < len - 1) ? this.selected + 1 : 0;
  this.render();
};

Prompt.prototype.onNumberKey = function (input) {
  if (input <= this.opt.choices.realLength) {
    this.selected = input - 1;
  }
  this.render();
};

Prompt.prototype.onAnyKey = function (ev) {
  var name = ev.key.name;
  if (!name) {
    return;
  }
  var choice;
  for (var i = 0; i < this.opt.choices.realLength; i++) {
    choice = this.opt.choices.getChoice(i);
    if (choice.shortcuts && choice.shortcuts.indexOf(name) >= 0) {
      this.selected = i;
      this.status = 'answered';
      this.render();
      this.screen.done();
      cliCursor.show();
      this.done(choice.value);
      break;
    }
  }
};

/**
 * Function for rendering list choices
 * @param  {Number} pointer Position of the pointer
 * @return {String}         Rendered content
 */
function listRender(choices, pointer) {
  var output = '';
  var separatorOffset = 0;

  choices.forEach(function (choice, i) {
    if (choice.type === 'separator') {
      separatorOffset++;
      output += '  ' + choice + '\n';
      return;
    }

    if (choice.disabled) {
      separatorOffset++;
      output += '  - ' + choice.name;
      output += ' (' + (_.isString(choice.disabled) ? choice.disabled : 'Disabled') + ')';
      output += '\n';
      return;
    }

    var isSelected = (i - separatorOffset === pointer);
    var line = (isSelected ? figures.pointer + ' ' : '  ') + choice.name;
    if (choice.shortcuts != null && choice.shortcuts.length) {
      line += chalk.cyan(' [' + choice.shortcuts.map(String).join(', ') + ']');
    }
    if (isSelected) {
      line = chalk.cyan(line);
    }
    output += line + ' \n';
  });

  return output.replace(/\n$/, '');
}
