var child_process = require('child_process');
var byline = require('byline');

function Searcher() {
  var self = this;

  this.state = {};
  this.state.readLine = this._wait_ready;
  this.state.queue = [];
  this.state.current = undefined;
  this.state.ready = false;

  this.child = child_process.spawn("./search_server", [], { });

  this.child.stdout.setEncoding('utf8');
  byline(this.child.stdout).on('data', function(line) {
    console.log(line);
    self.state.readLine.call(self, line);
  });

  this.child.stderr.setEncoding('utf8');
  this.child.stderr.on('data', function(data) {
    console.error(data);
  });

  this.child.stdin.setEncoding('utf8');

  this.child.unref();
}

Searcher.prototype._wait_ready = function(line) {
  if(line === "--- INPUT ---") {
    //this.state.readLine = this._input_error;
    this.state.ready = true;
    this._consume_next();
  }
};

Searcher.prototype._input_error = function(line) {
  console.error("UNEXPECTED OUTPUT FROM CHILD: " + line);
};

Searcher.prototype._wait_process = function(line) {
  var data = /.*?>>\s*(.*)/.exec(line); // Match >> to check only those lines.
  console.log(data);
  if (!data) return;
  var result = data[1];

  console.log(result);

  var match = /File.\s.*?([0-9]+).*?.\s*?LCR.\s([-+]?[0-9]*\.?[0-9]+).\s(\[.*?\]).\s([-+]?[0-9]*\.?[0-9]+)/.exec(result);

  console.log(match);

  //var match = /.*?>>.*?File.\s.*?([0-9]+).*?.\s*?XY.\s([-+]?[0-9]*\.?[0-9]+).\s([-+]?[0-9]*\.?[0-9]+)/.exec(line); // Match stuff like: ">> File: test120.jpg XY: 123.00, 123.00"
  if ( !match ) {
    this.state.current.cb(null, null, null, null);
    this.state.current = undefined;
    this._consume_next();
    return;
  }

  var page = match[1];
  var left = match[2];
  var center = match[3];
  var right = match[4];
  
  this.state.current.cb(page, left, center, right);
  this.state.current = undefined;
  //this.state.readLine = this._input_error;
  this._consume_next();
};

Searcher.prototype._consume_next = function(match) {
  if(!this.state.ready || this.state.current !== undefined) {
    return;
  }
  this.state.current = this.state.queue.shift();
  if(!this.state.current) {
    return;
  }
  this.state.readLine = this._wait_process;
  this.child.stdin.write(this.state.current.filename + "\n");
};

Searcher.prototype.match_file = function(filename, cb) {
  this.state.queue.push({filename: filename, cb: cb});
  this._consume_next();
};

module.exports = Searcher;