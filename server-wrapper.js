var express = require("express"),
	app = express(),
	fs = require("fs"),
	http = require("http"),
	port = process.env.PORT || 2800,
	Searcher = require('./searcher.js'),
	OCRExtractor = require('./ocr-extractor.js');

app.use(express.json());
app.use(express.urlencoded());

var s = new Searcher();
var ocr = new OCRExtractor();

app.all("/", function(req, res)
{
	console.log("Some one hit us in server-wrapper.js");

	var cb = function(page, x, y) {
		console.log("We ran cb.");
		
		ocr.extract(page, x, y, function(json) {
			res.contentType('application/json');
			res.send(JSON.stringify(json));
		});
	};

	s.match_file(req.body.filename, cb);
});

app.listen(port);
console.log("Listening on port " + port);